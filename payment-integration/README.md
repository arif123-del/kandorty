# Joint payment settlement — isolated TEST only

The private COD test Worker now has `POST /payments/stripe/finalize` and `POST /payments/ziina/finalize`. Input is **only** `{checkoutToken}` plus the existing private staging header. It loads an IAM-created immutable snapshot, independently retrieves provider state, and commits order + stock + tracking + access/edit records + unique payment claim + fulfilled marker atomically. Receipt-based guest tracking covers COD and these card orders. No public checkout or production route was changed.

Stripe uses a **PaymentIntent** adapter with a mandatory `sk_test_` key and `livemode:false`, paid status, exact amount received/currency and checkout/order metadata. This is a separate API settlement integration test; the existing hosted Stripe Checkout/signed webhook Worker is untouched.

Ziina validates completed state, amount/currency, zero tips/VAT, account, operation and payment ID. Its GET API does not document a `test` response field: a server-only creation snapshot binds the ID returned from our own `test:true` creation; any explicit live marker is rejected. Never accept arbitrary browser-supplied payment objects or bind requests. Snapshot creation helpers are IAM-only test setup, not exposed HTTP routes.

Concurrent handlers can observe a snapshot before another atomic commit and an order after it. They reread all records on this case and on version conflicts; they never blindly resubmit stock updates. A provider payment can back only one checkout/order using a unique hashed payment claim. A paid order with insufficient stock is saved with `inventoryStatus: needs_review` and **no** inventory debit; this is not automatic refund or backorder resolution.

## Evidence categories

1. Unit tests: mocked provider responses + in-memory atomic store; 61 combined tests including prior suites.
2. `firestore-smoke.mjs`: real isolated Firestore, **simulated Stripe/Ziina responses**, COD/Stripe/Ziina races and last-unit contention. Simulated paid records explicitly have `verificationEvidence: simulated_provider`. Deployed provider retrieval rejects these fixtures.
3. `stripe-smoke.mjs`: **real Stripe Sandbox** PaymentIntent creation, unpaid rejection, test payment with `pm_card_visa`, deployed Worker API re-verification, simultaneous COD stock consumption, replay and secure guest receipt.
4. **BLOCKED:** real Ziina hosted payment + deployed API verification needs `ZIINA_TEST_API_KEY`. Readiness run 40535049206 confirmed both `ZIINA_TEST_API_KEY` and `ZIINA_API_KEY` absent from GitHub. Existing Ziina Worker secrets cannot be exported and must not be exposed or modified.

The three test layers must not be conflated. A green code/Firestore/Stripe job does **not** certify the missing real Ziina payment, production readiness, Android/storefront wiring, or a new joint signed webhook. Production rules, Live keys, site and existing Stripe/Ziina Workers remain unchanged. PR stays draft.

## Next credential action

Add the Ziina API credential for test intents directly as the GitHub Actions repository secret `ZIINA_TEST_API_KEY` (never paste it into a chat or file). Then provision it privately to the new `kandorty-cod-orders-test` Worker only, create a `test:true` Ziina intent in the isolated snapshot flow, complete its hosted test payment and verify server settlement/replay/stock/guest tracking. Do not copy the production Firebase credential.

## Test commands

```
node --test payment-integration/*.test.mjs cod-staging/*.test.mjs stripe-live-candidate/{fulfillment,cancellation,atomic-commit,cod,cod-race}.test.mjs
```

Real-service scripts run inside GitHub Actions using secrets. They create unique synthetic fixtures only in `kandorty-stripe-test-5f8af`, retain them for audit, and never publish Firestore Rules.
