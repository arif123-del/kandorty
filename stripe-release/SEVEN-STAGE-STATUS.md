# Kandorty — seven-stage release status (updated 2026-11-10)

**This is a preparation checkpoint, not an authorization to activate Live payments.**
GitHub PR #2 remains draft/unmerged. Do not change production Firebase Rules,
published storefront/admin, existing Workers, Stripe Live, Ziina or 99 current legacy orders
without the owner's separate specific final release approval.

| # | Stage | Status | Verified scope and remaining gate |
|---|---|---|---|
| 1 | Detached Cloudflare Worker and isolated Sandbox | **Completed (preparation)** | Disabled production shell and isolated test Worker prepared; Sandbox provider/payment/refund checks passed. This does not mean Live is deployed. |
| 2 | Stripe Live webhook and secrets | **Partial** | Dedicated six-event Live webhook exists but remains **disabled**; Cloudflare required secret **names** were seen but value correctness, signing and provider delivery are unverified. |
| 3 | Firebase administrator identity/security preflight | **Completed (preflight only)** | Owner-attested fresh Firebase login and server-admin membership/claim verifier passed read-only acceptance on 2026-10-30. Production release Worker admin endpoint still needs coordinated acceptance. |
| 4 | Legacy order compatibility and preservation (original 98 baseline; 99 current) | **Partial / blocked** | Fresh 2026-11-09 read-only production audit found 99 orders (86 COD / 13 card), 99 matching tracking statuses and 99 without trusted server lifecycle ledgers. No orders changed. TEST-only atomic legacy-admin status handler prepared, **169 automated code tests passed**, an authentic isolated Firestore transaction and synthetic cleanup succeeded. Fresh aggregate-only audit found 3 customer-cancelled records with previously recorded restock flags, 4 processing orders missing cancellation locks, and 28 edit/access documents apiece; new policy fails closed on missing locks. Original Android 2.3.0 source versus owner-provided 2.3.1 ZIP confirmed only version and safe offline fallback source changed; installed APK not certified. Owner reported an encrypted LOCAL JSON backup on 2026-11-10, decrypted and counted at **99 orders and 254 documents** in five top-level collections; it was also downloaded to a device. The official managed Firestore export is still **not run** (billing disabled, no bucket), and recovery/restore was not exercised. Production legacy-admin/customer cancellation, protected backup and installed Android acceptance remain blocked; no live orders changed. |
| 5 | Website / Android / Firebase Rules compatibility | **Partial / blocked** | Rules emulator and candidate browser security tests pass. Installed Android 2.3.0 offline fallback is unsafe for new deny-client-writes rules; unsigned/uninstalled 2.3.1 source review only. Device acceptance and coordinated migration remain. |
| 6 | Resend email and operational monitoring | **Partial** | Resend domain and manual test email: owner-confirmed delivered to designated Gmail inbox on 2026-11-09. Deduplicated alert scheduler was tested and activated on the isolated TEST Worker only; a Firestore operator alert record shows **provider-accepted at 2026-11-09T20:15:34.421Z**. Three operator settings were restored as TEST Worker secrets from its owner-configured version history and the Wrangler TEST config now preserves dashboard variables. Automatic Resend **provider acceptance** has been independently seen for two TEST alert windows; recipient-inbox confirmation for the *automatic* message, Cloudflare scheduled execution alerts, Stripe delivery/dispute alerts and backup escalation remain. Cloudflare's connected CI token does **not** have permission to read notification policies, as confirmed by a non-mutating read attempt; do not claim external failure alerts are configured. The existing Resend API key is **Sending Access**, so it cannot be used to GET sent email history; the optional delivery-status reader requires a separate, owner-approved read-capable key and is OFF by default. |
| 7 | Final coordinated production activation | **Not started — approval required** | Only after stages 2, 4, 5 and 6 pass: owner must specifically authorize site/rules/backend and Live webhook activation and limited real payment/refund validation. Generic permission to finish preparation is **not** this authorization. |

## 2026-11-11 owner-reported private exception docket SUCCESS (NO PRODUCTION MUTATION)

The owner executed `python3 stripe-release/owner-private-legacy-exception-docket.py` from their Cloud Shell checkout and shared **aggregate-only console output**. The locally encrypted report was created successfully (`PRIVATE_ENCRYPTED_DOCKET_CREATED: YES`) from the existing private 99-order backup. It identified **18 unique legacy orders requiring manual review** (not 21 distinct orders), with overlapping review flags: 4 processing-lock cases, 3 customer-cancellation-request indicators, 3 historical stock-restoration-evidence markers and 11 unknown cancellation origins. The owner-reported output declared `PRODUCTION_ORDER_CHANGES: NONE` and `LIVE_RELEASE_OR_AUTOMATIC_RESTOCK_AUTHORIZED: NO`. We did **not** receive the encrypted file, its password, order IDs or customer data. This is **owner-attested local execution**, not an independent database read or a live fix.

**Next blocking gate:** an authorized private review/reconciliation of those 18 orders, proof of historical stock/payment correctness where needed, a protected full recovery plan and coordinated older-client/admin compatibility acceptance. Do **not** auto-repair locks, pending cancellations, stock or unknown cancellation origins. Stages 4 and 5 remain PARTIAL / NO-GO; final activation not authorized.

## 2026-11-11 additional Stage 4 safe preparation — synthetic verified, NO LIVE changes

- Added [owner-only offline encrypted exception docket generator](owner-private-legacy-exception-docket.py) and [private operating notes](OWNER-LEGACY-EXCEPTION-REVIEW.md). It reads the owner's existing encrypted local backup only after a private local password entry and creates a **new GPG AES-256-encrypted private report** of unique order codes with review-only flags; the script prints aggregate counts only. It does **not** copy customer contact data, amounts, items/quantities or payment credentials into the docket; no plaintext output file is produced.
- Synthetic fixture tests cover the known 4 lock issues, 3 pending cancellation cases and 11 unknown-origin cancellations, including overlapping categories without duplicate order rows, wrong project rejection and a genuine encrypted GPG roundtrip. [GitHub CI run 42895639209](https://github.com/arif123-del/kandorty/actions/runs/42895639209) **PASSED all 23 offline tests** (7 backup, 10 aggregate risk, 6 new docket). The workflow also asserted no Firebase/network code in these private scripts.
- **Not done:** this new docket has not been generated from the owner's *real* encrypted backup (not accessible to this environment); no live case has been reconciled, no full managed export/restore exists, and no Android payment/guest tracking order-flow acceptance or coordinated cutover was approved. Stage 4 and 5 remain **PARTIAL/NO-GO**. Original 99 orders, production Rules, Stripe Live and Ziina remain untouched by this work.

## 2026-11-10 Stage 4 progress (NOT COMPLETED)

- The owner-controlled, billing-free fallback created a 7.1 MB encrypted
  local JSON file; the owner reported successful decrypted counts of 99
  orders / 254 total documents and an on-device download. This is an
  owner-attested partial recovery artifact, **not** a full managed export
  or validated restoration.
- TEST-only legacy order/tracking status writes now use restricted Firestore
  update masks, preserving unrelated historical fields; production root and
  payment/stock/refund updates are rejected.
- [176/176 automated tests and candidate Rules checks](https://github.com/arif123-del/kandorty/actions/runs/42836875133)
  passed. These tests are not proof of live Android 2.3.0 compatibility.
- [Isolated authentic Firestore TEST transaction smoke](https://github.com/arif123-del/kandorty/actions/runs/42837485071)
  **PASSED** using a synthetic order. Verified Firestore timestamp and
  geolocation preservation after masked status write, payment/line-items
  integrity, order/tracking atomic status, immutable audit, replay no-op,
  and cleanup of synthetic documents; production remained untouched.
- A private read-only [local encrypted backup structure checker](owner-private-local-backup-review.py)
  was added. It only prints aggregate counts and encrypted-file checksum and
  rejects wrong project, missing or duplicate documents, missing tracking or
  mismatched order/tracking status. Its [7 synthetic CI tests](https://github.com/arif123-del/kandorty/actions/runs/42839036235)
  **PASSED**, including an authentic synthetic GPG AES-256 roundtrip and wrong
  password rejection. On 2026-11-10 the owner **explicitly confirmed** that their own Cloud Shell run of the real encrypted backup checker displayed
  `BACKUP_STRUCTURE_VERIFIED: YES`. This is owner-attested local file
  structural validation, not an independently retrieved backup or an
  executed Firestore restore. The private file and passphrase remain
  unavailable to CI and were not shared with ChatGPT.
- Read-only comparison of the previously owner-provided Android 2.3.0 source
  ZIP and prepared 2.3.1 CodeAssist ZIP confirms exactly two changed original
  files: app version and static safe-offline fallback. Both ZIPs passed integrity
  checks, and the offline HTML has no script/checkout/Firebase forms. **No
  Android APK was built, installed, signed or tested on-device.**
- An owner-only [offline encrypted legacy cancellation-risk report](owner-private-legacy-risk-report.py)
  now evaluates matching order/tracking status, missing/mismatched
  cancellation locks, customer cancellation requests, prior/restored
  stock flags, cancelled card payment review, unknown payment labels
  and lifecycle presence. It emits only aggregate counts and **never**
  authorizes stock restock, refund or production cutover. Its
  [8 synthetic CI regression tests](https://github.com/arif123-del/kandorty/actions/runs/42850577369)
  passed. The owner must run it privately on their encrypted local
  snapshot before we can call the real aggregate risk inventory verified.
- Static review of the owner-provided 2.3.1 Android ZIP confirms the offline
  HTML contains no form, scripts, iframe, card/payment controls or Firebase
  calls and links only back to the HTTPS Kandorty store. No Android
  SDK/Gradle or enrolled physical test device was available in the
  assistant environment; **no signed/installed APK acceptance**.
- Stage 4 remains **PARTIAL / NO-GO** pending a full protected recovery
  plan, legacy cancellation and missing-lock reconciliation, customer/admin
  compatibility acceptance, and installed Android device tests. No production
  migration or publishing approval has been given.

## Owner-verified encrypted-backup legacy-risk inventory — 2026-11-10 (read-only)

Owner ran `stripe-release/owner-private-legacy-risk-report.py` inside their own
Cloud Shell, entering the private GPG password locally, and supplied a screenshot
of the **aggregate-only output**. The script inspected **99 orders / 254
documents** with these exact counters:

| Risk category | Count |
|---|---:|
| Processing order missing/mismatching cancellation locks | **4** |
| New order with unexpected processing lock | **0** |
| Pending customer cancellation indicators | **3** |
| Cancelled customer orders with a recorded stock-restored flag | **3** |
| Cancelled customer orders lacking that flag | **0** |
| Cancelled card orders needing payment review | **0** |
| Cancelled orders with unknown cancellation origin | **11** |
| Invalid stored payment labels | **0** |
| Trusted lifecycle documents present | **0** |

**Interpretation:** These are independently counted indicators, not a proof
that any two categories contain the same orders. A stock-restored *flag*
does **not** establish correct inventory quantity or legitimate stock debit.
An unknown cancellation origin is **not** permission to infer customer/admin
actor, adjust stock, re-open the order, or issue a refund. Without trusted
`order_lifecycle` documents, existing client-side status/money/stock writes
must not be translated automatically to the new server lifecycle.

This is **owner-attested read-only local analysis of the encrypted backup**,
not a fresh live Firestore snapshot, full managed backup, recovery rehearsal,
or proof of real payment settlement. No private file, identifiers, passphrase,
customer data, Stripe Live key or production write was obtained from the
owner. Maintain **NO-GO** until manual legacy exception procedure, Android
device compatibility and full recovery/rollout gates are independently met.

## Owner's Android 2.3.3 connectivity acceptance (2026-11-10)

Owner confirmed via this chat that 2.3.3 shows the offline warning
when internet is cut during an open app, and then works normally with
products/images after reconnecting. Earlier 2.3.1 failed offline-cached
behavior and 2.3.2 had delayed in-session warning; 2.3.3 addresses these
two reported network cases. This is **owner-observed device behavior**,
not an APK signature/build attestation or evidence that legacy
order/admin/guest tracking, cancellation and Stripe/COD checkout are
compatible with the proposed restrictive production Rules.

Stages 4 and 5 remain **PARTIAL / NO-GO** for production. Older clients
remain a blocker; no owner approval to migrate orders, publish rules/site
or enable Stripe Live has been given.

## 2026-11-10 — Historical cancellation concurrency hardening (NO LIVE CHANGE)

The isolated legacy-admin service passed additional tests for a race between
a signed administrator status change and a customer's cancellation request:
Firestore transaction conflict causes a fresh read and **rejects** the
now-pending cancellation, without restocking products. Four synthetic
processing records with missing locks remain blocked; previously cancelled
orders with unknown cancellation origin remain immutable; customer-supplied
item quantities cannot authorize stock changes.

[180 source tests and separate Rules emulator checks](https://github.com/arif123-del/kandorty/actions/runs/42877834722)
succeeded, with no production reads/writes in those tests.

The owner-only encrypted risk checker was extended with **aggregate-only
overlap counters** for pending cancellation, lock gaps, restored-stock flags,
and unknown cancellation origin. Its
[17 synthetic checks](https://github.com/arif123-del/kandorty/actions/runs/42878539922)
passed. The new checker has **not yet** been executed by the owner on
the real encrypted file, so the actual overlap figures remain unknown.
No production migration/stock/refund/card-payment action is permitted.

## Verified test evidence

- [Current code/rules readiness](https://github.com/arif123-del/kandorty/actions/runs/42675520665): **148 code tests passed, zero failures**; rules-emulator job passed.
- [Latest successful Sandbox baseline](https://github.com/arif123-del/kandorty/actions/runs/42675227624): isolated Stripe test payments and refunds succeeded, without Live charges.
- The manual Resend test email reached the intended owner's Gmail Inbox and was shown in an owner-provided screenshot. The separate **automatic** operations alert has provider-accepted evidence in the isolated TEST Firestore operator-alert state at 2026-11-09T20:15:34.421Z, verified by a read-only GitHub Actions attempt. The automatic message's recipient inbox arrival is still unconfirmed; do not equate Resend acceptance with inbox delivery. The Gmail connector currently authenticated to a different inbox than the intended recipient and is not definitive for delivery.
- [Owner alert binding recovery](https://github.com/arif123-del/kandorty/actions/runs/42694842240): isolated TEST only, restored three previously configured alert values as encrypted Worker secrets without logging values, touching Stripe Live, or modifying production Firebase.
- [Latest code / Firebase Rules readiness](https://github.com/arif123-del/kandorty/actions/runs/42697562723): 155 code tests passed (zero failures) plus Rules compatibility checks. [Latest hosted Sandbox acceptance](https://github.com/arif123-del/kandorty/actions/runs/42697562326) succeeded. [Cloudflare TEST bindings audit](https://github.com/arif123-del/kandorty/actions/runs/42697763076) confirms Cron every five minutes, sending-only Resend secret, sender and recipient secret binding names, and secret-type alert toggle (toggle value unreadable through metadata). [TEST alert provider-state audit](https://github.com/arif123-del/kandorty/actions/runs/42697157622) found 2 provider-accepted alert records but 0 provider-delivered confirmations. This is not recipient-inbox proof.
- [Fresh 99-order historical snapshot](https://github.com/arif123-del/kandorty/actions/runs/42699507328): read-only current production count, tracking-status agreement and missing lifecycle ledger across all 99; one more order than the prior 98-count baseline. **Does not prove identical preservation of every baseline order.**
- [Legacy orders policy](LEGACY-ORDER-PRESERVATION.md), [Android findings](ANDROID-APP-COMPATIBILITY.md), [Email configuration](ALERT-EMAIL-SETUP.md), and [production no-go](PRODUCTION-GO-NOGO.md) retain separate acceptance gates.

- [Cloudflare independent alert policy read](https://github.com/arif123-del/kandorty/actions/runs/42698379876) returned `READ_ACCESS_NOT_GRANTED`, with no account or Worker mutation. This requires a different authorized read/notification workflow; no notification settings were changed.

- [Safe legacy transaction smoke](https://github.com/arif123-del/kandorty/actions/runs/42703622080): synthetic TEST order/tracking and immutable audit atomically verified; original and leftover synthetic TEST fixtures removed. [169 code tests and candidate Rules](https://github.com/arif123-del/kandorty/actions/runs/42703984347) passed. **Production old-order migration is not authorized or performed.**

- [Historical cancel/lock safety snapshot](https://github.com/arif123-del/kandorty/actions/runs/42705735191): 3 customer-cancelled with restoration flags, 4 processing orders without cancellation locks, 28 edit proof docs, 28 order access docs; count-only, no data changes.
- [Storage bucket permission check](https://github.com/arif123-del/kandorty/actions/runs/42705205226): read-only permission denied, no backup actually exported. Owner-only protected script: [private Firestore backup](owner-private-firestore-backup.sh). A protected export is still a hard pre-release gate.

- [Owner-controlled backup script static safety](https://github.com/arif123-del/kandorty/actions/runs/42707022470) **PASS**. Its code is available, but no GCS backup has been exported. [Current legacy safety code](https://github.com/arif123-del/kandorty/actions/runs/42706981495) passed **170/170 code tests**, Firebase Rules check is separately tracked; no production writes. Source-level Android offline safety is not installed-device acceptance.

## Reporting rule

When a whole stage (not just a code test or subtask) meets its acceptance
criteria, report it explicitly to the owner as:
**`Stage N — [name] — COMPLETED`**. Do not describe Stage 6 as completed
until a real automatically triggered email reaches the inbox and the relevant
provider execution/errors/escalation paths are validated. Do not describe
Stage 7 as completed until an explicitly approved coordinated rollout and
real-money acceptance have succeeded.
