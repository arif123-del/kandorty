# Kandorty Admin Standalone Android — v1.1.0

A dedicated Android package `online.kandorty.admin`. It renders **https://kandorty.online/admin.html** inside its **own hardened Android WebView**, without opening Chrome, Chrome Custom Tabs or installing a browser.

## What works now

- Branded Kandorty splash screen / application icon.
- Secure WebView on HTTPS, main-document navigation restricted to `kandorty.online` and `www.kandorty.online`.
- Firebase web admin dashboard (email/password login; Google third-party OAuth can fail in embedded WebViews).
- Product photo and short-video selection using the Android system document picker.
- Native Android DownloadManager for first-party exports, no cookie leakage to third-party domains.
- In-app offline/retry error screen, back navigation, media playback, and persistent WebView storage.
- Native `FirebaseMessagingService` and an app-owned high-priority notification channel, which **requires** real Firebase Android app registration and authenticated server enrollment before messages will arrive.
- Android 13+ notification permission is requested **only once an Android Firebase config is supplied**.

## What is NOT active yet

The Firebase Android application `online.kandorty.admin` is now registered in project `kandorty-9378a`, and the dedicated CI workflow temporarily generates `google-services.json` during build. The config file is **not committed**. The APK can obtain an FCM registration token, but native background order delivery still depends on deploying the authenticated native-push backend and validating delivery to a real Android handset. It is not appropriate to mark the native notifications as enabled until the missing pieces are provisioned and verified:

1. In the existing Firebase project **kandorty-9378a** (not the Stripe TEST project), register Android app with package `online.kandorty.admin`. Obtain its genuine `google-services.json`.
2. Supply `app/google-services.json` to a secure Android build, keeping it out of the public repository. The `com.google.gms.google-services` plugin applies automatically when the file exists. The build flag `NATIVE_FCM_CONFIGURED` will become true.
3. Add a *separate*, authenticated Cloudflare Worker native device registration route. Verify an active, authorized Firebase administrator, tie tokens to their user identity, and expire/revoke devices after admin changes. Never register tokens from anonymous requests.
4. From the app's signed-in admin WebView, call that new route using a short-lived Firebase Auth ID token and the native FCM registration token. Store/rotate tokens securely on the server.
5. Send FCM HTTP v1 messages only from a trusted backend on verified order creation, without exposing customer data in push payloads. Keep COD and paid event deduplication.
6. Validate notification delivery while the app is foregrounded, in the background, and terminated, including Samsung notifications permissions/battery restrictions. Confirm tap opens orders.

Do not confuse the existing Chrome Web Push server `/admin/order-push` with FCM native device tokens: they are completely different formats and credentials.

## Security/production safety

- No service account private key, Stripe secret or Firebase credentials in the APK/repository.
- No source code or settings changes to live Stripe checkout, Firestore Rules, historical orders, Ziina, or Firebase Production.
- Existing storefront/website continues to work without this separate APK.
- App logs neither Auth ID tokens nor FCM device tokens.

This build is an independent **Android user interface**. It still requires the internet to operate the existing Kandorty administration website.

## Install

Build and install the APK. If an old APK with `online.kandorty.admin` was signed with a different debug key, Android may refuse an upgrade. In that case uninstall *only that separate admin APK*, then install 1.1.0. It does not remove your website's data or customer orders, but the embedded browser sign-in will be independent and must be completed again.


## Firebase-enabled build (v1.2.0)

- `feature/admin-fcm-config-20261120` builds the same independent WebView app with Firebase Messaging configuration for package `online.kandorty.admin`.
- `google-services.json` is generated only within GitHub Actions and removed after the job; the Android SDK client identifiers are public by design, unlike service-account private keys.
- The admin WebView requests a short-lived Firebase ID token from its signed-in user. The native app sends that token plus its FCM registration token by TLS to the protected `/admin/native-push` endpoint. It does not expose a JavaScript bridge to third-party pages.
- Server implementation and tests are developed separately on `feature/admin-fcm-server-20261120`. Do not claim live background notifications until that backend is deployed and a new order is received while the app is closed.
- This APK has only the standard debug signing key and requires uninstall/reinstall if Android refuses to upgrade an older debug-key build.
