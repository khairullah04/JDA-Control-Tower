// node --test task-migration.test.mjs
// The Weekly progress task fields written into stored reports, and taken out again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsMigration, migrateTasks, revertTasks } from './task-migration.js';

const old = [{ task: 'Pilot', project: 'P1', projectId: 'p1', owner: 'IBM', due: '2026-09-12', status: 'In progress' }];

test('old tasks are found, given the new fields, and given back unchanged by revert', () => {
  assert.equal(needsMigration(old), true);
  const now = migrateTasks(old);
  assert.equal(needsMigration(now), false);
  assert.deepEqual(Object.keys(now[0]).sort(), ['checklist', 'completed', 'description', 'due', 'id', 'notes', 'owner', 'priority', 'progress', 'project', 'projectId', 'start', 'status', 'task', 'updatedAt']);
  assert.deepEqual(revertTasks(now), old);
  assert.deepEqual(migrateTasks(now), now);                                           // a second run changes nothing
});

test('revert keeps what was written into a new field since', () => {
  const [t] = migrateTasks(old);
  const [back] = revertTasks([{ ...t, notes: 'Waiting on IT', priority: 'High' }]);
  assert.deepEqual([back.notes, back.priority, back.id, 'description' in back], ['Waiting on IT', 'High', t.id, false]);
});

test('no tasks, or not a list: nothing to do', () => {
  assert.equal(needsMigration(undefined), false);
  assert.deepEqual(migrateTasks(null), []);
});
