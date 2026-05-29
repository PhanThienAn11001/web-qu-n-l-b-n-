const API_URL = 'https://ang-xce6.onrender.com';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const token = localStorage.getItem('kho-viet-token');
  const response = await fetch(`${API_URL}/api${path}`, {
    headers: {
      ...jsonHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Không thể xử lý yêu cầu');
  }

  return payload;
}

export function login(data) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getDashboard() {
  return request('/dashboard');
}

export function importStock(data) {
  return request('/inventory/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function exportStock(data) {
  return request('/inventory/export', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function cancelExportStock(data) {
  return request('/inventory/cancel-export', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function distributeStock(data) {
  return request('/inventory/distribute', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateProductImage(id, image) {
  return request(`/products/${id}/image`, {
    method: 'PUT',
    body: JSON.stringify({ image }),
  });
}

export function deleteProduct(id) {
  return request(`/products/${id}`, {
    method: 'DELETE',
  });
}

export function createShop(data) {
  return request('/shops', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateShop(id, data) {
  return request(`/shops/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteShop(id) {
  return request(`/shops/${id}`, {
    method: 'DELETE',
  });
}

export function deleteShopProduct(shopId, productId) {
  return request(`/shops/${shopId}/products/${productId}`, {
    method: 'DELETE',
  });
}

export function createUser(data) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateUser(id, data) {
  return request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateMyAvatar(avatar) {
  return request('/me/avatar', {
    method: 'PUT',
    body: JSON.stringify({ avatar }),
  });
}

export function deleteUser(id) {
  return request(`/users/${id}`, {
    method: 'DELETE',
  });
}
