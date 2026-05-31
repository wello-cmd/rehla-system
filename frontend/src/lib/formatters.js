// Formatters — NFR-US-06 (EGP with commas)

/**
 * Format a number as Egyptian Pounds (NFR-US-06)
 * @param {number} amount
 * @returns {string} e.g. "EGP 1,234.00"
 */
export function formatEGP(amount) {
  if (amount === null || amount === undefined) return 'EGP 0.00';
  return `EGP ${Number(amount).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a number with commas
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString();
}

/**
 * Format a date string
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format a date with time
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get relative time (e.g., "2 hours ago")
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Status color mapping
 */
export function getStatusColor(status) {
  const map = {
    paid: 'success', delivered: 'success', approved: 'success', active: 'success', Paid: 'success',
    pending: 'warning', assigned: 'warning', Draft: 'warning', processing: 'warning',
    failed: 'error', rejected: 'error', Overdue: 'error', cancelled: 'error', inactive: 'error',
    out_for_delivery: 'info', Sent: 'info', confirmed: 'info'
  };
  return map[status] || 'neutral';
}
