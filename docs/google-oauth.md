# Google sign-in

Overseas accounts use Google only. There is no GitHub, Apple, Microsoft, or email/password sign-in. The first successful Google sign-in creates the D1 user with a credit balance of 0. It does not add or spend credits. Only an allowlisted address gets that far. Any other Google account is rejected before `ensureUser` and before `vt_session`.

The same Google account maps to the same `user_id` on every host (`stableUserId('google', sub)`). Credits, the ledger, and jobs are that row in the shared D1 database. Each host still has its own `vt_session` cookie. Signing in on the apex does not by itself sign the person in on a brand hostname. The account pages stay on the host they started on (`/account/…` or `/t/{slug}/account/…`).

Preview email sign-in (`POST /api/auth/preview`) does not prove the address in the JSON body. It is off on every public host, including `viral-templates.pages.dev` and branch `*.pages.dev` URLs. `AUTH_PREVIEW_LOGIN=1` does not turn it back on there. On `localhost` it still runs when Google is not configured, or when `AUTH_PREVIEW_LOGIN=1`, and the posted email must be on the same allowlist. `AUTH_PREVIEW_LOGIN=0` turns it off everywhere.

## Routes

| Route | Role |
| --- | --- |
| `GET /api/auth/google/start?next=&from=&popup=` | Sends the browser to Google. `next` is where to land after sign-in. `from` is the sign-in page to return to if it fails. Both are relative paths only. `popup=1` stores a flag in the state cookie. |
| `GET /api/auth/google/callback` | Google redirects here. Exchanges the code, reads the profile, and, if that verified email is allowlisted, creates the user and sets `vt_session`. Otherwise it redirects (or the popup posts) `error=email_not_allowed` and sets no session cookie. |

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

Branch preview hostnames (`<deployment>.viral-templates.pages.dev`) change every deploy. Leave Google secrets off the Preview environment unless that exact hostname is listed above. The email preview form is off on those hosts too.

## Cloudflare secrets

Set these on **Production** for the `viral-templates` Pages project. Do not commit the values. Do not put them in `wrangler.toml`.

| Name | Notes |
| --- | --- |
| `AUTH_SECRET` | 16+ random characters. Signs `vt_session` and the short-lived OAuth state cookie. Required for Google. The public localhost / `*.pages.dev` fallback is not used for Google sign-in. |
| `GOOGLE_CLIENT_ID` | Web client id from Google. |
| `GOOGLE_CLIENT_SECRET` | Web client secret from Google. |
| `AUTH_ALLOWED_EMAILS` | Comma-separated allowlist. Production value: `1316805445@qq.com`. Plaintext is fine. See below. |

Dashboard: **Workers & Pages → viral-templates → Settings → Variables and Secrets → Add**. Type **Secret** (not plain text) for `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Environment **Production**. Add each name. `AUTH_ALLOWED_EMAILS` is the plaintext allowlist in the next section.

CLI (the command prompts for the value; do not put the secret in the command line). Choose Production when asked:

```bash
npx wrangler pages secret put AUTH_SECRET --project-name viral-templates
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name viral-templates
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name viral-templates
```

Redeploy or wait for the next deployment so the Functions see the new secrets.

If Google credentials are set but `AUTH_SECRET` is missing, the sign-in page does not offer Google or preview login on that host.

## Who can sign in

`AUTH_ALLOWED_EMAILS` is a comma-separated list. Each entry is trimmed and compared case-insensitively. When the variable is set and not empty, only those addresses may create a session.

When it is unset or empty, sign-in stays closed. The function allows only `1316805445@qq.com`. That fallback is there so a public `*.pages.dev` deploy does not lock the owner out before the variable exists. It is not open registration. Set the variable in production to the same address so the list is explicit in Cloudflare. There is no value that means "anyone with a Google account."

Google must report the address as verified (`email_verified`). An unverified profile is not that address, so it is rejected with the same error.

A rejected sign-in uses `email_not_allowed`. The sign-in page and the popup show "This account is not allowed to sign in." / "这个账号不在允许登录的名单里。" The callback does not call `ensureUser` and does not set `vt_session`.

### Set it on Cloudflare Pages

Dashboard: **Workers & Pages → viral-templates → Settings → Variables and Secrets → Add**.

| Name | Value | Type | Environment |
| --- | --- | --- | --- |
| `AUTH_ALLOWED_EMAILS` | `1316805445@qq.com` | Plaintext | Production |

Add the same variable on Preview if that environment has Google credentials. Do not put the value in `wrangler.toml`.

To allow another person later, use a comma: `1316805445@qq.com, other@example.com`.

CLI (the command prompts for the value):

```bash
npx wrangler pages secret put AUTH_ALLOWED_EMAILS --project-name viral-templates
```

Plaintext in the dashboard is enough. The address is an allowlist, not a credential. Redeploy so Functions see it.

Publishing the Google app (Audience: External) does not open this site. The allowlist still rejects every other account.

## Google Cloud setup

1. Create or select a Cloud project.
2. Google Auth Platform → Branding. App name **Viral Templates**. Add a support email. Leave the scopes at `openid`, `email`, and `profile`. Do not add extra sensitive scopes.
3. Audience: External. While the app is in Testing, only Google accounts you list as test users can sign in. Publish the app so Google will offer the consent screen to the allowlisted account. These three scopes do not need a sensitive-scope review. Publishing does not let other Google accounts create a session on this site.
4. Clients → Create client → **Web application**. Paste the origins and redirect URIs above.
5. Copy the client id and secret into the Pages secrets.

Authorized domains on the consent screen are domains you verify in Search Console (your own apex, when you have one). The redirect URI for `viral-templates.pages.dev` is registered on the OAuth **client**, not by verifying the `pages.dev` suffix.

## What stays out of this flow

Signing in does not call fal, Kling, or Waffo, and it does not write a credit ledger row.
