import { parsePrefs, PREFS_COOKIE } from '@ledgerline/core/theme';
import { PageHeader } from '@ledgerline/core/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SettingsForm } from '@/components/SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section F · House Style"
        title="Settings"
        deck="Set the colours, motion & density you read the paper in. Changes apply at once & stay on this device."
      />
      <SettingsForm initial={prefs} />
    </div>
  );
}
