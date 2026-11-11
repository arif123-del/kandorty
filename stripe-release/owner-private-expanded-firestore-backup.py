#!/usr/bin/env python3
"""Owner-only encrypted Firestore full-root and nested-collection JSON snapshot.

READS production Firestore through the owner's Cloud Shell credentials.
No Firestore, Stripe, Stock, Firebase Rules, Auth, or Storage writes.
No Cloud Storage bucket, billing card, or service-account key required.
Never prints collection IDs, document IDs, customer data, passphrase, or tokens.
Private plaintext is held only in process memory and encrypted directly to GPG.
NOT a managed export, point-in-time snapshot, Auth, Storage or Rules backup.
"""
import datetime
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

BASE=Path(__file__).resolve().parent
PROJECT='kandorty-9378a'
ROOT=f'projects/{PROJECT}/databases/(default)/documents'
API=f'https://firestore.googleapis.com/v1/{ROOT}'
BACKED=('orders','tracking','order_edits','order_access','order_lifecycle')
MAX_DOCUMENTS=25000
MAX_COLLECTIONS=1000
MAX_DEPTH=8
MAX_PLAINTEXT_BYTES=250*1024*1024
PAGE_SIZE=250

def require(ok, reason):
    if not ok:raise ValueError(reason)

def old_helper():
    spec=importlib.util.spec_from_file_location('owner_existing_orders_helper',
                                                BASE/'owner-private-local-orders-backup.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def json_api(path, token, body=None):
    # Firestore's POST :listCollectionIds is a READ method. Never POST to a
    # document write endpoint, or send local data over the network.
    require(path.startswith(API) and path.startswith('https://firestore.googleapis.com/'),
            'wrong_api_endpoint')
    require(body is None or path.endswith(':listCollectionIds'),'write_endpoint_forbidden')
    method='POST' if body is not None else 'GET'
    data=json.dumps(body).encode() if body is not None else None
    headers={'Authorization':'Bearer '+token,'Accept':'application/json'}
    if data is not None:headers['Content-Type']='application/json'
    req=Request(path,headers=headers,data=data,method=method)
    try:
        with urlopen(req,timeout=45) as reply:
            value=json.load(reply)
        require(isinstance(value,dict),'unexpected_firestore_response')
        return value
    except HTTPError:
        raise ValueError('firestore_read_denied_or_failed') from None
    except URLError:
        raise ValueError('firestore_network_unavailable') from None

def list_collection_ids(parent, token):
    require(parent==ROOT or parent.startswith(ROOT+'/'),'untrusted_parent_path')
    url='https://firestore.googleapis.com/v1/'+quote(parent,safe='/()')+':listCollectionIds'
    result=[]
    page_token=''
    seen=set()
    while True:
        body={'pageSize':PAGE_SIZE}
        if page_token:body['pageToken']=page_token
        response=json_api(url,token,body)
        values=response.get('collectionIds',[])
        require(isinstance(values,list),'invalid_collection_ids')
        for name in values:
            require(isinstance(name,str) and name and '/' not in name and name not in result,
                    'duplicate_or_invalid_collection_id')
            result.append(name)
        require(len(result)<=MAX_COLLECTIONS,'too_many_collections')
        new_token=response.get('nextPageToken','')
        require(not new_token or new_token not in seen,'repeated_page_token')
        if not new_token:break
        seen.add(new_token)
        page_token=new_token
    return sorted(result)

def list_documents(parent, collection, token):
    require(parent==ROOT or parent.startswith(ROOT+'/'),'untrusted_parent_path')
    require(isinstance(collection,str) and collection and '/' not in collection,
            'invalid_collection_name')
    base='https://firestore.googleapis.com/v1/'+quote(parent,safe='/()')+'/'+quote(collection,safe='')
    target=parent+'/'+collection+'/'
    result=[]
    seen_ids=set()
    seen_tokens=set()
    page_token=''
    while True:
        query={'pageSize':PAGE_SIZE,'showMissing':'true'}
        if page_token:query['pageToken']=page_token
        rsp=json_api(base+'?'+urlencode(query),token)
        values=rsp.get('documents',[])
        require(isinstance(values,list),'invalid_document_list')
        for doc in values:
            require(isinstance(doc,dict) and isinstance(doc.get('name'),str) and
                    doc['name'].startswith(target),'document_wrong_project_or_collection')
            segment=doc['name'][len(target):]
            require(bool(segment) and '/' not in segment and segment not in seen_ids,
                    'nested_or_duplicate_document')
            seen_ids.add(segment)
            require(not doc.get('fields') or isinstance(doc['fields'],dict),
                    'invalid_document_fields')
            result.append(doc)
            require(len(result)<=MAX_DOCUMENTS,'collection_document_limit')
        new_token=rsp.get('nextPageToken','')
        require(not new_token or new_token not in seen_tokens,'repeated_page_token')
        if not new_token:break
        seen_tokens.add(new_token)
        page_token=new_token
    return result

def crawl(list_ids, list_docs):
    """Dependency-injected, read-only collection walker for local synthetic tests."""
    queue=[(ROOT,0)]
    visited=set()
    result={}
    missing_parents=0
    root_collections=0
    total_documents=0
    while queue:
        parent,depth=queue.pop(0)
        require(parent not in visited,'duplicate_parent')
        visited.add(parent)
        names=list_ids(parent)
        require(isinstance(names,list) and len(names)==len(set(names)),
                'unexpected_collection_ids')
        if parent==ROOT:
            root_collections=len(names)
            require(root_collections>=11,'root_collection_count_below_verified_baseline')
        if names and depth>=MAX_DEPTH:
            raise ValueError('nested_depth_limit_requires_manual_review')
        for coll in names:
            require(isinstance(coll,str) and bool(coll) and '/' not in coll,
                    'invalid_collection_path')
            path=parent+'/'+coll
            require(path not in result,'duplicate_collection_path')
            docs=list_docs(parent,coll)
            require(isinstance(docs,list),'unexpected_documents')
            result[path[len(ROOT)+1:]]=docs
            require(len(result)<=MAX_COLLECTIONS,'too_many_nested_collections')
            total_documents+=len(docs)
            require(total_documents<=MAX_DOCUMENTS,'too_many_documents')
            for doc in docs:
                require(isinstance(doc,dict) and
                        str(doc.get('name','')).startswith(path+'/'),
                        'invalid_document_path')
                suffix=doc['name'][len(path+'/'):]
                require(bool(suffix) and '/' not in suffix,
                        'invalid_nested_document')
                if not doc.get('fields'):
                    missing_parents+=1
                queue.append((doc['name'],depth+1))
    orders=result.get('orders',[])
    tracking=result.get('tracking',[])
    require(len(orders)>=99,'orders_below_known_baseline')
    prefix=ROOT+'/orders/'
    order_by_id={d['name'][len(prefix):]:d.get('fields',{}).get('status') for d in orders}
    tracking_prefix=ROOT+'/tracking/'
    track_by_id={d['name'][len(tracking_prefix):]:d.get('fields',{}).get('status')
                 for d in tracking}
    require(len(orders)==len(tracking) and order_by_id==track_by_id,
            'order_tracking_mismatch_no_new_backup_saved')
    return {'rootCollectionCount':root_collections,
            'collectionCount':len(result),
            'documentCount':total_documents,
            'orderCount':len(orders),
            'trackingCount':len(tracking),
            'missingParentRefs':missing_parents,
            'collections':result}

def main():
    os.umask(0o077)
    require(len(sys.argv)==1 and sys.stdin.isatty(),'owner_interactive_cloud_shell_required')
    require(shutil.which('gcloud') and shutil.which('gpg'),'gcloud_or_gpg_missing')
    print('KANDORTY OWNER FULL-ROOT FIRESTORE JSON BACKUP: READ ONLY')
    print('Includes all discoverable top-level/nested Firestore collections.')
    print('Excludes Firebase Auth users, Cloud Storage objects, published Rules.')
    print('NO production writes or Cloud Billing. Keep encrypted file private.')
    print('The snapshot is sequential; live writes can occur during extraction.')
    consent=input('Type BACKUP_ALL_FIRESTORE_LOCAL_ONLY to continue: ').strip()
    if consent!='BACKUP_ALL_FIRESTORE_LOCAL_ONLY':
        print('CANCELLED: YES');return
    helper=old_helper()
    token=helper.call_gcloud_token()
    summary=crawl(lambda parent:list_collection_ids(parent,token),
                  lambda parent,coll:list_documents(parent,coll,token))
    export={
        'format':'kandorty-private-all-firestore-collections-json-v1',
        'sourceProject':PROJECT,
        'database':'(default)',
        'exportedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'consistency':'SEQUENTIAL READS - NOT TRANSACTIONAL / NOT POINT IN TIME',
        'scope':'all discoverable Firestore root and nested collections, not Auth/Storage/Rules',
        'rootCollectionCount':summary['rootCollectionCount'],
        'collectionCount':summary['collectionCount'],
        'documentCount':summary['documentCount'],
        'missingParentRefs':summary['missingParentRefs'],
        'collections':summary['collections'],
    }
    plaintext=json.dumps(export,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    require(len(plaintext)<=MAX_PLAINTEXT_BYTES,'snapshot_exceeds_private_memory_limit')
    password=getpass.getpass('Owner PRIVATE GPG password (12+ characters): ')
    require(len(password)>=12,'password_too_short')
    verify=getpass.getpass('Repeat password: ')
    require(verify==password,'password_mismatch')
    folder=Path.home()/'kandorty-private-backups'
    folder.mkdir(mode=0o700,exist_ok=True)
    require(not folder.is_symlink(),'unsafe_backup_directory')
    folder.chmod(0o700)
    timestamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    file=folder/('kandorty-expanded-firestore-'+timestamp+'.json.gpg')
    require(not file.exists(),'encrypted_output_exists')
    try:
        encrypted=helper.gpg_with_secret(password,
                  ['--symmetric','--cipher-algo','AES256','--output',str(file)],
                  plaintext)
        require(encrypted.returncode==0 and file.is_file(),'gpg_encrypt_failed')
        file.chmod(0o600)
        decrypted=helper.gpg_with_secret(password,['--decrypt',str(file)])
        require(decrypted.returncode==0 and
                hashlib.sha256(decrypted.stdout).digest()==hashlib.sha256(plaintext).digest(),
                'gpg_integrity_check_failed')
    except Exception:
        file.unlink(missing_ok=True)
        raise
    print('ENCRYPTED_ALL_FIRESTORE_ROOT_SNAPSHOT: VERIFIED')
    print('ROOT_COLLECTIONS_SAVED:',summary['rootCollectionCount'])
    print('INCLUDING_NESTED_COLLECTIONS:',summary['collectionCount'])
    print('TOTAL_FIRESTORE_DOCUMENT_REFS:',summary['documentCount'])
    print('ORDERS_PRESERVED:',summary['orderCount'])
    print('TRACKING_PRESERVED:',summary['trackingCount'])
    print('MISSING_PARENT_PATH_REFERENCES:',summary['missingParentRefs'])
    print('ENCRYPTED_FILE:',file)
    print('ENCRYPTED_SHA256:',hashlib.sha256(file.read_bytes()).hexdigest())
    print('FIREBASE_AUTH_STORAGE_RULES_BACKED_UP: NO')
    print('MANAGED_EXPORT_OR_POINT_IN_TIME_SNAPSHOT: NO')
    print('NESTED_RESTORE_OR_ROLLBACK_REHEARSAL_COMPLETED: NO')
    print('PRODUCTION_FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')
    print('Keep backup and passphrase private; never send them to ChatGPT or GitHub.')

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,TimeoutError,TypeError,KeyError):
        print('FULL_FIRESTORE_LOCAL_BACKUP_NOT_COMPLETED: safe read or private validation failed',
              file=sys.stderr)
        sys.exit(2)
