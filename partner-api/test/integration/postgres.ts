import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { createDb, type Db } from '../../src/db';

const root = path.resolve(import.meta.dirname, '../..');

export interface TestDatabase {
  url: string;
  db: Db;
  stop(): Promise<void>;
}

/**
 * Creates a fresh, uniquely named database, applies the real migrations with
 * `prisma migrate deploy`, and drops it again on stop().
 *
 * By default the server is a throwaway Postgres container (Testcontainers).
 * Set TEST_DATABASE_URL to use an existing server instead, e.g. the
 * `postgres-test` service from docker-compose.yml.
 */
export async function startDatabase(): Promise<TestDatabase> {
  let container: StartedPostgreSqlContainer | undefined;
  let serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    serverUrl = container.getConnectionUri();
  }

  const name = `partner_api_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });

  const db = createDb(url.toString());
  return {
    url: url.toString(),
    db,
    async stop() {
      await db.$disconnect();
      if (container) return void (await container.stop());
      const cleanup = new pg.Client({ connectionString: serverUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
