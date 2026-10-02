import crypto from 'crypto';
import type { OtpPurpose } from '@prisma/client';
import config from '../config/env';
import { prisma } from './prisma';
import { AppError, badRequest } from './errors';
import { sendSms } from '../services/sms';

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, '');

function hashCode(code: string, phone: string): string {
  return crypto
    .createHmac('sha256', config.authSecret)
    .update(`${phone}:${code}`)
    .digest('hex');
}

function randomDigits(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length);
    for (const byte of bytes) {
      if (out.length < length && byte < 250) {
        out += String(byte % 10);
      }
    }
  }
  return out;
}

export interface OtpIssueResult {
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  messageId?: string;
}

/**
 * Issues a fresh OTP for a phone number, enforcing a resend cooldown so the
 * endpoint cannot be abused to spam a user.
 */
export async function issueOtp(
  rawPhone: string,
  purpose: OtpPurpose,
  context: { name?: string } = {},
): Promise<OtpIssueResult> {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 7) throw badRequest('Enter a valid mobile number.');

  const cooldownMs = config.otp.resendCooldownSeconds * 1000;
  const recent = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (recent && Date.now() - recent.createdAt.getTime() < cooldownMs) {
    const wait = Math.ceil((cooldownMs - (Date.now() - recent.createdAt.getTime())) / 1000);
    throw new AppError(
      `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting a new code.`,
      429,
      'RESEND_COOLDOWN',
      { resendAfterSeconds: wait },
    );
  }

  const code = config.sms.provider === 'dev' ? '123456' : randomDigits(config.otp.length);
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);

  await prisma.otpCode.create({
    data: {
      phone,
      codeHash: hashCode(code, phone),
      purpose,
      expiresAt,
    },
  });

  const greeting = context.name ? `, ${context.name}` : '';
  const message =
    `Guardian Transit${greeting}: your verification code is ${code}. ` +
    `It expires in ${Math.round(config.otp.ttlSeconds / 60)} minute(s). Never share it with anyone.`;

  const result = await sendSms(phone, message);

  return {
    phone,
    expiresInSeconds: config.otp.ttlSeconds,
    resendAfterSeconds: config.otp.resendCooldownSeconds,
    messageId: result.messageId,
  };
}

export interface OtpVerification {
  ok: boolean;
  reason?: 'NOT_FOUND' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'MISMATCH';
  attemptsLeft?: number;
}

/** Checks a submitted code. Attempt counters are persisted to resist brute force. */
export async function verifyOtp(
  rawPhone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<OtpVerification> {
  const phone = normalizePhone(rawPhone);

  const record = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { ok: false, reason: 'NOT_FOUND' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
  if (record.attempts >= config.otp.maxAttempts) {
    return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(hashCode(code.trim(), phone), 'hex'),
    Buffer.from(record.codeHash, 'hex'),
  );

  if (!matches) {
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const attemptsLeft = Math.max(0, config.otp.maxAttempts - updated.attempts);
    return { ok: false, reason: 'MISMATCH', attemptsLeft };
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}

export const otpRetryMessage = (verification: OtpVerification): string => {
  switch (verification.reason) {
    case 'NOT_FOUND':
      return 'No active code found. Request a new one.';
    case 'EXPIRED':
      return 'That code has expired. Request a new one.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many attempts. Request a new code to continue.';
    default:
      return 'That code is not correct.';
  }
};

export { normalizePhone };
