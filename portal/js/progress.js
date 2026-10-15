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
const str = v => typeof v === 'string' ? v : '';
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? v : '';
export function normalizeTask(t = {}) {
  const pct = Number(t.progress);
  return {
    ...t,
    id: str(t.id) || newId(), task: str(t.task), description: str(t.description), project: str(t.project), owner: str(t.owner),
    status: TASK_STATUSES.includes(t.status) ? t.status : 'Not started', priority: PRIORITIES.includes(t.priority) ? t.priority : '',
    start: day(t.start), due: day(t.due), completed: day(t.completed),
    progress: t.progress === '' || t.progress == null || !Number.isFinite(pct) ? null : Math.max(0, Math.min(100, Math.round(pct))),
    checklist: (Array.isArray(t.checklist) ? t.checklist : []).filter(c => c && str(c.text).trim()).map(c => ({ text: str(c.text), done: !!c.done })),
    notes: str(t.notes), updatedAt: day(t.updatedAt)
  };
}
// How far along a task is: its checklist when it has one, else the % written for it, else 100 when Done.
export function taskProgress(t) {
  if (t.checklist?.length) return Math.round(t.checklist.filter(c => c.done).length / t.checklist.length * 100);
  if (Number.isFinite(t.progress)) return t.progress;
  return t.status === 'Done' ? 100 : null;
}
export const isOverdue = (t, today) => !!t.due && t.status !== 'Done' && t.due < today;

// Before saving: a task that changed (or is new) gets today as its last-updated date; one marked Done
// gets a completed date if it has none, and one taken out of Done loses it.
export function stampTasks(tasks, before = [], today) {
  const was = new Map(before.map(t => [t.id, JSON.stringify({ ...t, updatedAt: '' })]));
  return tasks.map(t => {
    const next = { ...t, completed: t.status === 'Done' ? (t.completed || today) : '' };
    return was.get(t.id) === JSON.stringify({ ...next, updatedAt: '' }) ? next : { ...next, updatedAt: today };
  });
}

// The task list as the Weekly progress screen shows it: filtered by status ("overdue" too) and owner, then sorted.
const RANK = { priority: t => ['High', 'Medium', 'Low', ''].indexOf(t.priority), status: t => ['In progress', 'Not started', 'Done'].indexOf(t.status) };
export function viewTasks(tasks, { status = '', owner = '', sort = 'due' } = {}, today = '') {
  const keep = t => (!status || (status === 'overdue' ? isOverdue(t, today) : t.status === status)) && (!owner || t.owner === owner);
  const key = {
    due: t => t.due || '9999', priority: RANK.priority, status: RANK.status, owner: t => t.owner.toLowerCase() || '￿',
    updated: t => t.updatedAt ? -Number(t.updatedAt.replaceAll('-', '')) : 0
  }[sort] || (t => t.due || '9999');
  return tasks.filter(keep).map((t, i) => ({ t, i })).sort((a, b) => {
    const x = key(a.t), y = key(b.t);
    return x < y ? -1 : x > y ? 1 : (a.t.due || '9999').localeCompare(b.t.due || '9999') || a.i - b.i;
  }).map(x => x.t);
}
