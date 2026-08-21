# Stripe Identity integration plan (Atelier KYC)

**Goal:** Replace status-only KYC with real document + biometric verification, mapped to existing `profiles.kyc_*` fields and the ≥ $10,000 bid gate (`bidder_kyc_ok`).

**Stack fit:** React (Vite) + Supabase Auth + Edge Functions + existing `stripe-webhook` pattern.

---

## 1. Product rules

| Event | Behaviour |
|-------|-----------|
| User opens `#kyc` / high-value bid blocked | Start Stripe Identity VerificationSession |
| Session `verified` | `kyc_status = verified`, store session id, timestamp |
| Session `requires_input` / failed | `kyc_status = rejected` or stay `pending` with reason |
| Admin `restricted` / AML flag | Still blocks bids regardless of Stripe |
| Seller first Connect payout | Prefer Identity verified **or** Connect onboarding (can dual-track) |

**Thresholds (product):** keep `bidder_kyc_ok` at 10_000 platform currency units; later align to EUR/GBP 10k by market.

**Do not** set `verified` from the client. Only webhook / service-role Edge Function.

---

## 2. Data model

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_identity_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_identity_last_error text,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_identity_session
  ON profiles (stripe_identity_session_id)
  WHERE stripe_identity_session_id IS NOT NULL;
```

Optional audit:

```sql
CREATE TABLE IF NOT EXISTS kyc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  stripe_session_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Map Stripe → Atelier:

| Stripe VerificationSession status | `kyc_status` |
|-----------------------------------|--------------|
| `requires_input` (user abandoned) | `pending` |
| `processing` | `pending` |
| `verified` | `verified` |
| `canceled` | previous / `none` |
| redacted / failed checks | `rejected` |

---

## 3. Stripe Dashboard setup

1. Enable **Identity** in Stripe (test mode first).
2. Create a **Verification flow** (document + selfie / liveness).
3. Webhook endpoint (reuse or extend):  
   `https://<project>.supabase.co/functions/v1/stripe-webhook`  
   Subscribe at least:
   - `identity.verification_session.verified`
   - `identity.verification_session.requires_input`
   - `identity.verification_session.processing` (optional)
   - `identity.verification_session.canceled` (optional)
4. Secrets already used: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`  
   Optional: `STRIPE_IDENTITY_RETURN_URL` = `https://ohkariku-boop.github.io/atelier/#kyc?identity=return`

---

## 4. Edge Functions

### 4.1 `stripe-identity-create` (new)

**Auth:** Supabase JWT (logged-in user).

**Flow:**
1. Load `profiles` for `auth.uid()`.
2. If already `verified` and not forcing re-check → return `{ already_verified: true }`.
3. `stripe.identity.verificationSessions.create({
     type: 'document',
     metadata: { supabase_user_id: user.id },
     options: { document: { require_matching_selfie: true } },
     return_url: SITE_URL + '/#kyc?identity=return'
   })`
4. Persist `stripe_identity_session_id`, set `kyc_status = 'pending'`, `kyc_submitted_at = now()`.
5. Return `{ client_secret, session_id, url }`  
   - Prefer **Stripe.js** `stripe.verifyIdentity(client_secret)` in-app  
   - Fallback: hosted `session.url` redirect

### 4.2 Extend `stripe-webhook`

On Identity events:
1. Read `session.id`, `session.status`, `session.metadata.supabase_user_id`.
2. Resolve profile by metadata user id **or** `stripe_identity_session_id`.
3. Update profile:
   - `verified` → `kyc_status=verified`, `kyc_verified_at=now()`, `kyc_level=standard` (or `enhanced` if you request address)
   - `requires_input` with failure → `kyc_status=rejected`, store last error code in `stripe_identity_last_error`
4. Insert `kyc_events` row.
5. Optional: insert `notifications` (“Identity verified — you can bid above $10k”).
6. **Never** trust client query params alone; webhook is source of truth. Return URL may trigger a **status poll** Edge Function.

### 4.3 `stripe-identity-status` (optional)

GET/POST with JWT → retrieve session from Stripe API → sync status (webhook backup).

---

## 5. Frontend

### `#kyc` page (`KycPage.tsx`)

1. Show current `kyc_status`.
2. Button **Verify with Stripe** → `supabase.functions.invoke('stripe-identity-create')`.
3. Load Stripe.js (`loadStripe(publishableKey)`).
4. `stripe.verifyIdentity(client_secret)` modal.
5. On close / return URL: call `stripe-identity-status` or reload profile from Supabase.
6. Copy: “Document + selfie required for bids of $10,000+.”

### Bid drawer

Keep `bidder_kyc_ok` RPC. Optionally soft-prompt: if bid ≥ 10k and not verified → link to `#kyc` before RPC.

### Env

- `VITE_STRIPE_PUBLISHABLE_KEY` for Stripe.js (test `pk_test_…`).

---

## 6. Security

- VerificationSession created only with user JWT; metadata binds `supabase_user_id`.
- Profile KYC columns: **no** direct client UPDATE to `kyc_status` (RLS deny; only service role / RPC).
- Webhook signature verification (existing).
- Do not store raw ID images in Supabase; Stripe holds sensitive media; store only session id + status.
- Admin `admin_set_kyc` remains for manual override / restrictions (AML) — log to `admin_audit_log`.

---

## 7. Implementation phases

| Phase | Work | Done when |
|-------|------|-----------|
| **P0** | SQL columns + RLS lock on `kyc_status` | Migration applied |
| **P1** | `stripe-identity-create` + KycPage Stripe.js | Test user completes flow in test mode |
| **P2** | Webhook handlers for Identity events | Profile flips to `verified` without refresh hacks |
| **P3** | Status poll + notifications + bid CTA | Happy path E2E scripted |
| **P4** | Sellers: require verified before Connect payout release | Policy documented |
| **P5** | Sanctions screening (Stripe Radar / third party) | Separate from Identity |

---

## 8. Test plan (Stripe test mode)

1. User `sit.buyer02@…` → `#kyc` → complete test document flow.  
2. Webhook received → `profiles.kyc_status = verified`.  
3. `bidder_kyc_ok(15000)` → `true`.  
4. Force `requires_input` test failure → `rejected` / retry allowed.  
5. Admin sets `restricted` → `bidder_kyc_ok` → `false` even if Stripe verified.  
6. Replay webhook → idempotent (no flip-flop).

Stripe test docs: use Identity test verification codes / test numbers from current Stripe Identity testing guide.

---

## 9. Compliance note

Stripe Identity satisfies **identity document + biometric** collection. It does **not** by itself equal a full AML program (UBO, SoF, SAR, written policy, registration as obliged entity). Pair with:

- Sanctions/PEP screening  
- Threshold logic in EUR/GBP where required  
- Retention / audit policy  

---

## 10. Effort estimate

| Item | Effort |
|------|--------|
| Migration + RLS | 0.5 day |
| Create session function + UI | 1 day |
| Webhook + status sync | 1 day |
| E2E + edge cases | 0.5–1 day |
| **Total** | **~3–4 engineering days** |

---

## 11. API sketch

```ts
// stripe-identity-create response
{ session_id: string, client_secret: string, url?: string }

// webhook identity.verification_session.verified
// → profiles set kyc_status=verified, kyc_verified_at=now()
```

```ts
// Frontend
const { data } = await supabase.functions.invoke('stripe-identity-create', { body: {} });
const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
await stripe!.verifyIdentity(data.client_secret);
```
