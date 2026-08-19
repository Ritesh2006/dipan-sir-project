const SHEET_DB_NAME = 'OfflineVoiceSheetDB';
const SHEET_DB_VERSION = 1;
const SHEET_STORE = 'transcriptions';
const COUNTER_STORE = 'counters';

export function openSheetDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHEET_DB_NAME, SHEET_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SHEET_STORE)) {
        const store = db.createObjectStore(SHEET_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('tab', 'tab', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(COUNTER_STORE)) {
        db.createObjectStore(COUNTER_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function getNextCounter(tab) {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readwrite');
    const store = tx.objectStore(COUNTER_STORE);
    const req = store.get(tab);
    req.onsuccess = () => {
      const current = req.result ? req.result.value : 0;
      const next = current + 1;
      store.put({ key: tab, value: next });
      resolve(next);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addTranscriptionRow(rowData) {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHEET_STORE, 'readwrite');
    const store = tx.objectStore(SHEET_STORE);
    const req = store.add(rowData);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function updateTranscriptionRow(rowData) {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHEET_STORE, 'readwrite');
    const store = tx.objectStore(SHEET_STORE);
    const req = store.put(rowData);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getTranscriptionRow(id) {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHEET_STORE, 'readonly');
    const store = tx.objectStore(SHEET_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTranscriptions() {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHEET_STORE, 'readonly');
    const store = tx.objectStore(SHEET_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      rows.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getTranscriptionsByTab(tab) {
  const all = await getAllTranscriptions();
  if (!tab || tab === 'ALL') return all;
  return all.filter(r => r.tab === tab);
}

export async function getPendingSyncRows() {
  const all = await getAllTranscriptions();
  return all.filter(r => r.syncStatus === 'PENDING');
}

export async function getSheetStats() {
  const all = await getAllTranscriptions();
  const pending = all.filter(r => r.syncStatus === 'PENDING').length;
  const synced = all.filter(r => r.syncStatus === 'SYNCED').length;
  const total = all.length;
  const byTab = {
    STALL: all.filter(r => r.tab === 'STALL').length,
    SCIENCE: all.filter(r => r.tab === 'SCIENCE').length,
    LECTURE: all.filter(r => r.tab === 'LECTURE').length,
  };
  return { total, pending, synced, byTab };
}

export async function clearAllTranscriptions() {
  const db = await openSheetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SHEET_STORE, COUNTER_STORE], 'readwrite');
    tx.objectStore(SHEET_STORE).clear();
    tx.objectStore(COUNTER_STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function autoLogPhrase({ tab, transcript, speaker, organization, category }) {
  if (!transcript || !transcript.trim()) return null;

  const counter = await getNextCounter(tab);
  let prefix = tab === 'STALL' ? 'STALL' : tab === 'SCIENCE' ? 'SCI' : 'LEC';
  const submissionId = `${prefix}-${String(counter).padStart(3, '0')}`;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

  const rowData = {
    tab,
    submissionId,
    timestamp,
    name: speaker || '',
    transcript: transcript.trim(),
    syncStatus: 'PENDING',
    syncNotice: 'Auto-Logged',
    speaker: speaker || '',
    organization: organization || '',
    category: category || '',
    stallNo: '',
    isAutoLogged: true,
  };

  const id = await addTranscriptionRow(rowData);
  rowData.id = id;
  return rowData;
}
