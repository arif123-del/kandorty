# Kandorty — seven-stage release status (updated 2026-11-12)

**This is a preparation checkpoint, not an authorization to activate Live payments.**
GitHub PR #2 remains draft/unmerged. Do not change production Firebase Rules,
published storefront/admin, existing Workers, Stripe Live, Ziina or 99 current legacy orders
without the owner's separate specific final release approval.

| # | Stage | Status | Verified scope and remaining gate |
|---|---|---|---|
| 1 | Detached Cloudflare Worker and isolated Sandbox | **Completed (preparation)** | Disabled production shell and isolated test Worker prepared; Sandbox provider/payment/refund checks passed. This does not mean Live is deployed. |
| 2 | Stripe Live webhook and secrets | **Partial** | Dedicated six-event Live webhook exists but remains **disabled**; Cloudflare required secret **names** were seen but value correctness, signing and provider delivery are unverified. |
| 3 | Firebase administrator identity/security preflight | **Completed (preflight only)** | Owner-attested fresh Firebase login and server-admin membership/claim verifier passed read-only acceptance on 2026-10-30. Production release Worker admin endpoint still needs coordinated acceptance. |
| 4 | Owner-created legacy test-order archive & Firestore preservation | **Completed (limited preservation preparation); production NO-GO** | The owner confirms all **99** old orders were self-created virtual tests, including 18 previously flagged COD cases. Both encrypted Firestore backups were created; the expanded backup covers **291 documents / 11 collection paths / 99 orders / 99 tracking** and was downloaded to phone. Owner reported private fake-emulator recovery PASS; final private output not independently inspected. [Archive policy 14/14 synthetic PASS](https://github.com/arif123-del/kandorty/actions/runs/43218536377) and [release tests 206 PASS, 0 FAIL](https://github.com/arif123-del/kandorty/actions/runs/43218536806) on draft branch. **No production archive/deletion or stock write.** [Limited archival acceptance](STAGE4-VIRTUAL-TEST-ORDERS-ACCEPTANCE.md). Real stock/Android/browser/Rules cutover -> [Stage 5 #4](https://github.com/arif123-del/kandorty/issues/4). Non-Firestore complete recovery -> [#5](https://github.com/arif123-del/kandorty/issues/5). Stripe Live and full production release remain blocked. |
| 5 | Website / Android / Firebase Rules compatibility | **Partial / NO-GO** | Owner-attested Android **2.3.4** real-device tests PASS: offline notice, reconnect/product images, add-to-cart, correct price, checkout shows COD/card and AED 25 shipping **once**. Unpublished candidate website/admin tests now fail closed for legacy unknown-receipt cancellation. Latest [no-deploy CI 213 pass / 0 fail / 1 skip + Rules emulator PASS](https://github.com/arif123-del/kandorty/actions/runs/43252346737). **Sandbox end-to-end device 3DS, new secure checkout, legacy-app compatibility and coordinated Rules/site cutover remain unverified**; production unchanged. |
| 6 | Resend email and operational monitoring | **Partial** | Resend domain and manual test email: owner-confirmed delivered to designated Gmail inbox on 2026-11-09. Deduplicated alert scheduler was tested and activated on the isolated TEST Worker only; a Firestore operator alert record shows **provider-accepted at 2026-11-09T20:15:34.421Z**. Three operator settings were restored as TEST Worker secrets from its owner-configured version history and the Wrangler TEST config now preserves dashboard variables. Automatic Resend **provider acceptance** has been independently seen for two TEST alert windows; recipient-inbox confirmation for the *automatic* message, Cloudflare scheduled execution alerts, Stripe delivery/dispute alerts and backup escalation remain. Cloudflare's connected CI token does **not** have permission to read notification policies, as confirmed by a non-mutating read attempt; do not claim external failure alerts are configured. The existing Resend API key is **Sending Access**, so it cannot be used to GET sent email history; the optional delivery-status reader requires a separate, owner-approved read-capable key and is OFF by default. |
| 7 | Final coordinated production activation | **Not started — approval required** | Only after stages 2, 4, 5 and 6 pass: owner must specifically authorize site/rules/backend and Live webhook activation and limited real payment/refund validation. Generic permission to finish preparation is **not** this authorization. |

## 2026-11-12 latest TEST hosted-browser rerun — FAIL; static and Rules PASS

[Latest draft-only readiness CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43254755057), including code tests and proposed Rules emulator. The latest [isolated test-only hosted-browser payment run FAILED](https://github.com/arif123-del/kandorty/actions/runs/43254755041) at the second checkout due to Stripe email input not found in the Playwright time window, after TEST COD/cancel/stock checks passed. Recent retries also identified Stripe hosted-input selector and ZIP/phone validation instability. Earlier [full genuine Sandbox hosted checkout/webhook/refund acceptance PASS](https://github.com/arif123-del/kandorty/actions/runs/43252173165) is historical evidence, not proof of consistently passing browser automation. New candidate guest browser/Android 3DS acceptance and old-client migration still blocked. No production changes. Stage 5 **PARTIAL / NO-GO**.

## 2026-11-12 candidate legacy customer cancellation fail-closed — PASS

The unpublished generated storefront now verifies the order has a locally saved, **server-issued receipt** before attempting cancellation through its server API. A historical/unknown order without a matching receipt is **read-only in this candidate** and shows contact-store guidance; it does **not** fall through to legacy direct client Firestore cancellation/restock writes. The published `index.html` is not modified. The candidate regression test and [latest GitHub no-deploy verification](https://github.com/arif123-del/kandorty/actions/runs/43252346737) passed: **213 code passing / 0 failing / 1 skipped**, plus proposed Firestore Rules emulator checks. Separately, the real TEST hosted-payment workflow is not evidence of the Android 2.3.4 browser flow until its isolated completion and device return are verified. This document is **pre-release evidence only**; Stage 5 **PARTIAL / NO-GO**.

## 2026-11-12 owner Android 2.3.4 checkout arithmetic — PASS (UI only)

Owner separately confirms displayed total is **subtotal + AED 25 exactly once** (not +50), on Android 2.3.4. This is owner-attested visual arithmetic PASS only; no transaction, sandbox or live payment, stock debit, Firestore order, 3DS redirect or end-to-end COD result was tested. Device UI and offline/reconnect smoke checks are now owner-passed. Stage 5 still **PARTIAL / NO-GO**, pending isolated server-side sandbox and end-to-end evidence, no production change.

## 2026-11-12 owner Android 2.3.4 checkout visual display — PASS

The owner confirms Android 2.3.4 shows **AED 25 delivery** and both **COD / card** options on the checkout form. **UI-only owner-attested PASS**. No order submitted, no transaction initiated, no stock or data mutated. Need visual total arithmetic (delivery charged exactly once) and independent sandbox order/payment/auth checks before any Stage 5 GO. Production website, Stripe Live, Firebase Rules and Ziina untouched.

## 2026-11-12 owner Android 2.3.4 cart and price display — PASS

Owner confirmed successful **add-to-cart**, correct **cart display** and **displayed product price** in installed Android 2.3.4. This is an owner-attested UI-only PASS, after offline and reconnect test success, not a test of actual COD/card/3DS transactions. Next: visual checkout subtotal, delivery AED 25 and payment options without submitting. No original order, stock, published site, Firebase Rules, Stripe Live or Ziina changes. Stage 5 NO-GO.

## 2026-11-12 owner Android 2.3.4 on-device network loss and storefront recovery — PASS

The owner reports **Kandorty 2.3.4 installed on their Samsung** and independently answered **YES** to both safe checks: (1) disabling all internet while app open shows the Arabic offline notice `غير متصل بالإنترنت`, (2) re-enabling internet plus `إعادة فتح المتجر` restores the Kandorty website and its product images. These are **owner-attested actual-device PASS** for network loss and recovery. They do not certify installed APK signature, direct order writes, new server checkout, Stripe 3DS return or post-payment/guest tracking. Next owner-safe check is cart display **without submitting any order/payment**. Existing live site, Firebase Rules, products and Stripe Live untouched. Stage 5 NO-GO.

## 2026-11-12 Android 2.3.4 source-only Stripe/3DS origin isolation reviewed

Created a private, owner-provided **2.3.4 CodeAssist Android source ZIP** from the owner's actual 2.3.3 ZIP, no production deployment and no binary committed to GitHub. The review modifies exactly MainActivity.java (cosmetic JS/CSS injected **only** into the exact HTTPS `kandorty.online` or `www.kandorty.online` origin on standard port, excluding Stripe/3DS payment origins) and Gradle version metadata (2.3.4 / code 17), plus one review note. ZIP CRC/inventory, exact two-file diff, checkout-origin isolation, and offline watchdog source checks PASS. Candidate SHA-256: `695baed1ad38564d18221a063d22d210a1884976e5faf6a00888ea2bdbe15656`. [Private source review record](STAGE5-ANDROID-234-STRIPE-ISOLATION-REVIEW.md).

**Still NO-GO:** not built/signed/installed; no actual device Sandbox Stripe 3DS/guest receipt return, COD/cancellation or old client/strict Rules acceptance. User's 2.3.3 original and production website remain untouched.

## 2026-11-12 owner clarification: ten missing-stock records are not real saleable inventory

The owner answered that the ten previously counted product inventory entries are **not real saleable inventory**. Treat the absent stock as *test/not-for-genuine-checkout*, not as a number to reconstruct or as proof of infinite supply; **no physical inventory count is demanded for those unavailable test entries**. The existing draft COD and card prepayment guard already rejects orders where stock/totalStock is not documented; leave those fields, all live products, website and Rules unchanged. This is owner-reported context, not an independently verified per-SKU saleability audit. Actual saleable products, if any, still require verified stock before release. Real Android 2.3.3 sandbox card/3DS return and guest checkout compatibility, installed older clients and coordinated backend/site/Rules acceptance remain NO-GO. PR #2 stays draft.

## 2026-11-12 owner-uploaded Android 2.3.3 source ZIP: offline and security static audit PASS

The owner submitted the actual `KandortyAndroid_2.3.3_OFFLINE_LIVE_WATCHDOG_CodeAssist.zip` source archive to this conversation. The assistant directly verified its ZIP integrity and source metadata: **online.kandorty.app / 2.3.3 / versionCode 16**, validated network and 500ms foreground watchdog, static read-only offline notice, HTTPS retry, no native Firebase order writes, no cleartext and unexported MainActivity. **Seven local safety tests PASSED**, including unsafe synthetic regression ZIPs. The source archive SHA-256 is `3778af581c84e8e2b41cc474df85e1ec96d9242ee66401c28697b54636bc430a`. Details in [Stage 5 Android ZIP audit](STAGE5-ANDROID-2.3.3-SOURCE-AUDIT.md). **User binary was not committed to GitHub.**

**Do not equate a source ZIP with the installed APK or a finished checkout migration.** No Android SDK/Gradle/adb was available to build, sign, install or run the APK; 2.3.3 production WebView loads *the current legacy website*, not the unpublished new COD/card web review candidate. In-app payment, 3D Secure return, guest receipts/cancel/status, real device and old native client compatibility remain unverified. Physical `stock`/`totalStock` for 10 real products is still missing. [Stage5 issue #4](https://github.com/arif123-del/kandorty/issues/4) remains **OPEN; Stage 5 PARTIAL / NO-GO**, PR #2 draft/unmerged; no production change.

## 2026-11-12 Stage 5 candidate server, browser/admin and Rules tests PASSED; real acceptance NO-GO

[No-deploy GitHub CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43222199698): **213 passing / 0 failing (1 skipped) code tests**, plus **27/27 candidate Firestore Rules emulator tests**. The generated *unpublished* website/admin review routes new card and COD orders through server endpoints, uses authenticated admin status API and suppresses historical auto-restock and fabricated stock baseline writes; the original live source SHA-256 is unchanged. Draft server checkout protects missing/untrusted `stock` and `totalStock`; COD and card-session creation fail before payment or Firestore write; already-paid card fulfillment is recorded as `needs_review` without inventory debit when stocks become unknown. See [Stage5 candidate acceptance matrix](STAGE5-CANDIDATE-READINESS.md).

**Critical not yet verified:** Owner must confirm saleable physical stock or withhold checkout for 10 products; installed Android 2.3.3 APK/ZIP and older client paths are not independently available/accepted; coordinated old-web/admin/app to candidate Rules cutover, real-device payment/order workflows and rollback are untested. Therefore **Stage 5 remains PARTIAL / NO-GO for production**. No published Firebase Rules/site/Worker changes, no product stock edits, no Stripe Live/PR merge or Ziina changes.

## 2026-11-12 Stage 5 started — draft missing-stock checkout gates verified

Stage 5 has **started; NOT completed**. The owner-declared 99 legacy orders remain archived as virtual test history and unaffected. Current production product metadata has **11 products; only 1 with valid `stock` and `totalStock`, and 10 unconfigured**. A new **unpublished** candidate safety change now:
- Rejects server-side COD orders and **card Checkout Session creation** for products with unknown current stock or missing/invalid trusted `totalStock`, rather than silently treating missing data as unlimited or inferring historic inventory totals.
- If an already-paid card Session encounters unavailable/unknown stock at fulfillment, it records the paid order as `needs_review` with no product stock writes and no invented refund.
- Runs the actual proposed server checkout preflight with synthetic products in [CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43221269410) (**211 code tests PASS, 0 failed, 1 skipped; 27/27 candidate Firebase Rules tests PASS**). The absence of real product counts means this does not make ten unconfigured products available for new orders.
- GitHub [Stage5 issue #4](https://github.com/arif123-del/kandorty/issues/4) tracks physical inventory for the 10 products, installed Android v2.3.3 and older client compatibility, coordinated site/admin/Rules cutover, and isolated COD/card/guest cancel/return acceptance.

**No deployment, live worker update, Firebase Rules publication, product-stock correction, old test-order mutation, Stripe Live activation, Ziina change, or PR merge occurred.** PR #2 remains draft and release NO-GO. The original site and Android clients still use legacy Firestore write paths and must not be assumed compatible with future strict Rules.

## 2026-11-12 Stage 4 virtual-test-order preservation ACCEPTED; production remains NO-GO

**Current superseding disposition (limited scope):** the owner declares **all 99 old orders are their own virtual tests** and no genuine customers are represented by this historical collection. The 18 COD-anomaly cases are a subset. Historic owner-created test-order evidence, read-only preservation and encrypted Firestore backup preparation have reached the [Stage 4 archive-only acceptance checkpoint](STAGE4-VIRTUAL-TEST-ORDERS-ACCEPTANCE.md). No production archive implementation has been deployed; keep the original data and both encrypted backups unchanged. The owner-reported 291-document private emulator replay is not independently inspected in its final console output. Independently [14 of 14 archive/aggregate CI tests passed](https://github.com/arif123-del/kandorty/actions/runs/43218536377), and [release CI reports 206 passing tests and zero failing tests](https://github.com/arif123-del/kandorty/actions/runs/43218536806).

**Moved to separate remaining release gates (still NO-GO):** [Stage 5 stock, old clients, candidate Rules and live frontend readiness #4](https://github.com/arif123-del/kandorty/issues/4) and [Auth/Storage/Rules, full project recovery #5](https://github.com/arif123-del/kandorty/issues/5). Ten of 11 real product records still lack explicit stock fields, and old site/admin/Android clients are not certified for strict Rules. These gates are *not waived* or treated as done. Stage 2 Live webhook, Stage 5/6 and Stage 7 still require their distinct approvals. No merge, Firebase Rules publication, stock correction, existing Worker deployment, Stripe Live enablement, Ziina changes or production Firestore writes are authorized by "finish" or this documentation.

## 2026-11-12 end-of-day Stage 4 readiness decision: owner backup saved; production still NO-GO

### Done and verified (no production mutation)
1. Owner generated AES256 GPG encrypted Firestore snapshot of **11 collection paths, 291 documents, 99 order documents, 99 tracking documents**, with local source/roundtrip structural PASS, and downloaded it to the phone. Owner later reported private new-file fake-project emulator restore **PASS** (actual terminal line and 291/99/99 readback not independently shown in chat). Earlier **254/254** original-document exact emulator restoration passed separately.
2. **18/18** historical exception orders have current **COD** payment labels based on read-only Firestore aggregate; their self-test origin is **owner-declared**. They remain unchanged and are barred from invented lifecycle/automatic restock/refund. All **99** historical orders are preserved.
3. [Draft-only admin guard CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43209718275): disables legacy automatic cancellation, restock, tracking backfill and also the previously overlooked **untrusted totalStock baseline auto-migration**, while preserving order list reads. It is a review artifact **not deployed**.
4. [Published-client source and candidate Rules compatibility audit CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43210629661): identified active direct browser order writes, tracking writes, client-side restock, admin stock baseline writes and legacy tracking backfills; draft strict Rules **would reject** these paths. 205/205 code tests passed; clean CI does **not** mean safe production rollout.
5. [Read-only Firestore stock-field health](https://github.com/arif123-del/kandorty/actions/runs/43066231986): **11** product records, **1** with valid `stock` and `totalStock` fields, **10** with missing managed stock. Never set missing stock to 0 or infer it from canceled test orders.
6. [Production non-Firestore metadata access CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43210202190): the **GitHub service account cannot read or verify** Authentication users, either default Cloud Storage bucket, or deployed Firebase Rules through the scoped read-only APIs. No PII was printed and no permissions were changed. [Owner-Google-Cloud-Shell-only no-PII GET probe](owner-private-nonfirestore-coverage-readonly.py) is prepared, with [synthetic safety tests PASS](https://github.com/arif123-del/kandorty/actions/runs/43211107454). This probe is **not** an Auth/Storage/Rules export or recovery.

### Still required for any claim "Stage 4 complete for production"
- Obtain authorized read/export and independently verified recovery for Auth users if any, Storage objects if any, and **deployed** Firebase Rules, or document a verified empty/non-applicable scope. A Firestore JSON backup does not cover them.
- Establish actual physical inventory for 10 products missing `stock`, and **prove that old client-side cancellation/restock paths cannot run** during migration. Do not guess counts or write stock without an independent owner-approved inventory reconciliation.
- Actual installed Android builds and currently published storefront/admin direct order paths cannot be treated as compatible with candidate stricter Rules. Coordinate and test the replacement clients, legacy archive UI, server-backed COD/Stripe and Rules together; **do not publish the draft Rules in isolation**.
- A managed point-in-time recovery/rollback and customer-inbox/live alert acceptance remain separately gated where applicable. Final activation needs distinct owner authorization; no generic "finish" instruction is approval for Live payment, stock correction or published Rules change.

**Verdict today: Stage 4 backup and local preservation preparation completed; Stage 4 production acceptance PARTIAL / NO-GO.** The blockers are access and real-world inventory/client evidence, not more code-only tests. Do not ask the owner to repeat already completed 291-document backup, 254-document replay or 18 COD survey. PR #2 remains draft and unmerged; original site, products, orders, Firebase Rules, Stripe Live, Workers and Ziina unchanged.

## 2026-11-12 download confirmed; synthetic expanded Firestore emulator recovery validated

The owner confirmed their **291-document encrypted Firestore snapshot was downloaded to their mobile phone**. A copy being downloaded is an owner report, not an independent comparison of its file hash, file size, offline opening, or secure redundant second copy. Preserve the original owner's Cloud Shell encrypted file, the new downloaded .json.gpg and their GPG passphrase separately. Do not upload the encrypted private file or share passwords/customer data.

New [private expanded Firestore emulator rehearsal](owner-private-expanded-firestore-emulator-replay.py) and [Cloud Shell wrapper](owner-private-expanded-firestore-recovery.sh) are committed only to the draft branch. They validate the encrypted snapshot structure, require a **fresh loopback-bound fake project emulator** and absent production credentials, refuse writes to a non-demo endpoint, reject a nonempty emulator before any writes, import all root/nested collection documents locally and compare each document's *complete Firestore typed fields* against the encrypted source. They print summary counts only, no IDs, customer data or secrets.

**Test evidence:** [7/7 initial synthetic safety unit tests PASS](https://github.com/arif123-del/kandorty/actions/runs/43157738677). [Real local emulator integration CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43158058421) on **291 synthetic (NOT user-owned) Firestore documents**: exact typed-field readback, 11 root collections and one synthetic nested collection. Integration originally encountered an emulator-unsupported root listCollectionIds POST (no writes occurred); corrected it to GET-only per-collection empty guards and reran to PASS. At the time of that earlier CI report, the owner-private replay had not been reported. The owner subsequently reported **PASS** in chat; the exact final terminal readback was not independently seen. This is not a full Firebase Auth/Storage/Rules recovery claim.

**Next owner-controlled recovery gate:** use `bash stripe-release/owner-private-expanded-firestore-recovery.sh` after `git pull --ff-only` in existing `~/kandorty-stage4-review`, type `REHEARSE_EXPANDED_LOCAL_ONLY`, enter private new-backup GPG passphrase locally, and look for `OWNER_EXPANDED_ENCRYPTED_EMULATOR_RESTORE: PASS`. Do not share any private data or password. A temporary demo emulator cannot modify live Firestore, but successful testing does not authorize Stripe Live, Firebase Rules, stock migration or production publication. Stage 4 remains PARTIAL / NO-GO pending owner-private encrypted data recovery and other independent release gates.

## 2026-11-12 owner correction: ALL 99 historic orders are self-created virtual tests

**Newest owner statement supersedes the earlier distinction between 18 test cases and 81 unspecified/possibly customer orders.** The owner explicitly confirmed **all 99 Firestore orders were personally created for testing and none belongs to a genuine customer**. Record this as `OWNER_ATTESTED_ALL_99_VIRTUAL_TEST_ORDERS`, documentation / archive planning only; do NOT write the classification, delete records or mutate a production document. The 18 anomalous cases are a **subset** of the 99 and their COD label was independently verified at the aggregate level (18 COD, 0 card); **do not imply the other 81 are all COD or that any payment label proves a card settlement/refund**.

**Stage 4 scope reduction:** customer identity verification, contacting purported real customers and individual customer-dispute resolution are NOT needed to retain these 99 as unchanged test history. Do not ask the owner to repeat 99/254 or 291-document encrypted backup and emulator checks. The **two encrypted backups still include other product/customer/configuration records** and must remain protected; real current stock effects of test purchases/cancellations are NOT proven harmless. Avoid historic quantity replay, refund, lifecycle fabrication, and automatic inventory correction. Production activation still needs candidate Rules / browser / old Android safety and a separately verified Auth/Storage/Rules recovery plan. **Stage 4 remains PARTIAL / NO-GO for publication**; PR #2 draft/unmerged and no Firebase/Stripe Live/Ziina changes.

## 2026-11-12 owner reported expanded local emulator PASS

The owner opened the private Cloud Shell `owner-private-expanded-firestore-recovery.sh` and showed that the isolated `demo-kandorty-stage4-recovery` Firestore emulator had started and was prompting for the private GPG backup passphrase. In a follow-up the owner replied **"Pass"**. Record this as **owner-reported PASS** of the new 291-document encrypted-backup local emulator restore, **not independently verified from the final terminal output**; do not claim the exact final `OWNER_EXPANDED_ENCRYPTED_EMULATOR_RESTORE: PASS` marker or all readback counts were seen by the assistant. The local 291-synthetic-document integration was separately verified in GitHub Actions [PASS](https://github.com/arif123-del/kandorty/actions/runs/43158079152). This does not restore or change production data.

**Updated preservation progress:** the owner encrypted and structurally validated a new Firestore backup spanning 11 collection paths, 291 documents, 99 orders and 99 tracking documents; downloaded the ciphertext to their phone; and now reports the private local emulator rehearsal as passed. Keep both the old and new GPG files and their correct passwords secure. The new phone copy's byte-for-byte checksum has not been independently verified. Firestore-only emulator restore is not an Auth/Storage/deployed Rules/managed export recovery; historical stock effects (10 products lacking stock fields) and old installed client/Rules compatibility remain release gates. Stage 4 overall **PARTIAL / NO-GO for production**, PR #2 draft/unmerged; never alter orders, stock, refunds, Firebase Rules, published site, Stripe Live or Ziina without specific final approval.

## 2026-11-12 expanded Firestore snapshot: owner downloaded encrypted file; 291-fake-document emulator CI PASS

**Owner-confirmed off-device encrypted copy:** the owner stated the encrypted new Firestore backup finished downloading to their phone. The assistant has **not inspected the phone file or independently verified its SHA256 hash against the source**. They should keep the encrypted file private and the passphrase separate; do not upload either to GitHub or this chat.

**Live local emulator software integration with 291 SYNTHETIC documents only:** [GitHub Actions CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43158079152) for the isolated `demo-kandorty-stage4-recovery` Firestore emulator, showing `SYNTHETIC_291_DEMO_FIRESTORE_EMULATOR_RESTORE: PASS` and `SYNTHETIC_291_EXACT_TYPED_FIELDS_READBACK: PASS`. It uses only fabricated orders and typed fields; no personal backup, production credentials, private identifiers, production writes, Rules, real payment/refund or deployment. The new [owner-only expanded encrypted replay script](owner-private-expanded-firestore-emulator-replay.py) and [wrapper](owner-private-expanded-firestore-recovery.sh) are prepared to run in private Cloud Shell, with loopback and fake-project guards, and the owner subsequently **reported the private local restore PASS**, although final console readback was not independently inspected. Full managed Cloud Firestore recovery, Firebase Auth, Storage objects, deployed Rules, and the 10 missing product stock fields remain unresolved. Stage 4 stays **PARTIAL / NO-GO**, PR #2 stays draft and unmerged.

## 2026-11-12 owner screenshot: expanded private Firestore snapshot created and self-verified

The owner provided a private Cloud Shell screenshot showing a successful fresh run of the updated [expanded Firestore backup writer](owner-private-expanded-firestore-backup.py) with **both** `ENCRYPTED_EXPANDED_BACKUP_STRUCTURE: PASS` and `ENCRYPTED_ALL_FIRESTORE_ROOT_SNAPSHOT: VERIFIED`. The reported safe summary was:

- `ROOT_COLLECTIONS_SAVED: 11`
- `INCLUDING_NESTED_COLLECTIONS: 11` (11 total collection paths; the run did not enumerate any extra nested collection paths)
- `TOTAL_FIRESTORE_DOCUMENT_REFS: 291`
- `ORDERS_PRESERVED: 99` and `TRACKING_PRESERVED: 99`
- `MISSING_PARENT_PATH_REFERENCES: 0`
- The writer completed AES256 GPG decrypt/hash verification, and the updated source script ran its offline structural check both before encryption and against independently decrypted JSON. Output reported no production modifications.

**Result: Expanded Firestore root/nested enumeration, local encrypted snapshot, crypto round-trip and offline snapshot structural-check subtask — COMPLETED by owner screenshot, not independently inspected private data.** This supplements rather than overwrites the earlier 99-order/254-document encrypted backup and successful earlier limited emulator replay. Protect both encrypted backups and the new password; download an off-device private copy of the new encrypted file. The new 291-document snapshot has **NOT** been restored in a fake-project emulator, and Firebase Auth, Storage objects, deployed Rules, provider secrets and managed point-in-time rollback are **NOT** covered by this Firestore-only snapshot. Historical virtual test stock effects and ten products lacking explicit stock fields remain unresolved; old client and candidate Rules end-to-end compatibility is separate Stage 5. Stage 4 therefore remains **PARTIAL / NO-GO** until recovery/compatibility safeguards are completed. PR #2 remains draft/unmerged; no stock, customer/order, Stripe Live, Firebase Rules, existing Worker, or Ziina writes are authorized.

## 2026-11-12 owner-reported expanded encrypted Firestore snapshot verification

On **2026-11-12 (Asia/Dubai)**, the owner reported seeing the exact terminal success marker `ENCRYPTED_ALL_FIRESTORE_ROOT_SNAPSHOT: VERIFIED` after running the owner-only [expanded Firestore root/nested backup script](owner-private-expanded-firestore-backup.py) in their Cloud Shell. This marker is printed only after that script's AES256 GPG decrypt/hash round-trip and structural preconditions have succeeded. **This is an owner-attested on-device execution, not an assistant-inspected private file.** The root count, nested count, exact snapshot document count, encrypted hash, secure off-device copy and whether any service data beyond Firestore was saved have **not** been independently checked here. The previously verified 99-order/254-document restore remains a different, narrower backup.

Prepared new strictly offline [expanded backup structural verifier](owner-private-expanded-backup-review.py), with [CI 6/6 synthetic tests PASS](https://github.com/arif123-del/kandorty/actions/runs/43112646263). The owner can locally run it against their latest expanded encrypted file without uploading or revealing customer/order codes or passwords. **That owner-private new-file structural review has not yet been run or attested.** Full expanded emulator replay / recovery drill is also not yet performed. The recursive Firestore backup excludes Auth, Storage and deployed Rules and is a sequence of reads, **not a managed or point-in-time snapshot**.

**Stage 4 remains PARTIAL / NO-GO:** test-order scope preserved, owner-declared 18 virtual COD labels corroborated by live aggregate, but ten products lack recorded stock fields, old client direct-write cutover is untested, and full project backup/recovery coverage is not proven. Do not delete/change prior or newer backup, or production orders, Firebase Rules, Stripe Live, stock, refund, existing Workers or Ziina. PR #2 remains draft/unmerged.

## 2026-11-11 verified Stage 4 final no-write audit and broadened recovery preparation

**Real production READ ONLY checks succeeded, without exposing customer/order/product identifiers or changing a Firestore document:**
- [Owner virtual COD audit CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43064512500): **99 current orders, 99 matching tracking statuses, 18 unique historical risk-flagged orders, all 18 labeled COD, 0 card, 0 unknown payment label**. Counts for the 21 overlapping flags match the private 2026-11-10 backup (4 locks, 3 pending cancellation, 3 prior stock-restoration markers, 11 unknown cancellation origins). This is aggregate correspondence, **not** independent order-ID matching; the test-created origin is owner-declared, not provider-verified.
- [Historical archive-only policy and read-only audits CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43066231986): **13/13 synthetic tests PASS**. The draft-only `legacy-archive-only-policy.mjs` allows only archive reading and refuses all legacy cancel, edit, restock, refund, migration, fabricated lifecycle and activation operations; it is **not deployed**, and does not prove old mobile/browser clients will obey it.
- The same CI confirmed **11 currently nonempty Firestore top-level collections**, **4** from the previous five-collection owner GPG export (the fifth collection is empty), **7 nonempty top-level collections absent from that older snapshot**, and **254 currently present documents in the five old backup scopes**. This proves the earlier 99/254 local restore is materially narrower than whole-project recovery.
- [Expanded backup synthetic CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43065575490): **6/6 synthetic tests PASS** for a guarded owner-only [no-billing expanded Firestore GPG backup](owner-private-expanded-firestore-backup.py) that recursively enumerates discoverable root/nested collections, validates 99+ orders vs tracking and encrypts directly in owner Cloud Shell. **Real owner execution and expanded encrypted restore verification NOT DONE**. It is still not a point-in-time managed export and excludes Firebase Auth, Storage, published Rules and other service configuration.
- [Read-only product stock-field health CI PASS](https://github.com/arif123-del/kandorty/actions/runs/43066231986): **11 product documents**, just **1 valid nonnegative integer `stock` and `totalStock`** pair, **10 products with both fields missing**, **0 invalid defined numeric stock values**, and **0 defined totals below remaining stock**. Missing stock is **not** evidence of zero stock, nor proof that historical virtual orders did/didn't affect inventory. No stock adjustment was authorized or applied.

**Scope completed:** existing owner encrypted 99-order/254-document JSON backup was locally replayed exactly; 18 owner-declared virtual COD test risk flags are accounted for at the current *aggregate* level, and a non-destructive read-only archive policy and synthetic tests are prepared. The owner should **not** repeat the completed 99/254 backup replay, status surveys or prior COD questions.

**Still unresolved and release-blocking:** the 7 additional nonempty root collections have not been captured by an owner-held encrypted backup; nested/Storage/Auth/Rules recovery remains unverified; historical stock-effect provenance cannot be inferred from today's fields and 10 products lack explicit stock; published old clients still write directly and candidate Rules change would need a coordinated compatibility rollout. A technical archive policy committed to an unmerged PR is not a deployed safety control. **Stage 4 remains PARTIAL / NO-GO for production** and Stage 5/6/7 remain separately gated. No live website, existing Worker, Stripe Live, Firebase Rules, orders, stock, refunds or Ziina changes are authorized or made.

## 2026-11-11 owner approximate timeline: these 18 COD tests likely predate card-checkout work

The owner recalled that the 18 owner-created virtual COD test orders were **probably placed before work on payment-by-card began** for Kandorty. Record this as an **approximate owner recollection**, not an independently verified timestamp comparison. The responsible treatment is to **drop routine card-charge/refund investigation as a prerequisite for retaining those 18 test orders as unchanged read-only history**. No live Stripe payment or refund is asserted for them, and an independently encountered inconsistent payment reference would still be handled safely. Neither that recalled timeline nor the declared COD mode proves that historical test checkout/cancel flows did not change inventory.

This update adds no production change, backdated lifecycle ledger, deletion, refund, payment or stock write. The 99-order/254-document private encrypted snapshot and its local emulator readback already PASSED. PR #2 remains draft and release NO-GO until inventory and old-client compatibility/recovery gates are actually validated. The new draft-only aggregate metadata reader can compare current COD labels to the private historic distribution without printing individual KD IDs; **its real CI result has not yet been verified**.

## 2026-11-11 final owner clarification: all 18 exception cases are virtual COD test orders

The owner confirmed that **all 18 flagged old orders were virtual tests personally entered through the Kandorty app/website, selected cash-on-delivery (COD), and did not belong to genuine customers**. This resolves the *owner-intended purpose* and test/customer classification at an **owner-attestation level**. Do not request the same 18 case codes, customer cancellation proofs or card-label tallies again merely to classify these as owner-declared virtual tests. It does not independently establish historic Firestore payment labels for every record, whether browser/app test operations altered actual product stock, or the absence of other real orders outside these 18.

**Non-mutating disposition:** preserve the entire 99-order/254-document encrypted backup, preserve all original orders, and treat the 18 flagged entries as `OWNER_DECLARED_VIRTUAL_COD_TEST` in the **draft archival disposition only**, not as a production Firebase field or a proven transaction event. This means individual cancellation-actor reconstruction is **not necessary to retain them read-only**; do not delete/auto-cancel/re-stock them, synthesize ledgers or issue refunds. Stage 4 backup portion has owner-confirmed local emulator replay PASS, but full managed/cloud recovery and compatible historical archive/old-client cutover and inventory-effects verification remain unresolved. PR #2 stays draft/unmerged, and all Live/production changes remain forbidden without separate specific final release approval.

## 2026-11-11 owner clarification: 18 flagged historic cases are owner-created test orders

The owner stated that the **18 historical flagged orders were self-created using the Kandorty app/web as tests, rather than real independent customer purchases**. This materially changes the proposed *customer-origin review*: do not pursue third-party customer provenance or claim there are 18 customer disputes. Classify them in the **draft plan only** as `OWNER_REPORTED_TEST_ORDER_ORIGIN`, not as independently authenticated historic actors. **No private case-level IDs were disclosed**, and the owner's statement does not independently match IDs or establish absence of real card payments, stock debits/restoration, processing-lock gaps, or other downstream effects.

The existing local 99-order/254-document encrypted backup and fake-project emulator replay passed; 2/2 encrypted visual status surveys passed. **Do not repeat these tests**. The safe non-mutating disposition is to keep all 99 original orders untouched and the 18 flagged old test-order records in a proposed read-only archival exception group; require provider reconciliation if any real card payment occurred and trusted inventory review before any actual stock adjustment. No automatic refunds, deletion, migration, retrospective ledgers, production Rules change, Live activation, or PR merge. Stage 4 release checkpoint stays **PARTIAL / NO-GO** because full recovery/client cutover and independent financial/inventory effects have not been established.

## 2026-11-11 non-destructive archive-only alternative drafted; owner evidence still missing

A [fail-closed legacy archive-only alternative](LEGACY-READONLY-QUARANTINE-OPTION.md) was documented and linked in [Stage 4 issue #3](https://github.com/arif123-del/kandorty/issues/3). The plan preserves all 99 historical documents and retains the 18 exceptions in an owner-held encrypted manual-review docket without inventing lifecycle locks, cancellation actors, stock adjustments, refunds or trusted ledgers. It is a **non-deployed design option**, not a real quarantine of production orders, implemented archive view, complete backup, verified evidence reconciliation or production approval. Prior owner-verified **2/2 encrypted surveys and 99/254 real local emulator replay do not need repetition**. Stage 4 remains PARTIAL / NO-GO until release gates are independently satisfied; no production change was made.

## 2026-11-11 owner real encrypted backup → local Firestore emulator replay PASS

The owner shared a private Cloud Shell screenshot of the successful guarded local demo-only `owner-private-stage4-retry.sh` run. After the prior generic exit-code-2 failure, the safely diagnosed retry reported `LOCAL_REPLAY_STAGE: READBACK_ORDER_LIFECYCLE`, `LOCAL_EMULATOR_RESTORED_DOCUMENTS: 254`, `LOCAL_EMULATOR_ORDERS: 99`, `LOCAL_EMULATOR_TRACKING: 99`, `LOCAL_EMULATOR_FULL_TYPED_FIELDS_MATCH: YES`, and `OWNER_REAL_ENCRYPTED_LOCAL_EMULATOR_REPLAY: PASS`. The script exited with **code 0** and the local Firestore emulator shut down. No real order code, customer data, GPG file or password was transferred to the assistant.

This is **owner-attested real private encrypted JSON backup reconstitution in a locally isolated, fake-project emulator, with a field-level readback comparison** of all 254 documents across the five backed-up top-level collections. It substantially strengthens the recovery test beyond the earlier synthetic-only emulator exercise and RAM replay. The screenshot explicitly confirms `MANAGED_FIRESTORE_EXPORT_OR_CLOUD_RESTORE: NOT_TESTED`, `SUBCOLLECTIONS_STORAGE_AUTH_RULES: NOT_BACKED_UP_BY_THIS_SNAPSHOT`, `INDEPENDENT_18_CASE_EVIDENCE_VERIFIED: NO`, `PRODUCTION_FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE`, and `STAGE4_RELEASE_AUTHORIZED: NO`. No official Cloud Storage/managed export or full disaster recovery of all Firebase data is claimed.

**Stage 4 remains PARTIAL / NO-GO:** the 18 historical exception cases need genuine independent provenance for cancellation actor, historical stock movements, processing-lock consistency, and payment/refund settlement where relevant. Neither visual status matches nor safe local recovery prove those. PR #2 remains unmerged and draft, and no production orders, stock, website, Firebase Rules, Stripe Live, existing Worker or Ziina rollout is authorized.

## 2026-11-11 owner-verified two encrypted visual surveys — 2/2 integrity PASS, NOT case resolution

The owner shared a screenshot from their own Google Cloud Shell of the offline `owner-private-stage4-survey-audit.py` run. It reports **OWNER_PENDING_ENCRYPTED_SURVEY: VALID**, matching **3**, changed/missing/skipped **0**; **OWNER_UNKNOWN_ENCRYPTED_SURVEY: VALID**, matching **11**, changed/missing/skipped **0**; and **ENCRYPTED_VISUAL_SURVEYS_VERIFIED: 2/2**. This is owner-attested execution of the local audit's exact encrypted-survey/docket consistency checker; the assistant did not receive passwords, file contents, order codes or customer records. It is stronger evidence for survey file integrity than the earlier verbal status counts.

The output explicitly also reports **INDEPENDENT_CASE_CAUSAL_EVIDENCE_VERIFIED: NO**, **MANAGED_FIRESTORE_EXPORT_AND_REAL_RESTORE_VERIFIED: NO**, **FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE**, **STAGE4_RELEASE_AUTHORIZED: NO**. No historical exception is closed by visual status matching. All **18 unique** flagged historical cases remain blocked pending independent evidence and safe reconciliation, and a protected managed Firestore export/real recovery test is still unverified. Stage 4 remains **PARTIAL / NO-GO** and no production rollout is authorized. The GitHub PR remains draft; no production Firebase Rules, order, stock, existing Worker, storefront, Stripe Live or Ziina changes are authorized by this report.

## 2026-11-11 Stage 4 encrypted survey integrity verifier — prepared, owner execution still required

A new offline, owner-only `owner-private-stage4-survey-audit.py` was added to cross-check both separately encrypted visual status surveys (PENDING=3, UNKNOWN=11) against the existing GPG docket. It exact-reconstructs the expected per-case reports in RAM and rejects changed counts, case identifiers, claimed approvals or corrupted report fields, while emitting **aggregate counts only**. Synthetic-only tests were added to the owner-private CI workflow, but the latest workflow result has not been independently verified in this update.

**Execution remains with the owner**, because their encrypted GPG docket/survey files and password cannot be accessed from this GitHub connector. The owner's UNKNOWN report is already attested as 11 matching, 0 changed and encrypted output yes. The three PENDING statuses were separately reported matching, but encrypted survey file existence has not been confirmed. The new script will explicitly report that file as missing if absent. Neither survey is independent evidence of any of the 18 real exception causes.

The 2026-11-10 owner-local backup remains a limited encrypted JSON export, **not** an official managed Firestore export or a real Firestore restore. The latest owner records also state Cloud Billing and a suitable bucket were not configured at that checkpoint; this has not been rechecked with Google Cloud access. The 18 historic exceptions and a protected real restore remain hard NO-GO gates. No production order, stock, Rules, Worker, storefront, Stripe Live or Ziina changes were made.

## 2026-11-11 owner-reported UNKNOWN visual survey — 11 matches, encrypted report (READ ONLY)

The owner reported the aggregate private Cloud Shell markers `OWNER_VISUAL_MATCHING: 11`, `OWNER_VISUAL_CHANGED: 0`, and `PRIVATE_ENCRYPTED_STATUS_SURVEY_CREATED: yes` for the eleven UNKNOWN cancellation-origin cases. This is owner-attested evidence of visual status consistency with the encrypted local backup and private encrypted survey creation; it is **not** an independent inspection of the encrypted file. The earlier three PENDING cases were separately owner-reported as visually matching; this update does not claim their encrypted survey creation.

**Important:** Matching visual statuses do **not** establish who cancelled the orders, entitlement to cancel, valid inventory ledger entries, processing-lock integrity, settled payments, refunds, or whether any of the **18 distinct overlapping historical exception cases** can be safely released. All 18 still require independent evidence review. Stage 4 remains **PARTIAL / NO-GO**, and Stage 5 is also **PARTIAL / NO-GO**. No production orders, stock, Firebase Rules, released website, existing Workers, Stripe Live or Ziina were changed; PR #2 remains draft.

## 2026-11-11 owner PENDING survey local failure — safe diagnostics repaired; no cases reconciled

The owner attempted the `PENDING` visual status survey twice; each exited just after private GPG password entry with the generic `OWNER_VISUAL_SURVEY_NOT_COMPLETED` message. Neither attempt produced a successful 3-case owner status survey or resolved any real exception. A safe stage-specific diagnostic patch (identify local docket / decrypt / validate baseline without emitting exception strings or secrets) and three synthetic end-to-end interactive tests have been added. [52/52 offline tests PASS](https://github.com/arif123-del/kandorty/actions/runs/42986474679). **Actual cause of the owner's failure remains unconfirmed**; only a new private Cloud Shell run with the safe stage code can narrow it down. Preserve all 99 orders; no stock, refunds, production Firebase, Stripe Live or Ziina writes are authorized. Stage 4 remains PARTIAL/NO-GO.

## 2026-11-11 owner-reported 3 pending-cancellation visual status matches — READ ONLY

The owner reported `OWNER_VISUAL_MATCHING: 3` from the private `PENDING` status comparison. This is **owner-attested aggregate-only evidence** that the three flagged pending-cancellation order statuses visually matched their 2026-11-10 private backup statuses. The owner has **not yet supplied the `PRIVATE_ENCRYPTED_STATUS_SURVEY_CREATED: YES` success marker**, so a saved encrypted survey is not independently confirmed from this message. No private order IDs, customer data or passphrase are recorded in this report.

**This does not verify cancellation actor, request legitimacy, historical inventory debit/credit, processing lock consistency, refund or closure of any exceptions.** All three cases remain evidence-blocked; the eleven UNKNOWN-origin cases have not yet been reported as reviewed. Stage 4 remains PARTIAL / NO-GO. No production modifications or permissions inferred.

## 2026-11-11 remaining fourteen legacy cases — private status survey prepared and tested (NO LIVE CHANGES)

Added the [offline owner-only status survey](owner-private-legacy-status-survey.py) to inspect `PENDING` (3 pending customer-cancellation cases) and `UNKNOWN` (11 unknown cancellation-origin cases), separately, using the owner's existing encrypted docket. The tool requires local `YES`, privately decrypts the local file, shows codes only in the owner's terminal, accepts owner-observed admin statuses, reports aggregate comparisons and GPG-encrypts the result in the owner backup directory. It does not retrieve data from production Firebase, perform any order/payment/stock change, prove an actor or resolve historical ambiguities. All cases remain blocked for independent evidence. [Owner offline CI **49/49 tests PASS**](https://github.com/arif123-del/kandorty/actions/runs/42982296577) including seven new survey tests, with cloud-call ban. This stage is still **PARTIAL / NO-GO** until real private case reviews, protected restore, old/new client acceptance and specific release approval. No owner execution of this new survey has yet been reported.

## 2026-11-11 four historical lock-anomaly cases — owner-checked live status (READ ONLY)

After identifying the four flagged processing-lock cases privately, the owner reported that **all four current admin order statuses match their backup statuses** (two shipping, two delivered). This is an **owner-attested visual status match only**, not an independent audit of underlying `cancellationLockedAt` order/tracking fields, cancellation actors, inventory debit/restoration or transaction ordering. No private order identifiers/customer information are included here. **All four lock anomalies remain unresolved pending independent field-level evidence and safe migration planning**. No production writes, stock adjustment, refunds or Stripe Live activation were performed or authorized.

## 2026-11-11 isolated synthetic Firestore emulator document recovery — PASS, no production writes

A new [strictly isolated emulator rehearsal](../.github/workflows/stripe-legacy-synthetic-restore-emulator.yml) recreated **254 synthetic Firestore documents** (99 fake orders, 99 fake tracking records, 28 fake order edits, 28 fake access records, zero lifecycle ledgers) in a **local demo-only Firebase Emulator**. It independently re-read every document and checked all field values including Firestore timestamps, geolocation, binary bytes, document references and nested arrays/maps. It also confirmed **99 matching order/tracking statuses** and the representative 4 missing locks, 3 pending cancellations, 3 stock-marker flags, 11 unknown-origin cancellations. The [GitHub run 42973868133](https://github.com/arif123-del/kandorty/actions/runs/42973868133) **PASSED**; logs explicitly state `REAL_BACKUP_AND_PRODUCTION_RESTORE: NOT_TESTED` and `PRODUCTION_FIREBASE_OR_PAYMENT_WRITES: NONE`. The normal release code job also passed once emulator-only imports were isolated.

**Limitations remain binding:** The 254 emulator documents are invented, not copied from owner-held backup; no live personal data or payment evidence was used. This is **a real Firestore emulator write/read of synthetic fixtures**, not a complete Firestore managed export, a test restore of the 99 private documents, a cross-project disaster-recovery rehearsal, a rollback plan or reconciliation of the **18** unresolved private historical exceptions. The production no-go remains; original live orders, stock, Rules, Workers, Stripe Live and Ziina were untouched.

## 2026-11-11 owner-reported private RAM replay PASS — NOT A FIRESTORE RESTORE

Owner reported in chat a truncated copy of the local terminal success marker, `CAL_IN_MEMORY_REPLAY: PAS`, consistent with `LOCAL_IN_MEMORY_REPLAY: PASS` from the checked-in `owner-private-local-replay.py`. We have **not** received the full terminal output or independently examined the private encrypted backup. Treat this as **owner-reported success, not independent attestation**. The script's PASS path requires the expected 99 orders / 254 documents, strict order/tracking agreement and exact per-document typed JSON equality after an in-memory SQLite replay. It produces no external Firestore writes.

**Scope:** a private offline memory-integrity exercise only. It does **not** prove a managed Firestore export, actual Firestore restore, protected rollback, full project/subcollection/Storage/Auth/Rules recovery or resolution of any of the 18 flagged historical cases. Stages 4/5 remain PARTIAL/NO-GO; release approval remains withheld.

## 2026-11-11 owner-private encrypted-backup RAM integrity replay — prepared, synthetic CI PASS

New `owner-private-local-replay.py` validates the existing 99-order / 254-document backup format and simulates an isolated in-memory SQLite replay of **all five top-level collections**, with exact per-document canonical JSON, Firestore typed fields, order/tracking identities and status equality checked after the roundtrip. No cloud/API calls, plaintext file or local SQLite DB are used. The new synthetic tests passed with all previous owner-offline tests: [**37/37 CI PASS**](https://github.com/arif123-del/kandorty/actions/runs/42964265352).

**Not done:** The assistant cannot access the owner's real private GPG backup, so the owner's local execution remains necessary. This memory roundtrip does **not** count as an actual Firestore restore, official managed export, full recovery drill, proof for any of the 18 live exception cases or permission to enable Live. Stages 4 and 5 remain PARTIAL/NO-GO; no production writes, rules, workers, Stripe Live or Ziina changed. The owner-only command is documented in [OWNER-LEGACY-EXCEPTION-REVIEW.md](OWNER-LEGACY-EXCEPTION-REVIEW.md).

## 2026-11-11 owner-executed private 18-case evidence plan — SUCCESS (owner-attested, NO MUTATION)

The owner ran the new offline `owner-private-legacy-triage.py` in their own Cloud Shell after updating the GitHub branch. Screenshot of **aggregate-only** terminal output confirms `CASES_READ_FROM_PRIVATE_DOCKET: 18`, `CASES_NEEDING_INDEPENDENT_EVIDENCE: 18`, `PRODUCTION_CHANGES_AUTHORIZED: 0`, `PRIVATE_ENCRYPTED_EVIDENCE_PLAN_CREATED: YES`, `FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE`, and `STAGE4_RELEASE_AUTHORIZED: NO`. The four risk-flag counts remain 4 processing locks, 3 pending cancellation requests, 3 historical stock-restoration markers and 11 unknown cancellation origins. Owner-held private encrypted report and checklist remain in Cloud Shell; no password, file, order IDs, customer info or private evidence was transmitted. This is **owner-attested local script success**, not independent review of those 18 cases.

**Status remains NO-GO:** 18 cases still need independent owner/operator evidence and case-by-case decisions, protected full restore/recovery demonstration, and end-to-end client/admin acceptance before any candidate production migration. No Stripe Live, real order, stock, Firebase Rules or Ziina changes authorized or performed by this step.

## 2026-11-11 owner-only 18-case evidence review plan — prepared and CI PASSED, NOT LIVE RECONCILED

- Added `owner-private-legacy-triage.py` that reads the owner's existing encrypted `legacy-manual-review-*.json.gpg` docket **locally and offline** and creates a **second AES-256 encrypted** per-case checklist. It validates the specific owner-attested 99-order, 18-unique / 4+3+3+11 risk baseline, rejects changed/malformed/duplicated cases and requires evidence for each risk, plus provider evidence where payment label is card.
- The tool deliberately marks **all 18 review cases BLOCKED** and always reports **0 production changes authorized**. It does not perform any real review, repair, refund or status change. CI ran 7 backup tests + 10 aggregate-risk tests + 7 docket tests + 6 new triage tests: [**30/30 PASS**](https://github.com/arif123-del/kandorty/actions/runs/42962863335), including real synthetic GPG roundtrips and a no-Firebase/network static guard.
- The owner's real encrypted docket remains available only in their private Cloud Shell. The new checklist has **not yet been run on that real private file by the owner**. It cannot resolve independent cancellation-origin/stock-debit/payment truth, validate production client cutover or substitute for managed Firestore export and restore rehearsal. Stage 4 remains **PARTIAL / NO-GO**; production site, orders, Rules, Stripe Live and Ziina remain unchanged by this work.

## 2026-11-11 synthetic 18-case regression and strict TEST-only historical marker guard

The owner-reported **18 unique exceptions / 21 overlapping flags** now have a
corresponding **fully synthetic 99-order regression fixture** (4 lock cases,
3 pending cancellation requests, 11 unknown-origin cancellations, with
3 historical stock-restoration marker overlaps). It verifies one private
review entry per order, zero source mutation and no authorization to
restore inventory, refund or release. The
[owner-only offline synthetic CI run](https://github.com/arif123-del/kandorty/actions/runs/42899068800)
passed **24 tests** (7 backup structure + 10 aggregate risk + 7 exception
docket). This synthetic overlap placement is merely representative; the
actual private case overlap map has not been disclosed.

The TEST-only legacy status policy additionally **fails closed** if an
otherwise-active order/tracking record unexpectedly carries an old
`cancelStockRestoredAt` or `cancelledBy` marker. Synthetic policy and
transactional service tests confirm no status, product, stock or refund
write occurs on such cases. The
[release code/Rules readiness CI](https://github.com/arif123-del/kandorty/actions/runs/42899322217)
completed successfully. **TEST-only source branch; no live endpoints,
existing 99 orders or production Rules changed.**

**UNRESOLVED:** 18 real private cases still require authorized, evidence-based
manual decisions; a full protected managed backup/restore remains absent;
new and old app/admin checkout/tracking/cancellation compatibility remains
unverified. Stage 4 and Stage 5 are still **PARTIAL / NO-GO**. No automatic
historical mutation is safe or authorized.

## 2026-11-11 owner-reported private exception docket SUCCESS (NO PRODUCTION MUTATION)

The owner executed `python3 stripe-release/owner-private-legacy-exception-docket.py` from their Cloud Shell checkout and shared **aggregate-only console output**. The locally encrypted report was created successfully (`PRIVATE_ENCRYPTED_DOCKET_CREATED: YES`) from the existing private 99-order backup. It identified **18 unique legacy orders requiring manual review** (not 21 distinct orders), with overlapping review flags: 4 processing-lock cases, 3 customer-cancellation-request indicators, 3 historical stock-restoration-evidence markers and 11 unknown cancellation origins. The owner-reported output declared `PRODUCTION_ORDER_CHANGES: NONE` and `LIVE_RELEASE_OR_AUTOMATIC_RESTOCK_AUTHORIZED: NO`. We did **not** receive the encrypted file, its password, order IDs or customer data. This is **owner-attested local execution**, not an independent database read or a live fix.

**Next blocking gate:** an authorized private review/reconciliation of those 18 orders, proof of historical stock/payment correctness where needed, a protected full recovery plan and coordinated older-client/admin compatibility acceptance. Do **not** auto-repair locks, pending cancellations, stock or unknown cancellation origins. Stages 4 and 5 remain PARTIAL / NO-GO; final activation not authorized.

## 2026-11-11 additional Stage 4 safe preparation — synthetic verified, NO LIVE changes

- Added [owner-only offline encrypted exception docket generator](owner-private-legacy-exception-docket.py) and [private operating notes](OWNER-LEGACY-EXCEPTION-REVIEW.md). It reads the owner's existing encrypted local backup only after a private local password entry and creates a **new GPG AES-256-encrypted private report** of unique order codes with review-only flags; the script prints aggregate counts only. It does **not** copy customer contact data, amounts, items/quantities or payment credentials into the docket; no plaintext output file is produced.
- Synthetic fixture tests cover the known 4 lock issues, 3 pending cancellation cases and 11 unknown-origin cancellations, including overlapping categories without duplicate order rows, wrong project rejection and a genuine encrypted GPG roundtrip. [GitHub CI run 42895639209](https://github.com/arif123-del/kandorty/actions/runs/42895639209) **PASSED all 23 offline tests** (7 backup, 10 aggregate risk, 6 new docket). The workflow also asserted no Firebase/network code in these private scripts.
- **Not done:** this new docket has not been generated from the owner's *real* encrypted backup (not accessible to this environment); no live case has been reconciled, no full managed export/restore exists, and no Android payment/guest tracking order-flow acceptance or coordinated cutover was approved. Stage 4 and 5 remain **PARTIAL/NO-GO**. Original 99 orders, production Rules, Stripe Live and Ziina remain untouched by this work.

## 2026-11-10 Stage 4 progress (NOT COMPLETED)

- The owner-controlled, billing-free fallback created a 7.1 MB encrypted
  local JSON file; the owner reported successful decrypted counts of 99
  orders / 254 total documents and an on-device download. This is an
  owner-attested partial recovery artifact, **not** a full managed export
  or validated restoration.
- TEST-only legacy order/tracking status writes now use restricted Firestore
  update masks, preserving unrelated historical fields; production root and
  payment/stock/refund updates are rejected.
- [176/176 automated tests and candidate Rules checks](https://github.com/arif123-del/kandorty/actions/runs/42836875133)
  passed. These tests are not proof of live Android 2.3.0 compatibility.
- [Isolated authentic Firestore TEST transaction smoke](https://github.com/arif123-del/kandorty/actions/runs/42837485071)
  **PASSED** using a synthetic order. Verified Firestore timestamp and
  geolocation preservation after masked status write, payment/line-items
  integrity, order/tracking atomic status, immutable audit, replay no-op,
  and cleanup of synthetic documents; production remained untouched.
- A private read-only [local encrypted backup structure checker](owner-private-local-backup-review.py)
  was added. It only prints aggregate counts and encrypted-file checksum and
  rejects wrong project, missing or duplicate documents, missing tracking or
  mismatched order/tracking status. Its [7 synthetic CI tests](https://github.com/arif123-del/kandorty/actions/runs/42839036235)
  **PASSED**, including an authentic synthetic GPG AES-256 roundtrip and wrong
  password rejection. On 2026-11-10 the owner **explicitly confirmed** that their own Cloud Shell run of the real encrypted backup checker displayed
  `BACKUP_STRUCTURE_VERIFIED: YES`. This is owner-attested local file
  structural validation, not an independently retrieved backup or an
  executed Firestore restore. The private file and passphrase remain
  unavailable to CI and were not shared with ChatGPT.
- Read-only comparison of the previously owner-provided Android 2.3.0 source
  ZIP and prepared 2.3.1 CodeAssist ZIP confirms exactly two changed original
  files: app version and static safe-offline fallback. Both ZIPs passed integrity
  checks, and the offline HTML has no script/checkout/Firebase forms. **No
  Android APK was built, installed, signed or tested on-device.**
- An owner-only [offline encrypted legacy cancellation-risk report](owner-private-legacy-risk-report.py)
  now evaluates matching order/tracking status, missing/mismatched
  cancellation locks, customer cancellation requests, prior/restored
  stock flags, cancelled card payment review, unknown payment labels
  and lifecycle presence. It emits only aggregate counts and **never**
  authorizes stock restock, refund or production cutover. Its
  [8 synthetic CI regression tests](https://github.com/arif123-del/kandorty/actions/runs/42850577369)
  passed. The owner must run it privately on their encrypted local
  snapshot before we can call the real aggregate risk inventory verified.
- Static review of the owner-provided 2.3.1 Android ZIP confirms the offline
  HTML contains no form, scripts, iframe, card/payment controls or Firebase
  calls and links only back to the HTTPS Kandorty store. No Android
  SDK/Gradle or enrolled physical test device was available in the
  assistant environment; **no signed/installed APK acceptance**.
- Stage 4 remains **PARTIAL / NO-GO** pending a full protected recovery
  plan, legacy cancellation and missing-lock reconciliation, customer/admin
  compatibility acceptance, and installed Android device tests. No production
  migration or publishing approval has been given.

## Owner-verified encrypted-backup legacy-risk inventory — 2026-11-10 (read-only)

Owner ran `stripe-release/owner-private-legacy-risk-report.py` inside their own
Cloud Shell, entering the private GPG password locally, and supplied a screenshot
of the **aggregate-only output**. The script inspected **99 orders / 254
documents** with these exact counters:

| Risk category | Count |
|---|---:|
| Processing order missing/mismatching cancellation locks | **4** |
| New order with unexpected processing lock | **0** |
| Pending customer cancellation indicators | **3** |
| Cancelled customer orders with a recorded stock-restored flag | **3** |
| Cancelled customer orders lacking that flag | **0** |
| Cancelled card orders needing payment review | **0** |
| Cancelled orders with unknown cancellation origin | **11** |
| Invalid stored payment labels | **0** |
| Trusted lifecycle documents present | **0** |

**Interpretation:** These are independently counted indicators, not a proof
that any two categories contain the same orders. A stock-restored *flag*
does **not** establish correct inventory quantity or legitimate stock debit.
An unknown cancellation origin is **not** permission to infer customer/admin
actor, adjust stock, re-open the order, or issue a refund. Without trusted
`order_lifecycle` documents, existing client-side status/money/stock writes
must not be translated automatically to the new server lifecycle.

This is **owner-attested read-only local analysis of the encrypted backup**,
not a fresh live Firestore snapshot, full managed backup, recovery rehearsal,
or proof of real payment settlement. No private file, identifiers, passphrase,
customer data, Stripe Live key or production write was obtained from the
owner. Maintain **NO-GO** until manual legacy exception procedure, Android
device compatibility and full recovery/rollout gates are independently met.

## Owner's Android 2.3.3 connectivity acceptance (2026-11-10)

Owner confirmed via this chat that 2.3.3 shows the offline warning
when internet is cut during an open app, and then works normally with
products/images after reconnecting. Earlier 2.3.1 failed offline-cached
behavior and 2.3.2 had delayed in-session warning; 2.3.3 addresses these
two reported network cases. This is **owner-observed device behavior**,
not an APK signature/build attestation or evidence that legacy
order/admin/guest tracking, cancellation and Stripe/COD checkout are
compatible with the proposed restrictive production Rules.

Stages 4 and 5 remain **PARTIAL / NO-GO** for production. Older clients
remain a blocker; no owner approval to migrate orders, publish rules/site
or enable Stripe Live has been given.

## 2026-11-10 — Historical cancellation concurrency hardening (NO LIVE CHANGE)

The isolated legacy-admin service passed additional tests for a race between
a signed administrator status change and a customer's cancellation request:
Firestore transaction conflict causes a fresh read and **rejects** the
now-pending cancellation, without restocking products. Four synthetic
processing records with missing locks remain blocked; previously cancelled
orders with unknown cancellation origin remain immutable; customer-supplied
item quantities cannot authorize stock changes.

[180 source tests and separate Rules emulator checks](https://github.com/arif123-del/kandorty/actions/runs/42877834722)
succeeded, with no production reads/writes in those tests.

The owner-only encrypted risk checker was extended with **aggregate-only
overlap counters** for pending cancellation, lock gaps, restored-stock flags,
and unknown cancellation origin. Its
[17 synthetic checks](https://github.com/arif123-del/kandorty/actions/runs/42878539922)
passed. The new checker has **not yet** been executed by the owner on
the real encrypted file, so the actual overlap figures remain unknown.
No production migration/stock/refund/card-payment action is permitted.

## Verified test evidence

- [Current code/rules readiness](https://github.com/arif123-del/kandorty/actions/runs/42675520665): **148 code tests passed, zero failures**; rules-emulator job passed.
- [Latest successful Sandbox baseline](https://github.com/arif123-del/kandorty/actions/runs/42675227624): isolated Stripe test payments and refunds succeeded, without Live charges.
- The manual Resend test email reached the intended owner's Gmail Inbox and was shown in an owner-provided screenshot. The separate **automatic** operations alert has provider-accepted evidence in the isolated TEST Firestore operator-alert state at 2026-11-09T20:15:34.421Z, verified by a read-only GitHub Actions attempt. The automatic message's recipient inbox arrival is still unconfirmed; do not equate Resend acceptance with inbox delivery. The Gmail connector currently authenticated to a different inbox than the intended recipient and is not definitive for delivery.
- [Owner alert binding recovery](https://github.com/arif123-del/kandorty/actions/runs/42694842240): isolated TEST only, restored three previously configured alert values as encrypted Worker secrets without logging values, touching Stripe Live, or modifying production Firebase.
- [Latest code / Firebase Rules readiness](https://github.com/arif123-del/kandorty/actions/runs/42697562723): 155 code tests passed (zero failures) plus Rules compatibility checks. [Latest hosted Sandbox acceptance](https://github.com/arif123-del/kandorty/actions/runs/42697562326) succeeded. [Cloudflare TEST bindings audit](https://github.com/arif123-del/kandorty/actions/runs/42697763076) confirms Cron every five minutes, sending-only Resend secret, sender and recipient secret binding names, and secret-type alert toggle (toggle value unreadable through metadata). [TEST alert provider-state audit](https://github.com/arif123-del/kandorty/actions/runs/42697157622) found 2 provider-accepted alert records but 0 provider-delivered confirmations. This is not recipient-inbox proof.
- [Fresh 99-order historical snapshot](https://github.com/arif123-del/kandorty/actions/runs/42699507328): read-only current production count, tracking-status agreement and missing lifecycle ledger across all 99; one more order than the prior 98-count baseline. **Does not prove identical preservation of every baseline order.**
- [Legacy orders policy](LEGACY-ORDER-PRESERVATION.md), [Android findings](ANDROID-APP-COMPATIBILITY.md), [Email configuration](ALERT-EMAIL-SETUP.md), and [production no-go](PRODUCTION-GO-NOGO.md) retain separate acceptance gates.

- [Cloudflare independent alert policy read](https://github.com/arif123-del/kandorty/actions/runs/42698379876) returned `READ_ACCESS_NOT_GRANTED`, with no account or Worker mutation. This requires a different authorized read/notification workflow; no notification settings were changed.

- [Safe legacy transaction smoke](https://github.com/arif123-del/kandorty/actions/runs/42703622080): synthetic TEST order/tracking and immutable audit atomically verified; original and leftover synthetic TEST fixtures removed. [169 code tests and candidate Rules](https://github.com/arif123-del/kandorty/actions/runs/42703984347) passed. **Production old-order migration is not authorized or performed.**

- [Historical cancel/lock safety snapshot](https://github.com/arif123-del/kandorty/actions/runs/42705735191): 3 customer-cancelled with restoration flags, 4 processing orders without cancellation locks, 28 edit proof docs, 28 order access docs; count-only, no data changes.
- [Storage bucket permission check](https://github.com/arif123-del/kandorty/actions/runs/42705205226): read-only permission denied, no backup actually exported. Owner-only protected script: [private Firestore backup](owner-private-firestore-backup.sh). A protected export is still a hard pre-release gate.

- [Owner-controlled backup script static safety](https://github.com/arif123-del/kandorty/actions/runs/42707022470) **PASS**. Its code is available, but no GCS backup has been exported. [Current legacy safety code](https://github.com/arif123-del/kandorty/actions/runs/42706981495) passed **170/170 code tests**, Firebase Rules check is separately tracked; no production writes. Source-level Android offline safety is not installed-device acceptance.

## Reporting rule

When a whole stage (not just a code test or subtask) meets its acceptance
criteria, report it explicitly to the owner as:
**`Stage N — [name] — COMPLETED`**. Do not describe Stage 6 as completed
until a real automatically triggered email reaches the inbox and the relevant
provider execution/errors/escalation paths are validated. Do not describe
Stage 7 as completed until an explicitly approved coordinated rollout and
real-money acceptance have succeeded.
