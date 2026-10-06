// Generic server storage for games (save files, shared drawings, uploaded photos).
// Operators can disable it (KV=off / FILES=off): always handle failures gracefully.
// Prefix your keys with your game id: `kv.set('puzzle:abc', data)`.

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const r = await fetch(`/api/kv/${encodeURIComponent(key)}`);
    return r.ok ? ((await r.json()) as T) : null;
  },
  async list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const r = await fetch(`/api/kv?prefix=${encodeURIComponent(prefix)}`);
    return r.ok ? ((await r.json()) as { key: string; value: T }[]) : [];
  },
  async set(key: string, value: unknown): Promise<boolean> {
    const r = await fetch(`/api/kv/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    return r.ok;
  },
  async remove(key: string): Promise<boolean> {
    const r = await fetch(`/api/kv/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return r.ok;
  },
};

/** Upload an image (jpeg/png/webp/gif). Returns its URL, or null if uploads are off / too big. */
export async function uploadImage(blob: Blob): Promise<string | null> {
  const r = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
  if (!r.ok) return null;
  return ((await r.json()) as { url: string }).url;
}
