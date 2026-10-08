'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavModule {
  name: string;
  title: string;
  version: string;
  badge: number;
}

export function Sidebar({ modules, operator }: { modules: NavModule[]; operator: string }) {
  const pathname = usePathname();

  return (
    <nav className="ll-sidebar" aria-label="Modules">
      <Link href="/" className="ll-wordmark" translate="no" aria-label="Ledgerline home">
        ledgerline
      </Link>

      <ul className="ll-nav">
        {modules.map((m) => {
          const active = pathname === `/${m.name}` || pathname.startsWith(`/${m.name}/`);
          return (
            <li key={m.name}>
              <Link href={`/${m.name}`} className="ll-nav__item" aria-current={active ? 'page' : undefined}>
                {m.title}
                {m.badge > 0 && (
                  <span className="ll-nav__badge ll-mono">
                    {m.badge}
                    <span className="ll-visually-hidden"> need attention</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="ll-sidebar__foot">
        <h2 className="ll-sidebar__label">Deployed Modules</h2>
        <ul className="ll-deploys">
          {modules.map((m) => (
            <li key={m.name} className="ll-mono" translate="no">
              <span className="ll-dot" aria-hidden />
              {m.name}@v{m.version}
            </li>
          ))}
        </ul>
        <div className="ll-operator">
          <span className="ll-operator__avatar" aria-hidden translate="no">
            {operator
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span>
            {operator}
            <span className="ll-operator__role">Operator · live</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
