import type { AuthContext } from '../auth/scopes';
import type { Config } from '../config';
import type { Db } from '../db';
import type { Loaders } from './loaders';

export interface Context extends AuthContext {
  db: Db;
  config: Config;
  loaders: Loaders;
  /** The request's Idempotency-Key header, if any. */
  idempotencyKey: string | null;
  setHeader(name: string, value: string): void;
}
