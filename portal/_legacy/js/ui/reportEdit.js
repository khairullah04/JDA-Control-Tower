import { $ } from './dom.js';
import { wireGate } from './adminGate.js';
import { saveReport } from '../services/jdaReports.js';

// `getData` lets the edit forms read/mutate whatever report object the page controller currently
// holds in memory, then persist it - keeps this module independent of how the page loaded that state.
export function wireEditPanel({ jdaId, getData, onSaved }) {
  $('#edit-tab').hidden = false;
  $('#edit-tab').onclick = e => {
    e.preventDefault();
    $('#edit-section').hidden = false;
    $('#edit-section').scrollIntoView({ behavior: 'smooth' });
  };

  wireGate({
    storageKey: 'jda-edit-unlocked',
    lockedEl: $('#edit-locked'), openEl: $('#edit-open'),
    passkeyInput: $('#edit-passkey'), msgEl: $('#edit-lock-msg'), unlockBtn: $('#edit-unlock')
  });

  const save = async () => { await saveReport(jdaId, getData()); onSaved(); };

  $('#form-project').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    getData().projects.push({ name: f.get('name'), owner: f.get('owner'), pct: Number(f.get('pct')), status: f.get('status'), description: f.get('description') });
    await save(); e.target.reset();
  };
  $('#form-task').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    getData().tasks.push({ task: f.get('task'), project: f.get('project'), owner: f.get('owner'), due: f.get('due'), status: f.get('status') });
    await save(); e.target.reset();
  };
  $('#form-update').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    getData().updates.push({ date: f.get('date'), text: f.get('text') });
    await save(); e.target.reset();
  };
  $('#form-challenge').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    getData().challenges.push({ severity: f.get('severity'), title: f.get('title'), description: f.get('description'), mitigation: f.get('mitigation') });
    await save(); e.target.reset();
  };
}
