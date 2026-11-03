import { PageHeader } from '@ledgerline/core/ui';
import type { ReactNode } from 'react';
import { DevNav } from './ui/DevNav';
import './developers.css';

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section G · For Partners"
        title="Developers"
        deck="The Partner API lets marketplaces & platforms read their ledger & pay their sellers. Manage keys, read the schema & try a query."
      />
      <DevNav />
      <div className="tw:mt-6 tw:grid tw:gap-6">{children}</div>
    </div>
  );
}
