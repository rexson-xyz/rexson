/*
 * The in-memory fallback used when no shared store (kv-gateway / Redis REST) is configured. Bounded on every write path:
 *   - every key has a TTL (no write without one; expired keys are dropped on access and on sweep),
 *   - a cap on the number of keys, and a total byte budget over keys + values;
 *   - a write that would pass either limit (after sweeping expired keys) is REFUSED, never silently evicting someone's data.
 * Used for hosted workspaces when no shared store is configured. Unit tested in memkv.test.ts.
 */

type Entry = { value: string; expiresAt: number; bytes: number };

export class MemoryKV {
  private map = new Map<string, Entry>();
  private bytes = 0;
  constructor(
    readonly maxKeys: number,
    readonly maxBytes: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private size(key: string, value: string) {
    return (key.length + value.length) * 2;
  }

  private drop(key: string) {
    const e = this.map.get(key);
    if (!e) return;
    this.bytes -= e.bytes;
    this.map.delete(key);
  }

  sweep() {
    const t = this.now();
    for (const [k, e] of this.map) if (e.expiresAt <= t) this.drop(k);
  }

  get(key: string): string | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now()) {
      this.drop(key);
      return null;
    }
    return e.value;
  }

  /** Sets with a TTL in seconds. False when the key cap or the byte budget would be passed. */
  set(key: string, value: string, ttlSeconds: number): boolean {
    if (!(ttlSeconds > 0)) throw new Error("MemoryKV: every key needs a TTL");
    const bytes = this.size(key, value);
    const old = this.map.get(key);
    const fits = () => this.map.size + (old && this.map.has(key) ? 0 : 1) <= this.maxKeys && this.bytes - (old && this.map.has(key) ? old.bytes : 0) + bytes <= this.maxBytes;
    if (!fits()) this.sweep();
    if (!fits()) return false;
    this.drop(key);
    this.map.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000, bytes });
    this.bytes += bytes;
    return true;
  }

  del(key: string) {
    this.drop(key);
  }

  stats() {
    return { keys: this.map.size, bytes: this.bytes };
  }
}
