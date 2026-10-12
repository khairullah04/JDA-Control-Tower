import { chat } from '../services/ai.js';
import { config } from '../config/index.js';
import { $ } from './dom.js';
import { state } from './state.js';
import { mdToHtml } from './markdown.js';

const history = [];
const log = () => $('#copilot-log');

function bubble(role, text) {
  log().insertAdjacentHTML('beforeend', `<div class="bubble ${role}">${mdToHtml(text)}</div>`);
  log().scrollTop = log().scrollHeight;
}

export function refreshCopilot() {
  const ctx = state.context();
  $('#copilot-context').textContent = `Viewing: ${ctx.page || 'Dashboard'}`;
  $('#copilot-chips').innerHTML = (config.copilotChips[state.page] || [])
    .map(t => `<button type="button">${t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</button>`).join('');
}

async function ask(text) {
  bubble('user', text);
  history.push({ role: 'user', content: text });
  bubble('ai', 'Thinking…');
  try {
    const recent = history.slice(-10);
    const reply = await chat(recent.slice(recent.findIndex(m => m.role === 'user')), state.context()); // context = whatever page is open right now
    history.push({ role: 'assistant', content: reply });
    log().lastElementChild.innerHTML = mdToHtml(reply);
  } catch (e) { log().lastElementChild.innerHTML = mdToHtml('Error: ' + e.message); }
}

export function initCopilot() {
  const panel = $('#copilot');
  const toggle = () => { panel.hidden = !panel.hidden; if (!panel.hidden) refreshCopilot(); };
  $('#ask-ai-btn').onclick = toggle;
  $('#copilot-close').onclick = toggle;
  $('#copilot-chips').onclick = e => e.target.matches('button') && ask(e.target.textContent);
  $('#copilot-form').onsubmit = e => {
    e.preventDefault();
    const input = $('#copilot-input');
    ask(input.value); input.value = '';
  };
}
