import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import PeriodSelector from '../components/PeriodSelector';
import { loadDashboardPanels } from '../lib/dashboardPanels';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const money = value => `EGP ${Number(value || 0).toLocaleString('en-EG', { maximumFractionDigits:0 })}`;
const TT = { background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text)', fontSize:12, borderRadius:5 };
const statusColor = name => /fail|cancel|return/i.test(name) ? 'var(--color-error)' : /delivered/i.test(name) ? 'var(--color-success)' : /transit|out_for|assigned/i.test(name) ? 'var(--color-info)' : 'var(--color-warning)';
function defaultPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return { start:`${year}-${month}-01`, end:`${year}-${month}-${String(new Date(year,now.getMonth()+1,0).getDate()).padStart(2,'0')}`, groupBy:'day', label:now.toLocaleDateString('en',{month:'short',year:'numeric'}) };
}
function Metric({ label, value, note, icon, loading, error }) {
  return <div className="summary-metric"><p className="metric-label"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{label}</p>{loading ? <div className="skeleton" style={{height:30,width:'85%'}} /> : <p className="metric-value">{error ? 'Unavailable' : value}</p>}{!loading && !error && note && <p className="metric-note">{note}</p>}</div>;
}
function Panel({ title, extra, loading, error, children, className = '' }) {
  return <section className={`card ${className}`} aria-label={title}><div className="panel-heading"><h2>{title}</h2>{extra}</div>{loading ? <div className="skeleton" style={{height:180}} /> : error ? <p className="panel-error" role="status">This section is unavailable. Use Refresh to try again.</p> : children}</section>;
}
function Empty({ children }) { return <div className="empty-state" style={{padding:'40px 12px'}}><p>{children}</p></div>; }

export default function DashboardPage() {
  const [loading,        setLoading]        = useState(true);
  const [period,         setPeriod]         = useState(defaultPeriod());
  const [salesData,      setSalesData]      = useState(null);
  const [finKpis,        setFinKpis]        = useState([]);
  const [topProducts,    setTopProducts]    = useState([]);
  const [deliveryData,   setDeliveryData]   = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [inventoryValue, setInventoryValue] = useState(null);

  const [panelErrors, setPanelErrors] = useState({});
  const requestRef = useRef(0);
  const fetchDashboard = useCallback(async (p) => {
    const request = ++requestRef.current;
    setLoading(true);
    const result = await loadDashboardPanels(endpoint => api.get(endpoint), p);
    if (request !== requestRef.current) return;
    const {data, errors} = result;
    setSalesData(data.sales || null);
    setFinKpis(data.finance || []);
    setTopProducts(data.products?.byRevenue || []);
    setDeliveryData(data.delivery || null);
    setInvoiceSummary(data.invoices || null);
    setInventoryValue(data.inventory || null);
    setPanelErrors(errors);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard(period);
    const interval = setInterval(() => fetchDashboard(period), 5 * 60 * 1000);
    return () => { clearInterval(interval); requestRef.current++; };
  }, [period, fetchDashboard]);

  function handlePeriod(p) { setPeriod(p); }

  // Reconcile every money KPI to ONE revenue figure (the Net Revenue card value),
  // so Profit ≤ Revenue and AOV = Revenue ÷ orders. Expenses come from finKpis.
  const netRevenue    = salesData?.totalRevenue ?? 0;
  const orderCount    = salesData?.totalOrders ?? 0;
  const totalExpenses = finKpis.reduce((s, k) => s + (k.expenses || 0), 0);
  const totalProfit   = netRevenue - totalExpenses;
  const profitMargin  = netRevenue > 0 ? ((totalProfit / netRevenue) * 100).toFixed(1) : '0.0';
  const avgOrderValue = orderCount > 0 ? netRevenue / orderCount : 0;


  const statuses = Object.entries(deliveryData?.statusBreakdown || {}).filter(([,value]) => value > 0);
  const statusTotal = statuses.reduce((total,[,value]) => total + value, 0);
  const actions = <>
    <details className="period-control" onKeyDown={event => { if(event.key === 'Escape') event.currentTarget.open = false; }}>
      <summary className="btn btn-secondary"><span className="material-symbols-outlined" aria-hidden="true" style={{fontSize:17}}>calendar_month</span>{period.label || 'Select period'}<span className="material-symbols-outlined" aria-hidden="true" style={{fontSize:16}}>expand_more</span></summary>
      <div className="period-popover"><PeriodSelector onChange={handlePeriod} /><button className="btn btn-ghost btn-sm" onClick={event => { event.currentTarget.closest('details').open = false; }}>Done</button></div>
    </details>
    <button className="btn btn-secondary" disabled={loading} onClick={() => fetchDashboard(period)}><span className={`material-symbols-outlined ${loading ? 'spinner' : ''}`} aria-hidden="true" style={{fontSize:18}}>refresh</span>{loading ? 'Refreshing…' : 'Refresh'}</button>
  </>;
  return <DashboardShell title="Business overview" subtitle="Sales, stock and delivery at a glance." actions={actions}>
    <div className="dashboard-stack" aria-busy={loading}>
      {Object.keys(panelErrors).length > 0 && <div className="dashboard-notice" role="status"><p>Could not load: {Object.keys(panelErrors).join(', ')}. Available sections remain visible.</p><button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => fetchDashboard(period)}>Retry</button></div>}
      <section className="dashboard-summary" aria-label="Business summary">
        <Metric label="Net revenue" value={money(netRevenue)} note={`${formatNumber(orderCount)} orders`} icon="bar_chart" loading={loading} error={panelErrors.sales} />
        <Metric label="Net profit" value={money(totalProfit)} note={`${profitMargin}% margin`} icon="database" loading={loading} error={panelErrors.sales || panelErrors.finance} />
        <Metric label="Avg order value" value={money(avgOrderValue)} note="Net revenue per order" icon="shopping_cart" loading={loading} error={panelErrors.sales} />
        <Metric label="Outstanding" value={money(invoiceSummary?.total_outstanding)} note={invoiceSummary?.total_overdue > 0 ? `${money(invoiceSummary.total_overdue)} overdue` : 'None overdue · All dates'} icon="receipt_long" loading={loading} error={panelErrors.invoices} />
        <Metric label="Deliveries" value={formatNumber(deliveryData?.total || 0)} note={`${formatNumber(deliveryData?.delivered || 0)} delivered`} icon="local_shipping" loading={loading} error={panelErrors.delivery} />
        <Metric label="Inventory value" value={money(inventoryValue?.retail_value)} note={`${formatNumber(inventoryValue?.total_units || 0)} units · Current stock`} icon="inventory_2" loading={loading} error={panelErrors.inventory} />
      </section>
      <div className="dashboard-main-grid">
        <Panel title="Revenue, expenses & profit" extra={<span>{period.label}</span>} loading={loading} error={panelErrors.finance}>
          {finKpis.length ? <><ResponsiveContainer width="100%" height={330}><ComposedChart data={finKpis} margin={{top:8,right:12,left:0,bottom:12}} accessibilityLayer><CartesianGrid stroke="var(--color-border-light)" vertical={false} /><XAxis dataKey="period" tick={{fill:'var(--color-text-muted)',fontSize:10}} tickLine={false} axisLine={false} minTickGap={24} /><YAxis tickFormatter={value => Number(value) >= 1000 ? `${(value/1000).toFixed(0)}k` : value} tick={{fill:'var(--color-text-muted)',fontSize:10}} axisLine={false} tickLine={false} width={46} /><Tooltip contentStyle={TT} formatter={(value,name) => [money(value),name]} /><Legend formatter={value => <span style={{color:'var(--color-text)'}}>{value}</span>} verticalAlign="top" align="left" iconType="circle" iconSize={7} wrapperStyle={{fontSize:11,paddingBottom:28}} /><Bar dataKey="revenue" name="Revenue" fill="var(--color-chart-revenue)" radius={[2,2,0,0]} isAnimationActive={false} /><Bar dataKey="expenses" name="Expenses" fill="var(--color-chart-expenses)" radius={[2,2,0,0]} isAnimationActive={false} /><Line dataKey="profit" name="Profit" stroke="var(--color-chart-profit)" strokeWidth={2.5} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer><p className="metric-note">Paid-order revenue and approved expenses for the selected period.</p></> : <Empty>No financial data for this period.</Empty>}
        </Panel>
        <div className="dashboard-side">
          <Panel title="Quick actions">
            {[['/warehouse/exit','deployed_code','Warehouse exit','Record items leaving the warehouse'],['/invoices/new','description','Create invoice','Generate a customer invoice'],['/delivery?delivery_type=own_driver','local_shipping','In-house deliveries','Manage Rehla drivers and deliveries']].map(([path,icon,title,note]) => <Link key={path} to={path} className="quick-action"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><div><strong>{title}</strong><p>{note}</p></div><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link>)}
          </Panel>
          <Panel title="Delivery status" extra={!loading && !panelErrors.delivery ? <span>{formatNumber(deliveryData?.total || 0)} total</span> : null} loading={loading} error={panelErrors.delivery}>
            {statuses.length ? <div className="delivery-distribution">{statuses.map(([name,value]) => <div key={name} className="distribution-row" style={{'--status-color':statusColor(name)}}><span><i aria-hidden="true" />{name.replaceAll('_',' ')}</span><div className="distribution-track" aria-hidden="true"><span style={{width:`${value/statusTotal*100}%`}} /></div><span className="distribution-percent">{Math.round(value/statusTotal*100)}%</span><span>{formatNumber(value)}</span></div>)}</div> : <Empty>No deliveries for this period.</Empty>}
          </Panel>
        </div>
      </div>
      <div className="dashboard-bottom-grid">
        <Panel title="Top products" extra={<Link to="/analytics">View analytics →</Link>} loading={loading} error={panelErrors.products}>
          {topProducts.length ? <div className="table-container"><table className="data-table"><thead><tr><th scope="col">Product</th><th scope="col" style={{textAlign:'right'}}>Units</th><th scope="col" style={{textAlign:'right'}}>Revenue (EGP)</th></tr></thead><tbody>{topProducts.slice(0,5).map((product,index) => <tr key={product.sku || `${product.name}-${index}`}><td style={{whiteSpace:'normal',minWidth:170}}>{product.name}</td><td style={{textAlign:'right'}}>{formatNumber(product.units)}</td><td style={{textAlign:'right',fontWeight:600}}>{Number(product.revenue || 0).toLocaleString('en-EG',{maximumFractionDigits:0})}</td></tr>)}</tbody></table></div> : <Empty>No product sales for this period.</Empty>}
        </Panel>
        <Panel title="Delivery services">
          <div className="delivery-service"><span className="material-symbols-outlined" aria-hidden="true">shopping_bag</span><div><strong>Shopify orders → Bosta</strong><p>Shopify orders are handed to Bosta for delivery.</p><Link className="btn btn-ghost btn-sm" to="/bosta" style={{paddingLeft:0}}>View Bosta deliveries<span className="material-symbols-outlined" aria-hidden="true" style={{fontSize:16}}>arrow_forward</span></Link></div></div>
          <div className="delivery-service"><span className="material-symbols-outlined" aria-hidden="true">local_shipping</span><div><strong>Rehla in-house delivery</strong><p>Managed separately. Not linked to Shopify yet.</p><Link className="btn btn-ghost btn-sm" to="/delivery?delivery_type=own_driver" style={{paddingLeft:0}}>View in-house deliveries<span className="material-symbols-outlined" aria-hidden="true" style={{fontSize:16}}>arrow_forward</span></Link></div></div>
        </Panel>
      </div>
      <p className="dashboard-footnote">{period.label} · Outstanding invoices cover all dates. Inventory reflects current stock.</p>
    </div>
  </DashboardShell>;
}
