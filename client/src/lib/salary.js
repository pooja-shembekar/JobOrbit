const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatSalary(min, max) {
  if (min != null && max != null) return `${inrFormatter.format(min)} – ${inrFormatter.format(max)}`;
  if (min != null) return `From ${inrFormatter.format(min)}`;
  if (max != null) return `Up to ${inrFormatter.format(max)}`;
  return null;
}
