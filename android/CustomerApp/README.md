# Kandorty Customer Android prototype

This is a fresh customer-only Android WebView shell, NOT the existing ZIP-built Android test app or admin app.

It loads the same live website as the iPhone starter: `https://kandorty.online/`.

Build with JDK 17, Android SDK 35 and Gradle 8.9:
```sh
gradle --no-daemon :app:assembleDebug
```

Before release:
- Compare package ID with any already-published Android customer app; changing applicationId creates a different Play Store app.
- Test actual Android devices, Google login, media upload, cart, checkout (3D Secure), COD, order tracking, back navigation.
- Provide a brand icon and release signing; produce an AAB for Play Store.
- Keep admin and staging apps separate.
- Consult `docs/CROSS_PLATFORM_SYNC.md`.
