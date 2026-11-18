# Stripe release preparation — isolated TEST deployment, Live disabled

This is a reviewable Stripe-only hosted Checkout implementation. As of 2026-10-29, the current branch also includes aggregate-only refund-queue alerts and 27 successful local Firestore Rules emulator security tests; these are NOT published to production. No Live key, production write, deployment or storefront change is performed by its readiness workflow. Ziina is out of scope: no new Ziina work or credential request is required for this task. Existing historical integration files remain unchanged.

## Included

- Server-priced AED Checkout with 25 AED delivery; immutable request snapshots and Stripe idempotency keys.
- Strict test/live project, credential, session, amount and metadata binding. Every settlement retrieves Stripe independently.
- Raw-body signed webhook verification with a five-minute timestamp window and support for signature rotation.
- Atomic order, stock, tracking, access, checkout marker and unique payment claim writes. Repeated delivery cannot debit stock twice.
- Paid inventory shortages enter a durable review queue without a stock debit. Payment is preserved for operator resolution.
- Scheduled reconciliation of pending sessions, including uncertain creation records, independent of the customer's return.
- Signed, expiring guest receipts; status excludes customer contact/address and edit authority.
- Live Turnstile verification, explicit origin allowlist and required rate limiter.
- Staged browser adapter that sends item IDs/quantities, persists the checkout token and signed receipt, and never writes payment or inventory to Firestore.

## Validation and evidence boundaries

`node --test stripe-release/*.test.mjs stripe-live-candidate/{fulfillment,cancellation,atomic-commit,cod,cod-race}.test.mjs`

82 code tests pass in the latest successful readiness workflow, covering the release runtime and browser adapter with mocked provider/database services plus the existing atomic order tests. GitHub readiness also performs a Wrangler **dry-run bundle only**. The separate Sandbox deployment workflow exercises the new hosted Checkout/webhook flow; its completed run and results are recorded in PR #2. The previous successful real AED 35 Sandbox PaymentIntent run is https://github.com/arif123-del/kandorty/actions/runs/40587061966 and used the earlier isolated Worker.

## API and browser integration

- `POST /create-checkout-session`: normalized COD-style customer/items/note/checkoutToken schema, plus `turnstileToken` in Live. Returns orderId, Checkout URL, complete and signed receipt.
- `POST /checkout/status`: empty JSON body, `Authorization: Bearer <receipt>`; server re-verifies payment. No session ID from the success URL is trusted.
- `POST /webhook`: exact raw Stripe body with Stripe-Signature. Subscribe to checkout.session.completed and checkout.session.async_payment_succeeded.
- Test browser requests additionally require X-Staging-Key. Never publish that private staging key in a public storefront.

`public/index.html` connects the adapter to the isolated test Worker. `build-storefront-candidate.mjs` produces an unpublished copy of the actual storefront with secure Stripe creation, return and receipt tracking; it leaves the real `index.html` byte-for-byte unchanged. The review artifact is uploaded by CI. The generated copy now also routes new COD checkout, managed-order cancellation and admin status transitions through verified server endpoints. Before release, configure its Turnstile site key (action checkout), provision the administrator custom claim and server membership, and review legacy orders separately. Display pending/paid/needs_review accurately. Never call the existing client `submitCustomerOrder` stock-writing path for a Stripe payment. Archive the receipt only after server confirmation. Test cancellation, retry, reload, a lost browser return and a separately delivered webhook.

Live return URLs point to kandorty.online, but the live storefront is untouched and does not yet implement this adapter. Test return URLs use the isolated frontend served by the test Worker. The private staging key is entered locally by the test runner and is not embedded in assets.

See `OPERATIONS.md` for the aggregate-only private monitoring report covering pending checkouts, shortages and unresolved cancellation-refund queues, shortage/refund procedure and tested emergency checkout stop.

## Required before any Live activation

1. Require a successful `stripe-release-sandbox.yml` run for the final commit. It deploys only kandorty-stripe-release-test, uses only the isolated Firebase project and Sandbox key, attaches its own signed webhook, and runs a public Stripe TEST-card Checkout and refund. No existing Worker is deployed. Test-only receipt/gate/webhook secrets rotate per deployment, invalidating older test receipts.
2. Review the generated storefront/admin artifacts against real admin authentication and all supported clients. New COD, Stripe, cancellation and admin state transitions are implemented server-side. Historical orders without a verified lifecycle ledger fail closed and need a separate, audited migration decision. Production client/rules publication remains prohibited until this acceptance check passes.
3. Assign an operational owner and configure alert delivery for review/refund queues, failed webhook deliveries and scheduled failures. Refund Webhooks re-retrieve provider outcomes and update order refundStatus/refundedAmount; reconciliation also recovers unresolved cancellation refunds. These endpoints never initiate refunds. Each queue query is bounded to 50; validate backlog alerting before rollout.
4. Privately configure separate Live STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_RECEIPT_SECRET (64 hex), FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID and TURNSTILE_SECRET_KEY. Verify service account field naming against `firestore.mjs`; grant only necessary database access. Never put credentials into this repository or browser.
5. Review/approve the complete production frontend + rules + backend release together, then explicitly enable the release gate and deployment routing. The shipped example deliberately has STRIPE_MODE=disabled, LIVE_RELEASE_APPROVAL=NOT_APPROVED, workers_dev=false and no routes or cron.
6. Run an approved small real payment and refund after activation, verify order/stock/webhook/guest access, and monitor before expanding traffic.

Rollback must stop new Checkout creation while preserving signed webhook handling and reconciliation for already-created sessions. Do not restore insecure client-write rules or discard paid review records. No step above authorizes Live activation in this preparation task.
