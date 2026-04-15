/* ============================================
   WA Review Tool — API Client
   Fetch wrapper with JWT Authorization header,
   401/403 handling
   ============================================ */

const ApiClient = (() => {
  const API_BASE_URL = (window.WA_CONFIG && window.WA_CONFIG.API_BASE_URL) || '/api';

  async function request(method, path, body) {
    const token = typeof Auth !== 'undefined' ? Auth.getIdToken() : null;

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const options = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const url = API_BASE_URL.replace(/\/+$/, '') + path;

    const response = await fetch(url, options);

    // Handle auth errors — redirect to login
    if (response.status === 401 || response.status === 403) {
      if (typeof Auth !== 'undefined') {
        Auth.logout();
      }
      throw new Error('ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบใหม่');
    }

    // Parse JSON response
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = (data && data.message) || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      throw new Error(message);
    }

    return data;
  }

  function get(path) {
    return request('GET', path);
  }

  function post(path, body) {
    return request('POST', path, body);
  }

  function put(path, body) {
    return request('PUT', path, body);
  }

  function del(path) {
    return request('DELETE', path);
  }

  return {
    request,
    get,
    post,
    put,
    del,
  };
})();
