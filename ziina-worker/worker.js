// Kandorty + Ziina: TEST MODE ONLY. No real payments and no order writes.
// Paste this code into the real worker.js file in Cloudflare Workers.
// Required Cloudflare Production secret: ZIINA_API_KEY
// Do not publish the API key in source code.
const SHOP = 'https://kandorty.online';
const ALLOWED = new Set([SHOP, 'https://www.kandorty.online']);
const FIRESTORE_PROJECT = 'kandorty-9378a';
const API = 'https://api-v2.ziina.com/api/payment_intent';
const DELIVERY_FILS = 2500;

function respond(obj, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (ALLOWED.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  if (v.mapValue) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const result = {};
  for (const [k, v] of Object.entries(fields)) result[k] = decode(v);
  return result;
}
async function getProduct(id) {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/products/${encodeURIComponent(id)}`;
  const r = await fetch(endpoint);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Could not read product information.');
  const document = await r.json();
  return decodeFields(document.fields || {});
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(binary, x => x.charCodeAt(0));
}
async function signingKey(apiKey) {
  const input = new TextEncoder().encode('kandorty-ziina-receipt-v1|' + apiKey);
  const hashed = await crypto.subtle.digest('SHA-256', input);
  return crypto.subtle.importKey('raw', hashed, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeReceipt(data, apiKey) {
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(apiKey), new TextEncoder().encode(encoded));
  return encoded + '.' + b64url(new Uint8Array(signature));
}
async function readReceipt(token, apiKey) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid payment receipt.');
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) throw new Error('Invalid payment receipt.');
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await signingKey(apiKey), fromB64url(sig), new TextEncoder().encode(payload));
  } catch (_) { /* malformed signature */ }
  if (!valid) throw new Error('Unverified payment receipt.');
  const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  if (!data || Date.now() > data.created + 24*3600*1000 || data.created > Date.now()+60000) {
    throw new Error('Payment receipt expired.');
  }
  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Kandorty Ziina Worker Ready (TEST MODE)', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
    // Existing public 2 AED test link remains available during setup.
    if (url.pathname === '/test-payment' && request.method === 'GET') {
      if (!env.ZIINA_API_KEY) return new Response('Missing Ziina secret', { status: 500 });
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.ZIINA_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 200, currency_code: 'AED', message: 'Kandorty TEST payment',
          test: true, allow_tips: false,
          success_url: SHOP + '/?ziina_test=success',
          cancel_url: SHOP + '/?ziina_test=cancel',
          failure_url: SHOP + '/?ziina_test=failed'
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.redirect_url) return new Response('Ziina test API error', { status: 502 });
      return Response.redirect(data.redirect_url, 302);
    }
    if (!ALLOWED.has(origin)) return respond({ error: 'Origin not allowed' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600',
        'Vary': 'Origin'
      }});
    }
    if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, origin);
    if (!env.ZIINA_API_KEY) return respond({ error: 'Missing ZIINA_API_KEY secret' }, 500, origin);

    let body;
    try {
      const text = await request.text();
      if (text.length > 16000) throw new Error('Request too large.');
      body = JSON.parse(text);
    } catch (_) { return respond({ error: 'Invalid request body' }, 400, origin); }

    try {
      if (url.pathname === '/create-checkout-session') {
        const orderId = String(body.orderId || '');
        if (!/^KD-[A-Za-z0-9_-]{4,40}$/.test(orderId)) throw new Error('Invalid order ID.');
        const items = body.items;
        if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error('Invalid cart.');
        const qtyById = new Map();
        for (const item of items) {
          const id = String(item.id || '');
          const qty = Number(item.qty);
          if (!id || id.length > 150 || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('Invalid item.');
          qtyById.set(id, (qtyById.get(id) || 0) + qty);
        }
        let totalFils = DELIVERY_FILS;
        for (const [id, qty] of qtyById) {
          const p = await getProduct(id);
          if (!p || p.active === false) throw new Error('A product is unavailable.');
          if (typeof p.stock === 'number' && qty > p.stock) throw new Error('Not enough stock for an item.');
          const price = Number(p.salePrice || p.price || 0);
          const priceFils = Math.round(price * 100);
          if (!Number.isSafeInteger(priceFils) || priceFils < 1) throw new Error('Invalid product price.');
          totalFils += priceFils * qty;
        }
        if (!Number.isSafeInteger(totalFils) || totalFils < 200 || totalFils > 100000000) throw new Error('Invalid order amount.');
        const returnPath = String(body.returnPath || '/');
        if (!['/', '/ziina-test.html', '/ziina-embedded-test.html'].includes(returnPath)) {
          throw new Error('Invalid return path.');
        }
        const callbackBase = SHOP + returnPath;
        const intentResponse = await fetch(API, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.ZIINA_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: totalFils,
            currency_code: 'AED',
            message: `Kandorty TEST Order ${orderId}`,
            test: true, // ALWAYS TEST MODE until later security review.
            allow_tips: false,
            success_url: `${callbackBase}?ziina=success`,
            cancel_url: `${callbackBase}?ziina=cancel`,
            failure_url: `${callbackBase}?ziina=failed`
          })
        });
        const intent = await intentResponse.json().catch(() => ({}));
        if (!intentResponse.ok || !intent.id || !intent.redirect_url) {
          console.error('Ziina create status', intentResponse.status);
          return respond({ error: 'Ziina could not open test checkout.' }, 502, origin);
        }
        const receipt = await makeReceipt({
          id: String(intent.id), orderId, amount: totalFils, currency: 'AED',
          created: Date.now()
        }, env.ZIINA_API_KEY);
        // Expose ONLY Ziina's approved iframe URL, never an arbitrary user-provided URL.
        // Embedded checkout requires Ziina domain verification + support approval.
        let embeddedUrl = null;
        if (typeof intent.embedded_url === 'string' && intent.embedded_url.length < 2100) {
          try {
            const e = new URL(intent.embedded_url);
            if (e.protocol === 'https:' &&
                (e.hostname === 'ziina.com' || e.hostname.endsWith('.ziina.com'))) {
              embeddedUrl = e.href;
            }
          } catch (_) {}
        }
        return respond({ url: intent.redirect_url, embeddedUrl,
          paymentIntentId: intent.id, receipt, test: true }, 200, origin);
      }
      if (url.pathname === '/verify-checkout-session') {
        const expected = await readReceipt(body.receipt, env.ZIINA_API_KEY);
        const r = await fetch(API + '/' + encodeURIComponent(expected.id), {
          headers: { 'Authorization': 'Bearer ' + env.ZIINA_API_KEY }
        });
        if (!r.ok) return respond({ error: 'Ziina verification unavailable.' }, 502, origin);
        const intent = await r.json();
        const matches = String(intent.id) === expected.id &&
          intent.currency_code === expected.currency &&
          Number(intent.amount) === expected.amount &&
          String(intent.status) === 'completed';
        return respond({
          payment_status: matches ? 'paid' : 'unpaid',
          orderId: expected.orderId,
          currency: expected.currency.toLowerCase(),
          amount_total: expected.amount,
          test: true,
          intentStatus: intent.status || 'unknown'
        }, 200, origin);
      }
      return respond({ error: 'Not found' }, 404, origin);
    } catch (error) {
      return respond({ error: error.message || 'Could not process request' }, 400, origin);
    }
  }
};