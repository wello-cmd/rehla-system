import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import PeriodSelector from '../components/PeriodSelector';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, LineChart, Line, PieChart, Pie, Cell, ComposedChart
} from 'recharts';

const COLORS = ['#e5e2e1','#988e90','#6b6365','#4c4546','#c4a8a8','#a88c8c','#8c7070','#705454'];
const TT = { background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text)', fontSize:'12px' };
const egp = v => `EGP ${Number(v).toLocaleString('en-EG', { minimumFractionDigits:0, maximumFractionDigits:0 })}`;
const kTick = v => `${(v/1000).toFixed(0)}k`;

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:6 }}>{label}</p>
      <p style={{ fontSize:24, fontWeight:800, fontFamily:'var(--font-mono)', color: color || 'inherit' }}>{value}</p>
      {sub && <p style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:4 }}>{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab]     = useState('sales');
  const [loading, setLoading]         = useState(false);
  const [period, setPeriod]           = useState({});
  const [salesData, setSalesData]     = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [productData, setProductData] = useState(null);
  const [deliveryData, setDeliveryData]   = useState(null);
  const [costComp, setCostComp]           = useState(null);
  const [finKpis, setFinKpis]             = useState([]);

  const fetchAll = useCallback(async (p) => {
    setLoading(true);
    try {
      const parts = [
        p.start   ? `start=${p.start}`     : '',
        p.end     ? `end=${p.end}`         : '',
        p.groupBy ? `groupBy=${p.groupBy}` : '',
      ].filter(Boolean);
      const qs = parts.length ? `?${parts.join('&')}` : '';
      const dqs = [p.start ? `start=${p.start}` : '', p.end ? `end=${p.end}` : ''].filter(Boolean);
      const delQ = dqs.length ? `?${dqs.join('&')}` : '';

      const [sales, top, prod, deliv, cost, fin] = await Promise.all([
        api.get(`/analytics/sales${qs}`),
        api.get(`/analytics/top-products${qs}`),
        api.get('/analytics/products'),
        api.get(`/analytics/delivery${delQ}`),
        api.get(`/analytics/delivery/cost-comparison${delQ}`),
        api.get(`/analytics/financial-kpis${qs}`),
      ]);
      setSalesData(sales);
      setTopProducts(top);
      setProductData(prod);
      setDeliveryData(deliv);
      setCostComp(cost);
      setFinKpis(fin);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  function handlePeriod(p) {
    setPeriod(p);
    fetchAll(p);
  }

  const TABS = ['sales','products','delivery','financial'];

  // Computed financial totals
  const finTotal = {
    revenue:  finKpis.reduce((s,k) => s + (k.revenue  || 0), 0),
    expenses: finKpis.reduce((s,k) => s + (k.expenses || 0), 0),
    profit:   finKpis.reduce((s,k) => s + (k.profit   || 0), 0),
  };
  finTotal.margin = finTotal.revenue > 0
    ? ((finTotal.profit / finTotal.revenue) * 100).toFixed(1)
    : '0.0';

  return (
    <DashboardShell title="Analytics">
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Period selector */}
        <PeriodSelector onChange={handlePeriod} />

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--color-border-light)', paddingBottom:4 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className="btn btn-sm" style={{
              background:   activeTab===t ? 'var(--color-bg-active)' : 'transparent',
              borderColor:  activeTab===t ? 'var(--color-border)'    : 'transparent',
              color:        activeTab===t ? 'var(--color-text)'      : 'var(--color-text-muted)',
            }}>
              {t.toUpperCase()}
            </button>
          ))}
          {period.label && (
            <span style={{ marginLeft:'auto', fontSize:11, fontFamily:'var(--font-mono)', color:'var(--color-text-dim)', alignSelf:'center' }}>
              {period.label}
            </span>
          )}
        </div>

        {loading && (
          <div style={{ padding:'60px 0', textAlign:'center', color:'var(--color-text-dim)' }}>
            <div className="skeleton" style={{ height:40, marginBottom:16 }} />
            <div className="skeleton" style={{ height:300 }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── SALES ── */}
            {activeTab === 'sales' && salesData && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* KPI cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px,1fr))', gap:12 }}>
                  <KpiCard
                    label="GMV"
                    value={formatEGP(salesData.grossRevenue || salesData.totalRevenue)}
                    sub={`${salesData.totalOrders} orders (before returns)`}
                  />
                  {(salesData.refundsTotal > 0) && (
                    <KpiCard
                      label="Returns"
                      value={`−${formatEGP(salesData.refundsTotal)}`}
                      sub={`${salesData.refundsCount} refund events`}
                      color="var(--color-error)"
                    />
                  )}
                  <KpiCard
                    label="Net Revenue"
                    value={formatEGP(salesData.totalRevenue)}
                    sub="matches Shopify Total sales"
                    color="var(--color-success)"
                  />
                  <KpiCard label="Paid / Collected" value={formatEGP(salesData.paidRevenue || 0)} sub={`${salesData.paidOrders || 0} paid orders`} />
                  <KpiCard label="Avg Order Value"  value={formatEGP(salesData.avgOrderValue)}  />
                  {finTotal.revenue > 0 && (
                    <KpiCard
                      label="Net Profit"
                      value={formatEGP(finTotal.profit)}
                      sub={`${finTotal.margin}% margin`}
                      color={finTotal.profit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                    />
                  )}
                </div>

                {/* Revenue trend */}
                <div className="card">
                  <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>
                    Revenue Trend — {
                      period.groupBy === 'day'   ? 'Daily' :
                      period.groupBy === 'week'  ? 'Weekly' :
                      period.groupBy === 'month' ? 'Monthly' :
                      period.groupBy === 'quarter' ? 'Quarterly' :
                      period.groupBy === 'half'  ? 'Half-Year' : 'Grouped'
                    }
                  </p>
                  {salesData.trend?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={salesData.trend} margin={{ bottom:24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="label" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} angle={-30} textAnchor="end" height={50} interval="preserveStartEnd" />
                        <YAxis yAxisId="left"  tickFormatter={kTick} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <YAxis yAxisId="right" orientation="right"   tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <Tooltip contentStyle={TT} formatter={(v, n) => [n === 'Revenue' ? egp(v) : v, n]} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <Bar      yAxisId="left"  dataKey="revenue" name="Revenue" fill="#e5e2e1" radius={[2,2,0,0]} />
                        <Line     yAxisId="right" type="monotone" dataKey="orders" name="Orders"
                          stroke="#988e90" strokeWidth={2} dot={{ r:3, fill:'#988e90' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No data for this period</p>
                  )}
                </div>

                {/* Category revenue + weekly pattern */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px,1fr))', gap:16 }}>
                  {salesData.categoryRevenue?.length > 0 && (
                    <div className="card">
                      <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Revenue by Category</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={salesData.categoryRevenue} layout="vertical" margin={{ left:4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                          <XAxis type="number" tickFormatter={kTick} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                          <YAxis dataKey="name" type="category" width={90} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                          <Tooltip contentStyle={TT} formatter={v => [egp(v), 'Revenue']} />
                          <Bar dataKey="revenue" radius={[0,2,2,0]}>
                            {salesData.categoryRevenue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Weekly Sales Pattern</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={salesData.heatmap}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="day" tick={{ fill:'var(--color-text-muted)', fontSize:11 }} />
                        <YAxis yAxisId="l" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} tickFormatter={kTick} />
                        <YAxis yAxisId="r" orientation="right" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <Tooltip contentStyle={TT} formatter={(v, n) => [n==='Revenue (EGP)' ? egp(v) : v, n]} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <Bar yAxisId="l" dataKey="revenue" name="Revenue (EGP)" fill="#e5e2e1" radius={[2,2,0,0]} />
                        <Bar yAxisId="r" dataKey="orders"  name="Orders"        fill="#988e90" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Hour-of-day chart (only relevant for short periods) */}
                {period.groupBy === 'day' && salesData.hourly?.some(h => h.orders > 0) && (
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Orders by Hour of Day</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={salesData.hourly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="hour" tick={{ fill:'var(--color-text-muted)', fontSize:9 }} />
                        <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <Tooltip contentStyle={TT} />
                        <Bar dataKey="orders" fill="#6b6365" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ── PRODUCTS ── */}
            {activeTab === 'products' && topProducts && productData && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px,1fr))', gap:16 }}>
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Top 10 by Revenue</p>
                    {topProducts.byRevenue?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={topProducts.byRevenue} layout="vertical" margin={{ left:4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                          <XAxis type="number" tickFormatter={kTick} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fill:'var(--color-text-muted)', fontSize:9 }} />
                          <Tooltip contentStyle={TT} formatter={v => [egp(v), 'Revenue']} />
                          <Bar dataKey="revenue" fill="#e5e2e1" radius={[0,2,2,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No sales in this period</p>
                    )}
                  </div>

                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Top 10 by Units Sold</p>
                    {topProducts.byUnits?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={topProducts.byUnits} layout="vertical" margin={{ left:4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                          <XAxis type="number" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fill:'var(--color-text-muted)', fontSize:9 }} />
                          <Tooltip contentStyle={TT} />
                          <Bar dataKey="units" fill="#988e90" radius={[0,2,2,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No sales in this period</p>
                    )}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px,1fr))', gap:16 }}>
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:12 }}>Slow Movers (All Time)</p>
                    <div style={{ maxHeight:260, overflowY:'auto' }}>
                      <table className="data-table" style={{ fontSize:12 }}>
                        <thead><tr><th>SKU</th><th>Name</th><th>Sold</th><th>Stock</th><th>Sell-Through</th></tr></thead>
                        <tbody>
                          {productData.worstPerformers?.map((p, i) => (
                            <tr key={i}>
                              <td className="font-mono">{p.sku}</td>
                              <td>{p.name}</td>
                              <td className="font-mono" style={{ fontWeight:600 }}>{p.units_sold}</td>
                              <td className="font-mono">{p.current_stock}</td>
                              <td className="font-mono">
                                <span style={{ color: Number(p.sell_through_rate) > 50 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                                  {p.sell_through_rate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:12 }}>
                      Dead Stock — Zero Sales
                      <span className="badge badge-error" style={{ marginLeft:8, fontSize:10 }}>{productData.zeroSales?.length || 0}</span>
                    </p>
                    <div style={{ maxHeight:260, overflowY:'auto' }}>
                      <table className="data-table" style={{ fontSize:12 }}>
                        <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Stock</th></tr></thead>
                        <tbody>
                          {productData.zeroSales?.length === 0 ? (
                            <tr><td colSpan="4" style={{ textAlign:'center', padding:'24px', color:'var(--color-text-dim)' }}>No dead stock</td></tr>
                          ) : productData.zeroSales?.map((p, i) => (
                            <tr key={i}>
                              <td className="font-mono">{p.sku}</td>
                              <td>{p.name}</td>
                              <td>{p.category}</td>
                              <td className="font-mono">{p.current_stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DELIVERY ── */}
            {activeTab === 'delivery' && deliveryData && costComp && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* Status summary cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:12 }}>
                  <KpiCard label="Total Shipments"   value={formatNumber(deliveryData.total)} />
                  <KpiCard label="Delivered"
                    value={formatNumber(deliveryData.delivered)}
                    color="var(--color-success)"
                    sub={deliveryData.total > 0 ? `${((deliveryData.delivered/deliveryData.total)*100).toFixed(1)}% rate` : undefined}
                  />
                  <KpiCard label="Failed"
                    value={formatNumber(deliveryData.failed)}
                    color={deliveryData.failed > 0 ? 'var(--color-error)' : undefined}
                  />
                  <KpiCard label="Own Drivers COD" value={formatEGP(costComp.own_driver?.cod_collected || 0)} />
                  <KpiCard label="Bosta COD"        value={formatEGP(costComp.bosta?.cod_collected || 0)} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px,1fr))', gap:16 }}>
                  {/* Status pie */}
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Status Breakdown</p>
                    {Object.keys(deliveryData.statusBreakdown || {}).length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={Object.entries(deliveryData.statusBreakdown).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }))}
                            dataKey="value" cx="50%" cy="50%" outerRadius={85}
                            label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {Object.keys(deliveryData.statusBreakdown).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={TT} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No delivery data</p>
                    )}
                  </div>

                  {/* Bosta vs own */}
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Bosta vs Own Drivers</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={[
                        { name:'Own Drivers', delivered: costComp.own_driver?.delivered||0, failed: costComp.own_driver?.failed||0, total: costComp.own_driver?.total||0 },
                        { name:'Bosta',       delivered: costComp.bosta?.delivered||0,       failed: costComp.bosta?.failed||0,       total: costComp.bosta?.total||0 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="name" tick={{ fill:'var(--color-text-muted)', fontSize:11 }} />
                        <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <Tooltip contentStyle={TT} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <Bar dataKey="delivered" name="Delivered" fill="#4caf50" radius={[2,2,0,0]} />
                        <Bar dataKey="failed"    name="Failed"    fill="#ef5350" radius={[2,2,0,0]} />
                        <Bar dataKey="total"     name="Total"     fill="#c6c6c6" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Driver table */}
                <div className="card">
                  <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Driver Performance</p>
                  <div style={{ overflowX:'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr><th>Driver</th><th>Zone</th><th>Total</th><th>Delivered</th><th>Failed</th><th>Success Rate</th><th>Avg Transit</th></tr>
                      </thead>
                      <tbody>
                        {deliveryData.driverAnalytics?.map((dr, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight:600 }}>{dr.name}</td>
                            <td>{dr.zone || '—'}</td>
                            <td className="font-mono">{dr.total}</td>
                            <td className="font-mono" style={{ color:'var(--color-success)' }}>{dr.delivered}</td>
                            <td className="font-mono" style={{ color: dr.failed > 0 ? 'var(--color-error)' : 'inherit' }}>{dr.failed}</td>
                            <td className="font-mono" style={{ fontWeight:700, color: Number(dr.success_rate) >= 80 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                              {dr.success_rate}%
                            </td>
                            <td className="font-mono">{dr.avg_delivery_time_hrs ? `${dr.avg_delivery_time_hrs}h` : '—'}</td>
                          </tr>
                        ))}
                        {deliveryData.driverAnalytics?.length === 0 && (
                          <tr><td colSpan="7" style={{ textAlign:'center', padding:24, color:'var(--color-text-dim)' }}>No delivery data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Failure reasons */}
                {Object.keys(deliveryData.failedReasons || {}).length > 0 && (
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:12 }}>Failure Reasons</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {Object.entries(deliveryData.failedReasons).sort((a,b) => b[1]-a[1]).map(([reason, count], i) => {
                        const total = Object.values(deliveryData.failedReasons).reduce((s,v)=>s+v,0);
                        return (
                          <div key={i}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                              <span style={{ fontSize:13, textTransform:'capitalize' }}>{reason.replace(/_/g,' ')}</span>
                              <span className="font-mono" style={{ fontSize:12, color:'var(--color-error)' }}>{count}</span>
                            </div>
                            <div style={{ height:4, background:'var(--color-border-light)', borderRadius:2 }}>
                              <div style={{ height:4, background:'var(--color-error)', borderRadius:2, width:`${(count/total*100).toFixed(0)}%`, opacity:0.7 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── FINANCIAL ── */}
            {activeTab === 'financial' && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* Summary KPI cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:12 }}>
                  <KpiCard label="Total Revenue"  value={formatEGP(finTotal.revenue)} />
                  <KpiCard label="Total Expenses" value={formatEGP(finTotal.expenses)} color="var(--color-error)" />
                  <KpiCard
                    label="Net Profit"
                    value={formatEGP(finTotal.profit)}
                    color={finTotal.profit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                  />
                  <KpiCard
                    label="Profit Margin"
                    value={`${finTotal.margin}%`}
                    color={parseFloat(finTotal.margin) >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                  />
                  {finTotal.revenue > 0 && (
                    <KpiCard
                      label="Expense Ratio"
                      value={`${(finTotal.expenses / finTotal.revenue * 100).toFixed(1)}%`}
                    />
                  )}
                </div>

                {/* Revenue vs Expenses vs Profit chart */}
                <div className="card">
                  <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Revenue · Expenses · Profit</p>
                  {finKpis.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={finKpis} margin={{ bottom:24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="period" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} angle={-20} textAnchor="end" height={45} interval="preserveStartEnd" />
                        <YAxis tickFormatter={kTick} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                        <Tooltip contentStyle={TT} formatter={(v, n) => [egp(v), n]} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <Bar  dataKey="revenue"  name="Revenue"  fill="#e5e2e1" radius={[2,2,0,0]} />
                        <Bar  dataKey="expenses" name="Expenses" fill="#ef5350" opacity={0.75} radius={[2,2,0,0]} />
                        <Line dataKey="profit"   name="Profit"   stroke="#4caf50" strokeWidth={2} dot={{ r:3 }} type="monotone" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No data for this period</p>
                  )}
                </div>

                {/* Profit margin trend */}
                {finKpis.length > 1 && (
                  <div className="card">
                    <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Profit Margin Trend (%)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={finKpis} margin={{ bottom:24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                        <XAxis dataKey="period" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} angle={-20} textAnchor="end" height={45} interval="preserveStartEnd" />
                        <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} unit="%" />
                        <Tooltip contentStyle={TT} formatter={v => [`${v}%`, 'Margin']} />
                        <Line dataKey="profit_margin" name="Profit Margin" stroke="#4caf50" strokeWidth={2} dot={{ r:3 }} type="monotone" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Detailed table */}
                <div className="card" style={{ padding:0, overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Revenue</th>
                          <th>Expenses</th>
                          <th>Profit</th>
                          <th>Margin</th>
                          <th>Expense Ratio</th>
                          <th>Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finKpis.length === 0 && (
                          <tr><td colSpan="7" style={{ textAlign:'center', padding:40, color:'var(--color-text-dim)' }}>No data for this period</td></tr>
                        )}
                        {finKpis.map((kpi, i) => (
                          <tr key={i}>
                            <td className="font-mono" style={{ fontWeight:600 }}>{kpi.period}</td>
                            <td className="font-mono">{formatEGP(kpi.revenue)}</td>
                            <td className="font-mono" style={{ color:'var(--color-error)' }}>{formatEGP(kpi.expenses)}</td>
                            <td className="font-mono" style={{ fontWeight:600, color: kpi.profit >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                              {formatEGP(kpi.profit)}
                            </td>
                            <td className="font-mono" style={{ color: parseFloat(kpi.profit_margin) >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                              {kpi.profit_margin}%
                            </td>
                            <td className="font-mono">{kpi.expense_ratio}%</td>
                            <td className="font-mono" style={{
                              color: kpi.mom_growth === 'N/A' ? 'inherit' : kpi.mom_growth.startsWith('-') ? 'var(--color-error)' : 'var(--color-success)'
                            }}>
                              {kpi.mom_growth !== 'N/A' ? `${kpi.mom_growth}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
