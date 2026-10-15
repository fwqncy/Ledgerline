import { RelativeTime } from '@ledgerline/core/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findModule } from '@/lib/registry';

type Props = { params: Promise<{ module: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mod = findModule((await params).module);
  return { title: mod?.manifest.title ?? 'Not Found' };
}

export default async function ModulePage({ params }: Props) {
  const mod = findModule((await params).module);
  if (!mod) notFound();
  const { Page, manifest, deployedAt } = mod;

  return (
    <>
      <Page />
      <p className="ll-module-stamp ll-mono" translate="no">
        {manifest.name}@v{manifest.version} · <RelativeTime iso={deployedAt} prefix="deployed " />
      </p>
    </>
  );
}
