import 'dotenv/config';
import { createPartnerApi } from './app';
import { loadConfig } from './config';
import { createDb } from './db';
import { startWorkers } from './workers';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const { app, apollo } = await createPartnerApi(db, config);
const stopWorkers = startWorkers(db, config);

const server = app.listen(config.PORT, () => {
  console.log(`Partner API listening on http://localhost:${config.PORT}/graphql`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  stopWorkers();
  server.close();
  await apollo.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
