import crypto from 'crypto';
import config from '../config/env.js';

const ALGO = 'aes-256-gcm';
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getKey(): Buffer {
  const secret = process.env.BACKUP_CODES_SECRET || config.jwtSecret;
  return crypto.createHash('sha256').update(secret).digest();
}

export function generateBackupCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += BACKUP_CODE_CHARS[crypto.randomInt(BACKUP_CODE_CHARS.length)];
  }
  return code;
}

export function generateBackupCodes(count: number = 8): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    set.add(generateBackupCode());
  }
  return Array.from(set);
}

interface EncryptedPayload {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

export function encryptBackupCodes(codes: string[]): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const json = JSON.stringify(codes);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
  return JSON.stringify(payload);
}

export function decryptBackupCodes(payload: string): string[] {
  const parsed: EncryptedPayload = JSON.parse(payload);
  if (!parsed?.iv || !parsed?.tag || !parsed?.data) {
    throw new Error('Formato de payload inválido');
  }

  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final()
  ]);

  const codes = JSON.parse(decrypted.toString('utf8'));
  if (!Array.isArray(codes)) {
    throw new Error('Contenido inválido');
  }
  return codes;
}