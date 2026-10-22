import { syncDrive } from '../services/sync.js';
import { $, esc } from './dom.js';

function showResult(s) {
  const d = $('#modal');
  d.className = '';
  d.innerHTML = `<form><h3>Drive sync</h3>` + (s.error ? `<p class="msg">${esc(s.error)}</p>` : `
    <p><b>${s.invoicesCreated}</b> invoice(s) created from <b>${s.filesProcessed}</b> file(s). ${s.filesSkipped} file(s) already imported.
    Each one is in Invoice history as <b>Pending</b>.
    ${s.unsortedAllocations ? `${s.unsortedAllocations} charge(s) went to <b>Unsorted</b> — use Edit on each to give it its project.` : ''}</p>
    ${s.redirected?.length ? `<p class="msg">Came in incomplete:<br>${s.redirected.map(esc).join('<br>')}</p>` : ''}
    ${s.failed.length ? `<p class="msg">Failed:<br>${s.failed.map(esc).join('<br>')}</p>` : ''}`) +
    `<div class="row"><button class="primary">Close</button></div></form>`;
  $('form', d).onsubmit = e => { e.preventDefault(); d.close(); };
  d.showModal();
}

export async function runSync(btn, refresh) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    const s = await syncDrive(t => btn.textContent = 'Syncing: ' + t.slice(0, 26));
    showResult(s); refresh();
  } catch (e) { showResult({ error: e.message }); }
  finally { btn.disabled = false; btn.textContent = label; }
}
