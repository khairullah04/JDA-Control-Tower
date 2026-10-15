import { config } from '../config/index.js';
export const { chat, listDriveFiles, analyzeDriveFile } =
  config.demoMode ? await import('./demo/ai.js') : await import('./live/ai.js');
