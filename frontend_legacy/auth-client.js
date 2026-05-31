// REHLA Unified Authentication & API Client Helper
// Supports both server-served pages and local file:// protocols.

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';

const Auth = {
  getToken() {
    return localStorage.getItem('rehla_token');
  },

  getUser() {
    try {
      const user = localStorage.getItem('rehla_user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem('rehla_token', token);
    localStorage.setItem('rehla_user', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('rehla_token');
    localStorage.removeItem('rehla_user');
    // Find login page path relatively
    window.location.href = '../management_engine_login/code.html';
  },

  // Check auth and redirect if needed
  checkAuth(allowedRoles = []) {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user) {
      // Relative path to login screen depends on where we are
      const currentPath = window.location.pathname;
      if (!currentPath.includes('management_engine_login')) {
        window.location.href = '../management_engine_login/code.html';
      }
      return false;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      alert(`Unauthorized. Your role (${user.role.toUpperCase()}) cannot access this view.`);
      // Redirect to their default view
      this.redirectToRoleDefault(user.role);
      return false;
    }

    // Set user profile indicator in header if it exists
    document.addEventListener('DOMContentLoaded', () => {
      const headerTitle = document.querySelector('header h1, header h2');
      // Set user name/avatar where applicable
      const profileName = document.querySelector('header h1');
      if (profileName && user.role === 'driver') {
        profileName.textContent = user.name;
      }
      
      // Inject unified sidebar logic to link pages correctly if side nav exists
      const sidebarLinks = document.querySelectorAll('aside nav a, nav ul li a, sidebar-nav a');
      sidebarLinks.forEach(link => {
        const text = link.textContent.trim().toLowerCase();
        if (text.includes('dashboard')) link.href = '../main_financial_dashboard/code.html';
        else if (text.includes('pos')) link.href = '../checkout_receipt/code.html';
        else if (text.includes('inventory')) link.href = '../inventory_management/code.html';
        else if (text.includes('invoices')) link.href = '../invoice_management/code.html';
        else if (text.includes('expenses')) link.href = '../expenses_management/code.html';
        else if (text.includes('delivery')) link.href = '../delivery_dispatcher/code.html';
        else if (text.includes('analytics')) link.href = '../advanced_business_analytics/code.html';
        else if (text.includes('ai assistant')) link.href = '../ai_management_assistant/code.html';
        else if (text.includes('logout')) {
          link.href = '#';
          link.onclick = (e) => {
            e.preventDefault();
            Auth.logout();
          };
        }
      });
    });

    return true;
  },

  redirectToRoleDefault(role) {
    if (role === 'ceo') {
      window.location.href = '../main_financial_dashboard/code.html';
    } else if (role === 'admin') {
      window.location.href = '../main_financial_dashboard/code.html';
    } else if (role === 'worker') {
      window.location.href = '../checkout_receipt/code.html';
    } else if (role === 'driver') {
      window.location.href = '../driver_delivery_view_mobile/code.html';
    }
  },

  // Wrapped fetch that handles JWT header and base URLs automatically
  async apiRequest(endpoint, options = {}) {
    const token = this.getToken();
    
    // Set headers
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      if (response.status === 401 || response.status === 403) {
        // Expired session
        this.logout();
        throw new Error('Session expired. Please log in again.');
      }
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }
};
