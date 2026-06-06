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

// Capture une frame vidéo et retourne { dataURL, width, height }
export function capturer(videoEl) {
  const w = videoEl.videoWidth  || videoEl.clientWidth;
  const h = videoEl.videoHeight || videoEl.clientHeight;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
  return {
    dataURL: canvas.toDataURL('image/jpeg', 0.92),
    width:   w,
    height:  h
  };
}
