// =====================================================================
//  Génération PDF client-side (jsPDF)
// =====================================================================

// qualite : 0.5 (léger) → 1.0 (max)
export async function genererPDF(pages, nomFichier = 'document', qualite = 0.85) {
  const { jsPDF } = window.jspdf;

  let pdf = null;

  for (let i = 0; i < pages.length; i++) {
    const dataURL = pages[i];

    // Charger l'image pour connaître ses dimensions
    const img = await chargerImage(dataURL);
    const orientation = img.width >= img.height ? 'landscape' : 'portrait';

    if (i === 0) {
      pdf = new jsPDF({ orientation, unit: 'px', format: [img.width, img.height] });
    } else {
      pdf.addPage([img.width, img.height], orientation);
    }

    pdf.addImage(dataURL, 'JPEG', 0, 0, img.width, img.height, '', 'FAST');
  }

  return pdf.output('blob');
}

function chargerImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = dataURL;
  });
}

// Partager un blob (PDF ou image) via Web Share API
export async function partager(blob, nom) {
  const file = new File([blob], nom, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: nom });
    return true;
  }
  // Fallback : téléchargement
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return false;
}
