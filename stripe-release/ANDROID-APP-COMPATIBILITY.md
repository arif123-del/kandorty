# Kandorty Android compatibility — WebView 2.3.0, native V1, and Stripe/COD release blockers

**DRAFT / NO-GO: no APK was installed or published, no production Firestore Rules/site/Stripe/Ziina changes, and no orders were altered.** A source-code review is not device acceptance.

## Established source provenance

- The owner showed Samsung app info with Kandorty version **2.3.0** installed.
- Owner's already-saved `KandortyAndroid_WEB_EXACT_v13_CENTER_DOT_FULLSCREEN_IMAGE.zip` has Gradle `applicationId=online.kandorty.app`, `versionName=2.3.0`, `versionCode=13` and Java WebView Activity with normal initial URL **`https://kandorty.online/`**.
- The original 2.3.0 WebView `onReceivedError` on a main-frame failure loads **`file:///android_asset/index-fast-start.html`**. That bundled file contains an older full storefront with direct Firestore/transaction order paths, not merely an offline status screen.
- Earlier GitHub-committed `KandortyAndroid_v1_source.zip` is a *different* older native Kotlin app (archive version 1.1.0, code 2). [CI 41094489132](https://github.com/arif123-del/kandorty/actions/runs/41094489132) found Kotlin `orders`/`tracking` collection references, transactions, and write APIs. **Do not use the V1 source as evidence for the installed 2.3.0 implementation.**
- Another saved `KandortyAndroid_V22_ENGLISH_LOGO_CodeAssist(1).zip` advertises version 3.2.0 and also contains a WebView and the bundled fallback. It is NOT evidence that 3.2.0 is installed.

## Owner-reported Android 2.3.3 foreground disconnect check — 2026-11-10

After following the 2.3.3 on-device test instructions, the owner replied
**"سم شو" (it worked)**. This is owner-attested success for the foreground
network-loss/offline-notice check after the 500ms watchdog source change.
This is NOT independent access to the device, APK signing verification,
a quantified latency measurement, or proof of all Android compatibility.
The next acceptance check is reconnection via an explicit retry and
repeated offline/online transitions without production checkout. Still
no authorization to change Firestore Rules, Stripe Live, Ziina or orders.

## Owner's in-session network-loss follow-up and 2.3.3 source-only mitigation — 2026-11-10

On a Samsung handset with 2.3.2, the owner confirmed: (a) an offline
cold start shows the correct Arabic offline notice, (b) after reconnect,
the public store loads, but (c) switching Wi-Fi and mobile data OFF while
the online store remains open **does not show the offline notice immediately**.
The owner has not confirmed whether the notice appeared later, so this is
a *latency/behavior observation*, not proof it never appears.

The 2.3.2 Activity relies on Android network callbacks, which can arrive
before `getActiveNetwork()` reflects the updated state. To mitigate that
race, a separate **2.3.3 CodeAssist source ZIP** was prepared in the
assistant's artifact workspace (not committed as binary here): a
foreground-only `Handler(Looper.getMainLooper())` watchdog rechecks
Android's validated internet capability every 500ms, starts on
`onResume`, and removes callbacks on `onPause` and `onDestroy`.
Existing network callbacks, the static offline page, explicit online
retry, storefront URL, branding, and safe offline navigation checks
remain unchanged. Android can still delay the underlying capability
state update; zero-latency transition is NOT guaranteed.

The only changed original files are `MainActivity.java` and
`app/build.gradle.kts` (versionName 2.3.3; versionCode 16); one
Arabic/Pashto test guide was added. ZIP integrity, XML parse, version,
permissions, lifecycle anchors, and exact-two-file diff passed static
checks. **No APK was built/signed/installed/tested for 2.3.3.**
Do not activate live Firebase Rules or Stripe Live from this evidence.
Owner still must test foreground disconnect, repeat disconnect/reconnect,
and legacy/order handling without creating production orders.

## Owner-reported Android 2.3.2 on-device follow-up (2026-11-10)

The owner confirmed on their Samsung handset that the 2.3.2 offline
experience displays **"غير متصل بالإنترنت"** rather than a stale storefront,
and that enabling network again and using the return/retry action
successfully opens the Kandorty website. This is **owner-attested
functional acceptance** for offline launch and reconnect; it is not a
signed artifact verification or comprehensive app security certification.

Still needed: **network-loss during an already-open online WebView session**,
confirm offline navigation/checkout unavailable, test repeated disconnect
and reconnect without duplicate orders, verify package/version/signature
and practical legacy order/tracking compatibility in a safe nonproduction
environment. Do not activate production Firestore Rules/Stripe Live or
merge PR #2 on the strength of these two checks alone.

## Owner's 2.3.1 real-device OFFLINE failure and local 2.3.2 source fix — 2026-11-10

The owner reported Android 2.3.1 installed via CodeAssist. Their real-device
offline test **FAILED**: with both Wi-Fi and mobile network unavailable, the
application displayed a cached storefront page with images missing, **not**
the safe static Arabic offline notice. Therefore the 2.3.1 APK **must not**
be treated as compatible or safe for a stricter Firestore Rules migration.

Root cause in the v13/2.3.1 `MainActivity.java` review source: the WebView
only loads the static offline fallback after a **main-frame** network error.
A cached main HTML response can load with network-dependent images failing,
so the main-frame error callback is never triggered. This is a failed
acceptance test, not evidence of a failed ZIP import.

A separate **2.3.2 CodeAssist source-only ZIP** was created locally,
derived byte-for-byte from the owner's 2.3.1 source except for:
- `MainActivity.java`: checks Android active default network for
  `NET_CAPABILITY_INTERNET` **and** `NET_CAPABILITY_VALIDATED` at launch,
  onResume and network capability/loss callbacks; redirects cached or
  restored HTML to the static offline page while offline; URL overrides
  also block offline navigations. On reconnect, the user must explicitly
  tap the safe `إعادة فتح المتجر` HTTPS link; no automatic checkout replay.
- `app/build.gradle.kts`: `versionName=2.3.2`, `versionCode=15`.
- A bilingual Arabic/Pashto owner build-and-test guide was added.

Source ZIP integrity, manifest parsing, capability permission presence,
version and exact two-existing-file diff were validated locally.
The source ZIP is NOT committed here, not a built APK, not signed, installed,
or tested on the actual device. CodeAssist import, APK build, offline-on-launch,
connection-loss-during-session and explicit-retry tests are still needed.
Do not infer production compatibility until those owner tests succeed.
Never delete the existing installed app to work around a signature error.
No live Firebase Rules, Stripe, COD, Ziina, order or website changes were made.

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

## Latest owner Library source comparison (2026-11-10, static only)

Read-only binary ZIP comparison of the **owner-provided** `KandortyAndroid_WEB_EXACT_v13_CENTER_DOT_FULLSCREEN_IMAGE.zip` (version 2.3.0 source) and `KandortyAndroid_2.3.1_CODEASSIST_READY.zip` (version 2.3.1 source) found all 16 original non-directory project files preserved. The **only modified existing file contents** were `app/build.gradle.kts` (version bump) and `app/src/main/assets/index-fast-start.html` (offline safety); two build/review guides were added.

The original v13 embedded HTML contains browser `<script>` code and direct Firebase order/stock transaction logic; the 2.3.1 offline fallback is a **static Arabic connection-help page** with no script tag, Firestore, checkout or order submission. The Java WebView wrapper and `https://kandorty.online/` destination are otherwise unchanged. This is **source-level evidence only**: 2.3.1 has NOT been compiled, signed, installed or exercised on the owner's phone, and 2.3.0 or other distributed APKs remain incompatible with proposed deny-client-writes Rules. Leave existing Android and production Rules unchanged.

## Required release acceptance (NOT performed)

1. Build the 2.3.1 source in Android Studio/CodeAssist; confirm proper app signature, versionName/code, splash/login/WebView and that only the app's own valid package is updated. No test orders in production.
2. Test phone with network off: static offline screen, **no payment/order controls**; network back: link returns to HTTPS store. Test failed navigations/payment returns safely without duplicate attempts.
3. Test a non-production candidate storefront and backend for both new COD and Stripe Sandbox using signed receipts, duplicate webhook/stock protection, cancel/refund and guest order status. Verify Android routing and browser flows.
4. Verify historical 98 orders' legacy admin, guest tracking and cancellation compatibility using isolated fixtures, and test all still-supported older Android APK behavior.
5. Test alert delivery and signed webhook with owner-verified secrets in a safe environment; receive explicit independent approval before any Live site/rules/Stripe activation.

**Status: 2.3.1 SOURCE REVIEW PREPARED, NOT SHIPPED; PRODUCTION NO-GO.**

## CodeAssist import-ready source artifact (2026-10-31)

- Prepared separate conversation artifact `KandortyAndroid_2.3.1_CODEASSIST_READY.zip`, derived from already-confirmed v13 2.3.0, with a bilingual Pashto/Arabic import/build/read-only testing guide. All 16 preexisting V13 project files are preserved; **only** `app/build.gradle.kts` and `app/src/main/assets/index-fast-start.html` differ from original, plus a separate guide and review note. ZIP integrity, XML parsing, application ID and version, and static fallback absence of scripts, Firebase and order forms passed. Source PNGs, Java WebView/splash Activities, and online store URL are retained byte-for-byte.
- The assistant environment lacks Android SDK/Gradle and cannot remotely control the user's on-device CodeAssist projects; **no actual APK was compiled or signed** and no Android install/real payment was tested. The next user-visible step is extracting/importing the ZIP in CodeAssist as a **separate** project, building a debug APK, and inspecting results before any installation. Do not delete the installed app to work around signature mismatches.
- This review ZIP is a chat artifact, **not** a commit to this GitHub repository and not an app-store/production release. Firebase Rules, 98 historical orders, Ziina, public site and Stripe Live remain unchanged.
