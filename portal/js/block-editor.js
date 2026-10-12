// The full-page block editor for one solution's detail page (the #screen-blocks screen of the
// Editor Page). Blocks are typed directly on a canvas drawn in the published styles, so the canvas
// is the preview. Reordering uses SortableJS (mouse and touch), loaded only when the editor opens.
import { BLOCK_TYPES, COLUMNS, isText, newId, newBlock, cleanBlocks, cleanHtml, textOf, layout, placeStyle } from './blocks.js';

const $ = id => document.getElementById(id);
const SORTABLE_URL = new URL('../../shared/vendor/Sortable.min.js', import.meta.url).href; // kept in the repository, not fetched from a CDN
let sortableLoading;
const loadSortable = () => sortableLoading ??= new Promise((resolve, reject) => {
  if (window.Sortable) return resolve();
  const s = document.createElement('script');
  s.src = SORTABLE_URL; s.onload = resolve;
  s.onerror = () => { sortableLoading = null; reject(new Error('The drag-and-drop library could not be loaded. Blocks can still be moved with the up and down buttons.')); };
  document.head.append(s);
});

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function button(label, title, onClick, cls = ''){
  const b = el('button', `blk-btn ${cls}`, label);
  b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = onClick;
  return b;
}
// A delete that asks first: the first click arms it, the second (within a few seconds) deletes.
function confirmButton(label, title, onConfirm){
  const b = button(label, title, () => {
    if (b.dataset.armed){ onConfirm(); return; }
    b.dataset.armed = '1'; b.textContent = 'Click again to delete'; b.classList.add('armed');
    setTimeout(() => { delete b.dataset.armed; b.textContent = label; b.classList.remove('armed'); }, 4000);
  }, 'danger');
  return b;
}

export function setupBlockEditor(){
  let blocks = [], session = null, dirty = false, sortable = null, lastRange = null;
  const canvas = $('blkCanvas');
  const setStatus = (text, color) => { $('blkStatus').textContent = text; $('blkStatus').style.color = color || 'var(--muted)'; };
  function touched(){ dirty = true; $('blkSave').disabled = false; setStatus('Unsaved changes'); }
  const structural = fn => () => { fn(); touched(); draw(); };
  const indexOf = id => blocks.findIndex(b => b.id === id);
  const move = (id, step) => structural(() => {
    const i = indexOf(id), j = i + step;
    if (j < 0 || j >= blocks.length) return;
    blocks.splice(j, 0, blocks.splice(i, 1)[0]);
  });

  /* ---------- formatting: applies to the selection in whichever block is being typed in ---------- */
  const editableOf = node => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.('#blkCanvas [contenteditable]');
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (sel.rangeCount && editableOf(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
  });
  function restoreSelection(){
    if (!lastRange || !document.contains(lastRange.startContainer)) return null;
    const target = editableOf(lastRange.startContainer);
    if (!target) return null;
    target.focus();
    const sel = document.getSelection();
    sel.removeAllRanges(); sel.addRange(lastRange);
    return target;
  }
  function format(command, value){
    const target = restoreSelection();
    if (!target) return setStatus('Click into a block first, then use the formatting buttons.');
    document.execCommand(command, false, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
  $('blkFormat').querySelectorAll('[data-cmd]').forEach(b => {
    b.addEventListener('mousedown', e => e.preventDefault()); // keep the text selection
    b.onclick = () => format(b.dataset.cmd);
  });
  $('blkLinkBtn').addEventListener('mousedown', e => e.preventDefault());
  $('blkLinkBtn').onclick = () => {
    if (!restoreSelection()) return setStatus('Select the words to link first.');
    $('blkLinkRow').hidden = false; $('blkLinkInput').value = ''; $('blkLinkInput').focus();
  };
  function applyLink(){
    const url = $('blkLinkInput').value.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return setStatus('A link must start with https://, http:// or mailto:', 'var(--red)');
    $('blkLinkRow').hidden = true;
    format('createLink', url);
  }
  $('blkLinkApply').onclick = applyLink;
  $('blkLinkInput').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); applyLink(); } if (e.key === 'Escape') $('blkLinkRow').hidden = true; });
  $('blkUnlinkBtn').addEventListener('mousedown', e => e.preventDefault());
  $('blkUnlinkBtn').onclick = () => format('unlink');

  /* ---------- drawing the canvas from `blocks` ---------- */
  // Unformatted text typed in place. `lines`: Enter starts a new line (kept as a line break) instead of finishing.
  function plainText(node, get, set, placeholder, { lines = false } = {}){
    try { node.contentEditable = 'plaintext-only'; } catch { node.contentEditable = 'true'; }
    node.dataset.ph = placeholder; node.classList.add('ed-text');
    node.textContent = get();
    node.addEventListener('input', () => {
      const v = lines ? node.innerText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : node.textContent.replace(/\s+/g, ' ').trim();
      if (!v) node.textContent = '';
      set(v); touched();
    });
    if (!lines) node.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); node.blur(); } });
    node.addEventListener('paste', pastePlain);
  }
  function pastePlain(e){
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  }

  function addRow(at){
    const row = el('div', 'blk-add');
    const open = button('+ Add block', 'Add a block here', () => { open.hidden = true; menu.hidden = false; }, 'add');
    const menu = el('span', 'blk-add-menu'); menu.hidden = true;
    BLOCK_TYPES.forEach(t => menu.append(button(t.label, `Add a ${t.label} block`, structural(() => {
      const block = newBlock(t.type);
      blocks.splice(at(), 0, block);
      focusAfterDraw = block.id;
    }))));
    menu.append(button('×', 'Close', () => { open.hidden = false; menu.hidden = true; }));
    row.append(open, menu);
    return row;
  }

  let focusAfterDraw = null;
  function draw(){
    canvas.replaceChildren();
    $('blkTop').replaceChildren(addRow(() => 0));
    const places = layout(blocks);
    blocks.forEach((block, i) => {
      const item = el('div', 'blk-item'); item.dataset.id = block.id;
      item.style.cssText = placeStyle(places[i]);
      item.classList.toggle('blk-narrow', places[i].span < 6);
      const row = el('div', 'blk-row');

      const handle = el('div', 'blk-handle', '⠿');
      handle.title = 'Drag to move'; handle.setAttribute('aria-hidden', 'true');

      let content;
      if (isText(block.type)){
        const meta = BLOCK_TYPES.find(t => t.type === block.type);
        content = el('div', `blk blk-${block.type} ed-text`);
        content.contentEditable = 'true'; content.dataset.ph = meta.placeholder; content.dataset.rich = block.type;
        content.setAttribute('role', 'textbox'); content.setAttribute('aria-label', meta.label);
        content.innerHTML = cleanHtml(block.html); // stored HTML is never trusted, here either
        content.addEventListener('input', () => {
          if (!content.textContent.trim() && !content.querySelector('li')) content.innerHTML = ''; // so the placeholder shows again
          block.html = content.innerHTML; touched();
        });
        content.addEventListener('paste', pastePlain);
      } else {
        content = el('div', 'blk blk-boxes');
        block.items.forEach((box, bi) => {
          const tile = el('div', 'blk-box'); tile.dataset.index = bi;
          const title = el('strong'), text = el('p');
          plainText(title, () => box.title, v => box.title = v, 'Box title');
          plainText(text, () => box.text, v => box.text = v, 'Explanation (optional)', { lines: true });
          tile.append(title, text, button('×', 'Remove this box', structural(() => block.items.splice(bi, 1)), 'box-x'));
          content.append(tile);
        });
        content.append(button('+ Add box', 'Add a box to this row', structural(() => block.items.push({ title: '', text: '' })), 'add box-add'));
      }

      const type = el('select', 'blk-type');
      type.title = 'Change block type'; type.setAttribute('aria-label', 'Block type');
      type.innerHTML = BLOCK_TYPES.map(t => `<option value="${t.type}">${t.label}</option>`).join('');
      type.value = block.type;
      type.onchange = structural(() => changeType(block, type.value));

      // Where the block sits: across the page, or in one of up to three side-by-side columns.
      const column = el('select', 'blk-type');
      column.title = 'Full width, or side by side in a column'; column.setAttribute('aria-label', 'Block position');
      column.innerHTML = COLUMNS.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
      column.value = [1, 2, 3].includes(block.col) ? block.col : 0;
      column.onchange = structural(() => { const v = Number(column.value); if (v) block.col = v; else delete block.col; });

      const controls = el('div', 'blk-controls');
      const up = button('↑', 'Move up', move(block.id, -1)), down = button('↓', 'Move down', move(block.id, 1));
      up.disabled = i === 0; down.disabled = i === blocks.length - 1;
      controls.append(type, column, up, down,
        button('Duplicate', 'Duplicate this block', structural(() => blocks.splice(indexOf(block.id) + 1, 0, { ...JSON.parse(JSON.stringify(block)), id: newId() }))),
        confirmButton('Delete', 'Delete this block', structural(() => blocks.splice(indexOf(block.id), 1))));

      row.append(handle, content, controls);
      item.append(row, addRow(() => indexOf(block.id) + 1));
      canvas.append(item);
      if (focusAfterDraw === block.id) setTimeout(() => (content.matches('[contenteditable]') ? content : content.querySelector('[contenteditable]'))?.focus());
    });
    focusAfterDraw = null;
    $('blkEmpty').hidden = blocks.length > 0;
  }

  // The text survives every change of type: text blocks keep their HTML, lists and line breaks
  // included, and going to or from a box row turns lines into boxes and back.
  function changeType(block, to){
    if (to === block.type) return;
    if (to === 'boxes'){
      const rows = textOf(block.html).split('\n').map(x => x.trim()).filter(Boolean);
      block.items = (rows.length ? rows : ['']).map(title => ({ title, text: '' }));
      delete block.html;
    } else if (block.type === 'boxes'){
      block.html = block.items.map(x => [x.title, x.text].filter(Boolean).join(' — ')).filter(Boolean).map(t => t.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))).join('<br>');
      delete block.items;
    }
    block.type = to;
  }

  /* ---------- reordering by drag (SortableJS): the dragged block's placeholder is the drop indicator ---------- */
  async function enableDrag(){
    try {
      await loadSortable();
      sortable?.destroy();
      sortable = new window.Sortable(canvas, {
        draggable: '.blk-item', handle: '.blk-handle', animation: 150,
        forceFallback: true, fallbackTolerance: 3, // pointer-driven, so a mouse and a finger behave the same
        ghostClass: 'blk-ghost', chosenClass: 'blk-chosen', dragClass: 'blk-drag',
        scroll: true, scrollSensitivity: 120, scrollSpeed: 16, bubbleScroll: true,
        // While a block is being dragged the columns are laid flat, so the order being changed is plain to see.
        onStart: () => canvas.classList.add('blk-flat'),
        onEnd: e => {
          canvas.classList.remove('blk-flat');
          if (e.oldIndex === e.newIndex) return;
          blocks.splice(e.newIndex, 0, blocks.splice(e.oldIndex, 1)[0]);
          touched(); draw();
        }
      });
    } catch (e){ setStatus(e.message, 'var(--red)'); }
  }

  /* ---------- toolbar: Save, Cancel, Back ---------- */
  async function save(){
    $('blkSave').disabled = true; setStatus('Saving…');
    try {
      await session.save(session.title, cleanBlocks(blocks));
      dirty = false;
      setStatus('Saved — the Master Page is updated', 'var(--green)');
    } catch (e){
      setStatus(`Not saved: ${e.message}`, 'var(--red)');
      $('blkSave').disabled = false;
    }
  }
  $('blkSave').onclick = save;

  // Leaving with unsaved work asks first: the button arms on the first click.
  function leaveVia(btn, label){
    return () => {
      if (dirty && !btn.dataset.armed){
        btn.dataset.armed = '1'; btn.textContent = 'Leave without saving?'; btn.classList.add('armed');
        setStatus('You have unsaved changes. Save, or click again to discard them.', 'var(--red)');
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('armed'); }, 5000);
        return;
      }
      close();
    };
  }
  $('blkCancel').onclick = leaveVia($('blkCancel'), 'Cancel');
  $('blkBack').onclick = leaveVia($('blkBack'), '← Back to Editor Page');
  window.addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

  function close(){
    const s = session;
    session = null; dirty = false;
    for (const [btn, label] of [[$('blkCancel'), 'Cancel'], [$('blkBack'), '← Back to Editor Page']]){ delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('armed'); }
    document.body.classList.remove('block-editing');
    s.close();
  }

  return {
    isOpen: () => !!session,
    // { title, tier, tierClass, iconHtml, blocks, save(title, blocks), close() }
    open(s){
      session = s; dirty = false;
      blocks = JSON.parse(JSON.stringify(s.blocks));
      $('blkIcon').innerHTML = s.iconHtml;
      $('blkTier').textContent = s.tier; $('blkTier').className = `sol-tier ${s.tierClass}`;
      const title = $('blkTitle');
      title.textContent = s.title;
      title.oninput = () => { session.title = title.textContent.replace(/\s+/g, ' ').trim(); touched(); };
      title.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); title.blur(); } };
      $('blkSave').disabled = true; $('blkLinkRow').hidden = true;
      setStatus('No changes yet');
      document.body.classList.add('block-editing');
      document.documentElement.style.setProperty('--blk-top', document.querySelector('.topbar').offsetHeight + 'px');
      draw();
      enableDrag();
    }
  };
}
