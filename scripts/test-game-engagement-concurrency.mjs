// Local-only integration test. A disposable database copies relevant schemas;
// no fixtures, status toggles or ledger deletions touch the developer database.
// Run: node scripts/test-game-engagement-concurrency.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const container = 'supabase_db_SUNMEDIA_ADMIN';
const database = `engagement_race_${process.pid}`;
const docker = (args, input) => execFileSync('docker', ['exec', ...(input ? ['-i'] : []), container, ...args], {
  input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
});
const sql = (query) => docker(['psql', '-X', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'], query);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const players = [randomUUID(), randomUUID()];
const clients = [randomUUID(), randomUUID()];
const sessions = [randomUUID(), randomUUID()];
const definition = randomUUID();
let created = false;

function worker(user, session, suffix) {
  const p = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq']);
  let output = '';
  let error = '';
  const done = new Promise((resolve, reject) => {
    p.stdout.on('data', (chunk) => { output += chunk; });
    p.stderr.on('data', (chunk) => { error += chunk; });
    p.on('error', reject);
    p.on('exit', (code) => code === 0 ? resolve(output) : reject(new Error(error)));
  });
  p.stdin.end(`begin;
    set application_name='engagement_race_${suffix}';
    select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);
    set local role authenticated;
    select public.game_center_finish('${session}');
    -- Keep locks after credit long enough to observe the competing connection.
    select pg_sleep(1.2);
    commit;`);
  return done;
}

try {
  const dump = docker(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema=public', '--schema=private', '--schema=auth', '--no-owner']);
  docker(['createdb', '-U', 'supabase_admin', database]);
  created = true;
  sql(`drop schema public;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create extension "uuid-ossp" with schema extensions;
    create extension pg_trgm with schema extensions;
    create extension btree_gist with schema extensions;`);
  sql(dump);
  sql(`update public.game_engagement_definitions set enabled=false;
    delete from public.game_engagement_daily_awards;
    delete from public.game_engagement_daily_budget;
    update public.game_engagement_settings set daily_coin_cap=2 where game_key='safi-penalty';
    insert into public.game_engagement_definitions(id,game_key,kind,code,title,metric,target,reward_coins,daily_reward_limit)
    values('${definition}','safi-penalty','challenge','race_last_two_coins','Race fixture','GOALS_TOTAL',1,2,1);
    ${players.map((user, i) => `
      insert into auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
      values('${user}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${user}@race.test','{}','{}');
      insert into public.clients(id,name,code) values('${clients[i]}','Race client','RACE${i}');
      insert into public.client_members(client_id,user_id,role_id)
      select '${clients[i]}','${user}',id from public.roles where key='client_owner';
      insert into public.game_sessions(id,user_id,client_id,workspace_id,eligible,game_key,entry_mode,attempt_limit,attempts_used,reward_eligible,pro_reward_eligible)
      values('${sessions[i]}','${user}','${clients[i]}',private.client_workspace_id('${clients[i]}'),false,'safi-penalty','free',10,10,true,false);
      insert into public.game_attempts(session_id,n,params,zone,submitted_at,hit,valid,request_id)
      select '${sessions[i]}',n,'{}',0,clock_timestamp(),true,true,gen_random_uuid() from generate_series(1,10)n;
    `).join('\n')}`);

  const parallel = Promise.all(players.map((user, i) => worker(user, sessions[i], i)));
  let observedLockWait = false;
  for (let n = 0; n < 15; n++) {
    await sleep(80);
    const waiting = sql("select count(*) from pg_stat_activity where datname=current_database() and application_name like 'engagement_race_%' and wait_event_type='Lock'").trim();
    if (Number(waiting) > 0) { observedLockWait = true; break; }
  }
  const outputs = await parallel;
  assert.ok(observedLockWait, 'independent simultaneous transactions actually contend on a database lock');
  const finishes = outputs.map((out) => out.split('\n').filter((line) => line.startsWith('{')).map(JSON.parse).find((value) => 'engagement' in value));
  assert.deepEqual(finishes.map((f) => f.engagement.coinAmount).sort(), [0, 2]);
  const totals = JSON.parse(sql(`select jsonb_build_object(
    'coins',(select coalesce(sum(amount),0) from public.sun_coin_ledger where metadata->>'definitionId'='${definition}'),
    'awards',(select count(*) from public.sun_coin_ledger where metadata->>'definitionId'='${definition}'),
    'completed',(select count(*) from public.game_engagement_progress where definition_id='${definition}' and completed_at is not null),
    'inventory',(select winners from public.game_engagement_daily_awards where definition_id='${definition}' and day_key=private.agency_today()))`).trim());
  assert.deepEqual(totals, { coins: 2, awards: 1, completed: 2, inventory: 1 });

  // Two different connections retry the same winning session simultaneously.
  const winningIndex = finishes.findIndex((f) => f.engagement.coinAmount === 2);
  const retries = await Promise.all([worker(players[winningIndex], sessions[winningIndex], 'retry_a'), worker(players[winningIndex], sessions[winningIndex], 'retry_b')]);
  for (const out of retries) {
    const finish = out.split('\n').filter((line) => line.startsWith('{')).map(JSON.parse).find((value) => 'engagement' in value);
    assert.deepEqual(finish, finishes[winningIndex]);
  }
  assert.equal(Number(sql(`select count(*) from public.sun_coin_ledger where metadata->>'definitionId'='${definition}'`).trim()), 1);
  // Independently exercise the two caps, so one cannot mask a broken other cap.
  for (const scenario of [
    { code: 'budget_only', cap: 4, limit: 10 },
    { code: 'inventory_only', cap: 100, limit: 1 },
  ]) {
    const challenge = randomUUID();
    const rounds = players.map(() => randomUUID());
    sql(`update public.game_engagement_definitions set enabled=false;
      update public.game_engagement_settings set daily_coin_cap=${scenario.cap} where game_key='safi-penalty';
      insert into public.game_engagement_definitions(id,game_key,kind,code,title,metric,target,reward_coins,daily_reward_limit)
      values('${challenge}','safi-penalty','challenge','${scenario.code}','Race fixture','GOALS_TOTAL',1,2,${scenario.limit});
      ${players.map((user, i) => `
        insert into public.game_sessions(id,user_id,client_id,workspace_id,eligible,game_key,entry_mode,attempt_limit,attempts_used,reward_eligible,pro_reward_eligible)
        values('${rounds[i]}','${user}','${clients[i]}',private.client_workspace_id('${clients[i]}'),false,'safi-penalty','free',10,10,true,false);
        insert into public.game_attempts(session_id,n,params,zone,submitted_at,hit,valid,request_id)
        select '${rounds[i]}',n,'{}',0,clock_timestamp(),true,true,gen_random_uuid() from generate_series(1,10)n;
      `).join('\n')}`);
    const results = await Promise.all(players.map((user, i) => worker(user, rounds[i], `${scenario.code}_${i}`)));
    const amounts = results.map((out) => out.split('\n').filter((line) => line.startsWith('{')).map(JSON.parse)
      .find((value) => 'engagement' in value).engagement.coinAmount).sort();
    assert.deepEqual(amounts, [0, 2], scenario.code);
    assert.equal(Number(sql(`select count(*) from public.sun_coin_ledger where metadata->>'definitionId'='${challenge}'`).trim()), 1);
  }
  console.log('PASS: concurrent global cap, independent per-definition inventory, and duplicate finish; lock contention observed.');
} finally {
  if (created) docker(['dropdb', '-U', 'supabase_admin', '--force', database]);
}
