# Kandorty Admin native Android multi-photo-picker patch

This patch is for the **Android Admin app only** (package `online.kandorty.admin`). It does not change `admin.html` or the public web storefront.

Place `AdminMultiPhotoPicker.java` in the existing admin Android app's Java source package. Do not overwrite `MainActivity` or remove Firebase/FCM notification logic.

In the **existing** `MainActivity`:
1. Add `private AdminMultiPhotoPicker adminMultiPhotoPicker;`.
2. In `onCreate`, add `adminMultiPhotoPicker = new AdminMultiPhotoPicker(this);`.
3. At the START of `WebChromeClient.onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params)`, before the old callback is stored, add:
   ```java
   if (adminMultiPhotoPicker.openIfMultipleImages(callback, params)) return true;
   ```
   Keep the original picker implementation for single-image and video fields.
4. At the START of `MainActivity.onActivityResult`, before the existing handler:
   ```java
   if (adminMultiPhotoPicker != null &&
       adminMultiPhotoPicker.onActivityResult(requestCode, resultCode, data)) return;
   ```
5. At the beginning of `onDestroy`, call `adminMultiPhotoPicker.cancelPending();`.

For Kotlin MainActivity, use the same Java helper and translate the three integration statements. Make sure the application's Android compile SDK supports API 33 (or newer).

On Android 13+ the multi-image picker remains in selection mode until the user taps **Add/Done** (up to 8 product pictures, matching the admin form); on older devices DocumentsUI supports multiple selections. All URI results are returned together to WebView. No new storage permissions required.

**Deployment warning**: This is Java source, not a directly installable APK. The current admin APK's complete source and its original signing key are not part of this GitHub repository; use the existing native app project and signing setup to produce an upgraded APK. Never replace the app with a newly signed different-key APK without considering local app data and upgrade compatibility.
