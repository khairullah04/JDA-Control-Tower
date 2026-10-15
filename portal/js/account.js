// Who is signed in, and Sign out, in the top bar of every JDA Control Tower page.
import { auth } from './config/firebase.js';
import { endSession } from '../../shared/session.js';

const name = auth.currentUser?.email?.split('@')[0];
document.getElementById('whoami').textContent = name ? `Signed in as ${name}` : '';
document.getElementById('signOutBtn').onclick = () => endSession(auth);
