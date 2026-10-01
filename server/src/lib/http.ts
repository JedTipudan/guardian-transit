import type { Response } from 'express';

export function sendOk(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function sendCreated(res: Response, data: unknown): void {
  sendOk(res, data, 201);
}
