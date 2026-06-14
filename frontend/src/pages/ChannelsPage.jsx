import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatEGP } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';


const TT = { background:'var(--color-bg-elevated)', border:'1px solid var(--color-border)', color:'var(--color-text)', fontSize:12, borderRadius:6 };

export default function ChannelsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchComparison() {
    setLoading(true);
    try {
      const result = await api.get('/channels/comparison');
      setData(result);
    } catch (err) {
      toast.error(err.message || 'Failed to load channel comparison');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchComparison(); }, []);

  const fulfillmentMixData = useMemo(
    () => (data?.fulfillmentMix || []).filter(d => d.value > 0),
    [data]
  );

  const outcomeData = useMemo(
    () => (data?.deliveryOutcome || []).map(row => ({
      ...row,
      success_rate: row.total > 0 ? Number(((row.delivered / row.total) * 100).toFixed(1)) : 0
    })),
    [data]
  );

  if (loading) {
    return (
      <DashboardShell title="Channel Comparison">
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 140 }} />
          ))}
        </div>
      </DashboardShell>
    );
  }

  const sh = data?.shopify || {};
  const bo = data?.bosta || {};

  return (
    <DashboardShell title="Channel Comparison">
      <div style={{ display: 'grid', gap: 24 }}>

        {/* ── VS Hero ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
          <ChannelCard
            label="Shopify"
            color="#3fb950"
            icon="shopping_bag"
            metrics={[
              ['Total Orders', sh.total_orders ?? 0],
              ['Revenue (paid)', formatEGP(sh.total_revenue ?? 0)],
              ['Avg Order Value', formatEGP(sh.avg_order_value ?? 0)],
              ['Fulfillment Rate', `${sh.fulfillment_rate ?? 0}%`],
              ['Paid Orders', sh.paid_orders ?? 0],
              ['Pending Payment', sh.pending_orders ?? 0],
            ]}
          />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px 8px', color: 'var(--color-text-dim)',
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em'
          }}>
            VS
          </div>

          <ChannelCard
            label="Bosta"
            color="#a371f7"
            icon="deployed_code"
            metrics={[
              ['Total Shipments', bo.total_shipments ?? 0],
              ['COD Collected', formatEGP(bo.cod_collected ?? 0)],
              ['COD Outstanding', formatEGP(bo.cod_outstanding ?? 0)],
              ['Success Rate', `${bo.success_rate ?? 0}%`],
              ['Delivered', bo.delivered ?? 0],
              ['Failed / Returned', (bo.failed ?? 0) + (bo.returned ?? 0)],
            ]}
          />
        </div>

        {/* ── Key Metrics Table ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-light)' }}>
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>Key Metrics Side-by-Side</p>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th style={{ color: '#3fb950' }}>Shopify</th>
                  <th style={{ color: '#a371f7' }}>Bosta</th>
                  <th>Insight</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow
                  label="Volume"
                  left={`${sh.total_orders ?? 0} orders`}
                  right={`${bo.total_shipments ?? 0} shipments`}
                  insight={bo.total_shipments > 0 && sh.total_orders > 0
                    ? `${Math.round((bo.total_shipments / sh.total_orders) * 100)}% of orders routed to Bosta`
                    : 'No shipments yet'}
                />
                <MetricRow
                  label="Revenue vs COD"
                  left={formatEGP(sh.total_revenue ?? 0)}
                  right={formatEGP(bo.cod_collected ?? 0)}
                  insight={sh.total_revenue > 0
                    ? `Bosta collected ${Math.round((bo.cod_collected / sh.total_revenue) * 100)}% of Shopify revenue`
                    : '—'}
                />
                <MetricRow
                  label="Success / Fulfillment Rate"
                  left={`${sh.fulfillment_rate ?? 0}%`}
                  right={`${bo.success_rate ?? 0}%`}
                  insight={sh.fulfillment_rate > bo.success_rate
                    ? `Shopify fulfillment ${(sh.fulfillment_rate - bo.success_rate).toFixed(1)}pp ahead`
                    : bo.success_rate > sh.fulfillment_rate
                    ? `Bosta success ${(bo.success_rate - sh.fulfillment_rate).toFixed(1)}pp ahead`
                    : 'Identical rates'}
                />
                <MetricRow
                  label="Avg Order Value"
                  left={formatEGP(sh.avg_order_value ?? 0)}
                  right="—"
                  insight="Shopify only metric"
                />
                <MetricRow
                  label="COD Outstanding"
                  left="—"
                  right={formatEGP(bo.cod_outstanding ?? 0)}
                  insight={bo.cod_outstanding > 0 ? 'Cash yet to be collected from deliveries' : 'All COD collected'}
                />
                <MetricRow
                  label="Pending"
                  left={`${sh.pending_orders ?? 0} unpaid orders`}
                  right={`${bo.in_transit ?? 0} in transit`}
                  insight="Orders awaiting payment vs shipments en route"
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Daily Volume Timeline ── */}
        <div className="card">
          <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>Daily Volume — Last 30 Days</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
            Shopify orders placed vs Bosta shipments created per day — shows lag between order placement and fulfilment dispatch.
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.dailyComparison || []} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={TT} labelFormatter={l => `Date: ${l}`} />
                <Legend />
                <Bar dataKey="shopify" name="Shopify Orders" fill="#3fb950" radius={[2, 2, 0, 0]} />
                <Bar dataKey="bosta" name="Bosta Shipments" fill="#a371f7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Fulfillment Mix + Outcome ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card">
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>Fulfillment Channel Mix</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
              How Shopify orders are distributed across delivery channels.
            </p>
            {fulfillmentMixData.length === 0 ? (
              <p style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>No delivery data yet.</p>
            ) : (
              <>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fulfillmentMixData}
                        dataKey="value"
                        nameKey="channel"
                        outerRadius={80}
                        label={({ channel, percent }) => `${channel} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {fulfillmentMixData.map((entry) => (
                          <Cell key={entry.channel} fill={entry.color || '#6366f1'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TT} formatter={(v, name) => [`${v} orders`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {fulfillmentMixData.map(d => (
                    <div key={d.channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color || '#6366f1' }} />
                        <span>{d.channel}</span>
                      </div>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {d.value}
                        <span style={{ color: 'var(--color-text-dim)', fontWeight: 400, marginLeft: 4 }}>
                          ({sh.total_orders > 0 ? Math.round((d.value / sh.total_orders) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>Delivery Outcome by Channel</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
              Delivered vs failed for Shopify orders, split by fulfilment method.
            </p>
            {outcomeData.every(d => d.total === 0) ? (
              <p style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>No delivery data yet.</p>
            ) : (
              <>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={outcomeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={TT} />
                      <Legend />
                      <Bar dataKey="delivered" name="Delivered" fill="#3fb950" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="in_transit" name="In Transit" fill="#f0883e" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="failed" name="Failed" fill="#f85149" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  {outcomeData.map(d => (
                    <div key={d.channel} style={{ border: '1px solid var(--color-border-light)', padding: 12, borderRadius: 4 }}>
                      <p className="text-label" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{d.channel} Success Rate</p>
                      <p className="font-mono" style={{
                        fontSize: 22, fontWeight: 800, marginTop: 4,
                        color: d.success_rate >= 80 ? 'var(--color-success)' : d.success_rate >= 60 ? 'var(--color-warning)' : 'var(--color-error)'
                      }}>
                        {d.success_rate}%
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>
                        {d.delivered} / {d.total} delivered
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Financial Bridge ── */}
        <div className="card">
          <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>Financial Bridge</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
            Shopify revenue (paid) vs what was collected and what remains outstanding through Bosta COD.
          </p>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.financialBridge || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={170} />
                <Tooltip contentStyle={TT} formatter={v => [formatEGP(v), "Revenue"]} />
                <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                  {(data?.financialBridge || []).map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
            {(data?.financialBridge || []).map((b) => (
              <div key={b.label} style={{ borderLeft: `3px solid ${b.color}`, paddingLeft: 12 }}>
                <p className="text-label" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{b.label}</p>
                <p className="font-mono" style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{formatEGP(b.value)}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}

function ChannelCard({ label, color, icon, metrics }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color }}>{icon}</span>
        <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{label}</p>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {metrics.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="text-label" style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{label}</span>
            <span className="font-mono" style={{ fontSize: 15, fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, left, right, insight }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, fontSize: 13 }}>{label}</td>
      <td className="font-mono" style={{ color: left === '—' ? 'var(--color-text-dim)' : undefined }}>{left ?? '—'}</td>
      <td className="font-mono" style={{ color: right === '—' ? 'var(--color-text-dim)' : undefined }}>{right ?? '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{insight}</td>
    </tr>
  );
}
