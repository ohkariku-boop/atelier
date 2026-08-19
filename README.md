# Atelier

Premium live auction marketplace for **studio-verified, 100% human-made physical art**.

**Live:** https://ohkariku-boop.github.io/atelier/

## Stack

- React 18 + Vite + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage, Realtime, Edge Functions)

## App areas

| Route | Description |
|-------|-------------|
| `#` / Gallery | Browse live auctions, filters, collections, search |
| `#auction/:id` | Auction detail, bidding, COA, message artist |
| `#artist/:id` | Artist profile + follow |
| `#studio` | Seller dashboard + analytics |
| `#orders` | Buyer orders / disputes |
| `#messages` | Buyer–artist messaging |
| `#admin` | Catalog, review, collections, disputes |
| `#trust` | Trust & Safety + live stats |
| `#collection/:slug` | Curated collection |

## Local dev

```bash
cd project
cp .env.example .env   # if present; set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Ops

See [docs/ops-deploy.md](docs/ops-deploy.md) for Edge Functions, Resend email, push VAPID, and GitHub Pages secrets.

## Deferred

- Stripe Connect checkout + real escrow release
