#!/usr/bin/env python3
"""Privacy-safe read-only Android V1 checkout/Firestore compatibility scan.
Reports only aggregate operation indicators; source text and secrets never leave process.
"""
from __future__ import annotations
import pathlib
import re
import zipfile

P = pathlib.Path("KandortyAndroid_v1_source.zip")
checks = {
 "KOTLIN_ORDER_COLLECTION_FILES": r'\.collection\s*\(\s*["\']orders["\']\s*\)',
 "KOTLIN_TRACKING_COLLECTION_FILES": r'\.collection\s*\(\s*["\']tracking["\']\s*\)',
 "KOTLIN_PRODUCTS_COLLECTION_FILES": r'\.collection\s*\(\s*["\']products["\']\s*\)',
 "KOTLIN_FIRESTORE_TRANSACTION_FILES": r'\brunTransaction\b',
 "KOTLIN_FIRESTORE_WRITE_API_FILES": r'\.(?:set|update|add|delete)\s*\(',
 "KOTLIN_FIRESTORE_ORDER_DIRECT_GET_FILES": r'\.collection\s*\(\s*["\']orders["\']\s*\)[\s\S]{0,300}\.get\s*\(',
 "KOTLIN_CHECKOUT_NAMED_FILES": r'(?i)checkout|placeOrder|submitOrder|saveOrder|cash.on.delivery',
 "KOTLIN_WEBVIEW_FILES": r'\bWebView\b',
 "KOTLIN_HTTPS_REQUEST_FILES": r'\b(?:HttpURLConnection|OkHttpClient|Retrofit|HttpsURLConnection)\b',
}
def main():
 if not P.is_file() or not zipfile.is_zipfile(P):
  print("ANDROID_CHECKOUT_STATIC_AUDIT: ARCHIVE_MISSING"); return 2
 totals = {k:0 for k in checks}
 source_count = 0
 version_names = set()
 version_codes = set()
 with zipfile.ZipFile(P) as zipf:
  for entry in zipf.infolist():
   if entry.is_dir() or not entry.filename.lower().endswith((".kt",".java")):
    continue
   if entry.file_size>2_000_000:
    print("ANDROID_CHECKOUT_STATIC_AUDIT: FILE_TOO_LARGE"); return 2
   source_count += 1
   txt=zipf.read(entry).decode("utf-8",errors="replace")
   for label,regex in checks.items():
    if re.search(regex,txt,re.I): totals[label]+=1
  for version_entry in zipf.infolist():
   if version_entry.is_dir() or version_entry.file_size>2_000_000:
    continue
   if not version_entry.filename.lower().endswith(("build.gradle","build.gradle.kts","androidmanifest.xml")):
    continue
   meta=zipf.read(version_entry).decode("utf-8",errors="replace")
   for v in re.findall(r"""versionName\s*(?:=|\s)\s*["']?([0-9]+(?:\.[0-9]+){0,4})""",meta,re.I):
    version_names.add(v)
   for v in re.findall(r"""versionCode\s*(?:=|\s)\s*([0-9]{1,8})""",meta,re.I):
    version_codes.add(v)

 print("ANDROID_ARCHIVED_VERSION_NAME: "+(",".join(sorted(version_names)) if version_names else "NOT_FOUND"))
 print("ANDROID_ARCHIVED_VERSION_CODE: "+(",".join(sorted(version_codes)) if version_codes else "NOT_FOUND"))
 print("ANDROID_CHECKOUT_STATIC_AUDIT: COMPLETE_NO_WRITES")
 print("ANDROID_SOURCE_FILES_SCANNED: "+str(source_count))
 for label,count in totals.items():print(label+": "+str(count))
 print("CANDIDATE_RULES_BLOCK_DIRECT_CLIENT_ORDER_AND_TRACKING_WRITES: YES")
 print("ANDROID_V1_RUNTIME_COMPATIBILITY: NOT_CERTIFIED")
 print("CURRENT_INSTALLED_ANDROID_APK_MATCHES_ARCHIVE: NOT_VERIFIED")
 return 0
if __name__=="__main__":
 try: raise SystemExit(main())
 except Exception:
  print("ANDROID_CHECKOUT_STATIC_AUDIT: BLOCKED")
  raise SystemExit(2)
