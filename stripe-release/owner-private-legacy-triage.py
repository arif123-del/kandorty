#!/usr/bin/env python3
"""Owner-only, OFFLINE/READ-ONLY triage of the 18 private legacy exception cases.

Decrypts an existing encrypted owner-only exception docket into memory, validates
its exact aggregate provenance, and creates a SECOND encrypted evidence checklist.
Every case stays BLOCKED pending independent owner/operator evidence. It makes no
Firestore, Stripe, product, customer, payment or other production changes.
"""
import getpass
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
PRIVATE_DIR = Path.home() / 'kandorty-private-backups'
CASE_CODE = re.compile(r'^KD-?[A-Za-z0-9_-]{4,40}$')
EXPECTED_FLAGS = {
    'processing_lock_review': 4,
    'customer_cancellation_request_review': 3,
    'historical_stock_restoration_evidence_review': 3,
    'unknown_cancellation_origin_review': 11,
}
REQUIRED_EVIDENCE = {
    'processing_lock_review': (
        'independent_order_tracking_lifecycle_provenance',
        'review_missing_or_mismatched_cancellation_lock_without_auto_backfill',
        'old_client_cancel_and_stock_write_path_isolated',
    ),
    'customer_cancellation_request_review': (
        'authenticated_customer_request_and_order_state',
        'fulfilment_state_and_admin_cancel_actions',
        'independent_inventory_debit_and_credit_evidence',
        'old_auto_restocker_disabled_before_future_server_reconciliation',
    ),
    'historical_stock_restoration_evidence_review': (
        'trusted_original_inventory_debit_and_credit_evidence',
        'review_existing_restoration_marker_without_replaying_stock',
        'independent_product_stock_reconciliation',
    ),
    'unknown_cancellation_origin_review': (
        'independent_cancellation_actor_and_timestamp_evidence',
        'confirm_no_unauthorised_inventory_restoration',
        'confirm_no_order_resurrection_or_refund_from_legacy_labels',
    ),
}
BLOCKED = 'BLOCKED_PENDING_INDEPENDENT_OWNER_REVIEW'


def load_docket_module():
    path = ROOT / 'owner-private-legacy-exception-docket.py'
    spec = importlib.util.spec_from_file_location('owner_private_exception_docket_module', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_evidence_plan(docket):
    """Fail closed on stale, duplicate, altered or incomplete 99/18 docket."""
    if not isinstance(docket, dict):
        raise ValueError('invalid_docket')
    if docket.get('format') != 'kandorty-private-legacy-exception-docket-v1' or (
            docket.get('sourceProject') != 'kandorty-9378a'):
        raise ValueError('wrong_docket_source')
    if type(docket.get('ordersInspected')) is not int or docket['ordersInspected'] != 99:
        raise ValueError('unexpected_order_count')
    if type(docket.get('uniqueOrdersRequiringReview')) is not int or (
            docket['uniqueOrdersRequiringReview'] != 18):
        raise ValueError('unexpected_exception_count')
    if docket.get('cutoverAuthorized') is not False or (
            docket.get('automaticStockRestorationAuthorized') is not False) or (
            docket.get('refundAuthorized') is not False):
        raise ValueError('unsafe_source_authorizations')
    if docket.get('riskCategoryCounts') != EXPECTED_FLAGS:
        raise ValueError('unexpected_risk_categories')
    records = docket.get('records')
    if not isinstance(records, list) or len(records) != 18:
        raise ValueError('invalid_case_list')
    seen = set()
    observed = {key: 0 for key in EXPECTED_FLAGS}
    review_items = []
    for record in records:
        if not isinstance(record, dict) or set(record) != {
                'orderCode', 'status', 'paymentType', 'reviewOnlyFlags'}:
            raise ValueError('invalid_case_fields')
        code = record['orderCode']
        if not isinstance(code, str) or not CASE_CODE.fullmatch(code) or code in seen:
            raise ValueError('duplicate_or_invalid_code')
        seen.add(code)
        status, payment, flags = record['status'], record['paymentType'], record['reviewOnlyFlags']
        if status not in ('new', 'preparing', 'shipping', 'delivered', 'cancelled'):
            raise ValueError('unknown_case_status')
        if payment not in ('cod', 'card'):
            raise ValueError('unknown_case_payment')
        if not isinstance(flags, list) or not flags or len(flags) != len(set(flags)):
            raise ValueError('missing_or_duplicate_case_flags')
        if not set(flags).issubset(EXPECTED_FLAGS):
            raise ValueError('unsafe_case_flags')
        for key in flags:
            observed[key] += 1
        checklist = sorted({evidence for key in flags for evidence in REQUIRED_EVIDENCE[key]})
        if payment == 'card':
            checklist.append('independent_stripe_provider_payment_or_refund_evidence_if_applicable')
            checklist.sort()
        review_items.append({
            'orderCode': code,
            'statusAtBackup': status,
            'paymentLabelAtBackup': payment,
            'exceptionFlags': sorted(flags),
            'requiredEvidenceBeforeDecision': checklist,
            'operatorDisposition': BLOCKED,
            'productionChangeAuthorized': False,
            'stockRestorationAuthorized': False,
            'refundAuthorized': False
        })
    if observed != EXPECTED_FLAGS:
        raise ValueError('risk_count_or_overlap_mismatch')
    return {
        'format': 'kandorty-private-legacy-evidence-plan-v1',
        'sourceProject': 'kandorty-9378a',
        'casesInspected': len(review_items),
        'casesBlocked': len(review_items),
        'casesApprovedForProductionChange': 0,
        'sourceRiskCategoryCounts': dict(sorted(observed.items())),
        'manualReviewRequired': True,
        'cutoverAuthorized': False,
        'records': sorted(review_items, key=lambda row: row['orderCode']),
        'notice': 'Checklist is not proof. Independently inspect evidence under owner control. No automatic status/stock/refund change.'
    }


def select_private_docket():
    directory = PRIVATE_DIR
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('private_directory_unavailable')
    matches = [p for p in directory.glob('legacy-manual-review-*.json.gpg')
               if p.is_file() and not p.is_symlink()]
    if not matches:
        raise ValueError('private_docket_not_found')
    return max(matches, key=lambda p: p.stat().st_mtime)


def main():
    print('KANDORTY_PRIVATE_18_CASE_EVIDENCE_PLAN (OFFLINE/READ ONLY)')
    print('No customer identities or order codes will be printed.')
    if len(sys.argv) > 2:
        raise ValueError('usage: optional_existing_private_docket_path_only')
    private_path = Path(sys.argv[1]).expanduser() if len(sys.argv) == 2 else select_private_docket()
    if private_path.resolve().parent != PRIVATE_DIR.resolve() or not private_path.name.startswith('legacy-manual-review-'):
        raise ValueError('docket_must_be_in_private_directory')
    password = getpass.getpass('Private local GPG password (never share): ')
    source = load_docket_module()
    docket = source.decrypt_private_backup(private_path, password)
    plan = build_evidence_plan(docket)
    output = PRIVATE_DIR / (
        'legacy-evidence-plan-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json.gpg')
    source.save_encrypted_docket(plan, output, password)
    print('CASES_READ_FROM_PRIVATE_DOCKET:', plan['casesInspected'])
    print('CASES_NEEDING_INDEPENDENT_EVIDENCE:', plan['casesBlocked'])
    print('PRODUCTION_CHANGES_AUTHORIZED:', plan['casesApprovedForProductionChange'])
    for key, count in plan['sourceRiskCategoryCounts'].items():
        print('EVIDENCE_REVIEW_FLAG_' + key.upper() + ':', count)
    print('PRIVATE_ENCRYPTED_EVIDENCE_PLAN_CREATED: YES')
    print('PRIVATE_OUTPUT:', output)
    print('FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')
    print('Do not upload this private file or its decrypted contents.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        print('PRIVATE_TRIAGE_NOT_COMPLETED: check local encrypted docket and GPG setup',
              file=sys.stderr)
        sys.exit(2)
