/**
 * DIN 1986-100 Überflutungsnachweis Engine
 * 
 * German-specific compliance engine for stormwater management verification.
 * Wraps existing PINN hydrology stack for DIN 1986-100 §14.9.2 compliance.
 * 
 * Co-Pilot for Civil Engineers — FloodPilot
 */

import { computePeakRunoff, computeWQv, RUNOFF_COEFFICIENTS } from '../utils/hydrology';
import { computeKinematicWaveSolution, type KinematicWaveResult } from '../ml/pinnModel';

// ============ Types ============

export interface DIN1986Input {
    /** Site name / project identifier */
    projectName: string;
    /** Total site area in m² */
    grundstuecksflaeche: number;
    /** Impervious area in m² */
    versiegelteFlaeche: number;
    /** Soil type per DIN 18196 */
    bodenart: 'GW' | 'GI' | 'SE' | 'SU' | 'TL' | 'TM';
    /** Surface slope in % */
    gelaendeneigung: number;
    /** Manning's roughness coefficient */
    manningN: number;
    /** Flow path length in m */
    fliesslaenge: number;
    /** Latitude for location context */
    latitude: number;
    /** Longitude for location context */
    longitude: number;
}

export interface DIN1986Result {
    /** Whether Überflutungsnachweis is required per §14.9.2 */
    nachweisErforderlich: boolean;
    /** Reason for requirement / exemption */
    begruendung: string;
    /** Abflusswirksame Fläche in m² */
    abflusswirksameFlaeche: number;
    /** Versiegelungsgrad (impervious fraction 0-1) */
    versiegelungsgrad: number;
    /** Design storm return period applied */
    bemessungsregenJahre: 30 | 100;
    /** Rainfall intensity for design storm in mm/hr */
    regenspende: number;
    /** Weighted runoff coefficient Ψ */
    abflussbeiwert: number;
    /** Peak discharge Q in L/s (Rational Method) */
    spitzenabflussRational: number;
    /** Peak discharge Q in L/s (PINN / Kinematic Wave) */
    spitzenabflussPINN: number;
    /** Required retention volume in m³ */
    rueckhaltevolumen: number;
    /** Water quality volume in L */
    wasserqualitaetsvolumen: number;
    /** Kinematic wave analysis results */
    kinematischeWelle: KinematicWaveResult;
    /** Compliance status */
    nachweisStatus: 'BESTANDEN' | 'NICHT_BESTANDEN' | 'PRUEFUNG_ERFORDERLICH';
    /** ISO timestamp */
    zeitstempel: string;
    /** Recommendations */
    empfehlungen: string[];
}

// ============ Berlin KOSTRA-DWD Rainfall Data ============

/**
 * KOSTRA-DWD 2020 rainfall intensities for Berlin
 * Duration: 15 min (critical for urban drainage)
 * Values in mm/hr
 */
const BERLIN_KOSTRA: Record<number, number> = {
    2: 95,     // T=2a
    5: 125,    // T=5a
    10: 145,   // T=10a
    30: 175,   // T=30a (DIN 1986-100 standard)
    50: 195,   // T=50a
    100: 220,  // T=100a (DIN 1986-100 for high impervious)
};

/**
 * Soil type to SCS group mapping (German DIN 18196 → SCS)
 */
const SOIL_SCS_MAP: Record<DIN1986Input['bodenart'], 'A' | 'B' | 'C' | 'D'> = {
    'GW': 'A',  // Kies, gut abgestuft
    'GI': 'A',  // Kies, intermittierend
    'SE': 'A',  // Sand, eng gestuft
    'SU': 'B',  // Sand, schluffig
    'TL': 'C',  // Ton, leicht plastisch
    'TM': 'D',  // Ton, mittel plastisch
};

/**
 * Runoff coefficients per surface type (DWA-A 117 / DIN 1986-100)
 */
const DIN_RUNOFF_COEFFICIENTS = {
    dach_flach: 0.9,         // Flachdach
    dach_steil: 0.9,         // Steildach
    asphalt_beton: 0.9,      // Asphalt/Beton
    pflaster_fugen: 0.75,    // Pflaster mit Fugen
    kies_schotter: 0.3,      // Kies/Schotter
    gruenflaeche: 0.15,      // Grünfläche
    extensivbegruenunng: 0.3, // Extensive Dachbegrünung
    intensivbegruenunng: 0.1, // Intensive Dachbegrünung
};

// ============ Core Engine ============

/**
 * Perform DIN 1986-100 Überflutungsnachweis assessment
 */
export function performDIN1986Assessment(input: DIN1986Input): DIN1986Result {
    // 1. Calculate abflusswirksame Fläche
    const abflusswirksameFlaeche = input.versiegelteFlaeche;
    const versiegelungsgrad = input.versiegelteFlaeche / input.grundstuecksflaeche;

    // 2. Determine if Überflutungsnachweis is required (§14.9.2)
    const nachweisErforderlich = abflusswirksameFlaeche > 800;
    const begruendung = nachweisErforderlich
        ? `Abflusswirksame Fläche (${abflusswirksameFlaeche} m²) überschreitet 800 m² Schwellenwert nach DIN 1986-100 §14.9.2`
        : `Abflusswirksame Fläche (${abflusswirksameFlaeche} m²) unter 800 m² — vereinfachtes Verfahren ausreichend`;

    // 3. Determine design storm return period
    //    T=30a for <70% impervious, T=100a for ≥70%
    const bemessungsregenJahre: 30 | 100 = versiegelungsgrad >= 0.7 ? 100 : 30;

    // 4. Get Berlin rainfall intensity
    const regenspende = BERLIN_KOSTRA[bemessungsregenJahre];

    // 5. Calculate weighted runoff coefficient
    const perviousArea = input.grundstuecksflaeche - input.versiegelteFlaeche;
    const abflussbeiwert = (
        (input.versiegelteFlaeche * RUNOFF_COEFFICIENTS.impervious) +
        (perviousArea * RUNOFF_COEFFICIENTS.pervious)
    ) / input.grundstuecksflaeche;

    // 6. Peak discharge — Rational Method
    const spitzenabflussRational = computePeakRunoff(regenspende, input.grundstuecksflaeche, abflussbeiwert);

    // 7. Peak discharge — PINN / Kinematic Wave
    const slopeDecimal = input.gelaendeneigung / 100;
    const kinematischeWelle = computeKinematicWaveSolution({
        length: input.fliesslaenge,
        rainfall: regenspende,
        slope: Math.max(slopeDecimal, 0.001), // Minimum slope
        manningN: input.manningN,
        width: Math.sqrt(input.grundstuecksflaeche), // Approximate width
    });
    const spitzenabflussPINN = kinematischeWelle.peakDischarge;

    // 8. Required retention volume (WQv-based)
    const wasserqualitaetsvolumen = computeWQv(25, input.grundstuecksflaeche, abflussbeiwert);
    const rueckhaltevolumen = wasserqualitaetsvolumen / 1000; // Convert L to m³

    // 9. Compliance determination
    const nachweisStatus = determineComplianceStatus(
        nachweisErforderlich,
        spitzenabflussRational,
        spitzenabflussPINN,
        rueckhaltevolumen,
    );

    // 10. Generate recommendations
    const empfehlungen = generateRecommendations(input, versiegelungsgrad, nachweisStatus);

    return {
        nachweisErforderlich,
        begruendung,
        abflusswirksameFlaeche,
        versiegelungsgrad,
        bemessungsregenJahre,
        regenspende,
        abflussbeiwert,
        spitzenabflussRational,
        spitzenabflussPINN,
        rueckhaltevolumen,
        wasserqualitaetsvolumen,
        kinematischeWelle,
        nachweisStatus,
        zeitstempel: new Date().toISOString(),
        empfehlungen,
    };
}

function determineComplianceStatus(
    required: boolean,
    qRational: number,
    qPINN: number,
    retentionM3: number,
): DIN1986Result['nachweisStatus'] {
    if (!required) return 'BESTANDEN';

    // Check convergence between methods
    const ratio = qPINN / qRational;
    if (ratio < 0.3 || ratio > 3.0) return 'PRUEFUNG_ERFORDERLICH';

    // Simple threshold: if retention volume is manageable
    if (retentionM3 < 50) return 'BESTANDEN';
    if (retentionM3 < 200) return 'PRUEFUNG_ERFORDERLICH';
    return 'NICHT_BESTANDEN';
}

function generateRecommendations(
    input: DIN1986Input,
    versiegelungsgrad: number,
    status: DIN1986Result['nachweisStatus'],
): string[] {
    const recs: string[] = [];

    if (versiegelungsgrad > 0.8) {
        recs.push('Hoher Versiegelungsgrad (>80%). Entsiegelung oder Retentionsdach empfohlen.');
    }

    if (versiegelungsgrad >= 0.7) {
        recs.push('T=100a Bemessungsregen angesetzt (Versiegelungsgrad ≥70%). Intensive Dachbegrünung kann den Abflussbeiwert senken.');
    }

    if (input.grundstuecksflaeche > 2000) {
        recs.push('Bei Grundstücken >2.000 m² ist eine detaillierte Überflutungssimulation (2D) empfohlen.');
    }

    if (status === 'PRUEFUNG_ERFORDERLICH') {
        recs.push('Analytische und PINN-Methode zeigen Divergenz. Manuelle Prüfung durch Bauvorlageberechtigten erforderlich.');
    }

    if (status === 'NICHT_BESTANDEN') {
        recs.push('Erforderliches Rückhaltevolumen überschreitet zulässige Grenzen. Entwässerungskonzept überarbeiten.');
        recs.push('Prüfung eines Rigolen- oder Muldenversickerungssystems gemäß DWA-A 138 empfohlen.');
    }

    recs.push('Hinweis: Dieser Entwurf ersetzt nicht die Prüfung und Freigabe durch einen Bauvorlageberechtigten Ingenieur.');

    return recs;
}

// ============ Exported Constants ============

export { DIN_RUNOFF_COEFFICIENTS, BERLIN_KOSTRA, SOIL_SCS_MAP };

/**
 * Generate formatted compliance report text
 */
export function generateComplianceText(result: DIN1986Result, projectName: string): string {
    const date = new Date(result.zeitstempel);
    const dateStr = date.toLocaleDateString('de-DE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const statusLabel = {
        'BESTANDEN': '✅ Nachweis erbracht',
        'NICHT_BESTANDEN': '❌ Nachweis nicht erbracht',
        'PRUEFUNG_ERFORDERLICH': '⚠️ Prüfung erforderlich',
    }[result.nachweisStatus];

    return `
ÜBERFLUTUNGSNACHWEIS NACH DIN 1986-100
══════════════════════════════════════
ENTWURF — Freigabe durch Bauvorlageberechtigten erforderlich

Projekt: ${projectName}
Datum: ${dateStr}
Erstellt mit: FloodPilot v1.0

1. STANDORTDATEN
   Grundstücksfläche:        ${result.abflusswirksameFlaeche.toFixed(0)} m² (abflusswirksam)
   Versiegelungsgrad:        ${(result.versiegelungsgrad * 100).toFixed(1)}%
   Bemessungsregen:          T=${result.bemessungsregenJahre}a

2. BERECHNUNGSERGEBNISSE
   Abflussbeiwert Ψ:         ${result.abflussbeiwert.toFixed(3)}
   Regenspende (r₁₅):       ${result.regenspende.toFixed(0)} mm/hr
   
   Spitzenabfluss (Rational): ${result.spitzenabflussRational.toFixed(2)} L/s
   Spitzenabfluss (PINN/KW):  ${result.spitzenabflussPINN.toFixed(2)} L/s
   
   Rückhaltevolumen:          ${result.rueckhaltevolumen.toFixed(1)} m³
   
   Kinetische Welle:
     Spitzenabfluss:          ${result.kinematischeWelle.peakDischarge.toFixed(2)} L/s
     Anstiegszeit:            ${result.kinematischeWelle.timeToPeak.toFixed(1)} min
     Gleichgewichtstiefe:     ${result.kinematischeWelle.equilibriumDepth.toFixed(1)} mm

3. ERGEBNIS
   ${statusLabel}

4. EMPFEHLUNGEN
${result.empfehlungen.map(r => `   • ${r}`).join('\n')}

══════════════════════════════════════
HAFTUNGSAUSSCHLUSS: Dieses Dokument ist ein automatisch erstellter
Entwurf. Es ersetzt nicht die Prüfung und Stempelung durch einen
nach §65 BauO Bln bauvorlageberechtigten Ingenieur.
`.trim();
}
