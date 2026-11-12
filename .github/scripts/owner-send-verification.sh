#!/usr/bin/env bash
# Send official Firebase verification email. Does NOT grant admin or read service accounts.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ $# != 1 || ! "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
 echo "USAGE: bash .github/scripts/owner-send-verification.sh EMAIL";exit 1
fi
if [[ ! -t 0 ]]; then
 echo "Interactive terminal required";exit 1
fi
printf 'Enter the newly created FIREBASE login password (not your Gmail password). Input stays hidden.\n'
IFS= read -r -s -p 'Firebase login password: ' FIREBASE_VERIFY_PASSWORD
printf '\n'
if [[ -z "${FIREBASE_VERIFY_PASSWORD}" ]]; then
 echo 'Empty password; no request sent';exit 1
fi
export FIREBASE_VERIFY_PASSWORD
trap 'unset FIREBASE_VERIFY_PASSWORD' EXIT
node .github/scripts/owner-send-verification.mjs "$1"
