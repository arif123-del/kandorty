#!/usr/bin/env bash
# Owner-controlled Cloud Shell backup: never commits credentials or customer data.
# The script deliberately does NOT create a bucket, change permissions, update
# Firebase/Firestore, activate Stripe, or save backups in GitHub CI artifacts.
set -Eeuo pipefail
PROJECT='kandorty-9378a'
for executable in gcloud python3; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "ERROR: missing $executable; run in authenticated Google Cloud Shell" >&2
    exit 2
  fi
done
if [[ ! -t 0 ]]; then
  echo 'ERROR: run in your own interactive Cloud Shell; NEVER in GitHub Actions.' >&2
  exit 2
fi
echo 'Kandorty historical-order preservation: owner-controlled backup only.'
echo 'The backup includes the Firestore database, so it contains private customer data.'
echo 'It must remain in a private bucket controlled by the account owner.'
echo 'Note: Google bills Firestore document reads and Cloud Storage for exports.'
read -r -p 'Enter an existing PRIVATE Cloud Storage bucket name (no gs://): ' BUCKET
if [[ ! "$BUCKET" =~ ^[a-z0-9][a-z0-9._-]{2,61}[a-z0-9]$ ]]; then
  echo 'ERROR: invalid bucket name' >&2; exit 2
fi
project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$project_number" =~ ^[0-9]+$ ]] || { echo 'ERROR: cannot confirm owner project number' >&2; exit 2; }
bucket_json="$(gcloud storage buckets describe "gs://$BUCKET" --format=json)" || {
  echo 'ERROR: bucket unreadable; no backup started.' >&2; exit 2;
}
BUCKET_JSON="$bucket_json" PROJECT_NUMBER="$project_number" python3 - <<'PY'
import json,os,sys
try:
 b=json.loads(os.environ["BUCKET_JSON"])
 n=str(b.get("projectNumber") or "")
 p=os.environ["PROJECT_NUMBER"]
 iam=b.get("iamConfiguration") or {}
 pap=iam.get("publicAccessPrevention")
 uniform=(iam.get("uniformBucketLevelAccess") or {}).get("enabled")
 safe=(n==p and pap=="enforced" and uniform is True and
       not b.get("billing",{}).get("requesterPays",False))
 if not safe: raise ValueError("unsafe_bucket")
except Exception:
 print("ERROR: need same-project bucket, enforced public access prevention, "
       "uniform bucket-level access and no requester-pays. No backup started.",
       file=sys.stderr)
 sys.exit(2)
print("Private same-project destination preflight: PASS")
PY
prefix="kandorty-firestore-owner-backup-$(date -u +%Y%m%dT%H%M%SZ)"
destination="gs://$BUCKET/$prefix"
echo 'Backup destination verified against current project and basic privacy controls.'
echo 'Firestore managed export is NOT guaranteed to be a single point-in-time snapshot.'
read -r -p 'To export the database, type EXPORT_LEGACY_BACKUP: ' approval
if [[ "$approval" != 'EXPORT_LEGACY_BACKUP' ]]; then
  echo 'No export started.'; exit 1
fi
gcloud firestore export "$destination" --database='(default)' --project="$PROJECT"
echo "EXPORT_COMMAND_COMPLETED: $destination"
echo 'Verify the Firestore import/export job shows completed SUCCESS and backup files exist.'
echo 'Keep this destination and access under your owner-controlled Cloud account.'
echo 'The live website, Stripe Live, Firebase Rules, Ziina and all original orders were not modified.'
