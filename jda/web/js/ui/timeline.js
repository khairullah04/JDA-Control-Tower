import { $, esc, rm } from './dom.js';
import { money } from '../finance/money.js';
import { live, isMonth, COUNTS_AS_ACTUAL } from '../finance/core.js';

const LEVELS = ['all', 'month', 'week', 'day']; // zoom in = later in this list
const LABEL = { all: 'All', month: 'Month', week: 'Week', day: 'Day' };
const WIDTH = { month: 76, week: 42, day: 28 };
const GAP = 2; // px between columns; matches .tl-chart's gap
const VIEWS = { bars: 'Bar chart', curve: 'Cumulative spend' };
// Amounts are whole sen. A bar's height is only a share of the tallest one, so plain division is fine there.
let level = 'month'; // sanctioned amounts are set by the month; zoom in for weeks and days
let view = 'bars';
// "All" is the month view with columns narrowed until the whole range fits without scrolling.
const grain = () => level === 'all' ? 'month' : level;

const parse = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const mondayOf = d => addDays(d, -((d.getUTCDay() + 6) % 7));
const monthStart = (d, n = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const fmt = (s, opt) => parse(s).toLocaleString('en-GB', { ...opt, timeZone: 'UTC' });
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

const keyOf = (s, g) => g === 'month' ? s.slice(0, 7) : g === 'week' ? iso(mondayOf(parse(s))) : s;

function buckets(start, end, g) {
  const out = [], last = parse(end);
  let d = g === 'month' ? monthStart(parse(start)) : g === 'week' ? mondayOf(parse(start)) : parse(start);
  while (d <= last) {
    out.push({ key: g === 'month' ? iso(d).slice(0, 7) : iso(d), start: iso(d) });
    d = g === 'month' ? monthStart(d, 1) : addDays(d, g === 'week' ? 7 : 1);
  }
  return out;
}

const titleOf = (b, g) => g === 'month' ? fmt(b.start, { month: 'long', year: 'numeric' })
  : g === 'week' ? 'Week of ' + fmt(b.start, { day: 'numeric', month: 'short', year: 'numeric' })
  : fmt(b.start, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

// `range` is the owning JDA's start/end: the axis always covers it, plus anything dated outside it.
// Sanctioned amounts (with tax) sit on the first day of their month. A paid invoice sits in its
// payment month - on its invoice date when that falls in the month, otherwise on the first - so
// each month here adds up to the same figures as the Payment Table.
export function renderTimeline(root, { project, sanctioned, entries, range }) {
  const sc = sanctioned.filter(s => live(s) && isMonth(s.month)).map(s => ({ ...s, on: `${s.month}-01` }));
  const inv = entries.filter(e => live(e) && e.status === COUNTS_AS_ACTUAL && isMonth(e.month))
    .map(e => ({ ...e, on: okDate(e.documentDate) && e.documentDate.startsWith(e.month) ? e.documentDate : `${e.month}-01` }));
  const today = iso(new Date());
  // The axis runs to the end of the current month at least, so it grows by itself as months pass.
  const thisMonthEnd = iso(addDays(monthStart(parse(today), 1), -1));
  const dates = [range?.start, range?.end, project.startDate, project.endDate, ...sc.map(s => s.on), ...inv.map(i => i.on)].filter(okDate);
  if (!dates.length) { root.innerHTML = '<h3>Sanctioned vs paid over time</h3><small>Set project dates to see the timeline.</small>'; return; }
  dates.push(thisMonthEnd); dates.sort();
  const from = dates[0], to = dates[dates.length - 1];
  const months = buckets(from, to, 'month');

  root.innerHTML = `
    <div class="section-head"><h3>Sanctioned vs paid over time</h3>
      <div class="tl-controls">
        <select id="tl-jump" aria-label="Jump to month">${months.map(m => `<option value="${m.key}">${fmt(m.start, { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
        <div class="seg" id="tl-view">${Object.entries(VIEWS).map(([v, l]) => `<button type="button" data-view="${v}">${esc(l)}</button>`).join('')}</div>
        <div class="seg" id="tl-level">${LEVELS.map(l => `<button type="button" data-level="${l}">${LABEL[l]}</button>`).join('')}</div>
        <button type="button" id="tl-out" aria-label="Zoom out">-</button><button type="button" id="tl-in" aria-label="Zoom in">+</button>
      </div></div>
    <div class="legend"><span class="a">■</span> Sanctioned (w TAX) <span class="b">■</span> Paid · <span id="tl-max"></span> · Ctrl + scroll to zoom · click a bar for details</div>
    <div class="tl-scroll" id="tl-scroll"><div class="tl-chart" id="tl-chart"></div></div>
    <div class="tl-detail" id="tl-detail"></div>`;

  const scroll = $('#tl-scroll', root), chart = $('#tl-chart', root), detail = $('#tl-detail', root);
  let cur = {};

  function draw(focusDate) {
    const list = buckets(from, to, grain());
    cur = Object.fromEntries(list.map(b => [b.key, { ...b, planned: 0, actual: 0, scope: [], inv: [] }]));
    sc.forEach(s => { const b = cur[keyOf(s.on, grain())]; b.planned += s.grossMyrMinor; b.scope.push(s); });
    inv.forEach(i => { const b = cur[keyOf(i.on, grain())]; b.actual += i.grossMyrMinor; b.inv.push(i); });
    let cp = 0, ca = 0;
    list.forEach(({ key }) => { cp += cur[key].planned; ca += cur[key].actual; cur[key].cp = cp; cur[key].ca = ca; });

    const max = Math.max(1, ...list.map(({ key }) => Math.max(cur[key].planned, cur[key].actual)));
    const h = v => v > 0 ? Math.max(v / max * 100, 1.5) : 0;
    const todayKey = keyOf(today, grain());
    let prevMon = '';
    const w = level === 'all' ? Math.max(6, Math.floor((scroll.clientWidth - GAP * (list.length - 1)) / list.length)) : WIDTH[level];
    chart.style.setProperty('--w', w + 'px');
    chart.className = 'tl-chart' + (view === 'curve' ? ' show-curve' : '');
    chart.innerHTML = list.map(({ key }, idx) => {
      const b = cur[key], mon = b.start.slice(0, 7);
      let top = '';
      const newMonth = mon !== prevMon;
      if (newMonth) {
        if (grain() === 'month') { if (b.start.slice(5, 7) === '01' || idx === 0) top = b.start.slice(0, 4); }
        else top = fmt(b.start, { month: 'short', year: '2-digit' });
      }
      prevMon = mon;
      const label = grain() === 'month' ? fmt(b.start, { month: w < 34 ? 'narrow' : 'short' }) : b.start.slice(8);
      const tip = [titleOf(b, grain()), `Sanctioned ${rm(b.planned)} (cumulative ${rm(b.cp)})`, `Paid ${rm(b.actual)} (cumulative ${rm(b.ca)})`].join('\n');
      return `<div class="tl-col ${newMonth && idx ? 'month-start' : ''} ${key === todayKey ? 'today' : ''}" data-key="${key}" data-month="${mon}" data-start="${b.start}" title="${esc(tip)}">
        <span class="tl-top">${esc(top)}</span>
        <div class="tl-pair"><i style="height:${h(b.planned)}%"></i><i class="act" style="height:${h(b.actual)}%"></i></div>
        <small>${label}</small></div>`;
    }).join('');

    // Cumulative-spend overlay: running total of planned vs actual spend to date (not per-period
    // amounts - each point is everything spent up to and including that bar). Shaded area under
    // each line makes the "total money so far" reading unambiguous. Bars stay in the DOM (hidden)
    // so click/hover/zoom/scroll behaviour is identical in both views.
    const maxCum = Math.max(1, ...list.map(({ key }) => Math.max(cur[key].cp, cur[key].ca)));
    const CW = w, CH = 150, SW = list.length * (CW + GAP) - GAP;
    const px = i => i * (CW + GAP) + CW / 2, py = v => CH - (v / maxCum) * CH;
    const line = pick => list.map(({ key }, i) => `${px(i)},${py(pick(cur[key]))}`).join(' ');
    const area = pick => `${px(0)},${CH} ${line(pick)} ${px(list.length - 1)},${CH}`;
    const dotR = Math.max(1.5, Math.min(3, CW * 0.15));
    const dots = (pick, cls) => list.map(({ key }, i) => `<circle cx="${px(i)}" cy="${py(pick(cur[key]))}" r="${dotR}" class="${cls}"/>`).join('');
    chart.insertAdjacentHTML('beforeend',
      `<svg class="tl-curve" viewBox="0 0 ${SW} ${CH}" width="${SW}" height="${CH}" preserveAspectRatio="none">
        <polygon points="${area(b => b.cp)}" class="curve-planned-fill"/>
        <polygon points="${area(b => b.ca)}" class="curve-actual-fill"/>
        <polyline points="${line(b => b.cp)}" class="curve-planned" vector-effect="non-scaling-stroke"/>
        <polyline points="${line(b => b.ca)}" class="curve-actual" vector-effect="non-scaling-stroke"/>
        ${dots(b => b.cp, 'curve-planned-dot')}
        ${dots(b => b.ca, 'curve-actual-dot')}
      </svg>`);

    $('#tl-max', root).textContent = view === 'curve' ? `cumulative total: sanctioned ${rm(cp)}, paid ${rm(ca)}` : `tallest bar ${rm(max)} per ${grain()}`;
    root.querySelectorAll('#tl-level button').forEach(btn => btn.classList.toggle('on', btn.dataset.level === level));
    root.querySelectorAll('#tl-view button').forEach(btn => btn.classList.toggle('on', btn.dataset.view === view));
    detail.innerHTML = '<small class="legend">Click a bar to see what was sanctioned and what was paid.</small>';

    const f = focusDate < from ? from : focusDate > to ? to : focusDate; // keep the view where the user was
    const target = chart.querySelector(`[data-key="${keyOf(f, grain())}"]`) || chart.firstElementChild;
    scroll.scrollLeft = target.offsetLeft - scroll.clientWidth / 2 + target.offsetWidth / 2;
    $('#tl-jump', root).value = f.slice(0, 7);
  }

  const centerDate = () => {
    const mid = scroll.scrollLeft + scroll.clientWidth / 2, cols = [...chart.querySelectorAll('.tl-col')];
    return (cols.find(c => c.offsetLeft + c.offsetWidth >= mid) || cols[cols.length - 1])?.dataset.start || today;
  };
  const zoomTo = l => { if (l !== level) { const f = centerDate(); level = l; draw(f); } };
  const step = d => zoomTo(LEVELS[Math.min(Math.max(LEVELS.indexOf(level) + d, 0), LEVELS.length - 1)]);

  root.querySelectorAll('#tl-level button').forEach(btn => btn.onclick = () => zoomTo(btn.dataset.level));
  root.querySelectorAll('#tl-view button').forEach(btn => btn.onclick = () => { view = btn.dataset.view; draw(centerDate()); });
  $('#tl-in', root).onclick = () => step(1);
  $('#tl-out', root).onclick = () => step(-1);
  scroll.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
  $('#tl-jump', root).onchange = e => {
    const c = chart.querySelector(`[data-month="${e.target.value}"]`);
    if (c) scroll.scrollLeft = c.offsetLeft - 8;
  };

  chart.onclick = e => {
    const col = e.target.closest('.tl-col'); if (!col) return;
    chart.querySelector('.sel')?.classList.remove('sel'); col.classList.add('sel');
    const b = cur[col.dataset.key];
    const li = (arr, f) => arr.length ? `<ul>${arr.map(f).join('')}</ul>` : '<div class="legend">None</div>';
    detail.innerHTML = `<b>${esc(titleOf(b, grain()))}</b>
      <div>Sanctioned (w TAX): ${rm(b.planned)}${li(b.scope, s => `<li>${esc(s.projectCode)} ${esc(s.partner)} ${esc(s.description)} - ${money(s.grossMyrMinor)}</li>`)}</div>
      <div>Paid: ${rm(b.actual)}${li(b.inv, i => `<li>${esc(i.projectCode)} ${esc(i.partner)} ${esc(i.invoiceNo)} - ${esc(money(i.netMinor, i.currency))}, ${money(i.grossMyrMinor)} taxed</li>`)}</div>`;
  };

  draw(today);
}
