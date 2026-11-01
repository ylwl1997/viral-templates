# Google sign-in

Overseas accounts use Google only. There is no GitHub, Apple, Microsoft, or email/password sign-in. The first successful Google sign-in creates the D1 user with a credit balance of 0. It does not add or spend credits.

The same Google account maps to the same `user_id` on every host (`stableUserId('google', sub)`). Credits, the ledger, and jobs are that row in the shared D1 database. Each host still has its own `vt_session` cookie. Signing in on the apex does not by itself sign the person in on a brand hostname. The account pages stay on the host they started on (`/account/…` or `/t/{slug}/account/…`).

Preview email sign-in (`POST /api/auth/preview`) stays available on `localhost` and `*.pages.dev` when Google is not configured. Set `AUTH_PREVIEW_LOGIN=1` to force it on, or `AUTH_PREVIEW_LOGIN=0` to force it off.

## Routes

| Route | Role |
| --- | --- |
| `GET /api/auth/google/start?next=&from=&popup=` | Sends the browser to Google. `next` is where to land after sign-in. `from` is the sign-in page to return to if it fails. Both are relative paths only. `popup=1` stores a flag in the state cookie. |
| `GET /api/auth/google/callback` | Google redirects here. Exchanges the code, reads the profile, creates the user, sets `vt_session`. |

The session cookie is the same shape as preview login, with `providers: ['google']`. The profile stores email (only if Google says it is verified), name, and picture. Google access tokens are not stored.

## Popup

Header and account **Sign in** open a dialog on the current page. **Continue with Google** calls `window.open` on `/api/auth/google/start?popup=1`. The authorize `redirect_uri` is still exactly `https://<host>/api/auth/google/callback`. Do not register a second URI.

When the state cookie says `popup`, the callback returns a small HTML page instead of redirecting to `next`. That page `postMessage`s `window.opener` (target origin is the page itself) and a same-origin `BroadcastChannel` named `vt-auth`, then closes. The opener refetches `GET /api/auth/session` and updates the header and account shell. If the browser blocks the popup, the button continues in the same tab without `popup=1`, and the callback redirects as before.

## Redirect URI

The callback is always the host the person is currently on:

```text
https://<host>/api/auth/google/callback
```

Local wrangler only:

```text
http://localhost:8788/api/auth/google/callback
http://127.0.0.1:8788/api/auth/google/callback
```

Rules Google enforces:

- Exact string. No wildcard, no trailing slash, no path other than `/api/auth/google/callback`.
- `https` except for localhost.
- `/t/{slug}/…` on the apex is the same host, so it uses the apex URI. It does not get its own redirect URI.
- A brand on its own hostname needs that hostname registered before Google sign-in works there.

`npm run pages:dev` serves Pages Functions on port **8788**. `npm run dev` (Astro alone) does not.

## Register this project

In Google Cloud Console → Google Auth Platform → Clients → Web application, add:

Authorized JavaScript origins:

```text
https://viral-templates.pages.dev
```

Authorized redirect URIs:

```text
https://viral-templates.pages.dev/api/auth/google/callback
```

For local debugging, also add:

```text
http://localhost:8788
http://127.0.0.1:8788
http://localhost:8788/api/auth/google/callback
http://127.0.0.1:8788/api/auth/google/callback
```

Console changes can take a few minutes.

### Brand hosts later

When a brand is served on its own hostname, add that origin and this redirect URI:

```text
https://<brand-host>
https://<brand-host>/api/auth/google/callback
```

Examples after DNS exists (replace `example.com` with the real apex):

```text
https://example.com
https://www.example.com
https://bby-wow.example.com
https://example.com/api/auth/google/callback
https://www.example.com/api/auth/google/callback
https://bby-wow.example.com/api/auth/google/callback
```

Do not register `https://*.example.com/api/auth/google/callback`. Google rejects wildcards.

Branch preview hostnames (`<deployment>.viral-templates.pages.dev`) change every deploy. Leave Google secrets off the Preview environment unless that exact hostname is listed above. Preview can keep using the email form.

## Cloudflare secrets

Set these on **Production** for the `viral-templates` Pages project. Do not commit the values. Do not put them in `wrangler.toml`.

| Name | Notes |
| --- | --- |
| `AUTH_SECRET` | 16+ random characters. Signs `vt_session` and the short-lived OAuth state cookie. Required for Google. The public localhost / `*.pages.dev` fallback is not used for Google sign-in. |
| `GOOGLE_CLIENT_ID` | Web client id from Google. |
| `GOOGLE_CLIENT_SECRET` | Web client secret from Google. |

Dashboard: **Workers & Pages → viral-templates → Settings → Variables and Secrets → Add**. Type **Secret** (not plain text). Environment **Production**. Add each name.

CLI (the command prompts for the value; do not put the secret in the command line). Choose Production when asked:

```bash
npx wrangler pages secret put AUTH_SECRET --project-name viral-templates
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name viral-templates
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name viral-templates
```

Redeploy or wait for the next deployment so the Functions see the new secrets.

If Google credentials are set but `AUTH_SECRET` is missing, the sign-in page does not offer Google or preview login on that host.

## Google Cloud setup

1. Create or select a Cloud project.
2. Google Auth Platform → Branding. App name **Viral Templates**. Add a support email. Leave the scopes at `openid`, `email`, and `profile`. Do not add extra sensitive scopes.
3. Audience: External. While the app is in Testing, only Google accounts you list as test users can sign in. Publish the app when any Google account should be able to sign in. These three scopes do not need a sensitive-scope review.
4. Clients → Create client → **Web application**. Paste the origins and redirect URIs above.
5. Copy the client id and secret into the Pages secrets.

Authorized domains on the consent screen are domains you verify in Search Console (your own apex, when you have one). The redirect URI for `viral-templates.pages.dev` is registered on the OAuth **client**, not by verifying the `pages.dev` suffix.

## What stays out of this flow

Signing in does not call fal, Kling, or Waffo, and it does not write a credit ledger row.
