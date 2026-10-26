# Stripe orders staging candidate

This is an **unpublished, TEST-only candidate**, not a replacement for the deployed shop Worker. It refuses Live keys and the production Firebase project `kandorty-9378a`. No existing Worker, payment mode, storefront or Ziina file is changed.

## Implemented

- Creates an immutable server snapshot of validated customer, image variant, quantities, Firestore prices and AED 25 delivery before creating Stripe Checkout.
- Caller supplies a cryptographically random 32-byte `checkoutToken` encoded as 64 lowercase hex characters. Its SHA-256 is the internal checkout key; keep the token private. Reuse it for network retries, not for changed orders. Do not log it or place it in URLs.
- Retries use a stable Stripe idempotency key and frozen request parameters. A token expires after one hour; expired sessions must use a new token. Old Stripe Sessions expire too.
- Webhook validates the raw-body HMAC signature and five-minute timestamp window, without requiring browser Origin. It handles completed and asynchronous-success events. It retrieves the Session from Stripe instead of trusting event payment fields.
- Requires `mode=payment`, `livemode=false`, complete/paid status, exact snapshot amount, AED currency, matching order metadata and immutable Session binding.
- Atomically creates one `stripe_test_orders` record and marks its `stripe_test_checkout_sessions` snapshot fulfilled, using Firestore commit preconditions and bounded conflict retries. Failed persistence returns a retriable server error; it does not acknowledge success.
- Browser verification requires the private checkout token and shares the same idempotent fulfillment routine. The webhook works when the browser never returns.
- Fixed API destinations, no redirects with credentials, bounded request bodies, no raw error/credential logging. OAuth uses the service account only in memory.

## Endpoint contract

`POST /create-checkout-session` from the configured test origin:

```json
{"checkoutToken":"<64 random lowercase hex characters>","customer":{"name":"TEST ONLY","phone":"+971500000000","city":"Dubai","location":"TEST ADDRESS"},"items":[{"id":"test-product","qty":1,"imageIndex":0}],"note":""}
```

Returns `{id, url, orderId, test:true}`. A changed cart/customer must use a new token.

`POST /verify-checkout-session`: `{session_id, checkoutToken}`. Returns `registered:true` only after server persistence. It never requires a browser-provided price or paid flag.

`POST /webhook`: raw Stripe event body and `Stripe-Signature`. Configure the endpoint on the SAME Stripe Sandbox as the test API key. Signature secrets are endpoint-specific.

## Configuration required before real integration testing

Use a separate Firebase test project with synthetic product fixtures. Deploy `firestore.rules` ONLY there (denies all client access; server uses IAM). Use a least-privilege service account for that project. The Worker will refuse production project credentials.

Worker secrets:
- `STRIPE_SECRET_KEY`: Stripe Sandbox key beginning `sk_test_`.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this isolated Worker's Stripe Sandbox endpoint.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: isolated test-project service account JSON.

Worker vars:
- `STRIPE_MODE=test` (required and hard guarded).
- `STRIPE_TEST_PROJECT_ID`: isolated test project identifier.
- `STRIPE_TEST_SITE_URL`: optional exact HTTPS origin for a separate test checkout page. If omitted, the Worker uses **only** its own `https://kandorty-stripe-orders-test.<account>.workers.dev` origin, where `<account>` is its actual deployed Cloudflare account subdomain. Production storefront origins and unrelated domains are rejected.

The non-deploying CI reports presence only of optional repository secrets `STRIPE_SANDBOX_SECRET_KEY`, `STRIPE_SANDBOX_WEBHOOK_SECRET`, `STRIPE_TEST_SERVICE_ACCOUNT_JSON`. Do not paste secrets into code, logs, pull requests or chat. Presence is not proof of validity.

## Validation

Run `node --test stripe-staging/*.test.mjs` with Node 22. 34 local tests cover missing browser return, replay/concurrency, failed database persistence/retry, wrong receipt, price tampering, quantity/stock/variant checks, paid/mode/amount/currency binding, webhook tamper/age checks, stable Stripe parameters, production rejection and Firestore adapter atomic commits.

All Stripe/OAuth/Firestore calls in these tests are mocked. They do NOT replace real Sandbox E2E tests.

## Remaining before production

This candidate intentionally makes no stock writes or reservations, and writes no production `orders`, `tracking`, `order_edits` or `order_access`. It must not be enabled on the live storefront. Complete isolated real Sandbox checkout/webhook/Firestore tests first. Then review production Firestore rules, design and test atomic stock reservation/release and production order/tracking/account compatibility, and migrate the storefront card flow away from client order writes. COD and Ziina must stay compatible. Account UID is not accepted from the test client; production authenticated ownership needs verified Firebase ID tokens. Add abuse/rate limiting and operational reconciliation before release.

Live remains blocked until those integration, authorization and inventory gates pass. Merely changing a key or mode variable cannot enable Live in this candidate.

## October 27 continuation: isolated self-hosted Sandbox test page and deployment guard

- Added `GET /test` (also `GET /`) plus `GET /test.js` on the isolated Workers.dev test origin. The page uses synthetic customer details, `test-product`, AED 10 + AED 25 delivery, random browser checkout token, Checkout redirect, server-side receipt verification, and no real payments. It must never be bound to `kandorty.online`.
- Added `secrets.required` to `wrangler.jsonc`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `FIREBASE_SERVICE_ACCOUNT_JSON`. Wrangler should refuse deploy if any is absent on the isolated Worker. Its public vars pin `STRIPE_MODE=test` and project ID `kandorty-stripe-test-5f8af`.
- Created a separate manually triggered GitHub Actions workflow on main: `.github/workflows/deploy-stripe-orders-test.yml`. It checks out this draft branch, checks exact Worker name / test-only config, runs mocked tests, then deploys **only** the named test Worker with Cloudflare credentials in GitHub repository secrets. There is no automatic deployment and the main shop code remains unchanged.
- Before manually deploying, securely configure secrets **on the isolated Cloudflare Worker**, not in chat or GitHub code. `FIREBASE_SERVICE_ACCOUNT_JSON` must contain the entire JSON downloaded from the dedicated staging service account with `project_id: kandorty-stripe-test-5f8af`. The Stripe API key must belong to the same Stripe Sandbox and start `sk_test_`.
- On Stripe **Sandbox**, create an event destination pointing to `https://<actual staging Worker host>/webhook`. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`, then save that destination's signing secret as `STRIPE_WEBHOOK_SECRET` on the isolated Worker. Do not place a live webhook secret there.
- Once configured, manually run the GitHub Actions workflow and visit the *actual* staging Worker `/test` URL. Complete only a Stripe Sandbox test payment. Verify **exactly one** document in `stripe_test_orders` and the associated `stripe_test_checkout_sessions` snapshot, check webhook delivery 2xx, repeat webhook delivery, and test completing without browser return. No production orders or stock changes.
- The successful GitHub mocked unit tests do not prove a real Stripe/Firebase integration; do not merge this PR into production or switch Live keys before true end-to-end verification and final production security work.
