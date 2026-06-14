// =====================================================================
//  Caméra — preview sur canvas (évite la couche native iOS du <video>)
// =====================================================================
let stream  = null;
let _animId = null;
let _video  = null;

export async function demarrerCamera(canvasEl) {
  if (stream) arreterCamera();

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  });

  // Vidéo cachée (jamais dans le DOM) — reçoit le flux
  _video = document.createElement('video');
  _video.srcObject = stream;
  _video.playsInline = true;
  _video.muted = true;
  await _video.play();

  // Attendre que les dimensions vidéo soient disponibles
  if (!_video.videoWidth) {
    await new Promise(resolve => _video.addEventListener('loadedmetadata', resolve, { once: true }));
  }

  // Dessiner les frames en continu sur le canvas affiché
  function dessiner() {
    if (!stream || !_video) return;
    const w = canvasEl.offsetWidth;
    const h = canvasEl.offsetHeight;
    if (!w || !h) { _animId = requestAnimationFrame(dessiner); return; }
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;

    const ctx = canvasEl.getContext('2d');
    const vw = _video.videoWidth;
    const vh = _video.videoHeight;

    // Equivalent de object-fit: cover
    const scale = Math.max(w / vw, h / vh);
    const sw = w / scale, sh = h / scale;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    ctx.drawImage(_video, sx, sy, sw, sh, 0, 0, w, h);

    _animId = requestAnimationFrame(dessiner);
  }
  dessiner();
}

export function arreterCamera() {
  if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
  if (_video)  { _video.srcObject = null; _video = null; }
  if (stream)  { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

// Capture à la résolution native de la vidéo (pas la résolution du canvas affiché)
export function capturer() {
  if (!_video || !_video.videoWidth) throw new Error('Caméra pas encore prête');
  const canvas = document.createElement('canvas');
  canvas.width  = _video.videoWidth;
  canvas.height = _video.videoHeight;
  canvas.getContext('2d').drawImage(_video, 0, 0);
  return {
    dataURL: canvas.toDataURL('image/jpeg', 0.92),
    width:   canvas.width,
    height:  canvas.height
  };
}
