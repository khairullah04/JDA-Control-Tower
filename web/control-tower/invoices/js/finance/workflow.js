// The stages an invoice goes through, and the moves allowed between them. Pure functions, shared by
// the browser and the server (which refuses any move that is not here).
//
// Approval happens outside the system: the PM emails invoices from the Microsoft List to the Project
// Lead (Received → With PM → Pending Lead), and the payment line in CJI3 is the proof that they were
// approved: matching one marks the invoice Paid from whatever open stage it is in. Invoices entered
// before this (Sent to PD, To Be Paid) and the moves between the older stages are kept for them.
//
//   Received ─► With PM ─► Pending Lead ─┐
//      (older: Sent to PD, To Be Paid) ──┴─► Paid (shown by a CJI3 line; undone, it goes back)
//
// The register's own `status` (pending / approved / paid / rejected) is what the Payment Table reads,
// so it is worked out from the stage and never set on its own: the Payment Table's figures and rules
// do not change.

export const STAGES = ['received', 'with_pm', 'pending_lead', 'sent_to_pd', 'to_be_paid', 'paid', 'rejected'];
export const STAGE_LABEL = {
  received: 'Received', with_pm: 'With PM for validation', pending_lead: 'Pending Lead approval', sent_to_pd: 'Sent to PD',
  to_be_paid: 'To Be Paid', paid: 'Paid', rejected: 'Rejected'
};
// Every move a person may make: from, to, what the button says, and whether a note is required.
// Paid is reached by matching a CJI3 line (`by: 'cji3'`), never by a button; a wrong match is undone
// back to the stage the invoice was in (`paidFrom`).
export const MOVES = [
  { from: 'received', to: 'sent_to_pd', action: 'Route 1: send direct to PD', route: 'direct' },
  { from: 'received', to: 'with_pm', action: 'Route 2: send to PM for validation', route: 'validation' },
  { from: 'with_pm', to: 'pending_lead', action: 'Validated: send to Project Lead' },
  { from: 'with_pm', to: 'received', action: 'Return to intake', note: true },
  { from: 'pending_lead', to: 'to_be_paid', action: 'Approve: To Be Paid' },
  { from: 'pending_lead', to: 'rejected', action: 'Reject', note: true },
  { from: 'pending_lead', to: 'with_pm', action: 'Return to PM', note: true },
  { from: 'rejected', to: 'pending_lead', action: 'Restore from archive', note: true },
  ...OPEN().map(from => ({ from, to: 'paid', action: 'Paid (CJI3)', by: 'cji3' })),
  ...OPEN().map(to => ({ from: 'paid', to, action: 'Undo the CJI3 match', by: 'cji3' }))
];
function OPEN() { return ['received', 'with_pm', 'pending_lead', 'sent_to_pd', 'to_be_paid']; }
// Where an invoice goes back to when the CJI3 match that paid it is undone: the stage it was in, or
// (paid before this was recorded) To Be Paid, or Sent to PD on Route 1.
export const unpaidStage = entry => OPEN().includes(entry?.paidFrom) ? entry.paidFrom : routeOf(entry) === 'direct' ? 'sent_to_pd' : 'to_be_paid';

// Who makes each move. Until the role lists are filled in (server/.env, ROLE_*), anyone signed in may.
export const ROLES = { accountant1: 'Accountant 1', pm: 'Project Manager', lead: 'Project Lead', accountant2: 'Accountant 2' };
export const roleFor = move => move.by === 'cji3' ? 'accountant2' : { received: 'accountant1', with_pm: 'pm', pending_lead: 'lead', rejected: 'lead' }[move.from];

// What the Payment Table sees for each stage.
const STATUS_OF = { received: 'pending', with_pm: 'pending', pending_lead: 'pending', sent_to_pd: 'approved', to_be_paid: 'approved', paid: 'paid', rejected: 'rejected' };
export const statusFor = stage => STATUS_OF[stage];
// An invoice entered before the process existed has no stage: it is read from its status.
const STAGE_OF = { pending: 'received', approved: 'to_be_paid', paid: 'paid', rejected: 'rejected' };
export const stageOf = entry => STAGES.includes(entry?.stage) ? entry.stage : STAGE_OF[entry?.status] || 'received';

// The moves that can be made on an invoice now, by a person or (`byCji3`) by a CJI3 match.
export const movesFrom = (entry, { byCji3 = false } = {}) => {
  const stage = stageOf(entry);
  return MOVES.filter(m => m.from === stage && !!m.by === byCji3 && (m.from !== 'paid' || m.to === unpaidStage(entry)));
};
// Which route an invoice took: as recorded, or (for one entered before the process) as its stage implies.
// (One paid before the process existed is taken as Route 2, so a wrong CJI3 match can be undone to To Be Paid.)
export const routeOf = entry => entry?.route || (stageOf(entry) === 'sent_to_pd' ? 'direct' : ['with_pm', 'pending_lead', 'to_be_paid', 'rejected', 'paid'].includes(stageOf(entry)) ? 'validation' : '');

// Whether `entry` may go to `to` this way, and if not, why. `byCji3` is a move made by matching a CJI3 line.
export function checkMove(entry, to, { note = '', byCji3 = false } = {}) {
  if (entry?.deletedAt) return 'This invoice has been deleted. Restore it first.';
  const stage = stageOf(entry), move = movesFrom(entry, { byCji3 }).find(m => m.to === to);
  if (!STAGES.includes(to)) return 'Unknown stage.';
  if (!move) return `An invoice that is ${STAGE_LABEL[stage]} cannot be moved to ${STAGE_LABEL[to]}${byCji3 ? '' : ' by hand'}.`;
  if (move.note && !String(note).trim()) return `Say why (${move.action}).`;
  if (['sent_to_pd', 'to_be_paid'].includes(to) && entry.missing?.length) return `This invoice is incomplete (${entry.missing.join('; ')}). Complete it first.`;
  return '';
}

// The invoice after the move: its stage, the status that goes with it, its route, and archived or not.
export function applyMove(entry, to, { at, by }) {
  const move = MOVES.find(m => m.from === stageOf(entry) && m.to === to);
  const next = { ...entry, stage: to, status: statusFor(to), stageAt: at, stageBy: by };
  if (move?.route && move.from === 'received') next.route = move.route;
  if (to === 'received') next.route = '';
  if (to === 'paid') next.paidFrom = stageOf(entry); else if (stageOf(entry) === 'paid') next.paidFrom = '';
  next.archivedAt = to === 'rejected' ? at : null;
  return next;
}
