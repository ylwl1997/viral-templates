# R2 media (ops)

Customer pages do not mention this. Bucket **`viral-templates-media`**, binding **`MEDIA`**.

The bucket is private. Leave the r2.dev public URL off. The app never writes an `r2.dev` URL into D1.

## Keys

```text
uploads/{userId}/{jobId}/0.jpg|png|webp
uploads/{userId}/{jobId}/1.jpg|png|webp    # second photo (kiss-cam)
results/{userId}/{jobId}.mp4
templates/                                 # reserved, not written
```

`jobs.upload_key` / `upload_key_2` / `result_key` store those keys. `upload_url` / `upload_url_2` / `result_url` store `https://{host}/api/media/jobs/{jobId}/{photo|photo-2|result}?exp=&sig=`. `result_url` is only set when `status` is `ready`.

Default retention is **7 days for photos** and **30 days for videos**. Override with `PHOTO_RETENTION_DAYS` and `VIDEO_RETENTION_DAYS` (1–365) on the Pages function. Customer copy uses `PUBLIC_PHOTO_RETENTION_DAYS` and `PUBLIC_VIDEO_RETENTION_DAYS` at **build** time, same defaults. Keep the pairs equal.

Each object’s custom metadata includes `expires_at` and `retention_days`. A download after `expires_at` deletes that object. That is not a full sweep. Set a bucket lifecycle rule so objects expire even if nobody downloads them.

The R2 binding cannot create lifecycle rules.

## Dashboard

1. **R2 → Overview → Create bucket**. Name: `viral-templates-media`. Do not enable public access.
2. Open the bucket → **Settings** → **Object lifecycle rules** → **Add rule**.
   - Name `expire-uploads`. Prefix `uploads/`. Action: delete uploaded objects after **7** days. Save.
   - Name `expire-results`. Prefix `results/`. Action: delete uploaded objects after **30** days. Save.
3. Create the bucket before the next Pages deploy. `wrangler.toml` declares the binding; deploy does not create the bucket.
4. **Workers & Pages → viral-templates → Settings → Bindings**. After deploy, Production and Preview should list R2 variable `MEDIA` → `viral-templates-media`. If they do not, add that binding for both and redeploy.
5. Optional: **Settings → Variables and Secrets**
   - `PUBLIC_R2_CONFIGURED` = `1` (text)
   - `PUBLIC_PHOTO_RETENTION_DAYS` = `7` (text, build)
   - `PUBLIC_VIDEO_RETENTION_DAYS` = `30` (text, build)
   - `PHOTO_RETENTION_DAYS` = `7` (text, runtime)
   - `VIDEO_RETENTION_DAYS` = `30` (text, runtime)
   - `RESULT_INGEST_SECRET` = a random string of at least 16 characters (secret)

CLI, with Cloudflare credentials already configured (do not put the token in the repo):

```bash
npx wrangler r2 bucket create viral-templates-media
```

Local `npx wrangler pages dev` keeps `MEDIA` on disk under `.wrangler/`. It does not upload to the remote bucket. Put local secrets in `.dev.vars` (gitignored), for example `RESULT_INGEST_SECRET`. Do not commit that file.

## Lifecycle API

`maxAge` is seconds. This replaces the bucket’s rules, so include every rule you want to keep. Do not paste account tokens into git.

```bash
# PUT /accounts/$ACCOUNT_ID/r2/buckets/viral-templates-media/lifecycle
```

```json
{
  "rules": [
    {
      "id": "expire-uploads",
      "enabled": true,
      "conditions": { "prefix": "uploads/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 604800 } }
    },
    {
      "id": "expire-results",
      "enabled": true,
      "conditions": { "prefix": "results/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 2592000 } }
    }
  ]
}
```

`604800` is 7 days. `2592000` is 30 days. Objects usually disappear within about 24 hours after they age out.

## What this does not do

Generate still only queues a job. fal and Kling are not called. Waffo checkout is not called. `POST /api/jobs/{id}/result` stores an MP4 you send; it does not create one.
