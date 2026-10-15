import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JDAS } from '../../portal/js/config/app-config.js';
import { contentFor, SOLUTION_ICONS } from '../../portal/js/config/jda-content.js';
import { contentFromOverview } from '../../portal/js/overview.js';
import { readReport } from './report-reader.js';

// What the public site shows, worked out on the server so that nothing else ever reaches a visitor:
// the TriCipta AI landing page (publicSite) and each JDA's Info page (infoPage). Everything a page
// shows is either written in edit mode (saved in site-store.js, starting from the defaults below)
// or derived from the JDA's report; a derived value is marked as such, and a written one wins.

export const STATUSES = ['in-the-works', 'in-progress', 'finished'];
const PERSON = { name: 'Name TBC', title: 'Title TBC' };

// The landing page before anything is written in edit mode. The people and contacts are placeholders.
export const PUBLIC_DEFAULTS = {
  header: { title: 'TRICIPTA AI', tagline: "Petronas Carigali's AI delivery arm for Upstream" },
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
  contacts: { title: 'Contacts', subtitle: 'Get in touch with the TriCipta AI team', email: 'tricipta-ai@example.com', phone: '+60 3-0000 0000', address: 'Kuala Lumpur, Malaysia (full address TBC)' },
  jdas: {}
};
export const JDA_DEFAULTS = () => ({
  title: '', status: '', pressRelease: '', projects: [], projectCount: null,
  programLeads: [{ ...PERSON }], businessChampions: [{ ...PERSON }, { ...PERSON }]
});

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// The saved page over the defaults: a saved section replaces the default's fields one by one.
export function withDefaults(saved, defaults) {
  const out = structuredClone(defaults);
  if (!isObj(saved)) return out;
  for (const [k, v] of Object.entries(saved)) out[k] = isObj(v) && isObj(out[k]) ? { ...out[k], ...v } : v;
  return out;
}

// The roles picture: site/public/roles.jpg (or .jpeg, .png, .webp), whichever is there. None yet: null, and the page shows a placeholder.
const PUBLIC_DIR = fileURLToPath(new URL('../../site/public/', import.meta.url));
export function rolesImage(dir = PUBLIC_DIR) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try { const at = fs.statSync(`${dir}roles.${ext}`); return `/site/public/roles.${ext}?v=${Math.round(at.mtimeMs)}`; } catch { /* not this one */ }
  }
  return null;
}

const text = v => typeof v === 'string' ? v : '';
const people = list => (Array.isArray(list) ? list : []).filter(isObj).map(p => ({ name: text(p.name), title: text(p.title) }));

// One JDA on the landing page. Written values win; otherwise the title is the Master Page tagline,
// the press release overview is the Master Page press release, and the projects are the names on
// Overall progress (names only, never figures or owners).
export async function publicJda(jda, written = {}) {
  const report = await readReport(jda), base = contentFor(jda), ov = isObj(report?.overview) ? report.overview : {};
  const e = { ...JDA_DEFAULTS(), ...(isObj(written) ? written : {}) };
  const derived = {
    title: text(ov.tagline) || text(base.tagline),
    pressRelease: text(ov.press?.text) || text(base.press?.text),
    projects: (Array.isArray(report?.projects) ? report.projects : []).map(p => text(p?.name).trim()).filter(Boolean)
  };
  const projects = Array.isArray(e.projects) && e.projects.length ? e.projects.map(text).filter(Boolean) : derived.projects;
  const status = STATUSES.includes(e.status) ? e.status : (derived.projects.length ? 'in-progress' : 'in-the-works');
  return {
    id: jda.id, name: jda.name,
    title: text(e.title) || derived.title, pressRelease: text(e.pressRelease) || derived.pressRelease, projects, status,
    projectCount: Number.isInteger(e.projectCount) && e.projectCount >= 0 ? e.projectCount : projects.length,
    programLeads: people(e.programLeads), businessChampions: people(e.businessChampions),
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
  if (/^assets\/[\w./-]+$/.test(s) && !s.includes('..')) return `/site/portal/${s}`;
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
};
const webLink = v => /^https?:\/\/[^\s"'<>]+$/i.test(text(v).trim()) ? text(v).trim() : '';
const plain = html => text(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const ICONS = new Set(Object.values(SOLUTION_ICONS));

export async function infoPage(jda) {
  const report = await readReport(jda), base = contentFor(jda);
  const ov = isObj(report?.overview) ? structuredClone(report.overview) : null;
  // The solutions intro is the one part read through the browser's own HTML parser; here it is plain text.
  const solutionsIntro = text(ov?.intros?.solutions) || plain(base.solutionsIntroHtml);
  if (ov?.intros) delete ov.intros.solutions;
  const c = contentFromOverview(ov, base);
  return {
    id: jda.id, name: jda.name, short: text(c.short), eyebrow: text(c.eyebrow), tagline: text(c.tagline), sub: text(c.sub), more: text(c.more),
    aspirationIntro: text(c.aspirationIntro),
    aspiration: (c.aspiration || []).filter(isObj).map(a => ({ value: text(a.value), label: text(a.label), highlight: !!a.highlight })),
    solutionsIntro,
    solutionGroups: (c.solutionGroups || []).map(g => ({
      label: text(g.label),
      cards: (g.cards || []).map(({ key, tags }) => {
        const s = c.solutions[key] || {};
        const blocks = Array.isArray(s.blocks) ? s.blocks : null;
        return {
          key, title: text(s.title), tier: s.tier === 'Tier 1' ? 'Tier 1' : 'Competitive Edge',
          icon: ICONS.has(s.icon) ? s.icon : SOLUTION_ICONS.agentic,
          img: s.img === null ? '' : (asset(s.img) || (SOLUTION_ICONS[key] ? `/site/portal/assets/sol-${key}.jpg` : '')),
          tags: (tags || []).map(([t, accent]) => [text(t), !!accent]),
          // the detail page: its blocks, or the built-in vision and scope (targets and delivery leads are not published)
          blocks: blocks ? blocks.filter(isObj).map(b => b.type === 'boxes'
            ? { type: 'boxes', items: (b.items || []).filter(isObj).map(x => ({ title: text(x.title), text: text(x.text) })), col: b.col }
            : { type: ['h1', 'h2', 'h3', 'body'].includes(b.type) ? b.type : 'body', html: text(b.html), col: b.col })
            : [s.vision && { type: 'h3', html: 'Vision' }, s.vision && { type: 'body', html: plain(s.vision) },
              s.scope?.length && { type: 'h3', html: 'Scope' }, s.scope?.length && { type: 'boxes', items: s.scope.map(x => ({ title: '', text: text(x) })) }].filter(Boolean)
        };
      })
    })),
    collabIntro: text(c.collabIntro),
    collaborators: (c.collaborators || []).filter(isObj).map(p => ({ name: text(p.name), role: text(p.role), text: text(p.text), more: text(p.more), logo: asset(p.logo) })),
    pressIntro: text(c.pressIntro),
    press: isObj(c.press) ? { img: asset(c.press.img), alt: text(c.press.alt), text: text(c.press.text), more: text(c.press.more), href: webLink(c.press.href), linkText: text(c.press.linkText) || 'Read the full release →' } : null,
    extraSections: (c.extraSections || []).map(s => ({ id: text(s.id), title: text(s.title), intro: text(s.intro), cards: (s.cards || []).filter(isObj).map(k => ({ title: text(k.title), sub: text(k.sub), text: text(k.text) })) })),
    sectionOrder: (c.sectionOrder || []).filter(k => k !== 'architecture'),
    footNote: text(c.footNote)
  };
}
