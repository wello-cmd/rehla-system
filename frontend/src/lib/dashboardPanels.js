export async function loadDashboardPanels(get, period = {}) {
  const dates = new URLSearchParams();
  if (period.start) dates.set('start', period.start);
  if (period.end) dates.set('end', period.end);
  const grouped = new URLSearchParams(dates);
  if (period.groupBy) grouped.set('groupBy', period.groupBy);
  const query = params => params.size ? `?${params}` : '';
  const panels = {
    sales: `/analytics/sales${query(grouped)}`,
    finance: `/analytics/financial-kpis${query(grouped)}`,
    products: `/analytics/top-products${query(grouped)}`,
    delivery: `/analytics/delivery${query(dates)}`,
    invoices: '/invoices/summary',
    inventory: '/financial/inventory-value',
  };
  const keys = Object.keys(panels);
  const results = await Promise.allSettled(keys.map(key => Promise.resolve().then(() => get(panels[key]))));
  const data = {}, errors = {};
  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled' && result.value !== null && typeof result.value === 'object' &&
        (key !== 'finance' || Array.isArray(result.value))) data[key] = result.value;
    else errors[key] = result.status === 'rejected' ? result.reason?.message || 'Could not load this section.' : 'The server returned incomplete data.';
  });
  return { data, errors };
}
