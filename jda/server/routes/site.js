import { Router } from 'express';
import { JDAS } from '../../../portal/js/config/app-config.js';
import { publicSite, infoPage } from '../site-content.js';

// /api/public: what the public pages show, and nothing else (site-content.js decides what that is).
// Anyone may call these, so they are rate-limited (app.js) and their report reads are cached.
export function publicRoutes(store) {
  const run = fn => async (req, res) => {
    try { res.set('Cache-Control', 'no-cache'); res.json(await fn(req)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'This page could not be loaded just now. Try again in a minute.' }); }
  };
  return Router()
    .get('/site', run(() => publicSite(store)))
    .get('/info/:id', (req, res, next) => {
      const jda = JDAS.find(j => j.id === req.params.id);
      return jda ? run(() => infoPage(jda))(req, res) : res.status(404).json({ error: 'There is no such JDA.' });
    });
}
