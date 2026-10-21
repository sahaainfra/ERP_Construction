"use client";

// Install, update and version controls (Part 14 REQ-FIELD-F05). The notices are presentational so they can be checked for accessibility;
// the wrappers hold the browser events.
import { useEffect, useState } from "react";

export function InstallNotice({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <section className="erp-banner erp-banner-info" aria-label="Install the app">
      <p>Install ERP Construction on this device for faster start-up and offline pages.</p>
      <button type="button" className="erp-button" onClick={onInstall}>Install app</button>
      <button type="button" className="erp-button-quiet" onClick={onDismiss}>Not now</button>
    </section>
  );
}

export function UpdateNotice({ onUpdate }: { onUpdate: () => void }) {
  return (
    <section className="erp-banner erp-banner-warning" role="status" aria-label="Update available">
      <p>A new version is ready. Update now to get the latest fixes.</p>
      <button type="button" className="erp-button" onClick={onUpdate}>Update now</button>
    </section>
  );
}

/** Shown in place of the app when this device's build is older than the minimum the server accepts. It blocks work until updated. */
export function UpdateRequiredScreen({ current, minimum }: { current: string; minimum: string }) {
  return (
    <main className="erp-auth-page" id="main">
      <section className="erp-auth-card" aria-labelledby="erp-update-required-title" role="alert">
        <h1 id="erp-update-required-title" className="erp-page-title">Update required</h1>
        <p className="erp-state-body">This app is version {current}. Version {minimum} or later is needed. Reload the app to update. Anything saved on this device is kept.</p>
        <button type="button" className="erp-button" onClick={() => window.location.reload()}>Reload to update</button>
      </section>
    </main>
  );
}

type BeforeInstallPrompt = Event & { prompt: () => Promise<void> };

/** Registers the service worker and shows the install and update notices when they apply. Does nothing where workers are unsupported. */
export function PwaControls() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPrompt | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    if (!("serviceWorker" in navigator)) return () => window.removeEventListener("beforeinstallprompt", onBefore);
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
    }).catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", onBefore);
  }, []);

  return (
    <>
      {waiting ? <UpdateNotice onUpdate={() => waiting.postMessage({ type: "SKIP_WAITING" })} /> : null}
      {installEvent && !installDismissed ? (
        <InstallNotice
          onInstall={() => {
            void installEvent.prompt();
            setInstallEvent(null);
          }}
          onDismiss={() => setInstallDismissed(true)}
        />
      ) : null}
    </>
  );
}
