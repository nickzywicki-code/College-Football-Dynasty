// Deterministic seeded PRNG (mulberry32) so a given save seed reproduces
// the same world generation, while in-game sim rolls use a live stream.

export class RNG {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state |= 0
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  weighted<T>(items: { value: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0)
    let roll = this.next() * total
    for (const item of items) {
      if (roll < item.weight) return item.value
      roll -= item.weight
    }
    return items[items.length - 1].value
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // gaussian-ish via sum of uniforms, clamped
  normal(mean: number, stdDev: number): number {
    const u1 = this.next() || 1e-9
    const u2 = this.next()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + z * stdDev
  }
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

let idCounter = 0
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}
