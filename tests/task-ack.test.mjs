import assert from 'node:assert/strict';
import test from 'node:test';

import { attendanceDue, compareTasks, countdownText, isoDow, remaining } from '../lib/tasks/deadline.ts';

test('countdown reads hh:mm:ss, with days when there are days left', () => {
  assert.equal(countdownText(2 * 3600_000 + 14 * 60_000 + 35_000), '02:14:35');
  assert.equal(countdownText(3 * 86_400_000 + 5_000), '3 kun 00:00:05');
  assert.equal(countdownText(-5), '00:00:00');
});

test('deadline states: none, left (soon in the last 3 hours), over', () => {
  const now = Date.parse('2026-10-31T10:00:00Z');
  assert.deepEqual(remaining(null, now), { kind: 'none' });
  assert.deepEqual(remaining('not a date', now), { kind: 'none' });
  assert.equal(remaining('2026-10-31T09:59:59Z', now).kind, 'over');
  assert.equal(remaining('2026-10-31T10:00:00Z', now).kind, 'over');
  const soon = remaining('2026-10-31T12:00:00Z', now);
  assert.equal(soon.kind, 'left');
  assert.equal(soon.soon, true);
  assert.equal(remaining('2026-11-01T10:00:00Z', now).soon, false);
});

test('my tasks: not accepted first, then overdue, nearest deadline, no deadline, finished last', () => {
  const now = Date.parse('2026-10-31T10:00:00Z');
  const list = [
    { id: 'done', status: 'done', due_at: '2026-10-30T10:00:00Z' },
    { id: 'none', status: 'todo', due_at: null },
    { id: 'later', status: 'todo', due_at: '2026-11-03T10:00:00Z' },
    { id: 'soon', status: 'in_progress', due_at: '2026-10-31T12:00:00Z' },
    { id: 'over', status: 'todo', due_at: '2026-10-31T08:00:00Z' },
    { id: 'new', status: 'todo', due_at: '2026-11-05T10:00:00Z', pendingAck: true },
  ];
  assert.deepEqual(
    [...list].sort((a, b) => compareTasks(a, b, now)).map((t) => t.id),
    ['new', 'over', 'soon', 'later', 'none', 'done'],
  );
});

test('ISO weekday of a date key', () => {
  assert.equal(isoDow('2026-11-02'), 1); // Monday
  assert.equal(isoDow('2026-10-31'), 6); // Saturday
  assert.equal(isoDow('2026-11-01'), 7); // Sunday
});

test('KELDIM is asked only when due: active, working day, hired, nothing recorded, window open', () => {
  const base = { status: 'active', workDays: [1, 2, 3, 4, 5], hiredOn: '2026-01-10', hasRecord: false, today: '2026-11-02', nowTime: '10:05', from: '09:45', workEnd: '18:00:00' };
  assert.equal(attendanceDue(base), true);
  assert.equal(attendanceDue({ ...base, hasRecord: true }), false, 'already marked (or ta’til / ruxsatli set)');
  assert.equal(attendanceDue({ ...base, status: 'on_leave' }), false, 'on leave');
  assert.equal(attendanceDue({ ...base, today: '2026-11-01' }), false, 'day off');
  assert.equal(attendanceDue({ ...base, hiredOn: '2026-12-01' }), false, 'not hired yet');
  assert.equal(attendanceDue({ ...base, nowTime: '09:44' }), false, 'before 09:45 the button is closed');
  assert.equal(attendanceDue({ ...base, nowTime: '09:45' }), true);
  assert.equal(attendanceDue({ ...base, nowTime: '18:00' }), false, 'the window has passed');
  assert.equal(attendanceDue({ ...base, workEnd: null, nowTime: '17:59' }), true, 'default end 18:00');
  assert.equal(attendanceDue({ ...base, workDays: [] }), false);
});
