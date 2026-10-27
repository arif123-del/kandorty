# Kandorty Stripe LIVE server-side fulfillment candidate — NOT DEPLOYABLE

**Status:** draft review only. This branch does not include a production Worker entrypoint, Wrangler config, Firebase credential, payment-mode switch, GitHub deploy workflow or change to `index.html`/`admin.html`. It must not be deployed or merged until every release gate below is met. The existing Stripe Sandbox Worker in `stripe-security-audit` remains isolated.

## Findings from production storefront read-only audit

1. `index.html` currently creates Checkout from browser items then stores a complete client-authored order in `localStorage`. After redirect to `?stripe=success`, the browser verifies payment and calls `submitCustomerOrder`; no browser return means no guaranteed creation of a Firestore `orders` document or inventory decrement.
2. `saveOrderWithStock` is a client-side Firestore transaction that reads products, decrements stock and **uses `tx.set(orderRef, order)` without an exists=false check**. Repeated submission under the same order ID can double-decrement inventory.
3. The client currently determines `order.paymentStatus='paid'` and populates `order.customerUid` without a dedicated server-side signed-Stripe webhook fulfillment path. Production Firestore security rules are **not present in this repository** and MUST be independently inspected before relying on any client-write restrictions.
4. `tracking`, `order_edits` and `order_access` are separate follow-up writes after the stock/order commit, creating partially registered orders on intermittent failures.
5. Stock restoration on customer cancellation in the existing storefront/admin uses the order item quantities and could erroneously increment stock for an already-paid order that never debited inventory. It must be migrated to use server-recorded `stockDebits` before any switch.
6. Cash-on-delivery also uses the browser stock transaction. Tightening Firestore product/order write rules to protect Stripe MUST NOT break COD. The separate Ziina flows must be regression-tested.

## Implemented in this branch (pure mock-tested functions only)

- `fulfillment.mjs` validates server-retrieved LIVE Stripe Checkout Session and immutable Firestore snapshot (mode, status, currency, amount, metadata, ID binding), then builds **a single atomic Firestore `documents:commit` plan** for order, tracking, order_edits, order_access, checkout marker and managed-stock decrements. No browser price/paid flag is trusted. Each write has create-only or document updateTime preconditions.
- The order includes `stockDebits` (exact inventory actually reduced), `inventoryStatus` and a server-generated edit token, and only includes `customerUid` if backed by verified server-issued auth. Paid but no-longer-in-stock orders are recorded as `needs_review` without any stock change; they need explicit refund/backorder operations.
- `cancellation.mjs` plans an atomic, exactly-once cancellation stock restore using *only* `stockDebits`. Do not wire it to public clients; the real production cancellation flow and authorizations must be reviewed.
- 24 mocked/unit tests cover exact charge binding, atomic preconditions, duplicate webhook replay, concurrent webhook race, inventory shortage, untracked stock, and cancellation replay. **These are not live-service integration tests**.

## Production release blockers — ALL must be closed

1. **Server-only checkout and signed webhook:** deploy a separately reviewed production Worker supporting test-to-LIVE migration, Stripe signature check on exact raw body, Stripe API re-retrieval, allowlisted domains, auth and rate limits, idempotent response and bounded retries.
2. **Server snapshot and stock handling:** create immutable priced snapshot using production Firestore data. Introduce atomic checkout reservations with cancel/expire release **or** a funded-order `needs_review` handling/alert/refund process. Reconcile abandoned Checkout Sessions and asynchronous outcomes.
3. **Authorizations:** independently audit actual production Firebase Security Rules. Only a tightly authenticated server may mark a card order `paid`, fulfill a Stripe order, or mutate stock for Stripe; users cannot forge `customerUid`, order ownership, receipts, cancel marker or refunds. Preserve authenticated/guest orders without exposing customer PII.
4. **COD + Ziina compatibility:** migrate COD stock writes to a secure backend or design Firestore rules that enforce stock constraints without trusting customer amounts/status (not trivial). Validate Ziina's own fulfillment and do not change it without review.
5. **Edit/cancel paths:** update the production customer app, mobile app, and admin UI to use `stockDebits` for restorations. Require status authorization and guard canceled/refunded/payment processing races. Prevent modifications to server-paid order amounts and customer identity.
6. **Customer UX:** server receipt uses authenticated ownership after verifying ID tokens; the guest flow must use a separate secure, bound receipt token; do not trust session_id in the URL alone. Handle payment when the customer never returns.
7. **Integration/regression tests:** run isolated, actual Stripe Sandbox Checkout + signed webhook delivery and duplicates in a production-shaped *test* Firestore database, compare stock quantities, ensure one paid order, tracking, edit records and customer access. Test delayed webhooks, stale sessions, price tampering, out-of-stock, one missing document and 5xx responses.
8. **Operational safety:** backup Firestore, review IAM and secrets, alert on paid-unfulfilled orders, reconcile Stripe vs Firestore daily, audit logs without PII/credentials, design rollbacks, set up Stripe Live webhook only after successful dry-run. No production data test writes.
9. **Go-live approval:** perform an explicit rollout review and confirm with the user before any Live key, Cloudflare route, website, Firestore rules or production database change.

## Safe commands
```bash
node --test stripe-live-candidate/*.test.mjs
```

Do not create an automatic deploy for this branch.

## Firestore rule review and Emulator results (2026-10-27)

The user supplied the **complete current production Firestore Rules text**, which confirms that unauthenticated clients can decrease arbitrary product stock and anonymous users can create client-controlled `card` orders, including a forged `paymentStatus: 'paid'`. See `firestore-production-rules-audit.md`.

A **future-state-only** comprehensive draft exists at `firestore.rules`, and `firestore.rules.test.mjs` tests it with the real Firestore Emulator using the fake project `demo-kandorty-stripe-rules-only`.

- GitHub Actions run [40522126580](https://github.com/arif123-del/kandorty/actions/runs/40522126580): **23 passing Firestore Emulator tests, 0 failures**. No Firebase production project, Cloudflare credentials, secrets or LIVE Stripe keys were accessed.
- This draft allows public catalog reads, denies all untrusted stock mutations, denies client card/COD order writes and privileged payment state changes, permits self-service verified-phone customer profiles, restricts order reads to admin/verified owners, and protects tracking/edit/access bearer documents.
- **Compatibility warning:** this ruleset deliberately denies existing guest/COD order writes and guest tracking/edit access; it must NOT be published until server-side COD, Stripe, Ziina, app/site guest receipt access, and admin claim migration are implemented. Current administrator authentication is email-based; the new draft uses `request.auth.token.admin == true`, which requires an intentional Firebase custom claim provisioning and safe rollback.
- This is an **isolated Emulator rules test**, not an end-to-end checkout/production authorization test. It does NOT authorize production rollout.
- Run locally with Java 21 and Node 22, then `cd stripe-live-candidate`, `npm install --no-save firebase@13 @firebase/rules-unit-testing@6 firebase-tools@14`, and `./node_modules/.bin/firebase emulators:exec --project demo-kandorty-stripe-rules-only --only firestore 'node --test firestore.rules.test.mjs'`.

**Next engineering gate:** Implement a secure COD server route and guest receipt/tracking endpoint (with per-order signed/bound receipt tokens and rate limiting), then test Stripe Sandbox, Ziina, Android and the storefront together against these rules in a separate production-shaped Firebase test project. Only after that should anyone consider publishing rules and moving Stripe to LIVE.
