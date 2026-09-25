"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="centered-shell">
      <section className="panel compact-panel">
        <p className="eyebrow">Unexpected error</p>
        <h1>Something went wrong.</h1>
        <p className="muted-copy">The request could not be completed safely.</p>
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}

