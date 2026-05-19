/* ActunaMail Tier B startup unlock window (ticket 46b).
 *
 * Pre-boot window shown by application.ts before mailsync spawns when
 * the master-password tier is enabled. Collects the master password (or
 * recovery code) and hands it to the main process, which runs Argon2id
 * and unwraps the DBKey. On success the main process destroys this
 * window and the normal Tier A boot path resumes with a warm key cache.
 */
const { ipcRenderer } = require('electron');

const form = document.getElementById('form');
const secretInput = document.getElementById('secret');
const errorEl = document.getElementById('error');
const submitBtn = document.getElementById('submit');
const modeToggle = document.getElementById('mode-toggle');
const fieldLabel = document.getElementById('field-label');

let recoveryMode = false;
let strings = {
  title: 'Unlock ActunaMail',
  subtitle: 'Enter your master password to open the encrypted database.',
  passwordLabel: 'Master password',
  recoveryLabel: 'Recovery code',
  unlock: 'Unlock',
  unlocking: 'Unlocking…',
  useRecovery: 'Use recovery code',
  usePassword: 'Use master password',
  failed: 'Unlock failed. Please try again.',
};

function applyStrings() {
  document.getElementById('title').textContent = strings.title;
  document.getElementById('subtitle').textContent = strings.subtitle;
  fieldLabel.textContent = recoveryMode ? strings.recoveryLabel : strings.passwordLabel;
  modeToggle.textContent = recoveryMode ? strings.usePassword : strings.useRecovery;
  submitBtn.textContent = strings.unlock;
}

// Pull localized strings from the main process (it owns `localized()`).
ipcRenderer
  .invoke('tier-b-gate-strings')
  .then((s) => {
    if (s) {
      strings = Object.assign(strings, s);
    }
    applyStrings();
  })
  .catch(() => applyStrings());

modeToggle.addEventListener('click', (e) => {
  e.preventDefault();
  recoveryMode = !recoveryMode;
  secretInput.type = recoveryMode ? 'text' : 'password';
  secretInput.value = '';
  errorEl.textContent = '';
  applyStrings();
  secretInput.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = secretInput.value;
  if (!value) {
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = strings.unlocking;
  errorEl.textContent = '';
  const channel = recoveryMode ? 'tier-b-gate-unlock-recovery' : 'tier-b-gate-unlock';
  try {
    const res = await ipcRenderer.invoke(channel, value);
    if (res && res.ok) {
      // The main process destroys this window on success.
      return;
    }
    errorEl.textContent = (res && res.error) || strings.failed;
  } catch (err) {
    errorEl.textContent = strings.failed;
  }
  submitBtn.disabled = false;
  submitBtn.textContent = strings.unlock;
  secretInput.value = '';
  secretInput.focus();
});

secretInput.focus();
