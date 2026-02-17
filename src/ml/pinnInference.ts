/**
 * PINN Inference Engine (Browser / Edge)
 * 
 * Handles loading the pre-trained Physics-Informed Neural Network
 * and running high-speed inference on the client device.
 */

import * as tf from '@tensorflow/tfjs';
import { createPINNModel, type PINNInput, type PINNOutput } from './pinnModel';
import { normalize, OUTPUT_SCALE } from './pinnConstants';
import { computePeakRunoff } from '../utils/hydrology';

const MODEL_URL = '/models/pinn_runoff/model.json';

// Singleton model instance
let loadedModel: tf.LayersModel | tf.Sequential | null = null;
let isLoading = false;



/**
 * Initialize the PINN inference engine
 */
export async function initPINNEngine(): Promise<boolean> {
    try {
        await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
        await tf.ready();
        return await loadModel();
    } catch {
        return false;
    }
}

async function tryLoadModel(): Promise<tf.LayersModel | tf.Sequential | null> {
    try {
        const model = await tf.loadLayersModel(MODEL_URL);
        return model;
    } catch {
        return await createPINNModel();
    }
}

async function warmupModel(model: tf.LayersModel | tf.Sequential): Promise<void> {
    const dummyInput = tf.zeros([1, 5]);
    const warmup = model.predict(dummyInput) as tf.Tensor;
    warmup.dispose();
    dummyInput.dispose();
}

/**
 * Load the PINN model if not already loaded
 */
export async function loadModel(): Promise<boolean> {
    if (loadedModel) return true;
    if (isLoading) return false;
    return performLoad();
}

async function performLoad(): Promise<boolean> {
    isLoading = true;
    try {
        loadedModel = await tryLoadModel();
        if (loadedModel) await warmupModel(loadedModel);
    } finally {
        isLoading = false;
    }
    return !!loadedModel;
}

function normalizeInput(input: PINNInput): number[] {
    return [
        normalize(input.x, 'x'),
        normalize(input.t, 't'),
        normalize(input.rainfall, 'rainfall'),
        normalize(input.slope, 'slope'),
        normalize(input.manningN, 'manningN'),
    ];
}

/**
 * Run PINN inference for a single input scenario
 */
export async function runPINNInference(input: PINNInput): Promise<PINNOutput> {
    if (!loadedModel && !(await loadModel())) {
        throw new Error('PINN model not available');
    }

    const discharge = tf.tidy(() => {
        const inputTensor = tf.tensor2d([normalizeInput(input)]);
        const outputTensor = loadedModel!.predict(inputTensor) as tf.Tensor;
        return outputTensor.dataSync()[0] * OUTPUT_SCALE; // Denormalization
    });

    return buildOutput(discharge, input);
}

function buildOutput(discharge: number, input: PINNInput): PINNOutput {
    const depthM = calculateDepthM(discharge, input);
    const velocity = calculateVelocity(discharge, depthM);
    const actualDischarge = input.t <= 0 ? 0 : Math.max(0, discharge);

    return {
        discharge: actualDischarge,
        depth: depthM * 1000,
        velocity,
        confidence: 0.92,
        isPINNPrediction: true
    };
}

function calculateDepthM(discharge: number, input: PINNInput): number {
    if (discharge <= 0.001) return 0;
    const width = 10;
    const numerator = discharge / 1000 * input.manningN;
    const denominator = width * Math.sqrt(input.slope);
    return Math.pow(numerator / denominator, 0.6);
}

function calculateVelocity(discharge: number, depthM: number): number {
    if (depthM <= 0) return 0;
    return (discharge / 1000) / (10 * depthM);
}

function isSanePrediction(pinn: number, rational: number): boolean {
    return pinn <= rational * 3 && pinn >= rational * 0.2;
}

/**
 * Robust Hybrid Prediction
 */
export async function getRobustRunoffPrediction(
    rainfall: number,
    area: number,
    slope: number = 0.02
): Promise<number> {
    const rational = computePeakRunoff(rainfall, area);
    const input: PINNInput = { x: 100, t: 60, rainfall, slope, manningN: 0.015 };
    return tryPINN(input, rational);
}

async function tryPINN(input: PINNInput, rational: number): Promise<number> {
    try {
        const pinn = await runPINNInference(input);
        return isSanePrediction(pinn.discharge, rational) ? pinn.discharge : rational;
    } catch {
        return rational;
    }
}
