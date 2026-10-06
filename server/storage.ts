// Generic storage any game may use: a small key-value store (save games, shared drawings…) and
// image uploads. Files live in DATA_DIR. Both can be switched off for a locked-down public deployment.
//
//   GET    /api/kv?prefix=puzzle:   → [{ key, value }]   (max 200)
//   GET    /api/kv/:key             → value
//   PUT    /api/kv/:key  (JSON)     → { ok }
//   DELETE /api/kv/:key             → { ok }
//   POST   /api/files    (image/*)  → { id, url }
//   GET    /api/files/:id
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';

export interface StorageConfig {
  dir: string;
  kv: boolean;
  files: boolean;
  kvMaxKeys: number;
  kvMaxBytes: number;
  fileMaxBytes: number;
  fileTtlDays: number;
}

/** Windows file names cannot contain ':' and friends. */
const safeKey = (k: string) => k.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Fixed-window limiter per IP. */
function perIp(limit: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { n: number; until: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.until < now) hits.set(key, { n: 1, until: now + windowMs });
    else if (++h.n > limit) return void res.status(429).json({ error: 'slow down' });
    next();
  };
}

export function mountStorage(app: Express, cfg: StorageConfig) {
  const KV = path.join(cfg.dir, 'kv');
  const FILES = path.join(cfg.dir, 'files');

  if (cfg.kv) {
    fs.mkdirSync(KV, { recursive: true });
    const file = (k: string) => path.join(KV, safeKey(k) + '.json');
    const writes = perIp(120, 60_000);

    app.get('/api/kv', (req, res) => {
      const prefix = safeKey(String(req.query.prefix ?? ''));
      const items = fs
        .readdirSync(KV)
        .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
        .slice(0, 200)
        .flatMap((f) => {
          try {
            return [{ key: f.slice(0, -5), value: JSON.parse(fs.readFileSync(path.join(KV, f), 'utf8')) }];
          } catch {
            return [];
          }
        });
      res.json(items);
    });
    app.get('/api/kv/:key', (req, res) => {
      const f = file(req.params.key);
      if (!fs.existsSync(f)) return void res.status(404).json({ error: 'not found' });
      res.type('json').send(fs.readFileSync(f));
    });
    app.put('/api/kv/:key', writes, express.json({ limit: cfg.kvMaxBytes }), (req, res) => {
      const f = file(req.params.key);
      if (!fs.existsSync(f) && fs.readdirSync(KV).length >= cfg.kvMaxKeys) return void res.status(507).json({ error: 'kv full' });
      fs.writeFileSync(f, JSON.stringify(req.body));
      res.json({ ok: true });
    });
    app.delete('/api/kv/:key', writes, (req, res) => {
      const f = file(req.params.key);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      res.json({ ok: true });
    });
  }

  if (cfg.files) {
    fs.mkdirSync(FILES, { recursive: true });
    app.use('/api/files', express.static(FILES, { maxAge: '365d', immutable: true }));
    app.post('/api/files', perIp(20, 60_000), express.raw({ type: 'image/*', limit: cfg.fileMaxBytes }), (req, res) => {
      const ext = EXT[req.headers['content-type'] ?? ''];
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: 'image only' });
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      fs.writeFileSync(path.join(FILES, id), req.body);
      res.json({ id, url: `/api/files/${id}` });
    });
    // Old uploads are deleted (games should treat uploads as temporary).
    const sweep = () => {
      const cutoff = Date.now() - cfg.fileTtlDays * 86_400_000;
      for (const f of fs.readdirSync(FILES)) {
        const p = path.join(FILES, f);
        try {
          if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    };
    sweep();
    setInterval(sweep, 3_600_000).unref();
  }

  const off: RequestHandler = (_req, res) => void res.status(404).json({ error: 'disabled on this server' });
  if (!cfg.kv) app.use('/api/kv', off);
  if (!cfg.files) app.use('/api/files', off);
}
