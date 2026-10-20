// UI state contract (Part 12 REQ-DS-F06; Part 09 REQ-OBS-F14). Every state a screen can be in has one component, and each one says what
// happened, why, and what the person can do next. No state is a blank screen or a bare code.
import { Icon, type IconKey } from "../icons";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="erp-state" role="status" aria-busy="true">
      <div className="erp-skeleton" aria-hidden="true">
        <span className="erp-skeleton-line" />
        <span className="erp-skeleton-line erp-skeleton-line-short" />
        <span className="erp-skeleton-line" />
      </div>
      <p className="erp-state-title">{label}…</p>
    </div>
  );
}

export function EmptyState({ title, next, action }: { title: string; next: string; action?: React.ReactNode }) {
  return (
    <section className="erp-state" aria-labelledby="erp-empty-title">
      <h2 id="erp-empty-title" className="erp-state-title">{title}</h2>
      <p className="erp-state-body">{next}</p>
      {action}
    </section>
  );
}

export function ErrorState({ title, what, why, action, correlationId }: { title: string; what: string; why: string; action: string; correlationId: string }) {
  return (
    <section className="erp-state erp-state-error" role="alert" aria-labelledby="erp-error-title">
      <StateIcon name="erp.state.exception" />
      <h2 id="erp-error-title" className="erp-state-title">{title}</h2>
      <p className="erp-state-body"><strong>What happened:</strong> {what}</p>
      <p className="erp-state-body"><strong>Why:</strong> {why}</p>
      <p className="erp-state-body"><strong>What to do:</strong> {action}</p>
      <p className="erp-state-meta">Reference: <code>{correlationId}</code></p>
    </section>
  );
}

export function PermissionState({ resource, whoToAsk }: { resource: string; whoToAsk: string }) {
  return (
    <section className="erp-state" aria-labelledby="erp-permission-title">
      <StateIcon name="erp.action.lock" />
      <h2 id="erp-permission-title" className="erp-state-title">You do not have access to {resource}</h2>
      <p className="erp-state-body"><strong>Who to ask:</strong> {whoToAsk}</p>
    </section>
  );
}

export function OfflineState({ savedNote }: { savedNote: string }) {
  return (
    <section className="erp-state" role="status" aria-labelledby="erp-offline-title">
      <StateIcon name="erp.action.offline" />
      <h2 id="erp-offline-title" className="erp-state-title">You are offline</h2>
      <p className="erp-state-body">{savedNote}</p>
    </section>
  );
}

export function ConflictState({ record, options }: { record: string; options: string[] }) {
  return (
    <section className="erp-state erp-state-warning" role="alert" aria-labelledby="erp-conflict-title">
      <StateIcon name="erp.state.sync" />
      <h2 id="erp-conflict-title" className="erp-state-title">{record} changed while you were editing</h2>
      <ul className="erp-state-body">
        {options.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
    </section>
  );
}

export function IntegrationFailureState({ connector, retryNote }: { connector: string; retryNote: string }) {
  return (
    <section className="erp-state erp-state-warning" role="alert" aria-labelledby="erp-integration-title">
      <StateIcon name="erp.state.hold" />
      <h2 id="erp-integration-title" className="erp-state-title">{connector} is not responding</h2>
      <p className="erp-state-body">{retryNote}. Your data is saved; nothing has been sent twice.</p>
    </section>
  );
}

export function JobFailureState({ job, notified }: { job: string; notified: string }) {
  return (
    <section className="erp-state erp-state-error" role="alert" aria-labelledby="erp-job-title">
      <StateIcon name="erp.state.exception" />
      <h2 id="erp-job-title" className="erp-state-title">{job} failed</h2>
      <p className="erp-state-body">{notified}</p>
    </section>
  );
}

export function ValidationSummary({ errors }: { errors: { field: string; message: string }[] }) {
  if (errors.length === 0) return null;
  return (
    <section className="erp-state erp-state-error" role="alert" aria-labelledby="erp-validation-title">
      <h2 id="erp-validation-title" className="erp-state-title">Correct {errors.length === 1 ? "one value" : `${errors.length} values`} to continue</h2>
      <ul className="erp-state-body">
        {errors.map((e) => (
          <li key={`${e.field}-${e.message}`}>
            <a href={`#field-${e.field}`}>{e.field}</a>: {e.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateIcon({ name }: { name: IconKey }) {
  return <Icon name={name} size={24} className="erp-state-icon" />;
}
