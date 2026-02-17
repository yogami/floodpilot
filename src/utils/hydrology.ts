import { getRobustRunoffPrediction } from '../ml/pinnInference';

/**
 * Hydrology Calculation Engine
 * Client-side calculations for green infrastructure sizing based on Berlin rainfall data
 */

/** Check if PINN model is ready for use */
export const hasPINNSupport = true;

/**
 * Compute peak runoff rate using Physics-Informed Neural Network
 * Falls back to Rational Method if PINN fails or uninitialized
 */
export async function computeRunoffWithPINN(
    rainfall_mm_hr: number,
    area_m2: number,
    slope: number = 0.02
): Promise<number> {
    return getRobustRunoffPrediction(rainfall_mm_hr, area_m2, slope);
}

/** Runoff coefficients for different surface types */
export const RUNOFF_COEFFICIENTS = {
    impervious: 0.95,
    pervious: 0.25,
    permeablePaving: 0.45
};

export type SurfaceType = keyof typeof RUNOFF_COEFFICIENTS;

export interface GreenFix {
    type: 'rain_garden' | 'permeable_pavement' | 'tree_planter';
    size: number;       // m²
    reductionRate: number; // 0-1
    placement: string;
}

export interface PermeableCapacity {
    area: number;
    designStorm: number;
    infiltrationRate: number;
    safetyMargin: number;
    canHandle: boolean;
}

/**
 * Compute peak runoff rate in liters per second
 * Formula: Q = (rainfall × area × coefficient) / 3600
 * 
 * @param rainfall_mm_hr - Rainfall intensity in mm/hour
 * @param area_m2 - Catchment area in square meters
 * @param coeff - Runoff coefficient (0-1)
 * @returns Peak runoff in L/s
 */
export function computePeakRunoff(
    rainfall_mm_hr: number,
    area_m2: number,
    coeff: number = 0.9
): number {
    // mm/hr × m² = L/hr, divide by 3600 for L/s
    return (rainfall_mm_hr * area_m2 * coeff) / 3600;
}

/**
 * Compute Water Quality Volume (WQv) for a given rainfall depth
 * Formula: WQv = (P * Rv * A)
 * 
 * @param depth_mm - Rainfall depth in mm
 * @param area_m2 - Catchment area in m²
 * @param coeff - Runoff coefficient (usually Rv)
 * @returns Required storage volume in Liters
 */
export function computeWQv(
    depth_mm: number,
    area_m2: number,
    coeff: number = 0.9
): number {
    // mm * m² = L
    return depth_mm * area_m2 * coeff;
}

/**
 * Size a rain garden based on required storage volume
 * 
 * @param runoff_Ls - Peak runoff rate in L/s
 * @param duration_hr - Storm duration in hours (default 1)
 * @param retentionFactor - Fraction of runoff to retain (default 0.8)
 * @returns Required volume in liters
 */
export function sizeRainGarden(
    runoff_Ls: number,
    duration_hr: number = 1,
    retentionFactor: number = 0.8
): number {
    // Volume = flow rate × duration × retention factor
    return runoff_Ls * retentionFactor * duration_hr * 3600;
}

/**
 * Calculate rain garden area from volume assuming standard depth
 * 
 * @param volume_L - Required volume in liters
 * @param depth_m - Garden depth in meters (default 0.3m)
 * @returns Required area in m²
 */
export function rainGardenAreaFromVolume(
    volume_L: number,
    depth_m: number = 0.3
): number {
    // 1000L = 1m³
    const volume_m3 = volume_L / 1000;
    return volume_m3 / depth_m;
}

/**
 * Compute permeable pavement capacity
 * 
 * @param area_m2 - Pavement area
 * @param designStorm_mm_hr - Design storm intensity
 * @param infiltrationRate_mm_hr - Soil infiltration rate
 * @returns Capacity assessment
 */
export function computePermeablePavementCapacity(
    area_m2: number,
    designStorm_mm_hr: number,
    infiltrationRate_mm_hr: number
): PermeableCapacity {
    const safetyMargin = Math.round((infiltrationRate_mm_hr / designStorm_mm_hr) * 100);
    return {
        area: area_m2,
        designStorm: designStorm_mm_hr,
        infiltrationRate: infiltrationRate_mm_hr,
        safetyMargin,
        canHandle: infiltrationRate_mm_hr >= designStorm_mm_hr
    };
}

/**
 * Compute optimal tree planter count for a road verge
 * 
 * @param vergeLength_m - Available length in meters
 * @param spacing_m - Minimum spacing between trees
 * @returns Recommended planter count
 */
export function computeTreePlanterCount(
    vergeLength_m: number,
    spacing_m: number
): number {
    return Math.floor(vergeLength_m / spacing_m);
}

/**
 * Calculate total runoff reduction from installed fixes
 * 
 * @param fixes - Array of installed green infrastructure
 * @param totalArea_m2 - Total impervious area
 * @returns Reduction percentage (0-100)
 */
interface FixLike {
    size?: number;
    Size?: string;
    reductionRate?: number;
    'Reduction Rate'?: string;
}

function parseFixSize(fix: FixLike): number {
    if (fix.size !== undefined) return fix.size;
    return parseFloat((fix.Size || '0').replace('m²', ''));
}

function parseFixRate(fix: FixLike): number {
    if (fix.reductionRate !== undefined) return fix.reductionRate;
    return parseFloat(fix['Reduction Rate'] || '0');
}

/**
 * Calculate total runoff reduction from installed fixes
 */
export function calculateTotalReduction(
    fixes: FixLike[],
    totalArea_m2: number
): number {
    let totalCapture = 0;
    for (const fix of fixes) {
        totalCapture += parseFixSize(fix) * parseFixRate(fix);
    }
    return (totalCapture / totalArea_m2) * 100;
}

/**
 * Suggest green infrastructure fixes for a given impervious area
 * 
 * @param area_m2 - Impervious area to treat
 * @param rainfall_mm_hr - Design rainfall intensity
 * @returns Array of suggested fixes with sizing
 */

/**
 * Suggest green infrastructure fixes for a given impervious area
 */
export function suggestGreenFixes(
    area_m2: number
): GreenFix[] {

    return [
        { type: 'rain_garden', size: Math.round(area_m2 * 0.2), reductionRate: 0.4, placement: 'Sidewalk edge' },
        { type: 'permeable_pavement', size: Math.round(area_m2 * 0.5), reductionRate: 0.7, placement: 'Parking area' },
        { type: 'tree_planter', size: 30, reductionRate: 0.25, placement: 'Road verge' }
    ];
}

/**
 * Format runoff amount for display
 * 
 * @param runoff_Ls - Runoff in L/s
 * @returns Formatted string
 */
export function formatRunoffDisplay(runoff_Ls: number): string {
    const litersPerMin = runoff_Ls * 60;
    return `Handles ${Math.round(litersPerMin)}L/min storm`;
}
