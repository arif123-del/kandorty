# Historical Kandorty orders: admin-only status compatibility DRAFT (NO DEPLOY)

**2026-11-10 — isolated TEST-only transaction handler and synthetic Firestore REST test added. NOT enabled for production, NOT a migration, and NOT approved for legacy customer or admin rollout.** Work on the draft PR branch does not modify the public store, any Firebase records/Rules, an Android APK, a Cloudflare Worker, Stripe Live, or Ziina.

## Latest read-only production confirmation — 2026-11-09 UTC

The [current safe aggregate audit](https://github.com/arif123-del/kandorty/actions/runs/42699507328) counts **99** live order documents, of which **99 lack a trusted lifecycle ledger**, plus **99 matching tracking statuses** and zero missing tracking records. Stored method labels are 86 COD and 13 card; status labels are 78 new, 2 preparing, 2 shipping, 3 delivered and 14 cancelled. The earlier 98 count was a 2026-10-29 snapshot, not evidence of a deleted or rewritten order. The new audit did not read customer contact fields or mutate Firestore.

The draft's synthetic fixture coverage has been updated to 99. Unknown historical payment labels now fail closed rather than being treated as COD. **This remains isolated source-level test preparation only; no admin endpoint or legacy cancellation path has been activated.**

## Why this is needed

The last verified production snapshot counted 98 legacy orders (86 COD and 12 card), all without an authenticated server-owned `order_lifecycle` document. The new trusted lifecycle service correctly rejects them. The live browser administrator still updates statuses via client Firestore transactions, while the candidate Rules reject those writes. Simply publishing the candidate Rules would strand legacy orders.

There is an additional **unsafe automatic-restock interaction** in the current `admin.html`: `restoreCustomerCancelledStock()` can derive stock increments from legacy customer-authored `items[].qty` after detecting `customerEdit.cancelRequestedAt`. Therefore **the new server must not finalize pending legacy customer cancellations while an old admin/browser client can perform that restock**. The draft planner deliberately blocks pending cancellation in both directions. Existing status-locked and cancelled orders must never be resurrected.

## Prepared technical work (isolated TEST only)

- `stripe-release/legacy-status-policy.mjs`: an isolated pure transition plan, still reject-by-default and never authorized by client flags.
- `stripe-release/legacy-status-service.mjs`: a server-only transactional status service for **TEST project `kandorty-stripe-test-5f8af`**, with an unconditional **LIVE deny**. Requires *both* `LEGACY_STATUS_TEST_ENABLED=true` and private `LEGACY_STATUS_TEST_APPROVAL=KANDORTY_LEGACY_TEST_ONLY_APPROVED`; neither is configured in the existing TEST Worker defaults.
- `stripe-release/worker.mjs`: a separate `/admin/legacy/orders/status` route, **disabled by default**, requires the existing signed Firebase administrator ID token plus server-owned membership, and cannot be activated for Live even with copied test flags.
- `stripe-release/firestore.mjs`: uses a real Firestore read-write transaction for order, tracking and *absence of trusted ledger* reads, then one atomic order/tracking/immutable-audit commit. A concurrent new ledger causes a transaction retry/rejection, not an unauthorized legacy write.
- [TEST Firestore REST smoke](https://github.com/arif123-del/kandorty/actions/runs/42703622080) succeeded with one synthetic COD order: order and tracking advanced together, immutable operator audit created, repeated status was a no-op, no lifecycle/stock/payment/refund document was created. Synthetic test data and two orphaned old smoke-test audit markers were safely removed. **Never interpret a test-only mock admin actor as production admin acceptance.**
- `stripe-release/legacy-status-policy.test.mjs`: synthetic legacy fixtures, including 99 mock orders for aggregate regression coverage, canceled/processing locks, mismatched tracking, a failed-to-confirm ledger lookup, card cancellation flagged for manual payment review, zero source mutations, and patches limited to order/tracking status and cancellation lock metadata.
- The design fails closed by default (`policyApproved=false`) and requires the caller to confirm the trusted ledger's absence explicitly (`ledger=null`). **These are not a substitute for authentication or owner approval.**
- It emits no stock, inventory, paid flag, refund amount, or payment write. Card cancellations only return `needsPaymentReview` as a future operator-action signal, not evidence of payment/refund.
- A separately authorized read-only production aggregate audit saw 99 real orders, 99 matching tracking statuses and zero trusted lifecycle ledgers; **no customer details, order IDs or documents were copied into fixtures, and no production orders were changed**.

## Preconditions before integrating or enabling this policy

1. Owner chooses and signs off on the legacy-only handling procedure and the exact subset of old devices/browser versions to support.
2. A future authenticated server endpoint must validate a *fresh* Firebase admin ID token, server-owned membership and project binding before reading any record. The frontend cannot supply `policyApproved`, identity or ledger absence.
3. The TEST-only code already uses one Firestore read-write transaction for the order, tracking and ledger, version preconditions and an immutable audit entry. This design must be extended and re-validated **only after** approved production policy, verified admin and client cutover. Treat any drift as a conflict; never trust the browser to name status, money, inventory or identity fields beyond a strictly validated requested transition.
4. **Retire/replace old browser admin and customer cancellation/restock code before allowing such writes.** A safe status planner alone cannot make a still-open legacy client safe. A pending `customerEdit.cancelRequestedAt` remains blocked until a separately reviewed cancellation/reconciliation method exists. No server code may manufacture trusted stock debits.
5. Audit supported old order-code formats, order/history and guest tracking. Confirm historical card settlements in Stripe by trusted provider evidence before any refund process. No refund is initiated by this draft.
6. Test on isolated fixtures: legacy COD/new/card, inconsistent status/tracking, duplicate admin action, processing lock, pending customer cancellation, downgrade rejection, zero unauthorized product/financial edits, old app fallback and new adapter compatibility.
7. Retake a protected read-only production inventory and obtain owner approval for an explicit coordinated deployment/rollback, separate from the final Stripe Live approval. Do not publish candidate Rules or change the public site in isolation.

## Current blocking status

**NOT RELEASE READY.** The TEST-only atomic status service and HTTP gate have passed unit and synthetic REST smoke tests, but this is **not an implemented production migration**. The existing 98 orders are untouched; old customer-tracking/cancellation and admin restock compatibility have not passed coordinated acceptance. Do not merge PR #2, enable Stripe Live/webhook, or switch production Rules/site without an independently authorized rollout.
