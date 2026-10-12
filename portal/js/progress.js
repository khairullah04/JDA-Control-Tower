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
