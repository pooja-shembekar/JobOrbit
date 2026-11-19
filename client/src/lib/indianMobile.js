export function isValidIndianMobileNumber(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/[\s-]/g, '');
  return /^(?:\+91)?[6-9]\d{9}$/.test(normalized);
}
