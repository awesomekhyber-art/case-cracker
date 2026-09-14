// lib/ratelimit.js — best-effort, in-memory, per-warm-instance rate limiting.
//
// HONEST LIMITATION: this state lives in the serverless function's memory,
// which resets on cold start and is NOT shared across multiple concurrent
// instances if Vercel scales your function horizontally under load. For a
// personal app that only you (and anyone who finds the URL) would hit, this
// is a reasonable deterrent against casual PIN brute-forcing or runaway
// image-generation spend. It is NOT a substitute for real edge/infra-level
// rate limiting (e.g. Vercel's Attack Challenge Mode, Cloudflare, or a real
// Redis-backed limiter) if this app ever becomes a genuinely public target.
// Adding that later does not require changing anything else in this file's
// call sites — just swapping this implementation.

const buckets = new Map();

export function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= maxRequests;
}

export function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
