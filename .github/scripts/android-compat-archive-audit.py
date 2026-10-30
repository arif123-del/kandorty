#!/usr/bin/env python3
"""Read-only, privacy-safe static inventory of the EXISTING Kandorty Android ZIP.
Never extract, execute, print source, URLs, keys, customer data, or file contents.
This V1 source cannot prove compatibility of a later installed Android APK.
"""
from __future__ import annotations
import pathlib
import re
import sys
import zipfile
from collections import Counter

ARCHIVE = pathlib.Path('KandortyAndroid_v1_source.zip')
TEXT_EXT = ('.java', '.kt', '.xml', '.html', '.htm', '.js', '.json', '.gradle', '.kts', '.dart', '.properties')
MAX_MEMBERS = 2500
MAX_TOTAL_SIZE = 45 * 1024 * 1024
MAX_MEMBER_SIZE = 2 * 1024 * 1024

def scan(path: pathlib.Path) -> int:
    if not path.is_file() or not zipfile.is_zipfile(path):
        print('ANDROID_ARCHIVE: MISSING_OR_INVALID')
        return 2
    with zipfile.ZipFile(path) as arc:
        entries = [info for info in arc.infolist() if not info.is_dir()]
        if len(entries) > MAX_MEMBERS or sum(info.file_size for info in entries) > MAX_TOTAL_SIZE:
            print('ANDROID_ARCHIVE: SIZE_LIMIT_EXCEEDED')
            return 2
        src = []
        counts = Counter()
        markers = {
            'ANDROID_MANIFEST': False,
            'ANDROID_GRADLE_PROJECT': False,
            'NATIVE_SOURCE': False,
            'FLUTTER_SOURCE': False,
            'WEBVIEW': False,
            'WEBVIEW_JAVASCRIPT_ENABLED': False,
            'FIRESTORE_SDK': False,
            'FIREBASE_AUTH_SDK': False,
            'ORDER_COLLECTION_ACCESS': False,
            'CLIENT_TRANSACTION_API': False,
            'CLIENT_WRITE_CALLS': False,
            'KANDORTY_DOT_ONLINE_URL': False,
            'LEGACY_KANDORTY_DOT_COM_URL': False,
            'STRIPE_PAYMENT_REFERENCE': False,
            'ZIINA_PAYMENT_REFERENCE': False,
            'CASH_ON_DELIVERY_REFERENCE': False
        }
        for info in entries:
            name = info.filename.replace('\\','/').lower()
            if name.endswith('androidmanifest.xml'):
                markers['ANDROID_MANIFEST'] = True
            if name.endswith(('build.gradle','build.gradle.kts','settings.gradle','settings.gradle.kts')):
                markers['ANDROID_GRADLE_PROJECT'] = True
            if name.endswith(('.java','.kt')): markers['NATIVE_SOURCE'] = True
            if name.endswith('.dart'): markers['FLUTTER_SOURCE'] = True
            for ext in TEXT_EXT:
                if name.endswith(ext):
                    counts[ext] += 1
                    break
            if not name.endswith(TEXT_EXT) or info.file_size > MAX_MEMBER_SIZE:
                continue
            try:
                content = arc.read(info).decode('utf-8',errors='replace')
            except (RuntimeError, zipfile.BadZipFile):
                continue
            src.append(content)
        entire = '\n'.join(src)
        checks = {
            'WEBVIEW': r'\\bWebView\\b|\\bwebview_flutter\\b',
            'WEBVIEW_JAVASCRIPT_ENABLED': r'setJavaScriptEnabled\\s*\\(\\s*true|JavaScriptMode\\.unrestricted',
            'FIRESTORE_SDK': r'FirebaseFirestore|cloud_firestore|firebase-firestore',
            'FIREBASE_AUTH_SDK': r'FirebaseAuth|firebase_auth|firebase-auth',
            'ORDER_COLLECTION_ACCESS': r'''collection\\s*\\(\\s*['"]orders['"]\\s*\\)|collection\\s*\\(\\s*['"]tracking['"]\\s*\\)''',
            'CLIENT_TRANSACTION_API': r'\\brunTransaction\\s*\\(|\\brunTransaction\\b|\\bwriteBatch\\s*\\(',
            'CLIENT_WRITE_CALLS': r'\\.set\\s*\\(|\\.update\\s*\\(|\\.add\\s*\\(|\\.delete\\s*\\(',
            'KANDORTY_DOT_ONLINE_URL': r'kandorty\\.online',
            'LEGACY_KANDORTY_DOT_COM_URL': r'kandorty\\.com',
            'STRIPE_PAYMENT_REFERENCE': r'(?i)stripe|checkout\\.stripe',
            'ZIINA_PAYMENT_REFERENCE': r'(?i)ziina',
            'CASH_ON_DELIVERY_REFERENCE': r'(?i)cash.on.delivery|\\bCOD\\b|الدفع عند الاستلام'
        }
        for key, pattern in checks.items():
            markers[key] = bool(re.search(pattern, entire, re.IGNORECASE))
        print('ANDROID_ARCHIVE: READ_ONLY_INVENTORY_COMPLETE')
        print('ANDROID_ARCHIVE_ENTRIES: '+str(len(entries)))
        print('ANDROID_SOURCE_TEXT_FILES: '+str(sum(counts.values())))
        print('ANDROID_JAVA_FILES: '+str(counts['.java']))
        print('ANDROID_KOTLIN_FILES: '+str(counts['.kt']))
        print('ANDROID_DART_FILES: '+str(counts['.dart']))
        print('ANDROID_XML_FILES: '+str(counts['.xml']))
        for key, found in markers.items():
            print('ANDROID_SIGNAL_'+key+': '+('PRESENT' if found else 'NOT_DETECTED'))
        print('ANDROID_SOURCE_VINTAGE: V1_ARCHIVE_NOT_LATEST_INSTALLED_APP_PROOF')
        print('ANDROID_COMPATIBILITY: NOT_CERTIFIED_BY_STATIC_SCAN')
        print('ANDROID_PRODUCTION_WRITES: NONE')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(scan(ARCHIVE))
    except Exception:
        print('ANDROID_ARCHIVE: SCAN_BLOCKED')
        sys.exit(2)
