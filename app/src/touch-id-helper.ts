/**
 * Ticket #41 — Touch ID / biometric unlock helper.
 *
 * Cienka warstwa nad `systemPreferences.canPromptTouchID` /
 * `promptTouchID` w main procesie, z fallback'ami dla:
 *   - non-darwin platform (Windows/Linux) — `canUseTouchID` zwraca false
 *   - dev/unsigned build — prompt może nie pokazać się prawidłowo;
 *     wywołanie rzuca a caller fallback'uje do password prompt
 *   - `@electron/remote` route gdy called from renderer
 *
 * Phase 2 ticketu wymaga signed build (Apple Developer Program, #07)
 * dla pełnego E2E Touch ID flow. Bez signed cert prompt może
 * wyświetlić się błędnie lub system go odmówić — caller MUSI handle
 * thrown error i fallback'ować na password prompt.
 *
 * Ten plik jest **process-agnostic** (działa w main i renderer).
 * NIE importuje Electron — wszystkie wywołania przez `_getSystemPreferences()`.
 */

/** Internal: lazy-resolve systemPreferences dla każdego context'u. */
function _getSystemPreferences(): typeof Electron.systemPreferences | null {
  try {
    if (typeof process !== 'undefined' && process.type === 'browser') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('electron').systemPreferences;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@electron/remote').systemPreferences;
  } catch (err) {
    return null;
  }
}

/**
 * Sprawdza czy platform wspiera Touch ID prompt (macOS + Touch ID
 * hardware + nie blocked policy). Synchroniczne — bezpieczne do użycia
 * w UI render path.
 *
 * @returns true gdy systemPreferences.canPromptTouchID() === true.
 *          false dla non-darwin, brak hardware, locked-out, lub failure.
 */
export function canUseTouchID(): boolean {
  if (process.platform !== 'darwin') return false;
  const prefs = _getSystemPreferences();
  if (!prefs) return false;
  try {
    return typeof prefs.canPromptTouchID === 'function' && prefs.canPromptTouchID();
  } catch (err) {
    return false;
  }
}

/**
 * Prompt user do uwierzytelnienia odciskiem palca. Resolved gdy
 * autoryzacja sukces; rejected gdy user anulował / TimedOut / hardware
 * failure / unsigned build.
 *
 * @param reason — zlokalizowany komunikat (PL/EN) wyświetlany pod
 *   ikoną odcisku. Standard macOS HIG: "ActunaMail wants to unlock…"
 *   lub równoważne.
 */
export async function promptTouchID(reason: string): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('Touch ID is only supported on macOS.');
  }
  const prefs = _getSystemPreferences();
  if (!prefs || typeof prefs.promptTouchID !== 'function') {
    throw new Error('Touch ID API is not available in this Electron build.');
  }
  await prefs.promptTouchID(reason);
}
