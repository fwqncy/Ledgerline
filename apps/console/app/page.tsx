import { redirect } from 'next/navigation';
import { mountedModules } from '@/lib/registry';

export default function Home() {
  const first = mountedModules.find((m) => m.manifest.name === 'payouts') ?? mountedModules[0];
  redirect(first ? `/${first.manifest.name}` : '/payouts');
}
