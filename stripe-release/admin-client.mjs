export function adminOrderClient({endpoint='https://kandorty-stripe-release.aliyajan200011.workers.dev',getIdToken,net=fetch}){
 if(!['https://kandorty-stripe-release.aliyajan200011.workers.dev','https://kandorty-stripe-release-test.aliyajan200011.workers.dev'].includes(endpoint))throw new Error('invalid_admin_endpoint');
 return {async change(orderId,status){const token=await getIdToken(true);if(!token)throw new Error('admin_sign_in_required');const r=await net(endpoint+'/admin/orders/status',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({orderId,status})});const data=await r.json();if(!r.ok)throw new Error(data.error||'admin_action_failed');return data.order;}};
}
