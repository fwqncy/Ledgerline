'use client';

import { Kbd, useModKey } from '@ledgerline/core/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { openPalette } from './CommandPalette';

export interface NavModule {
  name: string;
  title: string;
  version: string;
  hotkey: string | null;
  badge: number;
}

/** The section bar: sticks to the top so every desk is one click (or G + key) away. */
export function SectionNav({ modules, operator }: { modules: NavModule[]; operator: string }) {
  const pathname = usePathname();
  const mod = useModKey();
  const listRef = useRef<HTMLUListElement>(null);

  // On narrow screens the list scrolls sideways; keep the current section in view.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current) return;
    const left = current.offsetLeft;
    const right = left + current.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth - 24) list.scrollLeft = Math.max(0, left - 16);
  }, [pathname]);
  const initials = operator
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <nav className="ll-sections" aria-label="Sections">
      <ul ref={listRef} className="ll-sections__list">
        {modules.map((m) => {
          const active = pathname === `/${m.name}` || pathname.startsWith(`/${m.name}/`);
          return (
            <li key={m.name}>
              <Link href={`/${m.name}`} className="ll-section-link" aria-current={active ? 'page' : undefined}>
                {m.title}
                {m.badge > 0 && (
                  <span className="ll-section-link__badge">
                    {m.badge}
                    <span className="ll-visually-hidden"> need attention</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="ll-sections__tools">
        <button
          type="button"
          className="ll-button ll-button--small ll-button--ghost"
          onClick={openPalette}
          aria-keyshortcuts="Meta+K Control+K"
          aria-label="Search & commands"
        >
          <span aria-hidden>⌕</span>
          <span className="ll-button__label">Search</span>
          <Kbd>
            <span suppressHydrationWarning>{mod}</span>&nbsp;K
          </Kbd>
        </button>
        <Link
          href="/settings"
          className="ll-section-link"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          style={{ minHeight: 44 }}
        >
          Settings
        </Link>
        <span className="ll-operator" title={`Signed in as ${operator}`}>
          <span aria-hidden translate="no">
            {initials}
          </span>
          <span className="ll-visually-hidden">Signed in as {operator}</span>
        </span>
      </div>
    </nav>
  );
}
