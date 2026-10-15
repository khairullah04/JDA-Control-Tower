// Where each address of the old single JDA page (jda-report.html#/<jda>/...) leads now: its Master
// Page (read or edited) is the JDA's public Info page; its progress screens have addresses of their own.
import { JDAS } from '../../shared/config/jdas.js';

export function newAddress(hash, search = '') {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch { return ''; } });
  const id = JDAS.some(j => j.id === parts[0]) ? parts.shift() : new URLSearchParams(search).get('jda');
  if (!JDAS.some(j => j.id === id)) return '/control-tower/';
  const page = (which, extra = '') => `/control-tower/${id}/${which}-progress${extra}`;
  const [a, b] = parts;
  if (a === 'progress') return page('overall');
  if (a === 'weekly') return page('weekly');
  if (a === 'project' && b) return page('overall', `#project/${encodeURIComponent(b)}`);
  if (a === 'edit' && b === 'progress') return page('overall', '#edit');
  if (a === 'edit' && b === 'weekly') return page('weekly', '#edit');
  if (a === 'solution' && b) return `/jda/${id}/info#solution/${encodeURIComponent(b)}`;
  return `/jda/${id}/info`; // the Master Page, read or edited
}
