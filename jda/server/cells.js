// What a spreadsheet cell says, as text. One reading for every workbook the server opens (the CJI3
// and Payment Table imports, and the Drive files given to the AI): a date as YYYY-MM-DD, a formula
// as its result, a link or rich text as the words shown.
export const cellText = v => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v !== 'object' ? String(v) : v.result !== undefined ? cellText(v.result) : v.text !== undefined ? String(v.text) : (v.richText || []).map(r => r.text).join('');
