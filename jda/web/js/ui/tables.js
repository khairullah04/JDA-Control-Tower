// The two invoice tables shown on both a project page and a JDA page.
import { esc, rm, pct } from './dom.js';

export const currencyCheck = foreign => `<div class="section"><h3>Currency check</h3>
      <table><tr><th>Invoice #</th><th>Currency</th><th class="num">Amount</th><th class="num">Rate to MYR</th><th class="num">MYR</th></tr>
      ${foreign.map(i => `<tr><td>${esc(i.invoiceNo)}</td><td>${esc(i.currency)}</td>
        <td class="num">${Number(i.amount).toLocaleString()}</td>
        <td class="num">${i.rate != null ? esc(i.rate) : '<span class="pill notpaid">no rate</span>'}</td><td class="num">${rm(i.myr)}</td></tr>`).join('')
        || '<tr><td colspan="5">All invoices are in MYR.</td></tr>'}</table></div>`;

// totalLabel: the sentence before the MYR total, e.g. "Total SST so far".
export const sstSummary = (sst, totalLabel) => `<div class="section"><h3>SST summary</h3>
      <table><tr><th>Invoice #</th><th>Vendor</th><th class="num">Subtotal</th><th class="num">SST rate</th><th class="num">SST amount</th><th class="num">Total</th></tr>
      ${sst.rows.map(x => `<tr><td>${esc(x.invoiceNo)}</td><td>${esc(x.vendor)}</td>
        <td class="num">${x.subtotal != null ? esc(x.currency) + ' ' + x.subtotal.toLocaleString() : '—'}</td>
        <td class="num">${x.taxRate != null ? pct(x.taxRate) : '—'}</td>
        <td class="num">${x.taxAmount != null ? esc(x.currency) + ' ' + x.taxAmount.toLocaleString() : '—'}</td>
        <td class="num">${esc(x.currency)} ${Number(x.amount).toLocaleString()}</td></tr>`).join('')
        || '<tr><td colspan="6">No invoices yet.</td></tr>'}</table>
      <p class="legend" style="margin-top:.5rem">${esc(totalLabel)}, converted to MYR: <b>${rm(sst.totalTax)}</b></p></div>`;
