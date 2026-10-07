import { $, esc } from './dom.js';

export function openForm({ title, fields, submit = 'Save', onSubmit }) {
  const d = $('#modal');
  d.innerHTML = `<form><h3>${esc(title)}</h3>
    ${fields.map(f => f.type === 'select'
      ? `<label>${esc(f.label)}<select name="${f.name}" ${f.required === false ? '' : 'required'}>
          ${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select></label>`
      : `<label>${esc(f.label)}
          <input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"
            ${f.accept ? `accept="${f.accept}"` : ''} ${f.type === 'number' ? 'step="any"' : ''} ${f.required === false ? '' : 'required'}></label>`
    ).join('')}
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button>
    <button class="primary">${esc(submit)}</button></div></form>`;
  $('#cancel', d).onclick = () => d.close();
  $('form', d).onsubmit = async e => {
    e.preventDefault();
    const btn = $('.primary', d), msg = $('#form-msg', d);
    btn.disabled = true; msg.style.color = ''; msg.textContent = 'Working…';
    try {
      const fd = new FormData(e.target);
      const values = {};
      fields.forEach(f => values[f.name] = f.type === 'file' ? fd.get(f.name)
        : f.type === 'number' ? Number(fd.get(f.name)) : fd.get(f.name));
      await onSubmit(values);
      d.close();
    } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; btn.disabled = false; }
  };
  d.showModal();
}
