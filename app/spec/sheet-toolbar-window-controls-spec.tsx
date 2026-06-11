/**
 * Bug QA 2026-06-11: natywne traffic lights (titleBarStyle hiddenInset, macOS)
 * nakładają się na pierwszy element sheet-toolbara (np. item-back "Inbox"
 * w Preferencjach), bo po wyłączeniu custom kontrolek (fix 2026-05-30)
 * zniknął spacer rezerwujący lewy róg toolbara.
 *
 * Fix: ToolbarWindowControls na darwin renderuje pusty spacer
 * `.toolbar-window-controls--native-spacer` (szerokość z istniejącej klasy
 * .toolbar-window-controls = 72px), ukrywany w fullscreen (native przyciski
 * znikają). Spec source-based — wzorzec toolbar-window-controls-darwin-spec.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('ToolbarWindowControls — spacer pod natywne traffic lights (darwin, QA 2026-06-11)', () => {
  const sheetToolbarPath = path.join(__dirname, '..', 'src', 'sheet-toolbar.tsx');
  const workspaceLessPath = path.join(__dirname, '..', 'static', 'style', 'workspace.less');

  it('render() na darwin zwraca spacer .toolbar-window-controls--native-spacer (rezerwacja 72px)', () => {
    const src = fs.readFileSync(sheetToolbarPath, 'utf8');
    const classMatch = src.match(/class ToolbarWindowControls[\s\S]+?\n\}/);
    expect(classMatch).not.toBeNull();
    const classSrc = classMatch![0];
    // Early return dla darwin ze spacerem — PRZED warunkiem enabled (custom buttons).
    expect(classSrc).toMatch(
      /process\.platform\s*===\s*['"]darwin['"][\s\S]{0,200}toolbar-window-controls--native-spacer/
    );
  });

  it('darwin path NIE renderuje custom przycisków (spacer jest pusty)', () => {
    const src = fs.readFileSync(sheetToolbarPath, 'utf8');
    const classMatch = src.match(/class ToolbarWindowControls[\s\S]+?\n\}/);
    const classSrc = classMatch![0];
    const darwinReturn = classSrc.match(
      /process\.platform\s*===\s*['"]darwin['"][\s\S]{0,300}?return[\s\S]{0,200}?;/
    );
    expect(darwinReturn).not.toBeNull();
    expect(darwinReturn![0]).not.toMatch(/className="close"|className="minimize"|className="maximize"/);
  });

  it('workspace.less: spacer draggable + ukryty w fullscreen (native przyciski znikają)', () => {
    const less = fs.readFileSync(workspaceLessPath, 'utf8');
    expect(less).toMatch(/toolbar-window-controls--native-spacer/);
    // fullscreen → display none (brak martwego 72px gapu, bo native chrome znika)
    expect(less).toMatch(/fullscreen[\s\S]{0,200}toolbar-window-controls--native-spacer[\s\S]{0,100}display:\s*none/);
  });
});
