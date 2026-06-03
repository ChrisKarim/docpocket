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

// Capture une frame et retourne un ImageData + dataURL
export function capturer(videoEl) {
  const canvas  = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);
  return {
    dataURL: canvas.toDataURL('image/jpeg', 0.92),
    width:   canvas.width,
    height:  canvas.height
  };
}
