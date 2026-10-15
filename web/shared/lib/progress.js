// A report's progress as data: how a task is tied to its project. No page elements are touched here.
//
// A project has a stable id. A task linked to a project carries that id (`projectId`) as well as
// the project's name (`project`), which is what older reports, the Drive sync and the Power
// Automate feed write. The id is what links them: renaming a project never moves or drops its
// tasks, and nothing is ever matched on an empty name.
export const newId = () => Math.random().toString(36).slice(2, 10);

// Every project gets an id. One arriving without (from Drive, the feed or an older report) takes
// the id of the project with the same name in `previous`, so its tasks stay with it.
export function withProjectIds(projects = [], previous = []) {
  const taken = new Set(projects.map(p => p.id).filter(Boolean));
  return projects.map(p => {
    if (p.id) return p;
    const was = p.name ? previous.find(x => x.id && x.name === p.name && !taken.has(x.id)) : null, id = was ? was.id : newId();
    taken.add(id);
    return { ...p, id };
  });
}

// The project a task belongs to: by id when that id is still a project, otherwise by name (never by an empty one).
export const projectOf = (task, projects) =>
  (task.projectId && projects.find(p => p.id === task.projectId)) || (task.project ? projects.find(p => p.name === task.project) : null) || null;
export const tasksOf = (project, tasks = [], projects = [project]) => tasks.filter(t => projectOf(t, projects) === project);

// Tasks made consistent with the projects: each linked task carries its project's id and current
// name; a task whose project is gone keeps the name it had as plain text and loses the id.
export function linkTasks(tasks = [], projects = []) {
  return tasks.map(t => {
    const p = projectOf(t, projects), { projectId, ...rest } = t;
    return p ? { ...rest, projectId: p.id, project: p.name || '' } : rest;
  });
}

/* ---------- Tasks (Weekly progress) ---------- */
// A task: { id, task (its title), description, project, projectId, owner, status, priority, start,
// due, completed, progress, checklist: [{ text, done }], notes (notes and blockers), updatedAt }.
// Reports written before these fields existed hold only { task, project, owner, due, status }: every
// task is read through normalizeTask, which fills the rest with blanks, so old and new read the same.
export const TASK_STATUSES = ['Not started', 'In progress', 'Done'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
const str = v => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const same = v => str(v).toLowerCase().replace(/[\s‐-―-]+/g, ' ').trim();
// "in progress", "IN PROGRESS" and "Completed" are read as the known statuses; anything else is kept as written.
const STATUS_WORDS = { 'not started': 'Not started', 'in progress': 'In progress', done: 'Done', completed: 'Done', complete: 'Done' };
const status = v => STATUS_WORDS[same(v)] || str(v).trim() || 'Not started';
// A date as YYYY-MM-DD, also from a longer timestamp a feed may send ("2026-09-05T00:00:00Z").
const day = v => /^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : '';
// A task without an id (from an older report, Drive or the JDA 3 feed) gets one worked out from its
// title and project, so it is the same id every time the report is read.
export function stableId(t) {
  let h = 5381;
  for (const ch of `${same(t.task)}|${same(t.project)}`) h = (h * 33 ^ ch.charCodeAt(0)) >>> 0;
  return `t${h.toString(36)}`;
}
export function normalizeTask(t = {}) {
  const pct = Number(t.progress);
  return {
    ...t,
    id: str(t.id) || stableId(t), task: str(t.task), description: str(t.description), project: str(t.project), owner: str(t.owner),
    status: status(t.status), priority: PRIORITIES.find(p => same(p) === same(t.priority)) || '',
    start: day(t.start), due: day(t.due), completed: day(t.completed),
    progress: t.progress === '' || t.progress == null || !Number.isFinite(pct) ? null : Math.max(0, Math.min(100, Math.round(pct))),
    checklist: (Array.isArray(t.checklist) ? t.checklist : []).filter(c => c && str(c.text).trim()).map(c => ({ text: str(c.text), done: !!c.done })),
    notes: str(t.notes), updatedAt: day(t.updatedAt)
  };
}
// A whole list: each task normalised, and two tasks that would share an id told apart.
export function normalizeTasks(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(t => {
    const n = normalizeTask(t);
    let id = n.id, k = 2;
    while (seen.has(id)) id = `${n.id}-${k++}`;
    seen.add(id);
    return { ...n, id };
  });
}
// How far along a task is: its checklist when it has one, else the % written for it, else 100 when Done.
export function taskProgress(t) {
  if (t.checklist?.length) return Math.round(t.checklist.filter(c => c.done).length / t.checklist.length * 100);
  if (Number.isFinite(t.progress)) return t.progress;
  return t.status === 'Done' ? 100 : null;
}
export const isOverdue = (t, today) => !!t.due && t.status !== 'Done' && t.due < today;

// Before saving: a task that changed (or is new) gets today as its last-updated date. A task marked
// Done now (it was not Done before) gets today as its completed date unless one was entered; one taken
// out of Done loses it. A task that was already Done keeps what it had, blank included.
export function stampTasks(tasks, before = [], today) {
  const was = new Map(before.map(t => [t.id, t]));
  const key = t => JSON.stringify({ ...t, updatedAt: '' });
  return tasks.map(t => {
    const prev = was.get(t.id);
    const completed = t.status !== 'Done' ? '' : t.completed || (prev?.status === 'Done' ? prev.completed || '' : today);
    const next = { ...t, completed };
    return prev && key(prev) === key(next) ? next : { ...next, updatedAt: today };
  });
}

// Tasks read from a weekly report in Drive, merged into the ones already there: a task is matched by
// id, then by title and project, then by title. It keeps its id, and every detail the report does not
// state (description, checklist, notes, priority, dates, progress) is kept from what was typed. The
// report decides which tasks are on the list, as before.
const RICH = ['description', 'priority', 'start', 'completed', 'progress', 'notes', 'due', 'owner'];
export function mergeTasks(incoming, current) {
  const pool = normalizeTasks(current);
  const take = test => { const i = pool.findIndex(test); return i < 0 ? null : pool.splice(i, 1)[0]; };
  const raw = Array.isArray(incoming) ? incoming : [];
  return normalizeTasks(raw).map((t, i) => {
    const old = (raw[i]?.id && take(o => o.id === t.id)) || take(o => same(o.task) === same(t.task) && same(o.project) === same(t.project)) || take(o => same(o.task) === same(t.task));
    if (!old) return t;
    const out = { ...old, task: t.task, project: t.project || old.project, projectId: t.projectId || old.projectId, status: t.status, id: old.id };
    for (const k of RICH) if (t[k] !== '' && t[k] != null) out[k] = t[k];
    if (t.checklist.length) out.checklist = t.checklist;
    return out;
  });
}

// The task list as the Weekly progress screen shows it: filtered by status ("overdue" too) and owner, then sorted.
const RANK = { priority: t => ['High', 'Medium', 'Low', ''].indexOf(t.priority), status: t => { const i = ['In progress', 'Not started', 'Done'].indexOf(t.status); return i < 0 ? 3 : i; } };
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// `due`: '' (any), 'overdue', 'week' (due in the next 7 days), 'month' (the next 30), 'none' (no due date).
export function viewTasks(tasks, { status = '', owner = '', due = '', sort = 'due' } = {}, today = '') {
  const dueOk = t => !due || (due === 'overdue' ? isOverdue(t, today) : due === 'none' ? !t.due
    : !!t.due && t.status !== 'Done' && t.due >= today && t.due <= addDays(today, due === 'week' ? 7 : 30));
  const keep = t => (!status || (status === 'overdue' ? isOverdue(t, today) : t.status === status)) && (!owner || t.owner === owner) && dueOk(t);
  const key = {
    due: t => t.due || '9999', priority: RANK.priority, status: RANK.status, owner: t => t.owner.toLowerCase() || '￿',
    updated: t => t.updatedAt ? -Number(t.updatedAt.replaceAll('-', '')) : 0
  }[sort] || (t => t.due || '9999');
  return tasks.filter(keep).map((t, i) => ({ t, i })).sort((a, b) => {
    const x = key(a.t), y = key(b.t);
    return x < y ? -1 : x > y ? 1 : (a.t.due || '9999').localeCompare(b.t.due || '9999') || a.i - b.i;
  }).map(x => x.t);
}
