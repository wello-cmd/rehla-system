import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [role, setRole] = useState('worker');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchUsers() {
    try {
      const data = await api.get('/auth/users'); // rateLimit
      setUsers(data);
    } catch (err) {
      toast.error('Failed to load user directory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.staff_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function openCreateModal() {
    setEmail('');
    setPassword('');
    setName('');
    setStaffId('');
    setRole('worker');
    setPhone('');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !name.trim() || !staffId.trim() || !role) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/register', {
        email: email.trim(),
        password: password.trim(),
        name: name.trim(),
        staff_id: staffId.trim().toUpperCase(),
        role,
        phone: phone.trim() || undefined
      });
      toast.success('User registered successfully');
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setSaving(false);
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="Staff & User Registry">
      {loading ? renderSkeleton() : (
        <>
          {/* Action Row */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ maxWidth: '300px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search staff, email, role..."
            />
            <button className="btn btn-primary" onClick={openCreateModal}>
              + Add Staff User
            </button>
          </div>

          {/* Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff ID</th>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Registered At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{u.staff_id}</td>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      <td className="font-mono">{u.email}</td>
                      <td>
                        <span className={`badge ${
                          u.role === 'ceo' ? 'badge-success' :
                          u.role === 'admin' ? 'badge-info' :
                          u.role === 'worker' ? 'badge-neutral' :
                          u.role === 'driver' ? 'badge-warning' : 'badge-neutral'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono">{u.phone || '—'}</td>
                      <td className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                        No staff users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Register Staff Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <p className="text-title" style={{ marginBottom: '24px' }}>Register Staff User</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Staff ID / Code</label>
                  <input
                    className="input"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    placeholder="e.g. WRK-04"
                    required
                  />
                </div>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>System Role</label>
                  <select
                    className="input select"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                  >
                    <option value="worker">Worker</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="accountant">Accountant</option>
                    <option value="admin">Admin</option>
                    <option value="ceo">CEO</option>
                    <option value="driver">Driver</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Email Address</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. user@rehla.com"
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Password</label>
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                  />
                </div>
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Phone Number (Optional)</label>
                  <input
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +2010..."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Registering...' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
