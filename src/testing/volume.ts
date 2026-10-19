// Deterministic volume generator (Part 04 REQ-CICD-F05). Same seed and index range give the same rows on every run.
// mulberry32: a small seeded generator with a full 2^32 period. Used only for test data, never for security.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VolumeRow {
  id: number;
  amountPaise: number;
  code: string;
}

/** Row `id` depends only on (seed, id), so any range can be generated independently. */
export function volumeRow(seed: number, id: number): VolumeRow {
  const rnd = mulberry32((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0);
  const amountPaise = Math.floor(rnd() * 10_000_000);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += letters[Math.floor(rnd() * letters.length)];
  return { id, amountPaise, code };
}

export function volumeRange(seed: number, fromId: number, toId: number): VolumeRow[] {
  const rows: VolumeRow[] = [];
  for (let id = fromId; id <= toId; id++) rows.push(volumeRow(seed, id));
  return rows;
}
