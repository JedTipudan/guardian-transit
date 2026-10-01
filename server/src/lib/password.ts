import bcrypt from 'bcryptjs';
import config from '../config/env';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
};

/**
 * Server-side password rules. Kept intentionally explicit so the API rejects
 * weak passwords even if a client bypasses the UI validation.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    issues.push(`Use at least ${PASSWORD_POLICY.minLength} characters.`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    issues.push('Password is too long.');
  }
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter.');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number.');
  return issues;
}
