export function cartDeliveryFils(settings = {}) {
  const note = String(settings.cartButtonNote || settings.cartCustomText || '').trim()
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.');
  if (/^(?:التوصيل|توصيل)\s+مجاني$|^free delivery$/i.test(note)) return 0;
  const amount = note.match(/^(?:(?:التوصيل|توصيل|delivery)\s*(?:ب|:)?\s*)?(\d{1,5}(?:\.\d{1,2})?)\s*(?:درهم|د\.?إ\.?|AED)?$/i);
  return amount ? Math.round(Number(amount[1]) * 100) : 2500;
}
