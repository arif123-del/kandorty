#!/usr/bin/env python3
"""PRIVATE owner-only offline status survey for remaining Kandorty legacy cases.

Uses only the existing encrypted local manual-review docket; operator checks
the live admin themselves. Displays private order IDs ONLY inside the owner's
terminal after explicit YES, never prints IDs in aggregate output. Records
owner-observed statuses in a NEW AES256 encrypted private file. Status matches
are NOT independent evidence for locks, payment, stock or cancellation actor.
No API calls, Firestore writes, payment or stock operations, plaintext files.
"""
from datetime import datetime, timezone
import getpass
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
ALLOWED={'new','preparing','shipping','delivered','cancelled','missing','skip'}
CATEGORY={'PENDING':'customer_cancellation_request_review',
          'UNKNOWN':'unknown_cancellation_origin_review'}
EXPECTED={'PENDING':3,'UNKNOWN':11}


def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,ROOT / filename)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def case_rows(plan, group):
    if group not in CATEGORY:
        raise ValueError('unsupported_private_review_group')
    if plan.get('casesBlocked')!=18 or plan.get('casesApprovedForProductionChange')!=0:
        raise ValueError('unsafe_private_evidence_plan')
    if plan.get('sourceRiskCategoryCounts')!={'processing_lock_review':4,
       'customer_cancellation_request_review':3,
       'historical_stock_restoration_evidence_review':3,
       'unknown_cancellation_origin_review':11}:
        raise ValueError('unexpected_private_risk_counts')
    rows=[row for row in plan['records'] if CATEGORY[group] in row['exceptionFlags']]
    if len(rows)!=EXPECTED[group] or len({r['orderCode'] for r in rows})!=len(rows):
        raise ValueError('private_survey_group_count_changed')
    return sorted(rows,key=lambda row:row['orderCode'])


def make_survey(plan, group, status_by_code):
    rows=case_rows(plan,group)
    if set(status_by_code)!={r['orderCode'] for r in rows}:
        raise ValueError('missing_private_survey_responses')
    results=[]
    totals={'matching':0,'changed':0,'missing':0,'skipped':0}
    for row in rows:
        current=status_by_code[row['orderCode']]
        if current not in ALLOWED:
            raise ValueError('invalid_owner_observed_status')
        original=row['statusAtBackup']
        comparison=('skipped' if current=='skip' else
                    'missing' if current=='missing' else
                    'matching' if current==original else 'changed')
        totals[comparison]+=1
        results.append({
          'orderCode':row['orderCode'],
          'group':group,
          'statusAtBackup':original,
          'ownerObservedCurrentStatus':current,
          'statusComparison':comparison,
          'exceptionFlags':list(row['exceptionFlags']),
          'lockPaymentStockCancellationEvidenceVerified':False,
          'productionChangeAuthorized':False,
          'reviewDisposition':'BLOCKED_PENDING_INDEPENDENT_EVIDENCE'
        })
    return {'format':'kandorty-private-owner-visual-status-survey-v1',
      'sourceProject':'kandorty-9378a',
      'sourceBackupOrders':99,
      'group':group,
      'expectedCases':EXPECTED[group],
      'ownerObservedOnly':True,
      'comparisonTotals':totals,
      'rows':results,
      'independentCaseEvidenceVerified':0,
      'productionChangeAuthorized':False,
      'stockRestorationAuthorized':False,
      'refundAuthorized':False,
      'stage4CutoverAuthorized':False,
      'notice':'Admin status comparison is not proof of historical lock, inventory, refund or cancellation actor. NO PRODUCTION CHANGES.'
    }


def main():
    if len(sys.argv)!=1:
        raise ValueError('no_cli_arguments_accepted')
    print('KANDORTY PRIVATE OWNER VISUAL STATUS SURVEY — OFFLINE / READ ONLY')
    print('NEVER screenshot or share the private order codes, GPG password or this encrypted file.')
    print('Do not click order status, cancel, refund or restock buttons in the live admin.')
    group=input('Which group to inspect? Type PENDING (3) or UNKNOWN (11): ').strip().upper()
    if group not in CATEGORY:
        print('PRIVATE_REVIEW_CANCELLED: YES')
        return
    confirm=input('Show PRIVATE order codes only in this terminal? Type YES: ').strip()
    if confirm!='YES':
        print('PRIVATE_REVIEW_CANCELLED: YES')
        return
    viewer=load('owner_legacy_status_survey_triage','owner-private-legacy-triage.py')
    source=load('owner_legacy_status_survey_docket','owner-private-legacy-exception-docket.py')
    password=getpass.getpass('Private GPG password (never share): ')
    docket=source.decrypt_private_backup(viewer.select_private_docket(),password)
    plan=viewer.build_evidence_plan(docket)
    rows=case_rows(plan,group)
    print('Private cases in group:',len(rows))
    print('Use only the status you can read in the live admin without pressing action buttons.')
    print('Choices: new | preparing | shipping | delivered | cancelled | missing | skip')
    answers={}
    for i,row in enumerate(rows,1):
        print('PRIVATE OWNER CASE',i,'OF',len(rows),':',
              row['orderCode'],'| STATUS AT BACKUP:',row['statusAtBackup'])
        while True:
            current=input('Current status (or skip): ').strip().lower()
            if current in ALLOWED:
                answers[row['orderCode']]=current
                break
            print('Invalid status; use one of the seven choices above. No order was modified.')
    report=make_survey(plan,group,answers)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out=source.PRIVATE_DIR/('legacy-visual-status-survey-'+group.lower()+'-'+stamp+'.json.gpg')
    source.save_encrypted_docket(report,out,password)
    print('OWNER_VISUAL_GROUP:',group)
    print('CASES_SURVEYED:',report['expectedCases'])
    for key,count in report['comparisonTotals'].items():
        print('OWNER_VISUAL_'+key.upper()+':',count)
    print('PRIVATE_ENCRYPTED_STATUS_SURVEY_CREATED: YES')
    print('PRIVATE_OUTPUT:',out)
    print('INDEPENDENT_STOCK_LOCK_REFUND_OR_CANCELLATION_EVIDENCE_VERIFIED: 0')
    print('FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')
    print('Never upload the private file or share decrypted codes.')


if __name__=='__main__':
    try:
        main()
    except (ValueError,OSError,subprocess.TimeoutExpired,json.JSONDecodeError,EOFError,KeyboardInterrupt):
        print('OWNER_VISUAL_SURVEY_NOT_COMPLETED: private local verification failed',file=sys.stderr)
        sys.exit(2)
