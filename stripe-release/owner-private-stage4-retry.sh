#!/usr/bin/env bash
# Owner-only, interactive and demo-loopback Firestore private recovery rehearsal.
# Never create a cloud Firestore database, export user files or deploy any Worker.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ ! -t 0 ]]; then
  echo 'LOCAL_STAGE4_RUN_REQUIRES_PRIVATE_INTERACTIVE_SHELL'
  exit 2
fi
for tool in python3 java node npm npx; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo 'LOCAL_STAGE4_REQUIRED_TOOL_MISSING'
    exit 2
  fi
done
if [[ -n "${FIRESTORE_EMULATOR_HOST:-}" ]]; then
  echo 'LOCAL_STAGE4_ALREADY_IN_EMULATOR_REFUSED'
  exit 2
fi
if [[ ! -f stripe-release/stage4-private-recovery.firebase.json ]] || 
   [[ ! -f stripe-release/owner-private-firestore-emulator-replay.py ]]; then
  echo 'LOCAL_STAGE4_SOURCE_MISSING'
  exit 2
fi
echo 'LOCAL_STAGE4_SYNTHETIC_SECURITY_TESTS: START'
python3 -m unittest discover -s stripe-release -p 'test_owner_private_firestore_emulator_replay.py' -v
echo 'LOCAL_STAGE4_SYNTHETIC_SECURITY_TESTS: PASS'
echo 'LOCAL_STAGE4_EMULATOR: LOOPBACK_ONLY_FAKE_PROJECT'
# This is local CLI invocation, no GCP credentials; executable receives only
# the owner's GPG passphrase privately through the interactive prompt.
env -u GOOGLE_APPLICATION_CREDENTIALS -u FIREBASE_SERVICE_ACCOUNT_JSON \
  -u FIREBASE_TOKEN -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET \
  npx --yes firebase-tools@14 emulators:exec \
  --only firestore --project demo-kandorty-stage4-recovery \
  --config stripe-release/stage4-private-recovery.firebase.json \
  'env GCLOUD_PROJECT=demo-kandorty-stage4-recovery GOOGLE_CLOUD_PROJECT=demo-kandorty-stage4-recovery python3 stripe-release/owner-private-firestore-emulator-replay.py'
