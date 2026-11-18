#!/usr/bin/env python3
"""Owner-only encrypted manual-review docket from an existing PRIVATE local backup.

Offline/read-only, never connects to Firebase, never alters orders, inventory,
refunds or Rules. The docket contains order codes, coarse statuses and risk tags
ONLY; no customer records, line items or payment transaction details. It is
written encrypted, never as a plaintext file. Do not publish the resulting GPG.
"""
import getpass
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
HOME = Path.home()
PRIVATE_DIR = HOME / 'kandorty-private-backups'
DEFAULT_BACKUP = PRIVATE_DIR / 'kandorty-orders-20261110T103014Z.json.gpg'
MAX_ENCRYPTED = 200 * 1024 * 1024
MAX_DECRYPTED = 500 * 1024 * 1024


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


risk = load('owner_legacy_risk_docket', 'owner-private-legacy-risk-report.py')


def build_docket(data):
    """Validate first; produce minimum-case private manual review only."""
    aggregate = risk.aggregate_risks(data)
    pref = 'projects/kandorty-9378a/databases/(default)/documents/'
    tracks = {doc['name'][len(pref+'tracking/'):]: doc['fields']
              for doc in data['collections']['tracking']}
    ledger_ids = {doc['name'][len(pref+'order_lifecycle/'):] for doc in
                  data['collections']['order_lifecycle']}
    items = []
    category_counts = {}
    for doc in data['collections']['orders']:
        code = doc['name'][len(pref+'orders/'):]
        order, track = doc['fields'], tracks[code]
        status = risk.prop(order, 'status')
        payment = risk.prop(order, 'payment')
        origin = risk.prop(order, 'cancelledBy')
        order_lock = risk.prop(order, 'cancellationLockedAt')
        track_lock = risk.prop(track, 'cancellationLockedAt')
        pending = any((risk.nested(order,'customerEdit','cancelRequestedAt'),
                       risk.nested(track,'customerEdit','cancelRequestedAt'),
                       risk.prop(order,'cancelRequestedAt'),
                       risk.prop(track,'cancelRequestedAt')))
        restored = bool(risk.prop(order,'cancelStockRestoredAt'))
        tags = []
        if status in ('preparing','shipping','delivered') and (
                not order_lock or not track_lock or order_lock != track_lock):
            tags.append('processing_lock_review')
        if status == 'new' and (order_lock or track_lock):
            tags.append('unexpected_new_order_lock_review')
        if pending:
            tags.append('customer_cancellation_request_review')
        if status == 'cancelled':
            if origin not in ('admin','customer'):
                tags.append('unknown_cancellation_origin_review')
            if payment == 'card':
                tags.append('cancelled_card_payment_evidence_review')
            if origin == 'customer' and not restored:
                tags.append('customer_cancellation_stock_marker_absent_review')
        if restored:
            tags.append('historical_stock_restoration_evidence_review')
        if payment not in ('cod','card'):
            tags.append('unknown_payment_label_review')
        if status not in ('new','preparing','shipping','delivered','cancelled'):
            tags.append('unknown_status_review')
        if code in ledger_ids:
            tags.append('trusted_lifecycle_presence_review')
        if tags:
            tags = sorted(set(tags))
            for tag in tags:
                category_counts[tag] = category_counts.get(tag,0) + 1
            items.append({'orderCode':code,
                          'status':status if status in ('new','preparing','shipping','delivered','cancelled') else 'other',
                          'paymentType':payment if payment in ('cod','card') else 'other',
                          'reviewOnlyFlags':tags})
    items.sort(key=lambda row:row['orderCode'])
    return {
        'format':'kandorty-private-legacy-exception-docket-v1',
        'sourceProject':'kandorty-9378a',
        'ordersInspected':aggregate['orders'],
        'totalDocumentsInspected':aggregate['total'],
        'uniqueOrdersRequiringReview':len(items),
        'riskCategoryCounts':dict(sorted(category_counts.items())),
        'records':items,
        'cutoverAuthorized':False,
        'automaticStockRestorationAuthorized':False,
        'refundAuthorized':False,
        'note':'Private manual review only. Never use flags as proof of payment, stock debit, refund or cancellation actor.'
    }


def decrypt_private_backup(path, password):
    if not shutil.which('gpg') or not path.is_file() or path.is_symlink():
        raise ValueError('private_backup_unavailable')
    if not path.name.endswith('.json.gpg') or not (0 < path.stat().st_size <= MAX_ENCRYPTED):
        raise ValueError('private_backup_invalid_size_or_name')
    if len(password) < 12:
        raise ValueError('private_password_too_short')
    result = subprocess.run(
        ['gpg','--batch','--quiet','--pinentry-mode','loopback',
         '--passphrase-fd','0','--decrypt',str(path)],
        input=(password+'\n').encode('utf-8'), stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, check=False, timeout=240)
    if result.returncode or not (0 < len(result.stdout) <= MAX_DECRYPTED):
        raise ValueError('private_decryption_or_integrity_failed')
    return json.loads(result.stdout)


def save_encrypted_docket(docket, destination, password):
    """GPG reads plaintext stdin and secret from a separate inherited pipe.

    No plaintext temporary files, password args, password env vars or output logs.
    """
    if not shutil.which('gpg') or not isinstance(password,str) or len(password) < 12:
        raise ValueError('gpg_or_password_unavailable')
    if destination.suffix != '.gpg' or destination.exists() or destination.is_symlink():
        raise ValueError('unsafe_or_existing_output')
    directory = destination.parent
    if directory.is_symlink() or directory.resolve() != PRIVATE_DIR.resolve():
        raise ValueError('output_must_be_private_backup_directory')
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    directory.chmod(0o700)
    plaintext = (json.dumps(docket,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode('utf-8')
    old_umask = os.umask(0o077)
    temp = destination.with_name(destination.name+'.partial')
    read_fd, write_fd = os.pipe()
    try:
        if temp.exists() or temp.is_symlink():
            raise ValueError('unsafe_existing_partial_output')
        proc = subprocess.Popen(
            ['gpg','--batch','--quiet','--yes','--pinentry-mode','loopback',
             '--no-symkey-cache','--cipher-algo','AES256','--symmetric',
             '--passphrase-fd',str(read_fd),'--output',str(temp)],
            stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
            pass_fds=(read_fd,))
        os.close(read_fd)
        read_fd = -1
        os.write(write_fd,(password+'\n').encode('utf-8'))
        os.close(write_fd)
        write_fd = -1
        _, _ = proc.communicate(input=plaintext,timeout=180)
        if proc.returncode or not temp.is_file() or temp.stat().st_size == 0:
            raise ValueError('private_encryption_failed')
        temp.chmod(0o600)
        os.replace(temp,destination)
    finally:
        if read_fd >= 0: os.close(read_fd)
        if write_fd >= 0: os.close(write_fd)
        if temp.exists(): temp.unlink()
        os.umask(old_umask)
    return destination


def main():
    if len(sys.argv) > 2:
        raise ValueError('usage_private_backup_path_only')
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) == 2 else DEFAULT_BACKUP
    print('KANDORTY_LEGACY_PRIVATE_EXCEPTION_DOCKET — OFFLINE / READ ONLY')
    print('Customer information and order codes will NOT be printed.')
    password = getpass.getpass('Private backup password (never share): ')
    data = decrypt_private_backup(path,password)
    docket = build_docket(data)
    now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = PRIVATE_DIR / ('legacy-manual-review-'+now+'.json.gpg')
    save_encrypted_docket(docket,output,password)
    print('BACKUP_ORDERS_INSPECTED:',docket['ordersInspected'])
    print('UNIQUE_ORDERS_REQUIRING_REVIEW:',docket['uniqueOrdersRequiringReview'])
    for key,n in docket['riskCategoryCounts'].items():
        print('REVIEW_FLAG_'+key.upper()+':',n)
    print('PRIVATE_ENCRYPTED_DOCKET_CREATED: YES')
    print('PRIVATE_OUTPUT:',output)
    print('PRODUCTION_ORDER_CHANGES: NONE')
    print('LIVE_RELEASE_OR_AUTOMATIC_RESTOCK_AUTHORIZED: NO')
    print('Do not upload the private encrypted docket or decrypted contents.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError,OSError,subprocess.TimeoutExpired,json.JSONDecodeError) as err:
        # Only generic error codes, not sensitive message/paths or decrypted data.
        print('PRIVATE_DOCKET_NOT_COMPLETED: inspect your local backup and GPG setup',file=sys.stderr)
        sys.exit(2)
