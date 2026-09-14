// lib/session.js — stateless, signed session cookies.
// No database or session store needed: the cookie itself carries an
// expiry timestamp plus an HMAC signature (keyed by APP_ACCESS_PIN), so
// verifying a session is just "recompute the HMAC and compare" — no lookup
// required. This is deliberately lightweight for a personal single-user app;
// it is NOT a general-purpose auth system.

import crypto from 'crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionCookie(secret, isHttps) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiry);
  const token = `${payload}.${sign(payload, secret)}`;
  const parts = [
    `cc_session=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(isHttps) {
  const parts = ['cc_session=', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function verifySessionCookie(cookieHeader, secret) {
  if (!cookieHeader) return false;
  const match = /(?:^|;\s*)cc_session=([^;]+)/.exec(cookieHeader);
  if (!match) return false;
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return false;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return false;

  const expected = sign(payload, secret);
  try {
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  } catch (e) {
    return false;
  }

  const expiry = parseInt(payload, 10);
  if (!Number.isFinite(expiry)) return false;
  return Date.now() / 1000 <= expiry;
}

export function isHttpsRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL_ENV === 'production';
}
