# Owner-authorized Firebase admin provisioning (PREPARED, NOT EXECUTED)
Target project: `kandorty-9378a`. User-selected Firebase account: enter the email in the trusted Cloud Shell terminal; this repository does not hardcode that personal identifier.

**Do not run `--apply` until the owner confirms the correct user and the account is email-verified.** The existing production Stripe Worker still has `STRIPE_MODE=disabled`, `CHECKOUT_DISABLED=true`, `LIVE_RELEASE_APPROVAL=NOT_APPROVED`; no site, rules, Ziina or 98 historical orders will be changed by this script.

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
