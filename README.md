# Kandorty Admin Android — v1.0.1 browser notification fix

This separate Android admin launcher opens **https://kandorty.online/admin.html** in the normal installed Google Chrome browser, not in an Android Custom Tab.

## Why this matters

Kandorty's current background notifications use the website's Web Push service worker and a subscription that is registered **inside Chrome**. A Custom Tab cannot be relied on to complete notification permission requests. The user reported background alerts work in full Chrome but failed when the administration screen opened in the old launcher.

**Result:** The revised launcher uses the same Chrome site permission, session and push subscription as the already-working browser. Chrome, not this Android package, will display the notification. Tapping it opens the admin orders URL.

**Limit:** This is not an independent Firebase Cloud Messaging (FCM) push implementation and cannot make notifications show as sent by `إدارة كندورتي` rather than Chrome. To implement truly native app-owned notifications later, register the Android package in Firebase, add a signed-in device-token enrollment endpoint and FCM server delivery, then test with the app terminated. Do not claim that native push already works.

## Installation and testing

1. Open the ordinary Chrome browser, sign in at `https://kandorty.online/admin.html`, activate `تفعيل إشعارات الطلبات في الخلفية`, and grant Chrome notification permission.
2. Open the Kandorty Admin launcher; it now opens that same normal Chrome profile.
3. Submit a new authorized test order and verify the system notification arrives while Chrome is closed/backgrounded. Check the notification sound and tap-through.
4. If an existing APK refuses to update, its debug signing key may differ from this GitHub build. Avoid clearing Chrome's site data; reinstalling the admin launcher alone does not remove Chrome's subscription.

The branch does **not** modify the production website, customer orders, Firebase Rules, Cloudflare Worker, Stripe Live, or Ziina. The Android APK and push delivery are **not** device-verified until the workflow and real-device test succeed.
