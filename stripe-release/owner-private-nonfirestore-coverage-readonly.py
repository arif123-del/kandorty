#!/usr/bin/env python3
"""Kandorty owner-only READ ONLY non-Firestore recovery scope access check.

Run locally in owner's already-authenticated Google Cloud Shell. It uses
gcloud's existing login. No new service-account key, password or billing card.
It NEVER writes to production, downloads user data to a file, or prints Auth
accounts, private object names, rules contents, UIDs, emails or tokens.
Only presence/access information. Not a backup or release approval.
"""
import json
import subprocess
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import sys

PROJECT='kandorty-9378a'
SOURCES={
 'AUTH':'https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT+'/accounts:batchGet?maxResults=1',
 'RULES':'https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases?pageSize=10',
 'STORAGE_NEW':'https://storage.googleapis.com/storage/v1/b/'+quote(PROJECT+'.firebasestorage.app',safe='')+'/o?maxResults=1',
 'STORAGE_OLD':'https://storage.googleapis.com/storage/v1/b/'+quote(PROJECT+'.appspot.com',safe='')+'/o?maxResults=1',
}
def require(x,msg):
 if not x:raise ValueError(msg)

def safe_read(url,token):
 require(url in SOURCES.values(),'non_allowlisted_resource')
 request=Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/json'},method='GET')
 try:
  with urlopen(request,timeout=20) as response:
   data=json.load(response)
  require(isinstance(data,dict),'unexpected_read_only_response')
  return data
 except (HTTPError,URLError,TimeoutError):
  return None

def verdict(label,data):
 if data is None:return 'ACCESS_UNAVAILABLE'
 if label=='AUTH':
  return 'USERS_PRESENT' if data.get('users') or data.get('accounts') else 'NO_USERS_IN_FIRST_PAGE'
 if label=='RULES':
  return 'RELEASES_PRESENT' if data.get('releases') else 'NO_RELEASES_LISTED'
 return 'OBJECTS_PRESENT' if data.get('items') else 'NO_OBJECTS_IN_FIRST_PAGE'

def main():
 print('KANDORTY_PRIVATE_RECOVERY_SCOPE: READ_ONLY_NO_PII')
 print('No files created. No production orders, storage, rules or accounts modified.')
 token=subprocess.run(['gcloud','auth','print-access-token'],capture_output=True,
       check=False,timeout=35,text=True)
 require(token.returncode==0 and len(token.stdout.strip())>30,'existing_gcloud_login_unavailable')
 for label,url in SOURCES.items():
  print('NONFIRESTORE_'+label+': '+verdict(label,safe_read(url,token.stdout.strip())))
 print('AUTH_USER_EXPORT_COMPLETED: NO')
 print('CLOUD_STORAGE_OBJECT_BACKUP_COMPLETED: NO')
 print('DEPLOYED_RULES_SOURCE_BACKUP_COMPLETED: NO')
 print('MANAGED_RESTORE_COMPLETED: NO')
 print('PRODUCTION_WRITES: NONE')
 print('STAGE4_RELEASE_APPROVED: NO')

if __name__=='__main__':
 try:main()
 except (ValueError,OSError,TimeoutError,TypeError):
  print('NONFIRESTORE_SCOPE_PROBE: BLOCKED_NO_DETAILS',file=sys.stderr)
  sys.exit(2)
