// Public isolated test page: only fake products and fake customer details; no live checkout.
export const TEST_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kandorty Stripe TEST only</title>
<style>body{font-family:system-ui,sans-serif;max-width:620px;margin:32px auto;padding:18px;color:#152234;line-height:1.5}
h1{font-size:1.5rem}button{background:#124bca;color:white;border:0;border-radius:8px;padding:14px 20px;font-size:1rem}
button:disabled{opacity:.55}p{margin:12px 0}.notice{border:2px solid #ba7b00;padding:14px;border-radius:9px;background:#fff8e9}
#status{padding:15px;border-radius:8px;background:#eef2f8;overflow-wrap:anywhere;white-space:pre-wrap}</style></head>
<body><h1>Kandorty · Stripe Sandbox Test</h1>
<p class="notice"><strong>TEST ONLY</strong> — This page cannot accept real card charges or register real Kandorty orders. Use a Stripe test card only.</p>
<p>Test product: AED 10.00 · Delivery: AED 25.00 · <strong>Total: AED 35.00</strong></p>
<button id="start" type="button">Open Sandbox checkout</button>
<p id="status" role="status" aria-live="polite">Ready for a simulated payment.</p>
<p>The store at kandorty.online is not connected to this staging page.</p>
<script src="/test.js" defer></script></body></html>`;
export const TEST_JS = String.raw`(() => {
  'use strict';
  const button = document.getElementById('start');
  const status = document.getElementById('status');
  const storageKey = 'kandorty_stripe_test_checkout_token';
  function show(message) { status.textContent = message; }
  function newToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function post(path, payload) {
    const response = await fetch(path, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      cache: 'no-store', body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Sandbox request failed');
    return data;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    show('Creating TEST Checkout...');
    const checkoutToken = newToken();
    sessionStorage.setItem(storageKey, checkoutToken);
    try {
      const result = await post('/create-checkout-session', {
        checkoutToken, customer: {
          name:'TEST ONLY', phone:'+971500000000', city:'Dubai', location:'TEST ADDRESS'
        }, items:[{id:'test-product',qty:1,imageIndex:0}], note:''
      });
      if (result.test !== true || typeof result.url !== 'string' ||
          new URL(result.url).origin !== 'https://checkout.stripe.com') {
        throw new Error('Unexpected checkout response');
      }
      location.assign(result.url);
    } catch (error) {
      show('TEST checkout failed: ' + String(error.message || error));
      button.disabled = false;
    }
  });
  const params = new URLSearchParams(location.search);
  if (params.get('stripe') === 'cancel') {
    show('Sandbox payment canceled; no order was created.');
    history.replaceState(null, '', '/test');
  } else if (params.get('stripe') === 'success') {
    const sessionId = params.get('session_id');
    const checkoutToken = sessionStorage.getItem(storageKey);
    history.replaceState(null, '', '/test');
    if (!sessionId || !checkoutToken) {
      show('Returned from Stripe. Local token unavailable; the signed webhook can still register this test order. Check test Firestore.');
    } else {
      button.disabled = true;
      show('Checking paid status and TEST order registration...');
      post('/verify-checkout-session', {session_id:sessionId,checkoutToken}).then(result => {
        show(result.paid && result.registered
          ? 'TEST payment verified and order registered: ' + String(result.orderId)
          : 'Sandbox session has not completed payment; no paid order registered.');
        if (result.registered) sessionStorage.removeItem(storageKey);
      }).catch(error => show('Verification pending/failed: '+String(error.message||error)
        +'. A signed webhook may still complete order registration.'))
        .finally(() => {button.disabled = false;});
    }
  }
})();`;
