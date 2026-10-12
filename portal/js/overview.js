// The Master Page's content as data: how the saved `overview` of a report document combines with a
// JDA's built-in content, and the reverse (what is on the page, in the shape the Editor Page edits
// and saves). No page elements are touched here, so these can be tested on their own.
import { SOLUTION_ICONS } from './config/jda-content.js';
import { blocksFromBoxes } from './blocks.js';
import { esc } from '../../shared/esc.js';

export const FIXED_SECTIONS = ['aspiration', 'project', 'architecture', 'collaborators', 'press'];

// The Master Page content saved in the report document's `overview` field replaces the matching
// parts of this JDA's built-in content. One saved from the Editor Page is marked `complete`: every
// part is exactly as the editor left it, emptied parts included. Without the mark, anything left
// empty keeps the built-in value.
const LOGOS = [[/petronas|carigali/i, 'assets/carigali-logo.png'], [/\bibm\b/i, 'assets/ibm-logo.jpg'], [/tridiagonal/i, 'assets/tridiagonal-logo-cropped.png']];
export const logoFor = name => (LOGOS.find(([re]) => re.test(name)) || [])[1] || '';
export const plainText = html => Object.assign(document.createElement('div'), { innerHTML: html }).textContent;
export const INTROS = [['aspirationIntro', 'aspiration'], ['archIntro', 'architecture'], ['collabIntro', 'collaborators'], ['pressIntro', 'press']];
export function contentFromOverview(ov, baseContent){
  const out = { ...baseContent, extraSections: [], sectionOrder: [...FIXED_SECTIONS] };
  if (!ov) return out;
  const given = v => ov.complete === true ? v != null : (Array.isArray(v) ? v.length > 0 : !!v);
  // The document can be written from outside this page (a feed, an older version), so a part that
  // should be a list and is not is read as an empty one instead of stopping the whole page.
  const list = v => Array.isArray(v) ? v : [], givenList = v => ov.complete === true ? v != null : list(v).length > 0;
  for (const [to, from] of [['eyebrow', 'eyebrow'], ['tagline', 'tagline'], ['sub', 'summary'], ['more', 'more']]) if (given(ov[from])) out[to] = ov[from];
  if (givenList(ov.aspiration)) out.aspiration = list(ov.aspiration);
  if (givenList(ov.solutionGroups)){
    out.solutions = {};
    out.solutionGroups = list(ov.solutionGroups).map((g, gi) => ({
      label: g?.label ?? '',
      cards: list(g?.solutions).map((sol, si) => {
        const key = `s${gi}-${si}`;
        out.solutions[key] = { ...sol, icon: SOLUTION_ICONS[sol?.art] || SOLUTION_ICONS.agentic, img: sol?.art ? `assets/sol-${sol.art}.jpg` : null };
        return { key, tags: list(sol?.tags).map(t => [t?.text, t?.accent]) };
      })
    }));
  }
  if (givenList(ov.collaborators)) out.collaborators = list(ov.collaborators).filter(Boolean).map(p => ({ ...p, alt: p.name, logo: 'logo' in p ? p.logo : logoFor(p.name) }));
  if (ov.press) out.press = {
    img: 'img' in ov.press ? ov.press.img : baseContent.press?.img, alt: baseContent.press?.alt || '',
    text: ov.press.text, more: ov.press.more, href: /^https?:\/\//.test(ov.press.url || '') ? ov.press.url : '', linkText: ov.press.linkText || 'Read the full release →'
  };
  else if (ov.complete === true) out.press = null;
  const intros = ov.intros || {};
  for (const [to, from] of INTROS) if (intros[from]) out[to] = intros[from];
  if (intros.solutions && intros.solutions !== plainText(baseContent.solutionsIntroHtml)) out.solutionsIntroHtml = esc(intros.solutions);
  out.extraSections = list(ov.extraSections).map((s, i) => ({ id: s?.id || `s${i}`, title: s?.title || '', intro: s?.intro || '', cards: list(s?.cards) }));
  // Saved order first; any section it doesn't mention (a new one, or an older save) follows in the built-in order.
  const known = [...FIXED_SECTIONS, ...out.extraSections.map(s => 'x:' + s.id)], saved = list(ov.sectionOrder).filter(k => known.includes(k));
  out.sectionOrder = [...saved, ...known.filter(k => !saved.includes(k))];
  return out;
}

// What is on the page now, in the shape the Editor Page edits and saves.
export function overviewFromContent(c){
  return {
    complete: true,
    eyebrow: c.eyebrow, tagline: c.tagline, summary: c.sub, more: c.more,
    intros: { ...Object.fromEntries(INTROS.map(([from, to]) => [to, c[from]])), solutions: plainText(c.solutionsIntroHtml) },
    aspiration: c.aspiration.map(a => ({ value: a.value, label: a.label, highlight: !!a.highlight })),
    solutionGroups: c.solutionGroups.map(g => ({
      label: g.label,
      solutions: g.cards.map(({ key, tags }) => {
        const s = c.solutions[key];
        return {
          title: s.title, tier: s.tier === 'Tier 1' ? 'Tier 1' : 'Competitive Edge',
          art: s.art !== undefined ? s.art : (s.img !== null && SOLUTION_ICONS[key] ? key : null), // a built-in solution's key is its artwork
          tags: tags.map(([text, accent]) => ({ text, accent: !!accent })),
          blocks: JSON.parse(JSON.stringify(blocksOf(s)))
        };
      })
    })),
    collaborators: c.collaborators.map(p => ({ name: p.name, role: p.role || '', text: p.text || '', more: p.more || '', logo: p.logo || '' })),
    press: c.press ? { text: c.press.text, more: c.press.more || '', url: c.press.href || '', linkText: c.press.linkText || '', img: c.press.img || '' } : null,
    sectionOrder: [...c.sectionOrder],
    extraSections: c.extraSections.map(s => ({ id: s.id, title: s.title, intro: s.intro, cards: s.cards.map(k => ({ title: k.title || '', sub: k.sub || '', text: k.text || '' })) }))
  };
}

// A solution's detail page is a list of boxes, each a header and a body. Solutions written before
// boxes existed (the built-in ones, and what a Drive update returns) carry vision / scope / targets
// / lead instead, which become the default boxes.
export function boxesOf(sol){
  if (Array.isArray(sol.boxes)) return sol.boxes.map(b => ({ title: b.title || '', body: b.body || '' }));
  return [
    { title: 'Vision', body: sol.vision || '' },
    { title: 'Scope', body: (sol.scope || []).join('\n') },
    { title: 'Targets', body: (sol.targets || []).join('\n') },
    { title: 'Delivery lead', body: sol.lead || '' }
  ].filter(b => b.body);
}

// The detail page itself is a list of blocks (js/blocks.js). One saved before blocks existed is
// converted from its boxes each time it is shown, and stored as blocks the next time it is saved.
export const blocksOf = sol => Array.isArray(sol.blocks) ? sol.blocks : blocksFromBoxes(boxesOf(sol));
