"use client";

// Field components (Part 14 REQ-FIELD-F01 to F03). Touch targets are at least 44 px through the touch density token. Every capture
// control has a fallback that works without the device capability (A-118), and says so when the capability is missing.
import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { accuracyBand, gpsForRecord, parseScanned, strokesToPath, COMPRESSION_PROFILES, type CompressionProfile, type GpsReading } from "../../field/logic";

/** A card: three to five key fields and a status. Grids on desktop become card lists on phones (REQ-FIELD-F02). */
export interface CardItem {
  id: string;
  title: string;
  fields: { label: string; value: string }[];
  status?: ReactNode;
  href?: string;
}

export const MAX_CARD_FIELDS = 5;

export function CardList({ items, label }: { items: CardItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="erp-cardlist" aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className="erp-card-item">
          <div className="erp-card-head">
            {item.href ? <a href={item.href} className="erp-card-title">{item.title}</a> : <span className="erp-card-title">{item.title}</span>}
            {item.status}
          </div>
          <dl className="erp-card-fields">
            {item.fields.slice(0, MAX_CARD_FIELDS).map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** Sticky filter chips. Each chip is a toggle with its state announced (aria-pressed). */
export function FilterChips({ chips, onToggle, label }: { chips: { id: string; label: string; active: boolean }[]; onToggle: (id: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="erp-chips">
      {chips.map((c) => (
        <button key={c.id} type="button" className="erp-chip" aria-pressed={c.active} onClick={() => onToggle(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** A quantity with its unit beside the value. The numeric keypad is requested with inputMode (REQ-FIELD-F02). */
export function QuantityField({ id, label, unit, value, onChange, min = 0 }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void; min?: number }) {
  const invalid = value !== "" && (!/^\d+(\.\d{1,3})?$/.test(value) || Number(value) < min);
  return (
    <div className="erp-quantity">
      <label htmlFor={id}>{label}</label>
      <div className="erp-quantity-row">
        <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={`${id}-unit`} />
        <span id={`${id}-unit`} className="erp-quantity-unit">{unit}</span>
      </div>
      {invalid ? <p className="erp-state-meta" role="alert">Enter a number of at least {min}, with up to three decimals.</p> : null}
    </div>
  );
}

/** Master–detail for tablets: the list and the detail side by side. On a phone only one is shown at a time (CSS). */
export function MasterDetail({ master, detail, detailLabel }: { master: ReactNode; detail: ReactNode | null; detailLabel: string }) {
  return (
    <div className="erp-masterdetail" data-has-detail={detail !== null}>
      <div className="erp-master">{master}</div>
      <section className="erp-detail" aria-label={detailLabel}>
        {detail ?? <p className="erp-state-body">Choose an item to see its details.</p>}
      </section>
    </div>
  );
}

/** Photo capture. The browser's camera is opened through the file input, which every target supports. Photos are compressed to the chosen profile. */
export function CameraCapture({ label, profile = "standard", onFiles }: { label: string; profile?: CompressionProfile; onFiles: (files: File[], profile: CompressionProfile) => void }) {
  const id = `camera-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="erp-capture-block">
      <label htmlFor={id} className="erp-button">{label}</label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="erp-visually-hidden"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []), profile)}
      />
      <p className="erp-state-meta">Photos are compressed to {COMPRESSION_PROFILES[profile].maxEdge} px before they are sent.</p>
    </div>
  );
}

/** Location capture: reads the position where the browser allows it, shows the accuracy with its band, and offers manual entry. */
export function GeoCapture({ available, onRecord }: { available: boolean; onRecord: (gps: ReturnType<typeof gpsForRecord>) => void }) {
  const [reading, setReading] = useState<GpsReading | null>(null);
  const [status, setStatus] = useState<string>("");
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [manualAcc, setManualAcc] = useState("");

  const read = () => {
    if (!available || typeof navigator === "undefined" || !navigator.geolocation) return setStatus("Location is not available. Enter it by hand.");
    setStatus("Reading location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const r = { lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy };
        setReading(r);
        setStatus(`Accuracy ${Math.round(r.accuracyM)} m (${accuracyBand(r.accuracyM)})`);
        onRecord(gpsForRecord(r, null));
      },
      () => setStatus("Location could not be read. Enter it by hand."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const saveManual = () => {
    const lat = Number(manualLat);
    const lon = Number(manualLon);
    const acc = Number(manualAcc);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && acc >= 0)) return setStatus("Check the latitude, longitude and accuracy.");
    const r = { lat, lon, accuracyM: acc };
    setReading(r);
    onRecord(gpsForRecord(r, null));
    setStatus("Location entered by hand. It is marked as entered.");
  };

  return (
    <div className="erp-capture-block">
      {available ? (
        <button type="button" className="erp-button" onClick={read}>Read my location</button>
      ) : (
        <p className="erp-state-body">Location is not available on this device. Enter it by hand.</p>
      )}
      <p role="status" className="erp-state-meta">{status}</p>
      <fieldset className="erp-fieldset">
        <legend>Enter by hand</legend>
        <label>Latitude <input inputMode="decimal" value={manualLat} onChange={(e) => setManualLat(e.target.value)} /></label>
        <label>Longitude <input inputMode="decimal" value={manualLon} onChange={(e) => setManualLon(e.target.value)} /></label>
        <label>Accuracy (metres) <input inputMode="decimal" value={manualAcc} onChange={(e) => setManualAcc(e.target.value)} /></label>
        <button type="button" className="erp-button-quiet" onClick={saveManual}>Use this location</button>
      </fieldset>
    </div>
  );
}

/** Barcode or QR capture: the detector when the browser has one, and a typed code always. */
export function BarcodeCapture({ detectorAvailable, onCode }: { detectorAvailable: boolean; onCode: (code: string) => void }) {
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => {
    const r = parseScanned(typed);
    if ("problem" in r) return setProblem(r.problem);
    setProblem(null);
    onCode(r.code);
    setTyped("");
  };
  return (
    <div className="erp-capture-block">
      {detectorAvailable ? <p className="erp-state-meta">Point the camera at the code, or type it below.</p> : <p className="erp-state-body">Scanning is not available on this device. Type the code instead.</p>}
      <label>Code <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
      {problem ? <p role="alert" className="erp-state-meta">{problem}</p> : null}
      <button type="button" className="erp-button" onClick={submit}>Use this code</button>
    </div>
  );
}

/** Signature pad. Strokes are kept as points and stored as an SVG path, so no image library is needed. */
export function SignaturePad({ label, onChange }: { label: string; onChange: (path: string) => void }) {
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const drawing = useRef(false);
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStrokes((s) => [...s, [point(e)]]);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawing.current || strokes.length === 0) return;
    const next = strokes.slice(0, -1).concat([[...strokes[strokes.length - 1], point(e)]]);
    setStrokes(next);
    onChange(strokesToPath(next));
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    setStrokes([]);
    onChange("");
  };
  return (
    <div className="erp-capture-block">
      <p id="sig-label" className="erp-state-body">{label}</p>
      <svg role="img" aria-labelledby="sig-label" className="erp-signature" viewBox="0 0 320 140" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <path d={strokesToPath(strokes)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <button type="button" className="erp-button-quiet" onClick={clear}>Clear signature</button>
    </div>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
}

/** Voice input (A-118). Uses the browser's speech recognition where it exists; the transcript is passed back as text the person can edit. */
export function VoiceNote({ available, label, lang = "en-IN", onText }: { available: boolean; label: string; lang?: string; onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!available) return <p className="erp-state-body">Voice input is not available on this device. Type the note instead.</p>;
  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setProblem("Voice input is not available on this device. Type the note instead.");
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
      setListening(false);
      if (text) onText(text);
    };
    rec.onerror = () => {
      setListening(false);
      setProblem("The note could not be recorded. Try again, or type it.");
    };
    setProblem(null);
    setListening(true);
    rec.start();
  };
  return (
    <div className="erp-capture-block">
      <button type="button" className="erp-button" onClick={start} aria-pressed={listening}>
        {listening ? "Listening…" : label}
      </button>
      {problem ? <p role="alert" className="erp-state-meta">{problem}</p> : null}
    </div>
  );
}

/**
 * The conflict screen (REQ-FIELD-F12). The server version and the person's version sit side by side, and nothing is chosen for them.
 * A locked record offers an amendment request in place of "keep mine" (A-120).
 */
export function ConflictCompare({
  entityLabel,
  server,
  local,
  locked,
  onKeepServer,
  onKeepMine,
}: {
  entityLabel: string;
  server: { label: string; value: string }[];
  local: { label: string; value: string }[];
  locked: boolean;
  onKeepServer: () => void;
  onKeepMine: () => void;
}) {
  const side = (title: string, rows: { label: string; value: string }[]) => (
    <section className="erp-compare-side" aria-label={title}>
      <h2>{title}</h2>
      <dl>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <div>
      <p>{`${entityLabel} changed on the server while you were offline. Choose which version to keep.`}</p>
      <div className="erp-compare">
        {side("Server version (current)", server)}
        {side("Your version", local)}
      </div>
      <div className="erp-compare-actions">
        <button type="button" className="erp-button" onClick={onKeepServer}>Keep the server version</button>
        <button type="button" className="erp-button" onClick={onKeepMine}>{locked ? "Request an amendment" : "Keep my version"}</button>
      </div>
      {locked ? <p>This record is locked, so your version cannot replace it. It becomes an amendment request for approval.</p> : null}
    </div>
  );
}
