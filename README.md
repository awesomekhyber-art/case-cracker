# Case Cracker

A gamified board-exam study app. Paste a vignette, Claude builds an interactive
breakdown (clues, mechanism, diagrams, quiz), and you can optionally forge an
AI-generated mnemonic image for the case ("Visual Memory Forge").

This version runs as a real deployed web app with a tiny backend — not a
Claude.ai artifact — specifically so it can call an image-generation API,
which artifacts can't do.

This guide assumes you've never deployed a web app before. Follow it in order.

---

## 1. What you need

- A free [Vercel](https://vercel.com) account (this is where the app will live).
- An [Anthropic API key](https://console.anthropic.com/settings/keys) — powers
  the case-generation reasoning (Claude).
- An [OpenAI API key](https://platform.openai.com/api-keys) with access to the
  Images API — powers the Visual Memory Forge. **This part costs money per
  image** (see the cost section below) — the app works completely fine
  without it if you skip this and just never click the Forge buttons.
- A personal access PIN you make up yourself (any string — a passphrase is
  fine, doesn't need to be numeric).
- [Node.js](https://nodejs.org) installed on your computer (for local testing
  and for the `vercel` command-line tool).

## 2. Get your API keys

**Anthropic:**
1. Go to https://console.anthropic.com and sign up/log in.
2. Go to Settings → API Keys → Create Key.
3. Copy it somewhere safe — you won't be able to see it again.

**OpenAI:**
1. Go to https://platform.openai.com and sign up/log in.
2. Go to API Keys → Create new secret key.
3. You'll need billing set up on your OpenAI account (Settings → Billing) for
   image generation to actually work — it's pay-as-you-go, no subscription.
4. Copy the key somewhere safe.

## 3. The three environment variables

This app needs exactly three secrets, all set as **environment variables**
(never written into any file that gets committed to a repo):

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude case generation |
| `OPENAI_API_KEY` | Visual Memory Forge image generation |
| `APP_ACCESS_PIN` | Your personal access PIN (you make this up) |

Copy `.env.example` to `.env` if you want to test locally, and fill in real
values there. **Never commit a real `.env` file to a public GitHub repo.**

## 4. How the access protection works

This app is protected by a single shared PIN — appropriate for a personal
app, not a real multi-user accounts system. Here's the actual flow:

1. You open the app and see a PIN prompt.
2. You type your PIN once. It's sent to `/api/auth`, which checks it against
   `APP_ACCESS_PIN` on the server.
3. If correct, the server issues a signed, `HttpOnly` session cookie (valid
   12 hours). Your browser stores this automatically — **your PIN itself is
   never stored anywhere in the browser**, and JavaScript can't even read an
   `HttpOnly` cookie, so there's nothing for a browser extension or malicious
   script to steal.
4. Every later request to `/api/case` or `/api/image` sends that cookie
   automatically (browsers do this natively for same-origin requests). The
   server verifies the cookie's signature and expiry — never the raw PIN.
5. After 12 hours (or if you clear cookies), you'll be asked for the PIN again.

**Rate limiting:** `/api/auth` allows 8 attempts per 5 minutes (slows down PIN
guessing). `/api/case` allows 30 requests/hour, `/api/image` allows 20/hour
(image generation costs more per-call, so it's capped tighter). This is
in-memory, best-effort protection — it resets if your Vercel function cold-starts,
and isn't a substitute for real infrastructure-level rate limiting if this app
ever became a genuinely public target. For a personal app, it's a reasonable
deterrent against someone stumbling on your URL and running up your bill.

## 5. Running it locally

```bash
npm install -g vercel      # one-time, if you don't already have it
cd case-cracker
vercel dev
```

This starts a local server (usually `http://localhost:3000`) that runs the
real `/api/*` functions locally, reading from your local `.env` file. Open
that URL, enter your PIN, and try it.

## 6. Deploying to Vercel

**Easiest path (no GitHub needed):**
```bash
cd case-cracker
vercel
```
Follow the prompts (link/create a project, accept defaults). It'll give you a
live URL. Then set your environment variables for the deployed project:
```bash
vercel env add ANTHROPIC_API_KEY
vercel env add OPENAI_API_KEY
vercel env add APP_ACCESS_PIN
```
(It'll ask for the value and which environments — choose Production, and
Preview/Development too if you want.) Then redeploy so the new env vars take
effect:
```bash
vercel --prod
```

**Alternative (GitHub-connected):** push this folder to a GitHub repo, then
on vercel.com click "Add New Project," import the repo, and add the same
three environment variables in the project's Settings → Environment Variables
tab before your first deploy.

## 7. Testing that it actually works

**Test case generation:** open the deployed URL, enter your PIN, paste any
vignette (or click "Try a sample case"), click "Crack this case." If it works,
you'll see the Guess stage render. If you get a server error, check the
Vercel dashboard's function logs (Project → Deployments → click the
deployment → Functions tab) for the actual error — usually a missing/wrong
`ANTHROPIC_API_KEY`.

**Test Visual Memory Forge:** get to the "Lock It In" stage of any case, and
click one of the three Forge buttons (🩺/🧠/💀). If configured correctly,
an image appears in a few seconds. If it fails, check Vercel's function logs
for `api/image` — usually a missing/wrong `OPENAI_API_KEY`, or your OpenAI
account not having billing enabled.

## 8. Common errors and fixes

| Symptom | Likely cause |
|---|---|
| PIN prompt keeps rejecting a PIN you're sure is right | `APP_ACCESS_PIN` env var not set on the deployment, or you need to redeploy after adding it |
| "Server misconfigured: ANTHROPIC_API_KEY is not set" | Add the env var in Vercel, then redeploy |
| Case generation returns a parse error occasionally | Rare — the app has multiple auto-repair passes for common LLM formatting slips; if it persists, check the browser console for the detailed diagnostic it logs |
| Forge image never loads / spins forever | Check `OPENAI_API_KEY` is set and your OpenAI account has billing enabled |
| "Too many attempts" on PIN entry | You hit the rate limit (8 tries/5 min) — wait a few minutes |
| "Rate limit reached" on case/image generation | You hit the hourly cap — wait, or raise the limits in `lib/ratelimit.js` if you want (see comments there) |
| Everything works locally but not deployed | Environment variables usually weren't set on the Vercel *project*, only locally — see step 6 |

## 9. Updating / redeploying later

Whenever you get updated files (from me, or your own edits):
1. Replace the changed files in your project folder.
2. If you used the GitHub path: commit and push — Vercel auto-redeploys.
3. If you used the CLI path: run `vercel --prod` again from the project folder.

No database migrations or anything like that — this app has no database.

## 10. What actually costs money, and when

- **Opening the app / entering your PIN:** free. `/api/auth` never calls
  Anthropic or OpenAI.
- **"Crack this case":** costs Anthropic API usage (one call per attempt,
  including the automatic one-time retry if the first response doesn't parse
  cleanly). This is normal LLM API pricing — check
  https://www.anthropic.com/pricing for current rates.
- **Visual Memory Forge — every button press that generates an image**
  (initial generation, Reroll, Make Weirder, More Medical, More Unhinged)
  costs one OpenAI image generation call. The "✨ Higher quality" toggle uses
  the more expensive Sunburst model instead of the default Flare model.
  **Just reading a case, without ever touching the Forge buttons, costs
  nothing on the OpenAI side.**
- Reviewing a previously *saved* case from your Deck costs nothing — the
  image is pulled from your browser's local storage, not regenerated.

## 11. What's actually stored, and where

- **Your stats, streaks, and Deck** (list of past cases): stored in your
  browser's IndexedDB, under the hood via a small polyfill that mimics the
  interface this app was originally built against. Nothing is sent to any
  server for storage — it's all local to your browser/device.
- **Saved Visual Memory Forge images**: stored as real binary `Blob` objects
  in a separate IndexedDB store — not as bloated base64 text inside your Deck
  data. The Deck only holds a small reference (an ID) plus lightweight
  metadata (what the image is teaching, its recall question) — never the
  image bytes themselves.
- None of this syncs across devices/browsers yet — it's genuinely local-first,
  by design, for this version. (See the "not yet built" section below.)

## 12. Local dev testing tools (optional, not required for deployment)

The `test/` folder contains Playwright-based functional tests used to verify
this build before shipping it (headless browser tests against mocked API
responses, since real API credentials weren't available during development).
They're included for your reference/reuse but aren't needed to run or deploy
the app — Vercel only looks at `index.html`, `api/`, and `lib/`. To rerun them
yourself, you'd need `npm install playwright` locally.

## 13. What this version deliberately does NOT include yet

Per the current build plan, this pass focused only on the architecture and
Visual Memory Forge foundation — the following are intentionally not built
yet, to avoid feature creep before this foundation is proven stable:
Prediction Lock, confidence betting, mistake fingerprinting, real spaced
repetition scheduling, three-star mastery ratings, Distractor Duels, and Boss
Battles. These are the planned next phase.

## 14. File structure

```
case-cracker/
├── index.html          # the entire frontend — UI, game logic, IndexedDB storage
├── package.json         # marks this as an ES module project (needed for the api/ files)
├── .env.example          # template for local environment variables
├── api/
│   ├── auth.js          # PIN verification + session cookie issuance
│   ├── case.js           # proxies to Anthropic (holds the full system prompt)
│   └── image.js          # proxies to OpenAI's image generation endpoint
├── lib/
│   ├── session.js        # signed session cookie create/verify logic
│   └── ratelimit.js      # lightweight in-memory rate limiter
└── test/                 # optional Playwright functional tests (see section 12)
```
