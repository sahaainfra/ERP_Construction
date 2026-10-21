import Link from "next/link";

// Replaces Next's default 404, which injects a white body background that ignores the theme.
export default function NotFound() {
  return (
    <div>
      <header className="erp-page-header">
        <h1 className="erp-page-title">Page not found</h1>
      </header>
      <section className="erp-empty" aria-labelledby="not-found-title">
        <h2 id="not-found-title">This page does not exist</h2>
        <p>
          The address may be mistyped or the page may have moved. <Link href="/">Return to Home</Link>.
        </p>
      </section>
    </div>
  );
}
