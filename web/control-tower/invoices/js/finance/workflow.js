// The stages an invoice goes through, and the moves allowed between them. Pure functions, shared by
// the browser and the server (which refuses any move that is not here).
//
// Three steps, as the owner set them (2026-10-27):
//   Pending   the invoice is in (from the Microsoft List, an import, or by hand): Received, With PM,
//             Pending Lead approval
//   Approved  a person approves it (Approve: To Be Paid). Nothing can tell from outside that a payment
//             was approved, so this is always done by hand; it can be undone, with a reason.
//   Paid      only when a CJI3 line shows the payment. A line for an invoice not yet approved is held,
//             and pays it the moment it is approved.
//
// The register's own `status` (pending / approved / paid / rejected) is what the Payment Table reads,
// so it is worked out from the stage and never set on its own.

export const STAGES = ['received', 'with_pm', 'pending_lead', 'sent_to_pd', 'to_be_paid', 'paid', 'rejected'];
export const STAGE_LABEL = {
  received: 'Received', with_pm: 'With PM for validation', pending_lead: 'Pending Lead approval', sent_to_pd: 'Sent to PD',
  to_be_paid: 'To Be Paid', paid: 'Paid', rejected: 'Rejected'
};
// Every move a person may make: from, to, what the button says, and whether a note is required.
// Paid is reached by matching a CJI3 line (`by: 'cji3'`), never by a button; a wrong match is undone
// back to the stage the invoice was in (`paidFrom`).
// The stages a CJI3 line may pay: approved ones only.
export const PAYABLE = ['to_be_paid', 'sent_to_pd'];
export const MOVES = [
  { from: 'received', to: 'sent_to_pd', action: 'Route 1: send direct to PD', route: 'direct' },
  { from: 'received', to: 'with_pm', action: 'Route 2: send to PM for validation', route: 'validation' },
  { from: 'with_pm', to: 'pending_lead', action: 'Validated: send to Project Lead' },
  { from: 'with_pm', to: 'received', action: 'Return to intake', note: true },
  { from: 'received', to: 'to_be_paid', action: 'Approve' },
  { from: 'with_pm', to: 'to_be_paid', action: 'Approve' },
  { from: 'pending_lead', to: 'to_be_paid', action: 'Approve' },
  { from: 'to_be_paid', to: 'pending_lead', action: 'Undo approval', note: true },
  { from: 'received', to: 'rejected', action: 'Reject', note: true },
  { from: 'with_pm', to: 'rejected', action: 'Reject', note: true },
  { from: 'pending_lead', to: 'rejected', action: 'Reject', note: true },
  { from: 'pending_lead', to: 'with_pm', action: 'Return to PM', note: true },
  { from: 'rejected', to: 'pending_lead', action: 'Restore from archive', note: true },
  ...PAYABLE.map(from => ({ from, to: 'paid', action: 'Paid (CJI3)', by: 'cji3' })),
  ...OPEN().map(to => ({ from: 'paid', to, action: 'Undo the CJI3 match', by: 'cji3' }))
];
function OPEN() { return ['received', 'with_pm', 'pending_lead', 'sent_to_pd', 'to_be_paid']; }
export const isApproved = entry => PAYABLE.includes(stageOf(entry));
// Where an invoice goes back to when the CJI3 match that paid it is undone: the stage it was in, or
// (paid before this was recorded) To Be Paid, or Sent to PD on Route 1.
export const unpaidStage = entry => OPEN().includes(entry?.paidFrom) ? entry.paidFrom : routeOf(entry) === 'direct' ? 'sent_to_pd' : 'to_be_paid';

// Who makes each move. Until the role lists are filled in (server/.env, ROLE_*), anyone signed in may.
export const ROLES = { accountant1: 'Accountant 1', pm: 'Project Manager', lead: 'Project Lead', accountant2: 'Accountant 2' };
// Approving (and undoing it) is the Project Manager's or the Project Lead's: either list may.
export const roleFor = move => move.by === 'cji3' ? 'accountant2' : ['to_be_paid', 'rejected'].includes(move.to) || ['to_be_paid', 'rejected'].includes(move.from) ? 'approver'
  : { received: 'accountant1', with_pm: 'pm', pending_lead: 'lead', rejected: 'lead' }[move.from];

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
