// Replacing a module in a test (node:test's mock.module). Node renamed the option on the way from
// 22 to 24: `namedExports` + `defaultExport` became one `exports` (with `default` inside), and the
// old names now warn. The tests say it the new way; this passes it on in the form the running Node
// understands, so `npm test` works on every version package.json allows.
//   mockModule('./claude.js', { ask: async () => 'an answer' })
//   mockModule('node:fs', { default: { readFileSync() {} } })
// A relative path is relative to this folder (server/), where every test file lives.
import { mock } from 'node:test';

const modern = Number(process.versions.node.split('.')[0]) >= 24;
export function mockModule(specifier, exports) {
  const { default: defaultExport, ...namedExports } = exports;
  return mock.module(specifier, modern ? { exports } : { namedExports, ...('default' in exports && { defaultExport }) });
}
