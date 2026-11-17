# Kandorty Android — fixed WebView source (2.3.6)

- App package: `online.kandorty.app`
- App name: `Kandorty`
- Storefront: `https://kandorty.online/` (PUBLIC WEBSITE, NOT a Stripe sandbox endpoint)
- Correct Java path: `app/src/main/java/online/kandorty/app/MainActivity.java`
- Splash: original uploaded animation/artwork preserved.
- Safe offline/error fallback: `app/src/main/assets/index-fast-start.html`
- The loading view is shown while the website starts. No change to Firebase, Stripe, Ziina, or hosted website.
- This is a CodeAssist source project, **not** an APK. Requires importing/building on the device.

This standard package uses the original ID. An existing APK may have a different signing certificate; NEVER uninstall the existing app just to make the new one install.

IMPORTANT: Opening the public website exposes whatever payment and ordering UI is already live there. Do not run a real payment as a test. Use read-only browsing for validation.
