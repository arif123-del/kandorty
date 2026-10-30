# Kandorty Stripe/COD production go/no-go checkpoint (updated 2026-10-30)

**STATUS: NO-GO. This file authorizes no Live rollout.**
This document contains only aggregate diagnostics and public operational facts. Never commit API keys, service-account JSON, webhook signing secrets, guest receipts, admin UIDs or personal order details.

## Verified without changing the live store

- GitHub PR #2 is draft and unmerged. Separate test Worker has passed hosted Sandbox Stripe + COD fulfillment, idempotency, inventory, cancellations and test refunds. See the latest PR CI links.
- Production Firebase account `kandorty-9378a`: the existing repository secret named `FIREBASE_SERVICE_ACCOUNT_JSON` passed private-key/project validation, Google OAuth exchange and a **read-only** Firestore GET. No replacement key is required for these checks.
- Aggregate read-only Firestore inventory (2026-10-29): 98 orders, all 98 lack a corresponding trusted `order_lifecycle` document, and zero active `admin_access` memberships. Order statuses: 77 new, 2 preparing, 2 shipping, 3 delivered, 14 cancelled. Payments: 86 COD, 12 card. **Do not reconstruct trusted stock debits or paid flags from old client-controlled order fields.**
- Separate Cloudflare Worker shell `kandorty-stripe-release` was uploaded successfully with `STRIPE_MODE=disabled`, `LIVE_RELEASE_APPROVAL=NOT_APPROVED`, `workers_dev=false`, no routes or cron and **no deployed targets**. It cannot accept production traffic. Existing Workers are untouched.
- **2026-10-30 Stripe Live read-only recheck:** one webhook endpoint exists at `https://kandorty-stripe-release.aliyajan200011.workers.dev/webhook` but its provider status is **`disabled`**. The configured event list covers checkout completion, async payment success and refund events. The detached Worker remains disabled/no public route; do not enable the webhook or claim provider delivery until release readiness and explicit owner approval. The connected Stripe tool does **not** expose the private webhook signing secret.
- **Credential-prep distinctions:** GitHub Actions previously reported encrypted installation of the production Firebase service-account credential and a separate cryptographic receipt-signing secret into the *disabled, detached* release Worker. The owner reported manually saving a restricted Live Stripe key, but its current Worker secret value and permissions have **not** been independently verified. The public Turnstile site key is configured in the unpublished storefront review builder. Encrypted `TURNSTILE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` presence/validity still require owner-side verification; no secret may be exposed in repository source or chat.
- Candidate Firestore Rules are unpublished. New draft denies all browser writes to orders, tracking, order-edit/access capabilities, even for clients with `admin:true`. It leaves catalog/admin reads and product editing intact; trusted server IAM writes bypass client Rules.

## Blocking work before the owner can approve any Live rollout

1. **Historical order policy:** review the 98 legacy orders and the current production/admin/Android client behavior. Existing orders without a trusted lifecycle ledger intentionally fail closed in the new management API. Decide and approve a non-destructive, audited migration, rather than fabricating stock-history entries.
2. **Admin ownership:** verify the intended human administrator using trusted Firebase owner access; provision a real custom claim and `admin_access/{uid}` membership, then acceptance-test a fresh token against the server endpoint. Never grant admin from an email string or unsupervised browser claims.
3. **Secure credential verification:** in authenticated owner-side Cloudflare and Stripe interfaces, verify the Live restricted key scope, dedicated *disabled* webhook configuration, webhook signing-secret binding, receipt-signing secret, production Firebase project binding and Turnstile secret. The published site has **not** been switched to the public Turnstile site key; it exists only in an unpublished review build. Prior read-only Firebase checks did not validate write privileges. Do not turn on the webhook, Worker routes or Live checkout as a substitute for this gate. No credentials may be pasted into chat, source files or logs.
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
