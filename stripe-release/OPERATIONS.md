# Stripe operations and release ownership

No production activation is authorized by this document. These procedures apply to the isolated test Worker now and to an explicitly approved production release later.

## Monitoring

Run `node stripe-release/operations.mjs` in a trusted runner with the appropriate mode-bound credentials. Output contains counts and order IDs only; exit code 2 means attention is required. A full 50-record sample is an alert, not a claim that the backlog has only 50 records. Inspect all pending records before resuming growth. Do not print Firestore snapshots, customer information, keys or guest receipts.

The test Worker schedules reconciliation every five minutes. A failed settlement makes the scheduled handler throw so it appears as a Worker execution failure. Configure Cloudflare failure alerts and Stripe webhook delivery alerts for the production release; GitHub one-time tests are not permanent monitoring. The owner must name the responsible operator and notification destination before activation; this project does not send messages to anyone.

## Paid stock shortage

1. Treat `orders.inventoryStatus=needs_review` / unresolved `stripe_review_queue` as a paid obligation. Do not ask the customer to pay again or ship unavailable items.
2. Find the matching server-generated Checkout Session in Stripe and verify currency, captured amount, order ID and payment status against the immutable snapshot.
3. Resolve with stock allocation or a full/partial refund according to the customer's agreement. A shortage has `stockDebits={}`; a refund must not increment stock that was never deducted.
4. Record refund ID, amount and outcome against the review record. Keep the original capture evidence and historical order. Only mark `resolved=true` after the actual provider result is confirmed. A queued or pending refund is not a succeeded refund.
5. For cancellations of debited orders, use the existing tested `preparePaidCancellationRestock` plan from trusted recorded debits and version preconditions; never restore browser cart quantities. The current production admin cancellation UI has not yet been migrated to this server flow and remains a release blocker.

## Delayed/missing webhook

Inspect Stripe delivery attempts, then allow Stripe retry or run reconciliation in the correctly gated environment. Never manufacture a paid flag. The server re-retrieves Stripe and uses an atomic payment claim and stock marker. Replaying a verified event is safe; deleting the order or claim to force a replay is unsafe.

## Stop and rollback

Set CHECKOUT_DISABLED=true on the release Worker to stop new sessions. Retain its secrets, webhook, status endpoint and reconciliation until every outstanding Checkout expires or settles. This switch is tested. Never roll back to public client-paid/stock writes. Do not delete paid orders or payment claims. The separate Live template remains disabled and has no routes.

## Private deployment inputs still needed for production

- Live Stripe account activation/KYC, Live secret and a dedicated Live webhook signing secret.
- Turnstile site key bound to kandorty.online/www and matching secret; the generated storefront deliberately says NOT_CONFIGURED.
- Reviewed production service account privileges and coordinated secure rules + COD/admin/client migration.
- Named operational owner and an approved alert destination.
- Explicit final authorization to activate Live and change the production site/rules.

No secret should be pasted into chat, source files, browser storage or PR comments. Test payment refund is verified in the Sandbox suite only; no real refund is executed by these files.

## Server lifecycle implementation

New orders now receive a server-owned `order_lifecycle` record in the same atomic commit as inventory. `/cod/orders` uses server pricing/idempotency. `/orders/cancel` requires both the signed receipt and the separate 48-hex manage capability returned only to the creating checkout. It permits new orders only, restores trusted recorded debits once, updates order/tracking/edit state atomically and opens a paid refund queue. Cancellation does not issue a refund.

`/admin/orders/status` verifies the Firebase RS256 signature against Google's pinned Secure Token keys, exact audience/issuer/expiry, a recent login and `admin:true`. It also reads server-owned `admin_access/{uid}` on every request: `active:true` and numeric `validAfter` (Unix seconds) are required. No client can create this membership using the proposed rules. Disabling it revokes this API access immediately; administrative provisioning is a separate privileged owner task. Tenant tokens are rejected. Tested transitions are new→preparing→shipping→delivered and new→cancelled; no backward transition or cancellation after preparation.

Signed refund.created/refund.updated/refund.failed/charge.refunded events resolve a server-owned PaymentIntent mapping, retrieve the bound Stripe Checkout/PaymentIntent and list the provider refunds. Only succeeded refund amounts count as returned money; pending, failed, partial and full are distinguished. Orders retain original `paymentStatus=paid` capture evidence plus `refundStatus` and `refundedAmount`. Full refunds close matching review/refund queues. Refund synchronization never restores stock: cancellation alone handles restocking, preventing double increments. Slow older reads cannot decrease a verified refunded amount. Guest status rechecks provider state to recover missed refund events.

The generated unpublished index/admin review artifacts route new COD, Stripe, guest cancellation and admin status changes through these endpoints. Existing production pages are unchanged. Historical orders without a trusted lifecycle ledger deliberately fail closed; their inventory/payment history must be reviewed before migration. Do not invent a ledger from untrusted client quantities. Admin authentication/provider integration is cryptographically unit-tested; an actual configured admin account and its privileged membership still need acceptance testing before production activation.
