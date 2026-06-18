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
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '', client_id: '' });
  const [syncing, setSyncing] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [variantsProduct, setVariantsProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [variantForm, setVariantForm] = useState({ sku: '', size: '', color: '', stock_quantity: '', price: '' });
  const [editingVariant, setEditingVariant] = useState(null);
  const [showBulkBarcodeModal, setShowBulkBarcodeModal] = useState(false);
  const [bulkBarcodeProducts, setBulkBarcodeProducts] = useState([]);
  const [bulkVariantSelections, setBulkVariantSelections] = useState({});
  const [selectedBarcodeVariant, setSelectedBarcodeVariant] = useState('');
  const [bulkCopies, setBulkCopies] = useState(1);
  const [bulkUseStock, setBulkUseStock] = useState(false);
  const [bulkSearch, setBulkSearch] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleSearchChange(e) {
    setSearchTerm(e.target.value);
  }

  function openAdd() {
    setSelectedProduct(null);
    setForm({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '', client_id: '' });
    setShowModal(true);
  }

  function closeFormModal() {
    setShowModal(false);
  }

  function openBarcode(product) {
    setSelectedProductForBarcode(product);
    // Pre-select the variant with the most stock; fall back to product-level if none
    const pvs = product.product_variants || [];
    if (pvs.length > 0) {
      const top = pvs.reduce((a, b) => (Number(b.stock_quantity) || 0) > (Number(a.stock_quantity) || 0) ? b : a);
      setSelectedBarcodeVariant(top.id);
    } else {
      setSelectedBarcodeVariant('');
    }
    setShowBarcodeModal(true);
  }

  function openVariantsFromBarcode() {
    const product = selectedProductForBarcode;
    setShowBarcodeModal(false);
    if (product) openVariants(product);
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
    // Respect the variant chosen in the dropdown so size/color print on the label
    const pvs = selectedProductForBarcode.product_variants || [];
    const activeVariant = pvs.find(v => v.id === selectedBarcodeVariant);
    const url = `/api/inventory/${selectedProductForBarcode.id}/barcode${activeVariant ? `?variant_id=${activeVariant.id}` : ''}`;
    const printWindow = window.open(url, '_blank');
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

  useEffect(() => { fetchProducts(); fetchClients(); }, [startDate, endDate]);

  // Press Esc to dismiss whichever modal is open
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setShowBulkBarcodeModal(false);
        setShowBarcodeModal(false);
        setShowVariantsModal(false);
        setShowModal(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function fetchClients() {
    try {
      const data = await api.get('/clients');
      setClients(data);
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  }

  async function fetchProducts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const data = await api.get(`/inventory?${params.toString()}`);
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
        await api.put(`/inventory/${selectedProduct.id}`, { ...form, client_id: form.client_id || null });
        toast.success('Product updated');
      } else {
        await api.post('/inventory', { 
          ...form, 
          stock_quantity: Number(form.stock_quantity), 
          price: Number(form.price), 
          cost_per_unit: Number(form.cost_per_unit),
          barcode: form.barcode.trim() || undefined,
          client_id: form.client_id || undefined
        });
        toast.success('Product created');
      }
      setShowModal(false);
      setSelectedProduct(null);
      setForm({ sku: '', name: '', price: '', cost_per_unit: '', stock_quantity: '', category: 'Uncategorized', brand: 'REHLA', barcode: '', client_id: '' });
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
    setForm({ sku: product.sku, name: product.name, price: product.price, cost_per_unit: product.cost_per_unit, stock_quantity: product.stock_quantity, category: product.category, brand: product.brand, barcode: product.barcode || '', client_id: product.client_id || '' });
    setShowModal(true);
  }

  async function openVariants(product) {
    setVariantsProduct(product);
    setVariantForm({ sku: '', size: '', color: '', stock_quantity: '', price: '' });
    setEditingVariant(null);
    setShowVariantsModal(true);
    try {
      const data = await api.get(`/inventory/${product.id}/variants`);
      setVariants(data);
    } catch (err) {
      toast.error('Failed to load variants: ' + err.message);
    }
  }

  async function handleSaveVariant(e) {
    e.preventDefault();
    if (!variantsProduct) return;
    try {
      if (editingVariant) {
        await api.patch(`/inventory/${variantsProduct.id}/variants/${editingVariant.id}`, variantForm);
        toast.success('Variant updated');
      } else {
        await api.post(`/inventory/${variantsProduct.id}/variants`, variantForm);
        toast.success('Variant added');
      }
      setVariantForm({ sku: '', size: '', color: '', stock_quantity: '', price: '' });
      setEditingVariant(null);
      const data = await api.get(`/inventory/${variantsProduct.id}/variants`);
      setVariants(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteVariant(variantId) {
    if (!variantsProduct) return;
    try {
      await api.delete(`/inventory/${variantsProduct.id}/variants/${variantId}`);
      toast.success('Variant deleted');
      const data = await api.get(`/inventory/${variantsProduct.id}/variants`);
      setVariants(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  function startEditVariant(v) {
    setEditingVariant(v);
    setVariantForm({ sku: v.sku, size: v.size || '', color: v.color || '', stock_quantity: v.stock_quantity, price: v.price || '' });
  }

  function toggleSelection(id) {
    setSelectedProducts(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  function toggleSelectAll(e) {
    if (e.target.checked) {
      setSelectedProducts(filtered.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  }

  async function handleBulkBarcodeStart() {
    if (selectedProducts.length === 0) {
      toast.error('Please select products first.');
      return;
    }
    // Load variants for all selected products
    const productsWithVariants = [];
    for (const pid of selectedProducts) {
      const product = products.find(p => p.id === pid);
      if (!product) continue;
      const pvs = product.product_variants || [];
      productsWithVariants.push({ ...product, variants: pvs });
    }
    setBulkBarcodeProducts(productsWithVariants);
    // Default: select ALL variants for each product, or product-level if none
    const selections = {};
    for (const p of productsWithVariants) {
      if (p.variants.length > 0) {
        selections[p.id] = p.variants.map(v => v.id);
      } else {
        selections[p.id] = ['__product__']; // flag for product-level
      }
    }
    setBulkVariantSelections(selections);
    setBulkCopies(1);
    setBulkUseStock(false);
    setBulkSearch('');
    setShowBulkBarcodeModal(true);
  }

  function toggleBulkVariant(productId, variantId) {
    setBulkVariantSelections(prev => {
      const current = prev[productId] || [];
      if (current.includes(variantId)) {
        return { ...prev, [productId]: current.filter(v => v !== variantId) };
      } else {
        return { ...prev, [productId]: [...current, variantId] };
      }
    });
  }

  function toggleAllVariantsForProduct(productId, allVariantIds) {
    setBulkVariantSelections(prev => {
      const current = prev[productId] || [];
      if (current.length === allVariantIds.length) {
        return { ...prev, [productId]: [] };
      } else {
        return { ...prev, [productId]: [...allVariantIds] };
      }
    });
  }

  async function handleBulkPrintBarcodes() {
    // Build items payload from selections
    const items = [];
    for (const [productId, variantIds] of Object.entries(bulkVariantSelections)) {
      const filtered = variantIds.filter(v => v !== '__product__');
      if (variantIds.includes('__product__') || filtered.length === 0) {
        items.push({ product_id: productId, variant_ids: [] });
      } else {
        items.push({ product_id: productId, variant_ids: filtered });
      }
    }
    if (items.length === 0) {
      toast.error('No products/variants selected for barcodes.');
      return;
    }
    try {
      const result = await api.post('/inventory/barcode/bulk-variants', { items });

      // Resolve how many copies to print per label.
      // "Match stock" prints one sticker per physical unit; otherwise use the global copies count.
      const stockByVariant = {};
      const stockByProduct = {};
      for (const p of bulkBarcodeProducts) {
        stockByProduct[p.id] = Number(p.stock_quantity) || 0;
        for (const v of (p.variants || [])) stockByVariant[v.id] = Number(v.stock_quantity) || 0;
      }
      const PER_LABEL_CAP = 200; // guard against runaway print jobs
      const copiesFor = (item) => {
        const n = bulkUseStock
          ? (item.variant_id ? stockByVariant[item.variant_id] : stockByProduct[item.id]) ?? 0
          : Number(bulkCopies) || 1;
        return Math.max(0, Math.min(n, PER_LABEL_CAP));
      };

      const printable = result.filter(i => i.barcode_image);
      const totalLabels = printable.reduce((s, i) => s + copiesFor(i), 0);
      if (totalLabels === 0) {
        toast.error('Nothing to print — selected items have 0 copies (check stock or copies count).');
        return;
      }

      setShowBulkBarcodeModal(false);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        let html = `<html><head><title>Print Barcodes (${totalLabels})</title><style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: #fff; }
          .labels-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 10px; padding: 16px;
          }
          .label { text-align: center; padding: 12px 14px; border: 1px dashed #999; break-inside: avoid; }
          .product-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; line-height: 1.25; }
          .variant-info { font-size: 11px; color: #666; margin-bottom: 8px; }
          .barcode-img { width: 100%; display: block; }
          .ref1, .ref2 { font-size: 10px; font-family: monospace; letter-spacing: 0.04em; margin-top: 3px; }
          @media print {
            .label { border: 1px dashed #ccc; }
            @page { margin: 8mm; }
          }
        </style></head><body><div class="labels-grid">`;
        printable.forEach(item => {
          const variantInfo = [item.size, item.color].filter(Boolean).join(' / ');
          const labelHtml = `<div class="label">
              <p class="product-name">${item.name}</p>
              ${variantInfo ? `<p class="variant-info">${variantInfo}</p>` : ''}
              <img class="barcode-img" src="data:image/png;base64,${item.barcode_image}" />
              <p class="ref1">${item.line1}</p>
              <p class="ref2">${item.line2}</p>
            </div>`;
          html += labelHtml.repeat(copiesFor(item));
        });
        html += '</div></body></html>';
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      toast.error('Failed to generate bulk barcodes: ' + err.message);
    }
  }

  const [sortBy, setSortBy] = useState('stock_asc');

  const filtered = useMemo(() => {
    const list = products.filter(p =>
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'stock_asc')   return a.stock_quantity - b.stock_quantity;
      if (sortBy === 'stock_desc')  return b.stock_quantity - a.stock_quantity;
      if (sortBy === 'price_asc')   return a.price - b.price;
      if (sortBy === 'price_desc')  return b.price - a.price;
      if (sortBy === 'name')        return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, searchTerm, sortBy]);

  // Live count of physical labels that will print, given current variant + copies selections
  const bulkLabelTotal = useMemo(() => {
    let total = 0;
    for (const p of bulkBarcodeProducts) {
      const sel = bulkVariantSelections[p.id] || [];
      const realVariantIds = sel.filter(v => v !== '__product__');
      if (sel.includes('__product__') || realVariantIds.length === 0) {
        total += bulkUseStock ? (Number(p.stock_quantity) || 0) : Number(bulkCopies) || 1;
      } else {
        for (const vid of realVariantIds) {
          const v = (p.variants || []).find(x => x.id === vid);
          total += bulkUseStock ? (Number(v?.stock_quantity) || 0) : Number(bulkCopies) || 1;
        }
      }
    }
    return total;
  }, [bulkBarcodeProducts, bulkVariantSelections, bulkCopies, bulkUseStock]);

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
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'stock_asc',  label: 'Stock ↑' },
            { id: 'stock_desc', label: 'Stock ↓' },
            { id: 'price_asc',  label: 'Price ↑' },
            { id: 'price_desc', label: 'Price ↓' },
            { id: 'name',       label: 'Name'    },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              className="btn btn-sm"
              style={{
                background:  sortBy === s.id ? 'var(--color-bg-active)' : 'transparent',
                borderColor: sortBy === s.id ? 'var(--color-border)'    : 'transparent',
                color:       sortBy === s.id ? 'var(--color-text)'      : 'var(--color-text-muted)',
                fontSize: 11,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} title="Start Date" />
          <span style={{ color: 'var(--color-text-dim)' }}>—</span>
          <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} title="End Date" />
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          + Add Product
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleSyncClick} disabled={syncing}>
          {syncing ? 'Syncing...' : '⟲ Shopify Sync'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExportCSVClick}>
          ↓ Export CSV
        </button>
        {selectedProducts.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={handleBulkBarcodeStart}>
            🏷️ Print {selectedProducts.length} Barcodes
          </button>
        )}
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
                <th>
                  <input type="checkbox" onChange={toggleSelectAll} checked={selectedProducts.length === filtered.length && filtered.length > 0} />
                </th>
                <th className="hide-xs">SKU</th>
                <th>Product</th>
                <th className="hide-mobile">Owner (3PL)</th>
                <th style={STYLES.textRight}>Price</th>
                <th style={STYLES.textRight} className="hide-mobile">In Warehouse</th>
                <th style={STYLES.textRight} className="hide-mobile">Left Warehouse</th>
                <th style={STYLES.textRight} className="hide-mobile">Sold</th>
                <th style={STYLES.textRight}>Current Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td>
                    <input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => toggleSelection(product.id)} />
                  </td>
                  <td className="font-mono hide-xs" style={STYLES.skuCol}>{product.sku}</td>
                  <td>
                    <div style={STYLES.productCol}>
                      {product.image_url && (
                        <img src={product.image_url} alt="" style={STYLES.productImage} />
                      )}
                      <span
                        style={STYLES.productName}
                        className="link-name"
                        onClick={() => openEdit(product)}
                        title="Click to edit"
                      >
                        {product.name}
                      </span>
                    </div>
                  </td>
                  <td className="hide-mobile">
                    <span className="badge" style={{fontSize: '10px', background: 'var(--color-bg-inset)', color: 'var(--color-text-dim)'}}>
                      {product.clients?.company_name || 'REHLA (Internal)'}
                    </span>
                  </td>
                  <td className="font-mono" style={STYLES.priceCol}>{formatEGP(product.price)}</td>
                  <td className="font-mono hide-mobile" style={STYLES.priceCol}>{formatNumber(product.in_warehouse)}</td>
                  <td className="font-mono hide-mobile" style={STYLES.priceCol}>{formatNumber(product.left_warehouse)}</td>
                  <td className="font-mono hide-mobile" style={STYLES.priceCol}>{formatNumber(product.total_sold)}</td>
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
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} onClick={() => openVariants(product)}>Variants</button>
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} data-id={product.id} onClick={handleBarcodeClick}>Barcode</button>
                      <button className="btn btn-secondary btn-sm" style={STYLES.actionBtn} data-id={product.id} onClick={handleDeleteProduct}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={STYLES.noProductsCell}>No products found</td></tr>
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
                  <label className="text-label" style={STYLES.modalLabel}>Product Owner (3PL)</label>
                  <select className="input" name="client_id" value={form.client_id} onChange={handleChange}>
                    <option value="">REHLA (Internal)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
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

      {/* Variants Modal */}
      {showVariantsModal && variantsProduct && (
        <div className="modal-overlay" onClick={() => setShowVariantsModal(false)}>
          <div className="modal-content" style={{ maxWidth: 680, width: '95%' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-title" style={{ marginBottom: 4 }}>Variants — {variantsProduct.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 20 }}>Base SKU: {variantsProduct.sku}</p>

            {/* Add / Edit form */}
            <form onSubmit={handleSaveVariant} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4, fontSize: 10 }}>Variant SKU *</label>
                <input className="input" required value={variantForm.sku} onChange={e => setVariantForm(p => ({ ...p, sku: e.target.value }))} placeholder="RHL-RED-S" />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4, fontSize: 10 }}>Size</label>
                <input className="input" value={variantForm.size} onChange={e => setVariantForm(p => ({ ...p, size: e.target.value }))} placeholder="S / M / L / XL" />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4, fontSize: 10 }}>Color</label>
                <input className="input" value={variantForm.color} onChange={e => setVariantForm(p => ({ ...p, color: e.target.value }))} placeholder="Red" />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4, fontSize: 10 }}>Stock</label>
                <input className="input" type="number" value={variantForm.stock_quantity} onChange={e => setVariantForm(p => ({ ...p, stock_quantity: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 4, fontSize: 10 }}>Price (EGP)</label>
                <input className="input" type="number" step="0.01" value={variantForm.price} onChange={e => setVariantForm(p => ({ ...p, price: e.target.value }))} placeholder="Optional" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  {editingVariant ? 'Update' : '+ Add'}
                </button>
                {editingVariant && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingVariant(null); setVariantForm({ sku: '', size: '', color: '', stock_quantity: '', price: '' }); }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            {/* Variants list */}
            {variants.length === 0 ? (
              <p style={{ color: 'var(--color-text-dim)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No variants yet — add the first one above.</p>
            ) : (
              <div className="table-container" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>SKU</th><th>Size</th><th>Color</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Price</th><th></th></tr>
                  </thead>
                  <tbody>
                    {variants.map(v => (
                      <tr key={v.id}>
                        <td className="font-mono" style={{ fontSize: 12 }}>{v.sku}</td>
                        <td>{v.size || '—'}</td>
                        <td>{v.color || '—'}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{v.stock_quantity}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{v.price ? formatEGP(v.price) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEditVariant(v)}>Edit</button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleDeleteVariant(v.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowVariantsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Barcode Variant Selection Modal */}
      {showBulkBarcodeModal && (
        <div className="modal-overlay" onClick={() => setShowBulkBarcodeModal(false)}>
          <div className="modal-content" style={{ maxWidth: 700, width: '95%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-title" style={{ marginBottom: 4 }}>Select Variants for Barcodes</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
              Choose which size / color variants to include in the barcode labels.
            </p>

            {/* Copies controls */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
              padding: '12px 14px', marginBottom: 18, borderRadius: 8,
              background: 'var(--color-bg-inset)', border: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="text-label" style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Copies per label</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="200"
                  value={bulkCopies}
                  disabled={bulkUseStock}
                  onChange={e => setBulkCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  style={{ width: 80, opacity: bulkUseStock ? 0.5 : 1 }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={bulkUseStock} onChange={e => setBulkUseStock(e.target.checked)} />
                <span>Match stock qty <span style={{ color: 'var(--color-text-dim)' }}>(one label per unit)</span></span>
              </label>
            </div>

            {bulkBarcodeProducts.length > 4 && (
              <input
                className="input"
                placeholder="Filter products by name or SKU…"
                value={bulkSearch}
                onChange={e => setBulkSearch(e.target.value)}
                style={{ marginBottom: 14 }}
              />
            )}

            {bulkBarcodeProducts
              .filter(product => {
                const q = bulkSearch.trim().toLowerCase();
                if (!q) return true;
                return product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q);
              })
              .map(product => (
              <div key={product.id} style={{ marginBottom: 20, padding: '16px', background: 'var(--color-bg-inset)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{product.name}</span>
                    <span className="font-mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-dim)' }}>{product.sku}</span>
                  </div>
                  {product.variants.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 10px', fontSize: 10 }}
                      onClick={() => toggleAllVariantsForProduct(product.id, product.variants.map(v => v.id))}
                    >
                      {(bulkVariantSelections[product.id] || []).length === product.variants.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {product.variants.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    No variants — will use product-level barcode.{' '}
                    <button
                      type="button"
                      onClick={() => { setShowBulkBarcodeModal(false); openVariants(product); }}
                      style={{ background: 'none', border: 'none', color: 'var(--color-primary, #4f46e5)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline', fontStyle: 'normal' }}
                    >
                      Add variants
                    </button>
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {product.variants.map(v => {
                      const isSelected = (bulkVariantSelections[product.id] || []).includes(v.id);
                      const label = [v.size, v.color].filter(Boolean).join(' / ') || v.sku;
                      return (
                        <label
                          key={v.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? 'var(--color-bg-active)' : 'var(--color-bg-surface)',
                            border: `1px solid ${isSelected ? 'var(--color-primary, #4f46e5)' : 'var(--color-border)'}`,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBulkVariant(product.id, v.id)}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                            <div className="font-mono" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                              {v.sku} · Stock: {v.stock_quantity}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkBarcodeModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleBulkPrintBarcodes} disabled={bulkLabelTotal === 0}>
                🖨️ Generate &amp; Print {bulkLabelTotal} {bulkLabelTotal === 1 ? 'Label' : 'Labels'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode View Modal */}
      {showBarcodeModal && selectedProductForBarcode && (() => {
        const pvs = selectedProductForBarcode.product_variants || [];
        const activeVariant = pvs.find(v => v.id === selectedBarcodeVariant);
        const displayBarcode = activeVariant ? (activeVariant.barcode || activeVariant.sku) : (selectedProductForBarcode.barcode || selectedProductForBarcode.sku);
        const displaySku = activeVariant ? activeVariant.sku : selectedProductForBarcode.sku;
        const variantLabel = activeVariant ? [activeVariant.size, activeVariant.color].filter(Boolean).join(' / ') : '';
        return (
        <div className="modal-overlay" onClick={closeBarcodeModal}>
          <div className="modal-content" style={{ ...STYLES.barcodeModalContent, maxWidth: 440 }} onClick={handleModalContentClick}>
            <h2 className="text-title" style={STYLES.barcodeModalTitle}>Product Barcode</h2>
            <p style={STYLES.barcodeModalProduct}>{selectedProductForBarcode.name}</p>
            {variantLabel && <p style={{ fontSize: 12, color: 'var(--color-primary, #4f46e5)', marginBottom: 4 }}>{variantLabel}</p>}
            <p className="font-mono" style={STYLES.barcodeModalMeta}>
              SKU: {displaySku} | Barcode: {displayBarcode}
            </p>

            {/* Variant selector */}
            {pvs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="text-label" style={{ display: 'block', fontSize: 10, marginBottom: 6, color: 'var(--color-text-dim)' }}>Select Variant</label>
                <select
                  className="input"
                  value={selectedBarcodeVariant}
                  onChange={e => setSelectedBarcodeVariant(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">Product Level ({selectedProductForBarcode.sku})</option>
                  {pvs.map(v => (
                    <option key={v.id} value={v.id}>
                      {[v.size, v.color].filter(Boolean).join(' / ') || v.sku} — SKU: {v.sku} · Stock: {v.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {pvs.length === 0 && (
              <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-dim)' }}>
                No size / color variants for this product yet.{' '}
                <button
                  type="button"
                  onClick={openVariantsFromBarcode}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary, #4f46e5)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}
                >
                  Add variants
                </button>
              </div>
            )}
            
            <div style={STYLES.barcodeImageWrapper}>
              <img
                src={`/api/inventory/${selectedProductForBarcode.id}/barcode?format=png${activeVariant ? `&variant_id=${activeVariant.id}` : ''}`}
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
        );
      })()}
    </DashboardShell>
  );
}

const STYLES = {
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' },
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
  modalGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
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
