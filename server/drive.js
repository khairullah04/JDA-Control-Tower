import { google } from 'googleapis';
import { userError } from './errors.js';

// Service account key path comes from GOOGLE_APPLICATION_CREDENTIALS in .env
const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
export const drive = google.drive({ version: 'v3', auth });
export const ALL ={ supportsAllDrives: true, includeItemsFromAllDrives: true };
const FILES = "(mimeType='application/pdf' or mimeType='image/png' or mimeType='image/jpeg')";

export const rootId = () => {
  if (!process.env.DRIVE_ROOT_FOLDER_ID) throw userError('Drive is not configured: set DRIVE_ROOT_FOLDER_ID in server/.env');
  return process.env.DRIVE_ROOT_FOLDER_ID;
};

// Every match, a page at a time: an inbox of more than one page was once cut off at the first.
async function list(q) {
  const out = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({ q, fields: 'nextPageToken,files(id,name,mimeType)', pageSize: 200, pageToken, ...ALL });
    out.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

// One shared inbox folder holds every invoice - no per-project subfolders. A single invoice can
// cover several projects, so sorting happens after extraction, not by where the file was dropped.
export async function listInbox() {
  return list(`'${rootId()}' in parents and trashed=false and ${FILES}`);
}

// Only files inside the shared inbox can be read, even if the service account can see other Drive files.
// Still tolerates one level of subfolder nesting, in case older per-project folders are still in use.
export async function fetchInboxFile(fileId) {
  const root = rootId();
  const get = id => drive.files.get({ fileId: id, fields: 'id,mimeType,parents', ...ALL }).then(r => r.data);
  const f = await get(fileId);
  const parent = f.parents?.[0];
  const ok = parent === root || (parent && (await get(parent)).parents?.includes(root));
  if (!ok) throw userError('File is not inside the invoice inbox folder');
  const r = await drive.files.get({ fileId, alt: 'media', ...ALL }, { responseType: 'arraybuffer' });
  return { fileBase64: Buffer.from(r.data).toString('base64'), mediaType: f.mimeType };
}
