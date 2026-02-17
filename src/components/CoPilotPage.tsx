/**
 * FloodPilot Co-Pilot Page
 * 
 * DIN 1986-100 Überflutungsnachweis calculator for civil engineers.
 * Powered by PINN hydrology engine.
 */

import { useState, useCallback, useMemo } from 'react';
import {
    performDIN1986Assessment,
    type DIN1986Input,
    type DIN1986Result,
} from '../services/din1986Engine';
import { generateDIN1986PDF } from '../services/din1986Report';
import './CoPilotStyles.css';

const DEFAULT_INPUT: DIN1986Input = {
    projectName: '',
    grundstuecksflaeche: 2000,
    versiegelteFlaeche: 1400,
    bodenart: 'SU',
    gelaendeneigung: 2.0,
    manningN: 0.015,
    fliesslaenge: 50,
    latitude: 52.52,
    longitude: 13.405,
};

const SOIL_OPTIONS: { value: DIN1986Input['bodenart']; label: string }[] = [
    { value: 'GW', label: 'GW — Kies, gut abgestuft' },
    { value: 'GI', label: 'GI — Kies, intermittierend' },
    { value: 'SE', label: 'SE — Sand, eng gestuft' },
    { value: 'SU', label: 'SU — Sand, schluffig' },
    { value: 'TL', label: 'TL — Ton, leicht plastisch' },
    { value: 'TM', label: 'TM — Ton, mittel plastisch' },
];

export function CoPilotPage() {
    const [input, setInput] = useState<DIN1986Input>(DEFAULT_INPUT);
    const [result, setResult] = useState<DIN1986Result | null>(null);

    const versiegelungsgrad = useMemo(() => {
        if (input.grundstuecksflaeche <= 0) return 0;
        return input.versiegelteFlaeche / input.grundstuecksflaeche;
    }, [input.versiegelteFlaeche, input.grundstuecksflaeche]);

    const nachweisErforderlich = input.versiegelteFlaeche > 800;

    const handleChange = useCallback((field: keyof DIN1986Input, value: string | number) => {
        setInput(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleCalculate = useCallback(() => {
        const assessment = performDIN1986Assessment(input);
        setResult(assessment);
    }, [input]);

    const handleExportPDF = useCallback(() => {
        if (!result) return;
        const pdf = generateDIN1986PDF(result, input.projectName || 'Unbenanntes Projekt');
        pdf.save(`Ueberflutungsnachweis_${input.projectName || 'Entwurf'}_${new Date().toISOString().slice(0, 10)}.pdf`);
    }, [result, input.projectName]);

    return (
        <div className="copilot-root">
            {/* Header */}
            <header className="copilot-header">
                <div className="copilot-logo">
                    <div className="copilot-logo-icon">🌊</div>
                    <div className="copilot-logo-text">
                        Flood<span>Pilot</span>
                    </div>
                </div>
                <span className="copilot-badge">DIN 1986-100 Co-Pilot</span>
            </header>

            {/* Layout */}
            <div className="copilot-layout">
                {/* Input Panel */}
                <div className="copilot-input-panel">
                    <div className="copilot-section-title">Standortdaten</div>

                    <div className="copilot-form-group">
                        <label>Projektname</label>
                        <input
                            id="project-name"
                            className="copilot-input"
                            type="text"
                            placeholder="z.B. Neubau Logistikhalle Spandau"
                            value={input.projectName}
                            onChange={e => handleChange('projectName', e.target.value)}
                        />
                    </div>

                    <div className="copilot-form-group">
                        <label>Grundstücksfläche <span className="unit">(m²)</span></label>
                        <input
                            id="total-area"
                            className="copilot-input"
                            type="number"
                            min={0}
                            value={input.grundstuecksflaeche}
                            onChange={e => handleChange('grundstuecksflaeche', Number(e.target.value))}
                        />
                    </div>

                    <div className="copilot-form-group">
                        <label>Versiegelte Fläche <span className="unit">(m²)</span></label>
                        <input
                            id="impervious-area"
                            className="copilot-input"
                            type="number"
                            min={0}
                            max={input.grundstuecksflaeche}
                            value={input.versiegelteFlaeche}
                            onChange={e => handleChange('versiegelteFlaeche', Number(e.target.value))}
                        />
                    </div>

                    {/* Threshold indicator */}
                    <div className={`copilot-threshold ${nachweisErforderlich ? 'required' : 'not-required'}`}>
                        <span>{nachweisErforderlich ? '⚠️' : '✅'}</span>
                        <span>
                            {nachweisErforderlich
                                ? `Überflutungsnachweis erforderlich (${input.versiegelteFlaeche} m² > 800 m²)`
                                : `Vereinfachtes Verfahren ausreichend (${input.versiegelteFlaeche} m² ≤ 800 m²)`
                            }
                        </span>
                        <span className="copilot-din-ref">§14.9.2</span>
                    </div>

                    <div className="copilot-section-title" style={{ marginTop: 24 }}>Geotechnik</div>

                    <div className="copilot-form-group">
                        <label>Bodenart <span className="unit">(DIN 18196)</span></label>
                        <select
                            id="soil-type"
                            className="copilot-select"
                            value={input.bodenart}
                            onChange={e => handleChange('bodenart', e.target.value)}
                        >
                            {SOIL_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="copilot-form-group">
                        <label>Geländeneigung <span className="unit">(%)</span></label>
                        <input
                            id="slope"
                            className="copilot-input"
                            type="number"
                            min={0.1}
                            max={20}
                            step={0.1}
                            value={input.gelaendeneigung}
                            onChange={e => handleChange('gelaendeneigung', Number(e.target.value))}
                        />
                    </div>

                    <div className="copilot-form-group">
                        <label>Fließweglänge <span className="unit">(m)</span></label>
                        <input
                            id="flow-length"
                            className="copilot-input"
                            type="number"
                            min={1}
                            value={input.fliesslaenge}
                            onChange={e => handleChange('fliesslaenge', Number(e.target.value))}
                        />
                    </div>

                    <div className="copilot-form-group">
                        <label>Manning-Rauheitsbeiwert n</label>
                        <input
                            id="manning-n"
                            className="copilot-input"
                            type="number"
                            min={0.01}
                            max={0.1}
                            step={0.001}
                            value={input.manningN}
                            onChange={e => handleChange('manningN', Number(e.target.value))}
                        />
                    </div>

                    <div className="copilot-section-title" style={{ marginTop: 24 }}>
                        Versiegelungsgrad: {(versiegelungsgrad * 100).toFixed(0)}%
                        {versiegelungsgrad >= 0.7
                            ? <span className="copilot-din-ref" style={{ color: 'var(--fp-warning)' }}>T=100a</span>
                            : <span className="copilot-din-ref">T=30a</span>
                        }
                    </div>

                    <button
                        id="calculate-btn"
                        className="copilot-btn-calculate"
                        onClick={handleCalculate}
                    >
                        🔬 Überflutungsnachweis berechnen
                    </button>
                </div>

                {/* Results Panel */}
                <div className="copilot-results-panel">
                    {!result ? (
                        <div className="copilot-results-empty">
                            <div className="copilot-results-empty-icon">🏗️</div>
                            <h3>Standortdaten eingeben</h3>
                            <p>
                                Geben Sie die Grundstücksdaten ein und klicken Sie auf
                                "Überflutungsnachweis berechnen" um die Analyse zu starten.
                            </p>
                        </div>
                    ) : (
                        <ResultsView result={result} onExport={handleExportPDF} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ===== Results View =====

function ResultsView({ result, onExport }: { result: DIN1986Result; onExport: () => void }) {
    const statusConfig = {
        'BESTANDEN': { class: 'pass', icon: '✅', label: 'Nachweis erbracht' },
        'NICHT_BESTANDEN': { class: 'fail', icon: '❌', label: 'Nachweis nicht erbracht' },
        'PRUEFUNG_ERFORDERLICH': { class: 'warning', icon: '⚠️', label: 'Prüfung erforderlich' },
    }[result.nachweisStatus];

    const maxQ = Math.max(result.spitzenabflussRational, result.spitzenabflussPINN);

    return (
        <>
            {/* Status Banner */}
            <div className={`copilot-status-banner ${statusConfig.class}`}>
                <span style={{ fontSize: 24 }}>{statusConfig.icon}</span>
                <span>{statusConfig.label}</span>
                <span className="copilot-din-ref">DIN 1986-100</span>
            </div>

            {/* Metric Cards */}
            <div className="copilot-metrics-grid">
                <MetricCard
                    label="Abflussbeiwert Ψ"
                    value={result.abflussbeiwert.toFixed(3)}
                    sub="gewichtet"
                />
                <MetricCard
                    label="Bemessungsregen"
                    value={`T=${result.bemessungsregenJahre}a`}
                    unit=""
                    sub={`${result.regenspende} mm/hr (r₁₅)`}
                />
                <MetricCard
                    label="Rückhaltevolumen"
                    value={result.rueckhaltevolumen.toFixed(1)}
                    unit="m³"
                    sub="erforderlich"
                />
                <MetricCard
                    label="Spitzenabfluss (Rational)"
                    value={result.spitzenabflussRational.toFixed(1)}
                    unit="L/s"
                />
                <MetricCard
                    label="Spitzenabfluss (Kinematisch)"
                    value={result.spitzenabflussPINN.toFixed(1)}
                    unit="L/s"
                />
                <MetricCard
                    label="Anstiegszeit"
                    value={result.kinematischeWelle.timeToPeak.toFixed(1)}
                    unit="min"
                    sub={`Gleichgewicht: ${result.kinematischeWelle.equilibriumDepth.toFixed(1)} mm`}
                />
            </div>

            {/* Method Comparison */}
            <div className="copilot-comparison">
                <h4>Methodenvergleich — Spitzenabfluss Q</h4>
                <div className="copilot-comparison-row">
                    <span className="copilot-comparison-label">Rational Method</span>
                    <div className="copilot-comparison-bar-track">
                        <div
                            className="copilot-comparison-bar-fill rational"
                            style={{ width: `${(result.spitzenabflussRational / maxQ) * 100}%` }}
                        />
                    </div>
                    <span className="copilot-comparison-value">{result.spitzenabflussRational.toFixed(1)} L/s</span>
                </div>
                <div className="copilot-comparison-row">
                    <span className="copilot-comparison-label">Kinematische Welle</span>
                    <div className="copilot-comparison-bar-track">
                        <div
                            className="copilot-comparison-bar-fill pinn"
                            style={{ width: `${(result.spitzenabflussPINN / maxQ) * 100}%` }}
                        />
                    </div>
                    <span className="copilot-comparison-value">{result.spitzenabflussPINN.toFixed(1)} L/s</span>
                </div>
            </div>

            {/* Recommendations */}
            <div className="copilot-recommendations">
                <h4>Empfehlungen</h4>
                {result.empfehlungen.map((rec, i) => (
                    <div key={i} className="copilot-rec-item">
                        {rec}
                    </div>
                ))}
            </div>

            {/* Export */}
            <button id="export-pdf" className="copilot-btn-export" onClick={onExport}>
                📄 PDF-Entwurf herunterladen
            </button>
        </>
    );
}

// ===== Metric Card =====

function MetricCard({ label, value, unit, sub }: {
    label: string;
    value: string;
    unit?: string;
    sub?: string;
}) {
    return (
        <div className="copilot-metric-card">
            <div className="copilot-metric-label">{label}</div>
            <div className="copilot-metric-value">
                {value}
                {unit && <span className="copilot-metric-unit">{unit}</span>}
            </div>
            {sub && <div className="copilot-metric-sub">{sub}</div>}
        </div>
    );
}
