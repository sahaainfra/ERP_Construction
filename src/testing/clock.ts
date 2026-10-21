// Time-travel clock for period-close and SLA tests (Part 04 REQ-CICD-F04). Production code takes a clock; tests pass a fixed one.
export interface Clock {
  now(): Date;
}

export class FixedClock implements Clock {
  private current: Date;

  constructor(start: string | Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export const systemClock: Clock = { now: () => new Date() };
