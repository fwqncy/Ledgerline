import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.join(__dirname, '..', '..');

const config: NextConfig = {
  // Modules ship as TypeScript source from the workspace.
  transpilePackages: [
    '@ledgerline/core',
    '@ledgerline/frontpage',
    '@ledgerline/risk',
    '@ledgerline/payouts',
    '@ledgerline/support',
    '@ledgerline/ledger',
  ],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
};

export default config;
