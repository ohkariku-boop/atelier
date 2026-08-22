# Automated image verification

## What it checks
1. **Reachability** — HTTP HEAD/GET, image content-type
2. **Duplicates** — same `image_url` on more than one artwork
3. **Medium match** (optional) — OpenAI Vision `gpt-4o-mini` when `OPENAI_API_KEY` is set

## Run
- Admin → **Images** → Run image verification
- Or: `POST /functions/v1/verify-artwork-images` with admin JWT
  `{ "use_vision": true, "limit": 100 }`

## Secrets
```
supabase secrets set OPENAI_API_KEY=sk-...   # optional vision
```

## Columns on `artworks`
- `image_status`: unchecked | ok | broken | duplicate | mismatch | error
- `image_verified_at`, `image_verify_notes`, `image_content_type`

## Listing form
Client-side `Image()` probe before save rejects URLs that do not load.
