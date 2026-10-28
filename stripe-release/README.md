# Stripe release preparation — disabled, not deployed

This is a reviewable Stripe-only hosted Checkout implementation. No Live key, production write, deployment or storefront change is performed by its readiness workflow. Ziina is out of scope: no new Ziina work or credential request is required for this task. Existing historical integration files remain unchanged.

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

63 local tests pass, covering the release runtime and browser adapter with mocked provider/database services plus the existing atomic order tests. GitHub readiness also performs a Wrangler **dry-run bundle only**. These are not evidence of a deployed new hosted Checkout/webhook flow. The previous successful real AED 35 Sandbox PaymentIntent run is https://github.com/arif123-del/kandorty/actions/runs/40587061966 and used the earlier isolated Worker.

## API and browser integration

- `POST /create-checkout-session`: normalized COD-style customer/items/note/checkoutToken schema, plus `turnstileToken` in Live. Returns orderId, Checkout URL, complete and signed receipt.
- `POST /checkout/status`: empty JSON body, `Authorization: Bearer <receipt>`; server re-verifies payment. No session ID from the success URL is trusted.
- `POST /webhook`: exact raw Stripe body with Stripe-Signature. Subscribe to checkout.session.completed and checkout.session.async_payment_succeeded.
- Test browser requests additionally require X-Staging-Key. Never publish that private staging key in a public storefront.

`browser-client.mjs` is a staged adapter, not connected to `index.html`. Before release, import it into an isolated storefront copy, render Turnstile with action checkout, persist the receipt before redirect, and on return call status. Display pending/paid/needs_review accurately. Never call the existing client `submitCustomerOrder` stock-writing path for a Stripe payment. Archive the receipt only after server confirmation. Test cancellation, retry, reload, a lost browser return and a separately delivered webhook.

Live return URLs point to kandorty.online, but the live storefront is untouched and does not yet implement this adapter. Test return URLs require an isolated frontend to be hosted on the test Worker origin before end-to-end testing; this API-only Worker does not serve that page.

## Required before any Live activation

1. Deploy this new runtime to a separate test Worker with test Firebase credentials and Sandbox keys, attach its own signed webhook and isolated frontend, and run real hosted Checkout through return + webhook + replay + stock contention + reconciliation. Keep existing workers unchanged.
2. Migrate the storefront's direct order/stock writes, guest tracking, COD and admin/cancellation flows to compatible secure server endpoints. Validate all relevant clients against the proposed rules in the emulator. Existing production rules/client paths are a release blocker; deploying only this Stripe endpoint does not close them.
3. Establish an operator process and monitoring for `stripe_review_queue`, failed webhook deliveries, reconciliation failures, refunds and stock corrections. The queue records a problem; it does not issue automatic refunds. Schedule reconciliation and test outage recovery. The current query handles up to 50 pending records per run; validate throughput/backlog alerting before rollout.
4. Privately configure separate Live STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_RECEIPT_SECRET (64 hex), FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID and TURNSTILE_SECRET_KEY. Verify service account field naming against `firestore.mjs`; grant only necessary database access. Never put credentials into this repository or browser.
5. Review/approve the complete production frontend + rules + backend release together, then explicitly enable the release gate and deployment routing. The shipped example deliberately has STRIPE_MODE=disabled, LIVE_RELEASE_APPROVAL=NOT_APPROVED, workers_dev=false and no routes or cron.
6. Run an approved small real payment and refund after activation, verify order/stock/webhook/guest access, and monitor before expanding traffic.

Rollback must stop new Checkout creation while preserving signed webhook handling and reconciliation for already-created sessions. Do not restore insecure client-write rules or discard paid review records. No step above authorizes Live activation in this preparation task.
