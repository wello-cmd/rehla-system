import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [fulfillmentFee, setFulfillmentFee] = useState('');
  const [storageFeeMonthly, setStorageFeeMonthly] = useState('');
  const [storageFeePerUnit, setStorageFeePerUnit] = useState('');

  async function fetchClients() {
    try {
      const data = await api.get('/clients');
      setClients(data);
    } catch (err) {
      toast.error('Failed to load B2B client list');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = clients.filter(c =>
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function openCreateModal() {
    setEditingClient(null);
    setCompanyName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setAddress('');
    setTaxNumber('');
    setFulfillmentFee('');
    setStorageFeeMonthly('');
    setStorageFeePerUnit('');
    setShowModal(true);
  }

  function openEditModal(client) {
    setEditingClient(client);
    setCompanyName(client.company_name);
    setContactPerson(client.contact_person);
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setAddress(client.address || '');
    setTaxNumber(client.tax_number || '');
    setFulfillmentFee(client.fulfillment_fee_percentage || '');
    setStorageFeeMonthly(client.storage_fee_monthly || '');
    setStorageFeePerUnit(client.storage_fee_per_unit || '');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName.trim() || !contactPerson.trim()) {
      toast.error('Company name and contact person are required');
      return;
    }

    const payload = {
      company_name: companyName.trim(),
      contact_person: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      tax_number: taxNumber.trim(),
      fulfillment_fee_percentage: parseFloat(fulfillmentFee) || 0,
      storage_fee_monthly: parseFloat(storageFeeMonthly) || 0,
      storage_fee_per_unit: parseFloat(storageFeePerUnit) || 0
    };

    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
        toast.success('B2B Client updated successfully');
      } else {
        await api.post('/clients', payload);
        toast.success('B2B Client registered successfully');
      }
      setShowModal(false);
      fetchClients();
    } catch (err) {
      toast.error(err.message || 'Failed to save client');
    }
  }

  async function handleDelete(client) {
    if (!confirm(`Are you sure you want to delete client: ${client.company_name}?`)) return;
    try {
      await api.delete(`/clients/${client.id}`);
      toast.success('B2B Client deleted successfully');
      fetchClients();
    } catch (err) {
      toast.error('Failed to delete B2B Client');
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="B2B Client Registry">
      {loading ? renderSkeleton() : (
        <>
          {/* Action Row */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              className="input"
              style={{ maxWidth: '300px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by company name, contact..."
            />
            <button className="btn btn-primary" onClick={openCreateModal}>
              + Add Client
            </button>
          </div>

          {/* Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Contact Person</th>
                    <th>Email Address</th>
                    <th>Phone Number</th>
                    <th>Address</th>
                    <th>Tax Number</th>
                    <th>3PL Commission</th>
                    <th>3PL Rent (M/U)</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.company_name}</td>
                      <td>{c.contact_person}</td>
                      <td className="font-mono">{c.email || '—'}</td>
                      <td className="font-mono">{c.phone || '—'}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address || '—'}</td>
                      <td className="font-mono">{c.tax_number || '—'}</td>
                      <td className="font-mono">{c.fulfillment_fee_percentage ? `${c.fulfillment_fee_percentage}%` : '—'}</td>
                      <td className="font-mono">
                        {c.storage_fee_monthly || c.storage_fee_per_unit 
                          ? `${c.storage_fee_monthly || 0} / ${c.storage_fee_per_unit || 0}`
                          : '—'
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(c)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(c)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                        No B2B clients found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>
              {editingClient ? 'Edit B2B Client' : 'Register New B2B Client'}
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Company Name</label>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                />
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Contact Person Name</label>
                <input
                  className="input"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Email</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. contact@acme.com"
                  />
                </div>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Phone</label>
                  <input
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +20100..."
                  />
                </div>
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Address</label>
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Zamalek, Cairo"
                />
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Tax Number</label>
                <input
                  className="input"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="e.g. 123-456-789"
                />
              </div>

              {/* 3PL Fulfillment Fees */}
              <div style={{ padding: '16px', background: 'var(--color-bg-inset)', borderRadius: '12px', marginTop: '8px' }}>
                <p className="text-label" style={{ marginBottom: '12px', color: 'var(--color-text-dim)' }}>3PL Fulfillment Settings</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                  <div>
                    <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Commission (%)</label>
                    <input type="number" step="0.01" className="input" value={fulfillmentFee} onChange={(e) => setFulfillmentFee(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Monthly Rent (Flat)</label>
                    <input type="number" step="0.01" className="input" value={storageFeeMonthly} onChange={(e) => setStorageFeeMonthly(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Per-Unit Fee</label>
                    <input type="number" step="0.01" className="input" value={storageFeePerUnit} onChange={(e) => setStorageFeePerUnit(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
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
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
