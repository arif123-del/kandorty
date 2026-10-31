# Kandorty historical-order preservation — release blocker

**Status: PREPARED / NO PRODUCTION MIGRATION.** This checklist is for review on GitHub PR #2. It does not authorize merging, publishing rules, enabling Live payments, or rewriting any order.

## Confirmed snapshot (read-only, 2026-10-29)

- The production project contained **98 orders** in the bounded read-only audit.
- All 98 were missing matching **trusted** `order_lifecycle` records.
- 86 were tagged COD and 12 card; status groups were 77 new, 2 preparing, 2 shipping, 3 delivered and 14 cancelled.
- This is a historical snapshot, **not** a new live count or evidence of payment settlement, available stock, or successful legacy migration.

## Exact incompatibility

The existing production `admin.html` changes order/tracking status using a browser Firestore transaction. The new **unpublished** candidate admin page routes updates through `/admin/orders/status`; its server `lifecycle.change` refuses any order without a trusted `order_lifecycle` document. Proposed rules also deny direct client writes to orders/tracking. **Publishing the candidate without a legacy policy would prevent normal state changes for all 98 historical orders.** Existing browser tracking and customer cancellation flows also require separate compatibility verification. The **archived native Android V1 source** has Firestore SDK access, order collection references, transaction and write-call code (see read-only archive scan below); the installed Android app may contain later modifications and **is not certified**.

This failure-closed behavior protects stock and payment records; do **not** disable it by inventing ledger debits or treating client-authored payment fields as proof of payment.

## Required pre-release decisions and checks

1. Record a new **read-only** snapshot of legacy statuses/payment methods and client compatibility. Keep a backup/export under the owner's protected account, never in a public PR, chat, logs, or CI artifacts.
2. Choose an explicit **legacy-only management policy** approved by the store owner: e.g. a separately authenticated, narrowly scoped server endpoint for pre-cutover order status updates with an immutable audit log. It must reject stock/payment/refund changes when their trusted history is unavailable, and must preserve the previous cancellation-lock semantics.
3. Keep the new Stripe/COD lifecycle endpoint exclusively for orders with the trusted server ledger. Never infer a ledger from historical order totals, quantities, browser flags or Stripe-looking fields.
4. Exercise the old-admin workflow, old customer order/tracking/cancellation flow, existing Android release and new COD/Stripe flow against isolated non-production fixtures. Confirm no historical state, paid flag or stock is silently changed.
5. Reconcile the real admin identity **only for the previously configured storefront administrator**, with verified ownership and owner-controlled credentials. New Firebase Auth accounts or Google Cloud IAM Owner membership do not constitute an approved storefront-admin replacement.
6. Assign an operator and test alert delivery for pending/paid review and refund queues. Agree on a small staged cutover, rollback and the last explicit owner approval; preserve webhook reconciliation if checkout is disabled.

## Automated regression boundary

`stripe-release/release.test.mjs` includes a regression showing that an old order without a trusted lifecycle ledger cannot be prepared/cancelled by the new server API, and that the historical order/tracking/stock remain unchanged. This **does not** assert that all historical orders are already manageable: it is a deliberate fail-closed protection test.

## No-Go until verified

The existing site, Ziina workers, current Firebase Rules and all 98 historical orders must remain untouched. PR #2 stays Draft and unmerged. Stripe Live, production routes, rules and live-payment/refund checks require **separate, specific final approval** after a verified compatibility plan.

## Source-level client compatibility evidence (2026-10-30 review)

- Current `index.html` includes `saveOrderWithStock()` using `db.runTransaction()` for browser-side order/stock writes. It also includes `cancelOrderFromMyOrders()` and `requestOrderCancellation()` that depend on browser reads/writes for legacy proofs and order status.
- Current `admin.html` includes `updateOrderStatus()` with a browser Firestore transaction and `finalizeCustomerCancellation()` with another browser transaction. The latter recognizes legacy `customerEdit.cancelRequestedAt` and proof matching the order's edit token.
- Draft `stripe-release/build-storefront-candidate.mjs` replaces the new checkout/COD and ordinary admin status update routes with server endpoints, but does **not** prove that the existing 98 orders or the released Android client can complete all legacy tracking, cancellation and status workflows.
- Draft `stripe-live-candidate/firestore.rules` intentionally denies browser writes to `orders`, `tracking`, `order_edits` and `order_access`. This is incompatible with the current legacy browser workflow unless a separate, verified compatibility path is added first.

**Release acceptance requirement:** on isolated fixtures representing pre-cutover and new orders, verify customer order history, guest tracking, customer cancellation before processing, admin cancellation/processing status changes, no status resurrection after cancellation, no stock increments without trusted debits, refund review and existing Android behavior. Record owner-approved legacy handling before replacing the public site or publishing these Rules. This source-level audit did not run client/device acceptance tests and did not modify production records.

## Android archived source — actual read-only analysis (2026-10-30)

- Source already available in repo: `KandortyAndroid_v1_source.zip` (no user re-upload needed). GitHub Action [41092909870](https://github.com/arif123-del/kandorty/actions/runs/41092909870) **PASS**, no archive extraction to public output, no production writes or credentials.
- ZIP: 34 entries, 31 text files, **11 Kotlin**, 15 XML, Android manifest and Gradle project; not a Flutter app. Static scan detected native Firebase Authentication and Firestore SDK, `orders`/`tracking` collection access, transaction and write APIs, the `kandorty.online` host, and COD references. No native WebView, Stripe or Ziina reference detected by those patterns (absence of a pattern is not proof of absence of runtime behavior).
- **Safety consequence:** the unpublished Rules deny all client mutations to `orders`/`tracking`; any direct order/tracking/stock write paths in the released Android build would break. This ZIP only certifies the archived **V1 source inventory**, not which APK the owner currently has installed, or complete runtime compatibility. Do not publish the new Rules while Android release provenance and order/payment write migration remain unverified.
- Next gate: audit current installed version/source and run old-Android fixture tests against the proposed rules and safe server endpoints. Do not silently upgrade, route card payments, delete Android orders, or enable Live while blocked.

## Owner-installed app version and later CodeAssist source (2026-10-31)

- Owner's Samsung Android application settings screenshot shows **Kandorty installed app version 2.3.0**; installed from **CodeAssist**. This does **not** match the older GitHub archived V1 source versionName 1.1.0 / versionCode 2.
- Located a separate, previously supplied **CodeAssist V22 project ZIP** in the owner's ChatGPT Library, `KandortyAndroid_V22_ENGLISH_LOGO_CodeAssist(1).zip`, approximately 628 KB. Local read-only inspection of this archive found the Gradle metadata **versionName 3.2.0 / versionCode 22**, two Java files, an Android WebView wrapper that loads `kandorty.online`, and bundled `index-fast-start.html`. **It must not be called the installed app's confirmed source**: 3.2.0 differs from owner's installed 2.3.0, and a file label V22 does not authenticate the installed binary.
- The bundled HTML in that later archive still includes `saveOrderWithStock()`, a Firestore `runTransaction()`, and direct `orders` collection operations; the WebView wrapper enables JavaScript and DOM storage. Thus the proposed deny-client-order-writes Firestore Rules can also break **embedded WebView client** versions, not only native Kotlin clients. A new checkout adapter only on the live website would not automatically repair copies of the storefront HTML already embedded in released APKs.
- Before any site/rules cutover, inventory the actual installed 2.3.0 build's checkout/order paths, update the approved application source(s) to use server-authoritative COD/card/payment status, and test both direct native and embedded WebView legacy clients against isolated fixtures. Keep all old order records and Ziina unchanged. **No production orders, APK, Rules or Live systems were changed during this inspection.**

## Matching CodeAssist 2.3.0 project recovered from prior files (2026-10-31)

- Located an additional owner-provided Library archive: `KandortyAndroid_WEB_EXACT_v13_CENTER_DOT_FULLSCREEN_IMAGE.zip`. Its Gradle version is **versionName 2.3.0 / versionCode 13**, which **matches the owner-reported installed app version 2.3.0**. This is stronger provenance than the older V1 or V22 sources; an identical versionName alone still does not cryptographically prove this exact ZIP produced the installed APK.
- Read-only local analysis: 16 archive entries; 2 Java files, 1 embedded HTML, Android project metadata. `MainActivity` uses a WebView with JavaScript and DOM storage, loads **https://kandorty.online/**, and on page-load error falls back to local `file:///android_asset/index-fast-start.html`.
- **Critical compatibility finding:** the embedded HTML still contains `saveOrderWithStock()`, `submitCustomerOrder()`, direct Firestore `orders`/`tracking` collection accesses and a `db.runTransaction()` stock/order write path. Candidate production Rules deny direct client writes, so failure/legacy WebView fallbacks (and any other installed app version with bundled HTML) will break when those Rules publish. Routing only the current online site through the new Stripe/COD Worker is insufficient.
- Safe remediation plan: release a backwards-compatible updated app with the authoritative server adapter and no stale client-side order/stock fallback; preserve existing orders and Ziina; validate old installed build and new build through isolated browser/Android smoke tests before coordinated Rules/site rollout. **No installed APK, Firestore records, Rules, production site, Stripe Live or Ziina were changed by this source review.**
