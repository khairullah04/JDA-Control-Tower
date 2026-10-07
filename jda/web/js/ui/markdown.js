// Minimal, safe markdown renderer for AI chat replies: escapes HTML first, then adds
// bold/italic/code, bullet & numbered lists, headings and pipe tables. No external libraries.
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>');
}

function table(lines) {
  const rows = lines.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  const isSep = r => r.every(c => /^:?-+:?$/.test(c));
  const head = rows[0], body = rows.length > 1 && isSep(rows[1]) ? rows.slice(2) : rows.slice(1);
  const cell = (c, tag) => `<${tag}>${inline(c)}</${tag}>`;
  return `<div class="md-table"><table><tr>${head.map(c => cell(c, 'th')).join('')}</tr>` +
    body.map(r => `<tr>${r.map(c => cell(c, 'td')).join('')}</tr>`).join('') + '</table></div>';
}

export function mdToHtml(raw) {
  const text = escHtml(raw).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol' | null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const block = [line];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) block.push(lines[++i]);
      out.push(table(block));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)/);
    if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (numbered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) { out.push(`<h4>${inline(heading[2])}</h4>`); continue; }
    if (line.trim() === '') { out.push(''); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.filter(Boolean).join('\n');
}
