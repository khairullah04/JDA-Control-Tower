import { endSession } from '../../../../../shared/session.js';
// Demo: no Firebase. Starts signed in so the tracker opens straight away.
const user = { email: 'demo@jda.app' };
export const logout = () => endSession();
export const onUser = cb => setTimeout(() => cb(user));
export const usernameOf = u => u.email.split('@')[0];
export const currentUser = () => user;
