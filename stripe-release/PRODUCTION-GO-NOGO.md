# Kandorty Stripe/COD production go/no-go checkpoint (2026-10-29)

**STATUS: NO-GO. This file authorizes no Live rollout.**
This document contains only aggregate diagnostics and public operational facts. Never commit API keys, service-account JSON, webhook signing secrets, guest receipts, admin UIDs or personal order details.

## Verified without changing the live store

- GitHub PR #2 is draft and unmerged. Separate test Worker has passed hosted Sandbox Stripe + COD fulfillment, idempotency, inventory, cancellations and test refunds. See the latest PR CI links.
- Production Firebase account `kandorty-9378a`: the existing repository secret named `FIREBASE_SERVICE_ACCOUNT_JSON` passed private-key/project validation, Google OAuth exchange and a **read-only** Firestore GET. No replacement key is required for these checks.
- Aggregate read-only Firestore inventory (2026-10-29): 98 orders, all 98 lack a corresponding trusted `order_lifecycle` document, and zero active `admin_access` memberships. Order statuses: 77 new, 2 preparing, 2 shipping, 3 delivered, 14 cancelled. Payments: 86 COD, 12 card. **Do not reconstruct trusted stock debits or paid flags from old client-controlled order fields.**
- Separate Cloudflare Worker shell `kandorty-stripe-release` was uploaded successfully with `STRIPE_MODE=disabled`, `LIVE_RELEASE_APPROVAL=NOT_APPROVED`, `workers_dev=false`, no routes or cron and **no deployed targets**. It cannot accept production traffic. Existing Workers are untouched.
- Connected Stripe Live account read-only inspection showed **zero webhook endpoints**. Live API credentials and webhook signing secrets are **not** obtained by the ChatGPT connector.
- Candidate Firestore Rules are unpublished. New draft denies all browser writes to orders, tracking, order-edit/access capabilities, even for clients with `admin:true`. It leaves catalog/admin reads and product editing intact; trusted server IAM writes bypass client Rules.

## Blocking work before the owner can approve any Live rollout

1. **Historical order policy:** review the 98 legacy orders and the current production/admin/Android client behavior. Existing orders without a trusted lifecycle ledger intentionally fail closed in the new management API. Decide and approve a non-destructive, audited migration, rather than fabricating stock-history entries.
2. **Admin ownership:** verify the intended human administrator using trusted Firebase owner access; provision a real custom claim and `admin_access/{uid}` membership, then acceptance-test a fresh token against the server endpoint. Never grant admin from an email string or unsupervised browser claims.
3. **Secure credential setup:** through authenticated owner-side Stripe and Cloudflare interfaces, install a separate Live Stripe key, dedicated Live webhook signing secret, receipt signing secret, bound Firestore service-account credential and Turnstile secret/site key. The read-only Firebase check did not validate write privileges. No credentials may be pasted into a chat, file, code or log.
4. **Client/rules coordination:** review unpublished storefront/admin build and all Android/legacy clients, ensuring no client writes paid-order flags, inventory, order tracking or cancellation directly. Do not publish production Firebase Rules in isolation; do not modify Ziina.
5. **Operations:** designate a real operator, alert destination and tested escalation path for paid inventory shortages, missed webhooks, chargebacks, refund queues and reconciliation failures. Cancellation starts a refund review queue; the current API does **not** automatically issue money refunds.
6. **Final specific approval:** only after gates 1–5, obtain explicit approval for Live activation, site/rules publication, endpoint routing and a limited real-money payment/refund acceptance test. A generic request to finish preparation is not the final authorization.

## Safe rollout sequence after approval (not performed)

- Private credential configuration and separate Live endpoint; verify webhook and disabled checkout gate.
- Real admin acceptance, dry-run legacy compatibility audit, client review and alerts.
- Coordinated site + rules + backend rollout; keep new checkout gated until ready.
- Explicitly approved tiny Live test payment and refund; inspect Stripe truth, matching Firestore order, single inventory debit, signed webhook and guest tracking.
- Observe monitoring queues and failed events. If problems arise, disable new checkout only; preserve webhook/status and reconciliation for outstanding sessions.

**Production constraints:** do not merge this PR or change the main site/rules, do not alter Ziina, do not expose private credentials and do not activate Stripe Live without the owner's final specific authorization.
