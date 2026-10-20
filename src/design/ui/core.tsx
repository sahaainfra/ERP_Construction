// Core components (Part 12 REQ-DS-F07). Presentational: they take their content as props and hold no business data. Keyboard
// behaviour is part of each component (tabs use arrow keys; dialogs name themselves).
"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabSpec {
  id: string;
  label: string;
  content: ReactNode;
}

/** Object-page and settings tabs. Arrow keys move between tabs; only the active tab's panel is rendered. */
export function Tabs({ label, tabs, initial }: { label: string; tabs: TabSpec[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  if (tabs.length === 0) return null;
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="erp-tabs">
      <div role="tablist" aria-label={label} className="erp-tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === current.id ? 0 : -1}
            className="erp-tab"
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="erp-tabpanel">
        {current.content}
      </div>
    </div>
  );
}

export type Tone = "info" | "success" | "warning" | "critical";

export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`erp-banner erp-banner-${tone}`} role={tone === "critical" || tone === "warning" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** A dialog. The caller opens it; it names itself and labels its close control. Focus handling is the caller's concern for now. */
export function Modal({ title, children, onClose, closeLabel = "Close" }: { title: string; children: ReactNode; onClose: () => void; closeLabel?: string }) {
  return (
    <div className="erp-modal-scrim">
      <div role="dialog" aria-modal="true" aria-labelledby="erp-modal-title" className="erp-modal">
        <header className="erp-modal-header">
          <h2 id="erp-modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="erp-button-quiet">×</button>
        </header>
        <div className="erp-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Stepper({ label, steps, current }: { label: string; steps: string[]; current: number }) {
  return (
    <ol className="erp-stepper" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step} aria-current={i === current ? "step" : undefined} className={i < current ? "erp-step-done" : undefined}>
          <span className="erp-step-index">{i + 1}</span> {step}
        </li>
      ))}
    </ol>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="erp-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={`erp-skeleton-line${i === lines - 1 ? " erp-skeleton-line-short" : ""}`} />
      ))}
    </div>
  );
}

export interface TimelineItem {
  at: string;
  who: string;
  what: string;
  reason?: string;
}

/** Audit timeline for an object page. Shows who did what, when, and why; reasons are shown as recorded. */
export function AuditTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="erp-state-body">No changes recorded yet.</p>;
  return (
    <ol className="erp-timeline" aria-label="Audit timeline">
      {items.map((item, i) => (
        <li key={`${item.at}-${i}`}>
          <time dateTime={item.at}>{item.at}</time> · {item.who} · {item.what}
          {item.reason ? <span className="erp-timeline-reason"> — {item.reason}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export interface ApprovalStep {
  role: string;
  state: "done" | "waiting" | "rejected" | "not-started";
  by?: string;
}

export function ApprovalPanel({ steps }: { steps: ApprovalStep[] }) {
  return (
    <ol className="erp-approvals" aria-label="Approvals">
      {steps.map((s) => (
        <li key={s.role} data-state={s.state}>
          {s.role}: {s.state === "done" ? `approved${s.by ? ` by ${s.by}` : ""}` : s.state === "waiting" ? "waiting" : s.state === "rejected" ? "rejected" : "not started"}
        </li>
      ))}
    </ol>
  );
}

export function AttachmentPanel({ files }: { files: { name: string; size: string }[] }) {
  if (files.length === 0) return <p className="erp-state-body">No attachments.</p>;
  return (
    <ul className="erp-attachments" aria-label="Attachments">
      {files.map((f) => (
        <li key={f.name}>
          {f.name} <span className="erp-state-meta">({f.size})</span>
        </li>
      ))}
    </ul>
  );
}
