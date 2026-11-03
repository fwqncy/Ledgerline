import type { Config } from './config';
import type { Db } from './db';
import { settleDuePayouts } from './services/payouts';
import { dispatchDueWebhooks } from './services/webhooks';

/** Background loops: simulated settlement and webhook delivery. Returns a stop function. */
export function startWorkers(db: Db, config: Config, { intervalMs = 2_000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (config.SETTLE_AFTER_MS > 0) await settleDuePayouts(db, { olderThanMs: config.SETTLE_AFTER_MS });
      await dispatchDueWebhooks(db);
    } catch (error) {
      console.error('Worker tick failed:', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
