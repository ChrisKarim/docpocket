// =====================================================================
//  Caméra — capture du document
// =====================================================================
let stream = null;

export async function demarrerCamera(videoEl) {
  if (stream) arreterCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

export function arreterCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// Capture une photo et retourne { dataURL, width, height }
// Utilise ImageCapture.takePhoto() en priorité (mode photo natif, meilleure qualité)
// Fallback : snapshot canvas depuis la frame vidéo courante
export async function capturer(videoEl) {
  const track = videoEl.srcObject?.getVideoTracks()[0];
  if (track && ('ImageCapture' in window)) {
    try {
      const imageCapture = new ImageCapture(track);
      const blob = await imageCapture.takePhoto();
      const dataURL = await blobVersDataURL(blob);
      const dims    = await dimensionsImage(dataURL);
      return { dataURL, ...dims };
    } catch {
      // ImageCapture indisponible ou erreur — on continue avec le fallback
    }
  }
  const canvas  = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return {
    dataURL: canvas.toDataURL('image/jpeg', 0.92),
    width:   canvas.width,
    height:  canvas.height
  };
}

function blobVersDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dimensionsImage(dataURL) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataURL;
  });
}
