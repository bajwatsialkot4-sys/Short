import type { Request, Response } from 'express';
import { createApiApp } from '../server/api.ts';

const app = createApiApp();

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
