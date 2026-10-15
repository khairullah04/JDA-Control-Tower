import 'dotenv/config';
import { publishAccessList } from './access-list.js';
import { openStore } from './finance-store.js';
import { createApp } from './app.js';

// Sign-in off is for trying things on your own computer only: it would open every private page.
if (process.env.REQUIRE_AUTH === 'false' && process.env.NODE_ENV === 'production') {
  console.error('Not starting: REQUIRE_AUTH=false would open the JDA Control Tower to anyone. Remove it from server/.env.');
  process.exit(1);
}

// Without a fixed secret, every restart signs everyone out, and an editor open at that moment loses what is unsaved.
if (!(process.env.SESSION_SECRET?.length >= 32)) {
  if (process.env.NODE_ENV === 'production') { console.error('Not starting: set SESSION_SECRET in server/.env (32 or more random characters).'); process.exit(1); }
  console.warn('SESSION_SECRET is not set (32+ characters): a restart will sign everyone out.');
}

const finance = await openStore();
const app = createApp({ finance: finance.store, storage: finance.kind });
const port = process.env.PORT || 8080;
const access = await publishAccessList();
app.listen(port, () => {
  console.log(`TriCipta AI: http://localhost:${port}   JDA Control Tower: http://localhost:${port}/control-tower/`);
  console.log(access);
  if (process.env.REQUIRE_AUTH === 'false') console.log('Sign-in is OFF (REQUIRE_AUTH=false): every private page is open. Never run it like this on a network.');
  console.log({
    firestore: 'Invoices and payments are saved in Firestore.',
    file: 'Invoices and payments are being saved in server/.finance-data.json, NOT in Firebase. Add the service-account key to save them in Firebase (see jda/README.md).',
    memory: 'Invoices and payments are kept in memory only (FINANCE_STORE=memory) and are lost when the server stops.'
  }[finance.kind]);
});
