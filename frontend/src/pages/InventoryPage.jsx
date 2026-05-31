// Inventory Management Page — FR-WH-01 through FR-WH-15
import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber, getStatusColor } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form, setForm] = useState({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '' });
  const [syncing, setSyncing] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    try {
      const data = await api.get('/inventory');
      setProducts(data);
    } catch (err) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await api.post('/shopify/sync');
      toast.success(`Synced: ${result.productsUpdated} updated, ${result.productsCreated} new`);
      fetchProducts();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    try {
      if (selectedProduct) {
        await api.put(`/inventory/${selectedProduct.id}`, form);
        toast.success('Product updated');
      } else {
        await api.post('/inventory', { 
          ...form, 
          stock_quantity: Number(form.stock_quantity), 
          price: Number(form.price), 
          cost_per_unit: Number(form.cost_per_unit),
          barcode: form.barcode.trim() || undefined 
        });
        toast.success('Product created');
      }
      setShowModal(false);
      setSelectedProduct(null);
      setForm({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '' });
      fetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/inventory/${id}`);
      toast.success('Product deleted');
      fetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleExportCSV() {
    try {
      await api.downloadBlob('/inventory/export/csv', 'rehla-inventory.csv');
      toast.success('CSV exported');
    } catch (err) {
      toast.error('Export failed');
    }
  }

  function openEdit(product) {
    setSelectedProduct(product);
    setForm({ sku: product.sku, name: product.name, price: product.price, cost_per_unit: product.cost_per_unit, stock_quantity: product.stock_quantity, category: product.category, brand: product.brand, barcode: product.barcode || '' });
    setShowModal(true);
  }

  const filtered = useMemo(() => {
    return products.filter(p =>
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stock_quantity < 10).length;
  }, [products]);

  const totalUnits = useMemo(() => {
    return products.reduce((s, p) => s + p.stock_quantity, 0);
  }, [products]);

  const retailValue = useMemo(() => {
    return products.reduce((s, p) => s + p.stock_quantity * p.price, 0);
  }, [products]);

  return (
    <DashboardShell title="Inventory Management">
      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Total SKUs</p>
          <p className="font-mono" style={{ fontSize: '28px', fontWeight: 700 }}>{formatNumber(products.length)}</p>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Total Units</p>
          <p className="font-mono" style={{ fontSize: '28px', fontWeight: 700 }}>{formatNumber(totalUnits)}</p>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Low Stock Alerts</p>
          <p className="font-mono low-stock" style={{ fontSize: '28px', fontWeight: 700 }}>{lowStockCount}</p>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Retail Value</p>
          <p className="font-mono" style={{ fontSize: '18px', fontWeight: 700 }}>{formatEGP(retailValue)}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: '320px' }}
          placeholder="Search by SKU, name, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={() => { setSelectedProduct(null); setForm({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '' }); setShowModal(true); }}>
          + Add Product
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : '⟲ Shopify Sync'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
          ↓ Export CSV
        </button>
      </div>

      {/* Products Table */}
      <div className="card table-container" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '40px' }}>
            {[...Array(5)].map((_, i) => <div key={`skeleton-${i}`} className="skeleton" style={{ height: '40px', marginBottom: '8px' }}></div>)}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td className="font-mono" style={{ fontSize: '12px', fontWeight: 600 }}>{product.sku}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {product.image_url && (
                        <img src={product.image_url} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '2px' }} />
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{product.name}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{product.category}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontSize: '13px' }}>{formatEGP(product.price)}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontSize: '13px', color: 'var(--color-text-muted)' }}>{formatEGP(product.cost_per_unit)}</td>
                  <td className={`font-mono ${product.stock_quantity < 10 ? 'low-stock' : ''}`} style={{ textAlign: 'right', fontSize: '13px' }}>
                    {formatNumber(product.stock_quantity)}
                  </td>
                  <td>
                    <span className={`badge badge-${product.stock_quantity < 10 ? 'error' : product.stock_quantity < 25 ? 'warning' : 'success'}`}>
                      {product.stock_quantity < 10 ? 'Low' : product.stock_quantity < 25 ? 'Medium' : 'In Stock'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openEdit(product)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => { setSelectedProductForBarcode(product); setShowBarcodeModal(true); }}>Barcode</button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleDelete(product.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>No products found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-title" style={{ marginBottom: '24px' }}>
              {selectedProduct ? 'Edit Product' : 'Add Product'}
            </h2>
            <form onSubmit={handleSaveProduct}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>SKU</label>
                  <input className="input" name="sku" value={form.sku} onChange={handleChange} required disabled={!!selectedProduct} />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Name</label>
                  <input className="input" name="name" value={form.name} onChange={handleChange} required />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Price (EGP)</label>
                  <input className="input" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Cost/Unit (EGP)</label>
                  <input className="input" name="cost_per_unit" type="number" step="0.01" value={form.cost_per_unit} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Stock Quantity</label>
                  <input className="input" name="stock_quantity" type="number" value={form.stock_quantity} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Category</label>
                  <input className="input" name="category" value={form.category} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' }}>Barcode</label>
                  <input 
                    className="input" 
                    name="barcode"
                    value={form.barcode} 
                    onChange={handleChange} 
                    placeholder={selectedProduct ? "Barcode value" : "Optional (Auto-generated)"}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {selectedProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode View Modal */}
      {showBarcodeModal && selectedProductForBarcode && (
        <div className="modal-overlay" onClick={() => setShowBarcodeModal(false)}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-title" style={{ marginBottom: '12px' }}>Product Barcode</h2>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{selectedProductForBarcode.name}</p>
            <p className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              SKU: {selectedProductForBarcode.sku} | Barcode: {selectedProductForBarcode.barcode || selectedProductForBarcode.sku}
            </p>
            
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '4px', display: 'inline-block', margin: '0 auto 24px auto' }}>
              <img 
                src={`/api/inventory/${selectedProductForBarcode.id}/barcode`} 
                alt="Barcode" 
                style={{ display: 'block', maxWidth: '100%', height: 'auto', maxHeight: '80px' }} 
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBarcodeModal(false)}>Close</button>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={async () => {
                  try {
                    const updatedProduct = await api.post(`/inventory/${selectedProductForBarcode.id}/barcode/generate`);
                    setSelectedProductForBarcode(updatedProduct);
                    fetchProducts();
                    toast.success('Barcode generated successfully!');
                  } catch (err) {
                    toast.error('Failed to generate barcode: ' + err.message);
                  }
                }}
              >
                {selectedProductForBarcode.barcode ? 'Regenerate' : 'Generate'}
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => {
                  const printWindow = window.open(`/api/inventory/${selectedProductForBarcode.id}/barcode`, '_blank');
                  if (printWindow) {
                    printWindow.focus();
                    printWindow.onload = () => {
                      printWindow.print();
                    };
                  }
                }}
              >
                Print Label
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
