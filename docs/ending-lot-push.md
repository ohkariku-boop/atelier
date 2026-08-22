# Ending-lot notifications

## What runs
GitHub Action **Close Expired Auctions** (every 5 min) also POSTs:
`/functions/v1/notify-ending-lots`

## Who gets notified
Users who placed a **bid** on a live/flash lot ending in:
- **~1 hour** (45–75 min window)
- **~15 minutes** (10–20 min window)

Deduped per user/auction/window via `auction_ending_alerts`.

## Channels
1. **In-app** `notifications` (always)
2. **Web Push** if secrets set:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - Frontend `VITE_VAPID_PUBLIC_KEY` (same public key) for Enable push

Generate keys: `npx web-push generate-vapid-keys`

## SQL
Run `docs/APPLY_ending_lot_alerts.sql` once.
