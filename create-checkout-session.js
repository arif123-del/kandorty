const ALLOWED_ORIGINS = new Set([
  'https://kandorty.online',
  'https://www.kandorty.online'
]);

const FIREBASE_PROJECT_ID = 'kandorty-9378a';

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://kandorty.online';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function decodeFirestoreValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in v) return decodeFirestoreFields(v.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeFirestoreValue(v);
  return out;
}

async function getProduct(id) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/products/${encodeURIComponent(id)}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`Unable to read product ${id} (${r.status})`);
  }
  const doc = await r.json();
  return { id, ...decodeFirestoreFields(doc.fields || {}) };
}

function managedStock(product) {
  return typeof product.stock === 'number' && Number.isFinite(product.stock);
}

function validOrderId(value) {
  return /^KD-[A-Za-z0-9_-]{4,40}$/.test(String(value || ''));
}

exports.handler = async function(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = cors(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured on Netlify.');

    const body = JSON.parse(event.body || '{}');
    const orderId = String(body.orderId || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!validOrderId(orderId)) throw new Error('Invalid order reference.');
    if (!items.length || items.length > 20) throw new Error('Cart must contain 1–20 items.');

    const normalized = items.map((item) => ({
      id: String(item.id || '').trim(),
      qty: Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1))),
      imageIndex: Math.max(0, Math.min(20, Math.floor(Number(item.imageIndex) || 0)))
    }));

    if (normalized.some(x => !x.id || x.id.length > 150)) throw new Error('Invalid cart item.');

    const quantityById = {};
    for (const item of normalized) quantityById[item.id] = (quantityById[item.id] || 0) + item.qty;

    const productMap = new Map();
    for (const id of [...new Set(normalized.map(x => x.id))]) {
      const product = await getProduct(id);
      if (!product) throw new Error('A product no longer exists.');
      if (product.active === false) throw new Error(`${product.nameAr || product.code || 'Product'} is unavailable.`);
      if (managedStock(product) && quantityById[id] > Math.max(0, Math.floor(product.stock))) {
        throw new Error(`Available quantity changed for ${product.nameAr || product.code || 'a product'}.`);
      }
      productMap.set(id, product);
    }

    const params = new URLSearchParams();
    const siteUrl = String(process.env.KANDORTY_SITE_URL || 'https://kandorty.online').replace(/\/+$/, '');

    params.set('mode', 'payment');
    params.set('ui_mode', 'hosted');
    params.set('success_url', `${siteUrl}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${siteUrl}/?stripe=cancel`);
    params.set('client_reference_id', orderId);
    params.set('billing_address_collection', 'auto');
    params.set('allow_promotion_codes', 'false');
    params.set('metadata[order_id]', orderId);

    normalized.forEach((item, index) => {
      const product = productMap.get(item.id);
      const rawPrice = Number(product.salePrice || product.price || 0);
      const unitAmount = Math.round(rawPrice * 100);

      if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
        throw new Error(`Invalid price for ${product.nameAr || product.code || 'product'}.`);
      }

      const name = String(product.nameAr || product.nameEn || product.code || 'Kandorty product').slice(0, 120);

      params.set(`line_items[${index}][price_data][currency]`, 'aed');
      params.set(`line_items[${index}][price_data][unit_amount]`, String(unitAmount));
      params.set(`line_items[${index}][price_data][product_data][name]`, name);
      params.set(`line_items[${index}][quantity]`, String(item.qty));

      params.set(`metadata[item_${index}]`, JSON.stringify({
        id: item.id,
        qty: item.qty,
        imageIndex: item.imageIndex
      }));
    });

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(session?.error?.message || 'Stripe could not create the Checkout Session.');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: session.id, url: session.url })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message || 'Checkout failed.' })
    };
  }
};
