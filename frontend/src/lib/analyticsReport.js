// Keep the report and its period together; only the newest request may publish.
export function createAnalyticsReportLoader(get, publish) {
  let requestId = 0;
  let state = { requestedPeriod: {}, appliedPeriod: null, data: null, loading: false, error: null };
  const update = patch => {
    state = { ...state, ...patch };
    publish(state);
  };

  return {
    async load(period = {}) {
      const current = ++requestId;
      const requestedPeriod = { ...period };
      update({ requestedPeriod, loading: true, error: null });
      const dates = new URLSearchParams();
      if (period.start) dates.set('start', period.start);
      if (period.end) dates.set('end', period.end);
      const grouped = new URLSearchParams(dates);
      if (period.groupBy) grouped.set('groupBy', period.groupBy);
      const query = params => params.size ? `?${params}` : '';
      try {
        const [sales, topProducts, products, delivery, costs, finance] = await Promise.all([
          get(`/analytics/sales${query(grouped)}`),
          get(`/analytics/top-products${query(grouped)}`),
          get('/analytics/products'),
          get(`/analytics/delivery${query(dates)}`),
          get(`/analytics/delivery/cost-comparison${query(dates)}`),
          get(`/analytics/financial-kpis${query(grouped)}`),
        ]);
        if (current !== requestId) return;
        if (![sales, topProducts, products, delivery, costs].every(value => value && typeof value === 'object') || !Array.isArray(finance)) {
          throw new Error('The server returned an incomplete analytics report.');
        }
        update({ appliedPeriod: requestedPeriod, data: { sales, topProducts, products, delivery, costs, finance }, loading: false, error: null });
      } catch (error) {
        if (current === requestId) update({ loading: false, error: error?.message || 'Could not load analytics.' });
      }
    },
  };
}
