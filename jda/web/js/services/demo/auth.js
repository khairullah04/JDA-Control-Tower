// Demo: no Firebase. Starts signed in so you land straight on the dashboard.
let user = { email: 'demo@jda.app' }, listener = () => {};
export const login = async u => { user = { email: (u || 'demo').trim().toLowerCase() + '@jda.app' }; listener(user); };
export const register = login;
export const logout = async () => { user = null; listener(null); };
export const onUser = cb => { listener = cb; setTimeout(() => cb(user)); };
export const usernameOf = u => u.email.split('@')[0];
export const currentUser = () => user;
