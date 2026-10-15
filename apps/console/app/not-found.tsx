import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="ll-not-found">
      <p className="ll-kicker">Stop Press</p>
      <p className="ll-not-found__code" aria-hidden>
        404
      </p>
      <h1 className="ll-detail__title" style={{ fontSize: 34 }}>
        This Page Didn’t Make the Edition
      </h1>
      <p className="ll-deck">The section may not be mounted in this deployment, or the link is out of date.</p>
      <Link href="/frontpage" className="ll-button ll-button--primary">
        Go to the Front Page
      </Link>
    </main>
  );
}
