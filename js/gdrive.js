// =====================================================================
//  Google Drive — synchronisation des documents Docpocket
// =====================================================================
const CLIENT_ID  = '735653599670-3hs8579ierkv3t7cdvled0qhj21i0u7c.apps.googleusercontent.com';
const SCOPE      = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UP_BASE    = 'https://www.googleapis.com/upload/drive/v3';

const FOLDER_NAME = 'DocPocket';

let tokenClient  = null;
let accessToken  = null;
let _onChange    = null;
let _folderId    = null; // ID du dossier DocPocket dans Drive

// ── Init ─────────────────────────────────────────────────────────────
// Appeler au démarrage. onChange(true/false) est appelé dès que l'état change.
export function initialiser(onChange) {
  _onChange = onChange;
  try {
    const s = sessionStorage.getItem('dp_gtoken');
    if (s) {
      const { token, expires } = JSON.parse(s);
      if (expires > Date.now()) {
        accessToken = token;
        onChange(true);
      }
    }
  } catch {}
}

export function estConnecte() { return !!accessToken; }

// ── OAuth ─────────────────────────────────────────────────────────────
export function connecter() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Bibliothèque Google non chargée'));
      return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resp => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        accessToken = resp.access_token;
        const expires = Date.now() + resp.expires_in * 1000 - 60_000;
        try { sessionStorage.setItem('dp_gtoken', JSON.stringify({ token: accessToken, expires })); } catch {}
        _onChange?.(true);
        resolve();
      }
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function deconnecter() {
  if (accessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenClient = null;
  _folderId   = null;
  try { sessionStorage.removeItem('dp_gtoken'); } catch {}
  _onChange?.(false);
}

// ── HTTP helpers ──────────────────────────────────────────────────────
function gererExpiration() {
  accessToken = null;
  tokenClient = null;
  try { sessionStorage.removeItem('dp_gtoken'); } catch {}
  _onChange?.(false);
  throw new Error('Session Google expirée — reconnectez-vous.');
}

async function driveGet(path) {
  const res = await fetch(DRIVE_BASE + path, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 401) gererExpiration();
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  return res.json();
}

async function driveDel(fileId) {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 401) gererExpiration();
  if (res.status !== 204 && !res.ok) throw new Error(`Drive delete ${res.status}`);
}

// Trouve ou crée le dossier "DocPocket" dans Drive, retourne son ID
async function obtenirDossier() {
  if (_folderId) return _folderId;
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const data = await driveGet(`/files?q=${q}&fields=files(id)`);
  if (data.files?.length > 0) {
    _folderId = data.files[0].id;
    return _folderId;
  }
  // Créer le dossier s'il n'existe pas
  const res = await fetch(`${DRIVE_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  if (!res.ok) throw new Error(`Création dossier Drive ${res.status}`);
  const folder = await res.json();
  _folderId = folder.id;
  return _folderId;
}

async function driveUpload(doc, driveId = null) {
  const folderId = await obtenirDossier();
  const boundary = 'dpbnd' + Date.now();
  const nom = `${doc.nom || 'document'}_${doc.createdAt || Date.now()}.json`;
  const metadata = JSON.stringify({
    name: nom,
    mimeType: 'application/json',
    ...(!driveId ? { parents: [folderId] } : {})
  });
  const content = JSON.stringify(doc);
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`
  ].join('\r\n');

  const url = driveId
    ? `${UP_BASE}/files/${driveId}?uploadType=multipart`
    : `${UP_BASE}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: driveId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  if (res.status === 401) gererExpiration();
  if (!res.ok) throw new Error(`Drive upload ${res.status}`);
  const data = await res.json();
  return data.id;
}

// ── API publique ──────────────────────────────────────────────────────

// Envoie un document sur Drive (crée ou met à jour selon doc.driveId)
export async function uploaderDocument(doc) {
  return driveUpload(doc, doc.driveId || null);
}

// Supprime un fichier Drive par son ID
export async function supprimerDeDrive(driveId) {
  await driveDel(driveId);
}

// Retourne les documents présents sur Drive mais absents localement
// driveIdsLocaux : tableau des driveId déjà connus en local
export async function synchroniser(driveIdsLocaux) {
  const folderId = await obtenirDossier();
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/json' and trashed=false`);
  const data = await driveGet(`/files?fields=files(id,name)&q=${q}`);
  const fichiers = data.files || [];
  const nouveaux = [];

  for (const f of fichiers) {
    if (driveIdsLocaux.includes(f.id)) continue;
    try {
      const res = await fetch(`${DRIVE_BASE}/files/${f.id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const doc = await res.json();
        nouveaux.push({ ...doc, driveId: f.id });
      }
    } catch {}
  }
  return nouveaux;
}
