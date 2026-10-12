// What the AI assistant "sees": each page sets this when it renders.
export const state = { page: 'login', context: () => ({}) };
// The most rows of any one list sent to the assistant with a question. The totals a page sends always
// cover every row; only the row-by-row detail is cut, so a long register cannot outgrow a question.
export const CONTEXT_ROWS = 150;
export const firstRows = list => list.length > CONTEXT_ROWS ? { rowsShown: `the first ${CONTEXT_ROWS} of ${list.length}` } : {};
