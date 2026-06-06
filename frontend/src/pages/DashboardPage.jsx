import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import PeriodSelector from '../components/PeriodSelector';
import toast from 'react-hot-toast';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#4caf50','#ef5350','#e5e2e1','#988e90','#6b6365'];
const TT = { background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text)', fontSize:'12px' };
const kTick = v => `${(v/1000).toFixed(0)}k`;
const egp   = v => `EGP ${Number(v).toLocaleString('en-EG', { minimumFractionDigits:0, maximumFractionDigits:0 })}`;

function KpiCard({ label, value, sub, color, loading }) {
  return (
    <div className="card">
      <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:8 }}>{label}</p>
      {loading
        ? <div className="skeleton" style={{ height:40, width:'70%' }} />
        : <p style={{ fontSize:30, fontWeight:800, letterSpacing:'-0.03em', fontFamily:'var(--font-mono)', color: color || 'inherit', lineHeight:1.1 }}>{value}</p>
      }
      {!loading && sub && <p style={{ fontSize:12, color:'var(--color-text-muted)', marginTop:4 }}>{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [loading,        setLoading]        = useState(false);
  const [period,         setPeriod]         = useState({});
  const [salesData,      setSalesData]      = useState(null);
  const [finKpis,        setFinKpis]        = useState([]);
  const [topProducts,    setTopProducts]    = useState([]);
  const [deliveryData,   setDeliveryData]   = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [inventoryValue, setInventoryValue] = useState(null);

  const fetchDashboard = useCallback(async (p) => {
    setLoading(true);
    try {
      const parts = [
        p.start   ? `start=${p.start}`     : '',
        p.end     ? `end=${p.end}`         : '',
        p.groupBy ? `groupBy=${p.groupBy}` : '',
      ].filter(Boolean);
      const qs  = parts.length ? `?${parts.join('&')}` : '';
      const dqs = [p.start ? `start=${p.start}` : '', p.end ? `end=${p.end}` : ''].filter(Boolean);
      const delQ = dqs.length ? `?${dqs.join('&')}` : '';

      const [sales, fin, top, deliv, inv, invVal] = await Promise.all([
        api.get(`/analytics/sales${qs}`),
        api.get(`/analytics/financial-kpis${qs}`),
        api.get(`/analytics/top-products${qs}`),
        api.get(`/analytics/delivery${delQ}`),
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

  function handlePeriod(p) {
    setPeriod(p);
    fetchDashboard(p);
  }

  // Derived totals
  const totalRevenue  = finKpis.reduce((s,k) => s + (k.revenue  || 0), 0);
  const totalExpenses = finKpis.reduce((s,k) => s + (k.expenses || 0), 0);
  const totalProfit   = totalRevenue - totalExpenses;
  const profitMargin  = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Delivery status data for pie
  const deliveryPieData = Object.entries(deliveryData?.statusBreakdown || {})
    .map(([name, value]) => ({ name: name.replace(/_/g,' '), value }));

  return (
    <DashboardShell title="Dashboard">
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Period selector */}
        <PeriodSelector onChange={handlePeriod} />

        {/* ── KPI CARDS ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:14 }}>
          <KpiCard
            label="Revenue"
            value={formatEGP(salesData?.totalRevenue ?? 0)}
            sub={`${formatNumber(salesData?.totalOrders ?? 0)} orders · ${period.label || ''}`}
            loading={loading}
          />
          <KpiCard
            label="Net Profit"
            value={formatEGP(totalProfit)}
            sub={`${profitMargin}% margin`}
            color={totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
            loading={loading}
          />
          <KpiCard
            label="Avg Order Value"
            value={formatEGP(salesData?.avgOrderValue ?? 0)}
            loading={loading}
          />
          <KpiCard
            label="Outstanding Invoices"
            value={formatEGP(invoiceSummary?.total_outstanding ?? 0)}
            sub={invoiceSummary?.total_overdue > 0 ? `${formatEGP(invoiceSummary.total_overdue)} overdue` : 'None overdue'}
            color={invoiceSummary?.total_overdue > 0 ? 'var(--color-error)' : undefined}
            loading={loading}
          />
          <KpiCard
            label="Deliveries"
            value={formatNumber(deliveryData?.total ?? 0)}
            sub={`${formatNumber(deliveryData?.delivered ?? 0)} delivered · ${formatNumber(deliveryData?.failed ?? 0)} failed`}
            loading={loading}
          />
          <KpiCard
            label="Inventory Value"
            value={formatEGP(inventoryValue?.retail_value ?? 0)}
            sub={`${formatNumber(inventoryValue?.total_units ?? 0)} units`}
            loading={loading}
          />
        </div>

        {/* ── CHARTS ROW 1 ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px,1fr))', gap:16 }}>

          {/* Revenue + Expenses + Profit trend */}
          <div className="card" style={{ gridColumn: finKpis.length > 0 ? 'span 2' : undefined }}>
            <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>
              Revenue · Expenses · Profit — {period.label || 'All time'}
            </p>
            {loading
              ? <div className="skeleton" style={{ height:260 }} />
              : finKpis.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
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
                <p style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-dim)' }}>
                  Select a period to load data
                </p>
              )
            }
          </div>
        </div>

        {/* ── CHARTS ROW 2 ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px,1fr))', gap:16 }}>

          {/* Top products */}
          <div className="card">
            <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Top Products by Revenue</p>
            {loading
              ? <div className="skeleton" style={{ height:220 }} />
              : topProducts.length > 0 ? (
                topProducts.map((p, i) => (
                  <div key={p.sku || p.name} style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'9px 0',
                    borderBottom: i < topProducts.length - 1 ? '1px solid var(--color-border-light)' : 'none'
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span className="font-mono" style={{ fontSize:10, color:'var(--color-text-dim)', minWidth:18 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p style={{ fontSize:13, fontWeight:500 }}>{p.name}</p>
                        <p style={{ fontSize:10, color:'var(--color-text-dim)' }}>{p.units} units sold</p>
                      </div>
                    </div>
                    <span className="font-mono" style={{ fontSize:13, fontWeight:600 }}>{formatEGP(p.revenue)}</span>
                  </div>
                ))
              ) : (
                <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No sales data</p>
              )
            }
          </div>

          {/* Delivery status donut */}
          <div className="card">
            <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Delivery Status</p>
            {loading
              ? <div className="skeleton" style={{ height:220 }} />
              : deliveryPieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={deliveryPieData} dataKey="value" cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {deliveryPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 16px', justifyContent:'center', marginTop:8 }}>
                    {deliveryPieData.map((d, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background: COLORS[i % COLORS.length] }} />
                        <span style={{ color:'var(--color-text-muted)', textTransform:'capitalize' }}>{d.name}</span>
                        <span className="font-mono" style={{ fontWeight:600 }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ textAlign:'center', padding:'40px 0', color:'var(--color-text-dim)' }}>No delivery data</p>
              )
            }
          </div>

          {/* Margin trend */}
          {finKpis.length > 1 && (
            <div className="card">
              <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom:14 }}>Profit Margin Trend</p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={finKpis} margin={{ bottom:24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                  <XAxis dataKey="period" tick={{ fill:'var(--color-text-muted)', fontSize:9 }} angle={-20} textAnchor="end" height={40} interval="preserveStartEnd" />
                  <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} unit="%" />
                  <Tooltip contentStyle={TT} formatter={v => [`${v}%`, 'Margin']} />
                  <Line dataKey="profit_margin" name="Margin" stroke="#4caf50" strokeWidth={2} dot={{ r:2 }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </DashboardShell>
  );
}
