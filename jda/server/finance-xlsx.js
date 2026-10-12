import ExcelJS from 'exceljs';
import { parseCsv } from '../web/js/finance/sheets.js';

// Excel in and out for the CJI3 register and the Payment Tables. The browser decides what the
// cells mean (web/js/finance/sheets.js); this only turns a file into rows of text and back.
const cellText = v => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v !== 'object' ? String(v) : v.result !== undefined ? cellText(v.result) : v.text !== undefined ? String(v.text) : (v.richText || []).map(r => r.text).join('');

// A .xlsx or .csv file -> [{ name, rows }], one per sheet, blank rows kept (a blank row ends a table).
export async function readSheets(name, buffer) {
  if (/\.csv$/i.test(name)) return [{ name, rows: parseCsv(buffer.toString('utf8')) }];
  if (!/\.xlsx$/i.test(name)) throw Object.assign(new Error('Use an Excel workbook (.xlsx) or a CSV file. Save an older .xls file as .xlsx first.'), { status: 400 });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map(ws => {
    const rows = [];
    for (let i = 1; i <= ws.rowCount; i++) rows.push(Array.from((ws.getRow(i).values || []).slice(1), cellText));
    return { name: ws.name, rows };
  });
}

// [{ name, rows }] -> a workbook. A cell given as { n: '813000.00' } becomes a number, formatted to the decimals it was given with.
export async function writeWorkbook(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const ws = wb.addWorksheet(String(name).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31));
    rows.forEach((cells, i) => {
      const row = ws.addRow(cells.map(c => c && typeof c === 'object' ? Number(c.n) : c ?? ''));
      if (!i) row.font = { bold: true };
      cells.forEach((c, j) => { if (c && typeof c === 'object') row.getCell(j + 1).numFmt = /\.\d{2}$/.test(c.n) ? '#,##0.00' : '0.########'; });
    });
    // Each column as wide as the longest thing in it, between 12 and 44 characters. (A column's `values` is a
    // sparse array, so the cells are walked instead.) A number is measured as it is shown, with its separators.
    ws.columns.forEach(col => {
      let longest = 0;
      col.eachCell(c => { longest = Math.max(longest, (typeof c.value === 'number' ? c.value.toLocaleString('en', { minimumFractionDigits: 2 }) : cellText(c.value)).length); });
      col.width = Math.min(Math.max(12, longest + 2), 44);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
