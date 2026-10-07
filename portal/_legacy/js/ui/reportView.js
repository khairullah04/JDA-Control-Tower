import { $, esc } from './dom.js';
import { drawScurve } from './scurveChart.js';

export function renderReport(data) {
  $('#week-label').textContent = data.weekLabel || 'No week label set';
  $('#jda-sub').textContent = `${data.projects.length} project(s) tracked`;

  $('#project-list').innerHTML = data.projects.map(p => `
    <div class="project-card ${esc(p.status)}">
      <div class="project-info"><div class="name">${esc(p.name)}</div><div class="owner">${esc(p.owner)}</div>
        ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}</div>
      <div class="progress-track" style="width:140px"><div class="progress-fill" style="width:${p.pct}%"></div></div>
      <div class="project-pct">${p.pct}%</div>
      <span class="status-pill ${esc(p.status)}">${esc(p.status)}</span>
    </div>`).join('') || '<p style="color:var(--muted)">No projects yet.</p>';

  const todayStr = new Date().toISOString().slice(0, 10);
  $('#task-rows').innerHTML = data.tasks.map(t => {
    const cls = t.status === 'Done' ? 'done' : t.status === 'In progress' ? 'progress' : 'notstarted';
    const overdue = t.due && t.due < todayStr && t.status !== 'Done';
    return `<tr><td>${esc(t.task)}</td><td>${esc(t.project)}</td><td>${esc(t.owner)}</td>
      <td>${esc(t.due)}${overdue ? '<span class="overdue-tag">OVERDUE</span>' : ''}</td>
      <td><span class="task-status ${cls}">${esc(t.status)}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5">No tasks yet.</td></tr>';

  $('#update-list').innerHTML = [...data.updates].sort((a, b) => b.date.localeCompare(a.date)).map(u =>
    `<div class="update-item"><div class="update-date">${esc(u.date)}</div><div class="update-text">${esc(u.text)}</div></div>`
  ).join('') || '<p style="color:var(--muted)">No updates yet.</p>';

  $('#challenge-list').innerHTML = data.challenges.map(c => `
    <div class="challenge-item"><span class="status-pill ${c.severity === 'high' ? 'red' : c.severity === 'medium' ? 'amber' : 'green'}">${esc(c.severity)}</span>
      <div style="font-weight:700;margin-top:6px">${esc(c.title)}</div>
      <div style="font-size:13px;color:var(--muted)">${esc(c.description)}</div>
      ${c.mitigation ? `<div class="mitigation">Mitigation: ${esc(c.mitigation)}</div>` : ''}</div>
  `).join('') || '<p style="color:var(--muted)">No challenges logged.</p>';

  $('#task-project-select').innerHTML = data.projects.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');

  drawScurve($('#scurve-chart'), data.scurve);
}
