import importlib.util,tempfile,pathlib,os,subprocess
spec=importlib.util.spec_from_file_location('recovery','stripe-release/owner-private-auth-media-rules.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def api(url,params=None):
 if '/releases' in url:return {'releases':[{'name':'projects/test/releases/cloud.firestore','rulesetName':'projects/test/rulesets/id'}]}
 if '/rulesets/' in url:return {'source':{'files':[{'name':'x','content':'dummy'}]}}
 if 'batchGet' in url:return {'users':[{'localId':'fixture'}]}
 if 'products' in url:return {'documents':[{'name':'fixture-product','fields':{'image':{'stringValue':'data:image/png;base64,dGVzdA=='}}}]}
 return {'name':'fixture-settings'}
m.api=api
with tempfile.TemporaryDirectory() as h:
 os.environ['HOME']=h
 real=subprocess.run
 def run(args,**kwargs):
  if args[0]=='gpg':args=args[:1]+['--batch','--passphrase','automated-fixture-only']+args[1:]
  return real(args,**kwargs)
 m.subprocess.run=run;m.backup()
 assert len(list(pathlib.Path(h).glob('*.tar.gpg')))==1
