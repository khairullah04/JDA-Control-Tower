import { config } from '../config/index.js';
export const { logout, onUser, usernameOf } =
  config.demoMode ? await import('./demo/auth.js') : await import('./live/auth.js');
