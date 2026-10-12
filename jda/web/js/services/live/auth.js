import { signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from '../../../../../shared/vendor/firebase-auth.js';
import { auth } from './firebase.js';
import { config } from '../../config/index.js';

// Firebase Auth requires an email, so the username is mapped to a hidden one. There is no sign-up here:
// an administrator creates each account in the Firebase console and adds it to the server's access list.
const toEmail = u => `${u.trim().toLowerCase()}@${config.usernameDomain}`;
const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/i;

function check(u) { if (!USERNAME_RE.test(u.trim())) throw new Error('Username: 3-20 letters, numbers, . _ -'); }
export const login = (u, p) => { check(u); return signInWithEmailAndPassword(auth, toEmail(u), p); };
export const logout = () => signOut(auth);
export const onUser = cb => onAuthStateChanged(auth, cb);
export const usernameOf = user => user.email.split('@')[0];
