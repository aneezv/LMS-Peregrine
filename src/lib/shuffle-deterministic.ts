/** FNV-1a style hash for stable seeds */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Fisher–Yates shuffle with deterministic PRNG from seed string (same order for same seed). */
export function shuffleDeterministic<T>(items: T[], seed: string): T[] {
  const arr = [...items]
  let state = hashString(seed) || 1
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    return state / 0x100000000
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]!
    arr[j] = t!
  }
  return arr
}
