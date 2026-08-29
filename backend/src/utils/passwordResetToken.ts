import crypto from 'node:crypto';

const PASSWORD_RESET_TOKEN_BYTES = 32;

export const generatePasswordResetToken = (): string =>
  crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');

export const hashPasswordResetToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');
