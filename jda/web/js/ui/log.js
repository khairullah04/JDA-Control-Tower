import { esc } from './dom.js';

export function renderLog(entries) {
  if (!entries || !entries.length) return '<small class="legend">No changes yet.</small>';
  return `<ul class="log-list">${entries.slice(0, 25).map(e =>
    `<li><span class="log-time">${esc(new Date(e.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }))}</span>` +
    `<span class="log-user">${esc(e.by || 'system')}</span>${esc(e.detail)}</li>`
  ).join('')}</ul>`;
}
