// The relay server, end to end: real sockets against a server on a random port.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { ClientToServer, RoomView, ServerToClient } from '../shared/protocol';

type Client = Socket<ServerToClient, ClientToServer> & { id_: string; room: RoomView | null; inbox: { from: string; data: unknown; to?: string }[] };

let srv: Awaited<ReturnType<typeof startServer>>;
let url = '';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-party-test-'));
const clients: Client[] = [];

before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', dataDir });
  url = `http://127.0.0.1:${srv.port}`;
});
after(async () => {
  clients.forEach((c) => c.disconnect());
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, what: string, ms = 2000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await sleep(10);
  }
}

async function client(name: string): Promise<Client> {
  const s = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  s.id_ = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
  s.room = null;
  s.inbox = [];
  s.on('room:state', (r) => (s.room = r));
  s.on('room:msg', (m) => s.inbox.push(m));
  await new Promise<void>((resolve) => s.on('connect', () => resolve()));
  s.emit('hello', { clientId: s.id_, name, avatar: '🐱' });
  clients.push(s);
  await sleep(30);
  return s;
}
const create = (c: Client, extra: Partial<{ min: number; max: number; public: boolean }> = {}) =>
  new Promise<string>((resolve, reject) =>
    c.emit('room:create', { gameId: 'test-game', min: 2, max: 4, options: { a: 1 }, public: false, ...extra }, (r) => (r.ok ? resolve(r.code) : reject(new Error(r.error)))),
  );
const join = (c: Client, code: string) => new Promise<{ ok: boolean; error?: string }>((resolve) => c.emit('room:join', { code }, (r) => resolve(r.ok ? { ok: true } : { ok: false, error: r.error })));

test('create, join by code, relay to everyone else and to one seat', async () => {
  const a = await client('Amy');
  const b = await client('Ben');
  const c = await client('Cat');
  const code = await create(a);
  assert.match(code, /^[A-Z]{4}$/);
  assert.deepEqual(await join(b, code.toLowerCase()), { ok: true }, 'codes are case-insensitive');
  await join(c, code);
  await until(() => a.room?.players.length === 3, 'three seats');
  assert.equal(a.room!.hostId, a.id_);

  a.emit('room:msg', { data: { t: 'hi' } });
  await until(() => b.inbox.length === 1 && c.inbox.length === 1, 'broadcast');
  assert.deepEqual(b.inbox[0], { from: a.id_, data: { t: 'hi' } });
  await sleep(50);
  assert.equal(a.inbox.length, 0, 'never echoed back to the sender');

  b.emit('room:msg', { data: { t: 'psst' }, to: c.id_ });
  await until(() => c.inbox.length === 2, 'direct message');
  await sleep(50);
  assert.equal(a.inbox.length, 0, 'direct message is not broadcast');
});

test('bots: only the host speaks for them; messages to a bot reach the host', async () => {
  const a = await client('Host');
  const b = await client('Guest');
  const code = await create(a);
  await join(b, code);
  a.emit('room:bot:add', { name: 'Beep', avatar: '🤖', level: 2 });
  await until(() => !!a.room?.players.find((p) => p.bot), 'bot seat');
  const bot = a.room!.players.find((p) => p.bot)!;
  assert.equal(bot.bot!.level, 2);

  a.emit('room:msg', { data: { t: 'from-bot' }, as: bot.id });
  await until(() => b.inbox.some((m) => (m.data as { t: string }).t === 'from-bot'), 'bot message');
  assert.equal(b.inbox.at(-1)!.from, bot.id);

  b.emit('room:msg', { data: { t: 'spoof' }, as: bot.id });
  b.emit('room:msg', { data: { t: 'to-bot' }, to: bot.id });
  await until(() => a.inbox.some((m) => (m.data as { t: string }).t === 'to-bot'), 'message for the bot');
  assert.equal(a.inbox.find((m) => (m.data as { t: string }).t === 'to-bot')!.to, bot.id);
  await sleep(50);
  assert.ok(!a.inbox.some((m) => (m.data as { t: string }).t === 'spoof'), 'a guest cannot speak as a bot');
});

test('start needs the minimum seats; late joiners spectate until the next game', async () => {
  const a = await client('Ann');
  const code = await create(a, { min: 2 });
  a.emit('room:start');
  await sleep(80);
  assert.equal(a.room!.status, 'waiting', 'one seat is not enough');
  a.emit('room:bot:add', { name: 'Bot', avatar: '🤖', level: 1 });
  await until(() => a.room!.players.length === 2, 'bot added');
  a.emit('room:start');
  await until(() => a.room!.status === 'playing' && a.room!.round === 1, 'started');

  const late = await client('Late');
  assert.deepEqual(await join(late, code), { ok: true });
  await until(() => !!late.room, 'late joiner sees the room');
  assert.equal(late.room!.players.find((p) => p.id === late.id_)!.spectator, true);

  a.emit('room:end');
  await until(() => late.room?.status === 'waiting', 'back to the waiting room');
  assert.ok(!late.room!.players.find((p) => p.id === late.id_)!.spectator, 'spectator got a seat');
});

test('full rooms, a human replaces a bot, kicks stick', async () => {
  const a = await client('Kim');
  const code = await create(a, { min: 2, max: 2 });
  a.emit('room:bot:add', { name: 'Bot', avatar: '🤖', level: 1 });
  await until(() => a.room!.players.length === 2, 'bot seated');
  const b = await client('Lee');
  assert.deepEqual(await join(b, code), { ok: true }, 'a human takes the bot seat');
  await until(() => a.room!.players.length === 2 && !a.room!.players.some((p) => p.bot), 'bot replaced');
  const c = await client('Max');
  assert.deepEqual(await join(c, code), { ok: false, error: 'full' });

  a.emit('room:kick', { id: b.id_ });
  await until(() => b.room === null, 'kicked player is out');
  assert.deepEqual(await join(b, code), { ok: false, error: 'kicked' });
});

test('the host leaving hands the room to the next human; the last human closes it', async () => {
  const a = await client('Old');
  const b = await client('New');
  const code = await create(a);
  await join(b, code);
  await until(() => b.room?.players.length === 2, 'two seats');
  a.emit('room:leave');
  await until(() => b.room?.hostId === b.id_, 'host migrated');
  assert.equal(a.room, null);
  b.emit('room:leave');
  await until(() => b.room === null, 'left');
  const c = await client('Nobody');
  assert.deepEqual(await join(c, code), { ok: false, error: 'not-found' });
});

test('reconnecting with the same id keeps the seat', async () => {
  const a = await client('Re');
  const code = await create(a);
  const id = a.id_;
  a.disconnect();
  await sleep(100);
  const again = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  clients.push(again);
  let room: RoomView | null = null;
  again.on('room:state', (r) => (room = r));
  await new Promise<void>((resolve) => again.on('connect', () => resolve()));
  again.emit('hello', { clientId: id, name: 'Re' });
  await until(() => (room as RoomView | null)?.code === code, 'seat restored');
});

test('public rooms show up in the lobby list', async () => {
  const watcher = await client('Watcher');
  let lobby: { rooms: { code: string }[] } = { rooms: [] };
  watcher.on('lobby', (l) => (lobby = l));
  const a = await client('Pub');
  const code = await create(a, { public: true });
  await until(() => lobby.rooms.some((r) => r.code === code), 'listed', 3000);
});

test('kv storage round trip', async () => {
  const put = await fetch(`${url}/api/kv/test:one`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 1 }) });
  assert.equal(put.status, 200);
  assert.deepEqual(await (await fetch(`${url}/api/kv/test:one`)).json(), { x: 1 });
  const list = (await (await fetch(`${url}/api/kv?prefix=test:`)).json()) as { key: string }[];
  assert.equal(list.length, 1);
  await fetch(`${url}/api/kv/test:one`, { method: 'DELETE' });
  assert.equal((await fetch(`${url}/api/kv/test:one`)).status, 404);
});
