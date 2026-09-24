// RNG co seed: xem truoc (preview) va tao that (generate) phai ra CUNG mot ket qua,
// va tao lai duoc ke hoach cu tu seed da luu.
// Thuat toan mulberry32 - ngan, khong phu thuoc thu vien ngoai.

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  next(): number; // [0, 1)
  int(n: number): number; // [0, n)
  pick<T>(arr: T[]): T;
  shuffle<T>(arr: T[]): T[]; // tra mang MOI, khong sua mang goc
}

export function makeRng(seed: string): Rng {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: <T,>(arr: T[]) => arr[int(arr.length)],
    shuffle: <T,>(arr: T[]) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
