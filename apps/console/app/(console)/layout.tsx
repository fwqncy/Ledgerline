import { createBaseContext } from '@ledgerline/core/server';
import { parsePrefs, PREFS_COOKIE } from '@ledgerline/core/theme';
import { Toaster } from '@ledgerline/core/ui';
import { PayoutsTicker } from '@ledgerline/payouts/ticker';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { CommandPalette } from '@/components/CommandPalette';
import { SectionNav } from '@/components/SectionNav';
import { Shortcuts } from '@/components/Shortcuts';
import { mountedModules } from '@/lib/registry';

export const dynamic = 'force-dynamic';

/** Dates follow the reader's language (Accept-Language), never their IP. */
async function readerLocale() {
  const header = (await headers()).get('accept-language') ?? '';
  const first = header.split(',')[0]?.split(';')[0]?.trim();
  try {
    return first ? Intl.getCanonicalLocales(first)[0]! : 'en-GB';
  } catch {
    return 'en-GB';
  }
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const base = await createBaseContext('console');
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const locale = await readerLocale();

  const nav = await Promise.all(
    mountedModules.map(async (m) => ({
      name: m.manifest.name,
      title: m.manifest.title,
      version: m.manifest.version,
      hotkey: m.hotkey ?? null,
      // A module whose badge query fails shouldn't take the nav down with it.
      badge: m.badge ? await m.badge(base).catch(() => 0) : 0,
    })),
  );
  const commands = mountedModules.flatMap((m) => (m.commands ?? []).map((c) => ({ ...c, section: m.manifest.title })));
  const operator = base.operator?.name ?? 'Signed out';
  const dateline = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const showTicker = prefs.ticker && mountedModules.some((m) => m.manifest.name === 'payouts');

  return (
    <div className="ll-app">
      <a href="#main" className="ll-skip">
        Skip to Content
      </a>
      {showTicker && <PayoutsTicker />}

      <header className="ll-masthead">
        <div className="ll-masthead__bar">
          <p className="ll-masthead__meta">
            <span className="ll-regmark" aria-hidden />
            <span>London</span>
            <span className="ll-masthead__meta--hide-sm">· Payments Desk</span>
          </p>
          <div className="ll-masthead__brand">
            <BrandMark />
            <p className="ll-tagline">Money talks. We keep the ledger.</p>
          </div>
          <p className="ll-masthead__meta ll-masthead__meta--end">
            <time dateTime={new Date().toISOString().slice(0, 10)}>{dateline}</time>
            <span className="ll-barcode ll-masthead__meta--hide-sm" aria-hidden />
          </p>
        </div>
        <hr className="ll-masthead__rule" />
      </header>

      <SectionNav modules={nav} operator={operator} />

      <main id="main" className="ll-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="ll-colophon">
        <span>
          Printed by Ledgerline · {operator} on duty · <Link href="/settings">Settings</Link>
        </span>
        <span className="ll-checker" aria-hidden />
        <span translate="no">{nav.map((m) => `${m.name}@v${m.version}`).join(' · ')}</span>
      </footer>

      <CommandPalette modules={nav} commands={commands} />
      <Shortcuts modules={nav} />
      <Toaster />
    </div>
  );
}
