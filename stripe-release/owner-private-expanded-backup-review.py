#!/usr/bin/env python3
"""Offline private structural audit for Kandorty owner's newest encrypted all-Firestore backup.

No network, Firebase credentials, unencrypted output file, plaintext logs or
production writes. It validates structure and document identities in memory.
This is NOT a managed export or a Firestore-emulator replay/rollback proof.
"""
import getpass
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys

HERE=Path(__file__).resolve().parent
SOURCE_PROJECT='kandorty-9378a'
ROOT=f'projects/{SOURCE_PROJECT}/databases/(default)/documents'
PRIVATE_DIR=Path.home()/'kandorty-private-backups'
PREFIX='kandorty-expanded-firestore-'
SUFFIX='.json.gpg'
MAX_ROOTS=500
MAX_COLLECTIONS=1000
MAX_DOCUMENTS=25000

def require(check,reason):
    if not check:raise ValueError(reason)

def audit(data):
    require(isinstance(data,dict),'invalid_json_root')
    require(data.get('format')=='kandorty-private-all-firestore-collections-json-v1',
            'invalid_expanded_backup_format')
    require(data.get('sourceProject')==SOURCE_PROJECT and
            data.get('database')=='(default)','wrong_project_or_database')
    cols=data.get('collections')
    require(isinstance(cols,dict) and 11<=len(cols)<=MAX_COLLECTIONS,
            'unexpected_collection_scope')
    roots=set()
    seen=set()
    ids_by_collection={}
    status_by_collection={}
    total=0
    nested=0
    for path,docs in cols.items():
        require(isinstance(path,str) and len(path)<=2048 and
                not path.startswith('/') and not path.endswith('/'),'invalid_collection_path')
        segments=path.split('/')
        require(len(segments)%2==1 and all(s and s not in ('.','..') for s in segments),
                'collection_not_in_document_hierarchy')
        if len(segments)==1:roots.add(path)
        else:nested+=1
        require(isinstance(docs,list),'invalid_documents_list')
        within=set()
        for doc in docs:
            require(isinstance(doc,dict),'invalid_document')
            name=doc.get('name')
            prefix=ROOT+'/'+path+'/'
            require(isinstance(name,str) and name.startswith(prefix),
                    'document_not_in_expected_source')
            suffix=name[len(prefix):]
            require(suffix and '/' not in suffix and suffix not in within,
                    'duplicate_or_nested_document')
            within.add(suffix)
            require(name not in seen,'duplicate_firestore_document')
            seen.add(name)
            fields=doc.get('fields',{})
            require(isinstance(fields,dict),'invalid_firestore_fields')
            if path in ('orders','tracking'):
                require(isinstance(fields.get('status'),dict) and
                        isinstance(fields['status'].get('stringValue'),str),
                        'order_tracking_status_invalid')
        ids_by_collection[path]=within
        if path in ('orders','tracking'):
            status_by_collection[path]={
                d['name'][(len(ROOT+'/'+path+'/')):]:d['fields']['status']['stringValue']
                for d in docs
            }
        total+=len(docs)
        require(total<=MAX_DOCUMENTS,'document_scope_too_large')
    require(len(roots)>=11 and len(roots)<=MAX_ROOTS,
            'not_all_expected_nonempty_roots')
    require(roots==set(p for p in cols if '/' not in p),
            'root_collections_inconsistent')
    for path in cols:
        segments=path.split('/')
        if len(segments)>1:
            parent_collection='/'.join(segments[:-2])
            parent_doc=segments[-2]
            require(parent_collection in cols and
                    parent_doc in ids_by_collection[parent_collection],
                    'missing_parent_document_for_nested_collection')
    require(set(status_by_collection)=={'orders','tracking'},
            'order_or_tracking_collection_missing')
    order_count=len(ids_by_collection['orders'])
    require(order_count>=99 and ids_by_collection['orders']==ids_by_collection['tracking'],
            'order_tracking_identity_mismatch')
    require(status_by_collection['orders']==status_by_collection['tracking'],
            'order_tracking_status_mismatch')
    require(total>=254,'snapshot_below_prior_254_document_scope')
    require(data.get('rootCollectionCount')==len(roots) and
            data.get('collectionCount')==len(cols) and
            data.get('documentCount')==total,
            'snapshot_manifest_counts_inconsistent')
    require(data.get('consistency')=='SEQUENTIAL READS - NOT TRANSACTIONAL / NOT POINT IN TIME',
            'snapshot_consistency_claim_invalid')
    return {
        'ROOT_COLLECTIONS_VERIFIED':len(roots),
        'NESTED_COLLECTIONS_VERIFIED':nested,
        'TOTAL_COLLECTIONS_VERIFIED':len(cols),
        'DOCUMENTS_VERIFIED':total,
        'ORDERS_VERIFIED':order_count,
        'TRACKING_VERIFIED':len(ids_by_collection['tracking']),
        'ORDER_TRACKING_STATUS_EQUAL':'YES',
        'MANAGED_RESTORE_REHEARSAL_PASS':'NO',
        'AUTH_STORAGE_RULES_BACKED_UP':'NO',
        'PRODUCTION_RELEASE_AUTHORIZED':'NO',
    }

def private_backup_candidates():
    # Private metadata only: no filenames or order codes are printed.
    require(PRIVATE_DIR.is_dir() and not PRIVATE_DIR.is_symlink(),
            'private_directory_missing_or_unsafe')
    files=[p for p in PRIVATE_DIR.glob(PREFIX+'*'+SUFFIX)
           if p.is_file() and not p.is_symlink()]
    require(bool(files),'no_expanded_backup_file_found')
    require(len(files)<=25,'too_many_private_backup_candidates')
    return sorted(files,key=lambda p:p.stat().st_mtime_ns,reverse=True)

def newest_private_backup():
    return private_backup_candidates()[0]

def private_decrypt(path,password):
    # Use the EXACT same passphrase-fd pipe helper that the expanded-backup
    # writer used when encrypting and self-verifying the GPG file.
    # Never print GPG stderr or decrypted content.
    require(shutil.which('gpg') is not None,'private_backup_unavailable')
    require(path.is_file() and not path.is_symlink() and
            path.name.startswith(PREFIX) and path.name.endswith(SUFFIX) and
            0<path.stat().st_size<=200*1024*1024,
            'private_backup_invalid_size_or_name')
    require(isinstance(password,str) and len(password)>=12,
            'private_password_too_short')
    spec=importlib.util.spec_from_file_location(
        'kandorty_original_backup_gpg_helper',
        HERE/'owner-private-local-orders-backup.py')
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Bypass GPG symmetric-key passphrase cache: verify the ACTUAL supplied
    # passphrase, not a previously cached secret from another backup.
    result=mod.gpg_with_secret(password,['--no-symkey-cache','--decrypt',str(path)])
    require(result.returncode==0 and
            0<len(result.stdout)<=300*1024*1024,
            'private_decryption_or_integrity_failed')
    try:
        return json.loads(result.stdout)
    except (ValueError,UnicodeError):
        raise ValueError('expanded_decrypted_json_invalid') from None

def main():
    require(len(sys.argv)==1 and sys.stdin.isatty(),'private_interactive_shell_only')
    print('KANDORTY_EXPANDED_BACKUP_OFFLINE_STRUCTURAL_REVIEW: NO NETWORK OR WRITES')
    print('Checks encrypted expanded backups newest first in the owner Cloud Shell.')
    print('Private codes/customer data are never displayed. Do not share password.')
    candidates=private_backup_candidates()
    print('EXPANDED_PRIVATE_ENCRYPTED_FILE_FOUND: YES',flush=True)
    print('EXPANDED_LOCAL_BACKUP_CANDIDATE_COUNT:',len(candidates),flush=True)
    print('EXPANDED_REVIEW_STAGE: DECRYPTION_WITHOUT_GPG_CACHE',flush=True)
    secret=getpass.getpass('Private GPG passphrase: ')
    # ONE password prompt. A previous expanded file may use this password
    # while the newest one was created with another. Never display filenames.
    matched=None
    data=None
    for index,path in enumerate(candidates,1):
        try:
            candidate_data=private_decrypt(path,secret)
        except ValueError as exc:
            if str(exc)=='private_decryption_or_integrity_failed':
                continue
            raise
        matched=(index,path)
        data=candidate_data
        break
    if matched is None:
        raise ValueError('private_password_not_matched_to_local_expanded_backup')
    index,path=matched
    print('EXPANDED_MATCHING_BACKUP_POSITION:',index,flush=True)
    print('SELECTED_BACKUP_SHA256_PREFIX:',
          hashlib.sha256(path.read_bytes()).hexdigest()[:12],flush=True)
    print('EXPANDED_BACKUP_DECRYPTION_AND_INTEGRITY: PASS',flush=True)
    print('EXPANDED_REVIEW_STAGE: STRUCTURE_CHECK',flush=True)
    result=audit(data)
    print('ENCRYPTED_EXPANDED_BACKUP_STRUCTURE: PASS')
    for key,value in result.items():print(key+':',value)
    print('ENCRYPTED_SHA256:',hashlib.sha256(path.read_bytes()).hexdigest())
    print('A successful offline structure check is not a full project restore test.')

# Only print constant, predefined error tokens. Never display exception
# messages that could contain a document path, private field, GPG stderr or code.
SAFE_CODES=frozenset((
    'invalid_json_root','invalid_expanded_backup_format',
    'wrong_project_or_database','unexpected_collection_scope',
    'invalid_collection_path','collection_not_in_document_hierarchy',
    'invalid_documents_list','invalid_document',
    'document_not_in_expected_source','duplicate_or_nested_document',
    'duplicate_firestore_document','invalid_firestore_fields',
    'order_tracking_status_invalid','document_scope_too_large',
    'not_all_expected_nonempty_roots','root_collections_inconsistent',
    'missing_parent_document_for_nested_collection',
    'order_or_tracking_collection_missing',
    'order_tracking_identity_mismatch','order_tracking_status_mismatch',
    'snapshot_below_prior_254_document_scope',
    'snapshot_manifest_counts_inconsistent','snapshot_consistency_claim_invalid',
    'private_directory_missing_or_unsafe','no_expanded_backup_file_found',
    'private_interactive_shell_only','expanded_decrypted_json_invalid'
))
PRIVATE_DECRYPT_CODES=frozenset((
    'private_backup_unavailable','private_backup_invalid_size_or_name',
    'private_password_too_short','private_decryption_or_integrity_failed',
    'private_password_not_matched_to_local_expanded_backup'
))

def error_code(exc):
    if isinstance(exc,ValueError):
        raw=str(exc)
        if raw in SAFE_CODES:return 'STRUCTURE_'+raw.upper()
        if raw in PRIVATE_DECRYPT_CODES:
            if raw=='private_decryption_or_integrity_failed':
                return 'GPG_PASSWORD_OR_FILE_INTEGRITY_FAILED'
            if raw=='private_password_too_short':
                return 'GPG_PASSWORD_TOO_SHORT'
            if raw=='private_password_not_matched_to_local_expanded_backup':
                return 'GPG_PASSPHRASE_DID_NOT_UNLOCK_ANY_EXPANDED_BACKUP'
            return 'PRIVATE_ENCRYPTED_FILE_UNAVAILABLE'
    return 'LOCAL_PRIVATE_CHECK_FAILED'

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,TypeError,KeyError,TimeoutError,EOFError) as exc:
        print('EXPANDED_BACKUP_OFFLINE_REVIEW_NOT_COMPLETED: '+error_code(exc),
              file=sys.stderr)
        sys.exit(2)
