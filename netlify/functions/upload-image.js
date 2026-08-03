7const OWNER = 'arif123-del';
const REPO = 'kandorty';
const BRANCH = 'main';
const FIREBASE_API_KEY = 'AIzaSyAn-ZDc8AWOx6gNS3fWwopQOmC0Gaw0rfI';
const ALLOWED_ORIGINS = new Set([
  'https://kandorty.netlify.app',
  'https://arif123-del.github.io'
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://kandorty.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function response(statusCode, body, origin) {
  return { statusCode, headers: cors(origin), body: JSON.stringify(body) };
}
function safeName(name='image.jpg') {
  const ext = /\.png$/i.test(name) ? 'png' : /\.webp$/i.test(name) ? 'webp' : 'jpg';
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,45) || 'product';
  return `${Date.now()}-${Math.random().toString(36).slice(2,9)}-${base}.${ext}`;
}
async function verifyFirebaseUser(idToken) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({idToken})
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.users && data.users[0] ? data.users[0] : null;
}
exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  if (event.httpMethod === 'OPTIONS') return {statusCode:204, headers:cors(origin), body:''};
  if (event.httpMethod !== 'POST') return response(405,{error:'POST only'},origin);
  if (!ALLOWED_ORIGINS.has(origin)) return response(403,{error:'المصدر غير مسموح'},origin);
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!githubToken) return response(500,{error:'GITHUB_TOKEN غير موجود في Netlify'},origin);
    if (!adminEmail) return response(500,{error:'ADMIN_EMAIL غير موجود في Netlify'},origin);
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return response(401,{error:'يجب تسجيل دخول الإدارة'},origin);
    const user = await verifyFirebaseUser(idToken);
    if (!user || String(user.email||'').toLowerCase() !== adminEmail) return response(403,{error:'هذا الحساب غير مصرح له برفع الصور'},origin);
    const body = JSON.parse(event.body || '{}');
    const base64 = String(body.base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) return response(400,{error:'الصورة غير موجودة'},origin);
    const bytes = Buffer.from(base64,'base64');
    if (!bytes.length || bytes.length > 3.6*1024*1024) return response(413,{error:'الصورة كبيرة جداً بعد الضغط'},origin);
    const fileName = safeName(body.fileName);
    const path = `product-images/${fileName}`;
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`;
    const gh = await fetch(api, {
      method:'PUT',
      headers:{
        'Authorization':`Bearer ${githubToken}`,
        'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'Kandorty-Netlify-Image-Uploader',
        'Content-Type':'application/json'
      },
      body:JSON.stringify({message:`Upload product image ${fileName}`,content:bytes.toString('base64'),branch:BRANCH})
    });
    const result = await gh.json();
    if (!gh.ok) return response(gh.status,{error:result.message || 'فشل رفع الصورة إلى GitHub'},origin);
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
    return response(200,{ok:true,url,path},origin);
  } catch (error) {
    console.error(error);
    return response(500,{error:error.message || 'خطأ غير معروف'},origin);
  }
};
