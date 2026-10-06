// Paper Party server: static files + generic storage + the room relay. It never contains game rules.
//
// Config (env):
//   PORT            listen port (default 3330; `--port 1234` on the command line wins)
//   HOST            bind address (default 0.0.0.0)
//   DATA_DIR        where kv / uploads go (default ./data)
//   KV=off          disable /api/kv              FILES=off        disable /api/files
//   KV_MAX_KEYS, KV_MAX_KB, FILES_MAX_MB, FILES_TTL_DAYS   storage limits
//   CORS_ORIGIN     allowed origin(s) for the socket, comma separated (default: same origin only)
//   TRUST_PROXY=1   behind a reverse proxy (correct client IPs for rate limits)
import path from 'node:path';
import { startServer } from './app';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const env = process.env;
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

const { port } = await startServer({
  port: Number(arg('port') ?? env.PORT ?? 3330),
  host: env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR ?? 'data'),
  distDir: path.resolve('dist'),
  kv: env.KV !== 'off',
  files: env.FILES !== 'off',
  kvMaxKeys: num(env.KV_MAX_KEYS),
  kvMaxKB: num(env.KV_MAX_KB),
  filesMaxMB: num(env.FILES_MAX_MB),
  filesTtlDays: num(env.FILES_TTL_DAYS),
  corsOrigin: env.CORS_ORIGIN,
  trustProxy: env.TRUST_PROXY,
});
console.log(`paper-party listening on http://localhost:${port}`);
