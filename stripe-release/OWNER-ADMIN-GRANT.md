# Owner-authorized Firebase admin provisioning (GRANTED; read-only acceptance pending)
Target project: `kandorty-9378a`. User-selected Firebase account: enter the email in the trusted Cloud Shell terminal; this repository does not hardcode that personal identifier.

**Historical note:** The owner verified the existing admin by email and executed the guarded `--apply` in Google Cloud Shell on 2026-10-30. The tool returned `ADMIN_GRANT: VERIFIED` and `NEW_LOGIN_REQUIRED: YES`. Subsequent read-only Firestore CI independently counted exactly one active membership. **Do not rerun the grant simply to continue setup.** The pending gate is a genuine fresh Firebase ID-token acceptance by the release verifier, not another privilege grant.

**Do not run `--apply` for any different user.** The existing production Stripe Worker still has `STRIPE_MODE=disabled`, `CHECKOUT_DISABLED=true`, `LIVE_RELEASE_APPROVAL=NOT_APPROVED`; no site, rules, Ziina or 98 historical orders will be changed by this script.

The existing GitHub Actions service account does **not** have Firebase Authentication permissions. Do NOT increase that service account to Owner or Auth Admin; instead execute the one-time audit and grant from the already-authorized Google Cloud project owner account in private **Google Cloud Shell**. No new service-account keys need to be created, shared or uploaded.

## One-time owner-run commands
Log into Google Cloud Console with the owner identity for the correct project; use Cloud Shell with Google Cloud Application Default Credentials under that identity. Use only a trusted account. After `gcloud auth application-default login` if ADC is not already configured:

```bash
gcloud config set project kandorty-9378a
git clone --branch stripe-live-fulfillment-hardening --single-branch https://github.com/arif123-del/kandorty.git
cd kandorty
npm install --no-save --no-package-lock --ignore-scripts firebase-admin@13
node .github/scripts/owner-firebase-admin-grant.mjs --email 'YOUR_VERIFIED_ADMIN_EMAIL'
```

The last command is **DRY-RUN ONLY**. If `EMAIL_VERIFICATION_REQUIRED`, stop and complete email verification via a genuine Firebase Auth verification flow before proceeding. Never forcibly mark arbitrary emails verified or bypass this check.

After the owner has inspected the dry-run output and confirms the exact user identity, they may run:

```bash
node .github/scripts/owner-firebase-admin-grant.mjs --email 'YOUR_VERIFIED_ADMIN_EMAIL' --apply
```

The tool asks the owner to type the exact approval phrase interactively. It reads the current user by email via Firebase Admin SDK, refuses disabled/unverified users, preserves unrelated custom claims, and creates **only** the `admin_access/{real UID}` server-owned membership. Writes are ordered with an initially disabled membership before setting admin claim; on failure it attempts a rollback. The script prints no emails/UIDs/tokens/credentials. Its dry-run and standalone guards are tested in `admin-grant-plan.test.mjs`.

Because the server checks that the token `auth_time` is newer than `validAfter`, the user must sign out and sign in again after the role is granted. Verification of actual API authorization still requires separate future release approval; do not enable Stripe Live or publish Rules just to test this one admin role.

## Owner-created password account: official email verification

If the first dry run prints `OWNER_ADMIN RESULT: EMAIL_VERIFICATION_REQUIRED`, **do not** use `--apply`, and do not mark `emailVerified=true` through privileged Admin SDK as a shortcut. The intended owner should instead run the separately prepared interactive tool from an owner-controlled Cloud Shell session:

```bash
bash .github/scripts/owner-send-verification.sh 'YOUR_NEW_FIREBASE_ACCOUNT_EMAIL'
```

The Bash prompt hides the **Firebase Authentication login password** (not the Gmail password) and neither writes it to disk nor prints it in the shell. The script obtains only the public Web API key from `admin.html`, signs in as exactly that Firebase account using official Identity Toolkit API, then requests Firebase to email a `VERIFY_EMAIL` message to that signed-in user's inbox. No admin claim, rule, order, membership, Stripe, or Ziina is changed. The owner must open their Gmail inbox and follow the received verification link. **Do not share any password or verification link in chat.** After verifying, rerun `node .github/scripts/owner-firebase-admin-grant.mjs --email 'YOUR_NEW_FIREBASE_ACCOUNT_EMAIL'` without `--apply` and inspect readiness before any permission grant.

## Next: safe read-only server-verifier acceptance (NOT YET EXECUTED)

In the existing owner-authorized Cloud Shell, on the reviewed draft branch and already installed `firebase-admin`, run:

```bash
cd ~/kandorty
git pull --ff-only
bash stripe-release/owner-admin-acceptance.sh 'CURRENT_STOREFRONT_ADMIN_EMAIL'
```

Enter the **Firebase Authentication** password only at the terminal's hidden prompt. It signs in directly through Firebase Identity Toolkit and checks the resulting fresh signed ID token using **the same `verifyAdmin` code** as the release Worker, including Google's Firebase signing keys and the current production `admin_access` membership. Output contains only PASS/BLOCKED labels; it never prints password, token, UID, email or Firestore records. It does not contact the disabled release Worker, change Rules, alter orders, or enable Stripe/Ziina. Successful acceptance will close the *server-verifier identity preflight*, **not** the actual deployed Worker integration test. Keep Live NO-GO until the other gates pass.
