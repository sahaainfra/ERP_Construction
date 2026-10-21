// Part 14 S1 pure tests: the five-slot bottom bar, photo compression, GPS accuracy and flags, the watermark, capture fallbacks, scan
// parsing, and signature paths.
import { describe, expect, it } from "vitest";
import { bottomBarFor, compressionPlan, accuracyBand, gpsForRecord, watermarkLines, captureSupport, parseScanned, strokesToPath, FIELD_ROLES, FIELD_SLOTS } from "./logic";

describe("bottom bar (REQ-FIELD-F01)", () => {
  it("gives every role five items, with More always last and never repeated", () => {
    for (const role of FIELD_ROLES) {
      const bar = bottomBarFor(role);
      expect(bar, role).toHaveLength(5);
      expect(bar[4], role).toBe("more");
      expect(new Set(bar).size, role).toBe(5);
      expect(bar.every((s) => (FIELD_SLOTS as readonly string[]).includes(s)), role).toBe(true);
    }
  });
  it("uses an owner's override, keeps More last, and falls back to the site engineer for an unknown role", () => {
    expect(bottomBarFor("store_keeper", ["capture", "more", "inbox", "today", "tasks"])).toEqual(["capture", "inbox", "today", "tasks", "more"]);
    expect(bottomBarFor("no_such_role")).toEqual(bottomBarFor("site_engineer"));
  });
});

describe("photo compression (REQ-FIELD-F03)", () => {
  it("caps the longest edge, keeps the aspect ratio, and never enlarges", () => {
    expect(compressionPlan(4000, 3000, "standard")).toEqual({ width: 1600, height: 1200, scale: 0.4 });
    expect(compressionPlan(4000, 3000, "low")).toEqual({ width: 1024, height: 768, scale: 0.256 });
    expect(compressionPlan(800, 600, "standard")).toEqual({ width: 800, height: 600, scale: 1 });
    expect(() => compressionPlan(0, 600, "standard")).toThrow(RangeError);
  });
});

describe("location (REQ-FIELD-F03, CP-FIELD-02)", () => {
  it("bands accuracy and says when it is unknown", () => {
    expect(accuracyBand(8)).toBe("good");
    expect(accuracyBand(30)).toBe("fair");
    expect(accuracyBand(120)).toBe("poor");
    expect(accuracyBand(null)).toBe("unknown");
  });
  it("flags a poor position, a missing position and a mock-location signal, and rounds the coordinates", () => {
    expect(gpsForRecord({ lat: 18.5204123, lon: 73.8567456, accuracyM: 6.4 }, null)).toMatchObject({ band: "good", flagged: false, mockSignal: null, value: { lat: 18.520412, lon: 73.856746, accuracyM: 6 } });
    expect(gpsForRecord({ lat: 18.5, lon: 73.8, accuracyM: 90 }, null)).toMatchObject({ band: "poor", flagged: true });
    expect(gpsForRecord(null, null)).toMatchObject({ value: null, flagged: true });
    expect(gpsForRecord({ lat: 18.5, lon: 73.8, accuracyM: 5 }, true)).toMatchObject({ flagged: true, mockSignal: true });
  });
  it("writes the watermark with the place, the time and the person, and leaves out empty lines", () => {
    const lines = watermarkLines({ project: "P-204 Riverside", site: "", gps: { lat: 18.52, lon: 73.85, accuracyM: 7 }, at: new Date("2026-10-21T04:30:00Z"), user: "ASHA00001" });
    expect(lines).toEqual(["P-204 Riverside", "18.52000, 73.85000 ±7 m", "2026-10-21 04:30 UTC", "ASHA00001"]);
    expect(watermarkLines({ project: "P-1", gps: null, at: new Date("2026-10-21T04:30:00Z"), user: "X" })[1]).toBe("location not available");
  });
});

describe("capture fallbacks (A-118)", () => {
  it("names a fallback for every capability, and says so when one is missing", () => {
    const support = captureSupport({ camera: true, geolocation: false, barcodeDetector: false, speechRecognition: false, nfc: false });
    expect(support.camera.available).toBe(true);
    expect(support.barcodeDetector.fallback).toMatch(/Type the code/);
    expect(Object.values(support).every((s) => s.fallback.length > 0)).toBe(true);
  });
  it("accepts a scanned code of allowed characters only, up to 64 characters", () => {
    expect(parseScanned(" GP-2026/0042 ")).toEqual({ code: "GP-2026/0042" });
    expect(parseScanned("")).toEqual({ problem: "a code is between 1 and 64 characters" });
    expect(parseScanned("x".repeat(65))).toEqual({ problem: "a code is between 1 and 64 characters" });
    expect(parseScanned("ITEM<script>")).toEqual({ problem: "the code has characters that are not allowed" });
  });
});

describe("signatures (REQ-FIELD-F03)", () => {
  it("stores strokes as an SVG path, and nothing for an empty signature", () => {
    expect(strokesToPath([])).toBe("");
    expect(strokesToPath([[{ x: 1.25, y: 2 }, { x: 10, y: 12.34 }], []])).toBe("M1.3 2 L10 12.3");
  });
});
