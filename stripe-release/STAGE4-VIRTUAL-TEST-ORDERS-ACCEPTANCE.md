# Stage 4 — owner-created virtual legacy orders: preservation acceptance

**Accepted 2026-11-12 for the LIMITED purpose of historical virtual-order preservation; no permission for a production rollout.**

## Owner statement and classification boundary

The Kandorty owner explicitly confirmed **all 99 existing historical Firestore order records were created by the owner as fake tests**; none is a genuine customer order. The **18 previously risk-flagged records are a subset**, and these 18 have **18 COD / 0 card labels in the read-only live aggregate**. The remaining 81 are also owner-created tests but **not necessarily COD**. This is the owner's attestation of origin, not per-record payment-provider proof or authorization to delete old records.

For owner-only, **documentation/planning**, use `OWNER_ATTESTED_ALL_99_VIRTUAL_TEST_ORDERS`. There is deliberately no production field/backfill, no bulk update, and no new customer-facing behavior. The 99 original documents and status/tracking histories remain unchanged.

## Evidence accepted for archive-preservation scope

- Owner encrypted the original 99-order / 254-related-document private Firestore export and verified exact local fake-emulator readback (**254/254**). A subsequent expanded Firestore-only encrypted backup covering **11 collection paths / 291 documents**, including **99 orders and 99 tracking records**, passed its on-device pre/post AES256 GPG hash and structural checks; owner downloaded a ciphertext copy to their mobile phone. The owner reported `PASS` for the real private expanded-snapshot local emulator recovery, but final terminal details, off-device checksum, and full cloud rollback were **not independently observed**. The separate [291-fake-doc real emulator CI](https://github.com/arif123-del/kandorty/actions/runs/43158079152) has PASS with exact typed-field round-trip.
- [Live read-only aggregate CI](https://github.com/arif123-del/kandorty/actions/runs/43064512500) found **99 orders**, matched **99 tracking statuses**, 18 flagged test-order exceptions with **18 COD / 0 card** labels. This is an aggregate correspondence, not per-ID provenance.
- [Immutable archive-only policy](legacy-archive-only-policy.mjs) and its [14 synthetic checks PASS](https://github.com/arif123-del/kandorty/actions/runs/43218536377): all 99 synthetic virtual test orders are preserved as **READ ONLY**, even with mixed historic payment labels. Status changes, deletions, refunds, stock restoration, lifecycle fabrications, checkout activation and production publication remain disallowed. **Policy is a draft, not an installed production enforcement mechanism.**
- No evidence of genuine customer ownership for these 99 is requested or required to archive them unchanged; 18-case cancellation-actor and card-refund documentation is not a blocker to *test-order archival*. No automatic settlement/refund assumptions are made.

## Explicit boundaries and work routed elsewhere

The following are **NOT** certified or done by this Stage 4 test-order preservation acceptance:

1. **Real product inventory:** 11 products exist; only one has an explicit valid `stock` and `totalStock` pair. **10 product records have no managed stock**. Never infer zero, unlimited capacity, historic test-order effects, or a safe replacement quantity; review physical stock before moving clients or payments.
2. **Live client and Rules migration (Stage 5):** the published storefront/admin still make direct order/tracking/stock writes. The draft stricter Rules would refuse those paths; the installed Android version(s) and guest COD/card/order-status/cancel flows have **not** passed end-to-end acceptance. The candidate admin auto-restock/auto-stock-baseline is disabled in **unpublished review output only**, not live. Leave existing site and Rules untouched until a separately approved coordinated migration passes.
3. **Whole-project recovery and final release (Stages 5/7):** a Firestore JSON encrypted snapshot is not Firebase Authentication/Cloud Storage/deployed Rules, a managed point-in-time export, a complete project rollback or proof of the phone ciphertext checksum. Existing read-only metadata access attempts for these other products returned unavailable. No export, restore, IAM grant or publishing is authorized or verified.
4. **Stripe Live & payments:** disabled, no Live webhook and server secret acceptance, no production order writes or refunds, and no claim that every historical 'card' test label had or lacked a real provider transaction.

## Disposition and approval

**Stage 4, scoped to the owner-declared 99 historical virtual-test-order data classification, encrypted Firestore preservation and local recovery preparation: COMPLETE (preparation)**. Nothing has been deployed. This does not assert a customer-safe production migration or full project recovery.

**Whole Kandorty release remains NO-GO**: PR #2 stays **draft, unmerged**; no published site/admin, Firebase Rules, Stripe Live, product stock, customer records, existing Workers, order statuses or Ziina data may be changed without explicit specific final owner approval. Remaining technical gates are tracked separately. **Do not repeat** the already completed backups, historic test-order surveys or COD confirmations.
