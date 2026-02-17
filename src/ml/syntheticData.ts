/**
 * Synthetic Training Data Generator for PINN
 */

import { computeKinematicWaveSolution, type KinematicWaveParams } from './pinnModel';

export interface TrainingSample {
    inputs: number[];
    output: number;
}

export interface TrainingDataset {
    samples: TrainingSample[];
    inputMeans: number[];
    inputStds: number[];
    outputMean: number;
    outputStd: number;
}

const PARAM_RANGES = {
    length: { min: 50, max: 200, samples: 5 },
    rainfall: { min: 10, max: 100, samples: 6 },
    slope: { min: 0.005, max: 0.15, samples: 5 },
    manningN: { min: 0.01, max: 0.05, samples: 4 },
    width: { min: 5, max: 20, samples: 3 },
};

const TIME_STEPS = 10;
const SPACE_STEPS = 5;

function linspace(min: number, max: number, n: number): number[] {
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, i) => min + i * step);
}

function generateSampleAtPoint(x: number, t: number, params: KinematicWaveParams): TrainingSample {
    const solution = computeKinematicWaveSolution(params);
    const t_ratio = Math.min(t / solution.timeToPeak, 1.0);
    const x_ratio = x / params.length;
    const discharge = solution.peakDischarge * t_ratio * x_ratio;
    const noise = (Math.random() - 0.5) * 0.05 * discharge;
    return {
        inputs: [x, t, params.rainfall, params.slope, params.manningN],
        output: Math.max(0, discharge + noise),
    };
}

function getParamCombos(): KinematicWaveParams[] {
    const combos: KinematicWaveParams[] = [];
    const lengths = linspace(PARAM_RANGES.length.min, PARAM_RANGES.length.max, PARAM_RANGES.length.samples);
    const rainfalls = linspace(PARAM_RANGES.rainfall.min, PARAM_RANGES.rainfall.max, PARAM_RANGES.rainfall.samples);
    const slopes = linspace(PARAM_RANGES.slope.min, PARAM_RANGES.slope.max, PARAM_RANGES.slope.samples);
    const mNs = linspace(PARAM_RANGES.manningN.min, PARAM_RANGES.manningN.max, PARAM_RANGES.manningN.samples);
    const widths = linspace(PARAM_RANGES.width.min, PARAM_RANGES.width.max, PARAM_RANGES.width.samples);

    lengths.forEach(length => rainfalls.forEach(rainfall => slopes.forEach(slope => mNs.forEach(manningN => widths.forEach(width => {
        combos.push({ length, rainfall, slope, manningN, width });
    })))));
    return combos;
}

function addSamplesForParams(samples: TrainingSample[], params: KinematicWaveParams): void {
    const xPos = linspace(0, params.length, SPACE_STEPS);
    const tPos = linspace(0, 60, TIME_STEPS);
    xPos.forEach(x => tPos.forEach(t => samples.push(generateSampleAtPoint(x, t, params))));
}

export function generateTrainingData(): TrainingDataset {
    const samples: TrainingSample[] = [];
    getParamCombos().forEach(params => addSamplesForParams(samples, params));

    const stats = computeStats(samples);
    return { samples, ...stats };
}

function computeStats(samples: TrainingSample[]): Omit<TrainingDataset, 'samples'> {
    if (samples.length === 0) return { inputMeans: [0, 0, 0, 0, 0], inputStds: [1, 1, 1, 1, 1], outputMean: 0, outputStd: 1 };

    const inputMeans = [0, 0, 0, 0, 0];
    let outputMean = 0;
    samples.forEach(s => {
        s.inputs.forEach((v, i) => inputMeans[i] += v);
        outputMean += s.output;
    });
    inputMeans.forEach((_, i) => inputMeans[i] /= samples.length);
    outputMean /= samples.length;

    const inputStds = [0, 0, 0, 0, 0];
    let outputStd = 0;
    samples.forEach(s => {
        s.inputs.forEach((v, i) => inputStds[i] += Math.pow(v - inputMeans[i], 2));
        outputStd += Math.pow(s.output - outputMean, 2);
    });
    inputStds.forEach((_, i) => inputStds[i] = Math.sqrt(inputStds[i] / samples.length));
    outputStd = Math.sqrt(outputStd / samples.length);

    return { inputMeans, inputStds, outputMean, outputStd };
}

export function generateBoundaryData(): TrainingSample[] {
    const samples: TrainingSample[] = [];
    const r = [25, 50, 75, 100];
    const s = [0.01, 0.05, 0.10];
    const n = [0.01, 0.02, 0.03];

    r.forEach(rainfall => s.forEach(slope => n.forEach(manningN => {
        addBoundaryPoints(samples, rainfall, slope, manningN);
    })));
    return samples;
}

function addBoundaryPoints(samples: TrainingSample[], rainfall: number, slope: number, manningN: number): void {
    for (let t = 0; t <= 60; t += 5) {
        samples.push({ inputs: [0, t, rainfall, slope, manningN], output: 0.01 });
    }
    for (let x = 0; x <= 100; x += 10) {
        samples.push({ inputs: [x, 0, rainfall, slope, manningN], output: 0 });
    }
}

export function splitDataset(samples: TrainingSample[], trainRatio: number = 0.8): { train: TrainingSample[]; val: TrainingSample[] } {
    const shuffled = [...samples].sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(shuffled.length * trainRatio);
    return { train: shuffled.slice(0, splitIndex), val: shuffled.slice(splitIndex) };
}
