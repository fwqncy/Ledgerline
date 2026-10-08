'use client';

import Link from 'next/link';

// Errors are caught per module, so one broken module never takes the rest of the console down.
export default function ModuleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="ll-page">
      <div className="ll-card ll-detail__body">
        <h1 className="ll-detail__title">This Module Didn’t Load</h1>
        <p className="ll-muted">
          The rest of the console still works. Try again, or switch to another module from the sidebar.
        </p>
        <p className="ll-muted ll-mono">{error.message}</p>
        <div className="ll-actions ll-actions--start">
          <button type="button" className="ll-button ll-button--primary" onClick={reset}>
            Try Again
          </button>
          <Link href="/payouts" className="ll-button ll-button--ghost">
            Go to Payouts
          </Link>
        </div>
      </div>
    </div>
  );
}
