/**
 * DIN 1986-100 PDF Report Generator
 * 
 * Generates professional Überflutungsnachweis draft PDFs using jsPDF.
 * Clearly marked as ENTWURF (draft) — requires engineer stamp for submission.
 */

import jsPDF from 'jspdf';
import { type DIN1986Result } from './din1986Engine';

export function generateDIN1986PDF(result: DIN1986Result, projectName: string): jsPDF {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let y = margin;

    // ===== HEADER =====
    doc.setFillColor(10, 22, 40); // Dark navy
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ÜBERFLUTUNGSNACHWEIS', margin, 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('nach DIN 1986-100 §14.9.2', margin, 28);

    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(`Projekt: ${projectName}`, margin, 36);

    const dateStr = new Date(result.zeitstempel).toLocaleDateString('de-DE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
    });
    doc.text(`Datum: ${dateStr}`, pageWidth - margin - 30, 36);

    // ===== DRAFT WATERMARK =====
    doc.setTextColor(255, 80, 80);
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.saveGraphicsState();
    doc.setGState((doc as any).GState({ opacity: 0.08 }));
    doc.text('ENTWURF', pageWidth / 2, 150, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    y = 55;
    doc.setTextColor(30, 30, 30);

    // ===== SECTION 1: STANDORTDATEN =====
    y = drawSectionHeader(doc, '1. Standortdaten', y, margin, contentWidth);
    y += 2;

    const siteData = [
        ['Grundstücksfläche (gesamt)', `${result.abflusswirksameFlaeche.toFixed(0)} m²`],
        ['Versiegelungsgrad', `${(result.versiegelungsgrad * 100).toFixed(1)} %`],
        ['Abflusswirksame Fläche', `${result.abflusswirksameFlaeche.toFixed(0)} m²`],
        ['Bemessungsregen', `T = ${result.bemessungsregenJahre} a`],
        ['Regenspende (r₁₅)', `${result.regenspende.toFixed(0)} mm/hr`],
    ];

    y = drawDataTable(doc, siteData, y, margin, contentWidth);
    y += 4;

    // Nachweis requirement
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    const wrappedReason = doc.splitTextToSize(result.begruendung, contentWidth);
    doc.text(wrappedReason, margin, y);
    y += wrappedReason.length * 4 + 6;

    // ===== SECTION 2: BERECHNUNGSERGEBNISSE =====
    doc.setTextColor(30, 30, 30);
    y = drawSectionHeader(doc, '2. Berechnungsergebnisse', y, margin, contentWidth);
    y += 2;

    const calcData = [
        ['Abflussbeiwert Ψ (gewichtet)', result.abflussbeiwert.toFixed(3)],
        ['Spitzenabfluss Q (Rational)', `${result.spitzenabflussRational.toFixed(2)} L/s`],
        ['Spitzenabfluss Q (Kinematische Welle)', `${result.spitzenabflussPINN.toFixed(2)} L/s`],
        ['Anstiegszeit', `${result.kinematischeWelle.timeToPeak.toFixed(1)} min`],
        ['Gleichgewichtstiefe', `${result.kinematischeWelle.equilibriumDepth.toFixed(1)} mm`],
        ['Rückhaltevolumen (erf.)', `${result.rueckhaltevolumen.toFixed(1)} m³`],
    ];

    y = drawDataTable(doc, calcData, y, margin, contentWidth);
    y += 4;

    // Method comparison note
    const ratio = result.spitzenabflussPINN / result.spitzenabflussRational;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text(`Verhältnis KW/Rational: ${ratio.toFixed(2)} — ${ratio > 0.5 && ratio < 2.0 ? 'gute Übereinstimmung' : 'Prüfung empfohlen'}`, margin, y);
    y += 8;

    // ===== SECTION 3: ERGEBNIS =====
    doc.setTextColor(30, 30, 30);
    y = drawSectionHeader(doc, '3. Ergebnis', y, margin, contentWidth);
    y += 4;

    // Status badge
    const statusColors: Record<string, [number, number, number]> = {
        'BESTANDEN': [34, 197, 94],
        'NICHT_BESTANDEN': [239, 68, 68],
        'PRUEFUNG_ERFORDERLICH': [245, 158, 11],
    };
    const statusLabels: Record<string, string> = {
        'BESTANDEN': 'NACHWEIS ERBRACHT',
        'NICHT_BESTANDEN': 'NACHWEIS NICHT ERBRACHT',
        'PRUEFUNG_ERFORDERLICH': 'PRÜFUNG ERFORDERLICH',
    };

    const [r, g, b] = statusColors[result.nachweisStatus];
    doc.setFillColor(r, g, b);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(statusLabels[result.nachweisStatus], pageWidth / 2, y + 8, { align: 'center' });
    y += 18;

    // ===== SECTION 4: EMPFEHLUNGEN =====
    doc.setTextColor(30, 30, 30);
    y = drawSectionHeader(doc, '4. Empfehlungen', y, margin, contentWidth);
    y += 2;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    for (const rec of result.empfehlungen) {
        const lines = doc.splitTextToSize(`• ${rec}`, contentWidth - 5);
        doc.text(lines, margin + 3, y);
        y += lines.length * 4 + 2;
    }

    // ===== FOOTER =====
    y = Math.max(y + 10, 240);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.setFont('helvetica', 'italic');

    const disclaimer = [
        'HAFTUNGSAUSSCHLUSS: Dieses Dokument ist ein automatisch erstellter Entwurf.',
        'Es ersetzt nicht die Prüfung und Stempelung durch einen nach §65 BauO Bln',
        'bauvorlageberechtigten Ingenieur. Berechnungen basieren auf vereinfachten',
        'Verfahren (Rational Method + Kinematic Wave) und KOSTRA-DWD 2020 Daten.',
    ];
    for (const line of disclaimer) {
        doc.text(line, margin, y);
        y += 3.5;
    }

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text('Erstellt mit FloodPilot.de — KI-gestützter Co-Pilot für Bauingenieure', margin, y);

    return doc;
}

// ===== Helper Functions =====

function drawSectionHeader(
    doc: jsPDF, title: string, y: number, margin: number, width: number,
): number {
    doc.setFillColor(240, 244, 248);
    doc.rect(margin, y, width, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 22, 40);
    doc.text(title, margin + 3, y + 5.5);
    return y + 10;
}

function drawDataTable(
    doc: jsPDF, data: string[][], y: number, margin: number, width: number,
): number {
    const colSplit = width * 0.6;
    doc.setFontSize(9);

    for (let i = 0; i < data.length; i++) {
        const rowY = y + i * 6;
        if (i % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, rowY - 3.5, width, 6, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(data[i][0], margin + 3, rowY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(10, 22, 40);
        doc.text(data[i][1], margin + colSplit, rowY);
    }

    return y + data.length * 6;
}
