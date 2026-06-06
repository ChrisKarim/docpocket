// =====================================================================
//  IndexedDB — stockage local des documents
// =====================================================================
const DB_NAME    = 'docpocket';
const DB_VERSION = 1;
const STORE      = 'documents';

let _db = null;

function ouvrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('categorie', 'categorie', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = e => reject(e.target.error);
  });
}

function tx(mode = 'readonly') {
  return _db.transaction(STORE, mode).objectStore(STORE);
}

// Sauvegarder un document (id toujours auto-généré, createdAt préservé si présent)
export async function sauvegarder(doc) {
  await ouvrirDB();
  const { id: _id, ...data } = doc;
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').add({ ...data, createdAt: data.createdAt ?? Date.now() });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// Mettre à jour un document existant (ex: ajouter driveId après sync)
export async function actualiser(doc) {
  await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').put(doc);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// Lister tous les documents
export async function listerTous() {
  await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = tx().getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// Obtenir un document par id
export async function obtenir(id) {
  await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = tx().get(id);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// Supprimer un document
export async function supprimer(id) {
  await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}
