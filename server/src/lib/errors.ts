import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, 'BAD_REQUEST', details);

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(message, 401, 'UNAUTHORIZED');

export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(message, 403, 'FORBIDDEN');

export const notFound = (message = 'The requested resource was not found.') =>
  new AppError(message, 404, 'NOT_FOUND');

export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, 'CONFLICT', details);

export const tooMany = (message = 'Too many requests. Please try again later.') =>
  new AppError(message, 429, 'RATE_LIMITED');

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler =
  (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(zodErrorToAppError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function zodErrorToAppError(error: ZodError): AppError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  const first = issues[0]?.message ?? 'Invalid input.';
  return new AppError(first, 422, 'VALIDATION_ERROR', issues);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    const appError = zodErrorToAppError(err);
    res.status(appError.status).json({
      ok: false,
      error: { code: appError.code, message: appError.message, details: appError.details },
    });
    return;
  }

  // Prisma known errors → safe, non-leaking messages.
  const prismaError = err as { code?: string; meta?: unknown };
  if (prismaError && typeof prismaError.code === 'string') {
    if (prismaError.code === 'P2002') {
      res.status(409).json({
        ok: false,
        error: { code: 'CONFLICT', message: 'That record already exists.' },
      });
      return;
    }
    if (prismaError.code === 'P2025') {
      res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'The requested record was not found.' },
      });
      return;
    }
    if (prismaError.code === 'P2003') {
      res.status(400).json({
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'That change would break a related record.',
        },
      });
      return;
    }
  }

  console.error('[unhandled error]', err);
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
  });
}
