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

  function handleSearchChange(e) {
    setSearchTerm(e.target.value);
  }

  function openAdd() {
    setSelectedProduct(null);
    setForm({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '' });
    setShowModal(true);
  }

  function closeFormModal() {
    setShowModal(false);
  }

  function openBarcode(product) {
    setSelectedProductForBarcode(product);
    setShowBarcodeModal(true);
  }

  function closeBarcodeModal() {
    setShowBarcodeModal(false);
  }

  function handleGenerateBarcode() {
    api.post(`/inventory/${selectedProductForBarcode.id}/barcode/generate`)
      .then(updatedProduct => {
        setSelectedProductForBarcode(updatedProduct);
        fetchProducts();
        toast.success('Barcode generated successfully!');
      })
      .catch(err => {
        toast.error('Failed to generate barcode: ' + err.message);
      });
  }

  function handlePrintBarcode() {
    const printWindow = window.open(`/api/inventory/${selectedProductForBarcode.id}/barcode`, '_blank');
    if (printWindow) {
      printWindow.focus();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }

  function handleEditProduct(e) {
    const id = e.currentTarget.getAttribute('data-id');
    const product = products.find(p => p.id === id);
    if (product) {
      openEdit(product);
    }
  }

  function handleBarcodeClick(e) {
    const id = e.currentTarget.getAttribute('data-id');
    const product = products.find(p => p.id === id);
    if (product) {
      openBarcode(product);
    }
  }

  function handleDeleteProduct(e) {
    const id = e.currentTarget.getAttribute('data-id');
    handleDelete(id);
  }

  function handleSyncClick() {
    handleSync();
  }

  function handleExportCSVClick() {
    handleExportCSV();
  }

  function handleModalContentClick(e) {
    e.stopPropagation();
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
      <div style={STYLES.summaryGrid}>
        <div className="card" style={STYLES.summaryCard}>
          <p className="text-label" style={STYLES.cardLabel}>Total SKUs</p>
          <p className="font-mono" style={STYLES.cardValueMono}>{formatNumber(products.length)}</p>
        </div>
        <div className="card" style={STYLES.summaryCard}>
          <p className="text-label" style={STYLES.cardLabel}>Total Units</p>
          <p className="font-mono" style={STYLES.cardValueMono}>{formatNumber(totalUnits)}</p>
        </div>
        <div className="card" style={STYLES.summaryCard}>
          <p className="text-label" style={STYLES.cardLabel}>Low Stock Alerts</p>
          <p className="font-mono low-stock" style={STYLES.cardValueMono}>{lowStockCount}</p>
        </div>
        <div className="card" style={STYLES.summaryCard}>
          <p className="text-label" style={STYLES.cardLabel}>Retail Value</p>
          <p className="font-mono" style={STYLES.cardValueRetail}>{formatEGP(retailValue)}</p>
        </div>
      </div>

      {/* Actions Bar */}
      <div style={STYLES.actionsBar}>
        <input
          className="input"
          style={STYLES.searchInput}
          placeholder="Search by SKU, name, or category..."
          value={searchTerm}
          onChange={handleSearchChange}
        />
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          + Add Product
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleSyncClick} disabled={syncing}>
          {syncing ? 'Syncing...' : '⟲ Shopify Sync'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExportCSVClick}>
          ↓ Export CSV
        </button>
      </div>

      {/* Products Table */}
      <div className="card table-container" style={STYLES.tableContainer}>
        {loading ? (
          <div style={STYLES.skeletonContainer}>
            {[...Array(5)].map((_, i) => <div key={`skeleton-${i}`} className="skeleton" style={STYLES.skeletonItem}></div>)}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Category</th>
                <th style={STYLES.textRight}>Price</th>
                <th style={STYLES.textRight}>Cost</th>
                <th style={STYLES.textRight}>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td className="font-mono" style={STYLES.skuCol}>{product.sku}</td>
                  <td>
                    <div style={STYLES.productCol}>
                      {product.image_url && (
                        <img src={product.image_url} alt="" style={STYLES.productImage} />
                      )}
                      <span style={STYLES.productName}>{product.name}</span>
                    </div>
                  </td>
                  <td style={STYLES.categoryCol}>{product.category}</td>
                  <td className="font-mono" style={STYLES.priceCol}>{formatEGP(product.price)}</td>
                  <td className="font-mono" style={STYLES.costCol}>{formatEGP(product.cost_per_unit)}</td>
                  <td className={`font-mono ${product.stock_quantity < 10 ? 'low-stock' : ''}`} style={STYLES.priceCol}>
                    {formatNumber(product.stock_quantity)}
                  </td>
                  <td>
                    <span className={`badge badge-${product.stock_quantity < 10 ? 'error' : product.stock_quantity < 25 ? 'warning' : 'success'}`}>
                      {product.stock_quantity < 10 ? 'Low' : product.stock_quantity < 25 ? 'Medium' : 'In Stock'}
                    </span>
                  </td>
                  <td>
                    <div style={STYLES.actionsCell}>
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} data-id={product.id} onClick={handleEditProduct}>Edit</button>
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} data-id={product.id} onClick={handleBarcodeClick}>Barcode</button>
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} data-id={product.id} onClick={handleDeleteProduct}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={STYLES.noProductsCell}>No products found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeFormModal}>
          <div className="modal-content" onClick={handleModalContentClick}>
            <h2 className="text-title" style={STYLES.modalTitle}>
              {selectedProduct ? 'Edit Product' : 'Add Product'}
            </h2>
            <form onSubmit={handleSaveProduct}>
              <div style={STYLES.modalGrid}>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>SKU</label>
                  <input className="input" name="sku" value={form.sku} onChange={handleChange} required disabled={!!selectedProduct} />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Name</label>
                  <input className="input" name="name" value={form.name} onChange={handleChange} required />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Price (EGP)</label>
                  <input className="input" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Cost/Unit (EGP)</label>
                  <input className="input" name="cost_per_unit" type="number" step="0.01" value={form.cost_per_unit} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Stock Quantity</label>
                  <input className="input" name="stock_quantity" type="number" value={form.stock_quantity} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Category</label>
                  <input className="input" name="category" value={form.category} onChange={handleChange} />
                </div>
                <div>
                  <label className="text-label" style={STYLES.modalLabel}>Barcode</label>
                  <input 
                    className="input" 
                    name="barcode"
                    value={form.barcode} 
                    onChange={handleChange} 
                    placeholder={selectedProduct ? "Barcode value" : "Optional (Auto-generated)"}
                  />
                </div>
              </div>
              <div style={STYLES.modalActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeFormModal}>Cancel</button>
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
        <div className="modal-overlay" onClick={closeBarcodeModal}>
          <div className="modal-content" style={STYLES.barcodeModalContent} onClick={handleModalContentClick}>
            <h2 className="text-title" style={STYLES.barcodeModalTitle}>Product Barcode</h2>
            <p style={STYLES.barcodeModalProduct}>{selectedProductForBarcode.name}</p>
            <p className="font-mono" style={STYLES.barcodeModalMeta}>
              SKU: {selectedProductForBarcode.sku} | Barcode: {selectedProductForBarcode.barcode || selectedProductForBarcode.sku}
            </p>
            
            <div style={STYLES.barcodeImageWrapper}>
              <img 
                src={`/api/inventory/${selectedProductForBarcode.id}/barcode`} 
                alt="Barcode" 
                style={STYLES.barcodeImage} 
              />
            </div>

            <div style={STYLES.barcodeModalActions}>
              <button className="btn btn-secondary btn-sm" onClick={closeBarcodeModal}>Close</button>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={handleGenerateBarcode}
              >
                {selectedProductForBarcode.barcode ? 'Regenerate' : 'Generate'}
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handlePrintBarcode}
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

const STYLES = {
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' },
  summaryCard: { padding: '16px' },
  cardLabel: { color: 'var(--color-text-dim)', fontSize: '10px' },
  cardValueMono: { fontSize: '28px', fontWeight: 700 },
  cardValueRetail: { fontSize: '18px', fontWeight: 700 },
  actionsBar: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  searchInput: { maxWidth: '320px' },
  tableContainer: { padding: 0 },
  skeletonContainer: { padding: '40px' },
  skeletonItem: { height: '40px', marginBottom: '8px' },
  textRight: { textAlign: 'right' },
  skuCol: { fontSize: '12px', fontWeight: 600 },
  productCol: { display: 'flex', alignItems: 'center', gap: '10px' },
  productImage: { width: '32px', height: '32px', objectFit: 'cover', borderRadius: '2px' },
  productName: { fontSize: '13px', fontWeight: 500 },
  categoryCol: { fontSize: '12px', color: 'var(--color-text-muted)' },
  priceCol: { textAlign: 'right', fontSize: '13px' },
  costCol: { textAlign: 'right', fontSize: '13px', color: 'var(--color-text-muted)' },
  actionsCell: { display: 'flex', gap: '4px' },
  actionBtn: { padding: '4px 8px', fontSize: '11px' },
  noProductsCell: { textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' },
  modalTitle: { marginBottom: '24px' },
  modalGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  modalLabel: { display: 'block', marginBottom: '6px', color: 'var(--color-text-dim)' },
  modalActions: { display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' },
  barcodeModalContent: { maxWidth: '400px', textAlign: 'center' },
  barcodeModalTitle: { marginBottom: '12px' },
  barcodeModalProduct: { fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' },
  barcodeModalMeta: { fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '20px' },
  barcodeImageWrapper: { background: '#FFFFFF', padding: '16px', borderRadius: '4px', display: 'inline-block', margin: '0 auto 24px auto' },
  barcodeImage: { display: 'block', maxWidth: '100%', height: 'auto', maxHeight: '80px' },
  barcodeModalActions: { display: 'flex', gap: '12px', justifyContent: 'center' }
};
