import { createHmac, timingSafeEqual } from 'crypto';

type InvitePayload = { orgId: string; role: string; expiresAt: number };

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(payload: InvitePayload, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(unsigned).digest();
  return `${unsigned}.${base64url(sig)}`;
}

function verify(token: string, secret: string): InvitePayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const given = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as InvitePayload;
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createInviteURL(baseUrl: string, orgId: string, role: string, secret: string, ttlMs = 1000 * 60 * 60 * 24): string {
  const token = sign({ orgId, role, expiresAt: Date.now() + ttlMs }, secret);
  const url = new URL(`/pages/api/orgs/${orgId}/invites/accept`, baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function parseInviteToken(token: string, secret: string): InvitePayload | null {
  return verify(token, secret);
}

