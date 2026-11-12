# Stage 5 — owner-supplied Android 2.3.3 ZIP: static review and compatibility boundaries

**Date: 2026-11-12. Verdict: SOURCE STATIC CHECKS PASS; actual Android / hosted payment acceptance NOT VERIFIED. Production NO-GO.**

## Source archive provenance

The owner directly uploaded `KandortyAndroid_2.3.3_OFFLINE_LIVE_WATCHDOG_CodeAssist.zip` for Stage 5 compatibility review. It was inspected in the assistant's temporary private working container, **without committing the ZIP, customer data or source files to GitHub**. It is a **CodeAssist Android Java source ZIP**, **not** an APK. Source archive SHA-256:

`3778af581c84e8e2b41cc474df85e1ec96d9242ee66401c28697b54636bc430a`

The ZIP has **20 entries**, **239237 compressed bytes**, **265046 uncompressed bytes**, no CRC errors. Source identifies `applicationId online.kandorty.app`, `versionName 2.3.3`, `versionCode 16`, and `targetSdk/compileSdk 35`. This proves the *archive* metadata only; the actual installed Android 2.3.3 APK **has not been cryptographically matched, built, signed or executed** in this review.

## Read-only local source checks completed

**Seven of seven independent offline safety checks passed** against this user-uploaded ZIP and deliberately mutated synthetic copies:

1. Real owner ZIP integrity, exact declared version/package, cleartext disabled, main Activity not exported, expected WebView live storefront URL.
2. The bundled offline fallback is static, has no script/forms/Firebase/direct checkout and offers explicit HTTPS retry.
3. A regression that adds an order form to the offline page is rejected.
4. A regression that removes or changes the foreground 500 ms network watchdog is rejected.
5. Wrong app version is rejected.
6. Exporting MainActivity, introducing direct native Firebase order APIs, or including ZIP path traversal is rejected.

The real WebView Java source uses `https://kandorty.online/`; has validated network capability checks, network callbacks, foreground watchdog, stop-on-pause/destroy and explicit offline notice; no native Firebase SDK direct order/tracking writes were found. The existing **production website rendered inside the WebView DOES contain legacy client-side Firestore order logic**; absence of native Java Firestore calls does *not* make those website operations compatible with the proposed strict Rules.

## Payment / app behavior that cannot be certified from source

- The WebView renders the **currently published production website**, not the **unpublished new server-backed website/admin candidate**. Consequently its old checkout code is incompatible with strict candidate Rules, until a coordinated owner-approved website/backend migration.
- Actual **sandbox** COD, card (including 3D Secure), cancellation, authorized guest tracking and returning from hosted Stripe Checkout must be tested **on a device**, without making real production orders. The Android source does not establish native app-link/deep-link return handling. Payment UI inside WebView may need additional support or Chrome Custom Tabs depending on payment method; see [Google's WebView Google Pay documentation](https://developers.googleblog.com/en/adding-support-for-google-pay-within-android-webview/).
- The Java code applies a cosmetic JavaScript/CSS injection on page completion generally, not only on the Kandorty storefront. Assess this separately with a hosted Checkout sandbox; no private checkout UI should be altered without a tested and approved change.
- The historical native V1 app archive is **different** from this owner-supplied Java WebView 2.3.3 source. Old installed users who have not upgraded must also be considered.
- The temporary audit environment has Java but **no Android SDK, Gradle command or adb**, so **no APK compilation, signing, install or emulator payment run** was performed.

## Related Stage 5 evidence and exit gates

[Latest Stage 5 source/server and Rules CI](https://github.com/arif123-del/kandorty/actions/runs/43222199698): **213 passing code tests (0 failing, 1 skipped), 27/27 proposed Rules emulator tests**. Candidate COD/card preflight rejects unknown/untrusted inventory. The real product audit found 11 products, only one with valid managed `stock/totalStock`, 10 without; the owner must provide actual inventory or explicitly withhold these ten from checkout.

### Sign-off state

- **Owner-uploaded Android 2.3.3 ZIP static compatibility**: PASS (limited source checks)
- **Installed APK/source signature parity**: NOT CHECKED
- **New candidate website + live Android WebView isolated sandbox checkout/returns**: NOT CHECKED
- **Existing older installed Android compatibility with strict candidate Rules**: NO-GO
- **Ten unconfigured products' physical stock confirmation**: NOT PROVIDED
- **Full coordinated rollout, rollback and owner's separate final release authorization**: NOT APPROVED

**Keep Stage 5 issue #4 OPEN / PARTIAL.** Never publish the strict Firebase Rules, alter the public website/admin, overwrite the installed app, modify stock/order data, enable Stripe Live, merge PR #2 or touch Ziina based on this source-only check. All 99 original virtual test orders and encrypted backups remain unchanged.
