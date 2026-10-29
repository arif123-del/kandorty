import {Fault} from '../cod-staging/security.mjs';
export const TEST_PROJECT='kandorty-stripe-test-5f8af',LIVE_PROJECT='kandorty-9378a';
export function releaseConfig(env){
 const mode=env.STRIPE_MODE,key=String(env.STRIPE_SECRET_KEY||'').trim();
 if(!['test','live'].includes(mode))throw new Fault('release_disabled',503);
 const live=mode==='live',projectId=live?LIVE_PROJECT:TEST_PROJECT;
 if(env.FIREBASE_PROJECT_ID!==projectId)throw new Fault('project_mode_mismatch',503);
 if(!(live?/^(?:sk|rk)_live_[a-zA-Z0-9_]+$/:/^(?:sk|rk)_test_[a-zA-Z0-9_]+$/).test(key))throw new Fault('stripe_key_mode_mismatch',503);
 if(live&&env.LIVE_RELEASE_APPROVAL!=='KANDORTY_STRIPE_V1_APPROVED')throw new Fault('live_release_not_approved',503);
 if(live&&!env.TURNSTILE_SECRET_KEY)throw new Fault('anti_bot_required',503);
 if(!live&&!/^[a-f0-9]{64}$/.test(env.STAGING_ACCESS_SECRET||''))throw new Fault('staging_gate_required',503);
 if(!/^whsec_[a-zA-Z0-9_]+$/.test(String(env.STRIPE_WEBHOOK_SECRET||'').trim())||!/^[a-f0-9]{64}$/.test(env.STRIPE_RECEIPT_SECRET||''))throw new Fault('signing_secrets_required',503);
 const host=live?'kandorty-stripe-release.aliyajan200011.workers.dev':'kandorty-stripe-release-test.aliyajan200011.workers.dev';
 return {mode,live,projectId,key,host,base:live?'https://kandorty.online':'https://'+host,origins:live?['https://kandorty.online','https://www.kandorty.online']:['https://'+host]};
}
