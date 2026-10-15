// What the Agreement & BRD page can do with a document's link: where it lives (its source), how it can
// be previewed on the page, and how it can be downloaded. Only links to Google Drive / Docs and
// SharePoint can be previewed and downloaded directly; any other https link is opened in a new tab.
const parse = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u : null; } catch { return null; } };
const driveId = u => u.hostname === 'drive.google.com' ? (/\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1] || (u.pathname === '/open' && u.searchParams.get('id')) || '') : '';
const docsFile = u => u.hostname === 'docs.google.com' ? /^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(u.pathname) : null;
const isSharePoint = u => /(^|\.)sharepoint\.com$/i.test(u.hostname);

// Where the document lives, for its card when no source was written.
export function sourceOf(url) {
  const u = parse(url);
  if (!u) return '';
  if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') return 'Google Drive';
  if (isSharePoint(u)) return 'SharePoint';
  if (/(^|\.)(onedrive\.live\.com|1drv\.ms)$/i.test(u.hostname)) return 'OneDrive';
  return u.hostname.replace(/^www\./, '');
}

// An address that shows the document inside the page, or '' when there is none.
export function previewUrl(url, here = globalThis.location?.origin) {
  const u = parse(url);
  if (!u || u.origin === here) return ''; // never this site's own pages: the preview frame would run them as this site
  const id = driveId(u);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  const doc = docsFile(u);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
  if (isSharePoint(u)) { u.searchParams.set('action', 'embedview'); return u.href; }
  if (/\.pdf$/i.test(u.pathname)) return u.href; // the browser's own PDF viewer, if the site allows it
  return '';
}

// An address that downloads the file, or '' when only opening it is possible.
export function downloadUrl(url) {
  const u = parse(url);
  if (!u) return '';
  const id = driveId(u);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  const doc = docsFile(u);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/export${doc[1] === 'spreadsheets' ? '?format=xlsx' : doc[1] === 'presentation' ? '/pptx' : '?format=pdf'}`;
  if (isSharePoint(u)) { u.searchParams.set('download', '1'); return u.href; }
  if (/\.pdf$/i.test(u.pathname)) return u.href;
  return '';
}
