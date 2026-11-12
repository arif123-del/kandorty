# Kandorty Stage 5 — tested candidate, release NO-GO
**Date:** 2026-11-12. **Candidate only. Do not merge, publish, or activate Stripe Live.**

## Verified in draft
- [Full latest no-deploy CI](https://github.com/arif123-del/kandorty/actions/runs/43222199698): **213 code tests pass, 0 fail, 1 skipped**; **27/27 Firestore Rules emulator tests pass**.
- New COD checkout fails closed if product `stock` or verified `totalStock` is missing, non-integer or inconsistent. Missing does **not** mean zero or unlimited. No automatic historic inventory repair.
- New hosted-card Checkout preflight rejects unknown inventory **before** any Stripe Session creation or Firestore checkout write. If a **verified paid** card Session encounters out-of-stock/unknown stock after payment, the paid order is preserved as `needs_review` with **no product stock write and no automatic refund**; a person must handle fulfillment/refund.
- [Generated unpublished website/admin candidate tests](stage5-generated-client-cutover.test.mjs) verify **new COD/card checkout uses server-backed API** and new admin status uses authenticated server client; background legacy cancellation/restock and invented baseline migration removed in the review copy. Production `index.html` and `admin.html` SHA-256 remain unchanged. This **does not** remove old already-installed mobile/web client direct-write behavior.
- Existing sandbox COD/card duplicate/idempotency, guest order status, cancel, versioned stock and candidate Rules tests passed in CI.

## Hard acceptance blockers preventing a truthful Stage 5 completion
1. **Real stock evidence is missing.** Read-only Firestore audit: **11 products, only 1 with numeric valid `stock` and `totalStock`; 10 lack both**. Real physical quantities and explicit per-product sale availability policy require owner verification; no one is authorized to infer/adjust numbers from 99 old virtual tests. Candidate safely rejects new orders for unconfigured products (currently 10 of 11), which is a business limitation, not completed catalog readiness.
2. **Current installed Android 2.3.3 has not been tested for COD/card, guest tracking, cancellation and strict Rules**. Owner reported its basic offline/online WebView behavior but did not supply a verified matching APK/source in this repository. The archival V1 Kotlin ZIP and other WebView source snapshots are not proof about 2.3.3, and legacy installed clients may write to Firestore directly.
3. **Coordinated backend/site/admin/app/Rules cutover and recovery/rollback** have not been tested or approved. Draft strict Rules block client order/tracking writes; deploying Rules first would break legacy checkout/admin clients. No changes to production without explicit separate owner approval.
4. **Full project recovery (Auth/Storage/Rules)** remains separately tracked in [issue #5](https://github.com/arif123-del/kandorty/issues/5); Firestore-only encrypted 291-doc backup is not whole-project restore.

## Decision
**Stage 5 candidate code-and-rules unit/integration preparation: PASS.**
**Stage 5 end-to-end actual device, physical stock and live-client migration acceptance: NOT COMPLETE / NO-GO.**

What the owner needs to provide to move forward: (a) verified saleable stock counts or explicit pause-sale selection for the 10 currently unconfigured products; (b) the actual installed 2.3.3 Android APK/source ZIP for isolated compatibility checks, plus acceptance on device. Keep original site/admin, 99 virtual orders, both encrypted backups, product values, Firebase Rules, Stripe Live and Ziina **unchanged** until final explicit approval. PR #2 remains draft and unmerged.
