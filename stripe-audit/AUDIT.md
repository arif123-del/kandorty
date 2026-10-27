# Stripe Worker audit — 2026-10-26

**Release decision: BLOCKED. No deployment or payment-mode change performed.**

## Evidence

The deployed `kandorty-stripe` source was retrieved through the existing GitHub Actions Cloudflare credentials, using GET only. It was encrypted on the runner with AES-256-GCM and an RSA-OAEP wrapped key before uploading a one-day artifact. No secret binding values were requested. The private decryption key stays outside the repository. The readable baseline in this folder contains the reviewed JavaScript with leading whitespace normalized; no secret literal was found.

Successful read-only runs:
- https://github.com/arif123-del/kandorty/actions/runs/40324455085
- https://github.com/arif123-del/kandorty/actions/runs/40324711161

## Confirmed findings

1. **No server-side order persistence or webhook.** The Worker only creates Checkout Sessions and returns their status. The storefront calls `submitCustomerOrder` from the browser after returning from Stripe, using a localStorage order. Closing the browser or losing local storage can leave payment without order registration.
2. **No explicit Test/Live guard.** The Worker uses whatever `STRIPE_SECRET_KEY` is bound. It does not validate key mode or the Stripe response's `livemode`. The currently bound key mode was NOT inspected. No claim is made that the current key is a Sandbox key.
3. **No Checkout creation idempotency.** Retrying the same order sends another Stripe creation request without an idempotency key. This permits multiple payable Sessions; it does not prove any real customer was charged twice.
4. **Invalid quantities are silently coerced.** A negative quantity becomes one instead of being rejected. Fractional and excessive quantities are also normalized.
5. **Variant selection is dropped.** The frontend sends imageIndex, but the Worker keeps only product id and quantity. Product-wide stock is checked, with no variant-level reservation.
6. **Verification is read-only.** It retrieves Stripe server-side, but does not bind payment to an immutable server-side order snapshot, compare the expected total there, or atomically record fulfillment. Frontend amount/order checks are not an authoritative fulfillment boundary.
7. **Database authorization remains unverified.** Current Firestore rules are unavailable in the checked-out repository. Whether a client can forge paid order fields needs a rules review; no write probe was made against customer data.

Positive controls: prices are read from Firestore rather than trusting submitted prices, the currency is AED, duplicate product quantities are aggregated for stock checking, and delivery is 2500 fils exactly once per checkout.

## Validation and limits

`node --test stripe-audit/payment-audit.test.mjs` executes six characterization tests against the deployed source with all network calls mocked. Five reproduce unsafe/missing behavior and one confirms server-side pricing/delivery. **Six passing tests mean the findings were reproduced, not that the payment system is safe.**

Three Python tests validate only report privacy and fail-closed readiness flags. The encrypted transport passed a local round-trip check. No real Stripe Sandbox transaction, webhook delivery, Firebase write, refund, stock mutation, or Live charge was executed.

## Required implementation and release gate

- Create an isolated Stripe test environment with a known test key; fail closed on missing/mismatched mode. Preserve the existing environment until full tests pass.
- Save validated customer/order/variant data, price and delivery totals on the server before redirecting. Bind the Checkout Session to that immutable snapshot and a customer authorization token.
- Add Stripe-signed raw-body webhook verification with timestamp tolerance. Handle paid completed sessions and asynchronous success through one shared fulfillment function.
- Retrieve the Session from Stripe, require payment mode/paid status/correct livemode, and match session id, order, amount and AED currency against the snapshot.
- Atomically create the order and record session fulfillment; duplicate/concurrent webhook and browser calls must return the same result without repeating stock changes. Failed persistence must remain retryable.
- Review Firestore rules and shared order/tracking schema before integrating production records. Clients must not assert paid status or modify authoritative card totals.
- Run isolated end-to-end tests for success, failure, cancellation, tampering, variants, replay, concurrent delivery, lost browser return and database failure/retry. Check order visibility in admin and customer tracking.
- Only after those gates pass, configure and verify Live key/webhook/account readiness and perform a controlled live acceptance flow with user-authorized payment details.

This branch contains audit tooling, a reviewed baseline and tests only. It is NOT a deployable fix. Ziina and the storefront are unchanged. Do not merge or deploy it as a replacement Worker.
