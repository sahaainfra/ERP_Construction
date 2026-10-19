// Token-bucket rate limiter (Part 05 REQ-CORE-F13). In-process only; the Redis-backed store is deferred (CF-027).
export interface BucketPolicy {
  capacity: number;
  refillPerSecond: number;
}

export class TokenBuckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly policy: BucketPolicy, private readonly now: () => number = () => Date.now()) {}

  /** Key is namespaced by tenant and subject, for example "t1:user:42" or "t1:integration:acme". */
  take(key: string, cost = 1): { allowed: boolean; remaining: number } {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.policy.capacity, at: t };
    const refilled = Math.min(this.policy.capacity, b.tokens + ((t - b.at) / 1000) * this.policy.refillPerSecond);
    if (refilled < cost) {
      this.buckets.set(key, { tokens: refilled, at: t });
      return { allowed: false, remaining: Math.floor(refilled) };
    }
    this.buckets.set(key, { tokens: refilled - cost, at: t });
    return { allowed: true, remaining: Math.floor(refilled - cost) };
  }
}

export const nsKey = (tenantId: string, subject: string): string => `${tenantId}:${subject}`;
