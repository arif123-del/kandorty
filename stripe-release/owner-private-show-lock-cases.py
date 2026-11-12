#!/usr/bin/env python3
"""Owner-only OFFLINE listing of the four lock-review order codes.

WARNING: displays 4 private order identifiers only on the owner's console.
Never copy these codes into ChatGPT, GitHub, screenshots, messages or logs.
Does not print contacts, products, money or the original backup. No cloud calls.
Does not authorize admin action, stock change, refund or migration.
"""
import getpass
import importlib.util
from pathlib import Path
import subprocess
import sys
import json

ROOT = Path(__file__).resolve().parent
FLAG = 'processing_lock_review'

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def find_private_lock_cases(docket):
    triage = load('owner_private_lock_triage','owner-private-legacy-triage.py')
    verified = triage.build_evidence_plan(docket)  # fail closed on changed 99 / 18 / 4+3+3+11 baseline
    rows = [
        {'code': row['orderCode'], 'statusAtBackup': row['statusAtBackup']}
        for row in verified['records'] if FLAG in row['exceptionFlags']
    ]
    if len(rows) != 4 or verified['casesBlocked'] != 18 or verified['casesApprovedForProductionChange'] != 0:
        raise ValueError('unexpected_private_lock_review_baseline')
    return sorted(rows, key=lambda row: row['code'])

def main():
    if len(sys.argv) != 1:
        raise ValueError('no_arguments_accepted')
    print('KANDORTY OWNER-ONLY: FOUR HISTORICAL LOCK CASES — READ ONLY')
    print('Keep your phone private. DO NOT screenshot, share or paste the private codes anywhere.')
    print('These are only flags in an old backup; do NOT change their admin status.')
    answer = input('Display four private order codes on THIS screen only? Type YES: ').strip()
    if answer != 'YES':
        print('PRIVATE_DISPLAY_CANCELLED: YES')
        return
    src = load('owner_private_lock_docket','owner-private-legacy-exception-docket.py')
    triage = load('owner_private_lock_select','owner-private-legacy-triage.py')
    p = triage.select_private_docket()
    password = getpass.getpass('Private GPG backup password (never share): ')
    private_data = src.decrypt_private_backup(p, password)
    rows = find_private_lock_cases(private_data)
    print('LOCK_CASES_REQUIRING_INDEPENDENT_REVIEW: 4')
    for row in rows:
        print('PRIVATE_OWNER_ONLY_ORDER:', row['code'], 'STATUS_AT_BACKUP:', row['statusAtBackup'])
    print('NO_ORDER_OR_STOCK_CHANGES: YES')
    print('DO_NOT_SEND_THE_CODES_OR_SCREENSHOT_TO_CHAT: YES')
    print('NO_CASES_AUTOMATICALLY_RESOLVED: YES')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.TimeoutExpired,
            json.JSONDecodeError, EOFError, KeyboardInterrupt):
        print('PRIVATE_LOCK_REVIEW_NOT_COMPLETED: private local validation failed', file=sys.stderr)
        sys.exit(2)
