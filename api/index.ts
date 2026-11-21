import app from '../server.ts';
import { ensureDefaultSeedData } from '../server/services/db.ts';

let initialized = false;

export default async function handler(req: any, res: any) {
  if (!initialized) {
    await ensureDefaultSeedData();
    initialized = true;
  }
  return app(req, res);
}
