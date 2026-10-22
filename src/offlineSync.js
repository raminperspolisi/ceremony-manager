import { supabase, SUPABASE_URL } from './supabaseClient';

const DATABASE_NAME = 'ceremony-manager-offline';
const DATABASE_VERSION = 1;
const CACHE_PAGE_SIZE = 1000;
const READ_TIMEOUT_MS = 8000;
const PENDING_ID_PREFIX = 'offline:';

let databasePromise;
let activeUserId = null;
let syncPromise = null;
let syncStatus = navigator.onLine ? 'online' : 'offline';
const statusListeners = new Set();

const notifyStatus = (nextStatus) => {
  syncStatus = nextStatus;
  statusListeners.forEach((listener) => listener(nextStatus));
  window.dispatchEvent(new CustomEvent('offline-sync-status', { detail: nextStatus }));
};

const openDatabase = () => {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('ذخیره‌سازی آفلاین در این مرورگر پشتیبانی نمی‌شود.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const records = database.createObjectStore('records', { keyPath: 'key' });
      records.createIndex('by-user-table', ['userId', 'table']);
      records.createIndex('by-user-table-id', ['userId', 'table', 'id'], { unique: true });
      const mutations = database.createObjectStore('mutations', { keyPath: 'seq', autoIncrement: true });
      mutations.createIndex('by-user', 'userId');
      const idMappings = database.createObjectStore('idMappings', { keyPath: 'key' });
      idMappings.createIndex('by-user', 'userId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('بازکردن حافظهٔ آفلاین ناموفق بود.'));
    };
  });
  return databasePromise;
};

const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('خواندن حافظهٔ آفلاین ناموفق بود.'));
});

const getStore = async (name, mode = 'readonly') => {
  const database = await openDatabase();
  const transaction = database.transaction(name, mode);
  return { store: transaction.objectStore(name), transaction };
};

const getUserId = async () => {
  if (activeUserId) return activeUserId;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  activeUserId = data.session?.user?.id || null;
  if (!activeUserId) throw new Error('برای استفاده از داده‌های آفلاین ابتدا باید آنلاین وارد حساب شوید.');
  return activeUserId;
};

const makeCacheKey = (userId, table, id) => `${userId}:${table}:${String(id)}`;
const makeMappingKey = (userId, table, localId) => `${userId}:${table}:${String(localId)}`;
const isPendingId = (id) => String(id).startsWith(PENDING_ID_PREFIX);
const makePendingId = () => `${PENDING_ID_PREFIX}${crypto.randomUUID()}`;
const isNetworkError = (error) =>
  !navigator.onLine ||
  error?.name === 'TypeError' ||
  error?.name === 'AbortError' ||
  /abort|failed to fetch|network|offline|load failed|fetch failed|timed? ?out/i.test(error?.message || '');

const updateNetworkStatus = async () => {
  if (syncPromise) return;
  if (!navigator.onLine) {
    notifyStatus('offline-pending');
    return;
  }

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 4000);
    await fetch(SUPABASE_URL, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    notifyStatus('online');
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    notifyStatus('offline-pending');
  }
};

const getMappings = async (userId) => {
  const { store } = await getStore('idMappings');
  return requestResult(store.index('by-user').getAll(userId));
};

const localizeRows = async (userId, table, rows) => {
  const mappings = await getMappings(userId);
  const localIdByServerId = new Map(
    mappings.filter((mapping) => mapping.table === table)
      .map((mapping) => [String(mapping.serverId), mapping.localId]),
  );
  return rows.map((row) => {
    const localId = localIdByServerId.get(String(row.id));
    return localId === undefined ? row : { ...row, id: localId };
  });
};

const cacheRows = async (userId, table, rows) => {
  if (!rows?.length) return;
  const localizedRows = await localizeRows(userId, table, rows);
  const { store, transaction } = await getStore('records', 'readwrite');
  for (const row of localizedRows) {
    if (row.id === undefined || row.id === null) continue;
    const key = makeCacheKey(userId, table, row.id);
    const existing = await requestResult(store.get(key));
    if (existing?.pending) continue;
    store.put({
      key,
      userId,
      table,
      id: row.id,
      serverId: row.id,
      value: { ...existing?.value, ...row },
      pending: false,
      deleted: false,
    });
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('ذخیرهٔ دادهٔ آفلاین ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error || new Error('ذخیرهٔ دادهٔ آفلاین لغو شد.'));
  });
};

const pruneCachedTable = async (userId, table, serverRows) => {
  const localizedRows = await localizeRows(userId, table, serverRows);
  const currentIds = new Set(localizedRows.map((row) => String(row.id)));
  const { store, transaction } = await getStore('records', 'readwrite');
  const entries = await requestResult(store.index('by-user-table').getAll([userId, table]));
  for (const entry of entries) {
    if (!entry.pending && !currentIds.has(String(entry.id))) store.delete(entry.key);
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('همگام‌سازی حافظهٔ محلی ناموفق بود.'));
  });
};

const getCachedEntries = async (userId, table) => {
  const { store } = await getStore('records');
  return requestResult(store.index('by-user-table').getAll([userId, table]));
};

const getCachedRows = async (userId, table) => {
  const entries = await getCachedEntries(userId, table);
  return entries.filter((entry) => !entry.deleted).map((entry) => entry.value);
};

const matchesFilter = (row, filter) => {
  const value = row[filter.column];
  if (filter.operator === 'in') return filter.value.some((item) => String(item) === String(value));
  if (filter.operator === 'notNull') return value !== null && value !== undefined;
  if (filter.operator === 'isNull') return value === null || value === undefined;
  return String(value) === String(filter.value);
};

const filterRows = (rows, filters = []) => rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));

const projectColumns = (rows, columns) => {
  if (!columns || columns.trim() === '*') return rows;
  const names = columns.split(',').map((column) => column.trim().replace(/^"|"$/g, ''));
  return rows.map((row) => Object.fromEntries(names.filter((name) => name in row).map((name) => [name, row[name]])));
};

const sortRows = (rows, orderBy, ascending = true) => {
  if (!orderBy) return rows;
  const direction = ascending ? 1 : -1;
  return rows.sort((first, second) => {
    const a = first[orderBy];
    const b = second[orderBy];
    if (a === b) return 0;
    if (a === null || a === undefined) return -direction;
    if (b === null || b === undefined) return direction;
    return (a < b ? -1 : 1) * direction;
  });
};

const buildQuery = (table, { columns = '*', filters = [], orderBy, ascending = true, limit, offset } = {}) => {
  let query = supabase.from(table).select(columns);
  for (const filter of filters) {
    if (filter.operator === 'in') query = query.in(filter.column, filter.value);
    else if (filter.operator === 'notNull') query = query.not(filter.column, 'is', null);
    else if (filter.operator === 'isNull') query = query.is(filter.column, null);
    else query = query.eq(filter.column, filter.value);
  }
  if (orderBy) query = query.order(orderBy, { ascending });
  if (offset !== undefined && limit) query = query.range(offset, offset + limit - 1);
  else if (limit) query = query.limit(limit);
  return query;
};

export const setOfflineUser = (userId) => {
  activeUserId = userId || null;
  if (!activeUserId) {
    notifyStatus(navigator.onLine ? 'online' : 'offline');
    return;
  }
  notifyStatus(navigator.onLine ? 'online' : 'offline');
  if (navigator.onLine) syncPendingMutations();
};

export const getOfflineSyncStatus = () => syncStatus;
export const subscribeOfflineSyncStatus = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

export async function readTable(table, options = {}) {
  try {
    const userId = await getUserId();
    if (navigator.onLine) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
      let result;
      try {
        result = await buildQuery(table, options).abortSignal(controller.signal);
      } catch (error) {
        result = { data: null, error };
      } finally {
        window.clearTimeout(timeoutId);
      }
      const { data, error } = result;
      if (!error) {
        await cacheRows(userId, table, data || []);
        const cachedEntries = await getCachedEntries(userId, table);
        if (cachedEntries.some((entry) => entry.pending)) {
          let rows = cachedEntries
            .filter((entry) => !entry.deleted)
            .map((entry) => entry.value);
          rows = filterRows(rows, options.filters);
          sortRows(rows, options.orderBy, options.ascending);
          if (options.offset !== undefined && options.limit) rows = rows.slice(options.offset, options.offset + options.limit);
          else if (options.limit) rows = rows.slice(0, options.limit);
          return { data: projectColumns(rows, options.columns), error: null, offline: false };
        }
        return { data: data || [], error: null, offline: false };
      }
      if (!isNetworkError(error)) return { data: null, error };
      notifyStatus('offline-pending');
    }

    let rows = await getCachedRows(userId, table);
    rows = filterRows(rows, options.filters);
    sortRows(rows, options.orderBy, options.ascending);
    if (options.offset !== undefined && options.limit) rows = rows.slice(options.offset, options.offset + options.limit);
    else if (options.limit) rows = rows.slice(0, options.limit);
    return { data: projectColumns(rows, options.columns), error: null, offline: true };
  } catch (error) {
    return { data: null, error: { message: error.message } };
  }
}

const resolveServerId = async (userId, table, id) => {
  const { store } = await getStore('idMappings');
  const mapping = await requestResult(store.get(makeMappingKey(userId, table, id)));
  return mapping?.serverId ?? id;
};

const rewriteReferences = async (userId, table, value) => {
  const rewritten = { ...value };
  for (const [key, id] of Object.entries(rewritten)) {
    if (key === 'id' || key.endsWith('_id')) rewritten[key] = await resolveServerId(userId, tableForReference(key, table), id);
  }
  return rewritten;
};

const tableForReference = (key, fallback) => {
  if (key === 'customer_id') return 'customers';
  return fallback;
};

const rewriteFilters = async (userId, table, filters) => Promise.all(filters.map(async (filter) => ({
  ...filter,
  value: filter.operator === 'in'
    ? await Promise.all(filter.value.map((id) => resolveServerId(userId, tableForReference(filter.column, table), id)))
    : await resolveServerId(userId, tableForReference(filter.column, table), filter.value),
})));

const putLocalRows = async (userId, table, rows, { pending = false } = {}) => {
  const { store, transaction } = await getStore('records', 'readwrite');
  for (const row of rows) {
    const key = makeCacheKey(userId, table, row.id);
    const existing = await requestResult(store.get(key));
    store.put({
      key,
      userId,
      table,
      id: row.id,
      serverId: existing?.serverId ?? (isPendingId(row.id) ? null : row.id),
      value: { ...existing?.value, ...row },
      pending,
      deleted: false,
    });
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('ذخیرهٔ محلی ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error || new Error('ذخیرهٔ محلی لغو شد.'));
  });
};

const enqueueMutation = async (userId, mutation) => {
  const { store, transaction } = await getStore('mutations', 'readwrite');
  store.add({ ...mutation, userId, createdAt: Date.now() });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('ثبت تغییر برای همگام‌سازی ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error || new Error('ثبت تغییر برای همگام‌سازی لغو شد.'));
  });
  notifyStatus(navigator.onLine ? 'pending' : 'offline-pending');
};

const saveOfflineInsert = async (userId, table, rows) => {
  const localRows = rows.map((row) => ({
    ...row,
    id: row.id ?? makePendingId(),
    offline_sync_id: row.offline_sync_id || crypto.randomUUID(),
  }));
  for (const row of localRows) {
    await putLocalRows(userId, table, [row], { pending: true });
    await enqueueMutation(userId, { type: 'insert', table, row });
  }
  return localRows;
};

export async function insertRows(table, rows) {
  const userId = await getUserId();
  if (!(await mustQueueBehindPendingMutations(userId))) {
    const preparedRows = await Promise.all(rows.map((row) => rewriteReferences(userId, table, row)));
    const { data, error } = await supabase.from(table).insert(preparedRows).select('*');
    if (!error) {
      await cacheRows(userId, table, data || []);
      return { data, error: null, offline: false };
    }
    if (!isNetworkError(error)) return { data: null, error };
  }

  try {
    const data = await saveOfflineInsert(userId, table, rows);
    notifyStatus('offline-pending');
    if (navigator.onLine) void syncPendingMutations();
    return { data, error: null, offline: true };
  } catch (error) {
    return { data: null, error: { message: error.message } };
  }
}

const updateCachedRows = async (userId, table, filters, updates, { pending = false } = {}) => {
  const { store, transaction } = await getStore('records', 'readwrite');
  const entries = await requestResult(store.index('by-user-table').getAll([userId, table]));
  const changed = [];
  for (const entry of entries) {
    if (entry.deleted || !filters.every((filter) => matchesFilter(entry.value, filter))) continue;
    const value = { ...entry.value, ...updates };
    changed.push(value);
    store.put({ ...entry, value, pending });
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('به‌روزرسانی محلی ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error || new Error('به‌روزرسانی محلی لغو شد.'));
  });
  return changed;
};

export async function updateRows(table, updates, filters) {
  const userId = await getUserId();
  if (!(await mustQueueBehindPendingMutations(userId))) {
    const serverFilters = await rewriteFilters(userId, table, filters);
    const serverUpdates = await rewriteReferences(userId, table, updates);
    let query = supabase.from(table).update(serverUpdates);
    for (const filter of serverFilters) {
      if (filter.operator === 'in') query = query.in(filter.column, filter.value);
      else query = query.eq(filter.column, filter.value);
    }
    const { data, error } = await query.select('*');
    if (!error) {
      await updateCachedRows(userId, table, filters, updates);
      await cacheRows(userId, table, data || []);
      return { data, error: null, offline: false };
    }
    if (!isNetworkError(error)) return { data: null, error };
  }

  try {
    const changed = await updateCachedRows(userId, table, filters, updates, { pending: true });
    await enqueueMutation(userId, { type: 'update', table, updates, filters });
    if (navigator.onLine) void syncPendingMutations();
    return { data: changed, error: null, offline: true };
  } catch (error) {
    return { data: null, error: { message: error.message } };
  }
}

const markDeletedRows = async (userId, table, filters, deleted = true, pending = deleted) => {
  const { store, transaction } = await getStore('records', 'readwrite');
  const entries = await requestResult(store.index('by-user-table').getAll([userId, table]));
  for (const entry of entries) {
    if (filters.every((filter) => matchesFilter(entry.value, filter))) {
      store.put({ ...entry, deleted, pending });
    }
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('حذف محلی ناموفق بود.'));
    transaction.onabort = () => reject(transaction.error || new Error('حذف محلی لغو شد.'));
  });
};

const purgeDeletedRows = async (userId, table, filters) => {
  const { store, transaction } = await getStore('records', 'readwrite');
  const entries = await requestResult(store.index('by-user-table').getAll([userId, table]));
  for (const entry of entries) {
    if (entry.deleted && filters.every((filter) => matchesFilter(entry.value, filter))) {
      store.delete(entry.key);
    }
  }
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('پاک‌کردن رکورد حذف‌شده ناموفق بود.'));
  });
};

export async function deleteRows(table, filters) {
  const userId = await getUserId();
  if (!(await mustQueueBehindPendingMutations(userId))) {
    const serverFilters = await rewriteFilters(userId, table, filters);
    let query = supabase.from(table).delete();
    for (const filter of serverFilters) {
      if (filter.operator === 'in') query = query.in(filter.column, filter.value);
      else query = query.eq(filter.column, filter.value);
    }
    const { error } = await query;
    if (!error) {
      await markDeletedRows(userId, table, filters, true, false);
      await purgeDeletedRows(userId, table, filters);
      return { data: null, error: null, offline: false };
    }
    if (!isNetworkError(error)) return { data: null, error };
  }

  try {
    await markDeletedRows(userId, table, filters);
    await enqueueMutation(userId, { type: 'delete', table, filters });
    if (navigator.onLine) void syncPendingMutations();
    return { data: null, error: null, offline: true };
  } catch (error) {
    return { data: null, error: { message: error.message } };
  }
}

const removeMutation = async (seq) => {
  const { store, transaction } = await getStore('mutations', 'readwrite');
  store.delete(seq);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('پاک‌کردن صف همگام‌سازی ناموفق بود.'));
  });
};

const reconcileInsertedRow = async (userId, table, localRow, serverRow) => {
  const localId = localRow.id;
  const { store, transaction } = await getStore('idMappings', 'readwrite');
  store.put({
    key: makeMappingKey(userId, table, localId),
    userId,
    table,
    localId,
    serverId: serverRow.id,
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('ذخیرهٔ شناسهٔ همگام‌شده ناموفق بود.'));
  });

  const { store: recordStore, transaction: recordTransaction } = await getStore('records', 'readwrite');
  const recordKey = makeCacheKey(userId, table, localId);
  const entry = await requestResult(recordStore.get(recordKey));
  if (entry) {
    recordStore.put({
      ...entry,
      serverId: serverRow.id,
      pending: false,
      value: { ...entry.value, ...serverRow, id: localId },
    });
  }
  await new Promise((resolve, reject) => {
    recordTransaction.oncomplete = resolve;
    recordTransaction.onerror = () => reject(recordTransaction.error || new Error('به‌روزرسانی رکورد همگام‌شده ناموفق بود.'));
  });
};

const getPendingMutations = async (userId) => {
  const { store } = await getStore('mutations');
  return requestResult(store.index('by-user').getAll(userId));
};

async function mustQueueBehindPendingMutations(userId) {
  if (!navigator.onLine) return true;
  if (!(await getPendingMutations(userId)).length) return false;
  await syncPendingMutations();
  return (await getPendingMutations(userId)).length > 0;
}

export async function warmOfflineCache() {
  const tables = ['customers', 'ceremonies', 'events', 'inventory', 'quotations', 'invoices'];
  const failures = [];
  await Promise.all(tables.map(async (table) => {
    const serverRows = [];
    for (let offset = 0; ; offset += CACHE_PAGE_SIZE) {
      const result = await readTable(table, {
        orderBy: 'id',
        ascending: true,
        offset,
        limit: CACHE_PAGE_SIZE,
      });
      if (result.error) {
        failures.push(`${table}: ${result.error.message}`);
        return;
      }
      if (result.offline) return;
      serverRows.push(...(result.data || []));
      if ((result.data || []).length < CACHE_PAGE_SIZE) {
        await pruneCachedTable(await getUserId(), table, serverRows);
        return;
      }
    }
  }));
  if (failures.length) throw new Error(`ذخیرهٔ آفلاین بعضی اطلاعات ناموفق بود: ${failures.join('؛ ')}`);
  window.dispatchEvent(new Event('offline-data-updated'));
}

const applyMutation = async (userId, mutation) => {
  if (mutation.type === 'insert') {
    const row = await rewriteReferences(userId, mutation.table, mutation.row);
    const localId = row.id;
    row.offline_sync_id ||= crypto.randomUUID();
    if (isPendingId(localId)) delete row.id;
    const { data, error } = await supabase
      .from(mutation.table)
      .upsert([row], { onConflict: 'offline_sync_id' })
      .select('*');
    if (error) throw error;
    if (data?.[0] && isPendingId(localId)) {
      await reconcileInsertedRow(userId, mutation.table, { ...mutation.row, id: localId }, data[0]);
    } else if (data?.[0]) {
      await putLocalRows(userId, mutation.table, data);
    }
    return;
  }

  const filters = await rewriteFilters(userId, mutation.table, mutation.filters);
  const updates = mutation.type === 'update'
    ? await rewriteReferences(userId, mutation.table, mutation.updates)
    : null;
  let query = mutation.type === 'delete'
    ? supabase.from(mutation.table).delete()
    : supabase.from(mutation.table).update(updates);
  for (const filter of filters) {
    if (filter.operator === 'in') query = query.in(filter.column, filter.value);
    else query = query.eq(filter.column, filter.value);
  }
  if (!filters.length) throw new Error('تغییر آفلاین بدون شرط ایمن قابل همگام‌سازی نیست.');
  const { error } = await query;
  if (error) throw error;
  if (mutation.type === 'delete') await purgeDeletedRows(userId, mutation.table, mutation.filters);
  else await updateCachedRows(userId, mutation.table, mutation.filters, mutation.updates);
};

export async function syncPendingMutations() {
  if (!navigator.onLine || syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      const userId = await getUserId();
      notifyStatus('syncing');
      while (true) {
        const mutations = await getPendingMutations(userId);
        if (!mutations.length) break;
        for (const mutation of mutations) {
          try {
            await applyMutation(userId, mutation);
            await removeMutation(mutation.seq);
          } catch (error) {
            if (isNetworkError(error)) {
              notifyStatus('offline-pending');
              return;
            }
            notifyStatus('sync-error');
            const migrationHint = /offline_sync_id|on conflict.*unique/i.test(error.message || '')
              ? ' در Supabase باید migration supabase/migrations/20261022000000_offline_sync_ids.sql اجرا شود.'
              : '';
            window.dispatchEvent(new CustomEvent('offline-sync-error', {
              detail: `همگام‌سازی ${mutation.table} ناموفق بود: ${error.message}${migrationHint}`,
            }));
            return;
          }
        }
      }
      notifyStatus('online');
      window.dispatchEvent(new Event('offline-data-updated'));
    } catch (error) {
      notifyStatus(navigator.onLine ? 'sync-error' : 'offline-pending');
      window.dispatchEvent(new CustomEvent('offline-sync-error', { detail: error.message }));
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

if (typeof window !== 'undefined') {
  const resumeSync = async (retryPending = false) => {
    if (!navigator.onLine || document.visibilityState === 'hidden') return;
    const previousStatus = syncStatus;
    await updateNetworkStatus();
    if (syncStatus === 'offline-pending' || syncStatus === 'offline') return;
    if ((retryPending || previousStatus === 'offline-pending') && activeUserId) {
      try {
        if ((await getPendingMutations(activeUserId)).length) void syncPendingMutations();
      } catch (error) {
        notifyStatus('sync-error');
        window.dispatchEvent(new CustomEvent('offline-sync-error', { detail: error.message }));
      }
    }
  };
  window.addEventListener('online', () => {
    void resumeSync(true);
  });
  window.addEventListener('focus', () => {
    void resumeSync(true);
  });
  window.addEventListener('pageshow', () => {
    void resumeSync(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void resumeSync(true);
    }
  });
  window.addEventListener('offline', () => notifyStatus('offline-pending'));
  window.addEventListener('load', () => {
    void updateNetworkStatus();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void resumeSync();
  }, 15000);
}
