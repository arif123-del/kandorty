"""Restore supported parts of the owner's archive in an isolated demo project."""
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,tarfile,tempfile,urllib.request
from urllib.parse import urlencode
P="demo-kandorty-recovery"
ROOT=pathlib.Path
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): raise RuntimeError("redirect refused")
LOCAL=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def need(ok):
    if not ok:raise ValueError("verification")
def request(port,path,method="GET",body=None):
    url="http://127.0.0.1:"+str(port)+path
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(url,data,{"Authorization":"Bearer owner","Content-Type":"application/json"},method=method)
    with LOCAL.open(req,timeout=40) as resp:return json.load(resp)
def check():
    users=json.loads(ROOT("auth-profiles.json").read_text())
    auth="/identitytoolkit.googleapis.com/v1/projects/"+P+"/accounts"
    need(not request(19099,auth+":batchGet").get("users"))
    result=request(19099,auth+":batchCreate","POST",{"users":users})
    need(not result.get("error") and not result.get("errors"))
    restored={}
    token=None
    while True:
        query={"maxResults":500}
        if token:query["nextPageToken"]=token
        page=request(19099,auth+":batchGet?"+urlencode(query))
        restored.update((u["localId"],u) for u in page.get("users",[]))
        token=page.get("nextPageToken")
        if not token:break
    need(len(restored)==len(users))
    for u in users:
        v=restored[u["localId"]]
        for k in ("email","displayName","phoneNumber","photoUrl","emailVerified","disabled"):
            if k in u:need(v.get(k,False if k in ("disabled","emailVerified") else None)==u[k])
        need(json.loads(u.get("customAttributes") or "{}")==json.loads(v.get("customAttributes") or "{}"))
        need({(i["providerId"],i.get("rawId")) for i in u.get("providerUserInfo",[])}=={(i["providerId"],i.get("rawId")) for i in v.get("providerUserInfo",[])})
    archive=json.loads(ROOT("published-rules.json").read_text())
    count=0
    for release in archive["releases"]:
        need(release["name"].split("/releases/")[-1]=="cloud.firestore")
        files=archive["rulesets"][release["rulesetName"]]["source"]["files"]
        need(files and all(f.get("content") for f in files))
        out=request(18080,"/emulator/v1/projects/"+P+":securityRules","PUT",{"rules":{"files":[{"name":f["name"],"content":f["content"]} for f in files]}})
        need(not any(i.get("severity")=="ERROR" for i in out.get("issues",[])));count+=1
    need(count>0)
    index=json.loads(ROOT("asset-index.json").read_text())
    hashes={row[1] for row in index["entries"]}
    need(hashes=={p.name for p in ROOT("assets").glob("*")})
    for h in hashes:
        need(re.fullmatch("[0-9a-f]{64}",h))
        with (ROOT("assets")/h).open("rb") as src:
            digest=hashlib.sha256()
            for block in iter(lambda:src.read(1048576),b""):digest.update(block)
        need(digest.hexdigest()==h)
    ROOT("verified.json").write_text(json.dumps([len(users),count,len(hashes),len(index.get("other_link_hosts_requiring_review",[]))]))
def run(archive):
    archive=archive.resolve(strict=True)
    with tempfile.TemporaryDirectory() as tmp:
        work=ROOT(tmp)
        clean={k:v for k,v in os.environ.items() if k in {"PATH","JAVA_HOME","LANG","LC_ALL","TMPDIR","TERM"}}
        clean.update(HOME=tmp,CI="true",FIREBASE_CLI_DISABLE_USAGE_REPORTING="1",GOOGLE_CLOUD_PROJECT=P,GCLOUD_PROJECT=P)
        cmd=["npx","--yes","firebase-tools@14.22.0"]
        stage="INSTALL"
        try:
            subprocess.run(cmd+["setup:emulators:firestore"],cwd=tmp,env=clean,stdout=subprocess.DEVNULL,check=True)
            stage="DECRYPT"
            subprocess.run(["gpg","--pinentry-mode","loopback","--output",str(work/"snapshot.tar"),"--decrypt",str(archive)],check=True)
            stage="ARCHIVE"
            with tarfile.open(work/"snapshot.tar") as tf:
                seen=set()
                for m in tf:
                    need(m.isfile() and m.name not in seen and (m.name in {"auth-profiles.json","published-rules.json","asset-index.json"} or re.fullmatch("assets/[a-f0-9]{64}",m.name)))
                    seen.add(m.name); dest=work/m.name;dest.parent.mkdir(exist_ok=True)
                    with tf.extractfile(m) as src,dest.open("xb") as out:shutil.copyfileobj(src,out)
            shutil.copyfile(__file__,work/"replay.py")
            options={k:{"host":"127.0.0.1","port":port} for k,port in [("auth",19099),("firestore",18080),("hub",14400),("logging",14500)]}
            options["ui"]={"enabled":False}
            (work/"firebase.json").write_text(json.dumps({"emulators":options}))
            stage="EMULATOR"
            subprocess.run(cmd+["emulators:exec","--only","auth,firestore","--project",P,"python3 replay.py --check"],cwd=tmp,env=clean,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
            n,r,m,h=json.loads((work/"verified.json").read_text())
            print("ISOLATED_RESTORE_PASS","PROFILES",n,"RULES",r,"LOCAL_MEDIA",m,"OTHER_LINK_HOSTS",h)
        except Exception:
            print("RESTORE_STOPPED",stage);raise SystemExit(1)
if __name__=="__main__":
    os.umask(0o077)
    if sys.argv[1:]==["--check"]:check()
    else:run(ROOT(sys.argv[1]))
