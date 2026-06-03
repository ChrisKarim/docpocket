// =====================================================================
//  Recadrage 4 coins + correction de perspective
// =====================================================================

// Applique la correction de perspective via 2 triangles (affine par morceaux)
export function appliquerPerspective(srcCanvas, coins, outWidth, outHeight) {
  const dst = document.createElement('canvas');
  dst.width  = outWidth;
  dst.height = outHeight;
  const ctx = dst.getContext('2d');

  const [tl, tr, br, bl] = coins; // top-left, top-right, bottom-right, bottom-left
  const d = [[0,0],[outWidth,0],[outWidth,outHeight],[0,outHeight]];

  // Dessiner 2 triangles pour couvrir le quadrilatère
  dessinerTriangle(ctx, srcCanvas, tl, tr, bl, d[0], d[1], d[3]);
  dessinerTriangle(ctx, srcCanvas, tr, br, bl, d[1], d[2], d[3]);

  return dst;
}

function dessinerTriangle(ctx, src, s0, s1, s2, d0, d1, d2) {
  // Calcul de la transformation affine src→dst pour ce triangle
  const m = affineMatrix(s0, s1, s2, d0, d1, d2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0[0], d0[1]);
  ctx.lineTo(d1[0], d1[1]);
  ctx.lineTo(d2[0], d2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

// Retourne les 6 paramètres de la transformation affine [a,b,c,d,e,f]
// tels que [a c e] [x]   [dx]
//          [b d f] [y] = [dy]
//                  [1]
function affineMatrix([x0,y0],[x1,y1],[x2,y2],[u0,v0],[u1,v1],[u2,v2]) {
  const D = x0*(y1-y2) + x1*(y2-y0) + x2*(y0-y1);
  const a = ((u0*(y1-y2) + u1*(y2-y0) + u2*(y0-y1)) / D);
  const b = ((v0*(y1-y2) + v1*(y2-y0) + v2*(y0-y1)) / D);
  const c = ((u0*(x2-x1) + u1*(x0-x2) + u2*(x1-x0)) / D);
  const d = ((v0*(x2-x1) + v1*(x0-x2) + v2*(x1-x0)) / D);
  const e = ((u0*(x1*y2-x2*y1) + u1*(x2*y0-x0*y2) + u2*(x0*y1-x1*y0)) / D);
  const f = ((v0*(x1*y2-x2*y1) + v1*(x2*y0-x0*y2) + v2*(x0*y1-x1*y0)) / D);
  return [a, b, c, d, e, f];
}

// Calcule les dimensions de sortie à partir des 4 coins sélectionnés
export function dimensionsSortie(coins) {
  const [tl, tr, br, bl] = coins;
  const largeur = Math.round((dist(tl, tr) + dist(bl, br)) / 2);
  const hauteur = Math.round((dist(tl, bl) + dist(tr, br)) / 2);
  return { largeur, hauteur };
}

function dist([x0,y0],[x1,y1]) {
  return Math.sqrt((x1-x0)**2 + (y1-y0)**2);
}

// =====================================================================
//  UI de sélection des 4 coins (overlay sur canvas)
// =====================================================================
export class SelecteurCoins {
  constructor(canvas, img, onUpdate) {
    this.canvas   = canvas;
    this.img      = img;
    this.onUpdate = onUpdate;
    this.scale    = 1;

    // Coins initiaux : légère marge intérieure
    const m = 0.1;
    const W = img.width, H = img.height;
    this.coins = [
      [W*m,     H*m],
      [W*(1-m), H*m],
      [W*(1-m), H*(1-m)],
      [W*m,     H*(1-m)]
    ];

    this._aktif = null;
    this._bind();
    this.dessiner();
  }

  // Taille d'affichage (scale src→canvas)
  _toDisplay([x,y]) {
    return [x * this.scale, y * this.scale];
  }
  _toSrc([x,y]) {
    return [x / this.scale, y / this.scale];
  }

  dessiner() {
    const canvas = this.canvas;
    const W = canvas.width, H = canvas.height;
    const ctx  = canvas.getContext('2d');
    this.scale = Math.min(W / this.img.width, H / this.img.height);

    const dw = this.img.width  * this.scale;
    const dh = this.img.height * this.scale;
    const ox = (W - dw) / 2;
    const oy = (H - dh) / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.img, ox, oy, dw, dh);

    // Overlay semi-transparent hors quadrilatère
    const pts = this.coins.map(([x,y]) => [x*this.scale+ox, y*this.scale+oy]);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    pts.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Bords du quadrilatère
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    pts.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.closePath();
    ctx.stroke();

    // Poignées
    pts.forEach(([x,y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI*2);
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });

    this._ox = ox; this._oy = oy;
  }

  _coinProche(x, y) {
    const pts = this.coins.map(([cx,cy]) => [cx*this.scale+this._ox, cy*this.scale+this._oy]);
    for (let i = 0; i < pts.length; i++) {
      const [px,py] = pts[i];
      if (Math.hypot(px-x, py-y) < 30) return i;
    }
    return -1;
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return [src.clientX - r.left, src.clientY - r.top];
  }

  _bind() {
    const start = e => {
      const [x,y] = this._pos(e);
      this._aktif = this._coinProche(x, y);
      if (this._aktif >= 0) e.preventDefault();
    };
    const move = e => {
      if (this._aktif < 0) return;
      e.preventDefault();
      const [x,y] = this._pos(e);
      this.coins[this._aktif] = this._toSrc([x - this._ox, y - this._oy]);
      this.dessiner();
      this.onUpdate?.(this.coins);
    };
    const end = () => { this._aktif = -1; };

    this.canvas.addEventListener('mousedown',  start);
    this.canvas.addEventListener('mousemove',  move);
    this.canvas.addEventListener('mouseup',    end);
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove',  move,  { passive: false });
    this.canvas.addEventListener('touchend',   end);
  }

  getCoins() { return this.coins; }
}
