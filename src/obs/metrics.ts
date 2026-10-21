// In-process metrics with Prometheus text output (Part 09 REQ-OBS-F03; A-37 adapted, see D-062). Counters and histograms only.
// Label sets are bounded: each metric keeps at most `MAX_SERIES` label combinations, and extra combinations are dropped and
// counted, so a bad label value cannot exhaust memory (reliability over completeness).
export const MAX_SERIES = 500;
const NAME = /^[a-z_][a-z0-9_]*$/;
const LABEL = /^[a-z_][a-z0-9_]*$/;

type Labels = Record<string, string>;

function key(labelNames: readonly string[], labels: Labels): string {
  for (const name of labelNames) {
    if (typeof labels[name] !== "string") throw new TypeError(`label ${name} is required`);
  }
  return labelNames.map((n) => labels[n]).join("\u0000");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function labelText(labelNames: readonly string[], values: readonly string[], extra?: [string, string]): string {
  const pairs = labelNames.map((n, i) => `${n}="${escapeLabel(values[i])}"`);
  if (extra) pairs.push(`${extra[0]}="${escapeLabel(extra[1])}"`);
  return pairs.length ? `{${pairs.join(",")}}` : "";
}

interface Metric {
  name: string;
  help: string;
  type: "counter" | "histogram";
  labelNames: readonly string[];
  render(): string[];
}

const registry = new Map<string, Metric>();
let dropped = 0;

function register<M extends Metric>(metric: M): M {
  if (!NAME.test(metric.name)) throw new TypeError(`invalid metric name ${metric.name}`);
  for (const l of metric.labelNames) if (!LABEL.test(l)) throw new TypeError(`invalid label name ${l}`);
  if (registry.has(metric.name)) throw new Error(`metric ${metric.name} is already registered`);
  registry.set(metric.name, metric);
  return metric;
}

export class Counter {
  readonly name: string;
  readonly help: string;
  readonly type = "counter" as const;
  readonly labelNames: readonly string[];
  private readonly values = new Map<string, { labels: string[]; value: number }>();

  constructor(name: string, help: string, labelNames: readonly string[]) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  inc(labels: Labels = {}, by = 1): void {
    if (by < 0) throw new RangeError("a counter only goes up");
    const k = key(this.labelNames, labels);
    const entry = this.values.get(k);
    if (entry) {
      entry.value += by;
      return;
    }
    if (this.values.size >= MAX_SERIES) {
      dropped++;
      return;
    }
    this.values.set(k, { labels: this.labelNames.map((n) => labels[n]), value: by });
  }

  value(labels: Labels = {}): number {
    return this.values.get(key(this.labelNames, labels))?.value ?? 0;
  }

  render(): string[] {
    return [...this.values.values()].map((e) => `${this.name}${labelText(this.labelNames, e.labels)} ${e.value}`);
  }
}

export class Histogram {
  readonly name: string;
  readonly help: string;
  readonly type = "histogram" as const;
  readonly labelNames: readonly string[];
  readonly buckets: readonly number[];
  private readonly series = new Map<string, { labels: string[]; counts: number[]; sum: number; count: number }>();

  constructor(name: string, help: string, labelNames: readonly string[], buckets: readonly number[]) {
    if (buckets.some((b, i) => i > 0 && b <= buckets[i - 1])) throw new RangeError("histogram buckets must increase");
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets;
  }

  observe(labels: Labels, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    const k = key(this.labelNames, labels);
    let entry = this.series.get(k);
    if (!entry) {
      if (this.series.size >= MAX_SERIES) {
        dropped++;
        return;
      }
      entry = { labels: this.labelNames.map((n) => labels[n]), counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(k, entry);
    }
    this.buckets.forEach((b, i) => {
      if (value <= b) entry.counts[i]++;
    });
    entry.sum += value;
    entry.count++;
  }

  count(labels: Labels = {}): number {
    return this.series.get(key(this.labelNames, labels))?.count ?? 0;
  }

  render(): string[] {
    const lines: string[] = [];
    for (const e of this.series.values()) {
      this.buckets.forEach((b, i) => {
        lines.push(`${this.name}_bucket${labelText(this.labelNames, e.labels, ["le", String(b)])} ${e.counts[i]}`);
      });
      lines.push(`${this.name}_bucket${labelText(this.labelNames, e.labels, ["le", "+Inf"])} ${e.count}`);
      lines.push(`${this.name}_sum${labelText(this.labelNames, e.labels)} ${e.sum}`);
      lines.push(`${this.name}_count${labelText(this.labelNames, e.labels)} ${e.count}`);
    }
    return lines;
  }
}

export function counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
  return register(new Counter(name, help, labelNames));
}

export function histogram(name: string, help: string, labelNames: readonly string[], buckets: readonly number[]): Histogram {
  return register(new Histogram(name, help, labelNames, buckets));
}

/** Prometheus text exposition for every registered metric, plus a count of label sets that were dropped. */
export function renderPrometheus(): string {
  const out: string[] = [];
  for (const metric of registry.values()) {
    out.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`, ...metric.render());
  }
  out.push("# HELP obs_dropped_series_total Label sets dropped by the series cap", "# TYPE obs_dropped_series_total counter", `obs_dropped_series_total ${dropped}`);
  return out.join("\n") + "\n";
}

/** Test support: clears recorded values but keeps the registrations, so modules that registered at import time still work. */
export function resetMetricValues(): void {
  dropped = 0;
  for (const metric of registry.values()) {
    if (metric instanceof Counter) (metric as unknown as { values: Map<string, unknown> }).values.clear();
    if (metric instanceof Histogram) (metric as unknown as { series: Map<string, unknown> }).series.clear();
  }
}
