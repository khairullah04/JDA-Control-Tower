import { publishAccessList } from './access-list.js';
import { openStore } from './finance-store.js';
import { createApp } from './app.js';

// Everything the server needs before it answers anyone, the same on a computer (server.js) and on
// Vercel (app.js, default export). Refuses to start when production would be unsafe.
export async function startApp(env = process.env) {
  // Sign-in off is for trying things on your own computer only: it would open every private page.
  if (env.REQUIRE_AUTH === 'false' && env.NODE_ENV === 'production') throw new Error('Not starting: REQUIRE_AUTH=false would open the JDA Control Tower to anyone. Remove it from the settings.');
  // Without a fixed secret, every restart signs everyone out, and an editor open at that moment loses what is unsaved.
  if (!(env.SESSION_SECRET?.length >= 32)) {
    if (env.NODE_ENV === 'production') throw new Error('Not starting: set SESSION_SECRET (32 or more random characters).');
    console.warn('SESSION_SECRET is not set (32+ characters): a restart will sign everyone out.');
  }
  const finance = await openStore(env);
  const app = createApp({ finance: finance.store, storage: finance.kind });
  return { app, kind: finance.kind, access: await publishAccessList() };
}
