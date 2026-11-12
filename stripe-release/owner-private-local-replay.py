#!/usr/bin/env python3
"""Owner-only in-memory replay of the five-collection Kandorty private snapshot.

This is a LOCAL data-integrity roundtrip in an ephemeral SQLite :memory:
database. It is NOT a managed Firestore export, Firestore restore, recovery
drill, rollback, or authorization to deploy. There are no network calls and
no plaintext backup files or local SQLite database files. Never prints customer/order details or GPG password.
"""
import getpass
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

BASE = Path(__file__).resolve().parent
PRIVATE_BACKUP = (Path.home() / 'kandorty-private-backups'
                  / 'kandorty-orders-20261110T103014Z.json.gpg')
EXPECTED_ORDERS = 99
EXPECTED_TOTAL = 254


def load(filename, module_name):
    spec = importlib.util.spec_from_file_location(module_name, BASE / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def canonical(doc):
    """Exact JSON value types are kept; key ordering is normalized only in memory."""
    return json.dumps(doc, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def replay_in_memory(data):
    """Replay every document into isolated SQLite RAM and compare all fields.

    No actual Firestore database, emulator, local .db files or temporary
    plaintext files are used. This cannot prove that a Firestore restore works.
    """
    verifier = load('owner-private-local-backup-review.py', 'kandorty_local_replay_verifier')
    original_summary = verifier.review_structure(data)
    if original_summary['orders'] != EXPECTED_ORDERS or (
            original_summary['total'] != EXPECTED_TOTAL):
        raise ValueError('private_snapshot_baseline_changed_reaudit_required')
    original_collections = data['collections']
    # Strict grouping and names are validated by review_structure above.
    root = 'projects/kandorty-9378a/databases/(default)/documents/'
    try:
        with sqlite3.connect(':memory:') as conn:
            conn.execute('PRAGMA temp_store = MEMORY')
            conn.execute('PRAGMA journal_mode = MEMORY')
            conn.execute('CREATE TABLE snapshot_docs('
                         'collection_name TEXT NOT NULL, '
                         'doc_id TEXT NOT NULL, '
                         'doc_payload BLOB NOT NULL, '
                         'PRIMARY KEY(collection_name, doc_id))')
            expected = {}
            for collection, docs in original_collections.items():
                prefix = root + collection + '/'
                for doc in docs:
                    doc_id = doc['name'][len(prefix):]
                    raw = canonical(doc)
                    key = (collection, doc_id)
                    expected[key] = hashlib.sha256(raw).digest()
                    conn.execute('INSERT INTO snapshot_docs VALUES (?, ?, ?)',
                                 (collection, doc_id, raw))
            # Same private in-memory connection can read rows before the
            # implicit context-manager commit; no explicit commit call needed.
            replayed = {collection: [] for collection in original_collections}
            seen = set()
            for collection, doc_id, raw in conn.execute(
                    'SELECT collection_name, doc_id, doc_payload '
                    'FROM snapshot_docs ORDER BY collection_name, doc_id'):
                key = (collection, doc_id)
                if key not in expected or key in seen or (
                        hashlib.sha256(raw).digest() != expected[key]):
                    raise ValueError('replayed_document_digest_mismatch')
                seen.add(key)
                doc = json.loads(raw)
                if doc.get('name') != root + collection + '/' + doc_id:
                    raise ValueError('replayed_document_identity_mismatch')
                replayed[collection].append(doc)
            if seen != set(expected):
                raise ValueError('replayed_document_missing')
            # Revalidate order/tracking identity + status after the roundtrip.
            recovered = {
                'format': data['format'],
                'sourceProject': data['sourceProject'],
                'database': data['database'],
                'collections': replayed
            }
            replayed_summary = verifier.review_structure(recovered)
            if replayed_summary != original_summary:
                raise ValueError('replayed_aggregate_mismatch')
            # Original order of documents may vary; equality is by path+full
            # canonical fields, not array ordering.
            originals = {(coll, doc['name'][len(root + coll + '/'):]): canonical(doc)
                         for coll, docs in original_collections.items()
                         for doc in docs}
            after = {(coll, doc['name'][len(root + coll + '/'):]): canonical(doc)
                     for coll, docs in replayed.items() for doc in docs}
            if originals != after:
                raise ValueError('replayed_firestore_fields_mismatch')
            return {'orders': original_summary['orders'],
                    'tracking': original_summary['tracking'],
                    'total_documents': original_summary['total'],
                    'matching_statuses': original_summary['matching_statuses'],
                    'replayed_documents': len(seen),
                    'value_roundtrip_matching': True}
    except sqlite3.Error:
        raise ValueError('local_sqlite_replay_failed') from None


def main():
    print('KANDORTY_OWNER_LOCAL_IN_MEMORY_REPLAY (READ ONLY)')
    print('No original order codes or customer details will be printed.')
    if len(sys.argv) > 2:
        raise ValueError('one_optional_private_backup_path')
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) == 2 else PRIVATE_BACKUP
    password = getpass.getpass('Private backup GPG password (never share): ')
    loader = load('owner-private-legacy-exception-docket.py',
                  'kandorty_private_replay_decryptor')
    data = loader.decrypt_private_backup(path, password)
    result = replay_in_memory(data)
    print('SOURCE_ORDERS:', result['orders'])
    print('SOURCE_TRACKING:', result['tracking'])
    print('SOURCE_DOCUMENTS:', result['total_documents'])
    print('REPLAYED_IN_MEMORY_DOCUMENTS:', result['replayed_documents'])
    print('ORDER_TRACKING_STATUS_MATCHING:', result['matching_statuses'])
    print('FULL_DOCUMENT_VALUE_ROUNDTRIP: PASS')
    print('LOCAL_IN_MEMORY_REPLAY: PASS')
    print('FIRESTORE_MANAGED_EXPORT_OR_ACTUAL_RESTORE: NOT TESTED')
    print('SUBCOLLECTIONS_STORAGE_AUTH_RULES_BACKED_UP: NOT VERIFIED')
    print('PRODUCTION_WRITES_OR_RELEASE_AUTHORIZED: NO')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.TimeoutExpired,
            json.JSONDecodeError, OverflowError):
        print('LOCAL_REPLAY_NOT_COMPLETED: private validation failed',
              file=sys.stderr)
        sys.exit(2)
