'use client';

import { Dialog, Kbd, useModKey } from '@ledgerline/core/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { openPalette, SHORTCUTS_EVENT } from './CommandPalette';
import type { NavModule } from './SectionNav';

/**
 * Console-wide keys: "/" search, "?" this sheet, and G-then-letter to change section.
 * Runs in the capture phase so a G sequence never also fires a page's own shortcut.
 */
export function Shortcuts({ modules }: { modules: NavModule[] }) {
  const router = useRouter();
  const mod = useModKey();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const show = () => setHelp(true);
    window.addEventListener(SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHORTCUTS_EVENT, show);
  }, []);

  useEffect(() => {
    let pendingG = 0;
    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;

      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const key = event.key.toLowerCase();
        const href = key === ',' ? '/settings' : modules.find((m) => m.hotkey === key) && `/${modules.find((m) => m.hotkey === key)!.name}`;
        if (href) {
          consume(event);
          router.push(href);
        }
        return;
      }
      if (event.key === 'g') {
        pendingG = Date.now();
        consume(event);
      } else if (event.key === '?') {
        consume(event);
        setHelp(true);
      } else if (event.key === '/') {
        consume(event);
        const field = document.querySelector<HTMLInputElement>('[data-page-search]');
        if (field) field.focus();
        else openPalette();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [modules, router]);

  return (
    <Dialog open={help} onClose={() => setHelp(false)} title="Keyboard Shortcuts" wide>
      <div className="ll-shortcuts">
        <section>
          <h3>Anywhere</h3>
          <dl>
            <dt>Search & commands</dt>
            <dd>
              <Kbd>
                <span suppressHydrationWarning>{mod}</span>&nbsp;K
              </Kbd>
            </dd>
            <dt>Search this page</dt>
            <dd>
              <Kbd>/</Kbd>
            </dd>
            <dt>This sheet</dt>
            <dd>
              <Kbd>?</Kbd>
            </dd>
            {modules
              .filter((m) => m.hotkey)
              .map((m) => (
                <SequenceRow key={m.name} label={`Go to ${m.title}`} keyName={m.hotkey!.toUpperCase()} />
              ))}
            <SequenceRow label="Go to Settings" keyName="," />
          </dl>
        </section>
        <section>
          <h3>Payouts</h3>
          <dl>
            <dt>Next / previous</dt>
            <dd>
              <Kbd>J</Kbd> <Kbd>K</Kbd>
            </dd>
            <dt>Approve (5&nbsp;s to undo)</dt>
            <dd>
              <Kbd>A</Kbd>
            </dd>
            <dt>Select for bulk approval</dt>
            <dd>
              <Kbd>X</Kbd>
            </dd>
            <dt>New payout</dt>
            <dd>
              <Kbd>N</Kbd>
            </dd>
            <dt>Export CSV</dt>
            <dd>
              <Kbd>E</Kbd>
            </dd>
          </dl>
        </section>
        <section>
          <h3>Support</h3>
          <dl>
            <dt>Write a reply</dt>
            <dd>
              <Kbd>R</Kbd>
            </dd>
            <dt>Assign to me</dt>
            <dd>
              <Kbd>M</Kbd>
            </dd>
            <dt>Send reply</dt>
            <dd>
              <Kbd>
                <span suppressHydrationWarning>{mod}</span>&nbsp;Enter
              </Kbd>
            </dd>
          </dl>
        </section>
        <section>
          <h3>The Ticker Chart</h3>
          <dl>
            <dt>Read day by day</dt>
            <dd>
              <Kbd>←</Kbd> <Kbd>→</Kbd>
            </dd>
            <dt>First / last day</dt>
            <dd>
              <Kbd>Home</Kbd> <Kbd>End</Kbd>
            </dd>
            <dt>Jump a week</dt>
            <dd>
              <Kbd>PgUp</Kbd> <Kbd>PgDn</Kbd>
            </dd>
          </dl>
        </section>
      </div>
    </Dialog>
  );
}

function SequenceRow({ label, keyName }: { label: string; keyName: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <Kbd>G</Kbd> then <Kbd>{keyName}</Kbd>
      </dd>
    </>
  );
}
