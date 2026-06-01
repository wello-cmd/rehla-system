import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function PosPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [checkoutResult, setCheckoutResult] = useState(null);

  async function fetchProducts() {
    try {
      const data = await api.get('/inventory');
      setProducts(data);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!loading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [loading]);

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleBarcodeSubmit(e) {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    const term = searchTerm.trim().toUpperCase();
    const exactMatch = products.find(p => 
      p.sku?.toUpperCase() === term || 
      p.barcode === term
    );

    if (exactMatch) {
      addToCart(exactMatch);
      setSearchTerm('');
    } else {
      toast.error('Product not found!');
    }

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }

  function addToCart(product) {
    if (product.stock_quantity <= 0) {
      toast.error('Out of stock');
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock_quantity) {
        toast.error(`Only ${product.stock_quantity} available in stock`);
        return;
      }
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  }

  function updateQuantity(productId, qty) {
    const product = products.find(p => p.id === productId);
    if (qty <= 0) {
      setCart(cart.filter(item => item.id !== productId));
      return;
    }
    if (product && qty > product.stock_quantity) {
      toast.error(`Only ${product.stock_quantity} available in stock`);
      return;
    }
    setCart(cart.map(item =>
      item.id === productId ? { ...item, quantity: qty } : item
    ));
  }

  function removeFromCart(productId) {
    setCart(cart.filter(item => item.id !== productId));
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal;
  const change = amountReceived ? Math.max(0, parseFloat(amountReceived) - total) : 0;

  async function handleCheckout(e) {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    try {
      const payload = {
        items: cart.map(item => ({ id: item.id, sku: item.sku, quantity: item.quantity })),
        payment_method: paymentMethod,
        amount_received: amountReceived ? parseFloat(amountReceived) : null,
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || 'N/A',
        delivery_address: deliveryAddress.trim() || null
      };

      const result = await api.post('/pos/checkout', payload);
      setCheckoutResult(result);
      toast.success('Sale recorded successfully!');
      // Reset POS cart and fields
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setAmountReceived('');
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Checkout failed');
    }
  }

  const renderSkeleton = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
      <div className="skeleton" style={{ height: '350px' }}></div>
      <div className="skeleton" style={{ height: '350px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="POS Checkout (Register)">
      {loading ? renderSkeleton() : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {/* Products Finder catalog */}
          <div className="card" style={{ padding: '20px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>Scan Barcode or Search</p>
            <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input
                ref={searchInputRef}
                className="input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Scan barcode or type SKU..."
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="submit" className="btn btn-secondary">Enter</button>
            </form>

            <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredProducts.map(p => (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="card card-hover"
                  style={{
                    padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', cursor: 'pointer', background: 'var(--color-bg)',
                    opacity: p.stock_quantity <= 0 ? 0.5 : 1
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</p>
                    <p className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      SKU: {p.sku} · Stock: {p.stock_quantity}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p className="font-mono" style={{ fontWeight: 700 }}>{formatEGP(p.price)}</p>
                    {p.stock_quantity <= 0 && <span className="badge badge-error" style={{ fontSize: '9px', marginTop: '4px' }}>Out of stock</span>}
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', textAlign: 'center', padding: '30px' }}>No products found.</p>
              )}
            </div>
          </div>

          {/* Cart & Billing detail side pane */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>Billing Details & Cart</p>

            {/* Cart Items */}
            <div style={{ maxHeight: '180px', overflowY: 'auto', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600 }}>{item.name}</p>
                    <p className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{formatEGP(item.price)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      className="input"
                      style={{ width: '60px', padding: '6px', fontSize: '12px', textAlign: 'center' }}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 0)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '6px' }}
                      onClick={() => removeFromCart(item.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && (
                <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Cart is empty.</p>
              )}
            </div>

            {/* Total Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Total amount:</span>
              <span className="font-mono" style={{ fontSize: '20px', fontWeight: 800 }}>{formatEGP(total)}</span>
            </div>

            {/* Checkout Form */}
            <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '9px', display: 'block', marginBottom: '4px' }}>Customer Name</label>
                  <input
                    className="input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                  />
                </div>
                <div>
                  <label className="text-label" style={{ fontSize: '9px', display: 'block', marginBottom: '4px' }}>Customer Phone</label>
                  <input
                    className="input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="N/A"
                  />
                </div>
              </div>

              <div>
                <label className="text-label" style={{ fontSize: '9px', display: 'block', marginBottom: '4px' }}>Delivery Address (Optional)</label>
                <input
                  className="input"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Enter address if shipping required..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="text-label" style={{ fontSize: '9px', display: 'block', marginBottom: '4px' }}>Payment Method</label>
                  <select
                    className="input select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                {paymentMethod === 'Cash' && (
                  <div>
                    <label className="text-label" style={{ fontSize: '9px', display: 'block', marginBottom: '4px' }}>Amount Received (EGP)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="e.g. 500"
                    />
                  </div>
                )}
              </div>

              {paymentMethod === 'Cash' && amountReceived && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--color-bg)', borderRadius: '4px' }}>
                  <span style={{ fontSize: '13px' }}>Change Due:</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatEGP(change)}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={cart.length === 0}
                style={{ width: '100%', marginTop: '8px' }}
              >
                PROCEED CHECKOUT
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sale Receipt Dialog Modal */}
      {checkoutResult && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="pulse-dot" style={{ background: 'var(--color-success)', margin: '0 auto 12px' }}></div>
            <p className="text-title" style={{ color: 'var(--color-success)', marginBottom: '8px' }}>Payment Received</p>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
              Invoice <strong>{checkoutResult.invoice_number}</strong> generated successfully.
            </p>

            <div className="card" style={{ background: 'var(--color-bg)', textAlign: 'left', padding: '16px', marginBottom: '24px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Transaction Total:</span>
                <span className="font-mono" style={{ fontWeight: 700 }}>{formatEGP(checkoutResult.total)}</span>
              </div>
              {amountReceived && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Amount Received:</span>
                    <span className="font-mono">{formatEGP(parseFloat(amountReceived))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)', fontWeight: 600 }}>
                    <span>Change Returned:</span>
                    <span className="font-mono">{formatEGP(checkoutResult.change)}</span>
                  </div>
                </>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setCheckoutResult(null)}
            >
              Start New Sale
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
