# Kandorty: one storefront for Android, iPhone and web

## Binding rule (must not regress)
The **public storefront at https://kandorty.online/** is the single source for customer-facing UI, catalog, promotions, inventory and cart/order flows. Both production mobile customer shells must load that exact origin. Keep the admin panel private and separate. Do not put passwords, API secrets, staging access tokens or live Stripe secret keys in either shell.

| Change | How customers receive it |
| --- | --- |
| Prices, photos, descriptions, stock, cart, checkout UI, discounts, Arabic copy, site layout | Publish once to the shared website/backend; both installed apps load updated content |
| Firestore data / server workers | Deploy once to the shared production backend; test both mobile platforms |
| App icon, splash, OS permission, notifications, camera integration, native navigation, OS payment/deep-link handling | Change Android and iOS platform code separately; distribute new app versions through Google Play and Apple App Store |
| Admin workflow | Separate admin surface, not included in the public app |

## Files in this branch
- iPhone customer starter: `ios/KandortyIOS` (SwiftUI, WKWebView)
- Android customer starter: `android/CustomerApp` (Android WebView, Java)
- Shared contract: `shared/mobile-app-contract.json`
- Drift check: `node --test tests/cross-platform-storefront.cjs`
- Current older Android workflow builds a ZIP-based debug app, which may use a staging URL. This new Android customer starter is **not** a replacement for an installed APK until it has been built, tested, signed and released.

## Safe change process
1. Make one website/backend change in the shared Kandorty repository.
2. Run existing storefront and payment tests on a non-production environment first.
3. Test the same flow manually on a real Android phone and a real iPhone (browser and app shells), especially card checkout/3DS, COD, login, cart sessions, order tracking, photos, Arabic text direction and swiping.
4. Publish the web/backend change once. The two shells should show the same production functionality when they load the new site; still watch caching, device/browser and OS differences.
5. If native code is involved, update and test the two native apps; new Play Store/App Store releases may be necessary.

## Limitations
- Sharing a URL does **not** make all native device behavior identical. Browser engines and permissions differ.
- Both starters are prototypes: no Xcode signed IPA, no Play Store AAB, no Apple/Google approval. Do not promise store acceptance, which requires more than a basic WebView shell.
- The iOS and Android starter sources must be compiled and tested before calling them production-ready.
- Production release must never silently switch to a test Firebase or release-test Worker.
- iOS/Android 3DS redirects, file selection, payment completion, deep links and push notifications require platform-level tests.
- Existing Android customer app may point to a test worker. Inspect and migrate the **production customer APK** explicitly, without changing the admin app.
