# House mode (white-label scaffold)

Multi-tenant branding for partner auctioneers (Sotheby's-style institutional pitch).

## Planned model
- `houses` table: id, slug, name, logo_url, primary_color, custom_domain, fee_bps
- `artworks.house_id` / `auctions.house_id` optional FK
- Subdomain or path: `house/{slug}` gallery filtered to that house
- Connect payouts still platform-routed with house fee split

## Current status
Scaffold only — single Atelier brand ships today. Schema next migration when first partner is signed.
