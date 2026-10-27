# Private COD TEST Worker

User-authorized isolated deployment from PR #2. This is separate from the non-deployable LIVE candidate. Never merge/deploy the storefront or publish Firebase rules as part of this workflow.

- Worker: `kandorty-cod-orders-test`, workers.dev only, no custom routes.
- Firebase: hard-pinned to `kandorty-stripe-test-5f8af`; production service accounts rejected. Uses production-shaped collections only inside this isolated project.
- `POST /cod/orders`: candidate COD schema, catalog pricing plus 25 AED, atomic commit and full fresh-read retries. Only an explicit internal `testOnly: true` permits candidate plans for this test project; default production candidate still rejects it.
- `GET /guest/orders/KD-########`: Authorization Bearer receipt, signed HMAC, order/checkout/purpose bound, 24-hour expiration; no customer phone/address, edit token or payment credentials returned. This is read-only tracking, not edit/cancel access.
- Every route additionally requires a private `X-Staging-Key`; no public storefront integration yet. No CORS permission for production. Secret generation and installation occur inside GitHub Actions and values are masked. Deployment rotates staging keys and invalidates old receipts; this is intentional for disposable test sessions, not a production key lifecycle.
- IP and normalized-phone limiters are unique to this Worker, fail closed if unavailable. Cloudflare limiters are per-location approximate abuse controls, not global strict quotas. Private staging gate is the access boundary; production anti-bot and global quota strategy remain blockers.
- Workflow uses existing repository Cloudflare authorization and `STRIPE_TEST_SERVICE_ACCOUNT_JSON`; no Stripe or Ziina secret is needed or modified. No Firebase rules deployed. Test product IDs are unique; synthetic records retained for audit.

## Validation

`node --test cod-staging/*.test.mjs stripe-live-candidate/{fulfillment,cancellation,atomic-commit,cod,cod-race}.test.mjs`

Workflow performs real test-project COD create/retry/last-stock race, atomic companion-document verification and receipt tracking rejection tests. Stripe/Ziina checks are read-only TEST page fingerprints before/after deployment. They do **not** prove joint fulfillment or shared-inventory compatibility. Existing Stripe staging does not use the new production-shaped inventory fulfillment; Ziina staging uses separate test records. No claim of full payment interoperability, Android integration, new rules integration via untrusted Firebase clients, or production readiness is made.

## Remaining gates

Migrate and test all payment paths against a common isolated inventory/receipt model, including Stripe paid webhook and Ziina Sandbox paid webhook, replay, failed/out-of-stock payment recovery, customer cancellation and admin authorization. User explicitly prohibits changing Ziina, activating Stripe LIVE, changing kandorty.online or publishing production rules. Keep PR draft.
