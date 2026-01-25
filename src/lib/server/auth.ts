import { createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(payload: string): string {
  const sig = createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return payload;
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  if (username !== env.ADMIN_USERNAME) return false;
  const result = await compare(password, env.ADMIN_PASSWORD_HASH);
  return result;
}

export function createSession(username: string): string {
  const payload = JSON.stringify({ username, exp: Date.now() + MAX_AGE * 1000 });
  return sign(Buffer.from(payload).toString('base64url'));
}

export function readSession(token: string): { username: string } | null {
  const raw = verify(token);
  if (!raw) return null;

  try {
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return { username: payload.username };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production'
};
