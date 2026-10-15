// Where a picture lives. Reports, the built-in JDA content and the Drive sync name the stock pictures
// as "assets/<file>" (the old flat folder); they now sit in web/shared/assets/<section>/, served at
// /shared/assets/<section>/. Anything else (a web address, a path already resolved) is left as it is.
const SECTION = name =>
  /^sol-/.test(name) ? 'solutions'
  : /logo|icon/.test(name) ? 'brand'
  : 'photos';

export function assetUrl(src) {
  const m = /^assets\/([\w.-]+)$/.exec(String(src || '').trim());
  return m ? `/shared/assets/${SECTION(m[1])}/${m[1]}` : src;
}
