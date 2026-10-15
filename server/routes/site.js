import { Router } from 'express';
import { JDAS } from '../../web/shared/config/jdas.js';
import { publicSite, infoPage, controlTowerContent, savePage, editablePublic, saveRolesImage, discardRolesImage } from '../site-content.js';

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
  const run = (fn, failed = 'This could not be saved just now. Try again in a minute.') => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : failed }); }
  };
  const read = 'This could not be read just now. Try again in a minute.';
  return Router()
    .get('/controlTower', run(() => controlTowerContent(store), read))
    .get('/public', run(() => editablePublic(store), read))
    .put('/:page(public|controlTower)', run(req => savePage(store, req.params.page, req.body || {}, req.user?.name).then(saved => ({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }))))
    // the picture waits until the page is saved; Cancel throws it away
    .post('/roles-image', run(req => saveRolesImage(req.body?.image)))
    .delete('/roles-image', run(() => { discardRolesImage(); return { discarded: true }; }));
}
