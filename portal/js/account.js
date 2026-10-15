// Who is signed in, and Sign out, in the top bar of every JDA Control Tower page.
import { auth } from './config/firebase.js';
import { endSession } from '../../shared/session.js';

const name = auth.currentUser?.email?.split('@')[0];
document.getElementById('whoami').textContent = name ? `Signed in as ${name}` : '';
// With unsaved edits on the page (the editor), signing out first asks: afterwards nothing could be saved.
document.getElementById('signOutBtn').onclick = () => {
  if (window.hasUnsavedChanges?.() && !confirm('You have unsaved changes. Sign out anyway and lose them? Press Cancel, then Save changes, to keep them.')) return;
  endSession(auth);
};
