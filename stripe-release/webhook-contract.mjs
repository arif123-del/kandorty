// Single source of truth for the legacy v1/snapshot Stripe webhook event contract.
// This file contains NO credentials and makes NO Stripe API calls.
export const STRIPE_WEBHOOK_API_VERSION='2024-06-20';
export const STRIPE_WEBHOOK_URL='https://kandorty-stripe-release.aliyajan200011.workers.dev/webhook';
export const STRIPE_CHECKOUT_EVENTS=Object.freeze([
 'checkout.session.completed',
 'checkout.session.async_payment_succeeded'
]);
export const STRIPE_REFUND_EVENTS=Object.freeze([
 'refund.created',
 'refund.updated',
 'refund.failed',
 'charge.refunded'
]);
export const STRIPE_WEBHOOK_EVENTS=Object.freeze([...STRIPE_CHECKOUT_EVENTS,...STRIPE_REFUND_EVENTS]);
