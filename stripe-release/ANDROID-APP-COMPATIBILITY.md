# Kandorty Android compatibility — WebView 2.3.0, native V1, and Stripe/COD release blockers

**DRAFT / NO-GO: no APK was installed or published, no production Firestore Rules/site/Stripe/Ziina changes, and no orders were altered.** A source-code review is not device acceptance.

## Established source provenance

- The owner showed Samsung app info with Kandorty version **2.3.0** installed.
- Owner's already-saved `KandortyAndroid_WEB_EXACT_v13_CENTER_DOT_FULLSCREEN_IMAGE.zip` has Gradle `applicationId=online.kandorty.app`, `versionName=2.3.0`, `versionCode=13` and Java WebView Activity with normal initial URL **`https://kandorty.online/`**.
- The original 2.3.0 WebView `onReceivedError` on a main-frame failure loads **`file:///android_asset/index-fast-start.html`**. That bundled file contains an older full storefront with direct Firestore/transaction order paths, not merely an offline status screen.
- Earlier GitHub-committed `KandortyAndroid_v1_source.zip` is a *different* older native Kotlin app (archive version 1.1.0, code 2). [CI 41094489132](https://github.com/arif123-del/kandorty/actions/runs/41094489132) found Kotlin `orders`/`tracking` collection references, transactions, and write APIs. **Do not use the V1 source as evidence for the installed 2.3.0 implementation.**
- Another saved `KandortyAndroid_V22_ENGLISH_LOGO_CodeAssist(1).zip` advertises version 3.2.0 and also contains a WebView and the bundled fallback. It is NOT evidence that 3.2.0 is installed.

## Draft-only 2.3.1 safe-offline source candidate

A separate review ZIP `KandortyAndroid_2.3.1_SAFE_OFFLINE_REVIEW.zip` was generated from the owner's saved v13 2.3.0 source in the assistant's working container, not uploaded/merged to this repo. It has exactly these two modified original files:

1. `KandortyAndroid/app/src/main/assets/index-fast-start.html`: replaced the full legacy bundled commerce page with a **static Arabic offline notice and retry link** to the HTTPS public store. No `<script>`, checkout form, Firebase API, card form, customer data, network credentials, or Firestore writes are present in the fallback. This prevents the fallback from accepting orders while the app is offline.
2. `KandortyAndroid/app/build.gradle.kts`: incremented versionName **2.3.1**, versionCode **14**.

Original Java Activities, splash UI, branding/icons, Android Manifest, online WebView URL, and all other existing source files remain byte-for-byte unchanged. The candidate ZIP passed ZIP-integrity and structural checks, including exact two-file changes and read-only offline HTML indicators. A short review README was added. **No APK build, signing, emulator test, Samsung device test, release or installation has occurred.** Therefore do not claim the installed 2.3.0 app is fixed.

## Why this improves future updates but does not permit Live cutover

- An online WebView reads the currently published website. After a separately approved **compatible** server-backed storefront cutover, the WebView can reuse the website's checkout UI. This does **not** remove the need to test Stripe redirects, payment callbacks, Android file chooser, return-to-app, cart, guest receipts, COD and cancellation on real devices.
- The *currently installed* APK still contains the old offline fallback until the user builds/installs an updated release. Changing source files in an archive has no effect on installed APKs.
- Even when the offline fallback is replaced, other Android versions and previously distributed APKs may persist. **Do not publish the candidate Firestore Rules** while any supported browser, native client, offline HTML or Android APK still writes `orders`, `tracking`, `products` stock or payment flags directly.
- The 98 historical orders lack trusted `order_lifecycle` ledgers. The new admin API intentionally refuses to change them. A separate authenticated, narrowly scoped legacy-only status workflow must be reviewed, isolated-test validated and approved. Never fabricate trusted stock history or refund assertions from client-controlled fields.
- Existing Ziina flows and legacy Stripe Workers remain unchanged until the operator approves exact compatibility and migration.

## Required release acceptance (NOT performed)

1. Build the 2.3.1 source in Android Studio/CodeAssist; confirm proper app signature, versionName/code, splash/login/WebView and that only the app's own valid package is updated. No test orders in production.
2. Test phone with network off: static offline screen, **no payment/order controls**; network back: link returns to HTTPS store. Test failed navigations/payment returns safely without duplicate attempts.
3. Test a non-production candidate storefront and backend for both new COD and Stripe Sandbox using signed receipts, duplicate webhook/stock protection, cancel/refund and guest order status. Verify Android routing and browser flows.
4. Verify historical 98 orders' legacy admin, guest tracking and cancellation compatibility using isolated fixtures, and test all still-supported older Android APK behavior.
5. Test alert delivery and signed webhook with owner-verified secrets in a safe environment; receive explicit independent approval before any Live site/rules/Stripe activation.

**Status: 2.3.1 SOURCE REVIEW PREPARED, NOT SHIPPED; PRODUCTION NO-GO.**
