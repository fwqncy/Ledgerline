import { redirect } from 'next/navigation';
import { mountedModules } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export default function Home() {
  const first = mountedModules[0];
  redirect(first ? `/${first.manifest.name}` : '/settings');
}
