import { createHmac, timingSafeEqual } from 'crypto';

// Verifies the session token App Bridge attaches to requests from inside the Shopify admin.
// HS256 JWT signed with the app's client secret: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens

export interface SessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function verifySessionToken(
  token: string,
  opts: { clientId: string; clientSecret: string; shop: string }
): SessionTokenPayload | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;

  const expected = base64url(createHmac('sha256', opts.clientSecret).update(`${header}.${payload}`).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims: SessionTokenPayload;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  // A few seconds of leeway for clock drift between Shopify and Railway
  if (claims.exp < now - 5 || claims.nbf > now + 5) return null;
  if (claims.aud !== opts.clientId) return null;

  const destHost = new URL(claims.dest).hostname;
  if (new URL(claims.iss).hostname !== destHost) return null;
  if (destHost !== opts.shop) return null;

  return claims;
}
