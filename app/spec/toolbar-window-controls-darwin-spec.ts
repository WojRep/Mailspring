/**
 * RED spec — ToolbarWindowControls darwin double-render guard (2026-05-30).
 *
 * Regression context: po fix titleBarStyle='hiddenInset' (window-launcher.ts:51)
 * Electron renderuje native traffic lights (red/yellow/green). Pre-existing
 * ToolbarWindowControls.render() ALSO rendered custom buttons na darwin →
 * podwójna ikona w pasku okna (user-visible bug screenshot 2026-05-30).
 *
 * Fix: sheet-toolbar.tsx — remove `process.platform === 'darwin'` z enabled
 * condition. macOS NIE renderuje custom; native window chrome wystarczy.
 *
 * Test (source-based, regression guard): zapewnia że enabled condition NIE
 * wraca do uwzględniania darwin.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('ToolbarWindowControls darwin double-render guard (regression 2026-05-30)', () => {
  const sheetToolbarPath = path.join(__dirname, '..', 'src', 'sheet-toolbar.tsx');
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(sheetToolbarPath, 'utf8');
  });

  it('ToolbarWindowControls NIE enabled na darwin (uses native via titleBarStyle)', () => {
    // Wyodrębniamy fragment ToolbarWindowControls.render() i sprawdzamy
    // że nie zawiera "process.platform === 'darwin'" jako warunek enable.
    const classMatch = src.match(/class ToolbarWindowControls[\s\S]+?\n\}/);
    expect(classMatch).not.toBeNull();
    const classSrc = classMatch![0];
    // enabled condition NIE może mieć darwin (powoduje double-render).
    const renderMatch = classSrc.match(/const enabled =[\s\S]+?\n\s*\n/);
    expect(renderMatch).not.toBeNull();
    const enabledExpr = renderMatch![0];
    expect(enabledExpr).not.toMatch(/process\.platform\s*===\s*['"]darwin['"]/);
  });

  it('window-launcher.ts ZACHOWUJE titleBarStyle=hiddenInset (source-of-truth dla native traffic lights na darwin)', () => {
    const launcher = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'browser', 'window-launcher.ts'),
      'utf8'
    );
    expect(launcher).toMatch(/titleBarStyle:\s*process\.platform\s*===\s*['"]darwin['"]\s*\?\s*['"]hiddenInset['"]/);
  });
});
