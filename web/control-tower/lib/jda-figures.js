// The figures the Control Tower shows for a JDA, worked out from its report (Overall and Weekly
// progress) and the Invoice Tracker, with what edit mode wrote over them. No page elements here, so
// these are tested on their own (server/jda-figures.test.mjs).
import { paymentTable, tableTotals, live } from '../invoices/js/finance/core.js';

export const REPORT_STATUS = { green: 'On track', amber: 'At risk', red: 'Delayed' };

// Progress: the average of the projects' % complete (A1), or null when there are no projects.
export function averageProgress(projects) {
  const list = Array.isArray(projects) ? projects : [];
  return list.length ? Math.round(list.reduce((s, p) => s + (Number(p?.pct) || 0), 0) / list.length) : null;
}
// Key updates, newest first (the first is the "latest key update").
export const latestUpdates = updates => (Array.isArray(updates) ? updates : []).filter(u => u?.text).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
export const reportChallenges = report => (Array.isArray(report?.challenges) ? report.challenges : []).map(c => ({ title: c.title, text: c.description, severity: c.severity }));

// Cost from the Invoice Tracker, by JDA name (A8): paid and sanctioned, both with tax (A2), and the
// invoices still pending. Two tracker JDAs with the same name are added together, marked `twice`.
// How a Control Tower JDA and an Invoice Tracker JDA are matched: by name, ignoring case and the
// spaces around it (A8). The cost ring and Invoices & payments both use this.
export const jdaNameKey = name => String(name || '').trim().toLowerCase();

export function costsByName(trackerJdas, fin) {
  const out = {};
  for (const tj of trackerJdas) {
    const mine = r => r.jdaId === tj.id, key = jdaNameKey(tj.name);
    const t = tableTotals(paymentTable(fin.sanctioned.filter(mine), fin.entries.filter(mine)));
    const pending = fin.entries.filter(e => mine(e) && live(e) && e.status === 'pending').length;
    const was = out[key];
    out[key] = was ? { ...was, spentMinor: was.spentMinor + t.actualMinor, sanctionedMinor: was.sanctionedMinor + t.sanctionedMinor, pending: was.pending + pending, twice: true }
      : { trackerId: tj.id, spentMinor: t.actualMinor, sanctionedMinor: t.sanctionedMinor, pending };
  }
  return out;
}

// Paid as a % of sanctioned; paid with nothing sanctioned counts as over.
export function costPercent(cost) {
  if (!cost) return { pct: null, unsanctioned: false };
  const unsanctioned = !(cost.sanctioned > 0) && cost.spent > 0;
  return { pct: cost.sanctioned > 0 ? Math.round(cost.spent / cost.sanctioned * 100) : unsanctioned ? 100 : null, unsanctioned };
}

// Everything the page shows for one JDA. `failed`: the report could not be read. `written`: what edit
// mode saved for it. `costs`: from costsByName. `tagline`: the built-in one, when the report has none.
export function jdaFigures(jda, report, written = {}, costs = null, { failed = false, tagline = '' } = {}) {
  const r = failed ? null : report;
  const projects = Array.isArray(r?.projects) ? r.projects : [];
  const avg = averageProgress(projects), updates = latestUpdates(r?.updates), fromReport = reportChallenges(r);
  const tracked = costs?.[jdaNameKey(jda.name)];
  const dataCost = tracked ? { spent: tracked.spentMinor / 100, sanctioned: tracked.sanctionedMinor / 100 } : null;
  return {
    dataProgress: avg, dataCost, reportChallenges: fromReport, // what the data says, shown in edit mode
    failed, projects: projects.length, status: REPORT_STATUS[r?.overallStatus] ? r.overallStatus : null,
    progress: written.progressOverride ?? avg, progressOverride: written.progressOverride !== null && written.progressOverride !== undefined,
    latest: updates[0] || null, updates: updates.length,
    challenges: written.challenges ?? fromReport, challengesOverride: Array.isArray(written.challenges),
    // Paid can be set by hand; sanctioned always follows the Invoice Tracker's sanctioned amounts (it is the
    // plan, so the ring and the tracker never disagree about it). With no tracker figures, the typed one stands.
    cost: written.costOverride ? { ...written.costOverride, sanctioned: dataCost ? dataCost.sanctioned : written.costOverride.sanctioned, override: true } : dataCost,
    trackerId: tracked?.trackerId, pending: tracked?.pending ?? null, twice: !!tracked?.twice,
    tagline: r?.overview?.tagline || tagline || ''
  };
}
