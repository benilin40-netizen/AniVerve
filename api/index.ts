import type { Request, Response } from 'express';
import app from '../server.ts';
import { ensureDefaultSeedData } from '../server/services/db.ts';

let initialized = false;

export default async function handler(req: Request, res: Response) {
  if (!initialized) {
    await ensureDefaultSeedData();
    initialized = true;
  }
  return app(req, res);
}
