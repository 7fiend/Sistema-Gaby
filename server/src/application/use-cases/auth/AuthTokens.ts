import { createHash, randomBytes } from 'node:crypto';

/** Refresh token opaco: 48 bytes aleatorios. Solo su SHA-256 toca la BD. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
