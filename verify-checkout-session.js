const ALLOWED_ORIGINS = new Set([
  'https://kandorty.online',
  'https://www.kandorty.online'
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://kandorty.online';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

exports.handler = async function(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = cors(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured on Netlify.');

    const sessionId = String(event.queryStringParameters?.session_id || '').trim();
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      throw new Error('Invalid Stripe session ID.');
    }

    const stripeResponse = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId),
      { headers: { 'Authorization': `Bearer ${secret}` } }
    );

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(session?.error?.message || 'Stripe session could not be verified.');
    }

    const metadata = session.metadata || {};
    const items = Object.entries(metadata)
      .filter(([key]) => /^item_\d+$/.test(key))
      .sort(([a],[b]) => Number(a.split('_')[1]) - Number(b.split('_')[1]))
      .map(([, value]) => {
        try { return JSON.parse(value); } catch (_) { return null; }
      })
      .filter(Boolean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: session.id,
        orderId: metadata.order_id || session.client_reference_id || '',
        payment_status: session.payment_status || '',
        status: session.status || '',
        amount_total: session.amount_total || 0,
        currency: session.currency || '',
        items
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message || 'Verification failed.' })
    };
  }
};
