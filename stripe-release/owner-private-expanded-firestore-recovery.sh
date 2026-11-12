#!/usr/bin/env bash
# Kandorty Stage 4: owner's PRIVATE expanded Firestore encrypted data is
# restored ONLY to a freshly spawned loopback-bound FAKE-project emulator.
# NO real Firebase / Stripe / Cloudflare data or Rules writes, no exports.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ ! -t 0 ]]; then
  echo 'EXPANDED_EMULATOR_OWNER_INTERACTIVE_SHELL_REQUIRED'
  exit 2
fi
for tool in python3 java node npm npx gpg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo 'EXPANDED_EMULATOR_REQUIRED_TOOL_MISSING'
    exit 2
  fi
done
if [[ -n "${FIRESTORE_EMULATOR_HOST:-}" ]]; then
  echo 'EXPANDED_EMULATOR_ALREADY_ACTIVE_REFUSED'
  exit 2
fi
if [[ ! -f stripe-release/stage4-private-recovery.firebase.json ]] ||
   [[ ! -f stripe-release/owner-private-expanded-firestore-emulator-replay.py ]]; then
  echo 'EXPANDED_EMULATOR_SOURCE_MISSING'
  exit 2
fi
echo 'EXPANDED_EMULATOR_SYNTHETIC_TESTS: START'
python3 -m unittest discover -s stripe-release \
  -p 'test_owner_private_expanded_firestore_emulator_replay.py' -v
echo 'EXPANDED_EMULATOR_SYNTHETIC_TESTS: PASS'
echo 'EXPANDED_EMULATOR: FRESH_LOOPBACK_FAKE_PROJECT'
# Clearing service credential variables in both environments is intentional.
# Only the temporary firebase-tools emulator may handle the private fields.
env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_SERVICE_ACCOUNT_JSON \
  -u FIREBASE_TOKEN -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET \
  npx --yes firebase-tools@14 emulators:exec \
    --only firestore --project demo-kandorty-stage4-recovery \
    --config stripe-release/stage4-private-recovery.firebase.json \
    'env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_SERVICE_ACCOUNT_JSON -u FIREBASE_TOKEN -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET GCLOUD_PROJECT=demo-kandorty-stage4-recovery GOOGLE_CLOUD_PROJECT=demo-kandorty-stage4-recovery python3 stripe-release/owner-private-expanded-firestore-emulator-replay.py'
