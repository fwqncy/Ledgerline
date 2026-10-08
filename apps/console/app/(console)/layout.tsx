import { createBaseContext } from '@ledgerline/core/server';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { mountedModules } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const base = await createBaseContext('console');
  const nav = await Promise.all(
    mountedModules.map(async (m) => ({
      name: m.manifest.name,
      title: m.manifest.title,
      version: m.manifest.version,
      // A module whose badge query fails shouldn't take the nav down with it.
      badge: m.badge ? await m.badge(base).catch(() => 0) : 0,
    })),
  );

  return (
    <div className="ll-console">
      <a href="#main" className="ll-skip">
        Skip to Content
      </a>
      <Sidebar modules={nav} operator={base.operator?.name ?? 'Signed out'} />
      <main id="main" className="ll-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
