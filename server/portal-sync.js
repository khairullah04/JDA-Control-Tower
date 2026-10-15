import fs from 'node:fs';
import { ask, parseJson } from './claude.js';
import { listJdaFiles, fileBlocks } from './portal-drive.js';
import { PORTAL_MASTER_SYSTEM, PORTAL_OVERALL_SYSTEM, portalWeeklySystem, PORTAL_ART_KEYS } from './prompts.js';

// Extraction results are kept per set of (file id, modified time), so a sync only pays for Claude
// when something in a folder actually changed.
// Each result is { at: when it was last used, data }. One not used for KEEP_DAYS is dropped, so the
// file does not grow for ever as files in Drive are replaced.
const CACHE_FILE = new URL('./.portal-cache.json', import.meta.url), KEEP_DAYS = 60, PROMPT_VERSION = 'v2';
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* first run */ }
export function pruned(all, now = Date.now()) {
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v && typeof v.at === 'number' && 'data' in v ? v : { at: now, data: v }]) // results saved before this are dated today
    .filter(([, v]) => now - v.at < KEEP_DAYS * 864e5));
}
const saveCache = () => { cache = pruned(cache); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); };

const str = v => typeof v === 'string' ? v.trim() : '';
const num = v => Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(Math.max(Math.round(Number(v)), 0), 100) : null;
const oneOf = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const list = v => Array.isArray(v) ? v : [];
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
const RAG = ['green', 'amber', 'red'];

// Files -> one Claude call -> parsed JSON. Unreadable files are returned in `skipped` with the reason.
async function extract(kind, files, system, ask_, extraKey = '') {
  const blocks = [], used = [], skipped = [];
  for (const f of files) {
    try { blocks.push(...await fileBlocks(f)); used.push(f); }
    catch (e) { skipped.push(`${f.name}: ${e.message}`); }
  }
  if (!used.length) return { data: null, used, skipped };
  // PROMPT_VERSION: files read with an older prompt are read again (v2: the richer task fields).
  const key = `${PROMPT_VERSION}|${kind}|${extraKey}|${used.map(f => `${f.id}@${f.modifiedTime}`).join(',')}`;
  cache = pruned(cache);
  if (!cache[key]) {
    const text = await ask({ system, maxTokens: 16000, messages: [{ role: 'user', content: [...blocks, { type: 'text', text: ask_ }] }] });
    cache[key] = { at: Date.now(), data: parseJson(text) };
  } else cache[key].at = Date.now();
  saveCache();
  return { data: cache[key].data, used, skipped };
}

const cleanOverview = d => ({
  eyebrow: str(d.eyebrow), tagline: str(d.tagline), summary: str(d.summary), more: str(d.more),
  aspiration: list(d.aspiration).slice(0, 5).map(a => ({ value: str(a.value), label: str(a.label), highlight: a.highlight === true })).filter(a => a.value),
  solutionGroups: list(d.solutionGroups).map(g => ({
    label: str(g.label),
    solutions: list(g.solutions).map(s => ({
      title: str(s.title), tier: oneOf(s.tier, ['Tier 1', 'Competitive Edge'], 'Tier 1'), art: oneOf(s.art, PORTAL_ART_KEYS, null),
      tags: list(s.tags).slice(0, 3).map(t => ({ text: str(t.text), accent: t.accent === true })).filter(t => t.text),
      vision: str(s.vision), scope: list(s.scope).map(str).filter(Boolean), targets: list(s.targets).map(str).filter(Boolean), lead: str(s.lead)
    })).filter(s => s.title)
  })).filter(g => g.solutions.length),
  collaborators: list(d.collaborators).map(c => ({ name: str(c.name), role: str(c.role), text: str(c.text), more: str(c.more) })).filter(c => c.name),
  press: d.press && str(d.press.text)
    ? { text: str(d.press.text), more: str(d.press.more), url: /^https?:\/\//.test(str(d.press.url)) ? str(d.press.url) : '', linkText: str(d.press.linkText) }
    : null
});

const cleanProject = p => ({
  name: str(p.name), owner: str(p.owner), pct: num(p.pct) ?? 0, status: oneOf(p.status, RAG, 'green'), description: str(p.description),
  ...(num(p.taiPct) != null && { taiPct: num(p.taiPct) }), ...(num(p.ibmPct) != null && { ibmPct: num(p.ibmPct) })
});

function cleanScurve(s) {
  const months = list(s?.months).map(str);
  if (!months.length || !/^\d{4}-\d{2}$/.test(s.startMonth || '') || list(s.planned).length !== months.length) return null;
  const actual = list(s.actual).map(num);
  return { startMonth: s.startMonth, months, planned: s.planned.map(v => num(v) ?? 0), actual: months.map((_, i) => actual[i] ?? null) };
}

// One JDA's Drive folder -> the fields for its report document. `scope` picks the half to read:
// 'master' (the Master File folder -> `overview`, which the Editor Page loads as a draft) or
// 'progress' (Overall + Weekly Progress, which Edit report saves). Only sections that have files
// are returned, so an empty folder never wipes what is already on the page.
export async function syncJda(jda, { scope, currentProjects = [] } = {}) {
  const files = await listJdaFiles(jda);
  if (!files) return { found: false };
  const patch = {}, skipped = files.ignored.map(f => `${f.name}: not inside a Master File, Overall Progress or Weekly Progress folder`);
  const counts = { master: 0, overall: 0, weekly: 0 };

  if (scope === 'master' && files.master.length) {
    const r = await extract('master', files.master, PORTAL_MASTER_SYSTEM, `Fill in the home page for ${jda.name} from the files above.`);
    skipped.push(...r.skipped); counts.master = r.used.length;
    if (r.data) patch.overview = cleanOverview(r.data);
  }

  let projects = list(currentProjects), overallNewest = '';
  if (scope === 'progress' && files.overall.length) {
    const r = await extract('overall', files.overall, PORTAL_OVERALL_SYSTEM, `Report the current overall progress of ${jda.name} from the files above.`);
    skipped.push(...r.skipped); counts.overall = r.used.length;
    if (r.data) {
      projects = list(r.data.projects).map(cleanProject).filter(p => p.name);
      overallNewest = r.used[r.used.length - 1].modifiedTime;
      patch.projects = projects;
      patch.challenges = list(r.data.challenges).map(c => ({ severity: oneOf(c.severity, ['high', 'medium', 'low'], 'medium'), title: str(c.title), description: str(c.description), mitigation: str(c.mitigation) })).filter(c => c.title);
      if (RAG.includes(r.data.overallStatus)) patch.overallStatus = r.data.overallStatus;
      const scurve = cleanScurve(r.data.scurve);
      if (scurve) patch.scurve = scurve;
    }
  }

  // Each weekly file is its own report. The latest week sets the week label, the task list and any
  // newer percent-complete figures; key updates accumulate across every week's file.
  const names = projects.map(p => p.name), weeks = [];
  for (const f of scope === 'progress' ? files.weekly : []) {
    try {
      const r = await extract('weekly', [f], portalWeeklySystem(names), `Extract this weekly report for ${jda.name}.`, names.join('|'));
      skipped.push(...r.skipped);
      if (r.data) weeks.push({ file: f, data: r.data, date: isoDate(r.data.weekDate) || f.modifiedTime.slice(0, 10) });
    } catch (e) { skipped.push(`${f.name}: ${e.message}`); }
  }
  counts.weekly = weeks.length;
  if (weeks.length) {
    weeks.sort((a, b) => a.date.localeCompare(b.date));
    const latest = weeks[weeks.length - 1];
    patch.weekLabel = str(latest.data.weekLabel) || `Week of ${latest.date}`;
    patch.tasks = list(latest.data.tasks).map(t => ({
      task: str(t.task), project: names.includes(t.project) ? t.project : '', owner: str(t.owner), due: isoDate(t.due),
      status: oneOf(t.status, ['Not started', 'In progress', 'Done'], 'Not started'),
      // the richer task fields, when the report states them (web/shared/lib/progress.js reads any that are missing as blank)
      description: str(t.description), priority: oneOf(t.priority, ['High', 'Medium', 'Low', ''], ''), start: isoDate(t.start), completed: isoDate(t.completed),
      progress: num(t.progress),
      checklist: list(t.checklist).map(c => ({ text: str(c?.text), done: !!c?.done })).filter(c => c.text), notes: str(t.notes)
    })).filter(t => t.task);
    const seen = new Set();
    patch.updates = weeks.flatMap(w => list(w.data.updates).map(u => ({ date: isoDate(u.date) || w.date, text: str(u.text) })))
      .filter(u => u.text && !seen.has(u.date + u.text) && seen.add(u.date + u.text))
      .sort((a, b) => b.date.localeCompare(a.date));

    // A weekly report written after the overall files carries the fresher percentages.
    const progress = list(latest.data.projectProgress).filter(p => names.includes(p.name) && num(p.pct) != null);
    if (progress.length && latest.file.modifiedTime > overallNewest) {
      patch.projects = projects.map(p => {
        const u = progress.find(x => x.name === p.name);
        return u ? { ...p, pct: num(u.pct), status: oneOf(u.status, RAG, p.status) } : p;
      });
    }
  }

  if (scope === 'progress' && Object.keys(patch).length) patch.driveSync = { at: new Date().toISOString(), ...counts };
  return { found: true, patch, counts, skipped };
}
