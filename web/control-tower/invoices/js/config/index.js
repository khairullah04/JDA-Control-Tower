// Read next to this file, so the tracker's modules find it from any page that uses them (the tracker
// itself, and the JDA Control Tower landing page, which runs the tracker's Drive sync and cost figures).
export const config = await (await fetch(new URL('./app-config.json', import.meta.url))).json();

// Demo mode (sample data kept in this browser tab, saved nowhere) is for trying things on one's own
// computer. Whenever it is on, every page that uses the tracker says so at the top, so nobody takes the
// figures for real or types real work into it. main must ship with it off (server/demo-mode.test.mjs).
if (config.demoMode && typeof document !== 'undefined') {
  const show = () => {
    if (document.getElementById('demo-banner')) return;
    const b = Object.assign(document.createElement('div'), { id: 'demo-banner', role: 'status',
      textContent: 'Demo mode: these are sample figures, kept in this browser tab only. Nothing you enter here is saved.' });
    b.style.cssText = 'position:sticky;top:0;z-index:1000;padding:8px 16px;background:#8a5a12;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center';
    document.body.prepend(b);
  };
  if (document.body) show(); else addEventListener('DOMContentLoaded', show);
}
