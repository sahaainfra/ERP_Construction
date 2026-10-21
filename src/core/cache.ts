// Tenant-namespaced cache with event-driven invalidation (Part 05 REQ-CORE-F13). In-process; a shared store is deferred (CF-027).
export class TenantCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = () => Date.now()) {}

  private k(tenantId: string, key: string): string {
    return `${tenantId}|${key}`;
  }

  get(tenantId: string, key: string): V | undefined {
    const e = this.entries.get(this.k(tenantId, key));
    if (!e) return undefined;
    if (e.expires <= this.now()) {
      this.entries.delete(this.k(tenantId, key));
      return undefined;
    }
    return e.value;
  }

  set(tenantId: string, key: string, value: V): void {
    this.entries.set(this.k(tenantId, key), { value, expires: this.now() + this.ttlMs });
  }

  /** Invalidates every key under a prefix for one tenant, for example when a setting changes. */
  invalidatePrefix(tenantId: string, prefix: string): number {
    let removed = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(`${tenantId}|${prefix}`)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
