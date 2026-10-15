import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRemoval, numberOf } from './jda-removal.js';

// A stand-in for Firestore: collections of { id, fields }, and a versions subcollection per report.
const fakeDb = (data, versions = {}) => {
  const docs = (rows, coll) => rows.map(([id, fields]) => ({ id, get: f => fields[f], ref: { coll, id, collection: () => ({ get: async () => ({ docs: docs(versions[id] || [], `${coll}/${id}/versions`) }) }) } }));
  return { collection: coll => ({ get: async () => ({ docs: docs(data[coll] || [], coll) }) }) };
};
const ids = list => list.map(d => d.id).sort();

test('numberOf reads the JDA number from a name', () => {
  assert.equal(numberOf('JDA 4'), 4);
  assert.equal(numberOf(' jda12 '), 12);
  assert.ok(Number.isNaN(numberOf('Unsorted')));
  assert.ok(Number.isNaN(numberOf('JDA 4 extension')));
});

test('removes JDA 4 and above with everything that hangs off them, and nothing else', async () => {
  const db = fakeDb({
    jdas: [['j1', { name: 'JDA 1' }], ['j3', { name: 'JDA 3' }], ['j4', { name: 'JDA 4' }], ['j5', { name: 'JDA 5' }], ['ju', { name: 'Unsorted' }]],
    projects: [['AA', { jdaId: 'j1' }], ['DA', { jdaId: 'j4' }], ['DB', { jdaId: 'j4' }], ['EA', { jdaId: 'j5' }], ['UN', { jdaId: 'ju' }]],
    financeEntries: [['e1', { jdaId: 'j1', projectId: 'AA' }], ['e2', { jdaId: 'j4', projectId: 'DA' }], ['e3', { jdaId: 'ju', projectId: 'DB' }]],
    financeSanctioned: [['s1', { jdaId: 'j1', projectId: 'AA' }], ['s2', { jdaId: 'j5', projectId: 'EA' }]],
    financeAudit: [['a1', { entityId: 'e1', jdaId: 'j1', projectId: 'AA' }], ['a2', { entityId: 'e2', jdaId: 'j4', projectId: 'DA' }], ['a3', { entityId: 'e3', jdaId: '', projectId: '' }], ['a4', { entityId: 'settings' }]],
    activity: [['l1', { projectId: 'AA' }], ['l2', { projectId: 'j4' }], ['l3', { projectId: 'DB' }], ['l4', { projectId: 'j1' }]],
    jdaReports: [['jda1', {}], ['jda3', {}], ['jda4', {}]]
  }, { jda4: [['v1', {}], ['v2', {}]], jda1: [['v9', {}]] });
  const plan = await planRemoval(db);
  assert.deepEqual(ids(plan.jdas), ['j4', 'j5']);
  assert.deepEqual(ids(plan.projects), ['DA', 'DB', 'EA']);
  assert.deepEqual(ids(plan.financeEntries), ['e2', 'e3']);          // e3 is filed under Unsorted but belongs to project DB
  assert.deepEqual(ids(plan.financeSanctioned), ['s2']);
  assert.deepEqual(ids(plan.financeAudit), ['a2', 'a3']);            // a3 only by the record it is about
  assert.deepEqual(ids(plan.activity), ['l2', 'l3']);
  assert.deepEqual(plan['jdaReports (with versions)'].map(d => d.id), ['v1', 'v2', 'jda4']); // versions before their document
});

test('`from` moves the cut-off', async () => {
  const db = fakeDb({ jdas: [['j4', { name: 'JDA 4' }], ['j5', { name: 'JDA 5' }]], jdaReports: [['jda4', {}], ['jda5', {}]] });
  const plan = await planRemoval(db, 5);
  assert.deepEqual(ids(plan.jdas), ['j5']);
  assert.deepEqual(ids(plan['jdaReports (with versions)']), ['jda5']);
});
