'use client';

import type { ModuleCommand, SearchResult } from '@ledgerline/core/module';
import { applyPrefs, readPrefs, type ThemeId } from '@ledgerline/core/theme';
import { Kbd, Spinner } from '@ledgerline/core/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { NavModule } from './SectionNav';

const PALETTE_EVENT = 'ledgerline:palette';
export const SHORTCUTS_EVENT = 'ledgerline:shortcuts';

export const openPalette = () => window.dispatchEvent(new Event(PALETTE_EVENT));

interface Item {
  id: string;
  label: string;
  section: string;
  sub?: string;
  kind?: string;
  href?: string;
  run?: () => void;
  keywords?: string;
  shortcut?: string;
}

/**
 * ⌘K / Ctrl K: one box to jump anywhere, find any payout or ticket, and run commands.
 * Implements the WAI-ARIA combobox pattern so it works by keyboard & screen reader.
 */
export function CommandPalette({ modules, commands }: { modules: NavModule[]; commands: (ModuleCommand & { section: string })[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener(PALETTE_EVENT, show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(PALETTE_EVENT, show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setQuery('');
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Server-side search across every module, debounced & cancellable.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
      } catch {
        // Aborted or offline: keep the local commands.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const setTheme = (theme: ThemeId) => {
    applyPrefs({ ...readPrefs(), theme });
    router.refresh();
  };

  const staticItems: Item[] = useMemo(
    () => [
      ...modules.map((m) => ({
        id: `go-${m.name}`,
        label: `Go to ${m.title}`,
        section: 'Go To',
        href: `/${m.name}`,
        keywords: m.name,
        shortcut: m.hotkey ? `G ${m.hotkey.toUpperCase()}` : undefined,
      })),
      { id: 'go-settings', label: 'Go to Settings', section: 'Go To', href: '/settings', shortcut: 'G ,' },
      ...commands.map((c, i) => ({ id: `cmd-${i}`, ...c, section: c.section })),
      { id: 'theme-broadsheet', label: 'Theme: Broadsheet, Cream & Black', section: 'Appearance', run: () => setTheme('broadsheet'), keywords: 'colour color scheme light default' },
      { id: 'theme-regiment', label: 'Theme: Burgundy & Navy', section: 'Appearance', run: () => setTheme('regiment'), keywords: 'colour color scheme dark' },
      { id: 'theme-custom', label: 'Theme: Pick Your Own Colours…', section: 'Appearance', href: '/settings#colour', keywords: 'custom wheel color' },
      {
        id: 'ticker',
        label: 'Show or Hide the Wire Ticker',
        section: 'Appearance',
        run: () => {
          const prefs = readPrefs();
          applyPrefs({ ...prefs, ticker: !prefs.ticker });
          router.refresh();
        },
        keywords: 'marquee tape',
      },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', section: 'Help', run: () => window.dispatchEvent(new Event(SHORTCUTS_EVENT)), shortcut: '?' },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules, commands],
  );

  const items: Item[] = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (item: Item) => {
      const haystack = `${item.label} ${item.keywords ?? ''} ${item.section}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    };
    const found: Item[] = results.map((r) => ({
      id: `r-${r.kind}-${r.id}`,
      label: r.title,
      sub: r.subtitle,
      kind: r.kind,
      href: r.href,
      section: 'Search Results',
    }));
    return [...found, ...staticItems.filter(matches)];
  }, [query, results, staticItems]);

  useEffect(() => setActive(0), [query, results]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  function execute(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (items.length ? (a + delta + items.length) % items.length : 0));
    } else if (event.key === 'Home' && event.ctrlKey) {
      setActive(0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      execute(items[active]);
    }
  }

  let lastSection = '';

  return (
    <dialog
      ref={dialogRef}
      className="ll-dialog ll-palette"
      aria-label="Search & commands"
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false);
      }}
    >
      {open && (
        <div className="ll-dialog__inner">
          <input
            className="ll-palette__input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-label="Search payouts & tickets, or type a command"
            placeholder="Search po_8f21, Northwind, or a command…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <ul id={listId} role="listbox" aria-label="Results" className="ll-palette__list">
            {items.map((item, index) => {
              const header = item.section !== lastSection ? item.section : null;
              lastSection = item.section;
              return [
                header && (
                  <li key={`h-${header}`} role="presentation" className="ll-palette__group">
                    {header}
                  </li>
                ),
                <li
                  key={item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className="ll-palette__option"
                  onPointerMove={() => setActive(index)}
                  onClick={() => execute(item)}
                >
                  <span className="ll-palette__option-text">
                    <span>{item.label}</span>
                    {item.sub && (
                      <span className="ll-palette__option-sub" translate="no">
                        {item.sub}
                      </span>
                    )}
                  </span>
                  {item.kind && <span className="ll-palette__kind">{item.kind}</span>}
                  {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                </li>,
              ];
            })}
          </ul>
          {items.length === 0 && !searching && (
            <p className="ll-empty" style={{ padding: 24 }}>
              No matches for “{query}”. Try a payout ID like po_8f21 or a merchant’s name.
            </p>
          )}
          <p className="ll-palette__foot">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> Move
            </span>
            <span>
              <Kbd>Enter</Kbd> Open
            </span>
            <span>
              <Kbd>Esc</Kbd> Close
            </span>
            {searching && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Spinner /> Searching…
              </span>
            )}
          </p>
        </div>
      )}
    </dialog>
  );
}
