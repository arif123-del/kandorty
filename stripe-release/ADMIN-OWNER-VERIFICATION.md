# Kandorty Firebase administrator — owner-verified grant checkpoint

**STATUS: READ-ONLY AUDIT ONLY. No production Auth custom claims or Firestore writes are authorized by this document.**

The existing production site `admin.html` currently permits the configured email to sign in using Firebase email/password. That UI email is **not** sufficient proof that the current signed-in user is the authorized owner.

The release server accepts admin status changes only with BOTH (1) a correctly signed Firebase Identity token from project `kandorty-9378a` carrying `admin:true`, issued after recent reauthentication, and (2) a server-owned document `admin_access/{uid}` with `active:true` and numeric `validAfter` in Unix seconds. The server denies all other users. The proposed Firestore Rules are **not deployed**.

## Current safe read-only evidence

`.github/workflows/stripe-release-prod-admin-audit.yml` uses the existing GitHub Actions secret in runner memory and calls Firebase Auth `getUserByEmail` and Firestore document `get` only. It discovers the email from the currently shipped admin source, never hardcodes it again or logs the email, UID, token, credentials, claims, or membership content. It reports only yes/no eligibility flags. If Firebase Auth permissions are insufficient, its lookup reports blocked rather than escalating roles.

An existing earlier audit found zero active memberships. This alone blocks live server admin operations. The audit cannot certify which person truly owns the email account. A real sign-in by the owner in the authenticated Firebase Console and verified UID comparison are mandatory prior to granting privileges.

## Production grant (NOT executed, separately owner-approved later)

1. Owner signs into **Firebase Console** for `kandorty-9378a` and reviews **Authentication → Users**. Confirm the intended email-auth account, verified email, correct UID, and not disabled. Do not paste passwords, ID tokens, refresh tokens, service accounts, or secrets in chat.
2. An authenticated authorized owner must explicitly approve **that existing UID** as sole backend administrator. A matching email string alone is not authorization.
3. From a trusted, restricted owner-controlled environment, use Firebase Admin SDK `setCustomUserClaims(uid,{...previousClaims,admin:true})` without erasing other claims, and create **only** `admin_access/{uid}` with `active:true` and `validAfter` set to current UTC Unix seconds. If either operation fails, immediately disable membership; keep checkout closed. DO NOT touch orders, stock, rules or Ziina.
4. Ask the owner to sign out/in (new ID token), then test a fresh admin request with test-mode/isolated backend and confirmed membership; require a fresh auth_time and verify signed UID.
5. Validate removal/revocation: disable membership and confirm the endpoint returns 403; then restore only after separate approval. Do not claim tested production admin access while `STRIPE_MODE=disabled`.
6. No Live activation or production rules/storefront changes until compatibility migration and the 98 historical orders policy are accepted.

Never put UID/email/secret values in public PR comments or CI logs.

## Actual read-only attempt and current blocker (2026-10-30)

GitHub Actions [production admin audit run 41026179282](https://github.com/arif123-del/kandorty/actions/runs/41026179282) validated the production service-account project identity, but Firebase Authentication `getUserByEmail` returned **`auth/insufficient-permission`**. Logs were sanitized to show `ADMIN_AUDIT AUTH_LOOKUP: IAM_PERMISSION_DENIED`. Therefore **the real Firebase Auth user has NOT been verified by the runner**, and no current Auth custom-claim or server-membership readiness conclusion can be drawn from this attempt. Older Firestore aggregate audit found zero active server memberships, but that snapshot should be refreshed via least-privilege read-only Firestore access before the final grant.

Do **NOT** give the Firestore service account general Authentication Admin or Owner rights simply to make a diagnostic pass. Safer next action: owner signs into [Firebase console](https://console.firebase.google.com/project/kandorty-9378a/authentication/users) on their own browser and verifies the existing admin email-auth user and UID (without sharing passwords, tokens or private keys). A different, separately approved least-privilege identity-viewer process may be designed if owner expressly approves. The production Auth claim and membership remain unchanged.
