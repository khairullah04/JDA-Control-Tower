import { Router } from 'express';
import { JDAS } from '../../../portal/js/config/app-config.js';
import { publicSite, infoPage, controlTowerContent, savePage, editablePublic, saveRolesImage } from '../site-content.js';

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
    })
    .use((req, res) => res.status(404).json({ error: 'Not found.' })); // never on to the sign-in check behind
}

// /api/site: the landing pages' content as edit mode works on it, and its saves. Behind the sign-in (app.js).
export function siteRoutes(store) {
  const run = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : 'This could not be saved just now. Try again in a minute.' }); }
  };
  return Router()
    .get('/controlTower', run(() => controlTowerContent(store)))
    .get('/public', run(() => editablePublic(store)))
    .put('/:page(public|controlTower)', run(req => savePage(store, req.params.page, req.body || {}, req.user?.name).then(saved => ({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }))))
    .post('/roles-image', run(req => ({ image: saveRolesImage(req.body?.image) })));
}
