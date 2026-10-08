import 'server-only';
import type { ConsoleModule } from '@ledgerline/core/module';
import { modules } from '../modules';

/**
 * LEDGERLINE_MODULES=payouts,support mounts a subset; by default every module is mounted.
 * A module that isn't mounted simply disappears from the nav and its API returns 404.
 */
const enabled = process.env.LEDGERLINE_MODULES?.split(',').map((name) => name.trim());

export const mountedModules: ConsoleModule[] = modules.filter((m) => !enabled || enabled.includes(m.manifest.name));

export const findModule = (name: string) => mountedModules.find((m) => m.manifest.name === name);
