# Kandorty production Firestore Security Rules audit — review only

**Date:** 2026-10-27  
**Project:** `kandorty-9378a` (production, **not** `kandorty-stripe-test-5f8af`)  
**Evidence:** Three readable user-provided screenshots of the currently displayed production Firestore rules, especially lines 1–227. This document records **visible code only**, not an independently fetched or exported complete ruleset.  
**Status:** CRITICAL FINDINGS; **DO NOT PUBLISH** changes in Firebase yet. This file does not deploy rules or modify the live store.

## 1. Critical: unauthenticated product stock decrements

The photographed `match /products/{id}` block (lines ~33–59) allows `update` when `isAdmin()` **OR** all of these hold:

- old and new `stock` are numbers;
- new `stock` is nonnegative and strictly less than previous `stock`;
- new `updatedAt` is a string;
- `affectedKeys().hasOnly(['stock','updatedAt'])`.

This alternative contains **no `request.auth` requirement**, no order reference, no stock-debit proof and no quantity-to-order reconciliation. Any client that knows a public product ID can issue an arbitrary stock decrement without paying or placing an order. The existing browser `saveOrderWithStock` relies on this broad rule to process guest/COD checkout; tightening it *alone* would break that flow.

**Severity: critical.** Fix by moving stock debits to a trusted server-side operation, protecting privileged writes by IAM, then deny product stock updates from untrusted browser/mobile clients. Server SDKs with appropriate IAM credentials bypass Firestore client Security Rules, so review the service account role and scope separately.

## 2. Critical: guest can create unverified 'card' / fabricated paid order

The photographed `match /orders/{orderId}` rule (lines ~81–99) permits `create` of `KD-########` orders with `status == 'new'`, a valid customer object, `payment in ['cod','card']`, numeric `total`, a notes string and items list. The UID/phone checks apply **only when those optional account-identity keys are present**; the guest path has no Firebase Authentication requirement, which is an intentional checkout feature.

The rule does **not** restrict all allowed document keys with `hasOnly()`, does not forbid `paymentStatus: 'paid'` or a spoofed Stripe session ID, does not bind price/item quantities to server-side product pricing, and does not check a signed Stripe payment. A malicious guest could potentially write a forged-looking paid card order, change totals, or inject untrusted fields.

**Severity: critical.** Never rely on a browser-written `paymentStatus` or `payment:'card'` to indicate real payment. Move card-order creation to a server that verifies the actual paid Stripe Session and uses an immutable priced snapshot. For COD use a *separate* server-trusted order flow (or rigorously tested atomic rules), keeping guest checkout accessible. Once these flows are migrated, deny all untrusted client creates/privileged updates of card-paid order fields.

## 3. Security-sensitive customer tracking and edits

- `/tracking/{orderId}`: `get: true`, `list: false`; creation is permitted when linked to a newly created order, and updates/deletes admin-only (visible lines ~126–139). Treat order IDs as **not** sufficient authorization for personal details; ensure only minimal tracking status is returned.
- `/order_edits/{editToken}`: `get: true`, `list: false`, conditional create/update based on an edit token and matching `orders` (visible ~141–178). These documents can contain `customer`, `items`, `notes`. The safety of public token-based reads depends on truly unpredictable, unexposed edit tokens. Verify client-side token handling, token rotation, and read privacy.
- `/order_access/{accessKey}`: `get: true`, `list` admin-only, and creation validates an order ID/edit token against `orders` (~180–209). Verify accessKey secrecy and customer ownership. Unauthenticated lookup by key is a deliberate bearer-capability pattern, not equivalent to authenticated ownership.
- `/customers/{uid}` is restricted to admin or the logged-in phone owner in the visible rules (~67–78). Preserve that access when revising.
- `isAdmin()` checks for one exact Firebase-auth email in visible lines ~6–10. Consider a managed administrator UID/custom claim, secure account recovery, verified email checks, and least privilege; do not expose or hardcode additional admin credentials.

These observations are limited to the photographed sections; the rules have **not** been downloaded or validated in the Emulator.

## 4. No-live-change remediation order

1. Export and back up the **complete** current Firestore Rules and capture a restorable snapshot. Keep credentials out of GitHub.
2. Prepare isolated **production-shaped test** Firebase project and representative catalog/orders. Do not use the live `kandorty-9378a` database as a test fixture.
3. Implement server-verified Stripe Sandbox order creation + paid webhook fulfillment + immutable totals and reliable idempotency, with customer tracking/edit records and stock in the same atomic commit.
4. Migrate **Cash on Delivery** checkout to a trusted service or implement and Emulator-test a provably safe stock/order transaction path.
5. Audit the existing **Ziina** order and stock flows and Android app checkout. Neither may silently rely on unrestricted public product stock updates.
6. Review paid cancellation, refund, reservation/oversold handling, retries, tracking, buyer authentication and anonymous order receipts. Only restore stock actually deducted once.
7. Draft full rules with least privilege; do **not** publish isolated snippets. Run Firebase Emulator tests for anonymous authenticated/unauthenticated clients, forged paid writes, product stock updates, COD, Stripe, Ziina, customer viewing, editing, cancellation and admin workflows.
8. Independently test connected Cloudflare, Stripe Sandbox webhook events and Firebase after those changes. Rollout needs explicit user approval and a rollback plan. **Live payment credentials stay disabled.**

## 5. Security rules test matrix (required before publish)

| Actor / action | Intended |
|---|---|
| Anonymous: read public product catalog | Allow |
| Anonymous: arbitrarily decrement `products/*/stock` | **Deny** |
| Any non-admin: set card order `paymentStatus='paid'` | **Deny** |
| Any client: forge Stripe Session ID / paid amount / refund status | **Deny** |
| Anonymous: create genuine guest COD order via approved new server path | Allow |
| Signed-in phone buyer: read only own orders / sensitive receipts | Allow only own |
| Arbitrary buyer: list customers, edit access tokens or private orders | **Deny** |
| Stripe server: validated paid order + stock + tracking + markers | Allow via least-privilege IAM |
| Two concurrent signed Stripe webhooks for same session | One paid order, at most one stock decrement |
| Paid order out of stock before fulfillment | Retain paid record, mark for review, no negative stock |
| Customer cancellation replay | Stock credited once at most, and only trusted recorded debits |
| Admin: manage inventory and order status | Allow with verified admin identity |
| Legacy COD and Ziina checkout | Continue working after migrations |

## 6. Candidate future policy (illustrative ONLY, intentionally incomplete)

The target state is to **remove non-admin browser writes to product stock** and to make paid card order creation privileged. However, applying a snippet such as `allow update: if isAdmin()` for products or `allow create: if isAdmin()` for orders today would likely **break COD and other guest order flows**, so no pasteable replacement is supplied in this document.

**References:** Firebase official documentation on Firestore Rules conditions, affectedKeys/hasOnly, overlapping match OR behavior, `getAfter` and atomic operations.

**Do not use Publish, Deploy or Merge based on this audit alone.**
