# Kandorty — seven-stage release status (2026-11-09)

**This is a preparation checkpoint, not an authorization to activate Live payments.**
GitHub PR #2 remains draft/unmerged. Do not change production Firebase Rules,
published storefront/admin, existing Workers, Stripe Live, Ziina or 98 legacy orders
without the owner's separate specific final release approval.

| # | Stage | Status | Verified scope and remaining gate |
|---|---|---|---|
| 1 | Detached Cloudflare Worker and isolated Sandbox | **Completed (preparation)** | Disabled production shell and isolated test Worker prepared; Sandbox provider/payment/refund checks passed. This does not mean Live is deployed. |
| 2 | Stripe Live webhook and secrets | **Partial** | Dedicated six-event Live webhook exists but remains **disabled**; Cloudflare required secret **names** were seen but value correctness, signing and provider delivery are unverified. |
| 3 | Firebase administrator identity/security preflight | **Completed (preflight only)** | Owner-attested fresh Firebase login and server-admin membership/claim verifier passed read-only acceptance on 2026-10-30. Production release Worker admin endpoint still needs coordinated acceptance. |
| 4 | Legacy order compatibility and preservation (original 98 baseline; 99 current) | **Partial / blocked** | Fresh 2026-11-09 read-only production audit found 99 orders (86 COD / 13 card), 99 matching tracking statuses and 99 without trusted server lifecycle ledgers. No orders changed. TEST-only atomic legacy-admin status handler prepared, **169 automated code tests passed**, an authentic isolated Firestore transaction and synthetic cleanup succeeded. Current aggregate-only audit found 3 customer-cancelled records with previously recorded restock flags, 4 processing orders missing cancellation locks, and 28 edit/access documents apiece; new policy fails closed on missing locks. A safe owner-only Cloud Shell export script was prepared but **backup not run**, because connected CI service credentials lacked Cloud Storage bucket metadata permission. Production legacy-admin/customer cancellation, protected backup and installed Android acceptance remain blocked; no live orders changed. |
| 5 | Website / Android / Firebase Rules compatibility | **Partial / blocked** | Rules emulator and candidate browser security tests pass. Installed Android 2.3.0 offline fallback is unsafe for new deny-client-writes rules; unsigned/uninstalled 2.3.1 source review only. Device acceptance and coordinated migration remain. |
| 6 | Resend email and operational monitoring | **Partial** | Resend domain and manual test email: owner-confirmed delivered to designated Gmail inbox on 2026-11-09. Deduplicated alert scheduler was tested and activated on the isolated TEST Worker only; a Firestore operator alert record shows **provider-accepted at 2026-11-09T20:15:34.421Z**. Three operator settings were restored as TEST Worker secrets from its owner-configured version history and the Wrangler TEST config now preserves dashboard variables. Automatic Resend **provider acceptance** has been independently seen for two TEST alert windows; recipient-inbox confirmation for the *automatic* message, Cloudflare scheduled execution alerts, Stripe delivery/dispute alerts and backup escalation remain. Cloudflare's connected CI token does **not** have permission to read notification policies, as confirmed by a non-mutating read attempt; do not claim external failure alerts are configured. The existing Resend API key is **Sending Access**, so it cannot be used to GET sent email history; the optional delivery-status reader requires a separate, owner-approved read-capable key and is OFF by default. |
| 7 | Final coordinated production activation | **Not started — approval required** | Only after stages 2, 4, 5 and 6 pass: owner must specifically authorize site/rules/backend and Live webhook activation and limited real payment/refund validation. Generic permission to finish preparation is **not** this authorization. |

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

## Reporting rule

When a whole stage (not just a code test or subtask) meets its acceptance
criteria, report it explicitly to the owner as:
**`Stage N — [name] — COMPLETED`**. Do not describe Stage 6 as completed
until a real automatically triggered email reaches the inbox and the relevant
provider execution/errors/escalation paths are validated. Do not describe
Stage 7 as completed until an explicitly approved coordinated rollout and
real-money acceptance have succeeded.
