// One page at a time owns #page. A page's data takes a moment to arrive and the user may have moved
// on by then: a render that has been overtaken stops, instead of painting an old page under a new
// address. A redraw after a change (`refresh`) happens in place - no "Loading…" in between, and the
// window and the wide tables stay scrolled where they were.
import { $ } from './dom.js';

let latest = 0, inPlace = false, restore = null;
class Superseded extends Error {}
const SCROLLED = '.pt-scroll'; // the tables that scroll inside the page

// Every page render starts here. `redraw` renders the same page again.
//   current()  call after the waiting is over, just before drawing: it stops an overtaken render
//   refresh()  redraws in place, unless the user has since gone to another address
export function startRender(loading, redraw) {
  const mine = ++latest, at = location.hash, page = $('#page'), again = inPlace;
  inPlace = false;
  if (!again) page.innerHTML = `<p>${loading}</p>`;
  return {
    page,
    current() {
      if (mine !== latest) throw new Superseded();
      if (!again) return;
      const x = scrollX, y = scrollY, inner = [...page.querySelectorAll(SCROLLED)].map(e => [e.scrollLeft, e.scrollTop]);
      restore = () => { page.querySelectorAll(SCROLLED).forEach((e, i) => inner[i] && e.scrollTo(...inner[i])); scrollTo(x, y); };
    },
    refresh: () => location.hash === at ? show(redraw, true) : undefined
  };
}

// Runs a page render to its end. A failure is shown on the page, unless a newer render owns it by then.
export async function show(render, again = false) {
  const mine = latest + 1; // the number startRender is about to give this render
  inPlace = again; restore = null;
  try { await render(); restore?.(); }
  catch (e) {
    if (mine !== latest || e instanceof Superseded) return;
    $('#page').innerHTML = '<p class="msg"></p>';
    $('#page').firstChild.textContent = `Could not load: ${e.message}`;
  }
}
