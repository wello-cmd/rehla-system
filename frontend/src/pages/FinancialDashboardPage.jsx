import { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { useAuth } from '../context/AuthContext';

// Set up Axios instance
const api = axios.create({
  baseURL: '/api/finance'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rehla_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const PIE_COLORS = ['#333333', '#555555', '#777777', '#999999', '#bbbbbb', '#dddddd'];

export default function FinancialDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('revenue');
  
  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data states
  const [revenueData, setRevenueData] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [pnlData, setPnlData] = useState(null);
  const [cashflowData, setCashflowData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);

  // Expense form state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState('Operations');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);

  async function fetchAllData() {
    setLoading(true);
    try {
      const queryParams = [];
      if (startDate) queryParams.push(`start=${startDate}`);
      if (endDate) queryParams.push(`end=${endDate}`);
      const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const [rev, exp, pnl, cf, inv] = await Promise.all([
        api.get(`/revenue${qs}`),
        api.get(`/expenses${qs}`),
        api.get(`/pnl${qs}`),
        api.get(`/cashflow${qs}`),
        api.get(`/inventory-value`)
      ]);

      setRevenueData(rev.data);
      setExpenseData(exp.data);
      setPnlData(pnl.data);
      setCashflowData(cf.data);
      setInventoryData(inv.data);
    } catch (err) {
      toast.error('Failed to load financial data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAllData();
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    fetchAllData();
  }

  // --- Expense Handlers ---
  async function handleExpenseSubmit(e) {
    e.preventDefault();
    if (!expTitle.trim() || !expAmount || parseFloat(expAmount) <= 0 || !expDate) {
      toast.error('Please fill all fields with valid data');
      return;
    }

    const payload = {
      description: expTitle.trim(),
      category: expCategory,
      amount: parseFloat(expAmount),
      date: expDate
    };

    try {
      if (editingExpenseId) {
        await api.put(`/expenses/${editingExpenseId}`, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.post(`/expenses`, payload);
        toast.success('Expense logged successfully');
      }
      closeExpenseModal();
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save expense');
    }
  }

  async function handleExpenseDelete(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      fetchAllData();
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  }

  function openEditExpense(exp) {
    setEditingExpenseId(exp.id);
    setExpTitle(exp.description || exp.title || '');
    setExpCategory(exp.category);
    setExpAmount(exp.amount);
    setExpDate(exp.date);
    setShowExpenseModal(true);
  }

  function closeExpenseModal() {
    setShowExpenseModal(false);
    setEditingExpenseId(null);
    setExpTitle('');
    setExpCategory('Operations');
    setExpAmount('');
    setExpDate(new Date().toISOString().split('T')[0]);
  }

  // --- Export PDF ---
  function exportPnlPdf() {
    if (!pnlData) return;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Profit & Loss Summary', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Period: ${startDate || 'All Time'} to ${endDate || 'Current'}`, 20, 30);
    
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    let y = 50;
    doc.setFontSize(14);
    
    doc.text('Gross Revenue:', 20, y);
    doc.text(formatEGP(pnlData.revenue), 190, y, { align: 'right' });
    y += 15;
    
    doc.text('Cost of Goods Sold (COGS):', 20, y);
    doc.text(`- ${formatEGP(pnlData.cogs)}`, 190, y, { align: 'right' });
    y += 15;
    
    doc.setFont(undefined, 'bold');
    doc.text('Gross Profit:', 20, y);
    doc.text(formatEGP(pnlData.grossProfit), 190, y, { align: 'right' });
    doc.setFont(undefined, 'normal');
    y += 15;
    
    doc.text(`Gross Margin: ${pnlData.grossMargin?.toFixed(1)}%`, 20, y);
    y += 25;
    
    doc.text('Total Expenses:', 20, y);
    doc.text(`- ${formatEGP(pnlData.expenses)}`, 190, y, { align: 'right' });
    y += 15;
    
    doc.setFont(undefined, 'bold');
    doc.text('Net Profit:', 20, y);
    doc.text(formatEGP(pnlData.netProfit), 190, y, { align: 'right' });
    doc.setFont(undefined, 'normal');
    y += 15;
    
    doc.text(`Net Margin: ${pnlData.netMargin?.toFixed(1)}%`, 20, y);
    
    doc.save('rehla-pnl-summary.pdf');
    toast.success('P&L PDF exported successfully');
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '300px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="Financial Dashboard">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '4px' }}>
          {['revenue', 'expenses', 'pnl', 'inventory', 'cashflow'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="btn btn-sm"
              style={{
                background: activeTab === tab ? 'var(--color-bg-active)' : 'transparent',
                borderColor: activeTab === tab ? 'var(--color-border)' : 'transparent',
                color: activeTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)',
                textTransform: 'capitalize'
              }}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>

        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '13px' }}
          />
          <span style={{ color: 'var(--color-text-dim)' }}>to</span>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '13px' }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>

      {loading ? renderSkeleton() : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Part 1: Revenue Tracking */}
          {activeTab === 'revenue' && revenueData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Total Revenue</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(revenueData.totalRevenue)}</p>
                </div>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Order Count</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatNumber(revenueData.orderCount)}</p>
                </div>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Avg Order Value</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(revenueData.avgOrderValue)}</p>
                </div>
                <div className="card" style={{ borderLeft: '3px solid var(--color-error)' }}>
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Refunded Orders</p>
                  <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>{formatEGP(revenueData.totalRefunded)}</p>
                </div>
              </div>

              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Revenue Trend</p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="revenue" name="Revenue (EGP)" stroke="#333" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Top 5 Products (Revenue)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={revenueData.topProductsRevenue} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                      <Bar dataKey="revenue" fill="#333" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Top 5 Products (Quantity)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={revenueData.topProductsQty} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                      <Bar dataKey="quantity" fill="#888" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Part 2: Expense Management */}
          {activeTab === 'expenses' && expenseData && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="text-title">Expense Management</h3>
                <button className="btn btn-primary" onClick={() => setShowExpenseModal(true)}>+ Add Expense</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div className="card">
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Expenses by Category</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={expenseData.donutData} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={80} label>
                        {expenseData.donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Month-over-Month Expenses</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span>This Month</span>
                    <span className="font-mono" style={{ fontWeight: 'bold' }}>{formatEGP(expenseData.mom.thisMonth)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span>Last Month</span>
                    <span className="font-mono">{formatEGP(expenseData.mom.lastMonth)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>MoM Growth</span>
                    <span className="font-mono" style={{ color: expenseData.mom.growth > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 'bold' }}>
                      {expenseData.mom.growth > 0 ? '+' : ''}{expenseData.mom.growth.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseData.expenses.map(exp => (
                        <tr key={exp.id}>
                          <td className="font-mono">{exp.date}</td>
                          <td>{exp.title || exp.description}</td>
                          <td><span className="badge badge-neutral">{exp.category}</span></td>
                          <td className="font-mono">{formatEGP(exp.amount)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditExpense(exp)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleExpenseDelete(exp.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {expenseData.expenses.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No expenses found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Part 3: Profit & Loss */}
          {activeTab === 'pnl' && pnlData && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="text-title">Profit & Loss Summary</h3>
                <button className="btn btn-secondary" onClick={exportPnlPdf}>
                  Export PDF Summary
                </button>
              </div>

              <div className="card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px' }}>
                    <span>Revenue</span>
                    <span className="font-mono">{formatEGP(pnlData.revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', color: 'var(--color-text-muted)' }}>
                    <span>Cost of Goods Sold (COGS)</span>
                    <span className="font-mono">−{formatEGP(pnlData.cogs)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', borderTop: '1px solid var(--color-border-light)', paddingTop: '16px' }}>
                    <span>Gross Profit</span>
                    <span className="font-mono">{formatEGP(pnlData.grossProfit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', color: 'var(--color-text-muted)' }}>
                    <span>Expenses</span>
                    <span className="font-mono">−{formatEGP(pnlData.expenses)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 'bold', borderTop: '1px solid var(--color-border-light)', paddingTop: '16px', color: pnlData.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    <span>Net Profit</span>
                    <span className="font-mono">{formatEGP(pnlData.netProfit)}</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Monthly P&L Trend</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pnlData.trendChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#333" />
                    <Bar dataKey="expenses" name="Expenses" fill="#888" />
                    <Bar dataKey="netProfit" name="Net Profit" fill="#4caf50" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Part 4: Inventory Value */}
          {activeTab === 'inventory' && inventoryData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Total Cost Value (COGS)</p>
                <p style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(inventoryData.costValue)}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '8px' }}>Amount tied up in current stock</p>
              </div>
              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Potential Revenue</p>
                <p style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(inventoryData.retailValue)}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '8px' }}>Total retail value of current stock</p>
              </div>
              <div className="card" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-success)' }}>
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Potential Profit</p>
                <p style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{formatEGP(inventoryData.potentialProfit)}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '8px' }}>If all stock is sold at retail price</p>
              </div>
            </div>
          )}

          {/* Part 5: Cash Flow */}
          {activeTab === 'cashflow' && cashflowData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Monthly Cash Flow (In vs Out)</p>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={cashflowData.cashflow}>
                    <defs>
                      <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4caf50" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#4caf50" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef5350" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef5350" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="moneyIn" name="Money In (Revenue)" stroke="#4caf50" fillOpacity={1} fill="url(#colorIn)" />
                    <Area type="monotone" dataKey="moneyOut" name="Money Out (Expenses)" stroke="#ef5350" fillOpacity={1} fill="url(#colorOut)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Running Balance</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={cashflowData.cashflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }} />
                    <Bar dataKey="runningBalance" name="Running Balance">
                      {cashflowData.cashflow.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.runningBalance >= 0 ? '#4caf50' : '#ef5350'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Expense Form Modal */}
      {showExpenseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 className="text-title" style={{ marginBottom: '16px' }}>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h3>
            <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label">Date</label>
                <input type="date" className="input" required value={expDate} onChange={e => setExpDate(e.target.value)} />
              </div>
              <div>
                <label className="text-label">Description</label>
                <input className="input" required placeholder="e.g. Office rent" value={expTitle} onChange={e => setExpTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-label">Category</label>
                <select className="input select" required value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                  <option value="Inventory">Inventory</option>
                  <option value="Shipping">Shipping</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Platform">Platform</option>
                  <option value="Operations">Operations</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-label">Amount (EGP)</label>
                <input type="number" step="0.01" className="input" required value={expAmount} onChange={e => setExpAmount(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={closeExpenseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
