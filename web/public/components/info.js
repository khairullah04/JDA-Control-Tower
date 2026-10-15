// A JDA's public Info page: its Master Page, read-only. What is drawn here is all the server sends
// (/api/public/info/<id>); progress, people's names on tasks, figures and internal links never arrive.
// Solution detail pages are drawn by the same code as in the Control Tower (web/shared/components/blocks.js).
import { esc } from '/shared/lib/esc.js';
import { blocksHtml } from '/shared/components/blocks.js';
import { me } from '/shared/lib/session.js';

const $ = id => document.getElementById(id);
const id = location.pathname.split('/')[2] || '';                    // /jda/<id>/info: the server only serves known ids
const decode = v => { try { return decodeURIComponent(v); } catch { return ''; } };
const svg = (paths, size = 19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const more = (key, text) => text ? `<button type="button" class="collab-more-toggle" data-target="${key}" aria-expanded="false" aria-controls="${key}"><span>Read more</span><span class="chev">&#8250;</span></button>
  <div class="collab-more" id="${key}"><p>${esc(text)}</p></div>` : '';
const block = (key, title, intro, body) => `<div class="block" id="ov-${key}"><h3>${esc(title)}</h3>${intro ? `<p class="block-intro">${esc(intro)}</p>` : ''}${body}</div>`;
let info, cards = {}, openedFrom = null;
// Tier names are the programme's own: a line says what they mean when the page uses them.
const tierLegend = c => {
  const tiers = new Set(c.solutionGroups.flatMap(g => g.cards.map(s => s.tier)));
  return tiers.size > 1 ? '<p class="info-legend"><b>Tier 1</b>: the foundation every other solution builds on · <b>Competitive Edge</b>: solutions that set the programme apart</p>' : '';
};

const SECTIONS = {
  aspiration: c => c.aspiration.length ? block('aspiration', 'Winning aspiration', c.aspirationIntro, `
    <div class="aspiration-strip">${c.aspiration.map(a => `<div class="aspiration-chip${a.highlight ? ' highlight' : ''}"><strong>${esc(a.value)}</strong><span>${esc(a.label)}</span></div>`).join('')}</div>
    <div class="aspiration-bar"></div>`) : '',
  project: c => c.solutionGroups.length ? block('project', 'AI technology solutions', c.solutionsIntro, tierLegend(c) + c.solutionGroups.map(g => `
    <div class="sol-group-label">${esc(g.label)}</div>
    <div class="sol-grid">${g.cards.map(s => `
      <div class="sol-card${s.tier === 'Tier 1' ? '' : ' edge'}" data-sol="${esc(s.key)}" role="button" tabindex="0" aria-label="${esc(s.title)}: open its page">
        ${s.img ? `<div class="sol-visual"><img src="${esc(s.img)}" alt="" loading="lazy"></div>` : ''}
        <div class="sol-card-head"><span class="sol-icon">${svg(s.icon)}</span><span class="sol-tier ${s.tier === 'Tier 1' ? 'tier1' : 'edge'}">${esc(s.tier)}</span></div>
        <div class="sol-card-body"><h4>${esc(s.title)}</h4>
          <div class="sol-tags">${s.tags.map(([t, accent]) => accent ? `<span class="sol-tag accent"><i class="dot"></i><span>${esc(t)}</span></span>` : `<span class="sol-tag"><span>${esc(t)}</span></span>`).join('')}</div>
        </div>
      </div>`).join('')}</div>`).join('')) : '',
  collaborators: c => c.collaborators.length ? block('collaborators', 'Collaborators', c.collabIntro, `
    <div class="collab-grid">${c.collaborators.map((p, i) => `
      <div class="collab-card">
        ${p.logo ? `<div class="logo-holder"><img src="${esc(p.logo)}" alt=""></div>` : ''}
        <h4>${esc(p.name)}</h4><div class="collab-role">${esc(p.role)}</div><p>${esc(p.text)}</p>${more(`collabMore${i}`, p.more)}
      </div>`).join('')}</div>`) : '',
  press: c => c.press ? block('press', 'Press release', c.pressIntro, `
    <div class="press-card">
      ${c.press.img ? `<div class="press-visual"><img src="${esc(c.press.img)}" alt="${esc(c.press.alt)}"></div>` : ''}
      <div class="press-body"><p>${esc(c.press.text)}</p>${more('pressMore', c.press.more)}
        ${c.press.href ? `<a href="${esc(c.press.href)}" target="_blank" rel="noopener">${esc(c.press.linkText)}</a>` : ''}</div>
    </div>`) : ''
};
const extra = s => `<div class="block"><h3>${esc(s.title)}</h3>${s.intro ? `<p class="block-intro">${esc(s.intro)}</p>` : ''}
  ${s.cards.length ? `<div class="collab-grid">${s.cards.map(k => `<div class="collab-card"><h4>${esc(k.title)}</h4><div class="collab-role">${esc(k.sub)}</div><p>${esc(k.text)}</p></div>`).join('')}</div>` : ''}</div>`;

function render(c) {
  document.title = `${c.name} · TriCipta AI`;
  $('brandTitle').textContent = c.name;
  $('heroEyebrow').textContent = c.eyebrow;
  $('heroTitle').innerHTML = esc(c.short) + (c.tagline ? `<span class="hero-tagline">${esc(c.tagline)}</span>` : '');
  $('heroSub').textContent = c.sub; $('heroSub').hidden = !c.sub;
  $('heroMoreText').textContent = c.more; $('heroMoreBtn').hidden = !c.more;
  $('footNote').textContent = c.footNote;
  $('allJdas').href = `/?jda=${encodeURIComponent(c.id)}#jdas`;
  $('infoStrip').textContent = `This is the public summary of ${c.name}. Progress, tasks and costs are for employees, in the JDA Control Tower.`;
  $('infoStrip').hidden = false;
  const extras = Object.fromEntries(c.extraSections.map(s => [`x:${s.id}`, s]));
  $('sections').innerHTML = c.sectionOrder.map(k => SECTIONS[k] ? SECTIONS[k](c) : extras[k] ? extra(extras[k]) : '').join('')
    || '<div class="block"><p class="block-intro">More about this JDA is coming soon.</p></div>';
  cards = Object.fromEntries(c.solutionGroups.flatMap(g => g.cards).map(s => [s.key, s]));
}

function screen(which) {
  for (const s of ['screen-overview', 'screen-solution']) $(s).classList.toggle('active', s === which);
  window.scrollTo({ top: 0 });
}
function openSolution(key, push = true) {
  const s = Object.hasOwn(cards, key) ? cards[key] : null;
  if (!s) return screen('screen-overview');
  openedFrom = key;
  $('solDetailIcon').innerHTML = svg(s.icon, 26);
  $('solDetailTier').textContent = s.tier; $('solDetailTier').className = `sol-tier ${s.tier === 'Tier 1' ? 'tier1' : 'edge'}`;
  $('solDetailTitle').textContent = s.title;
  $('solDetailBlocks').innerHTML = s.blocks.length ? blocksHtml(s.blocks) : '<p class="block-intro">More about this solution is coming soon.</p>';
  if (push) history.pushState({ fromOverview: true }, '', `#solution/${encodeURIComponent(key)}`);
  screen('screen-solution');
  $('solDetailTitle').setAttribute('tabindex', '-1'); $('solDetailTitle').focus();
}
// Back on the overview, focus returns to the card that was opened, so a keyboard user keeps their place.
function toOverview() {
  screen('screen-overview');
  const card = openedFrom && [...document.querySelectorAll('.sol-card')].find(c => c.dataset.sol === openedFrom);
  if (card) { card.scrollIntoView({ block: 'center' }); card.focus(); }
}
const route = () => { const m = /^#solution\/(.+)$/.exec(location.hash); m ? openSolution(decode(m[1]), false) : toOverview(); };

function wire() {
  $('sections').addEventListener('click', e => {
    const card = e.target.closest('.sol-card');
    if (card) return openSolution(card.dataset.sol);
    const btn = e.target.closest('.collab-more-toggle');
    if (btn) { const open = $(btn.dataset.target).classList.toggle('open'); btn.setAttribute('aria-expanded', open); btn.querySelector('span').textContent = open ? 'Read less' : 'Read more'; }
  });
  $('sections').addEventListener('keydown', e => {
    const card = e.target.closest('.sol-card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSolution(card.dataset.sol); }
  });
  $('heroMoreBtn').onclick = () => { const open = $('heroMore').classList.toggle('open'); $('heroMoreBtn').setAttribute('aria-expanded', open); $('heroMoreBtn').querySelector('span').textContent = open ? 'Read less' : 'Read more'; };
  // Back goes back in history when the solution was opened from this page, so the browser's Back button agrees.
  $('backBtn').onclick = () => { if (history.state?.fromOverview) history.back(); else { history.replaceState(null, '', location.pathname); toOverview(); } };
  window.addEventListener('popstate', route);
}

try {
  const res = await fetch(`/api/public/info/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  info = await res.json();
  render(info); wire(); route();
  $('loadNote').hidden = true;
} catch (e) {
  $('loadNote').innerHTML = `This page could not be loaded just now (${esc(e.message)}). <a href="">Try again</a> · <a href="/">Back to TriCipta AI</a>`;
}
// Employees go on to this JDA's private pages: straight there when signed in, through sign-in otherwise.
// Signed in, they can also edit this page: it is the JDA's Master Page (there is no private copy).
const report = `/control-tower/${encodeURIComponent(id)}/overall-progress`;
me().then(who => {
  $('fullReport').textContent = who.signedIn ? 'Open in Control Tower' : 'Employee sign-in';
  $('fullReport').href = who.signedIn ? report : `/login?next=${encodeURIComponent(location.pathname)}`;
  if (!who.signedIn || !info) return;
  const edit = Object.assign(document.createElement('button'), { type: 'button', className: 'info-link', id: 'editMasterBtn', textContent: 'Edit Master Page' });
  edit.onclick = async () => {
    edit.disabled = true; edit.textContent = 'Opening…';
    history.replaceState(null, '', location.pathname);
    try {
      if (!(await me()).signedIn) throw Object.assign(new Error('Your sign-in has ended.'), { signIn: true });
      window.removeEventListener('popstate', route); // the read-only screens are replaced by the editor
      const { start } = await import('/control-tower/components/master-edit.js');
      await start({ id, main: $('info-main'), leave: () => location.reload() });
      $('infoStrip').hidden = true;
      edit.remove();
    } catch (e) {
      edit.disabled = false; edit.textContent = 'Edit Master Page';
      window.addEventListener('popstate', route);
      $('infoStrip').innerHTML = e.signIn ? `Your sign-in has ended. <a href="/login?next=${encodeURIComponent(location.pathname)}">Sign in again</a> to edit this page.` : `Edit mode could not open: ${esc(e.message)}`;
      $('infoStrip').hidden = false;
    }
  };
  $('fullReport').before(edit);
  if (location.hash === '#edit') edit.click(); // /jda/<id>/info#edit: straight into edit mode (old Editor Page bookmarks)
});
