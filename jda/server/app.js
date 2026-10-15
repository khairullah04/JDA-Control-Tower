import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import chat from './routes/chat.js';
import drive from './routes/drive.js';
import portal from './routes/portal.js';
import financeRoutes from './routes/finance.js';
import { publicRoutes, siteRoutes } from './routes/site.js';
import { siteStore } from './site-store.js';
import { requireUser, requirePage, authRoutes } from './auth.js';
import { rateLimit } from './rate-limit.js';
import { apiErrors, apiNotFound } from './errors.js';
import { createFinance } from '../web/js/finance/service.js';
import { JDAS } from '../../portal/js/config/app-config.js';

const dir = rel => fileURLToPath(new URL(rel, import.meta.url));
export const SITE = dir('../../site/'), PORTAL = dir('../../portal/'), TRACKER = dir('../web/'), SHARED = dir('../../shared/');

// Everything the server answers, in one place. What anyone may open is listed first; everything
// after the two `require...` lines needs a signed-in person on the access list (auth.js):
//
//   public   /                 TriCipta AI landing page            site/index.html
//            /login            employee sign-in                     site/login.html
//            /jda/<id>/info    a JDA's public Info page             site/info.html
//            /site/...         the public pages' own files; /site/portal/ is only the portal's css/ and assets/
//            /lib/blocks.js    how a solution's detail page is drawn (portal/js/blocks.js: code, no data), for the Info page
//            /shared/...       code and libraries the pages share (no data)
//            /api/auth/...     sign in, sign out, "am I signed in"
//            /api/public/...   what the public pages show (routes/site.js), and nothing else
//   private  /control-tower/   the JDA Control Tower (portal/), with the Invoice Tracker at /control-tower/tracker/
//            /api/...          everything else
//
// `finance` is the store for invoices and payments (finance-store.js); `storage` says which kind it is,
// and the landing pages' text is kept the same way (site-store.js) unless `site` is given.
export function createApp({ finance, storage, site = siteStore(storage) }) {
  const app = express();
  app.set('trust proxy', 1); // one reverse proxy in front: the caller's address is the one it reports
  // ALLOWED_ORIGIN only matters if a site is served from somewhere else; it may list several origins, comma-separated.
  const origins = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
  // Small bodies everywhere, except where a whole register, report or picture is sent (signed in only, see below).
  const big = express.json({ limit: '25mb' });
  app.use(['/api/finance', '/api/portal', '/api/drive', '/api/site/roles-image'], (req, res, next) => req.headers.cookie || req.headers.authorization ? big(req, res, next) : next());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  // ---- Public ----
  app.use('/api/auth', authRoutes);
  app.use('/api/public', rateLimit({ windowMs: 60_000, max: 120, what: 'page loads' }), publicRoutes(site));
  app.get('/', (req, res) => res.sendFile('index.html', { root: SITE }));
  app.get('/login', (req, res) => res.sendFile('login.html', { root: SITE }));
  app.get('/jda/:id/info', (req, res, next) => JDAS.some(j => j.id === req.params.id) ? res.sendFile('info.html', { root: SITE }) : next());
  // Each its own root, so no path ("..", encoded or not) can climb out of it into the rest of portal/.
  app.use('/site/portal/css', express.static(`${PORTAL}css`));
  app.use('/site/portal/assets', express.static(`${PORTAL}assets`));
  // At the top level, so its own import of ../../shared/esc.js lands on /shared/esc.js.
  app.get('/lib/blocks.js', (req, res) => res.sendFile('js/blocks.js', { root: PORTAL }));
  app.use('/site/portal', (req, res) => res.sendStatus(404));
  app.use('/site', express.static(SITE));
  app.use('/shared', express.static(SHARED));

  // Addresses from before the Control Tower: they lead to the same pages, which now need a sign-in.
  app.get('/index.html', (req, res) => res.redirect(301, '/control-tower/'));
  app.get('/jda-report.html', (req, res) => res.redirect(301, `/control-tower${req.url}`)); // keeps ?jda= of older links
  app.use('/tracker', (req, res) => res.redirect(301, `/control-tower/tracker${req.url}`));

  // ---- Private ----
  app.use('/api', requireUser);
  app.use('/api/portal', portal);
  app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 20, what: 'questions' }), chat);
  app.use('/api/drive', rateLimit({ windowMs: 10 * 60_000, max: 300, what: 'Drive requests' }), drive); // a sync reads one file per request
  app.use('/api/finance', financeRoutes(createFinance(finance), storage));
  app.use('/api/site', siteRoutes(site));
  app.use('/api', apiErrors, apiNotFound);

  app.use('/control-tower', requirePage);
  app.use('/control-tower/tracker', express.static(TRACKER));
  app.use('/control-tower', express.static(PORTAL));
  return app;
}
