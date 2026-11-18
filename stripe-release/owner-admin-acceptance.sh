#!/usr/bin/env bash
# Owner-side, read-only Firebase server-admin acceptance. Password input is hidden.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# != 1 || ! "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
 echo 'USAGE: bash stripe-release/owner-admin-acceptance.sh ADMIN_EMAIL'; exit 1
fi
if [[ ! -t 0 ]]; then echo 'Interactive terminal required'; exit 1; fi
printf 'Firebase Authentication password for the existing admin (NOT your Gmail password). Input is hidden.\n'
IFS= read -r -s -p 'Firebase password: ' FIREBASE_ADMIN_ACCEPT_PASSWORD
printf '\n'
if [[ -z "${FIREBASE_ADMIN_ACCEPT_PASSWORD}" ]]; then echo 'Empty password; no request sent';exit 1;fi
export FIREBASE_ADMIN_ACCEPT_PASSWORD
trap 'unset FIREBASE_ADMIN_ACCEPT_PASSWORD' EXIT
node stripe-release/owner-admin-acceptance.mjs "$1"
