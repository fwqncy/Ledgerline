import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="ll-not-found">
      <p className="ll-mono ll-muted" translate="no">
        404
      </p>
      <h1 className="ll-page__title">This Page Doesn’t Exist</h1>
      <p className="ll-muted">The module may not be mounted in this deployment.</p>
      <Link href="/payouts" className="ll-button ll-button--primary">
        Go to Payouts
      </Link>
    </main>
  );
}
