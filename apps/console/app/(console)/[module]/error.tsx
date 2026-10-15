'use client';

import { PageHeader } from '@ledgerline/core/ui';
import Link from 'next/link';

// Errors are caught per module, so one broken module never takes the rest of the console down.
export default function ModuleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="ll-page">
      <PageHeader
        kicker="Stop Press"
        title="Missed the Print"
        deck="This section didn’t load. The rest of the paper still works: try again, or pick another section."
        actions={
          <>
            <button type="button" className="ll-button ll-button--primary" onClick={reset}>
              Try Again
            </button>
            <Link href="/frontpage" className="ll-button">
              Go to the Front Page
            </Link>
          </>
        }
      />
      <p className="ll-muted ll-mono">{error.message}</p>
    </div>
  );
}
