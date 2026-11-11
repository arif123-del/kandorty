# Kandorty Stage 4 — archive-only quarantine alternative (DRAFT / NOT DEPLOYED)

**Decision status: PREPARED FOR OWNER REVIEW. NO-GO FOR PRODUCTION.**
This option is for an operator who prioritizes preservation of old orders over attempting to reconstruct untrusted customer-era lifecycle, inventory or cancellation history. It requires **no new credit card** for the already completed local encrypted backup rehearsal, but it is NOT a replacement for comprehensive managed backup/recovery or production release approval.

## Owner clarification — 18 flags arose from owner's own test orders

On 2026-11-11 the owner explicitly clarified in chat that **the 18 flagged orders were placed personally by the owner through the Kandorty app or website for testing, not by independent customers**. This is an **owner statement about test origin**, not independently verified matching of individual encrypted docket identifiers, payment mode, settlement, payment/refund status, stock debit/restock or processing-lock metadata. It is not permission to delete or rewrite a single order, nor blanket proof that no real card charge happened.

**Adjusted safe handling:** Classify these 18 **for planning and private review only** as `OWNER_REPORTED_TEST_ORDER_ORIGIN` (aggregate-only; never write that tag to production Firestore without separate review). Do not request real-customer cancellation statements or contact customers to prove a customer action that the owner says was only a test. Retain the owner-private GPG case docket and original 99-order backup unchanged. All 18 stay fail-closed for automated legacy cancellation, restock, refunds or migration until payment/inventory effects are separately reconciled or the operator accepts an explicitly read-only archive treatment.

For these test orders, the minimal remaining evidence categories are: (1) whether any **real card payments** or live refunds occurred, verified against the payment provider if applicable; (2) whether these test actions changed live stock and whether stock still matches trusted counts; (3) whether the old admin/browser cancellation and restock path can be retired safely; and (4) recovery and client-compatibility gates. If all cases remain historical read-only archive records and no money/stock action is taken, no automatic cancellation actor reconstruction is needed **for that archive-only treatment**, but production rollout still needs independent tests and owner-specific release approval.

## Verified facts
- Owner encrypted local snapshot: **99 old orders / 254 associated documents**, across five top-level collections; exact-field replay to an isolated, loopback-only Firestore emulator passed.
- Two private encrypted visual surveys: 3 pending and 11 unknown-origin cancellation cases, **14/14** matching previously saved statuses.
- **18 distinct historical exception records (21 overlapping flags)**: 4 processing locks, 3 cancellation requests, 3 stock-restoration markers and 11 cancellation-origin unknown. Visual status and archived field equality do not resolve these cases.
- New backend's trusted lifecycle ledger is absent for legacy orders. Do not synthesize ledgers, stock balances, proof of refund or cancellation actors.

## A conservative alternative to inventing historical truth
1. **Preserve all 99 historic order/tracking documents as they are.** Do not auto-backfill missing locks, replay historical stock credits, automatically cancel, re-open an order, assert card payments or issue refunds. Never delete historic orders merely to finish migration.
2. **Mark the 18 private exceptions as evidence-blocked, solely in the owner-held encrypted review docket**; do not add an invented `quarantined` status or any order ID/PII to public code, logs or customer views. The other 81 are also NOT automatically authorized for new lifecycle writes.
3. Prepare a **future read-only historic-order archive view** with customer/admin access checked independently. A historical order without a trusted ledger must not use the new-order server mutation API. If support requires a status update or cancellation, send it to separately authenticated manual review, not the old browser stock-restock path.
4. A coordinated future cutover must **retire or fully isolate all direct client writes**, including old WebView offline fallbacks and still-installed APKs. Merely changing Firebase Rules today would break old orders, and simply publishing a new site would leave old clients active. Do not publish anything yet.
5. Keep Stripe Sandbox/new-order functionality test-only until client/server/Rules acceptance and alerting pass; keep Live webhook disabled and dedicated production Worker detached.
6. For final release readiness, obtain owner acceptance for the exact archive behavior and limitations, independent proof/reconciliation for any old order that must be mutated, a protected verified recovery/rollback plan for production-owned data, and separately authorized coordinated release. **No user instruction to “finish Stage 4” substitutes for explicit approval to enable live checkout or publish strict Rules.**

## Failsafe acceptance criteria
- All 99 historic orders remain readable in a nonproduction acceptance test without changing source status, tracking or inventory.
- Every missing/inconsistent lock, pending cancel, restored marker and unknown-origin cancel is blocked from automatic mutation; no test derives stock from historical items/qty or finance truth from payment labels.
- Guests, old Android/WebView versions, current admin and customer flows are checked against a proposed *compatible* read-only archive; preserve or clearly surface unsupported old operations without altering records.
- Realistic backup/recovery coverage beyond the five currently exported collections (subcollections/Auth/Storage/Rules) and documented rollback remain required for coordinated production rollout.
- There is no production Firebase write, Stripe Live activity, deployment, PR merge, Ziina activity or automatic exception closure from preparing this option.

## Current disposition
**Technically prepared: owner-attested local recovery plus conservative archive/quarantine design.**
**Not performed: historical archive UI, full supported-client end-to-end acceptance, true full-project managed recovery, independent adjudication of the 18 historical exceptions, and production rollout.**

This is a reversible, fail-closed *proposal*, not a code path currently activated in Kandorty. There is no basis to call all Stage 4 release gates complete yet. See [Stage 4 issue](https://github.com/arif123-del/kandorty/issues/3), [seven-stage status](SEVEN-STAGE-STATUS.md) and [PR #2](https://github.com/arif123-del/kandorty/pull/2).
