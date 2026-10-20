// Connector circuit breaker (Part 11 REQ-INTG-F01; plan §2.1 option (a)). It opens after repeated failures inside a window, rejects
// calls while open, admits one probe after a cooldown, and closes on a successful probe. State is held in process memory in S1;
// Part 09 S4 moves the implementation into the shared resilience library, and multi-instance state needs that move.

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerOptions {
  /** Failures inside `windowMs` that open the breaker. */
  threshold: number;
  windowMs: number;
  /** Time the breaker stays open before one probe is admitted. */
  cooldownMs: number;
}

export const DEFAULT_BREAKER: BreakerOptions = { threshold: 5, windowMs: 60_000, cooldownMs: 30_000 };

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures: number[] = [];
  private openedAt = 0;
  private probing = false;

  constructor(private readonly options: BreakerOptions = DEFAULT_BREAKER, private readonly now: () => number = Date.now) {}

  current(): BreakerState {
    return this.state;
  }

  /** Whether a call may proceed now. In the half-open state exactly one probe is admitted at a time. */
  allow(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.now() - this.openedAt < this.options.cooldownMs) return false;
      this.state = "half_open";
      this.probing = false;
    }
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  success(): void {
    this.state = "closed";
    this.failures = [];
    this.probing = false;
  }

  /** Records a failure. Returns true when this failure opened the breaker. */
  failure(): boolean {
    const t = this.now();
    if (this.state === "half_open") {
      this.open(t);
      return true;
    }
    this.failures = this.failures.filter((f) => t - f < this.options.windowMs);
    this.failures.push(t);
    if (this.failures.length >= this.options.threshold) {
      this.open(t);
      return true;
    }
    return false;
  }

  private open(t: number): void {
    this.state = "open";
    this.openedAt = t;
    this.failures = [];
    this.probing = false;
  }

  retryAfterMs(): number {
    if (this.state !== "open") return 0;
    return Math.max(0, this.options.cooldownMs - (this.now() - this.openedAt));
  }
}
