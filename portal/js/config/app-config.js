// `source` says where a JDA's report document lives. Left out, it is jdaReports/<id> in the portal's
// own Firebase project. JDA 3 keeps reading and writing the original JDA3 report document, so the
// Excel -> Power Automate sync that feeds it carries on working.
// `icon` is the JDA's own edit icon on its Master Page (the inside of a 24x24 stroked SVG); give
// each JDA a different one. Its passkey is not here: see jda/server/portal-passkeys.json.
export const JDAS = [
  { id: 'jda1', name: 'JDA 1', icon: '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>' },
  { id: 'jda2', name: 'JDA 2', icon: '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5L12 2.5Z"/><circle cx="12" cy="12" r="3"/>' },
  { id: 'jda3', name: 'JDA 3', icon: '<circle cx="12" cy="12" r="9.5"/><path d="M5.5 12h3l2-4.5 3 9 2-4.5h3"/>', source: { project: 'jda3', collection: 'report', doc: 'current' } },
  { id: 'jda4', name: 'JDA 4', icon: '<circle cx="12" cy="12" r="9.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>' }
];
// A JDA added without an icon gets this pencil.
export const DEFAULT_JDA_ICON = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';

// Where the existing Invoice Tracker is hosted/served from - edit this to match your setup
// (e.g. a relative path if deployed alongside, or a full https:// URL if hosted separately).
export const INVOICE_TRACKER_URL = '/tracker/';

// Gates Administration on the portal main page only. Friction, not security: anyone who opens dev
// tools can read this. Each JDA's editing passkey is checked by the server instead, and lives in
// jda/server/portal-passkeys.json.
export const ADMIN_PASSKEY = '12345';

// Microsoft Calendar sync (Edit report). See the reference SETUP.md, section 5, for the Azure AD
// app registration that produces a real client ID. Needs the page served over http(s).
export const MS_CLIENT_ID = 'YOUR_AZURE_AD_CLIENT_ID';
export const MS_AUTHORITY = 'https://login.microsoftonline.com/organizations';

// The JDA server (jda/server): checks each JDA's passkey, reads Drive and runs Claude for the
// "Update from Google Drive" buttons on the Editor Page and Edit report.
// Empty = the same address this page is served from (the usual setup: the server serves the portal).
export const SYNC_API_URL = '';
