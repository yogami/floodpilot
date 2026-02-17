/**
 * FloodPilot E2E Tests
 * 
 * Comprehensive test suite covering:
 * - Page load & initial state
 * - Happy paths (form input → calculation → results)
 * - Edge cases (boundary values, extreme inputs)
 * - UI interactions (soil type selection, threshold indicator)
 * - PDF export
 * - Responsive behavior
 */

import { test, expect } from '@playwright/test';

// ============================================================
// 1. PAGE LOAD & INITIAL STATE
// ============================================================

test.describe('Page Load & Initial State', () => {
    test('loads the FloodPilot page with correct title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/FloodPilot/);
    });

    test('displays FloodPilot logo and DIN badge', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.copilot-logo-text')).toContainText('Flood');
        await expect(page.locator('.copilot-badge')).toContainText('DIN 1986-100');
    });

    test('shows all input fields with German labels', async ({ page }) => {
        await page.goto('/');

        // Site data section
        await expect(page.locator('.copilot-section-title:has-text("Standortdaten")').first()).toBeVisible();
        await expect(page.locator('text=Projektname')).toBeVisible();
        await expect(page.locator('text=Grundstücksfläche')).toBeVisible();
        await expect(page.locator('text=Versiegelte Fläche')).toBeVisible();

        // Geotechnik section
        await expect(page.locator('.copilot-section-title:has-text("Geotechnik")')).toBeVisible();
        await expect(page.locator('label:has-text("Bodenart")')).toBeVisible();
        await expect(page.locator('label:has-text("Geländeneigung")')).toBeVisible();
        await expect(page.locator('label:has-text("Fließweglänge")')).toBeVisible();
        await expect(page.locator('label:has-text("Manning-Rauheitsbeiwert")')).toBeVisible();
    });

    test('displays default values in input fields', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#total-area')).toHaveValue('2000');
        await expect(page.locator('#impervious-area')).toHaveValue('1400');
        await expect(page.locator('#slope')).toHaveValue('2');
        await expect(page.locator('#flow-length')).toHaveValue('50');
        await expect(page.locator('#manning-n')).toHaveValue('0.015');
    });

    test('shows empty state in results panel', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.copilot-results-empty')).toBeVisible();
        await expect(page.locator('text=Standortdaten eingeben')).toBeVisible();
    });

    test('shows calculate button', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#calculate-btn')).toBeVisible();
        await expect(page.locator('#calculate-btn')).toContainText('Überflutungsnachweis berechnen');
    });

    test('shows threshold indicator for default values (1400 > 800 m²)', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.copilot-threshold.required')).toBeVisible();
        await expect(page.locator('.copilot-threshold')).toContainText('Überflutungsnachweis erforderlich');
        await expect(page.locator('.copilot-threshold')).toContainText('§14.9.2');
    });

    test('shows Versiegelungsgrad and T=100a for default 70% impervious', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('text=Versiegelungsgrad: 70%')).toBeVisible();
        await expect(page.locator('text=T=100a')).toBeVisible();
    });
});

// ============================================================
// 2. HAPPY PATH: STANDARD CALCULATION
// ============================================================

test.describe('Happy Path: Standard Calculation', () => {
    test('calculates results with default values', async ({ page }) => {
        await page.goto('/');

        await page.locator('#calculate-btn').click();

        // Results should appear
        await expect(page.locator('.copilot-results-empty')).not.toBeVisible();

        // Status banner should be visible
        await expect(page.locator('.copilot-status-banner')).toBeVisible();

        // Metric cards should show values
        await expect(page.locator('.copilot-metric-card')).toHaveCount(6);

        // Method comparison should be visible
        await expect(page.locator('text=Methodenvergleich')).toBeVisible();

        // Recommendations should be visible
        await expect(page.locator('text=Empfehlungen')).toBeVisible();

        // PDF export button should appear
        await expect(page.locator('#export-pdf')).toBeVisible();
    });

    test('shows correct metric labels after calculation', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-metric-label:has-text("Abflussbeiwert")')).toBeVisible();
        await expect(page.locator('.copilot-metric-label:has-text("Bemessungsregen")')).toBeVisible();
        await expect(page.locator('.copilot-metric-label:has-text("Rückhaltevolumen")')).toBeVisible();
        await expect(page.locator('.copilot-metric-label:has-text("Spitzenabfluss (Rational)")')).toBeVisible();
        await expect(page.locator('.copilot-metric-label:has-text("Spitzenabfluss (Kinematisch)")')).toBeVisible();
        await expect(page.locator('.copilot-metric-label:has-text("Anstiegszeit")')).toBeVisible();
    });

    test('shows numeric values in metric cards (not NaN or undefined)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
            expect(text).not.toContain('undefined');
            expect(text).not.toBe('');
        }
    });

    test('shows comparison bars for both methods', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-comparison-bar-fill.rational')).toBeVisible();
        await expect(page.locator('.copilot-comparison-bar-fill.pinn')).toBeVisible();
    });

    test('displays T=100a for default 70% impervious area', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-metric-value:has-text("T=100a")')).toBeVisible();
    });

    test('includes engineer disclaimer in recommendations', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-recommendations')).toContainText('Bauvorlageberechtigten');
    });
});

// ============================================================
// 3. HAPPY PATH: CUSTOM INPUT
// ============================================================

test.describe('Happy Path: Custom Input Values', () => {
    test('calculates with custom project name and area values', async ({ page }) => {
        await page.goto('/');

        // Fill in project name
        await page.locator('#project-name').fill('Testprojekt Mitte');

        // Change areas
        await page.locator('#total-area').fill('5000');
        await page.locator('#impervious-area').fill('2500');

        // Calculate
        await page.locator('#calculate-btn').click();

        // With 50% impervious, should use T=30a
        await expect(page.locator('.copilot-metric-value:has-text("T=30a")')).toBeVisible();

        // Should still show results
        await expect(page.locator('.copilot-metric-card')).toHaveCount(6);
    });

    test('updates threshold indicator when impervious area changes to ≤ 800', async ({ page }) => {
        await page.goto('/');

        await page.locator('#impervious-area').fill('600');

        // Threshold should switch to not-required
        await expect(page.locator('.copilot-threshold.not-required')).toBeVisible();
        await expect(page.locator('.copilot-threshold')).toContainText('Vereinfachtes Verfahren ausreichend');
    });

    test('selects T=30a for < 70% impervious rate', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('3000');
        await page.locator('#impervious-area').fill('1500'); // 50%

        await expect(page.locator('text=Versiegelungsgrad: 50%')).toBeVisible();
        await expect(page.locator('.copilot-section-title:has-text("T=30a")')).toBeVisible();
    });

    test('selects T=100a for ≥ 70% impervious rate', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('2000');
        await page.locator('#impervious-area').fill('1600'); // 80%

        await expect(page.locator('text=Versiegelungsgrad: 80%')).toBeVisible();
        await expect(page.locator('.copilot-section-title:has-text("T=100a")')).toBeVisible();
    });

    test('changes soil type via dropdown', async ({ page }) => {
        await page.goto('/');

        await page.locator('#soil-type').selectOption('TM');
        await expect(page.locator('#soil-type')).toHaveValue('TM');

        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('changes slope and Manning n values', async ({ page }) => {
        await page.goto('/');

        await page.locator('#slope').fill('5.5');
        await page.locator('#manning-n').fill('0.03');

        await page.locator('#calculate-btn').click();

        // Should still produce valid results
        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
        }
    });
});

// ============================================================
// 4. EDGE CASES: BOUNDARY VALUES
// ============================================================

test.describe('Edge Cases: Boundary Values', () => {
    test('handles impervious area exactly at 800 m² (no Nachweis required)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#impervious-area').fill('800');

        await expect(page.locator('.copilot-threshold.not-required')).toBeVisible();

        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('handles impervious area at 801 m² (Nachweis required)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#impervious-area').fill('801');

        await expect(page.locator('.copilot-threshold.required')).toBeVisible();
    });

    test('handles impervious area exactly at 70% (T=100a threshold)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('1000');
        await page.locator('#impervious-area').fill('700'); // exactly 70%

        await expect(page.locator('text=Versiegelungsgrad: 70%')).toBeVisible();
        await expect(page.locator('.copilot-section-title:has-text("T=100a")')).toBeVisible();
    });

    test('handles impervious area at 69% (T=30a)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('10000');
        await page.locator('#impervious-area').fill('6900'); // 69%

        await expect(page.locator('text=Versiegelungsgrad: 69%')).toBeVisible();
        await expect(page.locator('.copilot-section-title:has-text("T=30a")')).toBeVisible();
    });

    test('handles very small site (100 m²)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('100');
        await page.locator('#impervious-area').fill('50');

        await page.locator('#calculate-btn').click();

        // Should still produce results without errors
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
        }
    });

    test('handles very large site (100000 m²)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('100000');
        await page.locator('#impervious-area').fill('80000');

        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-status-banner')).toBeVisible();
        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
            expect(text).not.toContain('Infinity');
        }
    });

    test('handles minimum slope (0.1%)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#slope').fill('0.1');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-status-banner')).toBeVisible();
        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
        }
    });

    test('handles steep slope (20%)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#slope').fill('20');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('handles minimum Manning n (0.01)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#manning-n').fill('0.01');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('handles maximum Manning n (0.1)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#manning-n').fill('0.1');
        await page.locator('#calculate-btn').click();

        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });
});

// ============================================================
// 5. EDGE CASES: ZERO AND NEAR-ZERO VALUES
// ============================================================

test.describe('Edge Cases: Zero & Special Values', () => {
    test('handles zero impervious area gracefully', async ({ page }) => {
        await page.goto('/');

        await page.locator('#impervious-area').fill('0');

        await expect(page.locator('.copilot-threshold.not-required')).toBeVisible();

        await page.locator('#calculate-btn').click();

        // Should still render without crash
        const values = page.locator('.copilot-metric-value');
        const count = await values.count();
        for (let i = 0; i < count; i++) {
            const text = await values.nth(i).textContent();
            expect(text).not.toContain('NaN');
        }
    });

    test('handles impervious area equal to total area (100% sealed)', async ({ page }) => {
        await page.goto('/');

        await page.locator('#total-area').fill('2000');
        await page.locator('#impervious-area').fill('2000');

        await expect(page.locator('text=Versiegelungsgrad: 100%')).toBeVisible();

        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('handles very short flow length (1 m)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#flow-length').fill('1');
        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });

    test('handles very long flow length (1000 m)', async ({ page }) => {
        await page.goto('/');
        await page.locator('#flow-length').fill('1000');
        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });
});

// ============================================================
// 6. ALL SOIL TYPES
// ============================================================

test.describe('Soil Type Selection', () => {
    const soilTypes = [
        { value: 'GW', label: 'Kies, gut abgestuft' },
        { value: 'GI', label: 'Kies, intermittierend' },
        { value: 'SE', label: 'Sand, eng gestuft' },
        { value: 'SU', label: 'Sand, schluffig' },
        { value: 'TL', label: 'Ton, leicht plastisch' },
        { value: 'TM', label: 'Ton, mittel plastisch' },
    ];

    for (const soil of soilTypes) {
        test(`calculates correctly with soil type ${soil.value} (${soil.label})`, async ({ page }) => {
            await page.goto('/');

            await page.locator('#soil-type').selectOption(soil.value);
            await page.locator('#calculate-btn').click();

            // Should produce valid results
            await expect(page.locator('.copilot-status-banner')).toBeVisible();
            const values = page.locator('.copilot-metric-value');
            const count = await values.count();
            for (let i = 0; i < count; i++) {
                const text = await values.nth(i).textContent();
                expect(text).not.toContain('NaN');
            }
        });
    }
});

// ============================================================
// 7. PDF EXPORT
// ============================================================

test.describe('PDF Export', () => {
    test('PDF export button triggers download', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        // Wait for results to render
        await expect(page.locator('#export-pdf')).toBeVisible();
        await expect(page.locator('#export-pdf')).toContainText('PDF-Entwurf herunterladen');

        // Listen for download event
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#export-pdf').click();
        const download = await downloadPromise;

        // Verify download filename
        expect(download.suggestedFilename()).toContain('Ueberflutungsnachweis');
        expect(download.suggestedFilename()).toContain('.pdf');
    });

    test('PDF export with custom project name includes name in filename', async ({ page }) => {
        await page.goto('/');
        await page.locator('#project-name').fill('MeinProjekt');
        await page.locator('#calculate-btn').click();

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#export-pdf').click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toContain('MeinProjekt');
    });
});

// ============================================================
// 8. RECALCULATION
// ============================================================

test.describe('Recalculation', () => {
    test('recalculates when inputs change and button is pressed again', async ({ page }) => {
        await page.goto('/');

        // First calculation
        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
        const firstValue = await page.locator('.copilot-metric-value').first().textContent();

        // Change slope dramatically
        await page.locator('#slope').fill('15');
        await page.locator('#calculate-btn').click();

        // Results should update  
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
        // Verify UI is still intact after recalculation
        await expect(page.locator('.copilot-metric-card')).toHaveCount(6);
    });

    test('switching from above to below threshold updates UI correctly', async ({ page }) => {
        await page.goto('/');

        // Start with default (1400 > 800) — required
        await expect(page.locator('.copilot-threshold.required')).toBeVisible();

        // Calculate with above threshold
        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();

        // Switch to below threshold
        await page.locator('#impervious-area').fill('500');
        await expect(page.locator('.copilot-threshold.not-required')).toBeVisible();

        // Recalculate
        await page.locator('#calculate-btn').click();
        await expect(page.locator('.copilot-status-banner')).toBeVisible();
    });
});

// ============================================================
// 9. RESPONSIVENESS & VISUAL
// ============================================================

test.describe('Visual & Layout', () => {
    test('page has dark background', async ({ page }) => {
        await page.goto('/');

        const bg = await page.locator('.copilot-root').evaluate(el => {
            return window.getComputedStyle(el).backgroundColor;
        });

        // Should be a dark color (low RGB values)
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const [, r, g, b] = match.map(Number);
            expect(r).toBeLessThan(50);
            expect(g).toBeLessThan(50);
            expect(b).toBeLessThan(80);
        }
    });

    test('metric cards use monospace font for values', async ({ page }) => {
        await page.goto('/');
        await page.locator('#calculate-btn').click();

        const fontFamily = await page.locator('.copilot-metric-value').first().evaluate(el => {
            return window.getComputedStyle(el).fontFamily;
        });

        expect(fontFamily.toLowerCase()).toContain('jetbrains');
    });
});
