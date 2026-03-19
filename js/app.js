'use strict';

// ── PDF.js worker ─────────────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentFile = null;
let resultBlob  = null;
let resultName  = '';
let deferredInstallPrompt = null;

// ── PWA Install Prompt ────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').hidden = false;
});

document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') document.getElementById('installBtn').hidden = true;
  deferredInstallPrompt = null;
});

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const fileInfo      = document.getElementById('fileInfo');
const fileNameEl    = document.getElementById('fileName');
const fileSizeEl    = document.getElementById('fileSize');
const clearFileBtn  = document.getElementById('clearFile');
const actionCards   = document.getElementById('actionCards');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg    = document.getElementById('loadingMsg');
const progressBar   = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const resultBanner  = document.getElementById('resultBanner');
const resultMsg     = document.getElementById('resultMsg');
const downloadBtn   = document.getElementById('downloadBtn');

// Panels
const panelUnlock    = document.getElementById('panelUnlock');
const panelShrink    = document.getElementById('panelShrink');
const panelWatermark = document.getElementById('panelWatermark');

// ── File Drop / Select ────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please select a PDF file.');
    return;
  }
  currentFile = file;
  resultBlob  = null;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileInfo.hidden    = false;
  actionCards.hidden = false;
  resultBanner.hidden = true;
  hideAllPanels();
}

clearFileBtn.addEventListener('click', () => {
  currentFile = null;
  resultBlob  = null;
  fileInput.value = '';
  fileInfo.hidden     = true;
  actionCards.hidden  = true;
  resultBanner.hidden = true;
  hideAllPanels();
});

// ── Action Card Clicks ────────────────────────────────────────────────────────
document.querySelectorAll('.card[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    hideAllPanels();
    resultBanner.hidden = true;
    if (action === 'unlock')    { panelUnlock.hidden = false; }
    if (action === 'shrink')    { panelShrink.hidden = false; }
    if (action === 'watermark') { panelWatermark.hidden = false; }
    actionCards.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Back buttons
document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => {
    hideAllPanels();
    actionCards.hidden = false;
    resultBanner.hidden = true;
  });
});

function hideAllPanels() {
  panelUnlock.hidden    = true;
  panelShrink.hidden    = true;
  panelWatermark.hidden = true;
}

// ── Password toggle ───────────────────────────────────────────────────────────
const pdfPasswordInput = document.getElementById('pdfPassword');
document.getElementById('togglePw').addEventListener('click', () => {
  const isText = pdfPasswordInput.type === 'text';
  pdfPasswordInput.type = isText ? 'password' : 'text';
});

// ── Watermark preview & char counter ─────────────────────────────────────────
const watermarkTextEl = document.getElementById('watermarkText');
const charCountEl     = document.getElementById('charCount');
const previewTextEl   = document.getElementById('previewText');

watermarkTextEl.addEventListener('input', () => {
  const val = watermarkTextEl.value;
  charCountEl.textContent = val.length;
  previewTextEl.textContent = val || 'Preview';
});

// ── === UNLOCK === ────────────────────────────────────────────────────────────
document.getElementById('btnDoUnlock').addEventListener('click', async () => {
  if (!currentFile) return;
  const password = pdfPasswordInput.value;
  if (!password.trim()) {
    showError('unlockError', 'Please enter the PDF password.');
    return;
  }
  hideError('unlockError');

  const arrayBuffer = await readFileAsArrayBuffer(currentFile);
  showLoading('Unlocking PDF...', 0);

  try {
    // Load with password — pdf-lib will throw if wrong password
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, {
      password,
      ignoreEncryption: false,
    });

    setProgress(60, 'Removing encryption...');
    await sleep(50); // yield to UI

    // Save without encryption
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    setProgress(100, 'Done!');
    await sleep(100);

    const baseName = stripExtension(currentFile.name);
    finishWithBlob(new Blob([bytes], { type: 'application/pdf' }),
      `${baseName}_unlocked.pdf`,
      'PDF unlocked successfully. Encryption has been removed.');
  } catch (err) {
    hideLoading();
    const msg = err.message || '';
    if (msg.includes('password') || msg.includes('encrypted') || msg.includes('incorrect')) {
      showError('unlockError', 'Incorrect password. Please try again.');
    } else {
      showError('unlockError', `Failed to unlock PDF: ${msg}`);
    }
  }
});

// ── === SHRINK === ────────────────────────────────────────────────────────────
document.getElementById('btnDoShrink').addEventListener('click', async () => {
  if (!currentFile) return;
  hideError('shrinkError');

  const quality = document.querySelector('input[name="quality"]:checked')?.value || 'medium';
  const arrayBuffer = await readFileAsArrayBuffer(currentFile);

  showLoading('Preparing compression...', 0);

  try {
    const compressedBytes = await compressPDF(arrayBuffer, quality);
    const baseName = stripExtension(currentFile.name);
    const origSize = currentFile.size;
    const newSize  = compressedBytes.byteLength;
    const savings  = Math.round((1 - newSize / origSize) * 100);
    const savingsStr = savings > 0 ? ` (${savings}% smaller)` : ' (size similar to original)';

    finishWithBlob(
      new Blob([compressedBytes], { type: 'application/pdf' }),
      `${baseName}_compressed.pdf`,
      `Compressed with ${quality} quality${savingsStr}.`
    );
  } catch (err) {
    hideLoading();
    showError('shrinkError', `Compression failed: ${err.message}`);
  }
});

async function compressPDF(arrayBuffer, quality) {
  // Quality → DPI + JPEG quality mapping
  const qualityMap = {
    low:    { scale: 0.8,  jpegQ: 0.35 },
    medium: { scale: 1.0,  jpegQ: 0.65 },
    high:   { scale: 1.5,  jpegQ: 0.85 },
  };
  const { scale, jpegQ } = qualityMap[quality];

  // Load with PDF.js to render pages
  const pdfJs = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const numPages = pdfJs.numPages;

  // Create new pdf-lib document
  const newDoc = await PDFLib.PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    setProgress(Math.round((i / numPages) * 85), `Compressing page ${i} of ${numPages}...`);
    await sleep(0);

    const page  = await pdfJs.getPage(i);
    const vp    = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Get JPEG data URL
    const dataUrl  = canvas.toDataURL('image/jpeg', jpegQ);
    const base64   = dataUrl.split(',')[1];
    const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const jpgImage = await newDoc.embedJpg(imgBytes);
    const newPage  = newDoc.addPage([vp.width, vp.height]);
    newPage.drawImage(jpgImage, { x: 0, y: 0, width: vp.width, height: vp.height });
  }

  setProgress(95, 'Saving compressed PDF...');
  await sleep(50);
  const bytes = await newDoc.save({ useObjectStreams: true });
  setProgress(100, 'Done!');
  await sleep(100);
  return bytes;
}

// ── === WATERMARK === ─────────────────────────────────────────────────────────
document.getElementById('btnDoWatermark').addEventListener('click', async () => {
  if (!currentFile) return;
  hideError('watermarkError');

  const text = watermarkTextEl.value.trim();
  if (!text) {
    showError('watermarkError', 'Please enter the watermark text.');
    return;
  }

  const arrayBuffer = await readFileAsArrayBuffer(currentFile);
  showLoading('Adding watermark...', 0);

  try {
    const bytes = await addWatermark(arrayBuffer, text);
    const baseName = stripExtension(currentFile.name);
    finishWithBlob(
      new Blob([bytes], { type: 'application/pdf' }),
      `${baseName}_watermarked.pdf`,
      'Watermark added to all pages successfully.'
    );
  } catch (err) {
    hideLoading();
    showError('watermarkError', `Failed to add watermark: ${err.message}`);
  }
});

async function addWatermark(arrayBuffer, text) {
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  const pages  = pdfDoc.getPages();
  const font   = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const angleRad = (30 * Math.PI) / 180; // 30 degrees in radians

  for (let i = 0; i < pages.length; i++) {
    setProgress(Math.round(((i + 1) / pages.length) * 90), `Processing page ${i + 1} of ${pages.length}...`);
    await sleep(0);

    const page   = pages[i];
    const { width, height } = page.getSize();

    // Choose font size to fit text across ~60% of the page diagonal
    const diag = Math.sqrt(width * width + height * height);
    const lines = text.split('\n');
    const maxLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');

    let fontSize = Math.max(20, Math.min(80, (diag * 0.55) / Math.max(maxLine.length * 0.55, 1)));
    // Verify it fits and scale down if needed
    while (font.widthOfTextAtSize(maxLine, fontSize) > diag * 0.7 && fontSize > 14) {
      fontSize -= 2;
    }

    const lineHeight = fontSize * 1.3;
    const totalH = lineHeight * lines.length;

    // Center of the page
    const cx = width  / 2;
    const cy = height / 2;

    for (let li = 0; li < lines.length; li++) {
      const lineText = lines[li];
      const lineW    = font.widthOfTextAtSize(lineText, fontSize);

      // Vertical offset for multi-line: center the block
      const yOffset = ((lines.length - 1) / 2 - li) * lineHeight;

      // Position: origin of text so that the visual center lands at (cx, cy + yOffset).
      // When rotating by angle θ around the origin, the center of the text box
      // at (w/2, h/2) maps to (cx, cy). Solve for origin:
      const halfW = lineW / 2;
      const halfH = fontSize / 2;
      const ox = cx - (halfW * Math.cos(angleRad) - halfH * Math.sin(angleRad));
      const oy = (cy + yOffset) - (halfW * Math.sin(angleRad) + halfH * Math.cos(angleRad));

      // Shadow pass — offset 2,−2, darker gray, low opacity
      page.drawText(lineText, {
        x: ox + 2,
        y: oy - 2,
        size: fontSize,
        font,
        color: PDFLib.rgb(0.3, 0.3, 0.3),
        opacity: 0.08,
        rotate: PDFLib.degrees(30),
      });

      // Main watermark — light gray, semi-transparent
      page.drawText(lineText, {
        x: ox,
        y: oy,
        size: fontSize,
        font,
        color: PDFLib.rgb(0.70, 0.70, 0.70),
        opacity: 0.30,
        rotate: PDFLib.degrees(30),
      });
    }
  }

  setProgress(96, 'Saving PDF...');
  await sleep(50);
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  setProgress(100, 'Done!');
  await sleep(100);
  return bytes;
}

// ── Download ──────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!resultBlob || !resultName) return;
  const url = URL.createObjectURL(resultBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = resultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(2)} MB`;
}

function stripExtension(name) {
  return name.replace(/\.pdf$/i, '');
}

function showLoading(msg, pct) {
  loadingMsg.textContent    = msg;
  progressBar.style.width   = `${pct}%`;
  progressLabel.textContent = '';
  loadingOverlay.hidden     = false;
}

function setProgress(pct, label) {
  progressBar.style.width   = `${pct}%`;
  progressLabel.textContent = label || '';
}

function hideLoading() {
  loadingOverlay.hidden = true;
  progressBar.style.width = '0%';
}

function finishWithBlob(blob, filename, message) {
  hideLoading();
  resultBlob = blob;
  resultName = filename;
  resultMsg.textContent = message;
  resultBanner.hidden   = false;
  resultBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
