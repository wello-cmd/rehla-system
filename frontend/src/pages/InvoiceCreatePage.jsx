import { translate } from '../i18n/index.js';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP } from '../lib/formatters';
import { Link, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function InvoiceCreatePage() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: '' }]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchClients() {
      try {
        const data = await api.get('/clients');
        setClients(data);
      } catch (err) {
        toast.error(translate("Failed to load B2B clients"));
      }
    }
    fetchClients();
  }, []);

  // Update customer fields when a client is selected
  function handleClientChange(e) {
    const cid = e.target.value;
    setClientId(cid);
    if (cid) {
      const selected = clients.find(c => c.id === cid);
      if (selected) {
        setCustomerName(selected.contact_person || selected.company_name);
        setCustomerEmail(selected.email || '');
      }
    } else {
      setCustomerName('');
      setCustomerEmail('');
    }
  }

  // Line item change
  function handleItemChange(index, field, value) {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  }

  // Add line item
  function addItem() {
    setItems([...items, { description: '', quantity: 1, unit_price: '' }]);
  }

  // Remove line item
  function removeItem(index) {
    if (items.length === 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  }

  // Calculate invoice subtotal/total
  const total = items.reduce((sum, item) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return sum + (qty * price);
  }, 0);

  // Submit form
  async function handleSubmit(e) {
    e.preventDefault();

    // Validations
    if (!customerName.trim()) {
      toast.error(translate("Customer name is required"));
      return;
    }

    const invalidItem = items.some(item => !item.description.trim() || item.quantity <= 0 || !item.unit_price || parseFloat(item.unit_price) <= 0);
    if (invalidItem) {
      toast.error(translate("Please fill all line items with valid description, quantity and unit price."));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        client_id: clientId || null,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes.trim(),
        items: items.map(item => ({
          description: item.description.trim(),
          quantity: parseInt(item.quantity, 10),
          unit_price: parseFloat(item.unit_price)
        }))
      };

      await api.post('/invoices', payload);
      toast.success(translate("Invoice created successfully"));
      navigate('/invoices');
    } catch (err) {
      toast.error(translate(err.message || 'Failed to create invoice'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell title={translate("Create invoice")} actions={<Link className="btn btn-secondary" to="/invoices">{translate("Back to invoices")}</Link>}>
      <form onSubmit={handleSubmit} style={{ maxWidth: '800px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          {/* Client Selection & Customer details */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>{translate("Client Information")}</p>
            <div>
              <label htmlFor="invoice-client" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("B2B Client (Optional)")}</label>
              <select id="invoice-client" className="input select" value={clientId} onChange={handleClientChange}>
                <option value="">{translate("-- Custom/Individual Customer --")}</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} ({c.contact_person})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="invoice-customer" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Customer Contact Name")}</label>
              <input id="invoice-customer"
                className="input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={translate("e.g. John Doe")}
                required
              />
            </div>
            <div>
              <label htmlFor="invoice-email" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Customer Email (Optional)")}</label>
              <input id="invoice-email"
                type="email"
                className="input"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="e.g. john@example.com"
              />
            </div>
          </div>

          {/* Dates & Notes */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>{translate("Dates & Notes")}</p>
            <div>
              <label htmlFor="invoice-issued" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Issue Date")}</label>
              <input id="invoice-issued"
                type="date"
                className="input"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="invoice-due" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Due Date")}</label>
              <input id="invoice-due"
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="invoice-notes" className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>{translate("Memo / Notes")}</label>
              <textarea id="invoice-notes"
                className="input"
                style={{ height: '78px', resize: 'none' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={translate("e.g. Thank you for your business")}
              />
            </div>
          </div>
        </div>

        {/* Line Items Card */}
        <div className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>{translate("Line Items")}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}> {translate("+ Add Item")} </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item, index) => (
              <div key={index} className="invoice-item-row">
                <div className="item-desc">
                  <input
                    className="input"
                    aria-label={`Description for item ${index + 1}`}
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    placeholder={translate("Description / Product name")}
                    required
                  />
                </div>
                <div className="invoice-item-row-mobile-inputs">
                  <div className="item-qty">
                    <input
                      type="number"
                      min="1"
                      className="input"
                      aria-label={`Quantity for item ${index + 1}`}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value, 10) || '')}
                      placeholder={translate("Qty")}
                      required
                    />
                  </div>
                  <div className="item-price">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input"
                      aria-label={`Unit price for item ${index + 1}`}
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                      placeholder={translate("Unit Price")}
                      required
                    />
                  </div>
                </div>
                <div className="font-mono item-total">
                  {formatEGP((parseInt(item.quantity, 10) || 0) * (parseFloat(item.unit_price) || 0))}
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm item-delete"
                  aria-label={`Remove item ${index + 1}`} onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  style={{ padding: '12px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            ))}
          </div>

          {/* Subtotal row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', marginTop: '20px', paddingTop: '16px' }}>
            <div style={{ textAlign: "end" }}>
              <span className="text-label" style={{ color: 'var(--color-text-dim)', marginInlineEnd: '16px' }}>{translate("Grand Total:")}</span>
              <span className="font-mono" style={{ fontSize: '22px', fontWeight: 800 }}>{formatEGP(total)}</span>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/invoices')} disabled={loading}> {translate("Cancel")} </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? translate("CREATING...") : translate("GENERATE INVOICE")}
          </button>
        </div>
      </form>
    </DashboardShell>
  );
}
