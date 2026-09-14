// api/auth.js — Vercel serverless function
//
// GET  -> checks whether the request already carries a valid session cookie
//         (used on page load so we don't force a re-login every visit).
// POST -> verifies the submitted PIN against APP_ACCESS_PIN and, on success,
//         issues a short-lived HttpOnly session cookie. The raw PIN is only
//         ever sent ONCE, here, at login — /api/case and /api/image check
//         the signed cookie afterward, never the PIN itself.
//
// This is intentionally a single shared-secret gate for a personal app, not
// a real accounts system.

import { createSessionCookie, verifySessionCookie, isHttpsRequest } from '../lib/session.js';
import { rateLimit, getClientKey } from '../lib/ratelimit.js';

export default async function handler(req, res) {
  const clientKey = getClientKey(req);
  const secret = process.env.APP_ACCESS_PIN;

  if (req.method === 'GET') {
    if (!secret) {
      res.status(500).json({ ok: false, error: { message: 'Server misconfigured: APP_ACCESS_PIN is not set. See README.' } });
      return;
    }
    const valid = verifySessionCookie(req.headers['cookie'], secret);
    res.status(valid ? 200 : 401).json({ ok: valid });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: { message: 'Method not allowed' } });
    return;
  }

  // Rate-limit login attempts specifically to slow down PIN brute-forcing.
  if (!rateLimit('auth:' + clientKey, 8, 5 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: { message: 'Too many attempts — please wait a few minutes and try again.' } });
    return;
  }

  if (!secret) {
    res.status(500).json({ ok: false, error: { message: 'Server misconfigured: APP_ACCESS_PIN is not set. See README.' } });
    return;
  }

  const { pin } = req.body || {};
  if (typeof pin === 'string' && pin === secret) {
    res.setHeader('Set-Cookie', createSessionCookie(secret, isHttpsRequest(req)));
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: { message: 'Incorrect PIN' } });
  }
}
