# Kandorty owner-only legacy exception docket — PRIVATE / READ ONLY

**PREPARATION ONLY. NO PRODUCTION ORDER WRITES, STOCK RESTORATION,
REFUNDS, FIREBASE RULES CHANGE OR STRIPE LIVE RELEASE.**

## Stage 4 local real-backup emulator attempt — failed after private passphrase; safe phase diagnostics added

The owner ran the local fake-project `emulators:exec` backup rehearsal and entered the local GPG passphrase. The shell reported `LOCAL_STAGE4_EMULATOR_REHEARSAL_NOT_COMPLETED` and exit code 2; the emulator shut down afterward. The original generic error does **not** distinguish a GPG/decryption, source baseline, emulator HTTP write, or typed-field comparison issue. **Do not claim backup corruption or a successful real restore.**

The owner can now retry using a **single short interactive command**, after checking their existing GitHub branch and without installing any production credentials:

```bash
cd ~/kandorty-stage4-review && git pull --ff-only
bash stripe-release/owner-private-stage4-retry.sh
```

The wrapper validates the local test prerequisites, runs the synthetic security tests, checks Bash syntax in CI, strips cloud service-account/Stripe environment secrets and invokes the **same** fake-project loopback emulator. It never uploads the private backup. At the prompt, type the exact `REHEARSE_LOCAL_ONLY` and enter the private GPG passphrase only in the owner terminal. If it fails, share **only the last `LOCAL_REPLAY_STAGE` marker and the generic error**, never Firebase debug logs, private document fields, GPG password, full terminal history or customer data.

The draft branch now emits strictly fixed nonprivate `LOCAL_REPLAY_STAGE` diagnostic markers before decrypt/validate/empty-check/write/readback, plus synthetic tests for label integrity. The actual underlying failure cause remains **unverified** pending a new private owner retry. Never share private GPG password, ciphertext, order code, local emulator logs, request body or customer data. Stage 4 remains NO-GO, and no real production order, stock, Rules, Live payment, existing Worker or Ziina change is authorized.

## Stage 4 owner-only real encrypted JSON replay in an ISOLATED Firestore emulator (PREPARED / NOT OWNER-RUN)

A new [local replay tool](owner-private-firestore-emulator-replay.py) and [loopback-only emulator config](stage4-private-recovery.firebase.json) are checked in on the **draft test branch**. Synthetic-only regression tests (99 fake orders / 254 fake documents, changed-source refusal, nonempty-emulator refusal, local-demo guard) were attached to the private offline workflow; **do not treat this text as a verified CI run**.

**Before running real private data**, check the synthetic CI and ensure Cloud Shell has `firebase`, Java and an updated private repository checkout. The owner may execute the following only in their private authenticated Cloud Shell (never GitHub Actions or a shared runner). In particular, there is NO request to upload private GPG files or add a payment card:

```bash
cd ~/kandorty-stage4-review
git pull --ff-only
command -v firebase
java -version
```

Once prerequisites and synthetic tests are confirmed, the **separate owner-only opt-in** local emulator run is:

```bash
firebase emulators:exec --only firestore --project demo-kandorty-stage4-recovery \
  --config stripe-release/stage4-private-recovery.firebase.json \
  "env GCLOUD_PROJECT=demo-kandorty-stage4-recovery GOOGLE_CLOUD_PROJECT=demo-kandorty-stage4-recovery python3 stripe-release/owner-private-firestore-emulator-replay.py"
```

The tool requires owner typing `REHEARSE_LOCAL_ONLY` and entering the existing private GPG password at an invisible prompt. It first confirms an **empty emulator bound to 127.0.0.1:8119**. It then decrypts the previously saved 99-order / 254-document JSON backup only in the owner's local process and replays the five top-level collections to a **fake `demo-` project emulator**, verifies every document's identity and typed Firestore fields, and prints aggregate results only. The emulator is shut down by `emulators:exec` when the process exits; do not export emulator data, forward its loopback port, share temporary data or screenshots of private data, or save verbose request logs. The private snapshot contains customer personal data, so Cloud Shell and emulator runtime access must remain owner-only.

This is a **real-backup-to-local-emulator field-level rehearsal**, not a Google-managed Firestore export, cross-project real restore, backup of all collections/subcollections/Auth/Storage/Rules, independent verification of historical payment/stock/cancellation cause or permission to launch. Existing 18 evidence-blocked cases remain blocked. Production orders, stock, Stripe Live, Ziina, Firestore Rules and released website must stay unchanged. The original GPG file must be retained privately.

## Owner-only check of both encrypted visual surveys (READ ONLY)

An offline verifier now checks the **actual encrypted** owner-held PENDING (3) and UNKNOWN (11) visual-survey files against the **same private 18-case encrypted docket**, without printing any private code or reading a remote database. It rejects case drift, duplicated cases, missing responses, modified authorization fields, and inconsistent aggregate totals. A missing encrypted PENDING result is reported **MISSING**, even if three statuses were verbally reported as matching.

Run only in the owner's authenticated, private Cloud Shell checkout (not GitHub CI):

```bash
cd ~/kandorty-stage4-review
git pull --ff-only
python3 stripe-release/owner-private-stage4-survey-audit.py
```

Enter the local GPG password **only into the invisible terminal password prompt**. Share only aggregate markers such as `OWNER_PENDING_ENCRYPTED_SURVEY`, `OWNER_UNKNOWN_ENCRYPTED_SURVEY` and `ENCRYPTED_VISUAL_SURVEYS_VERIFIED`, never a filename, code, customer record, encrypted output, decrypted JSON or GPG password.

Both surveys are *visual status observations*, not independent evidence of cancellation actor, inventory, lock integrity or payment/refund. The verifier intentionally always prints `STAGE4_RELEASE_AUTHORIZED: NO` and `MANAGED_FIRESTORE_EXPORT_AND_REAL_RESTORE_VERIFIED: NO`. Even two perfect reports **cannot close the 18 historical exceptions** or replace an owner-controlled official managed backup and protected real restore rehearsal. No original order, stock, site, Firebase Rules, Worker, Stripe Live or Ziina mutation is performed.

## 2026-11-11 owner survey failed before displaying cases; diagnostic patch & synthetic full-flow tests PASS

The owner attempted the private `PENDING` (3) visual survey twice, supplying `YES` and a hidden GPG passphrase, but both runs stopped immediately after the password prompt with `OWNER_VISUAL_SURVEY_NOT_COMPLETED: private local verification failed`. **No private case codes were displayed, no visual comparison was completed, and no encrypted status-survey success was reported.** The cause is not known from the generic error: potential missing/invalid local docket, GPG password/decryption problem or failing case-baseline validation. Do not speculate or request the password or decrypted file.

The private status-survey script now prints safe diagnostic stage codes `LOCATE_DOCKET`, `DECRYPT_DOCKET`, `VALIDATE_CASES` when a corresponding local operation fails, and prints `PRIVATE_DOCKET_DECRYPTION: PASS` / `PRIVATE_CASE_BASELINE: PASS` upon success; it does **not** print exception messages or PII. Three synthetic mock-interaction tests now exercise complete `PENDING` and `UNKNOWN` flows as well as failure-stage redaction. All [52 offline tests PASSED](https://github.com/arif123-del/kandorty/actions/runs/42986474679); no real owner ciphertext was uploaded or accessed.

Next safe action for owner: `cd ~/kandorty-stage4-review && git pull --ff-only && python3 stripe-release/owner-private-legacy-status-survey.py`; type `PENDING`, `YES`, then the same original private GPG passphrase. If it fails again, share **only the `PRIVATE_SURVEY_FAILED_AT_STAGE` code**, not codes, passwords, customer data, screenshots or ciphertext. If success, compare actual admin statuses in private and report **only the aggregate counts**. No current admin data should be changed.

## 2026-11-11 private owner-only status survey of the remaining 14 cases (PREPARED, not run on real docket)

Added [owner-private-legacy-status-survey.py](owner-private-legacy-status-survey.py) for **owner-only manual comparison of live admin statuses** against the locally encrypted historical docket: three pending customer-cancellation cases (`PENDING`) and eleven cancelled orders with unknown cancellation actor (`UNKNOWN`). The three stock-marker cases are *overlapping flags*, not three additional orders. The script validates the existing 99-order/18-unique case baseline, prints only explicitly approved private order codes to the owner's **local terminal** and writes a **new AES256-GPG encrypted status survey** in `~/kandorty-private-backups/`. It never retrieves live Firestore data, invokes the admin website, changes order status, restores inventory, refunds payment or calls any cloud API. The owner's current-status input is a **visual observation**, not independent evidence of cancellation actor, valid stock debit/credit, payment/refund or processing locks. All output cases remain blocked and `STAGE4_RELEASE_AUTHORIZED: NO`.

Private Cloud Shell command, when the owner is ready to compare each case visually without screenshots or sharing identifiers:

```bash
cd ~/kandorty-stage4-review && git pull --ff-only && python3 stripe-release/owner-private-legacy-status-survey.py
```

Select `PENDING` (3 cases) first or `UNKNOWN` (11 cases) on a second run, type the exact `YES` approval, enter the original GPG password in Cloud Shell **privately**, then for each printed code look up only its live admin status and enter one of:

- `new` = طلب جديد
- `preparing` = قيد التجهيز
- `shipping` = قيد التوصيل
- `delivered` = تم التوصيل
- `cancelled` = ملغي
- `missing` = no matching order found (not a cancellation)
- `skip` = cannot verify safely now

The only results to share are aggregate counts such as `OWNER_VISUAL_MATCHING`, `OWNER_VISUAL_CHANGED`, `OWNER_VISUAL_MISSING`, `OWNER_VISUAL_SKIPPED` and `PRIVATE_ENCRYPTED_STATUS_SURVEY_CREATED: YES`. **Never share an order code, customer identity, screenshot of private identifiers, encrypted report, passphrase or decrypted file. Never press admin action buttons.** [49/49 synthetic offline CI tests PASSED](https://github.com/arif123-del/kandorty/actions/runs/42982296577) across private backup/risk/docket/triage/RAM replay/lock viewer/status survey.

**No progress should be misrepresented:** the 3 + 11 real cases have *not yet* been operator-compared with current statuses using this new script; a future visual comparison alone still cannot close the 18 cases or authorize a production release. Independent evidence-based reconciliation, protected full restore, and historical client/admin acceptance remain necessary.

## 2026-11-11 owner-reported admin status comparison of four lock cases

The owner privately located the four historical processing-lock cases in the live admin order viewer and reported that their **current statuses match the local backup** (two shipping, two delivered). This is a useful non-mutating **status consistency check**. It **does not establish valid matching cancellation/processing locks** or prove delivery, stock restoration, cancellation provenance or any financial settlement. The four cases remain flagged, and none has been remediated or authorized for live change. No order IDs, customer data or password are recorded here.

## Owner-private identification of the four processing-lock cases (read only)

The three owner-shared admin order screenshots **cannot** establish which of the 4 historical lock anomalies an order belongs to. Admin pages show order details and customer contact data, not the trusted order/tracking lock provenance. **Do not send additional screenshots containing contact details, order IDs or payment data.** Do not click status, cancellation, refund or restock actions.

To identify the four exception order codes **privately on the owner's own terminal only**, there is now an explicitly opt-in [offline viewer](owner-private-show-lock-cases.py). From the private Cloud Shell checkout:

```bash
cd ~/kandorty-stage4-review && git pull --ff-only && python3 stripe-release/owner-private-show-lock-cases.py
```

The owner must type `YES` to authorize a **local display** and then privately enter the previously used GPG password. The script opens the existing owner-only encrypted manual-review docket, validates 99 orders / 18 cases / the exact four risk category counts and prints only 4 order identifiers and their coarse statuses at backup time. It does not connect to GitHub, the website or Firestore, and it does not change any source records. These order IDs are PRIVATE and should **never be copied to a chat, screenshot, email or issue**. Synthetic tests cover 4-case extraction, duplicates, unexpected counts, approval flags, opt-in display and network-free code; the [owner-only workflow](https://github.com/arif123-del/kandorty/actions/runs/42975304839) passed.

The owner can visually match the four identifiers with the **private** live admin screen if necessary, without sending codes or screenshots. The live admin screen does not prove or repair a missing lock; each case still needs reliable lifecycle/cancellation evidence and independent review. This viewer does **not** resolve any of the 18 live exceptions or authorize release.

## Owner-reported local memory replay result — 2026-11-11

Owner replied with abbreviated terminal text `CAL_IN_MEMORY_REPLAY: PAS`, apparently the tail of `LOCAL_IN_MEMORY_REPLAY: PASS`. The full output was not supplied, so this is **owner-reported** successful offline RAM roundtrip and not an independently verified restore. No private ciphertext/password/order/customer data were obtained. This step does not change the **18 unresolved cases**, nor authorize inventory, status, refunds, production Rules, Stripe Live or a release.

## Owner-only offline backup integrity replay (new, synthetic CI verified)

A new script, [owner-private-local-replay.py](owner-private-local-replay.py),
validates the encrypted original **five-collection** backup locally and
roundtrips all document IDs, Firestore REST typed field values and
order/tracking status pairs through an ephemeral SQLite `:memory:`
database. It creates **no plaintext backup or SQLite database file**, and
never contacts Firestore, Stripe or any production service. It prints
only aggregate counts and pass/fail status.

The owner may run this in their existing private Cloud Shell checkout:

```bash
cd ~/kandorty-stage4-review && git pull --ff-only && python3 stripe-release/owner-private-local-replay.py
```

Enter the original backup GPG password **in Cloud Shell only**. Never share
it, the encrypted file or decrypted order data. Expected source baseline is
99 orders and 254 documents; a different count fails closed rather than
claiming validation of a changed snapshot.

[37/37 synthetic offline tests passed](https://github.com/arif123-del/kandorty/actions/runs/42964265352)
(7 original backup, 10 risk, 7 exception docket, 6 owner triage, 7 local
replay tests), including typed Firestore REST roundtrips and no-Firebase-call
static checks. **CI did not inspect the real owner backup**. The owner later reported a
truncated PASS line from the private local script; the complete terminal result
and private backup were not independently inspected.

**Crucial distinction:** SQLite RAM replay is NOT an actual Firestore restore,
a managed point-in-time export, a protected multi-project disaster-recovery
rehearsal, a complete nested-subcollection/Storage/Auth/Rules backup or a
release authorization. All 18 historical cases remain evidence-blocked;
no restored inventory, money or order status may be inferred.

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
