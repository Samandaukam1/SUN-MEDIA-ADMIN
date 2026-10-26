import assert from 'node:assert/strict';
import test from 'node:test';

import { safeRoute, webPath } from '../lib/pwa/routes.ts';

const room = '6f1c2a9e-1111-4c2b-9b1a-0d6e2f3a4b5c';
const task = 'a0b1c2d3-e4f5-4678-9abc-def012345678';
const client = '11111111-2222-4333-8444-555555555555';

test('a chat notification opens that chat in each area', () => {
  assert.equal(webPath({ route: `/chat/${room}`, area: '/panel', chatKind: 'internal' }), `/chat?xona=${room}`);
  assert.equal(webPath({ route: `/chat/${room}`, area: '/panel', chatKind: 'project' }), `/chat/mijozlar?xona=${room}`);
  assert.equal(webPath({ route: `/chat/${room}`, area: '/xodim', chatKind: 'direct' }), `/xodim/chat?xona=${room}`);
  assert.equal(webPath({ route: `/chat/${room}`, area: '/kabinet', clientId: client }), `/kabinet/chat?brend=${client}`);
});

test('a task opens its own page: the panel task page for managers, the cabinet one for staff', () => {
  assert.equal(webPath({ route: `/tasks/${task}`, area: '/panel' }), `/work/tasks/${task}`);
  assert.equal(webPath({ route: `/task/${task}`, area: '/xodim' }), `/xodim/vazifa/${task}`);
  assert.equal(webPath({ route: '/tasks', area: '/xodim' }), '/xodim');
  assert.equal(webPath({ route: `/tasks/${task}`, area: '/kabinet' }), '/kabinet');
});

test('content, shootings, approvals, reports and the rest land on the matching page or the home of the area', () => {
  assert.equal(webPath({ route: `/content/${task}`, area: '/panel' }), `/work/content/${task}`);
  assert.equal(webPath({ route: `/content/${task}`, area: '/kabinet' }), '/kabinet/reja');
  assert.equal(webPath({ route: `/shootings/${task}`, area: '/panel' }), `/work/shootings/${task}`);
  assert.equal(webPath({ route: `/approvals/${task}`, area: '/panel' }), '/work/approvals');
  assert.equal(webPath({ route: `/reports/${task}`, area: '/kabinet' }), '/kabinet/hisobotlar');
  assert.equal(webPath({ route: '/crm', area: '/panel' }), '/crm');
  assert.equal(webPath({ route: '/plan', area: '/kabinet' }), '/kabinet/tarif');
  assert.equal(webPath({ route: '/team/accounts', area: '/panel' }), '/team/accounts');
  assert.equal(webPath({ route: '/team/accounts', area: '/xodim' }), '/xodim');
  assert.equal(webPath({ route: '/nimadir/boshqa', area: '/xodim' }), '/xodim');
});

test('only same-site paths are followed', () => {
  assert.equal(safeRoute('/chat'), '/chat');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '', null, 'chat']) assert.equal(safeRoute(bad), null, String(bad));
});
