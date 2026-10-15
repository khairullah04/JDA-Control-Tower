import { request } from './http.js';

const post = (path, body) => request(path, { method: 'POST', body });

export const chat = (messages, context) => post('/api/chat', { messages, context }).then(r => r.reply);
export const listDriveFiles = () => request('/api/drive/files');
// catalog: [{ code, jda, scope }] for every project - lets one invoice be split across several of them.
export const analyzeDriveFile = (fileId, catalog) => post('/api/drive/analyze', { fileId, catalog });
