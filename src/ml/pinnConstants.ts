/**
 * PINN Model Constants
 * Unified normalization parameters for training and inference.
 */

export const NORMALIZATION = {
    x: { min: 0, max: 200 },
    t: { min: 0, max: 120 },
    rainfall: { min: 0, max: 150 },
    slope: { min: 0.001, max: 0.2 },
    manningN: { min: 0.01, max: 0.1 },
};

export function normalize(value: number, key: keyof typeof NORMALIZATION): number {
    const { min, max } = NORMALIZATION[key];
    // Clamp value to min/max before normalizing to ensure 0-1 range
    const clamped = Math.max(min, Math.min(max, value));
    return (clamped - min) / (max - min);
}

export const OUTPUT_SCALE = 200;

export function normalizeOutput(output: number): number {
    return output / OUTPUT_SCALE;
}

export function denormalizeOutput(normalizedValue: number): number {
    return normalizedValue * OUTPUT_SCALE;
}
