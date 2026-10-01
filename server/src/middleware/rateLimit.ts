import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config/env';
import { AppError } from '../lib/errors';

function build(windowMs: number, max: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(message, 429, 'RATE_LIMITED', { retryAfterSeconds: Math.ceil(windowMs / 1000) }));
    },
  });
}

export const globalLimiter = build(
  config.rateLimit.windowMs,
  config.rateLimit.max,
  'Too many requests from this device. Please slow down and try again shortly.',
);

/** Applied to credential-checking endpoints so password guessing is throttled. */
export const authLimiter = build(15 * 60 * 1000, config.rateLimit.authMax, 'Too many sign-in attempts. Please wait a few minutes and try again.');

/** Applied to OTP request/verification endpoints. */
export const otpLimiter = build(15 * 60 * 1000, 20, 'Too many verification requests. Please wait a few minutes and try again.');

/** Applied to ride creation. */
export const bookingLimiter = build(10 * 60 * 1000, 20, 'Too many ride requests. Please wait a moment before booking again.');

/** Applied to SOS/emergency submission. */
export const emergencyLimiter = build(60 * 1000, 10, 'Emergency reports are rate limited. If this is urgent, call the hotline directly.');
