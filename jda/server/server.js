import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import invoice from './routes/invoice.js';
import chat from './routes/chat.js';
import drive from './routes/drive.js';
import portal from './routes/portal.js';
import financeRoutes from './routes/finance.js';
import { requireUser } from './auth.js';
import { openStore } from './finance-store.js';
import { createFinance } from '../web/js/finance/service.js';

const app = express();
// ALLOWED_ORIGIN only matters if a site is served from somewhere else; it may list several origins, comma-separated.
const origins = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
app.use(express.json({ limit: '25mb' }));
app.use('/api/portal', portal); // passkey-gated, before the sign-in check: the portal has no login
app.use('/api', requireUser);
app.use('/api/invoice', invoice);
app.use('/api/chat', chat);
app.use('/api/drive', drive);
// CJI3 register and Payment Tables: signed in as above, and behind the Invoice Tracker passkey as well.
const finance = await openStore();
app.use('/api/finance', financeRoutes(createFinance(finance.store), finance.kind));
// Both sites are served from here too, so one command runs everything on one port:
// the JDA Programme Portal at / and the Invoice Tracker at /tracker/.
app.use('/tracker', express.static(fileURLToPath(new URL('../web', import.meta.url))));
app.use(express.static(fileURLToPath(new URL('../../portal', import.meta.url))));
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Portal: http://localhost:${port}   Invoice Tracker: http://localhost:${port}/tracker/`);
  console.log({
    firestore: 'Invoices and payments are saved in Firestore.',
    file: 'Invoices and payments are being saved in server/.finance-data.json, NOT in Firebase. Add the service-account key to save them in Firebase (see jda/README.md).',
    memory: 'Invoices and payments are kept in memory only (FINANCE_STORE=memory) and are lost when the server stops.'
  }[finance.kind]);
});
