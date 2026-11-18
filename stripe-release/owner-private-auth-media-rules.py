"""Run in the owner's Google Cloud Shell. Read-only production inputs and local encrypted output."""
import base64
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

PROJECT = "kandorty-9378a"
RULES = "https://firebaserules.googleapis.com/v1/"
AUTH = "https://identitytoolkit.googleapis.com/v1/projects/" + PROJECT + "/accounts:batchGet"
DOCS = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/"
UID_FIELDS = "localId,email,emailVerified,displayName,phoneNumber,disabled,photoUrl,createdAt,lastLoginAt,customAttributes,providerUserInfo(providerId,rawId,email,displayName,photoUrl)"
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError("redirect refused")

opener = urllib.request.build_opener(NoRedirect())

def api(url, params=None):
    host = urllib.parse.urlsplit(url).hostname
    if host not in {"identitytoolkit.googleapis.com","firebaserules.googleapis.com","firestore.googleapis.com"}:
        raise ValueError("unexpected API")
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    token = subprocess.check_output(["gcloud","auth","print-access-token"], stderr=subprocess.DEVNULL, text=True).strip()
    with opener.open(urllib.request.Request(url, headers={"Authorization":"Bearer "+token}),timeout=90) as response:
        return json.load(response)

def pages(url, key, params, cursor="pageToken"):
    args = dict(params)
    seen = set()
    while True:
        row = api(url,args)
        yield from row.get(key,[])
        token = row.get("nextPageToken")
        if not token:
            return
        if token in seen:
            raise ValueError("repeated cursor")
        seen.add(token)
        args[cursor] = token

def dump(path,value):
    path.write_text(json.dumps(value, ensure_ascii=False),encoding="utf-8")

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda:src.read(1048576),b""):
            h.update(block)
    return h.hexdigest()

def media_strings(obj):
    if isinstance(obj,dict):
        for value in obj.values(): yield from media_strings(value)
    elif isinstance(obj,list):
        for value in obj: yield from media_strings(value)
    elif isinstance(obj,str) and (obj.startswith("data:image/") or obj.startswith("https://")):
        yield obj

def backup():
    os.umask(0o077)
    destination=pathlib.Path.home()/("Kandorty-recovery-"+datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")+".tar.gpg")
    if destination.exists():
        raise FileExistsError()
    with tempfile.TemporaryDirectory() as tmp:
        root=pathlib.Path(tmp); data=root/"data";data.mkdir()
        releases=list(pages(RULES+"projects/"+PROJECT+"/releases","releases",{"pageSize":100}))
        if not releases:raise ValueError("no published releases")
        saved={}
        for release in releases:
            name=release["rulesetName"]
            if not name.startswith(release["name"].split("/releases/")[0]+"/rulesets/"): raise ValueError("wrong rules project")
            if name not in saved:saved[name]=api(RULES+name)
        dump(data/"published-rules.json",{"releases":releases,"rulesets":saved})
        users=list(pages(AUTH,"users",{"maxResults":500,"fields":"nextPageToken,users("+UID_FIELDS+")"},"nextPageToken"))
        if not users: raise ValueError("no auth profiles")
        dump(data/"auth-profiles.json",users)
        products=list(pages(DOCS+"products","documents",{"pageSize":25,"mask.fieldPaths":["images","productVideoUrl","videoUrl","productVideo"]}))
        docs=products+[api(DOCS+"settings/store"),api(DOCS+"settings/categories")]
        assets=data/"assets";assets.mkdir(); mapping=[]; cache={}; others=set()
        for doc in docs:
            for ref in media_strings(doc.get("fields",{})):
                if ref not in cache:
                    if ref.startswith("data:image/"):
                        header,encoded=ref.split(",",1)
                        if not header.endswith(";base64"): raise ValueError("unsupported embedded media")
                        content=base64.b64decode(encoded,validate=True)
                        file=assets/hashlib.sha256(content).hexdigest()
                        if not file.exists():file.write_bytes(content)
                    elif urllib.parse.urlsplit(ref).hostname=="res.cloudinary.com":
                        scratch=root/"download"
                        with opener.open(ref,timeout=90) as src,scratch.open("wb") as dest:
                            for block in iter(lambda:src.read(1048576),b""):dest.write(block)
                        file=assets/sha(scratch);scratch.replace(file)
                    else:
                        others.add(urllib.parse.urlsplit(ref).hostname);continue
                    cache[ref]=file.name
                mapping.append([doc["name"],cache[ref]])
        dump(data/"asset-index.json",{"entries":mapping,"other_link_hosts_requiring_review":sorted(others)})
        manifest={str(p.relative_to(data)):sha(p) for p in data.rglob("*") if p.is_file()}
        archive=root/"snapshot.tar"
        with tarfile.open(archive,"w") as out:
            for name in sorted(manifest):out.add(data/name,arcname=name,recursive=False)
        encrypted=root/"snapshot.tar.gpg"
        subprocess.run(["gpg","--no-symkey-cache","--pinentry-mode","loopback","--symmetric","--cipher-algo","AES256","--output",str(encrypted),str(archive)],check=True)
        recovered=root/"check.tar"
        subprocess.run(["gpg","--no-symkey-cache","--pinentry-mode","loopback","--output",str(recovered),"--decrypt",str(encrypted)],check=True)
        if sha(recovered)!=sha(archive):raise ValueError("archive mismatch")
        with tarfile.open(recovered) as tf:
            if set(tf.getnames())!=set(manifest):raise ValueError("missing files")
            for member in tf:
                h=hashlib.sha256()
                with tf.extractfile(member) as src:
                    for block in iter(lambda:src.read(1048576),b""):h.update(block)
                if h.hexdigest()!=manifest[member.name]:raise ValueError("digest mismatch")
        import shutil
        with destination.open("xb") as dst,encrypted.open("rb") as src:
            try:shutil.copyfileobj(src,dst)
            except BaseException:destination.unlink();raise
        print("ENCRYPTED_ARCHIVE_READBACK_PASS",destination.name)
        print("PROFILES",len(users),"RULESETS",len(saved),"DISTINCT_MEDIA",len(set(cache.values())))
        print("AUTH_PROFILE_ONLY; EXTERNAL_LINK_COVERAGE_REQUIRES_REVIEW; EMULATOR_RESTORE_PENDING")
if __name__=="__main__":
    try:backup()
    except Exception as error:
        print("STOPPED",type(error).__name__,getattr(error,"code",""),file=sys.stderr)
        sys.exit(1)
