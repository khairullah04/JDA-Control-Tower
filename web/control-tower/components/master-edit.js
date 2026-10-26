// A JDA's Master Page in edit mode, on its public Info page (/jda/<id>/info). There is no private copy
// of the Master Page: the Info page is it. For people signed in, the Info page's "Edit Master Page"
// loads this module (private, served only to them), which swaps the read-only page for the editable
// one (master-page.html), drawn from the JDA's report document as stored, not the public summary.
// Saving goes to the JDA server (/api/portal/save), which checks the sign-in again.
import { assetUrl } from '../../shared/lib/assets.js';
import { getDoc } from '../../shared/vendor/firebase-firestore.js';
import { JDAS } from '../../shared/config/jdas.js';
import { portalApi } from '../../shared/lib/portal-api.js';
import { isConfigured, reportRefFor } from '../../shared/lib/firebase.js';
import { contentFor, SOLUTION_ICONS } from '../config/jda-content.js';
import { startEditor } from './editor.js';
import { logoFor, contentFromOverview, overviewFromContent, blocksOf } from '../../shared/lib/overview.js';
import { esc } from '../../shared/lib/esc.js';
import { digest } from '../../shared/lib/digest.js';

const $ = id => document.getElementById(id);
const isImageSrc = v => /^(https?:\/\/|\/|assets\/|data:image\/)/i.test(String(v || '').trim());
const empty = () => '<p class="detail-tasks-empty">Not added yet.</p>';

// `main`: the Info page's <main>, whose content is replaced while editing. `leave`: back to the
// read-only page (it reloads, so it shows what is saved).
export async function start({ id, main, leave }) {
  const jda = JDAS.find(j => j.id === id);
  if (!jda) throw new Error('Unknown JDA.');
  if (!isConfigured(jda)) throw new Error("This JDA's database is not set up, so its Master Page cannot be edited.");
  const [html, snap] = await Promise.all([
    fetch('/control-tower/master-page.html').then(r => { if (!r.ok || r.redirected) throw new Error('Sign in again to edit.'); return r.text(); }),
    getDoc(reportRefFor(jda))
  ]);
  const stored = snap.exists() ? snap.data() : {};
  const base = contentFor(jda);
  let c = contentFromOverview(stored.overview, base);
  // A save is refused if someone else changed the Master Page since it was loaded here; saving again overwrites, knowingly.
  let loaded = { overview: digest(stored.overview), overviewBackup: digest(stored.overviewBackup) }, overwrite = false;
  const api = (path, body = {}) => portalApi(path, { jda: { id: jda.id, name: jda.name }, ...body });
  async function saveDraft(patch, remove = []) {
    const fields = [...Object.keys(patch), ...remove];
    try { await api('save', { patch, remove, base: Object.fromEntries(fields.map(k => [k, loaded[k]])), force: overwrite }); }
    catch (e) { if (e.status === 409) overwrite = true; throw e; }
    overwrite = false;
    for (const k of fields) loaded[k] = digest(patch[k]);
  }

  main.innerHTML = html;
  main.querySelectorAll('.reveal').forEach(n => n.classList.add('in'));
  document.body.classList.add('editing');
  const showScreen = screen => { main.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === screen)); scrollTo({ top: 0 }); };

  let editor;
  function render() {
    $('heroEyebrow').textContent = c.eyebrow;
    $('heroTitle').innerHTML = `${esc(c.short)}<span class="hero-tagline">${esc(c.tagline)}</span>`;
    $('heroSub').textContent = c.sub; $('heroSub').hidden = false;
    $('heroMoreText').textContent = c.more; $('heroMore').classList.add('open');

    $('aspirationIntro').textContent = c.aspirationIntro;
    $('aspirationBody').innerHTML = c.aspiration.length ? `
      <div class="aspiration-strip">${c.aspiration.map(a => `
        <div class="aspiration-chip${a.highlight ? ' highlight' : ''}"><strong>${esc(a.value)}</strong><span>${esc(a.label)}</span></div>`).join('')}
      </div>
      <div class="aspiration-bar"></div>` : empty();

    $('solutionsIntro').innerHTML = c.solutionsIntroHtml;
    $('solutionsBody').innerHTML = c.solutionGroups.length ? c.solutionGroups.map(g => `
      <div class="sol-group-label">${esc(g.label)}</div>
      <div class="sol-grid">${g.cards.map(({ key, tags }) => {
        const s = c.solutions[key], tier1 = s.tier === 'Tier 1';
        return `
        <div class="sol-card${tier1 ? '' : ' edge'}" data-sol="${key}">
          ${s.img === null ? '' : `<div class="sol-visual"><img src="${esc(assetUrl(s.img || `assets/sol-${key}.jpg`))}" alt="" onerror="this.closest('.sol-visual').style.display='none'"></div>`}
          <div class="sol-card-head">
            <span class="sol-icon"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span>
            <span class="sol-tier ${tier1 ? 'tier1' : 'edge'}">${esc(s.tier)}</span>
          </div>
          <div class="sol-card-body">
            <h4>${esc(s.title)}</h4>
            <div class="sol-tags">${tags.map(([text, accent]) => accent
              ? `<span class="sol-tag accent"><i class="dot"></i><span>${esc(text)}</span></span>`
              : `<span class="sol-tag"><span>${esc(text)}</span></span>`).join('')}</div>
          </div>
        </div>`; }).join('')}
      </div>`).join('') : empty();

    $('collabIntro').textContent = c.collabIntro;
    $('collabBody').innerHTML = c.collaborators.length ? `
      <div class="collab-grid">${c.collaborators.map((p, i) => `
        <div class="collab-card">
          ${p.logo ? `<div class="logo-holder"><img src="${esc(assetUrl(p.logo))}" alt="${esc(p.alt)}"></div>` : ''}
          <h4>${esc(p.name)}</h4>
          <div class="collab-role">${esc(p.role)}</div>
          <p>${esc(p.text)}</p>
          <div class="collab-more open" id="collabMore${i}"><p>${esc(p.more)}</p></div>
        </div>`).join('')}
      </div>` : empty();

    $('pressIntro').textContent = c.pressIntro;
    const pr = c.press;
    $('pressBody').innerHTML = pr ? `
      <div class="press-card">
        ${isImageSrc(pr.img) ? `<div class="press-visual"><img src="${esc(assetUrl(pr.img))}" alt="${esc(pr.alt)}"></div>` : ''}
        <div class="press-body">
          <p>${esc(pr.text)}</p>
          <div class="collab-more open" id="pressMore"><p>${esc(pr.more)}</p></div>
          <a href="${esc(pr.href)}" target="_blank" rel="noopener">${esc(pr.linkText)}</a>
        </div>
      </div>` : empty();

    // Sections added in edit mode: a heading, an intro and a row of cards.
    main.querySelectorAll('#screen-overview > .extra-block').forEach(n => n.remove());
    $('extraSections').innerHTML = c.extraSections.map(sec => `
      <div class="block reveal in extra-block" data-key="x:${esc(sec.id)}">
        <h3>${esc(sec.title)}</h3>
        <p class="block-intro">${esc(sec.intro)}</p>
        ${sec.cards.length ? `<div class="collab-grid">${sec.cards.map(card => `
          <div class="collab-card"><h4>${esc(card.title)}</h4><div class="collab-role">${esc(card.sub)}</div><p>${esc(card.text)}</p></div>`).join('')}
        </div>` : ''}
      </div>`).join('');
    // The sections in their saved order.
    const anchor = $('extraSections'), extras = Object.fromEntries([...anchor.children].map(n => [n.dataset.key, n]));
    c.sectionOrder.forEach((key, i) => {
      const node = extras[key] || $(`ov-${key}`);
      if (!node) return;
      anchor.before(node);
      node.style.marginTop = i === 0 ? '0' : '';
    });
    editor?.decorate();
  }

  render();
  editor = startEditor({
    mode: 'master', jda, api, logoFor, blocksOf, showScreen,
    iconFor: art => SOLUTION_ICONS[art] || SOLUTION_ICONS.agentic,
    artKeys: Object.keys(SOLUTION_ICONS),
    leave,
    draft: overviewFromContent(c),
    sectionOrder: () => c.sectionOrder.filter(k => k !== 'architecture'), // the architecture section is gone: moving a section never steps over it
    show(overview) { c = contentFromOverview(overview, base); render(); },
    // `overview` is replaced whole (so parts removed here are gone). The first time a page stored in the
    // older (pre-block) shape is saved over, that version is kept as `overviewBackup`.
    save(overview) {
      const old = stored.overview;
      const backup = old && !stored.overviewBackup && !JSON.stringify(old).includes('"blocks"');
      return saveDraft(backup ? { overview, overviewBackup: old } : { overview }).then(() => { stored.overview = overview; if (backup) stored.overviewBackup = old; });
    },
  });
  $('editorHeading').focus?.();
}
