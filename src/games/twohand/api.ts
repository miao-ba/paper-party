import { edgePoints, type Pt, type Target } from './logic';

/** 存在 kv 的自訂線稿：點壓成 0..1000 的整數省空間 */
export interface CustomSave {
  id: string;
  name: string;
  pts: number[];
  createdAt: number;
}
const KEY = (id: string) => `draw:${id}`;

export const packPts = (pts: Pt[]): number[] => pts.flatMap(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]);
export const unpackPts = (a: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < a.length; i += 2) out.push([a[i] / 1000, a[i + 1] / 1000]);
  return out;
};
export const toTarget = (s: CustomSave): Target => ({ id: s.id, name: s.name, pts: unpackPts(s.pts), custom: true });

export async function listCustom(): Promise<CustomSave[]> {
  const res = await fetch('/api/kv?prefix=draw:');
  const items: { key: string; value: CustomSave }[] = await res.json();
  return items.map((i) => i.value).sort((a, b) => b.createdAt - a.createdAt);
}
export async function putCustom(save: CustomSave) {
  await fetch(`/api/kv/${KEY(save.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(save) });
}
export async function deleteCustom(id: string) {
  await fetch(`/api/kv/${KEY(id)}`, { method: 'DELETE' });
}

/** 讀圖片縮到 maxSide，回 ImageData（邊緣偵測用，不用大） */
export async function loadImageData(file: File, maxSide = 240): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, err) => { img.onload = () => ok(); img.onerror = () => err(new Error('圖片載入失敗')); img.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(img.naturalWidth * k));
    c.height = Math.max(8, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const imageToTarget = (img: ImageData, name: string, strength: number): Target => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name,
  pts: edgePoints(img, strength),
  custom: true,
});
