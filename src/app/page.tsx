export default function HomePage() {
  return (
    <div>
      <header className="erp-page-header">
        <h1 className="erp-page-title">Home</h1>
      </header>

      <section className="erp-empty" aria-labelledby="launchpad-empty-title">
        <h2 id="launchpad-empty-title">No spaces are published for your role yet</h2>
        <p>
          Your launchpad shows the work that is yours: approvals, tasks, exceptions and your project&apos;s
          numbers. Your administrator publishes a space for each role as modules go live.
        </p>
      </section>
    </div>
  );
}
