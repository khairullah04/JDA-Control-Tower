import { $, icon } from './dom.js';
import { renderReport } from './reportView.js';
import { wireEditPanel } from './reportEdit.js';
import { getReport, saveReport } from '../services/jdaReports.js';
import { EMPTY_REPORT, JDA3_REAL_REPORT } from '../services/seedData.js';
import { JDAS } from '../config/app-config.js';

export async function initReportPage() {
  $('#back-icon').innerHTML = icon.back;
  $('#edit-icon').innerHTML = icon.edit;
  const params = new URLSearchParams(location.search);
  const jdaId = params.get('jda') || 'jda1';
  const jda = JDAS.find(j => j.id === jdaId) || { id: jdaId, name: jdaId.toUpperCase() };
  $('#jda-title').textContent = jda.name;

  let data = null;
  const getData = () => data;
  const show = () => { $('#empty-state').hidden = true; $('#report-body').hidden = false; renderReport(data); };

  data = await getReport(jdaId);
  if (data) show();
  else {
    $('#empty-state').hidden = false;
    $('#week-label').textContent = 'No report yet';
    if (jdaId === 'jda3') $('#seed-jda3').hidden = false;
  }

  $('#seed-empty').onclick = async () => { data = structuredClone(EMPTY_REPORT); await saveReport(jdaId, data); show(); };
  $('#seed-jda3').onclick = async () => { data = structuredClone(JDA3_REAL_REPORT); await saveReport(jdaId, data); show(); };

  wireEditPanel({ jdaId, getData, onSaved: () => renderReport(data) });
}
