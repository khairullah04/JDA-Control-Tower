import { config } from '../config/index.js';

export const $ = (s, r = document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rm = n => 'RM ' + Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 });
export const pct = n => Math.round((n || 0) * 100) + '%';
// Spend as a share of budget, drawn like the portal's progress bars: track, gradient fill and a mono % label.
export const spendBar = ratio => `<div class="spend-row"><div class="progress-track tall${ratio > 1 ? ' over' : ''}"><div class="progress-fill" style="width:${Math.min((ratio || 0) * 100, 100)}%"></div></div><div class="project-pct">${pct(ratio)}</div></div>`;
// A JDA's own start/end dates set how far its timelines reach. JDAs created before dates were
// required have none, so they take the configured defaults.
export const jdaRange = jda => ({ start: jda?.startDate || config.defaultJdaStart, end: jda?.endDate || config.defaultJdaEnd });
export const JDA_DATE_FIELDS = jda => [
  { name: 'startDate', label: 'Start date', type: 'date', value: jda ? jdaRange(jda).start : '' },
  { name: 'endDate', label: 'End date', type: 'date', value: jda ? jdaRange(jda).end : '' }
];
export function checkDates({ startDate, endDate }) {
  if (endDate < startDate) throw new Error('End date must be on or after the start date.');
}
export const monthName = iso => new Date(iso).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
