# Kandorty owner-only legacy exception docket — PRIVATE / READ ONLY

**PREPARATION ONLY. NO PRODUCTION ORDER WRITES, STOCK RESTORATION,
REFUNDS, FIREBASE RULES CHANGE OR STRIPE LIVE RELEASE.**

## Owner execution confirmation — November 11, 2026 (aggregate-only screenshot)

The owner ran the private `owner-private-legacy-triage.py` after `git pull --ff-only` in their Cloud Shell and shared a screenshot of **only its aggregate console result**. It returned `CASES_READ_FROM_PRIVATE_DOCKET: 18`, `CASES_NEEDING_INDEPENDENT_EVIDENCE: 18`, `PRODUCTION_CHANGES_AUTHORIZED: 0` and `PRIVATE_ENCRYPTED_EVIDENCE_PLAN_CREATED: YES`. Four review flags matched the earlier private baseline (4 lock, 3 customer cancellation, 3 previous stock restoration, 11 unknown cancellation origins). It also declared `FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE` and `STAGE4_RELEASE_AUTHORIZED: NO`.

This **confirms owner-reported successful local creation of the second encrypted private checklist**, NOT that any one of the 18 cases is resolved. Private contents remain unshared. Do not request or publish the decrypted review file, any IDs, private backup, password or personal customer data. All 18 cases remain evidence-blocked and no production deployment is authorized.

## November 11 — owner-only 18-case evidence checklist (new offline safeguard)

The additional [owner-private-legacy-triage.py](owner-private-legacy-triage.py)
processes the owner's **already-created** private encrypted exception docket,
validates the exact owner-reported aggregate baseline (99 historical orders,
18 unique cases, 4 lock / 3 cancellation-request / 3 historical restoration-marker /
11 unknown-origin flags), and produces a **second AES-256-encrypted private file**.
It contains each original private order code, its existing coarse risk flags
and a risk-specific **evidence checklist**, with every case explicitly marked
`BLOCKED_PENDING_INDEPENDENT_OWNER_REVIEW`. It does not use, modify or
re-upload the original backup or ciphertext. Any changed counts, new unrecognised
flags, duplicates, unexpected identity metadata or approval fields cause
fail-closed rejection; changing order counts require a new approved audit.

The owner may run the following **only inside their private Cloud Shell checkout**:

```bash
cd ~/kandorty-stage4-review
git pull --ff-only
python3 stripe-release/owner-private-legacy-triage.py
```

The script locates the newest `legacy-manual-review-*.json.gpg` in
`~/kandorty-private-backups/`, asks for the owner's existing private GPG
password **locally**, and shows aggregate counts only. It writes the encrypted
`legacy-evidence-plan-*.json.gpg` to the same protected directory; neither
file nor password is needed by the assistant. Source backup, live Firebase,
Stripe and current order status are not altered.

This is a **manual-evidence planning tool**, not automatic reconciliation.
It deliberately reports `CASES_NEEDING_INDEPENDENT_EVIDENCE: 18` and
`PRODUCTION_CHANGES_AUTHORIZED: 0` even on success. The owner/operator still
must review each case using independent trusted inventory, fulfillment,
authenticated cancellation origin and (where relevant) Stripe provider records.
Do not infer stock, payment, cancellation actor or refund from historic labels.

## Updated TEST-only safeguards — November 11, 2026

The 18-unique / 21-overlapping category pattern has a representative
**synthetic test case** that passed in [CI run 42899068800](https://github.com/arif123-del/kandorty/actions/runs/42899068800)
(24 tests overall: 7 backup, 10 risk and 7 docket). It does **not**
reveal which actual private cases overlap.

In the isolated TEST-only legacy status source, active orders with old
`cancelledBy` or `cancelStockRestoredAt` markers now fail closed before
status mutation. Additional tests verify no inventory, refunds or order
status updates in those ambiguous scenarios. Current release-code CI
[42899322217](https://github.com/arif123-del/kandorty/actions/runs/42899322217)
passed. These safety tests do not settle the 18 cases or authorize a
production transition.

## Owner execution confirmation — November 11, 2026 UAE / November 10 UTC

The owner confirmed in ChatGPT with aggregate-only Cloud Shell console output that the script ran against the existing 99-order private local backup and created an encrypted GPG report successfully. It identified **18 unique orders** with **21 overlapping flag hits** (lock review 4; customer cancellation 3; historical stock-restoration evidence 3; cancelled-by origin unknown 11). The reported script exit included `PRODUCTION_ORDER_CHANGES: NONE` and `LIVE_RELEASE_OR_AUTOMATIC_RESTOCK_AUTHORIZED: NO`. This confirms **owner-reported successful private generation** only. The assistant did not obtain the GPG file or access any order ID, customer information or private password.

**Do not disclose the output file or its decrypted contents.** The 18 records remain unresolved, and the docket does not automatically authorize any Firestore updates, restocking or Stripe refunds.

## Purpose

The owner previously ran a fully private encrypted-backup checker and
reported 99 orders / 254 documents, with 4 processing/delivery lock
exceptions, 3 pending customer-cancellation indicators and 11 cancelled
orders whose original cancelling actor is unknown. Category counts
can **overlap**. Neither the reported historical stock-restoration
markers nor the payment-method labels prove a valid inventory debit,
settlement, refund or cancellation actor.

The offline
[owner-private-legacy-exception-docket.py](owner-private-legacy-exception-docket.py)
generates a *minimised private encrypted GPG review file* based on the
owner's existing encrypted local backup. It contains only:

- legacy order code (so the owner can privately find the case),
- coarse status and payment method ("cod"/"card"/"other"),
- names of review-only exception categories.

It excludes names, phone numbers, delivery addresses, line items,
quantities, stock, payment tokens, cash totals and customer records.
Even the order codes must **not** be posted to ChatGPT, GitHub or logs.
The file is never written to disk in plaintext: the script sends its
JSON to GPG on standard input and uses a private passphrase pipe.
The output is saved at mode 0600 in the owner-only backup directory,
and encryption success is a precondition of the "created" message.

## Private owner-only execution

This is intended **only** for the owner's own Cloud Shell or an offline
machine that already has the private encrypted backup. Keep all
decryption passwords private and do not upload the GPG file.

From a checked-out copy of
\`arif123-del/kandorty\` on the
\`stripe-live-fulfillment-hardening\` branch:

\`\`\`bash
python3 stripe-release/owner-private-legacy-exception-docket.py
\`\`\`

The default input file is
\`~/kandorty-private-backups/kandorty-orders-20261110T103014Z.json.gpg\`.
When needed, provide a different private .json.gpg filename as the first
argument. The script prompts **locally** for the existing backup
password; it is not requested by ChatGPT and is not put on the command
line. It prints aggregate counts and the path of the new encrypted
\`legacy-manual-review-*.json.gpg\`, never individual order IDs.

To inspect the docket, the **owner only** can decrypt the new .gpg
with their private GPG password in their own terminal. Avoid screenshots
of decrypted order-code lists. Do not place the resulting plaintext in
Cloud Shell's repository, GitHub, email or other shared folders.

## Manual decisions that are *not* automated

1. **Processing/delivery lock anomalies:** preserve original status and
   order/tracking pair. Determine why historical locks are missing before
   considering any authenticated server-side change; never auto-backfill.
2. **Pending cancellation requests:** do not let the old admin/customer
   listeners restore stock from untrusted product quantities. Keep
   status untouched pending an authenticated, independently approved
   customer-cancel path.
3. **Unknown cancelled-by:** do not infer customer/admin, resurrect the
   order, increment inventory, issue a refund or mark card settlement.
4. **Historical restock markers:** markers are historical claims only,
   not proof of correct inventory.
5. **Card cancellation:** confirm Stripe provider-side payment evidence
   privately before any separate operator-approved refund workflow.
6. **Old app/browser and strict Rules compatibility:** remain blocked
   until actual nonproduction legacy checkout/tracking/cancellation
   acceptance and coordinated rollback plan, even though Android 2.3.3
   owner-reported offline/online connectivity checks passed.

**The owner must explicitly approve the exact future production change
after review. Generic requests to "finish" this preparation are not
permission to mutate production order status, inventory, refunds,
Rules, public site or Stripe Live.**

## Synthetic verification

The automated [offline owner-backup verification workflow](https://github.com/arif123-del/kandorty/actions/runs/42895639209)
passed **23 tests**: 7 encrypted backup structure tests, 10 aggregate
legacy-risk/overlap tests and 6 new encrypted-exception-docket tests.
The latter include synthetic 99-order fixtures, exactly 4/3/11
representative exception groups, overlap deduplication, wrong-project
rejection, no private customer/stock data and a genuine GPG AES-256
encrypt/decrypt roundtrip. CI does **not** contain the real backup or
customer data. This proves neither actual legacy-case remediation nor
production readiness.

**Owner-confirmed update:** The owner subsequently ran this script in their
own Cloud Shell on the real encrypted backup and reported successful private
GPG creation and **18 unique review cases** with 21 overlapping flag hits.
This was owner-attested aggregate output; the assistant has not accessed the
private report or verified the 18 individual cases. No live records were
changed. See the execution confirmation above.
