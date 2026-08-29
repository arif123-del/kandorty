function normalizePhoneForFirebase(raw){
  let v = String(raw || '').trim().replace(/[()\s-]/g, '');
  if (!v) return '';

  if (v.startsWith('00')) v = '+' + v.slice(2);

  if (v.startsWith('+')) {
    return '+' + v.slice(1).replace(/\D/g, '');
  }

  const digits = v.replace(/\D/g, '');

  // Afghanistan
  if (digits.startsWith('93')) return '+' + digits;
  if (/^07\d{8}$/.test(digits)) return '+93' + digits.slice(1);

  // UAE
  if (digits.startsWith('971')) return '+' + digits;
  if (/^05\d{8}$/.test(digits)) return '+971' + digits.slice(1);

  return '+' + digits;
}

window.normalizePhoneForFirebase = normalizePhoneForFirebase;
