// Demo: canned AI so the UI can be tried with no server or API key.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rm = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 864e5).toISOString().slice(0, 10);

export async function chat(messages, ctx) {
  await sleep(700);
  if (ctx.report) {
    const r = ctx.report;
    return `[Demo reply] **${ctx.project.name}**: planned to date ${rm(r.planned)}, spent ${rm(r.actual)} — ` +
      `${r.overPlan ? rm(r.variance) + ' over plan' : rm(-r.variance) + ' under plan'}. ` +
      `${r.counts.needsReview} invoice(s) need review. Forecast at completion: ${rm(r.forecast)}.\n\nConnect the real server for genuine answers.`;
  }
  if (ctx.totals) {
    return `[Demo reply] **${ctx.page}**: ${rm(ctx.totals.actual)} spent of ${rm(ctx.totals.budget)}, ${ctx.totals.needsReview} invoice(s) need review.`;
  }
  return '[Demo reply] ' + (ctx.jdas || []).map(j => `${j.name}: ${rm(j.actual)} spent vs ${rm(j.budget)} budget`).join('; ');
}

// Demo Drive: a handful of fake files in one shared inbox, no folders - matches the real layout.
export async function listDriveFiles() {
  await sleep(600);
  return Array.from({ length: 6 }, (_, i) => ({ id: `demo-${i + 1}`, name: `invoice_${i + 1}.pdf`, mimeType: 'application/pdf' }));
}

// catalog: [{ code, jda, scope }]. Mimics a real invoice sometimes billing more than one project at once.
export async function analyzeDriveFile(fileId, catalog) {
  await sleep(1200);
  const pool = catalog.filter(c => c.code !== 'UNSORTED');
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const n = Math.random() < 0.35 ? 2 : 1;
  const chosen = Array.from({ length: n }, pick);
  const date = new Date().toISOString().slice(0, 10);

  const allocations = chosen.map(c => {
    const s = c.scope[Math.floor(Math.random() * c.scope.length)];
    const amount = Math.round((s?.amount || 40000) * (0.3 + Math.random() * 0.8) / 100) * 100;
    const over = !s || amount > s.amount;
    return {
      projectCode: c.code, amount,
      description: `${s?.description || 'Project services'}, per the uploaded invoice.`,
      matchedScopeId: s?.id || null,
      verdict: over ? 'flagged' : 'approved',
      reasoning: over ? '[Demo] No matching WBS item or amount above plan; needs review.' : '[Demo] Matches a WBS item and is within its planned amount.'
    };
  });
  const amount = allocations.reduce((s, a) => s + a.amount, 0);
  const taxRate = 0.08, subtotal = Math.round(amount / (1 + taxRate));
  return {
    vendor: 'Vendor ' + fileId.replace('demo-', '#'), invoiceNo: 'DEMO-' + Math.floor(1000 + Math.random() * 9000),
    date, dueDate: addDays(date, 30), currency: 'MYR', amount, subtotal, taxRate, taxAmount: amount - subtotal,
    allocations
  };
}
