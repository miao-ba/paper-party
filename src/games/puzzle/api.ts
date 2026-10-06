import type { PuzzleSave } from './engine';

export async function uploadImage(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((ok, err) => canvas.toBlob((b) => (b ? ok(b) : err(new Error('toBlob'))), 'image/jpeg', 0.88));
  const res = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error('上傳失敗');
  return (await res.json()).url as string;
}

const KEY = (id: string) => `puzzle:${id}`;

export async function listSaves(): Promise<PuzzleSave[]> {
  const res = await fetch('/api/kv?prefix=puzzle:');
  const items: { key: string; value: PuzzleSave }[] = await res.json();
  return items.map((i) => i.value).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function putSave(save: PuzzleSave) {
  await fetch(`/api/kv/${KEY(save.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(save) });
}
export async function deleteSave(id: string) {
  await fetch(`/api/kv/${KEY(id)}`, { method: 'DELETE' });
}
