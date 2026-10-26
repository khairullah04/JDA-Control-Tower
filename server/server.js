import 'dotenv/config';
import { startApp } from './start.js';

let started;
try { started = await startApp(); } catch (e) { console.error(e.message); process.exit(1); }
const { app, kind, access } = started;
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`TriCipta AI: http://localhost:${port}   JDA Control Tower: http://localhost:${port}/control-tower/`);
  console.log(access);
  if (process.env.REQUIRE_AUTH === 'false') console.log('Sign-in is OFF (REQUIRE_AUTH=false): every private page is open. Never run it like this on a network.');
  console.log({
    firestore: 'Invoices and payments are saved in Firestore.',
    file: 'Invoices and payments are being saved in server/.finance-data.json, NOT in Firebase. Add the service-account key to save them in Firebase (see docs/server-and-invoices.md).',
    memory: 'Invoices and payments are kept in memory only (FINANCE_STORE=memory) and are lost when the server stops.'
  }[kind]);
});
