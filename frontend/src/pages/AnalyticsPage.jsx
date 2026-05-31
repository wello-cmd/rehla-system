import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('sales');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Data states
  const [salesData, setSalesData] = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [productData, setProductData] = useState(null);
  const [deliveryData, setDeliveryData] = useState(null);
  const [costComparison, setCostComparison] = useState(null);
  const [financialKpis, setFinancialKpis] = useState([]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const queryParams = [];
      if (startDate) queryParams.push(`start=${startDate}`);
      if (endDate) queryParams.push(`end=${endDate}`);
      const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const [sales, top, prod, deliv, cost, fin] = await Promise.all([
        api.get(`/analytics/sales${qs}`),
        api.get(`/analytics/top-products`),
        api.get(`/analytics/products`),
        api.get(`/analytics/delivery`),
        api.get(`/analytics/delivery/cost-comparison`),
        api.get(`/analytics/financial-kpis`)
      ]);

      setSalesData(sales);
      setTopProducts(top);
      setProductData(prod);
      setDeliveryData(deliv);
      setCostComparison(cost);
      setFinancialKpis(fin);
    } catch (err) {
      toast.error('Failed to load analytics data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    fetchAnalytics();
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '300px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="System Analytics">
      {/* Date Filter & Tab Selection */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '4px' }}>
          {['sales', 'products', 'delivery', 'financial'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="btn btn-sm"
              style={{
                background: activeTab === tab ? 'var(--color-bg-active)' : 'transparent',
                borderColor: activeTab === tab ? 'var(--color-border)' : 'transparent',
                color: activeTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)'
              }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px' }}
            />
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>to</span>
          <div>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Filter
          </button>
        </form>
      </div>

      {loading ? renderSkeleton() : (
        <>
          {/* Tab 1: Sales */}
          {activeTab === 'sales' && salesData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Total Revenue</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(salesData.totalRevenue)}</p>
                </div>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Paid Orders</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatNumber(salesData.totalOrders)}</p>
                </div>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Average Order Value</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(salesData.avgOrderValue)}</p>
                </div>
              </div>

              {/* Day of week heatmap/bar */}
              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Weekly Sales Load (Day-of-Week Distribution)</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData.heatmap}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="day" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} label={{ value: 'Revenue (EGP)', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: '11px' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} label={{ value: 'Orders', angle: 90, position: 'insideRight', fill: 'var(--color-text-muted)', fontSize: '11px' }} />
                    <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue (EGP)" fill="#e5e2e1" />
                    <Bar yAxisId="right" dataKey="orders" name="Order count" fill="#988e90" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab 2: Products */}
          {activeTab === 'products' && topProducts && productData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Top by revenue */}
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Top 5 Products (By Revenue)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={topProducts.byRevenue} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                      <Bar dataKey="revenue" fill="#e5e2e1" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Top by units */}
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Top 5 Products (By Quantity Sold)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={topProducts.byUnits} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                      <Bar dataKey="units" fill="#988e90" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dead stock and low performs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Worst Performing Products (Excl. Dead Stock)</p>
                  <table className="data-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Name</th>
                        <th>Sold</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productData.worstPerformers?.map((p, i) => (
                        <tr key={i}>
                          <td className="font-mono">{p.sku}</td>
                          <td>{p.name}</td>
                          <td style={{ fontWeight: 600 }}>{p.units_sold}</td>
                          <td className="font-mono">{p.current_stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Zero Sales Dead Stock</p>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Name</th>
                          <th>Current Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productData.zeroSales?.map((p, i) => (
                          <tr key={i}>
                            <td className="font-mono">{p.sku}</td>
                            <td>{p.name}</td>
                            <td className="font-mono">{p.current_stock}</td>
                          </tr>
                        ))}
                        {productData.zeroSales?.length === 0 && (
                          <tr>
                            <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-dim)' }}>
                              No dead stock detected!
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Delivery */}
          {activeTab === 'delivery' && deliveryData && costComparison && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Delivery Cost Comparison (Internal vs Bosta) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '24px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Couriers Cost Comparison (Delivery Volume)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={[
                      { name: 'Own Drivers', total: costComparison.own_driver?.total || 0, delivered: costComparison.own_driver?.delivered || 0, failed: costComparison.own_driver?.failed || 0 },
                      { name: 'Bosta API', total: costComparison.bosta?.total || 0, delivered: costComparison.bosta?.delivered || 0, failed: costComparison.bosta?.failed || 0 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="delivered" name="Delivered Successfully" fill="#4caf50" />
                      <Bar dataKey="failed" name="Failed / Refused" fill="#ef5350" />
                      <Bar dataKey="total" name="Total Dispatched" fill="#c6c6c6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Failed Reason breakdown</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                    {Object.entries(deliveryData.failedReasons || {}).map(([reason, count], idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>
                          {reason.replace(/_/g, ' ')}
                        </span>
                        <span className="badge badge-error" style={{ fontFamily: 'var(--font-mono)' }}>{count}</span>
                      </div>
                    ))}
                    {Object.keys(deliveryData.failedReasons || {}).length === 0 && (
                      <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', textAlign: 'center', padding: '30px 0' }}>
                        No delivery failures recorded
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Driver performance table */}
              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Internal Driver Performance Metrics</p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Driver Name</th>
                      <th>Zone</th>
                      <th>Total Assigned</th>
                      <th>Delivered</th>
                      <th>Failed</th>
                      <th>Success Rate</th>
                      <th>Avg Transit Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryData.driverAnalytics?.map((dr, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{dr.name}</td>
                        <td>{dr.zone}</td>
                        <td className="font-mono">{dr.total}</td>
                        <td className="font-mono" style={{ color: 'var(--color-success)' }}>{dr.delivered}</td>
                        <td className="font-mono" style={{ color: 'var(--color-error)' }}>{dr.failed}</td>
                        <td className="font-mono" style={{ fontWeight: 700 }}>{dr.success_rate}%</td>
                        <td className="font-mono">
                          {dr.avg_delivery_time_hrs ? `${dr.avg_delivery_time_hrs} hours` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Financial KPIs */}
          {activeTab === 'financial' && financialKpis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Financial KPI Table */}
              <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Revenue (EGP)</th>
                      <th>Expenses (EGP)</th>
                      <th>Profit Margin</th>
                      <th>Expense Ratio</th>
                      <th>MoM Revenue Growth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialKpis.map((kpi, idx) => (
                      <tr key={idx}>
                        <td className="font-mono" style={{ fontWeight: 600 }}>{kpi.month}</td>
                        <td className="font-mono">{formatEGP(kpi.revenue)}</td>
                        <td className="font-mono" style={{ color: 'var(--color-error)' }}>{formatEGP(kpi.expenses)}</td>
                        <td className="font-mono" style={{ fontWeight: 700, color: parseFloat(kpi.profit_margin) > 0 ? 'var(--color-success)' : 'inherit' }}>
                          {kpi.profit_margin}%
                        </td>
                        <td className="font-mono">{kpi.expense_ratio}%</td>
                        <td className="font-mono" style={{
                          color: kpi.mom_growth.startsWith('-') ? 'var(--color-error)' : kpi.mom_growth === 'N/A' ? 'inherit' : 'var(--color-success)'
                        }}>
                          {kpi.mom_growth !== 'N/A' ? `${kpi.mom_growth}%` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {financialKpis.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                          No monthly data aggregates found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
