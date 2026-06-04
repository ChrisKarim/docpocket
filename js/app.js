import { sauvegarder, listerTous, obtenir, supprimer } from './db.js';
import { demarrerCamera, arreterCamera, capturer }     from './camera.js';
import { SelecteurCoins, appliquerPerspective, dimensionsSortie } from './crop.js';
import { genererPDF, partager } from './pdf.js';

// =====================================================================
//  Constantes
// =====================================================================
const CATEGORIES = [
  { id: 'identite',      label: 'Identité',     icon: '🪪' },
  { id: 'sante',         label: 'Santé',        icon: '🏥' },
  { id: 'pro',           label: 'Pro',          icon: '💼' },
  { id: 'abonnements',   label: 'Abonnements',  icon: '📋' },
  { id: 'divers',        label: 'Divers',       icon: '📁' }
];

// =====================================================================
//  État global
// =====================================================================
const state = {
  screen:       'library',
  pages:        [],        // dataURLs des pages capturées
  pageEnCours:  null,      // dataURL de la capture courante (avant recadrage)
  selecteur:    null,
  filtreCateg:  null,
  recherche:    '',
  tri:          'date-desc',
  docOuvert:    null
};

// =====================================================================
//  Routeur
// =====================================================================
function afficher(screen) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = true);
  document.getElementById('screen-' + screen).hidden = false;
  state.screen = screen;
}

// =====================================================================
//  ÉCRAN : BIBLIOTHÈQUE
// =====================================================================
async function chargerBibliotheque() {
  afficher('library');
  const tous = await listerTous();
  let docs = [...tous];

  // Filtre catégorie
  if (state.filtreCateg) docs = docs.filter(d => d.categorie === state.filtreCateg);

  // Recherche
  if (state.recherche) {
    const q = state.recherche.toLowerCase();
    docs = docs.filter(d => d.nom.toLowerCase().includes(q));
  }

  // Tri
  docs.sort((a, b) => {
    if (state.tri === 'date-desc') return b.createdAt - a.createdAt;
    if (state.tri === 'date-asc')  return a.createdAt - b.createdAt;
    if (state.tri === 'nom-asc')   return a.nom.localeCompare(b.nom);
    if (state.tri === 'nom-desc')  return b.nom.localeCompare(a.nom);
    return 0;
  });

  const liste = document.getElementById('doc-liste');
  if (!liste._delegated) {
    liste._delegated = true;
    liste.addEventListener('click', e => {
      const card = e.target.closest('.doc-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      if (!isNaN(id)) ouvrirDocument(id).catch(err => afficherToast('Erreur : ' + err.message));
    });
  }
  if (docs.length === 0) {
    liste.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <p>Aucun document</p>
        <p class="muted">Appuyez sur <strong>Numériser</strong> pour commencer</p>
      </div>`;
    return;
  }

  const cat = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  // Créer les cartes sans mettre le data-URL dans le HTML (évite les bugs de parsing)
  liste.innerHTML = docs.map(d => {
    const c = cat[d.categorie] || cat.divers;
    const date = new Date(d.createdAt).toLocaleDateString('fr-FR');
    return `
      <div class="doc-card" data-id="${d.id}">
        <div class="doc-thumb" data-id="${d.id}"></div>
        <div class="doc-info">
          <div class="doc-nom">${d.nom}</div>
          <div class="doc-meta">
            <span class="cat-badge">${c.icon} ${c.label}</span>
            <span class="doc-date">${date}</span>
            ${d.pages.length > 1 ? `<span class="pages-badge">${d.pages.length} pages</span>` : ''}
          </div>
        </div>
        <span class="doc-arrow">›</span>
      </div>`;
  }).join('');

  // Injecter les miniatures en JS (pas dans le HTML)
  docs.forEach(d => {
    const thumb = liste.querySelector(`.doc-thumb[data-id="${d.id}"]`);
    if (thumb && d.pages[0]) thumb.style.backgroundImage = `url('${d.pages[0]}')`;
  });

}

// =====================================================================
//  ÉCRAN : CAMÉRA
// =====================================================================
const videoEl = document.getElementById('camera-video');

async function lancerCamera() {
  afficher('camera');
  try {
    await demarrerCamera(videoEl);
  } catch (err) {
    afficher('library');
    const msg = err.name === 'NotAllowedError'
      ? 'Accès caméra refusé. Autorisez dans Réglages > Safari.'
      : 'Impossible d\'accéder à la caméra : ' + err.message;
    afficherToast(msg, 5000);
  }
}

document.getElementById('btn-capture').addEventListener('click', () => {
  const frame = capturer(videoEl);
  state.pageEnCours = frame.dataURL;
  arreterCamera();
  lancerRecadrage(frame.dataURL);
});

document.getElementById('btn-camera-back').addEventListener('click', () => {
  arreterCamera();
  state.pages = [];
  chargerBibliotheque();
});

// =====================================================================
//  ÉCRAN : RECADRAGE
// =====================================================================
const cropCanvas = document.getElementById('crop-canvas');

function lancerRecadrage(dataURL) {
  afficher('crop');
  const img = new Image();
  img.onload = () => {
    // Attendre le reflow iOS avant de mesurer le canvas
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rect = cropCanvas.getBoundingClientRect();
        cropCanvas.width  = Math.round(rect.width)  || window.innerWidth;
        cropCanvas.height = Math.round(rect.height) || window.innerHeight - 120;
        state.selecteur = new SelecteurCoins(cropCanvas, img, () => {});
      });
    });
  };
  img.src = dataURL;
}

document.getElementById('btn-crop-confirm').addEventListener('click', () => {
  if (!state.selecteur) return;
  const coins = state.selecteur.getCoins();
  const img   = new Image();
  img.onload = () => {
    const { largeur, hauteur } = dimensionsSortie(coins);
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = img.width;
    srcCanvas.height = img.height;
    srcCanvas.getContext('2d').drawImage(img, 0, 0);
    const corrige = appliquerPerspective(srcCanvas, coins, largeur, hauteur);
    state.pages.push(corrige.toDataURL('image/jpeg', 0.9));
    afficher('save');
    afficherApercuPages();
  };
  img.src = state.pageEnCours;
});

document.getElementById('btn-crop-back').addEventListener('click', () => {
  lancerCamera();
});

// =====================================================================
//  ÉCRAN : SAUVEGARDE
// =====================================================================
function afficherApercuPages() {
  const zone = document.getElementById('save-thumbs');
  zone.innerHTML = state.pages.map((p, i) =>
    `<img src="${p}" class="save-thumb" alt="page ${i+1}" />`
  ).join('') + `<div class="add-page-btn" id="btn-add-page-save">＋</div>`;

  // Boutons catégories
  const cats = document.getElementById('save-categories');
  cats.innerHTML = CATEGORIES.map(c => `
    <button class="cat-btn" data-id="${c.id}">${c.icon} ${c.label}</button>
  `).join('');
  cats.querySelector('[data-id="divers"]').classList.add('active');

  cats.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cats.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Bouton "ajouter une page"
  document.getElementById('btn-add-page-save')?.addEventListener('click', lancerCamera);
}

document.getElementById('btn-sauvegarder').addEventListener('click', async () => {
  const nom = document.getElementById('save-nom').value.trim();
  if (!nom) { document.getElementById('save-nom').focus(); return; }

  const categActive = document.querySelector('.cat-btn.active');
  const categorie   = categActive ? categActive.dataset.id : 'divers';

  await sauvegarder({ nom, categorie, pages: state.pages });
  state.pages = [];
  document.getElementById('save-nom').value = '';
  chargerBibliotheque();
});

document.getElementById('btn-save-back').addEventListener('click', () => {
  state.pages = [];
  chargerBibliotheque();
});

// =====================================================================
//  ÉCRAN : VISIONNEUSE
// =====================================================================
async function ouvrirDocument(id) {
  const doc = await obtenir(id);
  if (!doc) return;
  state.docOuvert = doc;

  const cat = CATEGORIES.find(c => c.id === doc.categorie) || CATEGORIES[4];
  const date = new Date(doc.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  document.getElementById('viewer-titre').textContent = doc.nom;
  document.getElementById('viewer-meta').textContent  = `${cat.icon} ${cat.label} · ${date}`;

  const slider = document.getElementById('viewer-slider');
  slider.innerHTML = doc.pages.map((p, i) =>
    `<div class="slide"><img src="${p}" alt="page ${i+1}" /></div>`
  ).join('');

  afficher('viewer');
}

document.getElementById('btn-viewer-back').addEventListener('click', chargerBibliotheque);

document.getElementById('btn-partager-pdf').addEventListener('click', async () => {
  const doc  = state.docOuvert;
  const blob = await genererPDF(doc.pages, doc.nom);
  await partager(blob, `${doc.nom}.pdf`);
});

document.getElementById('btn-partager-img').addEventListener('click', async () => {
  const doc = state.docOuvert;
  // Partager toutes les pages ou juste la première
  const dataURL = doc.pages[0];
  const res  = await fetch(dataURL);
  const blob = await res.blob();
  await partager(blob, `${doc.nom}.jpg`);
});

document.getElementById('btn-supprimer').addEventListener('click', async () => {
  if (!confirm(`Supprimer « ${state.docOuvert.nom} » ?`)) return;
  await supprimer(state.docOuvert.id);
  state.docOuvert = null;
  chargerBibliotheque();
});

// =====================================================================
//  Toast
// =====================================================================
function afficherToast(msg, duree = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1c1c1c;color:#fff;padding:.75rem 1.25rem;border-radius:99px;font-size:.875rem;font-weight:600;z-index:999;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duree);
}

// =====================================================================
//  Navigation principale
// =====================================================================
document.getElementById('btn-scan').addEventListener('click', lancerCamera);

// Filtres catégories (bibliothèque)
const filtreCats = document.getElementById('filtre-categories');
filtreCats.innerHTML = `<button class="filtre-btn active" data-id="">Tout</button>` +
  CATEGORIES.map(c => `<button class="filtre-btn" data-id="${c.id}">${c.icon} ${c.label}</button>`).join('');

filtreCats.querySelectorAll('.filtre-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filtreCats.querySelectorAll('.filtre-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filtreCateg = btn.dataset.id || null;
    chargerBibliotheque();
  });
});

// Recherche
document.getElementById('search-input').addEventListener('input', e => {
  state.recherche = e.target.value;
  chargerBibliotheque();
});

// Tri
document.getElementById('tri-select').addEventListener('change', e => {
  state.tri = e.target.value;
  chargerBibliotheque();
});

// =====================================================================
//  PWA — Service Worker
// =====================================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// =====================================================================
//  Démarrage
// =====================================================================
chargerBibliotheque();
