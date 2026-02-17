import * as tf from '@tensorflow/tfjs';
import { computePeakRunoff } from '../utils/hydrology';
import { normalize, denormalizeOutput } from './pinnConstants';

let isTfInitialized = false;

/**
 * Initialize TensorFlow.js with appropriate backend settings
 */
export async function initializeTf(): Promise<void> {
    if (isTfInitialized) return;
    try {
        await tf.ready();
        isTfInitialized = true;
    } catch (e) {
        await initializeCpuFallback(e);
    }
}

async function initializeCpuFallback(error: any): Promise<void> {
    console.warn('TFJS ready failed, attempting CPU fallback', error);
    try {
        await tf.setBackend('cpu');
        await tf.ready();
        isTfInitialized = true;
    } catch (innerError) {
        console.error('TFJS initialization fatal failure', innerError);
    }
}

// initializeTf();

// ============ Types ============

export interface PINNInput {
    x: number;        // Spatial position along flow path (m)
    t: number;        // Time since start of rainfall (min)
    rainfall: number; // Rainfall intensity (mm/hr)
    slope: number;    // Surface slope (m/m)
    manningN: number; // Manning's roughness coefficient
}

export interface PINNOutput {
    discharge: number;    // Predicted discharge Q (L/s)
    depth: number;        // Predicted water depth h (mm)
    velocity: number;     // Flow velocity (m/s)
    confidence: number;   // Model confidence (0-1)
    isPINNPrediction: boolean;
}

export interface KinematicWaveParams {
    length: number;    // Catchment length (m)
    rainfall: number;  // Rainfall intensity (mm/hr)
    slope: number;     // Surface slope (m/m)
    manningN: number;  // Manning's n
    width: number;     // Catchment width (m)
}

export interface KinematicWaveResult {
    peakDischarge: number;  // Peak Q (L/s)
    timeToPeak: number;     // Time to peak (min)
    equilibriumDepth: number; // Equilibrium depth (mm)
}

// ============ Model Cache ============

let pinnModel: tf.Sequential | null = null;
let isModelLoading = false;

// ============ Model Architecture ============

/**
 * Create the PINN model architecture
 */
export async function createPINNModel(): Promise<tf.Sequential> {
    await initializeTf();

    const model = tf.sequential();

    model.add(tf.layers.dense({
        units: 32,
        activation: 'tanh',
        inputShape: [5],
        kernelInitializer: 'glorotNormal',
    }));

    model.add(tf.layers.dense({ units: 64, activation: 'tanh', kernelInitializer: 'glorotNormal' }));
    model.add(tf.layers.dense({ units: 64, activation: 'tanh', kernelInitializer: 'glorotNormal' }));
    model.add(tf.layers.dense({ units: 32, activation: 'tanh', kernelInitializer: 'glorotNormal' }));

    model.add(tf.layers.dense({
        units: 1,
        activation: 'softplus',
    }));

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
    });

    return model;
}

/**
 * Get or create the PINN model (singleton pattern)
 */
export async function getModel(): Promise<tf.Sequential> {
    if (pinnModel) return pinnModel;

    if (isModelLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return getModel();
    }

    isModelLoading = true;

    try {
        pinnModel = await createPINNModel();
        return pinnModel;
    } finally {
        isModelLoading = false;
    }
}

// ============ Normalization ============

function denormalizeDischarge(value: number): number {
    return denormalizeOutput(value);
}

function calculateDepthAndVelocity(discharge: number, input: PINNInput): { depth: number; velocity: number } {
    const alpha = Math.sqrt(input.slope) / input.manningN;
    const depth = discharge > 0 ? Math.pow(discharge / alpha, 0.6) * 1000 : 0;
    const velocity = depth > 0 ? discharge / (10 * depth / 1000) : 0;
    return { depth, velocity };
}

function getNormalizedInputArray(input: PINNInput): number[] {
    return [
        normalize(input.x, 'x'),
        normalize(input.t, 't'),
        normalize(input.rainfall, 'rainfall'),
        normalize(input.slope, 'slope'),
        normalize(input.manningN, 'manningN'),
    ];
}

// ============ Prediction ============

/**
 * Predict runoff discharge using the PINN model
 */
export async function predictRunoff(input: PINNInput): Promise<PINNOutput> {
    const model = await getModel();
    const inputTensor = tf.tensor2d([getNormalizedInputArray(input)]);
    const outputTensor = model.predict(inputTensor) as tf.Tensor;
    const rawOutput = outputTensor.dataSync()[0];

    inputTensor.dispose();
    outputTensor.dispose();

    const discharge = input.t <= 0 ? 0 : denormalizeDischarge(rawOutput);
    const { depth, velocity } = calculateDepthAndVelocity(discharge, input);

    return {
        discharge,
        depth,
        velocity,
        confidence: 0.85,
        isPINNPrediction: true,
    };
}

/**
 * Compute the kinematic wave analytical solution
 */
export function computeKinematicWaveSolution(params: KinematicWaveParams): KinematicWaveResult {
    const { length, rainfall, slope, manningN, width } = params;
    const q = rainfall / (1000 * 3600);
    const alpha = Math.sqrt(slope) / manningN;
    const m = 5 / 3;

    const h_eq = Math.pow((q * length) / (alpha * width), 1 / m);
    const c_eq = alpha * m * Math.pow(h_eq, m - 1);
    const t_c = length / c_eq;

    const peakDischarge = alpha * Math.pow(h_eq, m) * width * 1000;

    return {
        peakDischarge,
        timeToPeak: t_c / 60,
        equilibriumDepth: h_eq * 1000,
    };
}

/**
 * Fallback to rational method if PINN fails
 */
export const computeRationalMethod = computePeakRunoff;

/**
 * Get runoff prediction with PINN, falling back to rational method
 */
export async function getHybridPrediction(input: PINNInput, area: number = 100): Promise<PINNOutput> {
    try {
        const pinn = await predictRunoff(input);
        const rational = computeRationalMethod(input.rainfall, area);
        return decidePinnUsage(pinn, rational, input, area);
    } catch {
        return getFallbackResult(input.rainfall, area, 0.3);
    }
}

function decidePinnUsage(pinn: PINNOutput, rational: number, input: PINNInput, area: number): PINNOutput {
    const ratio = pinn.discharge / rational;
    if (ratio > 0.3 && ratio < 3.0) return pinn;
    return getFallbackResult(input.rainfall, area, 0.5);
}

function getFallbackResult(rainfall: number, area: number, confidence: number): PINNOutput {
    return {
        discharge: computeRationalMethod(rainfall, area),
        depth: 0,
        velocity: 0,
        confidence,
        isPINNPrediction: false,
    };
}
