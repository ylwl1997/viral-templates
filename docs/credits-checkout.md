# Credits, phone upload, and checkout

Customer pages never name the payment provider, the bucket, or the model. This file is for operators.

## Credits

One credit is about one second of a clip.

| Look | Credits |
|------|---------|
| Bby Wow | 10 |
| Kiss Cam | 12 |
| Ceiling Fan | 15 |

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

Required before Buy does anything:

| Key | Role |
|-----|------|
| `WAFFO_API_KEY` | `X-API-KEY` |
| `WAFFO_MERCHANT_ID` | `merchantInfo.merchantId` |
| `WAFFO_PRIVATE_KEY` | Signs `POST /api/v1/order/create` (PEM PKCS8 or PKCS1, SHA256withRSA) |
| `WAFFO_PUBLIC_KEY` | Verifies webhook `X-SIGNATURE` |

Optional:

| Key | Default |
|-----|---------|
| `WAFFO_API_BASE` | `https://api-sandbox.waffo.com` |
| `WAFFO_CURRENCY` | `USD` |

Set `WAFFO_API_BASE=https://api.waffo.com` for live charges. The merchant account must accept `WAFFO_CURRENCY`.

`POST /api/payments/checkout` with `{ "pack": "starter" | "mid" | "large" }` creates a pending `payment_orders` row and returns the provider redirect. It does not add credits.

`POST /api/payments/waffo/webhook` reads the raw body, checks `X-SIGNATURE`, and adds credits only for `PAYMENT_NOTIFICATION` + `orderStatus: PAY_SUCCESS` when `orderAmount` and `orderCurrency` match the stored order. The ledger id is `topup_{orderId}`, so a repeat notice does not credit twice. Reply `{"message":"success"}`. A bad signature replies `{"message":"failed"}` and does not credit. A browser return to `/account/credits/?checkout=return` is not a payment.

If any required key is missing, Buy responds `checkout_unavailable` and writes nothing.

A provider refund of a pack does not remove credits. The signed-in credits page can store a short note (`POST /api/account/support`) for a missing top-up or a missing job refund.

`FAL_KEY` / `FAL_MODEL` stay unused. The default generator remains Bailian `wan2.2-animate-move`.
