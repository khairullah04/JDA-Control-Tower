// A solution's detail page is an ordered list of blocks: { id, type, html } for text blocks, or
// { id, type: 'boxes', items: [{ title, text }] } for a row of boxes. This module is shared by the
// page that shows them (report.js) and the page that edits them (block-editor.js), so what is
// edited and what is published are drawn by the same code.
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const BLOCK_TYPES = [
  { type: 'h1', label: 'Header', placeholder: 'Type a header…' },
  { type: 'h2', label: 'Sub Header', placeholder: 'Type a sub header…' },
  { type: 'h3', label: 'Sub Sub Header', placeholder: 'Type a sub sub header…' },
  { type: 'body', label: 'Body', placeholder: 'Type some text…' },
  { type: 'boxes', label: 'Box row', placeholder: '' }
];
export const isText = type => type !== 'boxes';
export const newId = () => Math.random().toString(36).slice(2, 10);
export const newBlock = type => type === 'boxes'
  ? { id: newId(), type, items: [{ title: '', text: '' }, { title: '', text: '' }, { title: '', text: '' }] }
  : { id: newId(), type, html: '' };

// Blocks normally run down the page at full width. A block given a column (1-3) sits side by side
// with its neighbours instead: each run of consecutive columned blocks forms one band, in which
// blocks sharing a column stack in order. Returns each block's place on a 6-track grid, so two
// columns are halves and three are thirds; rows are shared across the band, which keeps the tops
// of neighbouring columns level.
export const COLUMNS = [{ value: 0, label: 'Full width' }, { value: 1, label: 'Column 1' }, { value: 2, label: 'Column 2' }, { value: 3, label: 'Column 3' }];
const colOf = b => [1, 2, 3].includes(b.col) ? b.col : 0;
export function layout(blocks){
  const places = [];
  let row = 1;
  for (let i = 0; i < blocks.length;){
    if (!colOf(blocks[i])){ places.push({ start: 1, span: 6, row: row++ }); i++; continue; }
    let end = i;
    while (end < blocks.length && colOf(blocks[end])) end++;
    const band = blocks.slice(i, end), count = Math.max(2, ...band.map(colOf)), width = 6 / count, next = {};
    for (const b of band){
      const c = colOf(b), r = next[c] ?? row;
      places.push({ start: (c - 1) * width + 1, span: width, row: r });
      next[c] = r + 1;
    }
    row = Math.max(...Object.values(next));
    i = end;
  }
  return places;
}
export const placeStyle = p => `--blk-col:${p.start} / span ${p.span};--blk-row:${p.row}`;

// Formatting is kept as HTML, but only this much of it: bold, italic, underline, lists, links and
// line breaks. Everything else typed, pasted or stored is reduced to its text. Run on save AND on
// display - the database is writable by more than this editor, so stored HTML is never trusted.
const KEEP = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', UL: 'ul', OL: 'ol', LI: 'li', A: 'a', BR: 'br' };
const BREAKS_AFTER = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
export function cleanHtml(html, { lists = true } = {}){
  const src = document.createElement('template');
  src.innerHTML = String(html ?? '');
  const walk = (node, out) => {
    for (const child of node.childNodes){
      if (child.nodeType === Node.TEXT_NODE){ out.append(child.textContent); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT'].includes(child.tagName)) continue;
      let tag = KEEP[child.tagName];
      if (!lists && ['ul', 'ol', 'li'].includes(tag)) tag = null;
      if (tag === 'a'){
        const href = child.getAttribute('href') || '';
        if (!/^(https?:\/\/|mailto:)/i.test(href)) tag = null;
        else {
          const a = document.createElement('a');
          a.href = href; a.target = '_blank'; a.rel = 'noopener';
          walk(child, a); out.append(a); continue;
        }
      }
      if (tag === 'br'){ out.append(document.createElement('br')); continue; }
      if (tag){ const el = document.createElement(tag); walk(child, el); out.append(el); continue; }
      walk(child, out); // not kept: its text stays, the element goes
      if (BREAKS_AFTER.includes(child.tagName) || (!lists && child.tagName === 'LI')) out.append(document.createElement('br'));
    }
  };
  const out = document.createElement('div');
  walk(src.content, out);
  while (out.lastChild?.nodeName === 'BR') out.lastChild.remove();
  return out.innerHTML;
}
export const textOf = html => Object.assign(document.createElement('div'), { innerHTML: cleanHtml(html).replace(/<br>|<\/li>/g, '\n') }).textContent.trim();

// Blocks ready to store: cleaned, with empty ones dropped.
export function cleanBlocks(blocks){
  return (blocks || []).map(b => {
    if (b.type === 'boxes'){
      const items = (b.items || []).map(x => ({ title: String(x.title || '').trim(), text: String(x.text || '').trim() })).filter(x => x.title || x.text);
      return items.length ? { id: b.id || newId(), type: 'boxes', items, ...(colOf(b) && { col: colOf(b) }) } : null;
    }
    const type = BLOCK_TYPES.some(t => t.type === b.type) ? b.type : 'body';
    const html = cleanHtml(b.html);
    return textOf(html) ? { id: b.id || newId(), type, html, ...(colOf(b) && { col: colOf(b) }) } : null;
  }).filter(Boolean);
}

// Detail pages written before blocks existed are a list of { title, body } boxes: each becomes a
// small heading and a body (a bullet list when the body has several lines).
export function blocksFromBoxes(boxes){
  return boxes.flatMap(box => {
    const rows = box.body.split('\n').map(x => x.trim()).filter(Boolean);
    return [
      box.title && { id: newId(), type: 'h3', html: esc(box.title) },
      rows.length && { id: newId(), type: 'body', html: rows.length > 1 ? `<ul>${rows.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : esc(rows[0]) }
    ].filter(Boolean);
  });
}

// What a new solution's detail page starts as: a short narrative, an overview, a row of scope
// boxes and a row of business outcomes. Whatever is left empty is not published.
export const starterBlocks = () => [
  newBlock('body'),
  { id: newId(), type: 'h2', html: 'Overview' }, newBlock('body'),
  { id: newId(), type: 'h2', html: 'Scope' }, newBlock('boxes'),
  { id: newId(), type: 'h2', html: 'Business outcome' }, { ...newBlock('boxes'), items: [{ title: '', text: '' }, { title: '', text: '' }] }
];

// A whole detail page as published: every block, each in its place.
export const blocksHtml = blocks => { const places = layout(blocks); return blocks.map((b, i) => blockHtml(b, placeStyle(places[i]))).join(''); };

// One block as it appears on the published page.
export function blockHtml(block, style = ''){
  if (block.type === 'boxes') return `<div class="blk blk-boxes" style="${style}">${(block.items || []).map(x => `
    <div class="blk-box"><strong>${esc(x.title)}</strong>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div>`).join('')}</div>`;
  const type = BLOCK_TYPES.some(t => t.type === block.type) ? block.type : 'body';
  return `<div class="blk blk-${type}" style="${style}">${cleanHtml(block.html)}</div>`;
}
