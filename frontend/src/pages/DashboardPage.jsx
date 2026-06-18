import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import PeriodSelector from '../components/PeriodSelector';
import toast from 'react-hot-toast';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';

const CHART_COLORS = ['#6366f1','#3fb950','#f0883e','#58a6ff','#f85149'];
const TT = { background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text)', fontSize:12, borderRadius:6 };
const kTick = v => `${(v/1000).toFixed(0)}k`;
const egpFmt = v => `EGP ${Number(v).toLocaleString('en-EG',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

// Build default period: current month
function defaultPeriod() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const end   = `${y}-${m}-${d}`;
  const monthName = now.toLocaleString('en', { month: 'long' });
  return { start, end, groupBy: 'day', label: `${monthName} ${y}` };
}

function KpiCard({ label, value, sub, color, icon, loading }) {
  return (
    <div className="card kpi-card" style={{ '--kpi-accent': color || 'var(--color-border-light)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <p className="text-label" style={{ color:'var(--color-text-dim)' }}>{label}</p>
        {icon && (
          <span className="material-symbols-outlined" style={{ fontSize:18, color: color || 'var(--color-text-dim)', fontVariationSettings:"'FILL' 1", opacity:0.6 }}>
            {icon}
          </span>
        )}
      </div>
      {loading
        ? <div className="skeleton" style={{ height:30, width:'65%', marginBottom:4 }} />
        : <p style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.03em', fontFamily:'var(--font-mono)', color: color || 'inherit', lineHeight:1.1, whiteSpace:'nowrap' }}>{value}</p>
      }
      {!loading && sub && (
        <p style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:4 }}>{sub}</p>
      )}
    </div>
  );
}

function ChartCard({ title, loading, height = 260, children, extra }) {
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p className="text-label" style={{ color:'var(--color-text-dim)' }}>{title}</p>
        {extra}
      </div>
      {loading
        ? <div className="skeleton" style={{ height }} />
        : children
      }
    </div>
  );
}

export default function DashboardPage() {
  const [loading,        setLoading]        = useState(true);
  const [period,         setPeriod]         = useState(defaultPeriod());
  const [salesData,      setSalesData]      = useState(null);
  const [finKpis,        setFinKpis]        = useState([]);
  const [topProducts,    setTopProducts]    = useState([]);
  const [deliveryData,   setDeliveryData]   = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [inventoryValue, setInventoryValue] = useState(null);

  const fetchDashboard = useCallback(async (p) => {
    setLoading(true);
    try {
      const qs = [
        p.start   ? `start=${p.start}`     : '',
        p.end     ? `end=${p.end}`         : '',
        p.groupBy ? `groupBy=${p.groupBy}` : '',
      ].filter(Boolean).join('&');
      const dateQs = [
        p.start ? `start=${p.start}` : '',
        p.end   ? `end=${p.end}`     : '',
      ].filter(Boolean).join('&');

      const [sales, fin, top, deliv, inv, invVal] = await Promise.all([
        api.get(`/analytics/sales${qs ? `?${qs}` : ''}`),
        api.get(`/analytics/financial-kpis${qs ? `?${qs}` : ''}`),
        api.get(`/analytics/top-products${qs ? `?${qs}` : ''}`),
        api.get(`/analytics/delivery${dateQs ? `?${dateQs}` : ''}`),
        api.get('/invoices/summary'),
        api.get('/financial/inventory-value'),
      ]);

      setSalesData(sales);
      setFinKpis(fin);
      setTopProducts(top.byRevenue || []);
      setDeliveryData(deliv);
      setInvoiceSummary(inv);
      setInventoryValue(invVal);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount + refresh every 5 minutes
  useEffect(() => {
    fetchDashboard(period);
    const interval = setInterval(() => fetchDashboard(period), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  function handlePeriod(p) {
    setPeriod(p);
    fetchDashboard(p);
  }

  // Reconcile every money KPI to ONE revenue figure (the Net Revenue card value),
  // so Profit ≤ Revenue and AOV = Revenue ÷ orders. Expenses come from finKpis.
  const netRevenue    = salesData?.totalRevenue ?? 0;
  const orderCount    = salesData?.totalOrders ?? 0;
  const totalExpenses = finKpis.reduce((s, k) => s + (k.expenses || 0), 0);
  const totalProfit   = netRevenue - totalExpenses;
  const profitMargin  = netRevenue > 0 ? ((totalProfit / netRevenue) * 100).toFixed(1) : '0.0';
  const avgOrderValue = orderCount > 0 ? netRevenue / orderCount : 0;

  const deliveryPieData = Object.entries(deliveryData?.statusBreakdown || {})
    .map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  return (
    <DashboardShell title="Dashboard" subtitle={period.label || 'All time'}>
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        <PeriodSelector onChange={handlePeriod} />

        {/* KPI cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px,1fr))', gap:12 }}>
          <KpiCard
            label="Net Revenue"
            value={formatEGP(salesData?.totalRevenue ?? 0)}
            sub={`${formatNumber(salesData?.totalOrders ?? 0)} orders`}
            icon="payments"
            color="var(--color-brand-hover)"
            loading={loading}
          />
          <KpiCard
            label="Net Profit"
            value={formatEGP(totalProfit)}
            sub={totalExpenses > 0 ? `${profitMargin}% margin` : 'No expenses recorded'}
            icon="trending_up"
            color={totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
            loading={loading}
          />
          <KpiCard
            label="Avg Order Value"
            value={formatEGP(avgOrderValue)}
            icon="analytics"
            loading={loading}
          />
          <KpiCard
            label="Outstanding"
            value={formatEGP(invoiceSummary?.total_outstanding ?? 0)}
            sub={invoiceSummary?.total_overdue > 0 ? `${formatEGP(invoiceSummary.total_overdue)} overdue` : 'None overdue'}
            icon="receipt_long"
            color={invoiceSummary?.total_overdue > 0 ? 'var(--color-error)' : undefined}
            loading={loading}
          />
          <KpiCard
            label="Deliveries"
            value={formatNumber(deliveryData?.total ?? 0)}
            sub={`${formatNumber(deliveryData?.delivered ?? 0)} delivered · ${formatNumber(deliveryData?.failed ?? 0)} failed`}
            icon="local_shipping"
            loading={loading}
          />
          <KpiCard
            label="Inventory Value"
            value={formatEGP(inventoryValue?.retail_value ?? 0)}
            sub={`${formatNumber(inventoryValue?.total_units ?? 0)} units`}
            icon="inventory_2"
            loading={loading}
          />
        </div>

        {/* Revenue + Expenses trend */}
        <ChartCard
          title={`Revenue · Expenses · Profit — ${period.label || 'All time'}`}
          loading={loading}
          height={280}
        >
          {finKpis.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={finKpis} margin={{ bottom:28, right:8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis
                  dataKey="period"
                  tick={{ fill:'var(--color-text-muted)', fontSize:10 }}
                  angle={-20} textAnchor="end" height={44}
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={kTick} tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                <Tooltip contentStyle={TT} formatter={(v, n) => [egpFmt(v), n]} />
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                <Bar dataKey="revenue"  name="Revenue"  fill="#6366f1" opacity={0.9} radius={[3,3,0,0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f85149" opacity={0.7} radius={[3,3,0,0]} />
                <Line dataKey="profit" name="Profit" stroke="#3fb950" strokeWidth={2.5} dot={{ r:3, fill:'#3fb950' }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding:'48px 0' }}>
              <span className="material-symbols-outlined">bar_chart</span>
              <p>No financial data for this period</p>
            </div>
          )}
        </ChartCard>

        {/* Row 2 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap:16 }}>

          {/* Top products */}
          <ChartCard title="Top Products by Revenue" loading={loading} height={200}>
            {topProducts.length > 0 ? (
              <div>
                {topProducts.slice(0,6).map((p, i) => (
                  <div key={p.sku || p.name} style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'8px 0',
                    borderBottom: i < Math.min(topProducts.length,6) - 1 ? '1px solid var(--color-border-light)' : 'none',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                      <span style={{
                        fontSize:10, fontFamily:'var(--font-mono)', color:'var(--color-text-dim)',
                        minWidth:20, flexShrink:0,
                      }}>
                        {String(i+1).padStart(2,'0')}
                      </span>
                      <div style={{ minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</p>
                        <p style={{ fontSize:10, color:'var(--color-text-dim)' }}>{p.units} units</p>
                      </div>
                    </div>
                    <span style={{ fontSize:12, fontFamily:'var(--font-mono)', fontWeight:600, flexShrink:0, marginLeft:8 }}>
                      {formatEGP(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding:'32px 0' }}>
                <span className="material-symbols-outlined">inventory_2</span>
                <p>No sales data yet</p>
              </div>
            )}
          </ChartCard>

          {/* Delivery donut */}
          <ChartCard title="Delivery Status Breakdown" loading={loading} height={200}>
            {deliveryPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie
                      data={deliveryPieData}
                      dataKey="value"
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={76}
                      paddingAngle={2}
                    >
                      {deliveryPieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TT} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px', justifyContent:'center' }}>
                  {deliveryPieData.map((d, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:CHART_COLORS[i % CHART_COLORS.length], flexShrink:0 }} />
                      <span style={{ color:'var(--color-text-muted)', textTransform:'capitalize' }}>{d.name}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding:'32px 0' }}>
                <span className="material-symbols-outlined">local_shipping</span>
                <p>No delivery data yet</p>
              </div>
            )}
          </ChartCard>

          {/* Profit margin trend */}
          {finKpis.length > 1 && (
            <ChartCard title="Profit Margin Trend" loading={loading} height={200}>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={finKpis} margin={{ bottom:28, right:8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill:'var(--color-text-muted)', fontSize:9 }}
                    angle={-20} textAnchor="end" height={42}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} unit="%" />
                  <Tooltip contentStyle={TT} formatter={v => [`${v}%`, 'Margin']} />
                  <Line
                    dataKey="profit_margin" name="Margin"
                    stroke="#3fb950" strokeWidth={2.5}
                    dot={{ r:3, fill:'#3fb950' }} type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

        </div>
      </div>
    </DashboardShell>
  );
}
