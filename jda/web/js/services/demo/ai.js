// Demo: canned AI so the UI can be tried with no server or API key.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 864e5).toISOString().slice(0, 10);

export async function chat(messages, ctx) {
  await sleep(700);
  // The page context already carries its amounts as text ("MYR 1,234.56").
  if (ctx.report) {
    const r = ctx.report;
    return `[Demo reply] **${ctx.project.name}**: sanctioned to date ${r.sanctionedToDate}, paid ${r.paid} — ` +
      `${r.overSanctioned ? 'over' : 'under'} the sanctioned amount by ${r.variance.replace('-', '')}. ` +
      `${r.invoicesByStatus.pending} invoice(s) pending. Forecast at completion: ${r.forecast}.\n\nConnect the real server for genuine answers.`;
  }
  if (ctx.totals) {
    return `[Demo reply] **${ctx.page}**: ${ctx.totals.paid} paid of ${ctx.totals.budget}, ${ctx.totals.pendingInvoices} invoice(s) pending.`;
  }
  if (ctx.invoices) return `[Demo reply] **${ctx.page}**: ${ctx.invoices.length} invoice(s), ${ctx.invoices.filter(i => i.status === 'Paid').length} of them paid.`;
  return '[Demo reply] ' + (ctx.jdas || []).map(j => `${j.name}: ${j.paid} paid vs ${j.budget} budget`).join('; ');
}

// Demo Drive: a handful of fake files in one shared inbox, no folders - matches the real layout.
export async function listDriveFiles() {
  await sleep(600);
  return Array.from({ length: 6 }, (_, i) => ({ id: `demo-${i + 1}`, name: `invoice_${i + 1}.pdf`, mimeType: 'application/pdf' }));
}

// catalog: [{ code, jda, scope }]. Mimics a real invoice sometimes billing more than one project at once.
// The figures are made up, as whole ringgit including 8% tax, the way the AI reports a real invoice.
export async function analyzeDriveFile(fileId, catalog) {
  await sleep(1200);
  const pool = catalog.filter(c => c.code !== 'UNSORTED');
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const n = Math.random() < 0.35 ? 2 : 1;
  const chosen = Array.from({ length: n }, pick);
  const date = new Date().toISOString().slice(0, 10);

  const allocations = chosen.map(c => {
    const s = c.scope[Math.floor(Math.random() * c.scope.length)];
    return {
      projectCode: c.code, amount: (20 + Math.floor(Math.random() * 60)) * 1080,
      description: `${s?.description || 'Project services'}, per the uploaded invoice.`,
      verdict: s ? 'approved' : 'flagged',
      reasoning: s ? '[Demo] Matches a sanctioned amount.' : '[Demo] Nothing is sanctioned for this project; needs review.'
    };
  });
  const amount = allocations.reduce((s, a) => s + a.amount, 0), subtotal = amount / 1.08;
  return {
    vendor: 'Vendor ' + fileId.replace('demo-', '#'), invoiceNo: 'DEMO-' + Math.floor(1000 + Math.random() * 9000),
    date, paymentMonth: date.slice(0, 7), dueDate: addDays(date, 30), currency: 'MYR', amount, subtotal, taxRate: 0.08, taxAmount: amount - subtotal,
    allocations
  };
}
