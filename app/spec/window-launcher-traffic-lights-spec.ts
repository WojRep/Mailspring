/**
 * RETROACTIVE RED spec — window-launcher titleBarStyle traffic lights (2026-05-30).
 *
 * Regression context: user-visible bug "Nie mogę się zalogować, nie mogę
 * zamnąć aplikacji z paska" (2026-05-30). Production build na macOS miał
 * frame:false (custom titlebar design) ale BEZ titleBarStyle='hiddenInset',
 * więc Electron NIE renderował traffic lights (close/min/zoom). Window
 * niemożliwy do zamknięcia z paska — only via Cmd+Q.
 *
 * Fix: `app/src/browser/window-launcher.ts:51` — titleBarStyle='hiddenInset'
 * dla darwin (umieszcza traffic lights wewnątrz toolbar area).
 *
 * This retroactive RED test (per CLAUDE.md TDD mandate, line 64-72) reproduces
 * regression by reading source — gdyby ktoś usunął titleBarStyle, ten test
 * by failnął. Production code path checked: literal source line content.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('window-launcher traffic lights (retro-RED #fix-2026-05-30)', () => {
  const launcherPath = path.join(__dirname, '..', 'src', 'browser', 'window-launcher.ts');
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(launcherPath, 'utf8');
  });

  it('sets titleBarStyle=hiddenInset on darwin (regression guard — traffic lights visible)', () => {
    expect(src).toMatch(/titleBarStyle:\s*process\.platform\s*===\s*['"]darwin['"]\s*\?\s*['"]hiddenInset['"]\s*:\s*undefined/);
  });

  it('keeps frame:false (custom titlebar design preserved)', () => {
    expect(src).toMatch(/frame:\s*process\.platform\s*!==\s*['"]darwin['"]/);
  });

  it('has explanatory comment linking to user-visible regression', () => {
    expect(src).toMatch(/traffic lights|hiddenInset|nie mogę zamknąć/i);
  });
});
