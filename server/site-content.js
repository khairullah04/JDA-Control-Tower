import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JDAS } from '../web/shared/config/jdas.js';
import { contentFor, SOLUTION_ICONS } from '../web/control-tower/config/jda-content.js';
import { contentFromOverview } from '../web/shared/lib/overview.js';
import { readReport } from './report-reader.js';
import { assetUrl } from '../web/shared/lib/assets.js';

// What the public site shows, worked out on the server so that nothing else ever reaches a visitor:
// the TriCipta AI landing page (publicSite) and each JDA's Info page (infoPage). Everything a page
// shows is either written in edit mode (saved in site-store.js, starting from the defaults below)
// or derived from the JDA's report; a derived value is marked as such, and a written one wins.

export const STATUSES = ['in-the-works', 'in-progress', 'finished'];
const PERSON = { name: 'Name TBC', title: 'Title TBC' };

// The landing page before anything is written in edit mode. The people and contacts are placeholders.
export const PUBLIC_DEFAULTS = {
  header: { eyebrow: 'Petronas Carigali', title: 'TRICIPTA AI', tagline: "Petronas Carigali's AI delivery arm for Upstream" },
  overview: {
    title: 'Overview', subtitle: 'AI for Upstream, built with partners',
    body: 'TriCipta AI brings artificial intelligence into Upstream operations at Petronas Carigali. It works through Joint Development Agreements with technology partners, each one focused on a part of the business where AI can make a measurable difference: exploration, production, asset integrity and the way work gets done.'
  },
  roles: { title: 'Roles', subtitle: 'Who does what across TriCipta AI and its partners', alt: 'Roles across TriCipta AI and its partners' },
  whatIsJda: {
    title: 'What is a JDA?', subtitle: 'Joint Development Agreement',
    body: 'A Joint Development Agreement is a partnership in which Petronas Carigali and one or more technology partners develop AI solutions together. Petronas Carigali brings its data, business workflows and investment; the partners bring their technology and domain expertise. Each agreement sets out what is built, who leads each part and how the results are shared.'
  },
  existing: { title: 'Existing JDAs', subtitle: 'Each agreement and the work under it' },
  status: { title: 'JDA status', subtitle: 'Where each agreement stands today' },
  // Empty until written in edit mode: the page then shows "To be announced", never a made-up address.
  contacts: { title: 'Contacts', subtitle: 'Get in touch with the TriCipta AI team', email: '', phone: '', address: '', linkedin: '', website: '' },
  news: { title: 'Latest press releases', subtitle: 'News from each Joint Development Agreement' },
  figures: { title: 'TriCipta AI in numbers' },
  footer: { text: 'TriCipta AI · Petronas Carigali' },
  jdas: {}
};
export const JDA_DEFAULTS = () => ({
  title: '', status: '', pressRelease: '', pressDate: '', projects: [], projectCount: null,
  programLeads: [{ ...PERSON }], businessChampions: [{ ...PERSON }, { ...PERSON }]
});

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// The saved page over the defaults, field by field. Only sections and fields the defaults have are
// kept, and only as text: whatever else the stored document holds (who saved it, notes) is never sent.
// `jdas` is kept as it is; publicJda reads only what it knows from it.
export function withDefaults(saved, defaults) {
  const out = structuredClone(defaults);
  if (!isObj(saved)) return out;
  for (const [k, def] of Object.entries(defaults)) {
    const v = saved[k];
    if (k === 'jdas') out.jdas = isObj(v) ? v : {};
    else if (isObj(def) && isObj(v)) for (const f of Object.keys(def)) { if (typeof v[f] === 'string') out[k][f] = v[f]; }
  }
  return out;
}

// The roles picture: web/public/assets/roles.jpg (or .jpeg, .png, .webp), whichever is there. None yet: null, and the page shows a placeholder.
const PUBLIC_DIR = fileURLToPath(new URL('../web/public/assets/', import.meta.url));
export function rolesImage(dir = PUBLIC_DIR) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try { const at = fs.statSync(`${dir}roles.${ext}`); return `/public/assets/roles.${ext}?v=${Math.round(at.mtimeMs)}`; } catch { /* not this one */ }
  }
  return null;
}

const text = v => typeof v === 'string' ? v : '';
const list = v => Array.isArray(v) ? v : [];
const people = list => (Array.isArray(list) ? list : []).filter(isObj).map(p => ({ name: text(p.name), title: text(p.title) }));

// One JDA on the landing page. Written values win; otherwise the title is the Master Page tagline,
// the press release overview is the Master Page press release, and the projects are the names on
// Overall progress (names only, never figures or owners).
export async function publicJda(jda, written = {}) {
  const report = await readReport(jda), c = masterPage(jda, report);
  const e = { ...JDA_DEFAULTS(), ...(isObj(written) ? written : {}) };
  const seen = new Set(), same = n => n.toLowerCase().replace(/[\s\u2010-\u2015-]+/g, ' ').trim(); // "Project 2b - X" and "Project 2b — X" are one
  const derived = {
    title: text(c.tagline),
    pressRelease: text(c.press?.text),
    projects: list(report?.projects).map(p => text(p?.name).trim()).filter(n => n && !seen.has(same(n)) && seen.add(same(n))),
    // how many of its projects are complete: a count only, never which or by how much
    finished: list(report?.projects).filter(p => Number(p?.pct) >= 100).length,
    // the picture of its press release, when it is one of this site's or a web address
    image: asset(c.press?.img)
  };
  const projects = Array.isArray(e.projects) && e.projects.length ? e.projects.map(text).filter(Boolean) : derived.projects;
  const status = STATUSES.includes(e.status) ? e.status : (derived.projects.length ? 'in-progress' : 'in-the-works');
  return {
    id: jda.id, name: jda.name,
    title: text(e.title) || derived.title, pressRelease: text(e.pressRelease) || derived.pressRelease, pressDate: /^\d{4}-\d{2}-\d{2}$/.test(text(e.pressDate)) ? e.pressDate : '',
    projects, status, finished: derived.finished, image: derived.image,
    projectCount: Number.isInteger(e.projectCount) && e.projectCount >= 0 ? e.projectCount : projects.length,
    programLeads: people(e.programLeads), businessChampions: people(e.businessChampions),
    // what the report says, whether or not something is written over it (edit mode shows it beside each field)
    report: { title: derived.title, pressRelease: derived.pressRelease, projects: derived.projects, status: derived.projects.length ? 'in-progress' : 'in-the-works' },
    // which values came from the report rather than edit mode, so edit mode can say so
    derived: { title: !text(e.title) && !!derived.title, pressRelease: !text(e.pressRelease) && !!derived.pressRelease,
      projects: !(Array.isArray(e.projects) && e.projects.length), status: !STATUSES.includes(e.status), projectCount: !Number.isInteger(e.projectCount) }
  };
}

export async function publicSite(store) {
  const content = withDefaults(await store.get('public'), PUBLIC_DEFAULTS);
  const jdas = await Promise.all(JDAS.map(j => publicJda(j, content.jdas?.[j.id])));
  const { jdas: _, ...sections } = content;
  return { ...sections, roles: { ...sections.roles, image: rolesImage() }, jdas };
}

/* ---------- The Info page: a JDA's Master Page, read-only, with only what may be public ---------- */
// Kept: banner, winning aspiration, solutions and their detail pages, collaborators, press release and
// sections added in the editor. Not sent at all: Overall and Weekly progress (projects, owners, %,
// tasks, updates, challenges, S-curve), the architecture diagram, Drive folders, saved versions.
// Pictures and links are only kept when they are an image of this site's or a web address.
const asset = v => {
  const s = text(v).trim();
  if (/^assets\/[\w.-]+$/.test(s)) return assetUrl(s);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
};
const webLink = v => /^https?:\/\/[^\s"'<>]+$/i.test(text(v).trim()) ? text(v).trim() : '';
const plain = html => text(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const ICONS = new Set(Object.values(SOLUTION_ICONS));

// A report's saved Master Page, shaped so that contentFromOverview cannot trip over it: the document is
// also written from outside (a feed, older versions), so a part of the wrong type counts as missing.
function safeOverview(raw) {
  if (!isObj(raw)) return null;
  const ov = structuredClone(raw);
  for (const k of ['aspiration', 'solutionGroups', 'collaborators', 'extraSections', 'sectionOrder']) if (k in ov && !Array.isArray(ov[k])) delete ov[k];
  for (const k of ['eyebrow', 'tagline', 'summary', 'more']) if (k in ov && typeof ov[k] !== 'string') delete ov[k];
  if ('press' in ov && ov.press !== null && !isObj(ov.press)) delete ov.press;
  if (!isObj(ov.intros)) delete ov.intros;
  if (ov.aspiration) ov.aspiration = ov.aspiration.filter(isObj);
  if (ov.collaborators) ov.collaborators = ov.collaborators.filter(isObj);
  if (ov.extraSections) ov.extraSections = ov.extraSections.filter(isObj);
  if (ov.solutionGroups) ov.solutionGroups = ov.solutionGroups.filter(isObj).map(g => ({ ...g, solutions: list(g.solutions).filter(isObj) }));
  delete ov.intros?.solutions; // the one part read through a browser's HTML parser: sent separately, as text
  return ov;
}
const masterPage = (jda, report) => contentFromOverview(safeOverview(report?.overview), contentFor(jda));

// Parts of a detail page that are never published: a "Targets" or "Delivery lead" heading (the built-in
// detail pages have both, and the editor keeps them when it saves) and everything under it, up to the next heading.
const PRIVATE_HEADINGS = /^(targets?|delivery leads?|business targets?)$/i;
const HEADING = ['h1', 'h2', 'h3'];
function publicBlocks(blocks) {
  let skipping = false;
  return blocks.filter(b => {
    if (HEADING.includes(b.type)) skipping = PRIVATE_HEADINGS.test(plain(b.html));
    return !skipping;
  });
}
const COL = v => [1, 2, 3].includes(v) ? v : 0;

export async function infoPage(jda) {
  const report = await readReport(jda), base = contentFor(jda);
  const ov = isObj(report?.overview) ? report.overview : null;
  const solutionsIntro = text(ov?.intros?.solutions) || plain(base.solutionsIntroHtml);
  const c = masterPage(jda, report);
  return {
    id: jda.id, name: jda.name, short: text(c.short), eyebrow: text(c.eyebrow), tagline: text(c.tagline), sub: text(c.sub), more: text(c.more),
    aspirationIntro: text(c.aspirationIntro),
    aspiration: list(c.aspiration).filter(isObj).map(a => ({ value: text(a.value), label: text(a.label), highlight: !!a.highlight })),
    solutionsIntro,
    solutionGroups: list(c.solutionGroups).map(g => ({
      label: text(g.label),
      cards: list(g.cards).map(({ key, tags }) => {
        const s = c.solutions[key] || {};
        const art = /^assets\/sol-([\w-]+)\.jpg$/.exec(text(s.img))?.[1];
        const blocks = Array.isArray(s.blocks) ? s.blocks.filter(isObj) : null;
        return {
          key, title: text(s.title), tier: s.tier === 'Tier 1' ? 'Tier 1' : 'Competitive Edge',
          icon: ICONS.has(s.icon) ? s.icon : SOLUTION_ICONS.agentic,
          // a stock picture only when it exists; built-in solutions are named by their key
          img: s.img === null ? '' : art ? (SOLUTION_ICONS[art] ? assetUrl(`assets/sol-${art}.jpg`) : '') : (asset(s.img) || (SOLUTION_ICONS[key] ? assetUrl(`assets/sol-${key}.jpg`) : '')),
          tags: list(tags).map(t => [text(t?.[0]), !!t?.[1]]),
          // the detail page: its blocks (less the private parts), or the built-in vision and scope
          blocks: blocks ? publicBlocks(blocks.map(b => b.type === 'boxes'
            ? { type: 'boxes', items: list(b.items).filter(isObj).map(x => ({ title: text(x.title), text: text(x.text) })), col: COL(b.col) }
            : { type: HEADING.includes(b.type) || b.type === 'body' ? b.type : 'body', html: text(b.html), col: COL(b.col) }))
            : [s.vision && { type: 'h3', html: 'Vision' }, s.vision && { type: 'body', html: plain(s.vision) },
              list(s.scope).length && { type: 'h3', html: 'Scope' }, list(s.scope).length && { type: 'boxes', items: list(s.scope).map(x => ({ title: '', text: text(x) })) }].filter(Boolean)
        };
      })
    })),
    collabIntro: text(c.collabIntro),
    // the logo's alt text is empty: the name is written right under it
    collaborators: list(c.collaborators).filter(isObj).map(p => ({ name: text(p.name), role: text(p.role), text: text(p.text), more: text(p.more), logo: asset(p.logo) })),
    pressIntro: text(c.pressIntro),
    press: isObj(c.press) ? { img: asset(c.press.img), alt: text(c.press.alt), text: text(c.press.text), more: text(c.press.more), href: webLink(c.press.href), linkText: text(c.press.linkText) || 'Read the full release →' } : null,
    extraSections: list(c.extraSections).map(s => ({ id: text(s.id), title: text(s.title), intro: text(s.intro), cards: list(s.cards).filter(isObj).map(k => ({ title: text(k.title), sub: text(k.sub), text: text(k.text) })) })),
    sectionOrder: list(c.sectionOrder).filter(k => k !== 'architecture'),
    // the built-in note names the private Control Tower; the public page says who runs the programme instead
    footNote: text(c.footNote) && c.footNote !== contentFor({ id: '', name: jda.name }).footNote ? text(c.footNote) : 'A Joint Development Agreement of TriCipta AI, Petronas Carigali.'
  };
}

/* ---------- The JDA Control Tower landing page (private) ---------- */
// What edit mode writes for each JDA there. Progress, the latest key update, challenges and cost are
// worked out on the page from the JDA's report and the Invoice Tracker; a value written here overrides
// one of them and is shown as an override.
export const CT_JDA_DEFAULTS = () => ({
  agreement: [], brd: [],            // links: { label, url }
  keyInsights: [],                    // boxes: { title, text }
  challenges: null,                   // null: the report's challenges; a list: { title, text, severity } written here
  progressOverride: null,             // a percentage, instead of the average of the report's projects
  costOverride: null                  // { spent, sanctioned } in MYR, instead of the Invoice Tracker's figures
});
// A document link: https only, and of a sensible length.
const httpsLink = v => /^https:\/\/[^\s"'<>]+$/i.test(text(v).trim()) ? text(v).trim().slice(0, 2000) : '';
const links = list => (Array.isArray(list) ? list : []).filter(isObj).map(l => ({ label: text(l.label).slice(0, 300), url: httpsLink(l.url) })).filter(l => l.label || l.url);
const boxes = list => (Array.isArray(list) ? list : []).filter(isObj).map(b => ({ title: text(b.title), text: text(b.text), ...(b.severity && { severity: ['low', 'medium', 'high'].includes(b.severity) ? b.severity : 'medium' }) }));
const pct = v => Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;
const myr = v => Number.isFinite(v) && v >= 0 ? v : null;

export async function controlTowerContent(store) {
  const saved = await store.get('controlTower') || {};
  return {
    jdas: Object.fromEntries(JDAS.map(j => {
      const w = { ...CT_JDA_DEFAULTS(), ...(isObj(saved.jdas?.[j.id]) ? saved.jdas[j.id] : {}) };
      const cost = isObj(w.costOverride) && myr(w.costOverride.spent) !== null && myr(w.costOverride.sanctioned) !== null ? { spent: w.costOverride.spent, sanctioned: w.costOverride.sanctioned } : null;
      return [j.id, { agreement: links(w.agreement), brd: links(w.brd), keyInsights: boxes(w.keyInsights), challenges: Array.isArray(w.challenges) ? boxes(w.challenges) : null,
        progressOverride: pct(w.progressOverride), costOverride: cost }];
    })),
    updatedAt: text(saved.updatedAt), updatedBy: text(saved.updatedBy)
  };
}

/* ---------- Edit mode: what a save may store ---------- */
// Whatever a page sends is rebuilt from what the page is known to hold: only known sections and
// fields, as text of a sensible length, so nothing unexpected (or huge) is ever stored or published.
const MAX_TEXT = 6000, MAX_LIST = 50;
const cut = (v, n = MAX_TEXT) => text(v).slice(0, n);
const short = v => cut(v, 300);
const peopleIn = list => (Array.isArray(list) ? list : []).filter(isObj).slice(0, MAX_LIST).map(p => ({ name: short(p.name), title: short(p.title) }));
const wholeOrNull = (v, max) => Number.isInteger(v) && v >= 0 && v <= max ? v : null;

export function cleanPublic(input) {
  const out = {};
  for (const [k, def] of Object.entries(PUBLIC_DEFAULTS)) {
    if (k === 'jdas' || !isObj(def)) continue;
    out[k] = Object.fromEntries(Object.keys(def).map(f => [f, cut(input?.[k]?.[f] ?? def[f])]));
  }
  out.jdas = Object.fromEntries(JDAS.map(j => {
    const w = isObj(input?.jdas?.[j.id]) ? input.jdas[j.id] : {};
    return [j.id, {
      title: short(w.title), status: STATUSES.includes(w.status) ? w.status : '', pressRelease: cut(w.pressRelease), pressDate: /^\d{4}-\d{2}-\d{2}$/.test(text(w.pressDate)) ? w.pressDate : '',
      projects: (Array.isArray(w.projects) ? w.projects : []).map(short).map(p => p.trim()).filter(Boolean).slice(0, MAX_LIST),
      projectCount: wholeOrNull(w.projectCount, 999), programLeads: peopleIn(w.programLeads), businessChampions: peopleIn(w.businessChampions)
    }];
  }));
  return out;
}

export function cleanControlTower(input) {
  return {
    jdas: Object.fromEntries(JDAS.map(j => {
      const w = isObj(input?.jdas?.[j.id]) ? input.jdas[j.id] : {};
      const cost = w.costOverride;
      return [j.id, {
        agreement: links(w.agreement).slice(0, MAX_LIST), brd: links(w.brd).slice(0, MAX_LIST),
        keyInsights: boxes(w.keyInsights).slice(0, MAX_LIST).map(b => ({ title: short(b.title), text: cut(b.text, 2000) })),
        challenges: Array.isArray(w.challenges) ? boxes(w.challenges).slice(0, MAX_LIST).map(b => ({ title: short(b.title), text: cut(b.text, 2000), severity: b.severity || 'medium' })) : null,
        progressOverride: pct(w.progressOverride),
        costOverride: isObj(cost) && myr(cost.spent) !== null && myr(cost.sanctioned) !== null ? { spent: cost.spent, sanctioned: cost.sanctioned } : null
      }];
    }))
  };
}

// A save: the page sends what it edited and the `updatedAt` it started from. If someone else saved in
// between, it is refused (409) unless `force`, so nobody overwrites another person's edit unknowingly.
// The version before each save is kept beside it (`previous`), so one mistaken save can be put back.
// `roles`: 'publish' makes the picture uploaded in this edit the Roles picture, 'remove' takes it away.
export async function savePage(store, page, { content, base = '', force = false, roles = '' } = {}, by = 'unknown', now = new Date().toISOString(), dir = PUBLIC_DIR) {
  const clean = { public: cleanPublic, controlTower: cleanControlTower }[page];
  if (!clean) throw Object.assign(new Error('There is no such page.'), { status: 404 });
  const current = await store.get(page);
  if (force !== true && text(current?.updatedAt) !== text(base)) {
    throw Object.assign(new Error(`${text(current?.updatedBy) || 'Someone'} saved this page after you opened it. Save anyway replaces everything they saved; to keep their changes, copy yours aside, reload and make them again.`), { status: 409 });
  }
  const { previous, ...before } = current || {};
  const saved = await store.put(page, { ...clean(content), updatedAt: now, updatedBy: by, ...(current && { previous: before }) });
  if (page === 'public' && roles === 'publish') publishRolesImage(dir);
  if (page === 'public' && roles === 'remove') removeRolesImage(dir);
  return saved;
}

// What edit mode starts from: what is written (over the defaults), with the stamp a save must quote.
export async function editablePublic(store) {
  const saved = await store.get('public') || {};
  const content = withDefaults(saved, PUBLIC_DEFAULTS);
  // each JDA from what is shown before anything is written (its placeholder people), so edit mode starts from what the public sees
  const jdas = Object.fromEntries(JDAS.map(j => [j.id, { ...JDA_DEFAULTS(), ...(isObj(content.jdas[j.id]) ? content.jdas[j.id] : {}) }]));
  return { content: { ...content, jdas: cleanPublic({ jdas }).jdas }, updatedAt: text(saved.updatedAt), updatedBy: text(saved.updatedBy) };
}

// The Roles picture, uploaded in edit mode: a JPEG, PNG or WebP of up to 8 MB, recognised by its
// first bytes (not by what the browser says it is). It waits, out of public reach, until the page is
// saved (publishRolesImage); Cancel throws it away (discardRolesImage). The picture before is kept as
// roles-previous.*, and every file is written to a temporary name first, then renamed into place.
const KINDS = [['jpg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff], ['png', b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['webp', b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP']];
export const MAX_IMAGE = 8 * 1024 * 1024;
const EXTS = ['jpg', 'jpeg', 'png', 'webp'];
export const PENDING_DIR = fileURLToPath(new URL('./.roles-pending/', import.meta.url));
const findIn = (dir, stem) => EXTS.map(e => `${dir}${stem}.${e}`).find(f => fs.existsSync(f));
const writeAtomic = (file, bytes) => { fs.writeFileSync(`${file}.tmp`, bytes); fs.renameSync(`${file}.tmp`, file); };

export function saveRolesImage(base64, pendingDir = PENDING_DIR) {
  const bytes = Buffer.from(text(base64), 'base64');
  if (!bytes.length) throw Object.assign(new Error('No picture was sent.'), { status: 400 });
  if (bytes.length > MAX_IMAGE) throw Object.assign(new Error('The picture is larger than 8 MB.'), { status: 413 });
  const kind = KINDS.find(([, is]) => is(bytes))?.[0];
  if (!kind) throw Object.assign(new Error('Use a JPEG, PNG or WebP picture.'), { status: 415 });
  fs.mkdirSync(pendingDir, { recursive: true });
  discardRolesImage(pendingDir);
  writeAtomic(`${pendingDir}roles.${kind}`, bytes);
  return { pending: true, kind };
}
export function discardRolesImage(pendingDir = PENDING_DIR) {
  for (const e of EXTS) fs.rmSync(`${pendingDir}roles.${e}`, { force: true });
}
export function publishRolesImage(dir = PUBLIC_DIR, pendingDir = PENDING_DIR) {
  const pending = findIn(pendingDir, 'roles');
  if (!pending) return rolesImage(dir);
  fs.mkdirSync(dir, { recursive: true });
  const ext = pending.split('.').pop(), bytes = fs.readFileSync(pending);
  const old = findIn(dir, 'roles');
  if (old) { for (const e of EXTS) fs.rmSync(`${dir}roles-previous.${e}`, { force: true }); fs.renameSync(old, `${dir}roles-previous.${old.split('.').pop()}`); }
  writeAtomic(`${dir}roles.${ext}`, bytes);
  discardRolesImage(pendingDir);
  return rolesImage(dir);
}
export function removeRolesImage(dir = PUBLIC_DIR) {
  const old = findIn(dir, 'roles');
  if (old) { for (const e of EXTS) fs.rmSync(`${dir}roles-previous.${e}`, { force: true }); fs.renameSync(old, `${dir}roles-previous.${old.split('.').pop()}`); }
}
