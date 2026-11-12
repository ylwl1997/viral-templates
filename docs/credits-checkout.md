# Credits, phone upload, and checkout

Customer pages never name the payment provider, the bucket, or the model. This file is for operators.

## Credits

One credit is one second of that look’s source MP4. The charge is `Math.round(durationSeconds)`, and at least 1. `durationSeconds` is the only price input on the server catalog (`functions/_lib/templates.js`). `creditCost` is derived from it, and the pages read that same number. A look with no `durationSeconds` is not charged. Do not store a separate credit cost.

Current demo files, rounded:

| Look | Source | Credits |
|------|--------|---------|
| Bby Wow | 6.041667s | 6 |
| Tiny Desk | 17.76s | 18 |
| Ceiling Fan | 15.278005s | 15 |

`POST /api/jobs` deducts that amount when the photo is stored and the job row is queued. The ledger id is `deduct_{jobId}`. A second charge for the same job does not move the balance again.

If the job later fails, including a generation or audio-mix failure, `markJobFailed` writes `refund_{jobId}` for the same amount. The drain also refunds failed jobs that were charged and never refunded.

A job with no stored photo is not charged. The first allowlisted sign-in creates the account at **0** credits. There is no starter grant.

Packs, charged only when checkout is actually configured:

| Pack | Credits | Price |
|------|---------|-------|
| Starter | 60 | $5.99 |
| Mid | 180 | $14.99 |
| Large | 600 | $39.99 |

## Photos

The browser shrinks a long edge over 1280 pixels to a JPEG before upload. The Function only reads the image header.

Rejected photos:

- shorter side under 300 pixels (`photo_too_small`)
- long side more than 2.5 times the short side (`photo_aspect`)

The same checks apply to a phone upload.

## Phone upload

Desktop Create (`min-width: 840px`, signed in) calls `POST /api/uploads/phone` with `{ template_slug, slot }`. The response has a 15-minute URL `/phone/?t=` and an SVG code. The phone posts the file to `POST /api/uploads/phone/file`. Bytes go to private `MEDIA` at `handoff/{userId}/{token}.jpg|png|webp`. Only the owner’s session can read them from `GET /api/uploads/phone?token=`. Add a one-day delete rule for prefix `handoff/` on the bucket, next to the existing photo and clip rules.

The draft (photos, consent, look) is also stored in this browser’s `localStorage` until Generate queues the job or the draft is a week old.

## Sound and label

Each live reference MP4 already has an AAC bed. When the finished clip has no audio track, the job worker copies that bed in place (no re-encode). If the copy fails, the job fails and the credits return. A look with no audio bed can finish silent.

Every MP4 written to `results/` gets an XMP `uuid` box (`trainedAlgorithmicMedia`, IPTC algorithmic media). Players that ignore the box still play the file. This is not a C2PA content credential.

## Checkout

Waffo Pancake (merchant of record) via `@waffo/pancake-ts`. Both test and live use `https://api.waffo.ai`. The private key’s own environment is what the platform charges against.

Required before Buy does anything. Set the test values first. Names match the SDK where it has them:

| Key | Role |
|-----|------|
| `WAFFO_MERCHANT_ID` | Merchant ID (`MER_` + 22 characters). Dashboard → API & Development → Create an API Key |
| `WAFFO_PRIVATE_KEY` | RSA private key for that environment (PEM PKCS8 or PKCS1, or the base64 form the SDK accepts). Test key first |
| `WAFFO_PANCAKE_STORE_ID` | Store ID (`STO_` + 22 characters). Dashboard → Settings → Store Profile |

Environment, test unless you opt in:

| Key | Values |
|-----|--------|
| `WAFFO_PANCAKE_ENVIRONMENT` | `test` (default when unset) or `prod`. `live` is accepted as `prod`. Use `test` with the test private key. Set `prod` only with a production private key |

Optional:

| Key | Default |
|-----|---------|
| `WAFFO_CURRENCY` | `USD` |
| `WAFFO_WEBHOOK_TEST_PUBLIC_KEY` | Unset. SDK built-in test key verifies `X-Waffo-Signature` |
| `WAFFO_WEBHOOK_PROD_PUBLIC_KEY` | Unset. SDK built-in production key |
| `WAFFO_WEBHOOK_PUBLIC_KEY` | Unset. One key for both environments, used only when the two keys above are unset |

`POST /api/payments/checkout` with `{ "pack": "starter" | "mid" | "large" }` looks up an active one-time product in that store priced at the pack amount (metadata `pack`, or the name `60 credits` / `180 credits` / `600 credits`). If none exists, it creates one (`digital_goods`, idempotency key `pack_starter_USD_5_99` — the dot in the amount is an underscore) and then calls `checkout.authenticated.create`: `POST /v1/actions/auth/issue-session-token` and `POST /v1/actions/checkout/create-session`, signed with `X-Merchant-Id`, `X-Timestamp`, and `X-Signature`. The response `url` is the hosted `checkoutUrl` including `#token=`. A pending `payment_orders` row is written only after a product id is known. The session sends `orderMerchantExternalId` (our order id), `currency`, `buyerIdentity` (the account id), `buyerEmail` when we have one, `allowPromotionCodes: false`, and `successUrl` `https://<host>/account/credits/?checkout=return`. It does not add credits.

Register `https://<host>/api/payments/webhook` in Dashboard → Settings → Webhooks, channel `http`, event `order.completed`, `testMode: true` while the environment is test. `POST /api/payments/webhook` reads the raw body and checks `X-Waffo-Signature` (`t=<unix ms>,v1=<base64>`, signed over `${t}.${rawBody}`) with `verifyWebhook` for `WAFFO_PANCAKE_ENVIRONMENT`. Credits are added only for `order.completed` when `mode` and `storeId` match, `orderMerchantExternalId` is our pending order, and the pack amount matches `listPrice.subtotal`, `listPrice.total`, `listPrice.listTotal`, `amount`, or `chargedAmount` (a positive `listPrice.discountAmount`, or a `chargedAmount` below the pack price, does not credit). The ledger id is `topup_{orderId}`, so a repeat notice does not credit twice. Reply `OK`. A bad signature replies `Invalid signature` with HTTP 401 and does not credit. Other events, including `refund.succeeded`, reply `OK` and do not change the balance. A browser return to `/account/credits/?checkout=return` is not a payment. Closing the hosted page does not redirect back and does not send a webhook.

If any required key is missing, or the environment value is not `test`, `prod`, or `live`, Buy responds `checkout_unavailable` and writes nothing.

Test charges use card `4576 7500 0000 0110` (any future expiry, any CVC). `4576 7500 0000 0220` declines. No real money moves while the private key is a test key.

A provider refund of a pack does not remove credits. The signed-in credits page can store a short note (`POST /api/account/support`) for a missing top-up or a missing job refund.

`FAL_KEY` / `FAL_MODEL` stay unused. The default generator is Agnes Video 2.5 reference mode. A template longer than 12 seconds is split into 4–12 second pieces and joined in the worker. Bailian `wan2.2-animate-mix` runs only when that split cannot be done. See [`agnes-video.md`](agnes-video.md). Customer pages do not name either provider.
