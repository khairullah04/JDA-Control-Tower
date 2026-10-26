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
import { createFinance } from '../web/control-tower/invoices/js/finance/service.js';
import { JDAS } from '../web/shared/config/jdas.js';

// The front end is web/, and each of its three folders is served at the address of the same name.
// (Written out in full, so Vercel sees them and packs the files in with the server.)
export const WEB = fileURLToPath(new URL('../web/', import.meta.url));
export const PUBLIC = fileURLToPath(new URL('../web/public', import.meta.url));
export const SHARED = fileURLToPath(new URL('../web/shared', import.meta.url));
export const CONTROL_TOWER = fileURLToPath(new URL('../web/control-tower', import.meta.url));

// Everything the server answers, in one place. What anyone may open is listed first; everything
// after the two `require...` lines needs a signed-in person with a verified @petronas.com address, or on ALLOWED_EMAILS (auth.js):
//
//   public   /                 TriCipta AI landing page            web/public/index.html
//            /login            employee sign-in                     web/public/login.html
//            /jda/<id>/info    a JDA's public Info page             web/public/info.html
//            /public/...       the public pages' own scripts, styles and pictures   web/public/
//            /shared/...       code, styles, pictures and libraries every page uses (no data)   web/shared/
//            /api/auth/...     sign in, sign out, "am I signed in"
//            /api/public/...   what the public pages show (routes/site.js), and nothing else
//   private  /control-tower/   the JDA Control Tower, with the Invoice Tracker at /control-tower/invoices/   web/control-tower/
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
  app.use(['/api/finance', '/api/portal', '/api/drive', '/api/site/roles-image', '/api/site/image'], (req, res, next) => req.headers.cookie || req.headers.authorization ? big(req, res, next) : next());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  // ---- Public ----
  app.use('/api/auth', authRoutes);
  app.use('/api/public', rateLimit({ windowMs: 60_000, max: 120, what: 'page loads' }), publicRoutes(site));
  app.get('/', (req, res) => res.sendFile('index.html', { root: PUBLIC }));
  app.get('/login', (req, res) => res.sendFile('login.html', { root: PUBLIC }));
  app.get('/jda/:id/info', (req, res, next) => JDAS.some(j => j.id === req.params.id) ? res.sendFile('info.html', { root: PUBLIC }) : next());
  // Each folder is its own root, so no path ("..", encoded or not) can climb out of it.
  app.use('/public', express.static(PUBLIC));
  app.use('/shared', express.static(SHARED));

  // Addresses from before: they lead to the same pages, which need a sign-in.
  app.get('/index.html', (req, res) => res.redirect(301, '/control-tower/'));
  // ?jda=<id> alone was the Master Page, which is public now: straight there. Otherwise the private
  // page, whose script forwards the rest by the hash (which never reaches the server).
  app.get('/jda-report.html', (req, res) => JDAS.some(j => j.id === req.query.jda)
    ? res.redirect(301, `/jda/${req.query.jda}/info`) : res.redirect(301, `/control-tower${req.url}`));
  app.use(['/tracker', '/control-tower/tracker'], (req, res) => res.redirect(301, `/control-tower/invoices${req.url}`));

  // ---- Private ----
  app.use('/api', requireUser);
  app.use('/api/portal', portal);
  app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 20, what: 'questions' }), chat);
  app.use('/api/drive', rateLimit({ windowMs: 10 * 60_000, max: 300, what: 'Drive requests' }), drive); // a sync reads one file per request
  app.use('/api/finance', financeRoutes(createFinance(finance), storage));
  app.use('/api/site', siteRoutes(site));
  app.use('/api', apiErrors, apiNotFound);

  app.use('/control-tower', requirePage);
  // A JDA's private pages: /control-tower/jda1/overall-progress and /weekly-progress (one page, jda-report.html),
  // and /documents (its Agreement & BRD). Its Master Page is public: /jda/jda1/info, edited there by people signed in.
  const known = id => JDAS.some(j => j.id === id);
  app.get('/control-tower/:jda/:page(overall-progress|weekly-progress|documents)', (req, res, next) => known(req.params.jda)
    ? res.sendFile(req.params.page === 'documents' ? 'documents.html' : 'jda-report.html', { root: CONTROL_TOWER }) : next());
  // Its invoices and payments: the Invoice Tracker's page for the JDA of the same name.
  app.get('/control-tower/:jda/invoices', (req, res, next) => known(req.params.jda)
    ? res.redirect(302, `/control-tower/invoices/#/named/${encodeURIComponent(JDAS.find(j => j.id === req.params.jda).name)}`) : next());
  // Edit public site: the TriCipta AI page and each JDA's Master Page, edited in one place.
  app.get('/control-tower/site', (req, res) => res.sendFile('site.html', { root: CONTROL_TOWER }));
  app.get('/control-tower/:jda', (req, res, next) => known(req.params.jda) ? res.redirect(302, `/control-tower/${req.params.jda}/overall-progress`) : next());
  app.use('/control-tower', express.static(CONTROL_TOWER));
  return app;
}

// Vercel runs this file as a function: the app is started on the first request and kept for the
// next ones (start.js; locally, server.js does the same and listens on a port). A start that fails
// (a missing setting) answers every request with 503 and says why in the log, then tries again.
let starting = null;
export default async function vercel(req, res) {
  try {
    const { app } = await (starting ||= import('./start.js').then(m => m.startApp()).then(s => { console.log(s.access); return s; }));
    return app(req, res);
  } catch (e) {
    starting = null;
    console.error('The server could not start:', e.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('The JDA Control Tower is not set up yet on this server. The owner can see why in the server log.');
  }
}
