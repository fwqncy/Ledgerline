'use client';

import { downloadFile } from '@ledgerline/core/client';
import { toast } from '@ledgerline/core/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120"><rect width="640" height="120" fill="#efe6d2"/><text x="320" y="82" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="900" font-size="72" letter-spacing="-1.5" fill="#151311">The Ledgerline</text></svg>`;

/**
 * The masthead wordmark. A normal click goes home; right-click (or the context-menu
 * key) opens brand resources, as a reader would expect from a logo.
 */
export function BrandMark() {
  const router = useRouter();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!menu) return;
    firstItem.current?.focus();
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      setMenu(null);
      anchor.current?.focus();
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.ll-brand-menu')) setMenu(null);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', outside);
    };
  }, [menu]);

  const run = (action: () => void) => () => {
    action();
    setMenu(null);
  };

  return (
    <>
      <Link
        ref={anchor}
        href="/"
        className="ll-wordmark"
        translate="no"
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: event.clientX || rect.left, y: event.clientY || rect.bottom });
        }}
      >
        The Ledgerline
      </Link>
      {menu && (
        <div
          className="ll-brand-menu"
          role="menu"
          aria-label="Brand resources"
          style={{ left: Math.min(menu.x, window.innerWidth - 260), top: menu.y + 6 }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <p className="ll-brand-menu__title">Brand Resources</p>
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            onClick={run(async () => {
              try {
                await navigator.clipboard.writeText(WORDMARK_SVG);
                toast.show({ tone: 'success', title: 'Wordmark SVG copied' });
              } catch {
                toast.show({ tone: 'error', title: 'Couldn’t copy. Use Download instead.' });
              }
            })}
          >
            Copy Wordmark as SVG
          </button>
          <button type="button" role="menuitem" onClick={run(() => downloadFile('ledgerline-wordmark.svg', WORDMARK_SVG, 'image/svg+xml'))}>
            Download Wordmark SVG
          </button>
          <button type="button" role="menuitem" onClick={run(() => router.push('/settings'))}>
            House Colours & Type
          </button>
        </div>
      )}
    </>
  );
}
