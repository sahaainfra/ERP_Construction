// Field logic (Part 14 REQ-FIELD-F01, F02, F03; A-118). Pure rules for the field shell and the capture components. The browser code that
// reads cameras, positions and detectors lives in components.tsx and calls these rules, so the rules can be tested without a device.

/** The five bottom-bar slots (REQ-FIELD-F01). `more` is always present and always last. */
export const FIELD_SLOTS = ["today", "inbox", "capture", "tasks", "more"] as const;
export type FieldSlot = (typeof FIELD_SLOTS)[number];

export const FIELD_ROLES = ["site_engineer", "supervisor", "store_keeper", "time_keeper", "qa_qc", "hse_officer", "approver"] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

/** The default order of the four role items for each role. `more` is added by the shell. */
const ROLE_ITEMS: Record<FieldRole, FieldSlot[]> = {
  site_engineer: ["today", "capture", "tasks", "inbox"],
  supervisor: ["today", "tasks", "capture", "inbox"],
  store_keeper: ["today", "capture", "inbox", "tasks"],
  time_keeper: ["today", "capture", "tasks", "inbox"],
  qa_qc: ["today", "tasks", "capture", "inbox"],
  hse_officer: ["today", "capture", "tasks", "inbox"],
  approver: ["today", "inbox", "tasks", "capture"],
};

/** The bottom bar for a role: at most five items, `more` last. Unknown roles get the site engineer's bar. */
export function bottomBarFor(role: string, override?: FieldSlot[]): FieldSlot[] {
  const base = override ?? ROLE_ITEMS[(FIELD_ROLES as readonly string[]).includes(role) ? (role as FieldRole) : "site_engineer"];
  const four = [...new Set(base.filter((s) => s !== "more"))].slice(0, 4);
  return [...four, "more"];
}

/** Compression profile for photos sent from site (REQ-FIELD-F03). Lower quality is used on weak networks. */
export const COMPRESSION_PROFILES = {
  standard: { maxEdge: 1600, quality: 0.7 },
  low: { maxEdge: 1024, quality: 0.6 },
} as const;
export type CompressionProfile = keyof typeof COMPRESSION_PROFILES;

/** The output size for a photo: the longest edge is capped and the aspect ratio kept. Never enlarged. */
export function compressionPlan(width: number, height: number, profile: CompressionProfile): { width: number; height: number; scale: number } {
  if (!(width > 0) || !(height > 0)) throw new RangeError("the image size is not known");
  const cap = COMPRESSION_PROFILES[profile].maxEdge;
  const scale = Math.min(1, cap / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}

export interface GpsReading {
  lat: number;
  lon: number;
  accuracyM: number;
}

/** Accuracy band shown to the person (REQ-FIELD-F03): the number is always shown with its band. */
export type AccuracyBand = "good" | "fair" | "poor" | "unknown";

export function accuracyBand(accuracyM: number | null | undefined): AccuracyBand {
  if (accuracyM === null || accuracyM === undefined || !(accuracyM >= 0)) return "unknown";
  if (accuracyM <= 10) return "good";
  if (accuracyM <= 50) return "fair";
  return "poor";
}

/**
 * Whether a position may be trusted for a record (REQ-FIELD-F03). A position with poor accuracy is recorded but flagged. The OS does
 * not always expose a mock-location signal; where it does not, `mockSignal` is `null` and the record says so.
 */
export function gpsForRecord(reading: GpsReading | null, mockSignal: boolean | null): { value: GpsReading | null; band: AccuracyBand; flagged: boolean; mockSignal: boolean | null } {
  if (!reading) return { value: null, band: "unknown", flagged: true, mockSignal };
  const band = accuracyBand(reading.accuracyM);
  return { value: { lat: round(reading.lat, 6), lon: round(reading.lon, 6), accuracyM: Math.round(reading.accuracyM) }, band, flagged: band === "poor" || mockSignal === true, mockSignal };
}

function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

export interface WatermarkInput {
  project: string;
  site?: string | null;
  gps: GpsReading | null;
  at: Date;
  user: string;
}

/** The watermark lines burned into a photo: project, site, position, time (UTC) and the person who took it (REQ-FIELD-F03). */
export function watermarkLines(input: WatermarkInput): string[] {
  const time = `${input.at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const place = input.gps ? `${input.gps.lat.toFixed(5)}, ${input.gps.lon.toFixed(5)} ±${Math.round(input.gps.accuracyM)} m` : "location not available";
  return [input.project, input.site ?? "", place, time, input.user].filter((l) => l.length > 0);
}

/** What the device can do (REQ-FIELD-F03, A-118). Each capture shows its fallback when a capability is missing. */
export interface DeviceEnvironment {
  camera: boolean;
  geolocation: boolean;
  barcodeDetector: boolean;
  speechRecognition: boolean;
  nfc: boolean;
}

export function captureSupport(env: DeviceEnvironment): Record<keyof DeviceEnvironment, { available: boolean; fallback: string }> {
  return {
    camera: { available: env.camera, fallback: "Choose a photo from the gallery." },
    geolocation: { available: env.geolocation, fallback: "Enter the location by hand." },
    barcodeDetector: { available: env.barcodeDetector, fallback: "Type the code instead." },
    speechRecognition: { available: env.speechRecognition, fallback: "Type the note instead. Voice input is not available on this device." },
    nfc: { available: env.nfc, fallback: "Scan the tag's code instead. NFC is not available on this device." },
  };
}

/** Parses a scanned code. Accepts letters, digits, dot, hyphen and slash, up to 64 characters. Anything else is refused. */
export function parseScanned(text: string): { code: string } | { problem: string } {
  const code = text.trim();
  if (code.length < 1 || code.length > 64) return { problem: "a code is between 1 and 64 characters" };
  if (!/^[A-Za-z0-9./-]+$/.test(code)) return { problem: "the code has characters that are not allowed" };
  return { code };
}

/** A signature stroke point set, as an SVG path. Used to store and show signatures without an image library. */
export function strokesToPath(strokes: { x: number; y: number }[][]): string {
  return strokes
    .filter((s) => s.length > 0)
    .map((s) => `M${s.map((p) => `${round(p.x, 1)} ${round(p.y, 1)}`).join(" L")}`)
    .join(" ");
}

/**
 * The minimum-version rule (REQ-FIELD-F05). A device on an older build must update before it works. Versions are compared numerically
 * part by part (1.10.0 is newer than 1.9.0). A malformed version is treated as too old, so a broken build cannot slip past the rule.
 */
export function versionPolicy(current: string, minimum: string): "ok" | "update-required" {
  const parse = (v: string): number[] | null => {
    if (!/^\d+(\.\d+){0,2}$/.test(v)) return null;
    const parts = v.split(".").map(Number);
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const c = parse(current);
  const m = parse(minimum);
  if (!m) throw new RangeError("the minimum version is not valid");
  if (!c) return "update-required";
  for (let i = 0; i < 3; i++) {
    if (c[i] > m[i]) return "ok";
    if (c[i] < m[i]) return "update-required";
  }
  return "ok";
}
