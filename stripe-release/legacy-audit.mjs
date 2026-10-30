// Reproduce the *folder grouping*, not the order count, of the currently shipped admin.
// Input is only Firestore REST field-mask projections held in memory. Never return
// customer phone numbers, order IDs, documents, or customer records in an audit.
export function countLegacyOrderFolders(rows){
 if(!Array.isArray(rows))throw new TypeError('rows_required');
 const groups=new Set();
 for(const row of rows){
  if(typeof row?.id!=='string'||!row.id)throw new TypeError('invalid_order_row');
  const phone=row.fields?.customer?.mapValue?.fields?.phone?.stringValue;
  const normalized=String(phone||'').replace(/\D/g,'');
  groups.add(normalized?'phone:'+normalized:'order:'+row.id);
 }
 return groups.size;
}
