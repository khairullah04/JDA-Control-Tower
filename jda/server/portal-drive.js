import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { drive, ALL } from './drive.js';

// The portal's own Drive tree (separate from the invoice inbox):
//
//   <PORTAL_DRIVE_ROOT_FOLDER_ID>/
//     JDA 1/
//       Master File/            home page information
//       Progress/
//         Overall Progress/     projects, status, challenges, S-curve
//           Weekly Progress/    one file per weekly report
//     JDA 2/ ...
//
// Folders are recognised by name, not position, so "Weekly Progress" works whether it sits inside
// "Overall Progress" or beside it under "Progress".
const FOLDER = 'application/vnd.google-apps.folder';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MAX_BYTES = 20 * 1024 * 1024;   // per file; Claude's request limit is 32 MB
const MAX_TEXT = 400_000;             // characters per extracted text file

// Where the JDA folders live. PORTAL_DRIVE_ROOT_FOLDER_ID if set; otherwise a folder named
// "JDA Portal" inside the invoice Drive folder, or failing that the invoice folder itself - so a
// portal tree built inside the already-shared invoice folder needs no setup at all.
export async function portalRootId() {
  if (process.env.PORTAL_DRIVE_ROOT_FOLDER_ID) return process.env.PORTAL_DRIVE_ROOT_FOLDER_ID;
  const invoices = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!invoices) throw new Error('Portal Drive is not configured: set PORTAL_DRIVE_ROOT_FOLDER_ID in server/.env');
  const inside = (await children(invoices)).find(f => f.mimeType === FOLDER && norm(f.name) === 'jdaportal');
  return inside ? inside.id : invoices;
}

async function children(folderId) {
  const out = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`, pageSize: 200, pageToken,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)', ...ALL
    });
    out.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

const kindOfFolder = name => {
  const n = norm(name);
  if (n.includes('master')) return 'master';
  if (n.includes('weekly')) return 'weekly';
  if (n.includes('overall') || n === 'progress') return 'overall';
  return null;
};

// Every file under one JDA's folder, sorted into master / overall / weekly by the nearest folder
// above it that carries one of those names. Files outside all three are reported, not read.
async function jdaFolder(jda) {
  const wanted = [norm(jda.name), norm(jda.id)];
  return (await children(await portalRootId())).find(f => f.mimeType === FOLDER && wanted.includes(norm(f.name)));
}

// The link the Editor Page opens so files can be dropped into this JDA's Master File folder.
export async function masterFolderUrl(jda) {
  const folder = await jdaFolder(jda);
  if (!folder) throw new Error(`No folder named "${jda.name}" in the portal's Drive folder.`);
  const master = (await children(folder.id)).find(f => f.mimeType === FOLDER && kindOfFolder(f.name) === 'master');
  if (!master) throw new Error(`No "Master File" folder inside "${folder.name}" in Drive. Create it, then try again.`);
  return `https://drive.google.com/drive/folders/${master.id}`;
}

export async function listJdaFiles(jda) {
  const folder = await jdaFolder(jda);
  if (!folder) return null;

  const files = { master: [], overall: [], weekly: [], ignored: [] };
  async function walk(id, kind, depth) {
    for (const f of await children(id)) {
      if (f.mimeType === FOLDER) { if (depth < 5) await walk(f.id, kindOfFolder(f.name) || kind, depth + 1); }
      else files[kind || 'ignored'].push(f);
    }
  }
  await walk(folder.id, null, 0);
  for (const list of Object.values(files)) list.sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime));
  return files;
}

const GOOGLE_EXPORT = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation': 'application/pdf'
};
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TEXTS = ['text/plain', 'text/csv', 'text/markdown', 'application/json'];

const cellText = v => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v === 'object' ? String(v.result ?? v.text ?? (v.richText || []).map(r => r.text).join('') ?? '') : String(v);

async function workbookText(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map(ws => {
    const rows = [];
    ws.eachRow(row => rows.push(row.values.slice(1).map(cellText).join('\t').trimEnd()));
    return `--- Sheet: ${ws.name} ---\n${rows.filter(Boolean).join('\n')}`;
  }).join('\n\n');
}

// One Drive file -> the content blocks Claude reads. A file that can't be read is never silently
// dropped or cut short: it throws, and the caller lists it as skipped with the reason.
export async function fileBlocks(f) {
  if (Number(f.size || 0) > MAX_BYTES) throw new Error('larger than 20 MB');
  const exportAs = GOOGLE_EXPORT[f.mimeType];
  const type = exportAs || f.mimeType;
  if (![...IMAGES, ...TEXTS, 'application/pdf', DOCX, XLSX].includes(type)) throw new Error('unsupported file type (use PDF, Word, Excel, Google Docs/Sheets/Slides, an image, or plain text)');
  const res = exportAs
    ? await drive.files.export({ fileId: f.id, mimeType: exportAs }, { responseType: 'arraybuffer' })
    : await drive.files.get({ fileId: f.id, alt: 'media', ...ALL }, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(res.data);
  const label = { type: 'text', text: `FILE: ${f.name} (last modified ${f.modifiedTime.slice(0, 10)})` };

  if (type === 'application/pdf') return [label, { type: 'document', source: { type: 'base64', media_type: type, data: buffer.toString('base64') } }];
  if (IMAGES.includes(type)) return [label, { type: 'image', source: { type: 'base64', media_type: type, data: buffer.toString('base64') } }];

  let text;
  if (type === DOCX) text = (await mammoth.extractRawText({ buffer })).value;
  else if (type === XLSX) text = await workbookText(buffer);
  else text = buffer.toString('utf8');
  if (text.length > MAX_TEXT) throw new Error('too much text to process in one go; split it into smaller files');
  if (!text.trim()) throw new Error('no readable text found');
  return [{ type: 'text', text: `${label.text}\n${text}` }];
}
