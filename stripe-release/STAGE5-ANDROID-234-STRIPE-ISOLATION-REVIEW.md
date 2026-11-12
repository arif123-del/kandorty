# Kandorty Android Stage 5 — owner ZIP 2.3.4 payment-page isolation review (not deployed)

**2026-11-12 — Source-only review candidate, never a signed or installed APK.** The original user-supplied 2.3.3 Java WebView source ZIP remains unchanged and private.

## Reproducible provenance

- Owner-uploaded original ZIP: `KandortyAndroid_2.3.3_OFFLINE_LIVE_WATCHDOG_CodeAssist.zip`, SHA-256 `3778af581c84e8e2b41cc474df85e1ec96d9242ee66401c28697b54636bc430a`.
- New local assistant-generated source ZIP (provided **to the owner in the conversation only**, **not** checked into GitHub): `KandortyAndroid_2.3.4_STRIPE_ISOLATED_REVIEW_CodeAssist.zip`, SHA-256 `695baed1ad38564d18221a063d22d210a1884976e5faf6a00888ea2bdbe15656`.
- ZIP `testzip()` PASS and exhaustive original entry byte comparison: exactly **two existing files differ** — `MainActivity.java` and `app/build.gradle.kts`; one short private review guide is new. 21 files total. Source version 2.3.4 / code 17; original version 2.3.3 / code 16.
- Security intent: `onPageFinished` in `MainActivity.java` invokes the *cosmetic* CSS/JavaScript `injectAppUiFixes(view)` only when `isTrustedStorePage(url)` validates a parsed HTTPS URL with exact host `kandorty.online` or `www.kandorty.online` **and default/443 port**. No `endsWith` or deceptive suffix accepted. This prevents the app from injecting storefront scripts into `checkout.stripe.com`, bank 3DS challenges, or other third-party pages. **No payment handling is added**.
- Offline fallback, 500 ms validated-internet watchdog, regular HTTP(S) WebView navigation, original store URL, manifest, splash, icons and resources preserved. No production code changes and no scripts committed.

## Source-only static acceptance

Local validation passed: archive CRC and contents, strict two-file bytewise diff, exact trusted host HTTPS/port scope and single injection caller, version bump, unchanged 500 ms watchdog and safe offline navigation, and correct storefront URL.

**Not tested:** Android Java/Gradle compilation, APK signing/hash parity, emulator execution, installed device, Stripe-hosted test Checkout/3DS redirect and same-WebView receipt return, Google Pay/payment-method availability, real guest COD/tracking/cancellation, or old native app compatibility. Android SDK/Gradle/adb were not available in the local audit container. Such tests require a separately built/signed app and test environment; the source review cannot prove end-to-end payment success.

Official Android Google Pay WebView integration requires explicit Payment Request API enablement and eligibility/publishing; no such integration is claimed or silently enabled in this review. [Google documentation](https://developers.google.com/pay/api/android/guides/recipes/using-android-webview). Hosted checkout/return URL behavior must be tested separately, with the same WebView receipt context retained.

## Release boundary

[Stage 5 issue #4](https://github.com/arif123-del/kandorty/issues/4) remains **OPEN / NO-GO**. In particular, (1) the production WebView still loads the **old published site** and its legacy Firestore client writes, while the server-backed reviewed website is **unpublished**; (2) owner says the ten missing-stock entries are not genuine saleable inventory; the new candidate blocks them until valid stock is explicitly recorded; (3) installed APK provenance and sandbox paid return remain unverified; (4) coordinated strict Firebase Rules, app, backend, site migration and rollback have no final approval. No live payment, stock mutation, real order, rules publication, deployed site update or PR merge has occurred.
