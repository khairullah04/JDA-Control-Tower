import { config } from '../../config/index.js';
import { auth } from './firebase.js';

async function call(path, method, body) {
  const res = await fetch(config.apiBase + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((await auth.currentUser?.getIdToken()) || '') },
    body: body && JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI request failed');
  return data;
}
const post = (p, b) => call(p, 'POST', b);

export const chat = (messages, context) => post('/api/chat', { messages, context }).then(r => r.reply);
export const listDriveFiles = () => call('/api/drive/files', 'GET');
// catalog: [{ code, jda, scope }] for every project - lets one invoice be split across several of them.
export const analyzeDriveFile = (fileId, catalog) => post('/api/drive/analyze', { fileId, catalog });
