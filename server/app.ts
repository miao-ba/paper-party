// The whole server as a function, so tests can start one on a random port.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { attachRooms } from './rooms';
import { mountStorage } from './storage';
import { LIMITS, type ClientToServer, type ServerToClient } from '../shared/protocol';

export interface ServerOptions {
  port: number;
  host?: string;
  dataDir: string;
  /** Serve the built client from here (if it exists). */
  distDir?: string;
  kv?: boolean;
  files?: boolean;
  kvMaxKeys?: number;
  kvMaxKB?: number;
  filesMaxMB?: number;
  filesTtlDays?: number;
  corsOrigin?: string;
  trustProxy?: string;
}

export async function startServer(o: ServerOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (o.trustProxy) app.set('trust proxy', o.trustProxy === '1' ? 1 : o.trustProxy);

  mountStorage(app, {
    dir: o.dataDir,
    kv: o.kv ?? true,
    files: o.files ?? true,
    kvMaxKeys: o.kvMaxKeys ?? 5000,
    kvMaxBytes: (o.kvMaxKB ?? 256) * 1024,
    fileMaxBytes: (o.filesMaxMB ?? 4) * 1024 * 1024,
    fileTtlDays: o.filesTtlDays ?? 30,
  });

  const server = http.createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(server, {
    maxHttpBufferSize: LIMITS.msgBytes * 2,
    cors: o.corsOrigin ? { origin: o.corsOrigin.split(',').map((s) => s.trim()) } : undefined,
  });
  const rooms = attachRooms(io);

  /** LAN addresses, so the share sheet can offer a link that works on the same Wi-Fi / VPN. */
  app.get('/api/info', (_req, res) => {
    const ips = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
      (list ?? []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ name, address: i.address })),
    );
    res.json({ ips, port: (server.address() as { port: number } | null)?.port ?? o.port });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, ...rooms.stats() }));

  const dist = o.distDir && fs.existsSync(o.distDir) ? o.distDir : null;
  if (dist) {
    // Hashed assets are immutable; index.html / version.json must always be fresh.
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(dist, { maxAge: 0, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.send('Dev mode: open the Vite URL (http://localhost:5330) instead. Run `npm run build` to serve the app from here.'));
  }

  await new Promise<void>((resolve) => server.listen(o.port, o.host ?? '0.0.0.0', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    io,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        server.close(() => resolve());
      }),
  };
}
