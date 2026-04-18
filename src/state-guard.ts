export class StateGuard {
  private readonly ttlMs: number;
  private readonly seen = new Map<string, number>();

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /**
   * Returns true if the key was newly reserved; false if still within TTL (duplicate window).
   */
  reserve(key: string): boolean {
    const now = Date.now();
    this.prune(now);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now);
    return true;
  }

  release(key: string): void {
    this.seen.delete(key);
  }

  private prune(now: number): void {
    for (const [k, t] of this.seen) {
      if (now - t > this.ttlMs) this.seen.delete(k);
    }
  }
}
