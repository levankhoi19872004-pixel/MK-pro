const DB_NAME = 'mkpro-mobile-offline';
const DB_VERSION = 1;
const STORE_NAME = 'operations';
const DEVICE_KEY = 'mkpro_mobile_device_id';

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `device:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'operationId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được kho offline'));
  });
}

async function transaction(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Lỗi thao tác kho offline'));
      tx.onabort = () => reject(tx.error || new Error('Thao tác kho offline bị hủy'));
    });
  } finally {
    db.close();
  }
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Lỗi IndexedDB'));
  });
}

export function isNetworkError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return !navigator.onLine
    || error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('load failed');
}

export async function queueOperation(type, payload = {}, options = {}) {
  const operationId = String(options.operationId || payload.idempotencyKey || `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`);
  const operation = {
    operationId,
    type,
    payload: { ...payload, idempotencyKey: payload.idempotencyKey || operationId },
    deviceId: deviceId(),
    clientCreatedAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: ''
  };
  await transaction('readwrite', (store) => store.put(operation));
  window.dispatchEvent(new CustomEvent('mkpro:offline-queued', { detail: operation }));
  return operation;
}

export async function listOperations({ statuses = [], limit = 100 } = {}) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const all = await requestPromise(store.getAll());
    const allowed = new Set((Array.isArray(statuses) ? statuses : []).map((value) => String(value || '').trim()).filter(Boolean));
    return all
      .filter((row) => !allowed.size || allowed.has(String(row.status || 'pending')))
      .sort((a, b) => String(a.clientCreatedAt).localeCompare(String(b.clientCreatedAt)))
      .slice(0, Math.max(1, Number(limit || 100)));
  } finally {
    db.close();
  }
}

export async function pendingOperations(limit = 100) {
  const rows = await listOperations({ statuses: ['pending', 'failed'], limit });
  return rows.filter((row) => Number(row.attempts || 0) < Number(row.maxAttempts || 8));
}

async function removeOperations(ids = []) {
  if (!ids.length) return;
  await transaction('readwrite', (store) => ids.forEach((id) => store.delete(id)));
}

async function markResults(results = []) {
  const pendingResults = results.filter((result) => result.status !== 'completed');
  if (!pendingResults.length) return;

  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const result of pendingResults) {
        const request = store.get(result.operationId);
        request.onsuccess = () => {
          const current = request.result;
          if (!current) return;
          current.status = result.status || 'failed';
          current.attempts = Number(current.attempts || 0) + 1;
          current.lastError = result.message || result.error || '';
          current.updatedAt = new Date().toISOString();
          store.put(current);
        };
        request.onerror = () => tx.abort();
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Không cập nhật được trạng thái đồng bộ'));
      tx.onabort = () => reject(tx.error || new Error('Cập nhật trạng thái đồng bộ bị hủy'));
    });
  } finally {
    db.close();
  }
}

export async function syncPending(options = {}) {
  if (!navigator.onLine) return { skipped: true, reason: 'OFFLINE' };
  const operations = await pendingOperations(options.limit || 100);
  if (!operations.length) return { skipped: true, reason: 'EMPTY' };

  const response = await fetch('/api/mobile/sync/batch', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId()
    },
    body: JSON.stringify({ deviceId: deviceId(), operations })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Không đồng bộ được dữ liệu offline');

  const completedIds = (data.results || []).filter((row) => row.status === 'completed').map((row) => row.operationId);
  await removeOperations(completedIds);
  await markResults(data.results || []);
  window.dispatchEvent(new CustomEvent('mkpro:offline-synced', { detail: data }));
  return data;
}

export function startAutoSync() {
  window.addEventListener('online', () => syncPending().catch(() => null));
  if (navigator.onLine) setTimeout(() => syncPending().catch(() => null), 1000);
}

window.MobileOfflineSync = { queueOperation, syncPending, pendingOperations, listOperations, isNetworkError, startAutoSync };
startAutoSync();
