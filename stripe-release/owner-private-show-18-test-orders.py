#!/usr/bin/env python3
"""Owner-only OFFLINE viewer of the 18 legacy case codes and their review reasons.

The codes appear solely in the owner's private interactive Cloud Shell terminal,
never in GitHub, logs, or this chat. The original GPG encrypted docket is read
locally and not changed. No Firebase, Stripe, HTTP, stock or order writes.
"""
import getpass
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
DESCRIPTIONS={
    'processing_lock_review':'Processing/delivery cancellation lock missing or inconsistent',
    'customer_cancellation_request_review':'Earlier customer-cancellation request marker',
    'historical_stock_restoration_evidence_review':'Previous stock-restoration marker (NOT proof of stock change)',
    'unknown_cancellation_origin_review':'Cancellation actor not recorded clearly'
}
STATUS={'new':'New','preparing':'Preparing','shipping':'Shipping',
        'delivered':'Delivered','cancelled':'Cancelled'}
PAYMENT={'cod':'COD label','card':'Card label — not proof of an actual charge'}

def load(name,filename):
    spec=importlib.util.spec_from_file_location(name,ROOT/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def owner_case_rows(docket):
    triage=load('owner_all_cases_triage','owner-private-legacy-triage.py')
    plan=triage.build_evidence_plan(docket) # Rejects changed counts, duplicates, unsafe approvals.
    if plan['casesBlocked']!=18 or plan['casesApprovedForProductionChange']!=0:
        raise ValueError('unexpected_private_case_baseline')
    rows=[]
    counts={k:0 for k in DESCRIPTIONS}
    for record in plan['records']:
        flags=record['exceptionFlags']
        if not flags or any(flag not in DESCRIPTIONS for flag in flags):
            raise ValueError('unexpected_private_reason')
        for flag in flags:counts[flag]+=1
        rows.append({
            'code':record['orderCode'],
            'status':record['statusAtBackup'],
            'payment_label':record['paymentLabelAtBackup'],
            'flags':tuple(flags),
        })
    if len(rows)!=18 or len({x['code'] for x in rows})!=18 or counts!={
        'processing_lock_review':4,
        'customer_cancellation_request_review':3,
        'historical_stock_restoration_evidence_review':3,
        'unknown_cancellation_origin_review':11
    }:
        raise ValueError('private_case_distribution_changed')
    return sorted(rows,key=lambda row:row['code'])

def main():
    if len(sys.argv)!=1 or not sys.stdin.isatty():
        raise ValueError('private_interactive_shell_required')
    print('KANDORTY: 18 OLD ORDER CODES — OWNER PRIVATE TERMINAL ONLY')
    print('DO NOT screenshot or send order codes, private reports or the password to chat.')
    print('These are backup flags; owner says the orders were created for testing.')
    choice=input('Display all 18 codes and short reasons privately? Type YES: ').strip()
    if choice!='YES':
        print('PRIVATE_VIEW_CANCELLED: YES')
        return
    triage=load('owner_all_cases_select','owner-private-legacy-triage.py')
    source=load('owner_all_cases_decrypt','owner-private-legacy-exception-docket.py')
    password=getpass.getpass('Private GPG passphrase (never share): ')
    docket=source.decrypt_private_backup(triage.select_private_docket(),password)
    rows=owner_case_rows(docket)
    print('PRIVATE_VIEW_VALIDATED: YES')
    for index,row in enumerate(rows,1):
        print('\nCASE',index,'OF 18 — PRIVATE CODE:',row['code'])
        print('  Status at backup:',STATUS.get(row['status'],'Unknown'))
        print('  Payment field:',PAYMENT.get(row['payment_label'],'Unverified label'))
        print('  Why flagged:', '; '.join(DESCRIPTIONS[v] for v in row['flags']))
    print('\nTOTAL_DISTINCT_FLAGGED_ORDERS: 18')
    print('TOTAL_OVERLAPPING_FLAG_HITS: 21')
    print('OWNER_REPORTED_TEST_ORIGIN: YES (NOT INDEPENDENTLY PROVEN)')
    print('ORIGINAL_ORDER_STOCK_PAYMENT_WRITES: NONE')
    print('LIVE_RELEASE_OR_AUTOMATIC_REFUND_AUTHORIZED: NO')
    print('DO_NOT_POST_PRIVATE_CODES_TO_CHAT_OR_GITHUB: YES')

if __name__=='__main__':
    try:main()
    except (ValueError,TypeError,KeyError,OSError,subprocess.TimeoutExpired,
            json.JSONDecodeError,EOFError,KeyboardInterrupt):
        print('PRIVATE_OWNER_CASE_VIEW_NOT_COMPLETED: local validation error',
              file=sys.stderr)
        sys.exit(2)
