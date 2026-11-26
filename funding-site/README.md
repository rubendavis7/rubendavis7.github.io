# Delta Capital Group funding site

Mobile-first business funding site: homepage, funding calculator, 3-step application, post-application feedback and a small admin view.

Next.js (App Router) · TypeScript · Tailwind CSS · Framer Motion · Lucide.

## Run it

```bash
cd funding-site
npm install
cp .env.example .env.local   # optional; set ADMIN_PASSWORD to use /admin
npm run dev                  # http://localhost:3000
```

With no env vars set, applications and feedback are saved to `data/*.jsonl` (git-ignored).

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (type-checks too) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests for calculator math and validation |

## Before launch: clear every [VERIFY]

The site ships with placeholders. Each one shows an amber **VERIFY** tag on the page until you confirm it.

1. **`lib/site-config.ts`**: company story for `/about`, phone, email, mailing address, hours, qualification minimums, product wording and example amounts, testimonials, response and decision times, TCPA consent text. Flip the matching flag in `VERIFIED` to `true` when a group is confirmed.
2. **`lib/calculator.ts`**: revenue multiples, factor rates, terms, max funding and range spread. These are placeholders, not real underwriting numbers. If you change them, update the expected numbers in `lib/calculator.test.ts`.
3. **`/privacy`, `/terms`, `/disclosures`**: template text. Have an attorney review.
4. **Photos**: `PhotoSlot` draws a placeholder. Put real photos in `public/images/` and pass `src="/images/..."` (see `components/ValueProps.tsx` and `components/ProductTabs.tsx`).

The placeholder minimum time in business is "3+ months", matching the calculator's first tier. If the real minimum is different, change both `QUALIFICATION` and `TIB_TIERS`.

## Where things live

| File | Purpose |
| --- | --- |
| `lib/calculator.ts` | All calculator math, commented. The only place to change multipliers and factor rates. |
| `lib/site-config.ts` | Brand, contact, copy with numbers or claims, dropdown options. |
| `lib/validation.ts` | Form rules, shared by the browser and the API. |
| `lib/storage.ts` | Saves leads and feedback (file or Redis). |
| `lib/notify.ts` | Webhook and email alerts. |
| `app/globals.css` | Brand colors (`brand-*`, `ink-*`). |

## API

`POST /api/apply`: JSON body with `businessName`, `industry`, `timeInBusiness`, `annualSales`, `requestedAmount`, `useOfFunds`, `fullName`, `email`, `phone`, `consent: true`.
Returns `201 { ok, applicationId, estimate }`, or `422 { ok: false, error, fieldErrors }`.

`POST /api/feedback`: `{ applicationId, rating: 1-5, comment? }`. Returns `200 { ok: true }`, `404` for an unknown application, `422` for a bad rating.

Both routes are rate-limited per IP and reject bad JSON (`400`) and oversized bodies (`413`).

## Alerts

Set in `.env.local` or your host's environment settings:

- `WEBHOOK_URL`: receives JSON for each application and each feedback rating. The body has a `text` field, so a Slack incoming webhook works as-is. Zapier, Make and CRM webhooks get the full record.
- `RESEND_API_KEY` + `NOTIFY_EMAIL`: email alerts through Resend. Set `NOTIFY_FROM` to a sender on a domain you verified in Resend.

If saving fails but an alert goes out, the applicant still sees success, so the lead isn't lost.

## Deploy to Vercel

1. Import the repo in Vercel and set **Root Directory** to `funding-site`.
2. Add env vars: `ADMIN_PASSWORD`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, optionally `WEBHOOK_URL`.
3. **Add permanent storage.** Vercel's disk is temporary, so file storage there loses records. Create an Upstash Redis store (Vercel Marketplace) and set `KV_REST_API_URL` and `KV_REST_API_TOKEN`. `/admin` shows a warning until this is done. The Redis driver has not been run against a live store yet, so submit a test application after you connect it.

The static pages at the repo root (GitHub Pages) are separate and unaffected.

## Admin

`/admin` is off until `ADMIN_PASSWORD` is set. It lists applications with each applicant's rating and comment. Sessions last 8 hours.

## Data handling

`data/` holds applicant contact details and consent records (text version, time, IP, browser). It is git-ignored. Don't commit it or copy it into other files.
