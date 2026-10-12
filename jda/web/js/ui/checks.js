// What a JDA or a project must satisfy before it is saved. Nothing here touches the page or the
// network, so it is tested on its own (jda/server/analytics.test.mjs).
export function checkDates({ startDate, endDate }) {
  if (endDate < startDate) throw new Error('End date must be on or after the start date.');
}
// `others`: every other project, each with its JDA's name. An imported or AI-read invoice finds its
// project by code alone, so no two projects may share one, in any JDA and whatever the capitals.
// Returns the values to save. A form that does not ask for the code (editing) is checked without it.
export function checkProject(v, others = []) {
  checkDates(v);
  if (!(Number.isFinite(v.budget) && v.budget >= 0)) throw new Error('Total budget must be zero or more.');
  if (v.name === undefined) return v;
  const name = String(v.name).trim(), taken = others.find(p => String(p.name).trim().toLowerCase() === name.toLowerCase());
  if (!name) throw new Error('Give the project a code.');
  if (taken) throw new Error(`The project code "${taken.name}" is already used${taken.jdaName ? ` in ${taken.jdaName}` : ''}. Choose another.`);
  return { ...v, name };
}
