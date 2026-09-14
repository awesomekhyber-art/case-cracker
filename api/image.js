// api/image.js — Vercel serverless function
// Proxies to OpenAI's image generation endpoint. OPENAI_API_KEY stays
// server-side and is never exposed to the browser. Defaults to the fast
// model (gpt-image-2.5-flare) for routine mnemonic generation; the client
// can request gpt-image-2.5-sunburst explicitly for a higher-quality reroll.
//
// Response is normalized into a shape Case Cracker owns, independent of
// whatever exact payload OpenAI happens to return — if the image provider
// or model ever changes, only this file needs to change, not the UI.
//
// Three visual roles this app maintains everywhere (keep this in mind for
// any future feature built on top of this route):
//   - a real uploaded QBank/clinical image = RECOGNITION
//   - the SVG diagram system                = UNDERSTANDING
//   - this AI-generated image                = MEMORY (never a fake scan/slide)

const ALLOWED_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];

import { verifySessionCookie } from '../lib/session.js';
import { rateLimit, getClientKey } from '../lib/ratelimit.js';

const SAFETY_SUFFIX =
  ' Style: friendly educational illustration or cartoon. No real identifiable ' +
  'people, no copyrighted characters or logos, no graphic gore or realistic ' +
  'trauma, no sexual content. Keep any humor light and cartoonish. This is a ' +
  'conceptual memory aid, not a real medical scan or photograph.';

function checkSession(req, res){
  const secret = process.env.APP_ACCESS_PIN;
  if (!secret) {
    res.status(500).json({ success: false, error: { message: 'Server misconfigured: APP_ACCESS_PIN is not set. See README.' } });
    return false;
  }
  if (!verifySessionCookie(req.headers['cookie'], secret)) {
    res.status(401).json({ success: false, error: { message: 'Unauthorized — please sign in again.' } });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: { message: 'Method not allowed' } });
    return;
  }
  if (!checkSession(req, res)) return;

  // Image generation is the most expensive call in this app — rate limit it
  // tighter than case generation to bound worst-case spend from a leaked
  // session or an over-eager reroll habit.
  if (!rateLimit('image:' + getClientKey(req), 20, 60 * 60 * 1000)) {
    res.status(429).json({ success: false, error: { message: 'Rate limit reached for image generation this hour — please wait and try again.' } });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ success: false, error: { message: 'Server misconfigured: OPENAI_API_KEY is not set.' } });
    return;
  }

  const { prompt, model, visualType } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ success: false, error: { message: 'Missing "prompt" in request body.' } });
    return;
  }
  const chosenModel = ALLOWED_MODELS.includes(model) ? model : 'gpt-image-2.5-flare';

  try {
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: chosenModel,
        prompt: prompt.slice(0, 900) + SAFETY_SUFFIX,
        size: '1024x1024',
        n: 1
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ success: false, error: data.error || { message: 'Image generation failed' } });
      return;
    }

    const b64 = data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) {
      res.status(502).json({ success: false, error: { message: 'No image data returned from image model' } });
      return;
    }

    // Stable, provider-independent shape — the client never needs to know
    // OpenAI's exact response format.
    res.status(200).json({
      success: true,
      image: {
        mimeType: 'image/png',
        data: b64,               // base64, no "data:" prefix — client decides how to use it
        model: chosenModel,
        visualType: visualType || null
      }
    });
  } catch (err) {
    res.status(502).json({ success: false, error: { message: 'Failed to reach OpenAI API: ' + err.message } });
  }
}
