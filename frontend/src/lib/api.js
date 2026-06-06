// API Client — Centralized fetch wrapper with auth
const API_BASE = '/api';

class ApiClient {
  getToken() {
    return localStorage.getItem('rehla_token');
  }

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(options.headers || {})
    };

    const config = { ...options, headers };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('rehla_token');
        localStorage.removeItem('rehla_user');
        window.location.href = '/login';
        throw new Error('Session expired.');
      }

      // Handle PDF/binary responses
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('pdf') || contentType.includes('image') || contentType.includes('csv'))) {
        if (!response.ok) throw new Error('Download failed.');
        return response.blob();
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed.');
      return data;
    } catch (err) {
      console.error(`[API] ${endpoint}:`, err);
      throw err;
    }
  }

  get(endpoint) { return this.request(endpoint); }
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
  patch(endpoint, body) { return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }

  // Download helpers
  async downloadBlob(endpoint, filename) {
    const blob = await this.request(endpoint);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
