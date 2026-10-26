// Web Push in the database, against a real local Supabase with the seed and the web-push migration, signed in as
// real roles. Run: AGENT_TEST_WORKDIR=<folder with supabase/> npm run test:push
// Each test checks the rows themselves (devices, notifications, the delivery queue), not what an API answered.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

function localStack() {
  const dir = process.env.AGENT_TEST_WORKDIR;
  if (!dir) return null;
  try {
    return JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json', '--workdir', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}
const stack = localStack();
const API = stack?.API_URL ?? 'http://127.0.0.1:0';
const KEY = stack?.PUBLISHABLE_KEY ?? '';
const DB = process.env.AGENT_TEST_DB_CONTAINER ?? 'supabase_db_SUNMEDIA_AGENT_TEST';
const PASSWORD = 'SunMedia2026!';
const sql = (q) => execFileSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-Atc', q], { encoding: 'utf8' }).trim();
const one = (q) => sql(q).split('\n')[0] ?? '';
const reachable = !!stack && (await fetch(`${API}/auth/v1/health`, { headers: { apikey: KEY } }).then((r) => r.ok).catch(() => false));
const migrated = reachable && one(`select count(*) from pg_proc where proname = 'register_web_push'`) === '1';
const skip = !reachable ? 'no local Supabase (set AGENT_TEST_WORKDIR)' : !migrated ? 'web-push migration not applied locally' : false;

async function signIn(email) {
  const db = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { db, userId: data.user.id };
}

// A browser subscription's shape (real keys are random bytes; these have the exact lengths browsers send).
const key = (seed) => Buffer.alloc(65, seed).toString('base64url');
const auth = (seed) => Buffer.alloc(16, seed).toString('base64url');
const endpoint = (n) => `https://fcm.googleapis.com/fcm/send/TEST-${n}`;
let admin;
let operator;
let editor;

function cleanup() {
  sql(`set session_replication_role = replica;
    delete from notification_deliveries where push_token_id in (select id from push_tokens where token like 'https://fcm.googleapis.com/fcm/send/TEST-%');
    delete from push_tokens where token like 'https://fcm.googleapis.com/fcm/send/TEST-%';
    delete from push_settings;
    delete from notification_preferences where type in ('chat.group', 'chat.direct', 'task.rescheduled');
    delete from notifications where type = 'system.test' or body like '%PUSHTEST%' or title like '%PUSHTEST%';
    delete from messages where body like 'PUSHTEST%';
    delete from task_assignments where task_id in (select id from tasks where title like 'PUSHTEST%');
    delete from tasks where title like 'PUSHTEST%';
    update chat_members set muted_until = null;`);
}

before(async () => {
  if (skip) return;
  cleanup();
  admin = await signIn('admin@sunmedia.local');
  operator = await signIn('operator@sunmedia.local');
  editor = await signIn('editor@sunmedia.local');
});
after(() => {
  if (!skip) cleanup();
});

const register = (who, n, extra = {}) =>
  who.db.rpc('register_web_push', { p_endpoint: endpoint(n), p_p256dh: key(n), p_auth: auth(n), p_device_name: 'iPhone · ilova', p_user_agent: 'test', ...extra });
const queued = (userId, n) =>
  one(`select count(*) from notification_deliveries d join notifications x on x.id = d.notification_id join push_tokens t on t.id = d.push_token_id
       where x.user_id = '${userId}' and t.token = '${endpoint(n)}' and d.status = 'pending'`);
const internalRoom = () => one(`select id from chat_rooms where kind = 'internal' limit 1`);
const say = (who, body) => who.db.rpc('send_message', { p_room_id: internalRoom(), p_body: body, p_file_ids: [] });

test('a browser registers as a web device of the signed-in person; bad keys are refused by the database', { skip }, async () => {
  const { data: id, error } = await register(operator, 1);
  assert.equal(error, null);
  assert.equal(one(`select platform || '|' || device_name || '|' || (revoked_at is null) from push_tokens where id = '${id}'`), 'web|iPhone · ilova|true');
  const { error: bad } = await operator.db.rpc('register_web_push', { p_endpoint: 'http://not-https.example/x', p_p256dh: key(1), p_auth: auth(1) });
  assert.ok(bad, 'http endpoint refused');
  const { error: short } = await operator.db.rpc('register_web_push', { p_endpoint: endpoint(99), p_p256dh: 'short', p_auth: auth(1) });
  assert.ok(short, 'malformed key refused');
  const anon = createClient(API, KEY, { auth: { persistSession: false } });
  const { error: noAuth } = await anon.rpc('register_web_push', { p_endpoint: endpoint(98), p_p256dh: key(2), p_auth: auth(2) });
  assert.ok(noAuth, 'not signed in');
});

test('global chat: every member but the sender gets a delivery on each device; the sender none', { skip }, async () => {
  await register(editor, 2);
  const { error } = await say(operator, 'PUSHTEST Ertaga soat 10:00 da yig‘ilish.');
  assert.equal(error, null);
  assert.equal(queued(editor.userId, 2), '1', 'editor gets it');
  assert.equal(queued(operator.userId, 1), '0', 'not the sender');
  assert.equal(one(`select data ->> 'push_category' from notifications where user_id = '${editor.userId}' and body like '%PUSHTEST Ertaga%'`), 'chat.group');
});

test('the person\'s choices are kept: group chats off, quiet hours, a muted chat', { skip }, async () => {
  await editor.db.from('notification_preferences').upsert({ user_id: editor.userId, type: 'chat.group', push_enabled: false, in_app_enabled: true }, { onConflict: 'user_id,type' });
  await say(operator, 'PUSHTEST guruh o‘chiq');
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and body like '%guruh o‘chiq%'`), '1', 'still in the bell');
  assert.equal(queued(editor.userId, 2), '1', 'but no new push (only the earlier one)');
  await editor.db.from('notification_preferences').upsert({ user_id: editor.userId, type: 'chat.group', push_enabled: true, in_app_enabled: true }, { onConflict: 'user_id,type' });

  // Quiet hours around now (Tashkent): low and normal priority wait for the morning; nothing is queued.
  const now = one(`select to_char(now() at time zone 'Asia/Tashkent', 'HH24:MI')`);
  const [h] = now.split(':').map(Number);
  await editor.db.from('push_settings').upsert({ user_id: editor.userId, quiet_start: `${String((h + 23) % 24).padStart(2, '0')}:00`, quiet_end: `${String((h + 1) % 24).padStart(2, '0')}:59` }, { onConflict: 'user_id' });
  await say(operator, 'PUSHTEST sokin soat');
  assert.equal(queued(editor.userId, 2), '1');
  await editor.db.from('push_settings').update({ quiet_start: null, quiet_end: null }).eq('user_id', editor.userId);

  const room = internalRoom();
  await editor.db.from('chat_members').update({ muted_until: 'infinity' }).eq('room_id', room).eq('user_id', editor.userId);
  await say(operator, 'PUSHTEST ovozsiz');
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and body like '%ovozsiz%'`), '0', 'muted: not even in the bell');
  await editor.db.from('chat_members').update({ muted_until: null }).eq('room_id', room).eq('user_id', editor.userId);
});

test('hidden previews: the push says only "Sun Media — Yangi xabar"; the bell keeps the text', { skip }, async () => {
  await editor.db.from('push_settings').upsert({ user_id: editor.userId, hide_preview: true }, { onConflict: 'user_id' });
  sql(`update notification_deliveries set status = 'sent' where status = 'pending'`);
  await say(operator, 'PUSHTEST maxfiy matn');
  const claimed = JSON.parse(sql(`select coalesce(json_agg(c), '[]') from public.claim_push_deliveries(50) c`));
  const mine = claimed.find((c) => c.token === endpoint(2));
  assert.ok(mine, 'claimed for the web device');
  assert.equal(mine.platform, 'web');
  assert.equal(mine.p256dh, key(2));
  assert.equal(mine.auth_secret, auth(2));
  assert.equal(mine.title, 'Sun Media');
  assert.equal(mine.body, 'Yangi xabar');
  assert.ok(Number(mine.badge) >= 1);
  assert.match(one(`select body from notifications where id = '${mine.notification_id}'`), /maxfiy matn/);
  await editor.db.from('push_settings').update({ hide_preview: false }).eq('user_id', editor.userId);
});

test('push service answers: sent updates the device; gone (410) retires it and nothing more is queued for it', { skip }, async () => {
  const [d1] = JSON.parse(sql(`select coalesce(json_agg(d.id), '[]') from notification_deliveries d join push_tokens t on t.id = d.push_token_id where t.token = '${endpoint(2)}'`));
  sql(`select public.complete_push_deliveries('[{"delivery_id": ${d1}, "status": "sent"}]')`);
  assert.equal(one(`select (last_success_at is not null) || '|' || failure_count from push_tokens where token = '${endpoint(2)}'`), 'true|0');
  sql(`select public.complete_push_deliveries('[{"delivery_id": ${d1}, "status": "failed", "error": "Web push HTTP 410", "device_not_registered": true}]')`);
  assert.equal(one(`select revoked_at is not null from push_tokens where token = '${endpoint(2)}'`), 't');
  await say(operator, 'PUSHTEST qurilma yo‘q');
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and body like '%qurilma yo‘q%'`), '1', 'still in the bell');
  assert.equal(
    one(`select count(*) from notification_deliveries d join notifications n on n.id = d.notification_id join push_tokens t on t.id = d.push_token_id where t.token = '${endpoint(2)}' and n.body like '%qurilma yo‘q%'`),
    '0',
    'no push to the retired device',
  );
});

test('another account on the same browser takes the device over; what was queued for the first is not sent there', { skip }, async () => {
  await register(editor, 3);
  await say(operator, 'PUSHTEST birinchi akkaunt uchun');
  assert.equal(queued(editor.userId, 3), '1');
  // Editor signs out without the cookie (the worst case); operator signs in on the same browser.
  await register(operator, 3);
  assert.equal(one(`select user_id from push_tokens where token = '${endpoint(3)}'`), operator.userId);
  assert.equal(queued(editor.userId, 3), '0', 'editor\'s queued push cancelled');
  assert.equal(one(`select error from notification_deliveries d join push_tokens t on t.id = d.push_token_id where t.token = '${endpoint(3)}' order by d.id desc limit 1`), 'device changed account');
});

test('signing out (revoke this device) stops pushes; a person cannot see or revoke another\'s devices', { skip }, async () => {
  const id = one(`select id from push_tokens where token = '${endpoint(3)}'`);
  const { data: theirs } = await editor.db.from('push_tokens').select('id').eq('id', id);
  assert.equal(theirs.length, 0, 'not visible to someone else');
  await editor.db.rpc('revoke_push_device', { p_id: id });
  assert.equal(one(`select revoked_at is null from push_tokens where id = '${id}'`), 't', 'not revocable by someone else');
  await operator.db.rpc('revoke_push_device', { p_id: id });
  assert.equal(one(`select revoked_at is not null from push_tokens where id = '${id}'`), 't');
  const { data: settings } = await editor.db.from('push_settings').select('user_id').eq('user_id', operator.userId);
  assert.equal(settings.length, 0, 'settings are private too');
});

test('tasks: a new deadline and a cancellation reach the people on the task, not the one who changed it', { skip }, async () => {
  await register(editor, 4);
  const { data: taskId, error } = await admin.db.rpc('save_task', {
    p_task_id: null,
    p_payload: { title: 'PUSHTEST SAFI syomka', task_type: 'shooting', priority: 'normal', assignees: [editor.userId], client_id: null, due_at: new Date(Date.now() + 86_400_000).toISOString() },
  });
  assert.equal(error, null);
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and type = 'task.assigned' and entity_id = '${taskId}'`), '1');
  await admin.db.rpc('save_task', { p_task_id: taskId, p_payload: { title: 'PUSHTEST SAFI syomka', due_at: new Date(Date.now() + 2 * 86_400_000).toISOString() } });
  assert.match(one(`select body from notifications where user_id = '${editor.userId}' and type = 'task.rescheduled' and entity_id = '${taskId}'`), /Yangi muddat: \d{2}\.\d{2} \d{2}:\d{2}/);
  await admin.db.rpc('save_task', { p_task_id: taskId, p_payload: { title: 'PUSHTEST SAFI syomka', status: 'cancelled' } });
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and type = 'task.cancelled' and entity_id = '${taskId}'`), '1');
  assert.equal(one(`select count(*) from notifications where user_id = '${admin.userId}' and entity_id = '${taskId}' and type in ('task.rescheduled', 'task.cancelled')`), '0');
  assert.equal(one(`select count(*) from notification_deliveries d join notifications n on n.id = d.notification_id join push_tokens t on t.id = d.push_token_id where t.token = '${endpoint(4)}' and n.entity_id = '${taskId}'`), '3');
});

test('a click is recorded apart from reading; only one\'s own notification opens', { skip }, async () => {
  const n = one(`select id from notifications where user_id = '${editor.userId}' and type = 'task.cancelled' order by created_at desc limit 1`);
  assert.equal(one(`select (clicked_at is null) || '|' || (read_at is null) from notifications where id = '${n}'`), 'true|true');
  const { data: foreign } = await operator.db.rpc('open_notification', { p_id: n });
  assert.equal(foreign, null);
  const { data } = await editor.db.rpc('open_notification', { p_id: n });
  assert.match(data.route, /^\/tasks\//);
  assert.equal(one(`select (clicked_at is not null) || '|' || (read_at is not null) from notifications where id = '${n}'`), 'true|true');
});

test('the test notification reaches oneself, once a minute', { skip }, async () => {
  const first = await editor.db.rpc('send_test_notification');
  assert.equal(first.error, null);
  assert.equal(one(`select count(*) from notifications where user_id = '${editor.userId}' and type = 'system.test'`), '1');
  const again = await editor.db.rpc('send_test_notification');
  assert.match(again.error?.message ?? '', /TEST_TOO_SOON/);
});
