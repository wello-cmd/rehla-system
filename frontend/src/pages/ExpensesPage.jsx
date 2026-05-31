import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatEGP, formatDate } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Operations');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  async function fetchExpenses() {
    try {
      const data = await api.get('/expenses');
      setExpenses(data);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchExpenses();
  }, []);

  const filteredExpenses = expenses.filter(exp => {
    const matchesCategory = categoryFilter ? exp.category === categoryFilter : true;
    const matchesStatus = statusFilter ? exp.status === statusFilter : true;
    return matchesCategory && matchesStatus;
  });

  const totals = expenses.reduce((acc, exp) => {
    const amt = Number(exp.amount) || 0;
    if (exp.status === 'approved') {
      acc.approved += amt;
    } else if (exp.status === 'pending') {
      acc.pending += amt;
    }
    return acc;
  }, { approved: 0, pending: 0 });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !amount || parseFloat(amount) <= 0 || !date) {
      toast.error('Please enter a valid title, amount, and date');
      return;
    }

    try {
      await api.post('/expenses', {
        title: title.trim(),
        description: description.trim(),
        category,
        amount: parseFloat(amount),
        date
      });
      toast.success(
        ['admin', 'ceo'].includes(user.role)
          ? 'Expense logged and approved'
          : 'Expense submitted for approval'
      );
      setShowModal(false);
      // Reset form
      setTitle('');
      setDescription('');
      setCategory('Operations');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      fetchExpenses();
    } catch (err) {
      toast.error(err.message || 'Failed to submit expense');
    }
  }

  async function handleApprove(id, approve) {
    try {
      await api.put(`/expenses/${id}/approve`, { approve });
      toast.success(approve ? 'Expense approved' : 'Expense rejected');
      fetchExpenses();
    } catch (err) {
      toast.error('Approval action failed');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this expense log?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      fetchExpenses();
    } catch (err) {
      toast.error('Delete failed');
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );

  const canApprove = ['ceo', 'admin'].includes(user?.role);

  return (
    <DashboardShell title="Expense Management">
      {loading ? renderSkeleton() : (
        <>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Approved Expenses</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {formatEGP(totals.approved)}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Pending Approval</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}>
                {formatEGP(totals.pending)}
              </p>
            </div>
          </div>

          {/* Filters and Action row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <select
                className="input select"
                style={{ width: '160px' }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                <option value="Inventory">Inventory</option>
                <option value="Shipping">Shipping</option>
                <option value="Marketing">Marketing</option>
                <option value="Platform">Platform</option>
                <option value="Operations">Operations</option>
                <option value="Other">Other</option>
              </select>
              <select
                className="input select"
                style={{ width: '160px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + Log Expense
            </button>
          </div>

          {/* Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title / Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Logged Status</th>
                    <th>Approved By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id}>
                      <td className="font-mono">{formatDate(exp.date)}</td>
                      <td>
                        <p style={{ fontWeight: 600 }}>{exp.title}</p>
                        {exp.description && <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{exp.description}</p>}
                      </td>
                      <td>
                        <span className="badge badge-neutral">{exp.category}</span>
                      </td>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{formatEGP(exp.amount)}</td>
                      <td>
                        <span className={`badge badge-${
                          exp.status === 'approved' ? 'success' : exp.status === 'rejected' ? 'error' : 'warning'
                        }`}>
                          {exp.status}
                        </span>
                      </td>
                      <td>{exp.approved_by || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {exp.status === 'pending' && canApprove && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleApprove(exp.id, true)}
                                style={{ background: 'var(--color-success)', border: 'none', color: 'white' }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleApprove(exp.id, false)}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canApprove && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDelete(exp.id)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                        No expenses found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Log Expense Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <p className="text-title" style={{ marginBottom: '24px' }}>Log New Expense</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Expense Title</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Office Stationery"
                  required
                />
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Category</label>
                <select
                  className="input select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  <option value="Inventory">Inventory</option>
                  <option value="Shipping">Shipping</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Platform">Platform</option>
                  <option value="Operations">Operations</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Amount (EGP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1500"
                    required
                  />
                </div>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Expense Date</label>
                  <input
                    type="date"
                    className="input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Additional Notes (Optional)</label>
                <textarea
                  className="input"
                  style={{ height: '70px', resize: 'none' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Bought pens, notebooks, and folders"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
