
const ALLOWED_ORIGINS = new Set([
'https://kandorty.online',
'https://www.kandorty.online'
]);

const FIREBASE_PROJECT_ID = 'kandorty-9378a';
const DELIVERY_FEE_FILS = 2500; // 25 AED

function json(data, status = 200, origin = '') {
const headers = {
'Content-Type': 'application/json; charset=utf-8',
'Cache-Control': 'no-store',
'Vary': 'Origin'
};

if (ALLOWED_ORIGINS.has(origin)) {
headers['Access-Control-Allow-Origin'] = origin;
headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
headers['Access-Control-Allow-Headers'] = 'Content-Type';
}

return new Response(JSON.stringify(data), { status, headers });
}

function dv(v) {
if (!v || typeof v !== 'object') return null;
if ('stringValue' in v) return v.stringValue;
if ('integerValue' in v) return Number(v.integerValue);
if ('doubleValue' in v) return Number(v.doubleValue);
if ('booleanValue' in v) return Boolean(v.booleanValue);
if ('nullValue' in v) return null;
if ('arrayValue' in v) return (v.arrayValue.values || []).map(dv);
if ('mapValue' in v) return df(v.mapValue.fields || {});
return null;
}

function df(fields) {
const result = {};
for (const [key, value] of Object.entries(fields || {})) {
result[key] = dv(value);
}
return result;
}

async function getProduct(id) {
const url =
`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
`/databases/(default)/documents/products/${encodeURIComponent(id)}`;

const response = await fetch(url);

if (response.status === 404) return null;

if (!response.ok) {
throw new Error(`Firestore product read failed (${response.status})`);
}

const data = await response.json();
return { id, ...df(data.fields || {}) };
}

function validOrderId(value) {
return /^KD-[A-Za-z0-9_-]{4,40}$/.test(String(value || ''));
}

export default {
async fetch(request, env) {
const origin = request.headers.get('Origin') || '';
const path = new URL(request.url).pathname.replace(/\/$/, '');

if (!ALLOWED_ORIGINS.has(origin)) {
return json({ error: 'Origin not allowed' }, 403, origin);
}

if (request.method === 'OPTIONS') {
return new Response(null, {
status: 204,
headers: {
'Access-Control-Allow-Origin': origin,
'Access-Control-Allow-Methods': 'POST, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type',
'Vary': 'Origin'
}
});
}

if (request.method !== 'POST') {
return json({ error: 'Method not allowed' }, 405, origin);
}

if (!env.STRIPE_SECRET_KEY) {
return json({ error: 'Stripe secret not configured' }, 500, origin);
}

try {
if (path === '/create-checkout-session') {
const body = await request.json();

const orderId = String(body.orderId || '').trim();
const items = Array.isArray(body.items) ? body.items : [];

if (!validOrderId(orderId)) {
throw new Error('Invalid order reference.');
}

if (!items.length || items.length > 20) {
throw new Error('Cart must contain 1-20 items.');
}

const normalized = items.map(item => ({
id: String(item.id || '').trim(),
qty: Math.max(
1,
Math.min(99, Math.floor(Number(item.qty) || 1))
)
}));

if (normalized.some(item => !item.id || item.id.length > 150)) {
throw new Error('Invalid cart item.');
}

const products = new Map();
const quantities = new Map();

for (const item of normalized) {
quantities.set(
item.id,
(quantities.get(item.id) || 0) + item.qty
);
}

for (const id of [...new Set(normalized.map(item => item.id))]) {
const product = await getProduct(id);

if (!product) {
throw new Error(`Product not found: ${id}`);
}

if (product.active === false) {
throw new Error('Product is unavailable.');
}

const stock = Number(product.stock);

if (
product.stock !== undefined &&
product.stock !== null &&
Number.isFinite(stock) &&
quantities.get(id) > Math.max(0, Math.floor(stock))
) {
throw new Error('Insufficient product stock.');
}

products.set(id, product);
}

const params = new URLSearchParams();

const site = String(
env.KANDORTY_SITE_URL || 'https://kandorty.online'
).replace(/\/+$/, '');

params.set('mode', 'payment');

params.set(
'success_url',
`${site}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`
);

params.set('cancel_url', `${site}/?stripe=cancel`);
params.set('client_reference_id', orderId);
params.set('metadata[order_id]', orderId);
params.set('metadata[delivery_fee_aed]', '25');

normalized.forEach((item, index) => {
const product = products.get(item.id);

const amount = Math.round(
Number(product.salePrice || product.price || 0) * 100
);

if (!Number.isInteger(amount) || amount <= 0) {
throw new Error('Invalid product price.');
}

const name = String(
product.nameAr ||
product.nameEn ||
product.code ||
'Kandorty product'
).slice(0, 120);

params.set(
`line_items[${index}][price_data][currency]`,
'aed'
);

params.set(
`line_items[${index}][price_data][unit_amount]`,
String(amount)
);

params.set(
`line_items[${index}][price_data][product_data][name]`,
name
);

params.set(
`line_items[${index}][quantity]`,
String(item.qty)
);
});

// Add AED 25 delivery once per order.
const deliveryIndex = normalized.length;

params.set(
`line_items[${deliveryIndex}][price_data][currency]`,
'aed'
);

params.set(
`line_items[${deliveryIndex}][price_data][unit_amount]`,
String(DELIVERY_FEE_FILS)
);

params.set(
`line_items[${deliveryIndex}][price_data][product_data][name]`,
'Delivery fee'
);

params.set(
`line_items[${deliveryIndex}][quantity]`,
'1'
);

const stripeResponse = await fetch(
'https://api.stripe.com/v1/checkout/sessions',
{
method: 'POST',
headers: {
Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
'Content-Type': 'application/x-www-form-urlencoded'
},
body: params.toString()
}
);

const responseText = await stripeResponse.text();

let session;

try {
session = JSON.parse(responseText);
} catch {
throw new Error('Stripe returned an invalid response.');
}

if (!stripeResponse.ok) {
throw new Error(
session?.error?.message ||
'Unable to create Stripe Checkout.'
);
}

if (!session.id || !session.url) {
throw new Error('Stripe Checkout URL missing.');
}

return json({
id: session.id,
url: session.url
}, 200, origin);
}

if (path === '/verify-checkout-session') {
const body = await request.json();
const sessionId = String(body.session_id || '').trim();

if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
return json({ error: 'Invalid session id' }, 400, origin);
}

const response = await fetch(
`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
{
headers: {
Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
}
}
);

const session = await response.json();

if (!response.ok) {
return json({
error: session?.error?.message ||
'Unable to verify payment.'
}, 400, origin);
}

return json({
id: session.id,
orderId: session.client_reference_id,
status: session.status,
payment_status: session.payment_status,
currency: session.currency,
amount_total: session.amount_total
}, 200, origin);
}

return json({ error: 'Not found' }, 404, origin);

} catch (error) {
console.error('Kandorty Stripe error:', error);

return json({
error: error instanceof Error
? error.message
: String(error)
}, 400, origin);
}
}
};
