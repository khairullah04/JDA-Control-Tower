import { ADMIN_PASSKEY } from '../config/app-config.js';

// Friction-only passkey gate, reused by both the dashboard's Administration panel and a JDA
// report's Edit report panel. Same trade-off as the reference file's own Edit Report screen -
// anyone with dev tools open can read ADMIN_PASSKEY. Not real access control.
export function wireGate({ storageKey, lockedEl, openEl, passkeyInput, msgEl, unlockBtn, onUnlock }) {
  if (sessionStorage.getItem(storageKey) === '1') {
    lockedEl.hidden = true; openEl.hidden = false; onUnlock?.();
    return;
  }
  unlockBtn.onclick = () => {
    if (passkeyInput.value === ADMIN_PASSKEY) {
      sessionStorage.setItem(storageKey, '1');
      lockedEl.hidden = true; openEl.hidden = false;
      onUnlock?.();
    } else {
      msgEl.textContent = 'Wrong passkey.';
    }
  };
  passkeyInput.onkeydown = e => { if (e.key === 'Enter') unlockBtn.click(); };
}
