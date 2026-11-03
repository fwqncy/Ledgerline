'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { href: '/developers', label: 'Overview' },
  { href: '/developers/keys', label: 'API Keys' },
  { href: '/developers/docs', label: 'Schema' },
  { href: '/developers/playground', label: 'Playground' },
];

export function DevNav() {
  const pathname = usePathname();
  const partner = useSearchParams().get('partner');
  const suffix = partner ? `?partner=${encodeURIComponent(partner)}` : '';
  return (
    <nav className="ll-segmented" aria-label="Developer portal">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={`${tab.href}${suffix}`}
          className="ll-segmented__item"
          aria-current={pathname === tab.href ? 'true' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
