// Page templates (Part 12 REQ-DS-F06, F09). Each template is a frame: it fixes the structure and the states, and the screen supplies
// the content. A template never reads data itself.
import type { ReactNode } from "react";
import { Tabs, type TabSpec, Banner, Stepper } from "./core";
import { EmptyState, ErrorState, LoadingState, PermissionState, ValidationSummary } from "./states";

export type ListState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "empty"; title: string; next: string; action?: ReactNode }
  | { kind: "error"; title: string; what: string; why: string; action: string; correlationId: string }
  | { kind: "permission"; resource: string; whoToAsk: string };

export interface Fact {
  label: string;
  value: ReactNode;
}

/** Object page: header facts and one primary action. Tabs appear only when the module supplies content for them (REQ-DS-F09). */
export function ObjectPage({ title, status, facts, primaryAction, tabs, tabsLabel = "Record sections", banners = [] }: {
  title: string;
  status?: ReactNode;
  facts: Fact[];
  primaryAction?: ReactNode;
  tabs: TabSpec[];
  tabsLabel?: string;
  banners?: ReactNode[];
}) {
  const present = tabs.filter((t) => t.content !== null && t.content !== undefined);
  return (
    <section className="erp-page erp-object-page">
      <header className="erp-page-header">
        <div>
          <h1 className="erp-page-title">{title}</h1>
          {status}
        </div>
        {primaryAction ? <div className="erp-page-actions">{primaryAction}</div> : null}
      </header>
      {banners.map((b, i) => (
        <div key={i}>{b}</div>
      ))}
      <dl className="erp-facts">
        {facts.map((f) => (
          <div key={f.label} className="erp-fact">
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {present.length > 0 ? <Tabs label={tabsLabel} tabs={present} /> : null}
    </section>
  );
}

/** List report: title, filter bar, and the table, with every state a list can be in. */
export function ListReport({ title, filters, state, children, errors = [] }: { title: string; filters?: ReactNode; state: ListState; children?: ReactNode; errors?: { field: string; message: string }[] }) {
  return (
    <section className="erp-page">
      <header className="erp-page-header">
        <h1 className="erp-page-title">{title}</h1>
      </header>
      {errors.length > 0 ? <ValidationSummary errors={errors} /> : null}
      {state.kind === "ready" && filters ? <div className="erp-filterbar">{filters}</div> : null}
      {state.kind === "ready" ? children : null}
      {state.kind === "loading" ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : null}
      {state.kind === "empty" ? <EmptyState title={state.title} next={state.next} action={state.action} /> : null}
      {state.kind === "error" ? <ErrorState title={state.title} what={state.what} why={state.why} action={state.action} correlationId={state.correlationId} /> : null}
      {state.kind === "permission" ? <PermissionState resource={state.resource} whoToAsk={state.whoToAsk} /> : null}
    </section>
  );
}

/** Wizard: a stepper, the current step's content, and the actions for moving on. */
export function Wizard({ title, steps, current, children, actions }: { title: string; steps: string[]; current: number; children: ReactNode; actions: ReactNode }) {
  return (
    <section className="erp-page">
      <header className="erp-page-header">
        <h1 className="erp-page-title">{title}</h1>
      </header>
      <Stepper label={`${title} steps`} steps={steps} current={current} />
      <div className="erp-wizard-step">{children}</div>
      <footer className="erp-wizard-actions">{actions}</footer>
    </section>
  );
}

/** Settings: sections with their own headings, in order. */
export function SettingsPage({ title, sections }: { title: string; sections: { id: string; title: string; content: ReactNode }[] }) {
  return (
    <section className="erp-page">
      <header className="erp-page-header">
        <h1 className="erp-page-title">{title}</h1>
      </header>
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`settings-${s.id}`} className="erp-settings-section">
          <h2 id={`settings-${s.id}`}>{s.title}</h2>
          {s.content}
        </section>
      ))}
    </section>
  );
}

export type AuthVariant = "sign-in" | "mfa" | "set-password" | "reset-password" | "session-expired" | "access-denied";

const AUTH_TITLES: Record<AuthVariant, string> = {
  "sign-in": "Sign in",
  mfa: "Enter your one-time code",
  "set-password": "Set your password",
  "reset-password": "Reset your password",
  "session-expired": "Your session has ended",
  "access-denied": "You do not have access to this page",
};

/**
 * Public and account pages (Part 08A builds on these). The session-expired and access-denied variants never reveal account or
 * policy detail: they say what happened and what to do.
 */
export function PublicAuthPage({ variant, children, whoToAsk, notice }: { variant: AuthVariant; children?: ReactNode; whoToAsk?: string; notice?: string }) {
  return (
    <main className="erp-auth-page" id="main">
      <section className="erp-auth-card" aria-labelledby="erp-auth-title">
        <h1 id="erp-auth-title" className="erp-page-title">{AUTH_TITLES[variant]}</h1>
        {variant === "session-expired" ? <p className="erp-state-body">Sign in again to continue. Anything you had not saved is kept as a draft where the screen supports it.</p> : null}
        {variant === "access-denied" ? <p className="erp-state-body"><strong>Who to ask:</strong> {whoToAsk ?? "your administrator"}</p> : null}
        {notice ? <Banner tone="info">{notice}</Banner> : null}
        {children}
      </section>
    </main>
  );
}

/** Launchpad: tiles for the places a person can open. The tiles come from the navigation model (Part 13 supplies widgets later). */
export function Launchpad({ title, tiles }: { title: string; tiles: { id: string; label: string; href: string }[] }) {
  return (
    <section className="erp-page">
      <h1 className="erp-page-title">{title}</h1>
      {tiles.length === 0 ? (
        <EmptyState title="Nothing to open yet" next="Your administrator sets up the places you work in. Ask them to check your access." />
      ) : (
        <ul className="erp-tiles">
          {tiles.map((t) => (
            <li key={t.id}>
              <a href={t.href} className="erp-tile">{t.label}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Worklist({ title, count, children, state = { kind: "ready" } }: { title: string; count: number; children?: ReactNode; state?: ListState }) {
  return (
    <section className="erp-page">
      <header className="erp-page-header">
        <h1 className="erp-page-title">{title}</h1>
        <span className="erp-count" aria-label={`${count} items`}>{count}</span>
      </header>
      {state.kind === "ready" && count === 0 ? <EmptyState title="Nothing waiting for you" next="New work appears here when it is sent to you." /> : null}
      {state.kind === "ready" && count > 0 ? children : null}
      {state.kind === "loading" ? <LoadingState label="Loading your work" /> : null}
      {state.kind === "error" ? <ErrorState title={state.title} what={state.what} why={state.why} action={state.action} correlationId={state.correlationId} /> : null}
      {state.kind === "permission" ? <PermissionState resource={state.resource} whoToAsk={state.whoToAsk} /> : null}
    </section>
  );
}

export function Overview({ title, cards }: { title: string; cards: ReactNode[] }) {
  return (
    <section className="erp-page">
      <h1 className="erp-page-title">{title}</h1>
      <div className="erp-cards">{cards.map((c, i) => <div key={i} className="erp-card">{c}</div>)}</div>
    </section>
  );
}

/** Mobile capture: one primary capture action, with the offline state shown when the device has no connection. */
export function MobileCapture({ title, offline, primary, recent }: { title: string; offline: boolean; primary: ReactNode; recent?: ReactNode }) {
  return (
    <section className="erp-page erp-capture">
      <h1 className="erp-page-title">{title}</h1>
      {offline ? <Banner tone="warning">You are offline. Entries are saved on this device and sent when you reconnect.</Banner> : null}
      <div className="erp-capture-primary">{primary}</div>
      {recent}
    </section>
  );
}
