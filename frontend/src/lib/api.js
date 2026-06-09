const API_BASE = '/api';

class ApiClient {
  getToken()        { return localStorage.getItem('rehla_token'); }
  getRefreshToken() { return localStorage.getItem('rehla_refresh_token'); }

  async _refreshToken() {
    const refresh_token = this.getRefreshToken();
    if (!refresh_token) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('rehla_token', data.token);
      localStorage.setItem('rehla_refresh_token', data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  _clearSession() {
    localStorage.removeItem('rehla_token');
    localStorage.removeItem('rehla_refresh_token');
    localStorage.removeItem('rehla_user');
    window.location.href = '/login';
  }

  async request(endpoint, options = {}, _isRetry = false) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

      // 401 = no token, 403 = expired/invalid token — both warrant a refresh attempt
      if ((response.status === 401 || response.status === 403) && !_isRetry) {
        const refreshed = await this._refreshToken();
        if (refreshed) return this.request(endpoint, options, true);
        this._clearSession();
        throw new Error('Session expired.');
      }

      // 403 on the retry = genuinely forbidden (wrong role), not a token issue
      if (response.status === 401 || response.status === 403) {
        this._clearSession();
        throw new Error('Access denied.');
      }

      // Binary / download responses
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('pdf') || contentType.includes('image') || contentType.includes('csv')) {
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

  get(endpoint)          { return this.request(endpoint); }
  post(endpoint, body)   { return this.request(endpoint, { method: 'POST',   body: JSON.stringify(body) }); }
  put(endpoint, body)    { return this.request(endpoint, { method: 'PUT',    body: JSON.stringify(body) }); }
  patch(endpoint, body)  { return this.request(endpoint, { method: 'PATCH',  body: JSON.stringify(body) }); }
  delete(endpoint)       { return this.request(endpoint, { method: 'DELETE' }); }

  async downloadBlob(endpoint, filename) {
    const blob = await this.request(endpoint);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
