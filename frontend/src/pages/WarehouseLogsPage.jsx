import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function WarehouseLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  async function fetchLogs() {
    try {
      const data = await api.get('/inventory/logs');
      setLogs(data);
    } catch (err) {
      toast.error('Failed to load warehouse audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        log.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.handler_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = typeFilter ? log.event_type === typeFilter : true;
      return matchesSearch && matchesType;
    });
  }, [logs, searchTerm, typeFilter]);

  // Helper for formatting event badges
  function getEventBadgeClass(type) {
    switch (type) {
      case 'restock':
      case 'return':
        return 'badge-success';
      case 'warehouse_exit':
      case 'sold':
        return 'badge-error';
      case 'adjustment':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  }

  function getEventLabel(type) {
    switch (type) {
      case 'warehouse_exit': return 'Exit Scan';
      case 'sold': return 'POS Sale';
      case 'restock': return 'Restock';
      case 'adjustment': return 'Adjustment';
      case 'return': return 'Return';
      default: return type;
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '250px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="Warehouse Audit Logs">
      {loading ? renderSkeleton() : (
        <>
          {/* Filters Row */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ maxWidth: '280px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SKU, product, handler..."
              />
              <select
                className="input select"
                style={{ maxWidth: '180px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Event Types</option>
                <option value="warehouse_exit">Warehouse Exits</option>
                <option value="sold">POS Sales</option>
                <option value="restock">Restocks</option>
                <option value="adjustment">Adjustments</option>
                <option value="return">Returns</option>
              </select>
            </div>
            <button className="btn btn-secondary" onClick={fetchLogs}>
              ⟲ Refresh Logs
            </button>
          </div>

          {/* Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>SKU</th>
                    <th>Product Details</th>
                    <th>Event</th>
                    <th style={{ textAlign: 'right' }}>Qty Change</th>
                    <th style={{ textAlign: 'right' }}>Stock History</th>
                    <th>Operator</th>
                    <th>Audit Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      <td className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="font-mono" style={{ fontWeight: 600, fontSize: '12px' }}>{log.sku}</td>
                      <td>
                        <span style={{ fontWeight: 500, fontSize: '13px' }}>
                          {log.products?.name || 'Deleted Product'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getEventBadgeClass(log.event_type)}`}>
                          {getEventLabel(log.event_type)}
                        </span>
                      </td>
                      <td className="font-mono" style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: log.quantity_changed > 0 ? 'var(--color-success)' : 'var(--color-error)'
                      }}>
                        {log.quantity_changed > 0 ? `+${log.quantity_changed}` : log.quantity_changed}
                      </td>
                      <td className="font-mono text-label" style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                        {formatNumber(log.previous_quantity)} ➜ {formatNumber(log.new_quantity)}
                      </td>
                      <td style={{ fontSize: '13px' }}>{log.handler_name || 'System Auto'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--color-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.notes}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                        No warehouse logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
