import { translate } from '../i18n/index.js';
import { useState, useEffect } from 'react';
import LoadNotice from '../components/ui/LoadNotice';
import { useAuth } from '../context/AuthContext';
import { canCreateInvoice } from '../lib/roles';
import { api } from '../lib/api';
import { formatEGP, formatNumber, formatDate, getStatusColor } from '../lib/formatters';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function InvoicesPage() {
  const {user} = useAuth();
  const [readError, setReadError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [show3PLModal, setShow3PLModal] = useState(false);
  const [monthStart, setMonthStart] = useState('');
  const [monthEnd, setMonthEnd] = useState('');
  const navigate = useNavigate();

  async function fetchInvoices() {
    setReadError(null);
    setLoading(true);
    try {
      const [invData, summaryData] = await Promise.all([
        api.get('/invoices'),
        api.get('/invoices/summary')
      ]);
      setHasLoaded(true);
      setInvoices(invData);
      setSummary(summaryData);
    } catch (err) {
      setReadError(err.message || 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Filter/search logic
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clients?.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? inv.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  // Record Payment
  async function handleRecordPayment(e) {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error(translate("Please enter a valid amount"));
      return;
    }

    try {
      await api.post(`/invoices/${selectedInvoice.id}/payments`, {
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod
      });
      toast.success(translate("Payment recorded successfully"));
      setShowPaymentModal(false);
      setPaymentAmount('');
      // Reload details and list
      const details = await api.get(`/invoices/${selectedInvoice.id}`);
      setSelectedInvoice(details);
      fetchInvoices();
    } catch (err) {
      toast.error(translate(err.message || 'Failed to record payment'));
    }
  }

  // Trigger Overdue Checker manually
  async function handleFlagOverdue() {
    const loadingToast = toast.loading(translate('Checking overdue status...'));
    try {
      const res = await api.post('/invoices/flag-overdue');
      toast.success(`Check complete. ${res.flagged} invoices flagged as Overdue.`, { id: loadingToast });
      fetchInvoices();
    } catch (err) {
      toast.error(translate(err.message || 'Failed to update overdue status'), { id: loadingToast });
    }
  }

  // Generate 3PL Invoices
  async function handleGenerate3PL(e) {
    e.preventDefault();
    if (!monthStart || !monthEnd) {
      toast.error(translate("Please select start and end dates"));
      return;
    }
    const loadingToast = toast.loading(translate('Generating 3PL invoices...'));
    try {
      const res = await api.post('/finance/generate-3pl', { month_start: monthStart, month_end: monthEnd });
      toast.success(`Success! Created ${res.invoices_created} invoices.`, { id: loadingToast });
      setShow3PLModal(false);
      fetchInvoices();
    } catch (err) {
      toast.error(translate(err.message || 'Failed to generate 3PL invoices'), { id: loadingToast });
    }
  }

  // Download Invoice PDF
  async function handleDownloadPDF(invoiceId, invoiceNumber) {
    try {
      await api.downloadBlob(`/invoices/${invoiceId}/pdf`, `${invoiceNumber}.pdf`);
      toast.success(translate("Invoice PDF downloaded"));
    } catch (err) {
      toast.error(translate("Failed to download invoice PDF"));
    }
  }

  // View Invoice Detail Modal
  async function handleViewInvoice(invoice) {
    try {
      const details = await api.get(`/invoices/${invoice.id}`);
      setSelectedInvoice(details);
    } catch (err) {
      toast.error(translate("Failed to load invoice details"));
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );

  return (
    <DashboardShell title={translate("Invoice Management")}>
      <LoadNotice error={readError} loading={loading} onRetry={fetchInvoices} stale={hasLoaded} />
      {loading ? renderSkeleton() : readError && !hasLoaded ? null : (
        <>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Total Invoiced")}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(summary?.total_invoiced)}</p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Collected / Paid")}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
                {formatEGP(summary?.total_paid)}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Outstanding")}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}>
                {formatEGP(summary?.total_outstanding)}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Overdue Invoices")}</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>
                {formatEGP(summary?.total_overdue)}
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px' }}>
              <input
                className="input"
                style={{ maxWidth: '280px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={translate("Search invoices")}
                placeholder={translate("Search invoice number, client...")}
              />
              <select
                className="input select"
                style={{ maxWidth: '160px' }}
                aria-label={translate("Filter invoices by status")}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{translate("All Statuses")}</option>
                <option value="Draft">{translate("Draft")}</option>
                <option value="Sent">{translate("Sent")}</option>
                <option value="Paid">{translate("Paid")}</option>
                <option value="Overdue">{translate("Overdue")}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShow3PLModal(true)}> {translate("Generate 3PL Bills")} </button>
              <button className="btn btn-secondary" onClick={handleFlagOverdue}> {translate("Check Overdue")} </button>
              {canCreateInvoice(user?.role) && <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}> {translate("New Invoice")} </button>}
            </div>
          </div>

          {/* Invoices Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table t-invoices">
                <thead>
                  <tr>
                    <th>{translate("Invoice Number")}</th>
                    <th>{translate("B2B Client / Customer")}</th>
                    <th>{translate("Issue Date")}</th>
                    <th>{translate("Due Date")}</th>
                    <th>{translate("Total")}</th>
                    <th>{translate("Status")}</th>
                    <th style={{ textAlign: "end" }}>{translate("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>
                        {inv.invoice_number}
                      </td>
                      <td>
                        {inv.clients ? (
                          <div>
                            <p style={{ fontWeight: 500 }}>{inv.clients.company_name}</p>
                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{translate("Attn:")} {inv.customer_name}</p>
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontWeight: 500 }}>{inv.customer_name}</p>
                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{inv.customer_email || translate("No email")}</p>
                          </div>
                        )}
                      </td>
                      <td className="font-mono">{formatDate(inv.issue_date)}</td>
                      <td className="font-mono">{formatDate(inv.due_date)}</td>
                      <td className="font-mono">{formatEGP(inv.total)}</td>
                      <td>
                        <span className={`badge badge-${getStatusColor(inv.status)}`}>
                          {translate(inv.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: "end" }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleViewInvoice(inv)}
                          > {translate("View")} </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDownloadPDF(inv.id, inv.invoice_number)}
                            title={translate("Download PDF")}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}> {translate("No invoices found.")} </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px' }}>
              <div>
                <p style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{selectedInvoice.invoice_number}</p>
                <span className={`badge badge-${getStatusColor(selectedInvoice.status)}`} style={{ marginTop: '4px' }}>
                  {translate(selectedInvoice.status)}
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedInvoice(null)}> {translate("Close")} </button>
            </div>

            {/* Client / Customer info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              <div>
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '4px' }}>{translate("Billed To")}</p>
                <p style={{ fontWeight: 600 }}>{selectedInvoice.customer_name}</p>
                {selectedInvoice.clients?.company_name && <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{selectedInvoice.clients.company_name}</p>}
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{selectedInvoice.customer_email}</p>
              </div>
              <div>
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '4px' }}>{translate("Invoice Dates")}</p>
                <p style={{ fontSize: '13px' }}><strong>{translate("Issued:")}</strong> {formatDate(selectedInvoice.issue_date)}</p>
                <p style={{ fontSize: '13px' }}><strong>{translate("Due:")}</strong> {formatDate(selectedInvoice.due_date)}</p>
              </div>
            </div>

            {/* Line items list */}
            <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Line Items")}</p>
            <div className="card" style={{ padding: '0px', background: 'var(--color-bg)', marginBottom: '24px', overflow: 'hidden' }}>
              <table className="data-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>{translate("Description")}</th>
                    <th style={{ textAlign: "end" }}>{translate("Qty")}</th>
                    <th style={{ textAlign: "end" }}>{translate("Unit Price")}</th>
                    <th style={{ textAlign: "end" }}>{translate("Subtotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.description}</td>
                      <td style={{ textAlign: "end" }}>{item.quantity}</td>
                      <td style={{ textAlign: "end" }} className="font-mono">{formatEGP(item.unit_price)}</td>
                      <td style={{ textAlign: "end" }} className="font-mono">{formatEGP(item.subtotal)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--color-bg-card)', fontWeight: 700 }}>
                    <td colSpan="3" style={{ textAlign: "end" }}>{translate("Total:")}</td>
                    <td style={{ textAlign: "end" }} className="font-mono">{formatEGP(selectedInvoice.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Payment history */}
            <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{translate("Payments Recorded")}</p>
            <div style={{ marginBottom: '24px' }}>
              {selectedInvoice.payments?.map((pay, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                  <div>
                    <span className="badge badge-success" style={{ fontSize: '9px', marginInlineEnd: '8px' }}>{translate(pay.payment_method)}</span>
                    <span style={{ fontSize: '13px' }}>{translate("Recorded payment")}</span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>+{formatEGP(pay.amount)}</span>
                </div>
              ))}
              {selectedInvoice.payments?.length === 0 && (
                <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', padding: '8px 0' }}>{translate("No payments recorded yet")}</p>
              )}
            </div>

            {/* Record Payment Actions */}
            {selectedInvoice.status !== 'Paid' && (
              <div className="card" style={{ background: 'var(--color-bg)' }}>
                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>{translate("Record New Payment")}</p>
                <form onSubmit={handleRecordPayment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', alignItems: 'end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Amount")}</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Method")}</label>
                    <select
                      className="input select"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      required
                    >
                      <option value="Cash">{translate("Cash")}</option>
                      <option value="Bank Transfer">{translate("Bank Transfer")}</option>
                      <option value="Instalment">{translate("Instalment")}</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary"> {translate("Record")} </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate 3PL Invoices Modal */}
      {show3PLModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>{translate("Generate 3PL Invoices")}</p>
            <p className="text-body" style={{ color: 'var(--color-text-dim)', marginBottom: '24px' }}> {translate("This will automatically calculate monthly rent and sales commissions for all 3PL clients for the selected period, generating draft invoices.")} </p>
            <form onSubmit={handleGenerate3PL} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>{translate("Start Date")}</label>
                <input type="date" className="input" value={monthStart} onChange={(e) => setMonthStart(e.target.value)} required />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>{translate("End Date")}</label>
                <input type="date" className="input" value={monthEnd} onChange={(e) => setMonthEnd(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShow3PLModal(false)}>{translate("Cancel")}</button>
                <button type="submit" className="btn btn-primary">{translate("Generate")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
