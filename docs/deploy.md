# Deploying

Paper Party is one Node process: it serves the built front-end, the socket and the small storage API.
Anything that runs a Node 20+ app with WebSockets works.

```bash
npm ci
npm run build
PORT=8080 npm start          # serves dist/ + socket + /api on :8080
```

Environment variables:

| Var | Default | |
|---|---|---|
| `PORT` | `3330` | Listen port (`--port` on the command line wins) |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Key-value store and uploads |
| `KV` | on | `off` disables `/api/kv` |
| `FILES` | on | `off` disables image uploads |
| `KV_MAX_KEYS` / `KV_MAX_KB` | 5000 / 256 | Storage limits |
| `FILES_MAX_MB` / `FILES_TTL_DAYS` | 4 / 30 | Upload limits |
| `CORS_ORIGIN` | same origin | Comma-separated origins allowed to open the socket |
| `TRUST_PROXY` | – | `1` behind a reverse proxy (real client IPs for rate limits) |

Health check: `GET /api/health` → `{ ok, players, online, rooms }`.

## Docker

```bash
docker build -t paper-party .
docker run -p 8080:8080 -v paper-party-data:/app/data paper-party
```

## Render / Railway / Fly.io / any PaaS

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- The platform sets `PORT`; set `TRUST_PROXY=1`.
- Persistent disk for `DATA_DIR` only if you use kv / uploads (the example games do not).
- Use **one instance** — rooms live in memory (see architecture.md → Scaling). WebSockets must be enabled
  (they are by default on these platforms).

## A small VPS with Caddy (automatic HTTPS)

```
# /etc/caddy/Caddyfile
party.example.com {
  reverse_proxy localhost:3330
}
```

Run the app with a process manager (`pm2 start npm --name paper-party -- start`, or a systemd unit) and
`TRUST_PROXY=1`. HTTPS matters for games that use the microphone, motion sensors or the wake lock.

## Just friends on a LAN / VPN (ZeroTier, Tailscale, Wi-Fi)

`npm run build && npm start` on one computer; friends open `http://<that computer's IP>:3330`. The room's
share sheet shows the LAN address when you are on `localhost`. Plain http is fine for most games.

## Updating

`git pull && npm ci && npm run build` and restart. Open tabs see an "update available" pill (they compare
their build with `/version.json`); players in a room are not interrupted.
