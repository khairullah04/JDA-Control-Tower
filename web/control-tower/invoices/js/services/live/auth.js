import { onAuthStateChanged } from '../../../../../shared/vendor/firebase-auth.js';
import { auth } from './firebase.js';
import { endSession } from '../../../../../shared/lib/session.js';

// Signing in happens at /login, for the whole JDA Control Tower. There is no sign-up: an administrator
// creates each account in the Firebase console and adds it to the server's access list.
export const logout = () => endSession(auth);
export const onUser = cb => onAuthStateChanged(auth, cb);
export const usernameOf = user => user.email.split('@')[0];
