/**
 * pdfbox-ts Test Harness — browser app.
 *
 * Demonstrates the full workflow: load PDF → fill fields → sign → counter-sign → download.
 * All cryptographic operations happen in the browser using node-forge.
 */

import {
  PDFDocument,
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
  verifySignatures,
  copyPages,
  StandardFonts,
  rgb,
  degrees,
  LineCapStyle,
  PDAnnotationHighlight,
  PDAnnotationRubberStamp,
  PDAnnotationText,
  PDAnnotationSquare,
  PDAnnotationRedact,
  StampName,
  TextIconName,
  ANNOTATION_FLAG_PRINT,
} from 'pdfbox-ts';
import type { BrowserKeypairSigner, CertificateChain } from 'pdfbox-ts';
import forge from 'node-forge';
import { renderPdf, renderPdfWithNative } from './pdf-renderer';
import type { PageRenderInfo } from './pdf-renderer';
import { RedactionOverlay } from './redaction-overlay';

// Import PEM keys as raw text (Vite handles ?raw imports)
// DER certs are fetched at runtime from /keys/*.cert.der
import user1KeyPem from '../keys/user1.key.pem?raw';
import user1CertPem from '../keys/user1.cert.pem?raw';
import user2KeyPem from '../keys/user2.key.pem?raw';
import user2CertPem from '../keys/user2.cert.pem?raw';

// ── State ───────────────────────────────────────────────────────

let currentPdfBytes: Uint8Array | null = null;
let signatureCount = 0;
let lastRenderPages: PageRenderInfo[] = [];
let activeRenderer: 'pdfjs' | 'native' = 'pdfjs';
let currentPassword: string | undefined = undefined; // for rendering encrypted PDFs
const redactionOverlay = new RedactionOverlay();

// Form builder queue
interface FormFieldConfig {
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature';
  name: string;
  options?: string[];
}
const formFieldQueue: FormFieldConfig[] = [];

// ── Logging ─────────────────────────────────────────────────────

const logEl = document.getElementById('log-output')!;

function log(msg: string, cls: string = '') {
  const time = new Date().toISOString().slice(11, 19);
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = `[${time}] ${msg}\n`;
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Toast notifications ──────────────────────────────────────────

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Signature image generator ────────────────────────────────────

/**
 * Generate a signature-only PNG (just the handwriting, transparent background).
 * For hybrid mode, the PDF appearance stream adds the text info — the image
 * should be ONLY the squiggle, like a real signature pad capture.
 */
function generateSignatureImage(name: string, _date: string): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;

  // White background (PDF strips alpha, so transparent → black without this)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cursive signature handwriting
  ctx.fillStyle = '#1a237e';
  ctx.font = 'italic 52px "Brush Script MT", "Segoe Script", "Apple Chancery", cursive';
  ctx.fillText(name, 20, 75);

  // Subtle underline flourish
  ctx.strokeStyle = 'rgba(144, 164, 174, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(15, 85);
  ctx.lineTo(340, 85);
  ctx.stroke();

  // Convert canvas to PNG Uint8Array
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a full signature image with text info (for image-only mode).
 */
function generateFullSignatureImage(name: string, date: string): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 150);

  ctx.fillStyle = '#1a237e';
  ctx.font = 'italic 42px "Brush Script MT", "Segoe Script", "Apple Chancery", cursive';
  ctx.fillText(name, 20, 60);

  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 72);
  ctx.lineTo(380, 72);
  ctx.stroke();

  ctx.fillStyle = '#546e7a';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Digitally signed by ${name}`, 20, 95);
  ctx.fillText(date, 20, 112);
  ctx.fillText('Reason: Digital approval', 20, 129);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function updateSignaturePreview(userNum: 1 | 2 = 1) {
  const style = ($('sig-style') as HTMLSelectElement).value;
  const previewCanvas = $('sig-preview-canvas') as HTMLCanvasElement;
  const ctx = previewCanvas.getContext('2d')!;

  if (style === 'text') {
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Text-only (rendered by PDF viewer)', previewCanvas.width / 2, previewCanvas.height / 2 + 5);
    ctx.textAlign = 'start';
    return;
  }

  const name = `User ${userNum}`;
  const date = new Date().toLocaleString();
  const imgData = generateSignatureImage(name, date);
  const blob = new Blob([imgData], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ── Log toggle ─────────────────────────────────────────────────

const logPanel = document.getElementById('log-panel')!;
document.getElementById('toggle-log')!.addEventListener('click', () => {
  logPanel.classList.toggle('collapsed');
});

// ── Renderer toggle ─────────────────────────────────────────────

const rendererSelect = document.getElementById('renderer-select') as HTMLSelectElement;
rendererSelect.addEventListener('change', async () => {
  activeRenderer = rendererSelect.value as 'pdfjs' | 'native';
  log(`Switched renderer to ${activeRenderer === 'native' ? 'NativeRenderer' : 'PDF.js'}`, 'info');
  await refreshViewer();
});

// ── PDF Viewer ──────────────────────────────────────────────────

async function refreshViewer() {
  if (!currentPdfBytes) return;
  const viewer = document.getElementById('pdf-viewer')!;
  const metricsEl = document.getElementById('render-metrics')!;
  try {
    const renderFn = activeRenderer === 'native' ? renderPdfWithNative : renderPdf;
    const { numPages, pages, timings } = await renderFn(viewer, currentPdfBytes, { password: currentPassword });
    lastRenderPages = pages;
    document.getElementById('pdf-status')!.textContent =
      `${numPages} page(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB` +
      (signatureCount > 0 ? ` \u00B7 ${signatureCount} sig(s)` : '');

    // Display render metrics
    if (timings.length > 0) {
      const total = timings.reduce((a, b) => a + b, 0);
      const perPage = timings.map((t, i) => `P${i + 1}: ${t.toFixed(0)}ms`).join(' | ');
      metricsEl.textContent = `${activeRenderer === 'native' ? 'NativeRenderer' : 'PDF.js'} \u00B7 ${perPage} \u00B7 Total: ${total.toFixed(0)}ms`;
      metricsEl.style.display = 'block';
    } else {
      metricsEl.style.display = 'none';
    }

    // Re-attach redaction overlay to newly rendered pages
    redactionOverlay.attachToViewer(viewer, pages);
  } catch (err: any) {
    log(`PDF render failed: ${err.message}`, 'error');
    metricsEl.style.display = 'none';
  }
}

// ── Signer factory ──────────────────────────────────────────────

function createSigner(
  keyPem: string,
  certPem: string,
  certDerBytes: Uint8Array,
  label: string,
): BrowserKeypairSigner {
  const privateKey = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  // Stash for CMS builder (it reads from globalThis.__forgePrivateKey)
  (globalThis as any).__forgePrivateKey = privateKey;

  const cert = forge.pki.certificateFromPem(certPem);
  const cn = cert.subject.getField('CN')?.value || label;

  return {
    async getCertificate(): Promise<CertificateChain> {
      return { cert: certDerBytes, chain: [] };
    },
    async sign(data: Uint8Array): Promise<Uint8Array> {
      const md = forge.md.sha256.create();
      // Convert Uint8Array to binary string for forge
      let binary = '';
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
      }
      md.update(binary);
      const signature = privateKey.sign(md);
      return Uint8Array.from(signature, (c: string) => c.charCodeAt(0));
    },
    getEmail(): string {
      return `${label.toLowerCase().replace(/\s/g, '')}@test.pdfbox-ts.dev`;
    },
    getAlgorithm() {
      return { hash: 'sha256', signature: 'rsa', keySize: 2048 };
    },
  };
}

// ── DER loading helper ──────────────────────────────────────────

async function loadDerCert(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  return new Uint8Array(await response.arrayBuffer());
}

// ── UI helpers ──────────────────────────────────────────────────

/**
 * Opens the parent <details> element of the section with the given ID,
 * making the section content visible.
 */
function show(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // If the element is inside a <details>, open it
  const details = el.closest('details');
  if (details) {
    details.open = true;
  }
  // Also remove hidden class in case it's used
  el.classList.remove('hidden');
}

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

// ── Step 1: Load PDF ────────────────────────────────────────────

$('use-demo').addEventListener('click', async () => {
  log('Loading demo PDF...', 'info');
  try {
    const response = await fetch('/demo.pdf');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — run \`pnpm setup\` to generate demo.pdf`);
    }
    currentPdfBytes = new Uint8Array(await response.arrayBuffer());
    signatureCount = 0;
    currentPassword = undefined;
    log(`Loaded demo.pdf: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    showToast('Demo PDF loaded', 'success');
    $('load-status').innerHTML = '<span class="status-badge loaded">Loaded</span>';
    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Failed to load demo PDF: ${err.message}`, 'error');
  }
});

$('file-input').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    log(`Loading ${file.name}...`, 'info');
    currentPdfBytes = new Uint8Array(await file.arrayBuffer());
    signatureCount = 0;
    currentPassword = undefined;
    log(`Loaded ${file.name}: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    $('load-status').innerHTML = '<span class="status-badge loaded">Loaded</span>';
    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Failed to load ${file.name}: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 2: Show and fill fields ────────────────────────────────

async function showFields() {
  if (!currentPdfBytes) return;

  const doc = await PDFDocument.load(currentPdfBytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const pageCount = doc.getPageCount();
  const form = doc.getForm();
  const fields = form.getFields();

  log(`Pages: ${pageCount}`, 'info');

  const container = $('fields-container');
  container.innerHTML = '';

  if (fields.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 12px;">No form fields found. You can still sign the PDF.</p>';
    $('field-count').textContent = '';
  } else {
    log(`Found ${fields.length} form field(s)`, 'info');
    $('field-count').textContent = `(${fields.length})`;
    for (const field of fields) {
      const name = field.getName();
      const div = document.createElement('div');
      div.className = 'field-row';

      // Check if it's a text field with existing value
      let currentValue = '';
      try {
        const tf = form.getTextField(name);
        currentValue = tf.getText() || '';
        if (currentValue) {
          log(`  ${name} = "${currentValue}"`, 'dim');
        }
      } catch {
        // Not a text field — skip input
      }

      // Detect multiline by field name heuristic
      const isMultiline = name.includes('notes') || name.includes('comment') || name.includes('description');

      if (isMultiline) {
        div.innerHTML = `
          <label>${name}</label>
          <textarea class="field-input" data-field="${name}">${currentValue}</textarea>
        `;
      } else {
        div.innerHTML = `
          <label>${name}</label>
          <input type="text" class="field-input" data-field="${name}" value="${currentValue}" />
        `;
      }
      container.appendChild(div);
    }
  }

  show('fields-section');
  show('sign-section');
}

$('apply-fields').addEventListener('click', async () => {
  if (!currentPdfBytes) return;

  const doc = await PDFDocument.load(currentPdfBytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const form = doc.getForm();

  const inputs = document.querySelectorAll('.field-input') as NodeListOf<HTMLInputElement | HTMLTextAreaElement>;
  let filled = 0;
  for (const input of inputs) {
    const name = input.dataset.field!;
    const value = input.value;
    if (value) {
      try {
        const textField = form.getTextField(name);
        textField.setText(value);
        filled++;
      } catch {
        log(`Skipped "${name}" — not a text field`, 'dim');
      }
    }
  }

  currentPdfBytes = await doc.save();
  log(`Applied ${filled} field value(s). PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
  await refreshViewer();
});

// ── Step 3: Sign ────────────────────────────────────────────────

async function signAs(userNum: 1 | 2) {
  if (!currentPdfBytes) return;

  const btn = $(`sign-user${userNum}`) as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Signing...';

  try {
    // Load DER cert
    const certDer = await loadDerCert(`/keys/user${userNum}.cert.der`);
    const keyPem = userNum === 1 ? user1KeyPem : user2KeyPem;
    const certPem = userNum === 1 ? user1CertPem : user2CertPem;

    const signer = createSigner(keyPem, certPem, certDer, `User ${userNum}`);

    // Read signing options from UI toggles
    const useDer = ($('opt-der') as HTMLInputElement).checked;
    const useFullSave = ($('opt-fullsave') as HTMLInputElement).checked;
    const flattenOnSign = ($('opt-flatten') as HTMLInputElement).checked;

    if (useDer) (globalThis as any).process = { env: { ...(globalThis as any).process?.env, PDFBOX_TS_CMS_DER: '1' } };
    if (useFullSave) (globalThis as any).process = { env: { ...(globalThis as any).process?.env, PDFBOX_TS_FORCE_FULL_SAVE: '1' } };

    const sigStyle = ($('sig-style') as HTMLSelectElement).value;
    const opts: string[] = [];
    if (useDer) opts.push('DER');
    if (useFullSave) opts.push('full-save');
    if (flattenOnSign) opts.push('flatten');
    log(`Signing as User ${userNum}${opts.length ? ` [${opts.join(', ')}]` : ''}...`, 'info');

    const dateStr = new Date().toLocaleString();
    const brandText = ($('sig-brand') as HTMLInputElement)?.value || 'Dapple SafeSign';
    const sigAppearance: any = {
      text: `Signed by User ${userNum}\n${dateStr}`,
      brandText,
      position: {
        page: 0,
        x: 50 + signatureCount * 260,
        y: 300,
        width: 280,
        height: 68,
      },
    };

    if (sigStyle === 'hybrid') {
      // Hybrid: squiggle-only PNG + text from appearance stream
      sigAppearance.imageData = generateSignatureImage(`User ${userNum}`, dateStr);
      sigAppearance.appearanceMode = 'hybrid';
    } else if (sigStyle === 'generated') {
      // Image-only: full image with baked-in text
      sigAppearance.imageData = generateFullSignatureImage(`User ${userNum}`, dateStr);
      sigAppearance.appearanceMode = 'image-only';
      sigAppearance.position.height = 100;
    }
    // text mode: no imageData, uses text-only branded info box

    const result = await signPDFWithPDFBox(currentPdfBytes!, signer, {
      signatureAppearance: sigAppearance,
      reason: `Approved by User ${userNum}`,
      location: 'Browser Test Harness',
      contactInfo: `user${userNum}@test.pdfbox-ts.dev`,
      flattenForms: flattenOnSign,
    });

    // Clean up env vars
    if (useDer) delete (globalThis as any).process?.env?.PDFBOX_TS_CMS_DER;
    if (useFullSave) delete (globalThis as any).process?.env?.PDFBOX_TS_FORCE_FULL_SAVE;

    currentPdfBytes = result.signedData;
    signatureCount++;

    log(`Signed by User ${userNum}!`, 'success');
    showToast(`Signed by User ${userNum}`, 'success');
    log(`  ByteRange: [${result.signatureInfo.byteRange.join(', ')}]`, 'dim');
    log(`  Signature: ${result.signatureInfo.signatureSize} bytes`, 'dim');
    log(`  PDF size:  ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    // Show signature info
    const sigDiv = document.createElement('div');
    sigDiv.className = 'sig-info';
    sigDiv.setAttribute('data-sig', String(signatureCount));
    sigDiv.innerHTML = `
      <div><strong>Signature ${signatureCount}: User ${userNum}</strong></div>
      <div>ByteRange: [${result.signatureInfo.byteRange.join(', ')}]</div>
      <div>Size: ${result.signatureInfo.signatureSize} bytes</div>
      <div>Signed at: ${result.signatureInfo.signedAt.toISOString()}</div>
    `;
    $('signatures-container').appendChild(sigDiv);

    show('result-section');
    $('download-info').textContent = `${signatureCount} signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Signing failed: ${err.message}`, 'error');
    showToast(`Signing failed: ${err.message}`, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = userNum === 1 ? 'Sign as User 1' : 'Counter-sign as User 2';
  }
}

$('sign-user1').addEventListener('click', () => signAs(1));
$('sign-user2').addEventListener('click', () => signAs(2));

// Update signature preview when style or section changes
$('sig-style').addEventListener('change', () => updateSignaturePreview());
// Initial preview
setTimeout(() => updateSignaturePreview(), 100);

// ── Step 4: Download ────────────────────────────────────────────

$('download').addEventListener('click', () => {
  if (!currentPdfBytes) return;
  const blob = new Blob([currentPdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `signed-${signatureCount}sigs.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log(`Downloaded signed-${signatureCount}sigs.pdf`, 'success');
});

// ── Step 5: Create Form ─────────────────────────────────────────

$('create-form').addEventListener('click', async () => {
  log('Creating form from scratch...', 'info');
  try {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);

    // Header
    page.drawRectangle({
      x: 0, y: 742, width: 612, height: 50,
      color: rgb(0.15, 0.25, 0.45),
    });
    page.drawText('Generated Form', {
      x: 50, y: 758, size: 22, font: helveticaBold, color: rgb(1, 1, 1),
    });

    const form = doc.getForm();

    // Text field
    page.drawText('Name:', {
      x: 50, y: 670, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });
    const nameField = form.createTextField('name');
    nameField.addToPage(page, {
      x: 150, y: 660, width: 300, height: 24,
      borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
      backgroundColor: rgb(0.98, 0.98, 0.98),
    });

    // Checkbox
    page.drawText('I agree:', {
      x: 50, y: 620, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });
    const agreeField = form.createCheckBox('agree');
    agreeField.addToPage(page, {
      x: 150, y: 612, width: 18, height: 18,
      borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
      backgroundColor: rgb(0.98, 0.98, 0.98),
    });

    // Dropdown
    page.drawText('Country:', {
      x: 50, y: 570, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });
    const countryField = form.createDropdown('country');
    countryField.setOptions(['USA', 'Canada', 'UK']);
    countryField.addToPage(page, {
      x: 150, y: 560, width: 300, height: 24,
      borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
      backgroundColor: rgb(0.98, 0.98, 0.98),
    });

    // Signature area
    page.drawText('Signatures:', {
      x: 50, y: 400, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });
    for (let i = 0; i < 2; i++) {
      const x = 50 + i * 260;
      page.drawRectangle({
        x, y: 300, width: 240, height: 70,
        borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1,
        color: rgb(0.97, 0.97, 0.97),
      });
    }

    currentPdfBytes = await doc.save();
    signatureCount = 0;

    const fields = form.getFields();
    log(`Created form with ${fields.length} field(s): ${fields.map(f => f.getName()).join(', ')}`, 'success');
    showToast(`Quick form created (${fields.length} fields)`, 'success');
    log(`PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    $('load-status').innerHTML = '<span class="status-badge loaded">Created</span>';
    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Form creation failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 6: Add Annotations ─────────────────────────────────────

$('add-annotations').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Adding annotations...', 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const page = doc.getPage(0);

    // Highlight annotation (yellow)
    const highlight = new PDAnnotationHighlight({
      rect: [50, 480, 300, 500],
      color: rgb(1, 1, 0),
      quadPoints: [50, 500, 300, 500, 50, 480, 300, 480],
      contents: 'Important section',
      flags: ANNOTATION_FLAG_PRINT,
    });
    page.addAnnotation(highlight);
    log('  Added highlight annotation', 'dim');

    // Rubber stamp "APPROVED"
    const stamp = new PDAnnotationRubberStamp({
      rect: [350, 700, 550, 750],
      stampName: StampName.APPROVED,
      contents: 'Approved by reviewer',
      flags: ANNOTATION_FLAG_PRINT,
    });
    page.addAnnotation(stamp);
    log('  Added rubber stamp (APPROVED)', 'dim');

    // Sticky note (Text annotation)
    const stickyNote = new PDAnnotationText({
      rect: [500, 600, 520, 620],
      iconName: TextIconName.NOTE,
      contents: 'Please review this section',
      color: rgb(1, 0.9, 0.4),
      open: false,
      flags: ANNOTATION_FLAG_PRINT,
    });
    page.addAnnotation(stickyNote);
    log('  Added sticky note', 'dim');

    // Rectangle annotation
    const rect = new PDAnnotationSquare({
      rect: [50, 200, 250, 280],
      color: rgb(1, 0, 0),
      borderWidth: 2,
      contents: 'Attention area',
      flags: ANNOTATION_FLAG_PRINT,
    });
    page.addAnnotation(rect);
    log('  Added rectangle annotation', 'dim');

    currentPdfBytes = await doc.save();
    log(`Added 4 annotations. PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');

    show('sign-section');
    show('result-section');
    $('download-info').textContent = `${signatureCount} signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Annotation failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 7: Flatten Form ────────────────────────────────────────

$('flatten-form').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Flattening form...', 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const form = doc.getForm();
    const fieldsBefore = form.getFields().length;

    form.flatten();

    currentPdfBytes = await doc.save();

    // Reload to verify no fields remain
    const reloaded = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const fieldsAfter = reloaded.getForm().getFields().length;

    log(`Flattened — ${fieldsAfter} fields remain (was ${fieldsBefore})`, 'success');
    log(`PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    // Refresh field display
    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Flatten failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 8: Verify Signatures ──────────────────────────────────

$('verify-sigs').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Verifying signatures...', 'info');
  try {
    const results = verifySignatures(currentPdfBytes);
    const container = $('verify-results');
    container.innerHTML = '';

    if (results.length === 0) {
      log('No signatures found in PDF', 'info');
      container.innerHTML = '<p style="color: #666; font-size: 12px; margin-top: 8px;">No digital signatures found.</p>';
      return;
    }

    log(`Found ${results.length} signature(s)`, 'success');

    for (const sig of results) {
      const integrityIcon = sig.integrityValid ? '\u2705' : '\u274C';
      const signatureIcon = sig.signatureValid ? '\u2705' : '\u274C';
      const chainLabel = sig.chainStatus === 'valid' ? '\u2705 Valid chain'
        : sig.chainStatus === 'self-signed' ? '\u26A0\uFE0F Self-signed'
        : sig.chainStatus === 'partial' ? '\u26A0\uFE0F Partial chain'
        : '\u2753 Unknown';

      log(`  ${sig.fieldName}: signed by ${sig.signedBy}`, 'dim');
      log(`    Algorithm: ${sig.algorithm}`, 'dim');
      log(`    Integrity: ${sig.integrityValid ? 'PASS' : 'FAIL'}`, sig.integrityValid ? 'dim' : 'error');
      log(`    Signature: ${sig.signatureValid ? 'PASS' : 'FAIL'}`, sig.signatureValid ? 'dim' : 'error');
      log(`    Chain: ${sig.chainStatus}`, 'dim');
      if (sig.timestampInfo) {
        log(`    TSA: ${sig.timestampInfo.signerCn} (verified: ${sig.timestampInfo.verified})`, 'dim');
      }

      const sigDiv = document.createElement('div');
      sigDiv.className = 'sig-info';
      sigDiv.style.marginTop = '8px';
      sigDiv.innerHTML = `
        <div><strong>${sig.fieldName}</strong> — ${sig.signedBy}</div>
        <div>${integrityIcon} Integrity (SHA-256 digest match)</div>
        <div>${signatureIcon} ${sig.algorithm} signature</div>
        <div>${chainLabel}</div>
        ${sig.signedAt ? `<div>Signed: ${sig.signedAt.toISOString()}</div>` : ''}
        ${sig.reason ? `<div>Reason: ${sig.reason}</div>` : ''}
        ${sig.location ? `<div>Location: ${sig.location}</div>` : ''}
        ${sig.timestampInfo ? `<div>TSA: ${sig.timestampInfo.signerCn} (${sig.timestampInfo.verified ? 'verified' : 'unverified'})</div>` : ''}
        ${sig.error ? `<div style="color: #f38ba8;">Error: ${sig.error}</div>` : ''}
      `;
      container.appendChild(sigDiv);
    }
  } catch (err: any) {
    log(`Verification failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 9: Copy Pages ─────────────────────────────────────────

$('copy-pages').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Copying page 1 to new document...', 'info');
  try {
    const srcDoc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const dstDoc = await PDFDocument.create();

    const pages = copyPages(srcDoc, dstDoc, [0]);
    for (const page of pages) {
      dstDoc.addPage(page);
    }

    const newBytes = await dstDoc.save();
    log(`Copied page 1 into new PDF: ${newBytes.length.toLocaleString()} bytes`, 'success');

    // Trigger download of the new PDF
    const blob = new Blob([newBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copied-page.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('Downloaded copied-page.pdf', 'success');
  } catch (err: any) {
    log(`Copy pages failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 10: Save as PDF/A ─────────────────────────────────────

async function saveAsPdfA(level: 'PDF/A-1b' | 'PDF/A-2b') {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log(`Saving as ${level}...`, 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });

    const pdfaBytes = await doc.save({ pdfaConformance: level });
    log(`Saved as ${level}: ${pdfaBytes.length.toLocaleString()} bytes`, 'success');

    // Trigger download
    const blob = new Blob([pdfaBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${level.toLowerCase().replace('/', '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`Downloaded document-${level.toLowerCase().replace('/', '')}.pdf`, 'success');
  } catch (err: any) {
    log(`PDF/A save failed: ${err.message}`, 'error');
    console.error(err);
  }
}

$('save-pdfa1b').addEventListener('click', () => saveAsPdfA('PDF/A-1b'));
$('save-pdfa2b').addEventListener('click', () => saveAsPdfA('PDF/A-2b'));

// ── Step 11: Custom Font ───────────────────────────────────────

const fontFileInput = $('font-file') as HTMLInputElement;
const embedFontBtn = $('embed-font') as HTMLButtonElement;

fontFileInput.addEventListener('change', () => {
  embedFontBtn.disabled = !fontFileInput.files?.length;
});

embedFontBtn.addEventListener('click', async () => {
  const file = fontFileInput.files?.[0];
  if (!file) return;

  log(`Embedding font: ${file.name}...`, 'info');
  try {
    const fontBytes = new Uint8Array(await file.arrayBuffer());

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(fontBytes);
    const page = doc.addPage([612, 792]);

    // Draw sample text at various sizes
    const sampleText = 'The quick brown fox jumps over the lazy dog';
    const sizes = [36, 24, 18, 14, 12, 10];
    let y = 700;

    for (const size of sizes) {
      page.drawText(sampleText, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size * 1.8;
    }

    // Add some Unicode if relevant
    page.drawText('0123456789 !@#$%^&*()', {
      x: 50, y: y - 20, size: 16, font, color: rgb(0.3, 0.3, 0.3),
    });

    const pdfBytes = await doc.save();
    log(`Created PDF with ${file.name}: ${pdfBytes.length.toLocaleString()} bytes`, 'success');

    // Also set as current PDF so user can sign it, etc.
    currentPdfBytes = pdfBytes;
    signatureCount = 0;
    $('load-status').innerHTML = '<span class="status-badge loaded">Font PDF</span>';
    show('sign-section');

    // Trigger download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-font-${file.name.replace(/\.\w+$/, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`Downloaded custom-font-${file.name.replace(/\.\w+$/, '')}.pdf`, 'success');

    await refreshViewer();
  } catch (err: any) {
    log(`Font embedding failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 12: Redaction ─────────────────────────────────────────

$('add-redaction').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Adding redaction annotation...', 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const page = doc.getPage(0);

    // Add a redaction annotation marking an area
    const redact = new PDAnnotationRedact({
      rect: [50, 520, 350, 550],
      interiorColor: rgb(0, 0, 0),
      overlayText: '[REDACTED]',
      flags: ANNOTATION_FLAG_PRINT,
    });
    page.addAnnotation(redact);
    log('  Added redaction annotation at [50, 520, 350, 550]', 'dim');

    currentPdfBytes = await doc.save();
    log(`Redaction annotation added. PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    log('  Note: Content is marked for redaction — apply with applyRedactions() to remove content', 'dim');

    show('result-section');
    $('download-info').textContent = `${signatureCount} signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Redaction failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 12b: Interactive Redaction ───────────────────────────

function updateRedactionUI() {
  const count = redactionOverlay.count;
  const badge = $('redaction-count');
  badge.textContent = count > 0 ? String(count) : '';
  ($('apply-redactions') as HTMLButtonElement).disabled = count === 0;
  ($('clear-redactions') as HTMLButtonElement).disabled = count === 0;
}

$('toggle-redaction-draw').addEventListener('click', () => {
  const btn = $('toggle-redaction-draw') as HTMLButtonElement;
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }
  const newState = !redactionOverlay.isDrawing;
  redactionOverlay.setDrawing(newState);
  btn.classList.toggle('toggle-active', newState);
  btn.textContent = newState ? 'Stop Drawing' : 'Draw Redaction';
  if (newState) {
    log('Redaction draw mode ON — click and drag on the PDF to mark areas', 'info');
    showToast('Draw rectangles on the PDF to mark redactions', 'info');
  } else {
    log('Redaction draw mode OFF', 'info');
  }
});

// Poll for region count changes (mouseup may add regions)
setInterval(updateRedactionUI, 300);

$('clear-redactions').addEventListener('click', () => {
  redactionOverlay.clear();
  updateRedactionUI();
  log('Cleared all pending redactions', 'info');
});

$('apply-redactions').addEventListener('click', async () => {
  if (!currentPdfBytes) return;
  const regions = redactionOverlay.getRegions();
  if (regions.length === 0) return;

  log(`Applying ${regions.length} redaction(s)...`, 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });

    for (const region of regions) {
      const page = doc.getPage(region.page);
      const redact = new PDAnnotationRedact({
        rect: region.rect,
        interiorColor: rgb(0, 0, 0),
        overlayText: '[REDACTED]',
        flags: ANNOTATION_FLAG_PRINT,
      });
      page.addAnnotation(redact);
      log(`  Page ${region.page + 1}: redaction at [${region.rect.join(', ')}]`, 'dim');
    }

    currentPdfBytes = await doc.save();
    redactionOverlay.clear();
    updateRedactionUI();

    // Turn off draw mode
    redactionOverlay.setDrawing(false);
    ($('toggle-redaction-draw') as HTMLButtonElement).classList.remove('toggle-active');
    ($('toggle-redaction-draw') as HTMLButtonElement).textContent = 'Draw Redaction';

    log(`Applied ${regions.length} redaction annotation(s). PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    showToast(`Applied ${regions.length} redaction(s)`, 'success');

    show('result-section');
    $('download-info').textContent = `${signatureCount} signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Redaction failed: ${err.message}`, 'error');
    showToast(`Redaction failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 13: Extract Text ─────────────────────────────────────

$('extract-text').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Extracting text...', 'info');
  try {
    const { extractText } = await import('pdfbox-ts');
    const pages = await extractText(currentPdfBytes!);

    let totalItems = 0;
    for (const page of pages) {
      totalItems += page.items.length;
      if (page.text.trim()) {
        log(`  Page ${page.pageIndex + 1}: ${page.items.length} text items`, 'dim');
        // Show first 200 chars of each page
        const preview = page.text.trim().substring(0, 200);
        log(`    "${preview}${page.text.length > 200 ? '...' : ''}"`, 'dim');
      } else {
        log(`  Page ${page.pageIndex + 1}: (no text)`, 'dim');
      }
    }
    log(`Extracted ${totalItems} text items from ${pages.length} page(s)`, 'success');
  } catch (err: any) {
    log(`Text extraction failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 14: Extract Images ──────────────────────────────────

$('extract-images').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Extracting images...', 'info');
  try {
    const { extractImages } = await import('pdfbox-ts');
    const images = await extractImages(currentPdfBytes!);

    if (images.length === 0) {
      log('No images found in PDF', 'info');
      return;
    }

    for (const img of images) {
      log(
        `  Page ${img.pageIndex + 1}: "${img.name}" ${img.width}x${img.height} ${img.colorSpace} ` +
        `${img.filter} (${img.data.length.toLocaleString()} bytes)${img.hasSMask ? ' +alpha' : ''}`,
        'dim',
      );
    }
    log(`Extracted ${images.length} image(s)`, 'success');
  } catch (err: any) {
    log(`Image extraction failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 15: Drawing Operations ──────────────────────────────────

$('create-drawing').addEventListener('click', async () => {
  log('Creating drawing demo...', 'info');
  try {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const courier = await doc.embedFont(StandardFonts.Courier);
    const timesRoman = await doc.embedFont(StandardFonts.TimesRoman);
    const page = doc.addPage([612, 792]);

    // Title
    page.drawRectangle({
      x: 0, y: 742, width: 612, height: 50,
      color: rgb(0.1, 0.2, 0.4),
    });
    page.drawText('Drawing API Demo', {
      x: 50, y: 758, size: 24, font: helveticaBold, color: rgb(1, 1, 1),
    });

    // Text with different fonts
    page.drawText('Helvetica: The quick brown fox', {
      x: 50, y: 700, size: 14, font: helvetica, color: rgb(0, 0, 0),
    });
    page.drawText('Courier: Monospace text', {
      x: 50, y: 680, size: 14, font: courier, color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('Times Roman: Classic serif', {
      x: 50, y: 660, size: 14, font: timesRoman, color: rgb(0.5, 0, 0),
    });

    // Rectangles (filled + outlined)
    page.drawRectangle({
      x: 50, y: 570, width: 120, height: 60,
      color: rgb(0.2, 0.6, 0.9),
    });
    page.drawRectangle({
      x: 200, y: 570, width: 120, height: 60,
      borderColor: rgb(0.9, 0.2, 0.2), borderWidth: 3,
    });

    // Lines
    page.drawLine({
      start: { x: 50, y: 540 },
      end: { x: 550, y: 540 },
      thickness: 2,
      color: rgb(0, 0.5, 0),
    });
    page.drawLine({
      start: { x: 50, y: 520 },
      end: { x: 550, y: 520 },
      thickness: 1,
      dashArray: [6, 3],
      color: rgb(0.5, 0.5, 0.5),
    });

    // Circle
    page.drawCircle({
      x: 110, y: 440, size: 50,
      color: rgb(1, 0.8, 0),
      borderColor: rgb(0.8, 0.6, 0), borderWidth: 2,
    });

    // Ellipse
    page.drawEllipse({
      x: 300, y: 440, xScale: 80, yScale: 40,
      color: rgb(0.8, 0.2, 0.8),
      opacity: 0.5,
    });

    // Square
    page.drawSquare({
      x: 430, y: 400, size: 80,
      borderColor: rgb(0, 0, 0.8), borderWidth: 2,
      color: rgb(0.9, 0.9, 1),
    });

    // Text with rotation
    page.drawText('Rotated text!', {
      x: 100, y: 300, size: 18, font: helveticaBold,
      color: rgb(0.6, 0, 0.6), rotate: degrees(15),
    });

    // Text with opacity
    page.drawText('Semi-transparent text', {
      x: 50, y: 250, size: 24, font: helvetica,
      color: rgb(0, 0, 0), opacity: 0.3,
    });

    // Color variety
    const colors = [
      { c: rgb(1, 0, 0), label: 'Red' },
      { c: rgb(0, 0.7, 0), label: 'Green' },
      { c: rgb(0, 0, 1), label: 'Blue' },
      { c: rgb(1, 0.5, 0), label: 'Orange' },
      { c: rgb(0.5, 0, 0.5), label: 'Purple' },
    ];
    let cx = 50;
    for (const { c, label } of colors) {
      page.drawRectangle({ x: cx, y: 180, width: 90, height: 30, color: c });
      page.drawText(label, { x: cx + 5, y: 188, size: 11, font: helvetica, color: rgb(1, 1, 1) });
      cx += 100;
    }

    currentPdfBytes = await doc.save();
    signatureCount = 0;
    log(`Created drawing demo: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    log('  Exercises: drawText (4 fonts), drawRectangle, drawLine (solid+dashed), drawCircle, drawEllipse, drawSquare, rotation, opacity, colors', 'dim');

    $('load-status').innerHTML = '<span class="status-badge loaded">Drawing</span>';
    show('sign-section');
    show('result-section');
    $('download-info').textContent = `0 signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Drawing demo failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 16: Image Embedding ─────────────────────────────────────

const imageFileInput = $('image-file') as HTMLInputElement;
const embedImageBtn = $('embed-image') as HTMLButtonElement;

imageFileInput.addEventListener('change', () => {
  embedImageBtn.disabled = !imageFileInput.files?.length;
});

embedImageBtn.addEventListener('click', async () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;

  log(`Embedding image: ${file.name}...`, 'info');
  try {
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.create();

    const isJpeg = file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
    const image = isJpeg
      ? await doc.embedJpg(imageBytes)
      : await doc.embedPng(imageBytes);

    const imgDims = image.scale(1);
    const pageWidth = Math.max(imgDims.width + 100, 612);
    const pageHeight = Math.max(imgDims.height + 200, 792);
    const page = doc.addPage([pageWidth, pageHeight]);

    const helvetica = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawText(`Embedded: ${file.name}`, {
      x: 50, y: pageHeight - 50, size: 16, font: helvetica, color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`${imgDims.width}x${imgDims.height} (${isJpeg ? 'JPEG' : 'PNG'})`, {
      x: 50, y: pageHeight - 72, size: 12, font: helvetica, color: rgb(0.5, 0.5, 0.5),
    });

    page.drawImage(image, {
      x: 50,
      y: pageHeight - 100 - imgDims.height,
      width: imgDims.width,
      height: imgDims.height,
    });

    currentPdfBytes = await doc.save();
    signatureCount = 0;
    log(`Embedded ${file.name}: ${imgDims.width}x${imgDims.height} ${isJpeg ? 'JPEG' : 'PNG'}`, 'success');
    log(`PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    $('load-status').innerHTML = '<span class="status-badge loaded">Image PDF</span>';
    show('sign-section');
    show('result-section');
    $('download-info').textContent = `0 signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Image embedding failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 17: Page Management ─────────────────────────────────────

$('add-page').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Adding new page...', 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true, throwOnInvalidObject: false,
    });
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${doc.getPageCount()} — added by test harness`, {
      x: 50, y: 700, size: 18, font: helvetica, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(`Created at: ${new Date().toISOString()}`, {
      x: 50, y: 670, size: 12, font: helvetica, color: rgb(0.5, 0.5, 0.5),
    });

    currentPdfBytes = await doc.save();
    log(`Added page. Now ${doc.getPageCount()} page(s). PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    await refreshViewer();
  } catch (err: any) {
    log(`Add page failed: ${err.message}`, 'error');
    console.error(err);
  }
});

$('rotate-page').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  log('Rotating page 1 by 90 degrees...', 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true, throwOnInvalidObject: false,
    });
    const page = doc.getPage(0);
    const currentRotation = page.getRotation().angle;
    const newRotation = (currentRotation + 90) % 360;
    page.setRotation(degrees(newRotation));

    currentPdfBytes = await doc.save();
    log(`Rotated page 1: ${currentRotation}\u00B0 \u2192 ${newRotation}\u00B0. PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    await refreshViewer();
  } catch (err: any) {
    log(`Rotate page failed: ${err.message}`, 'error');
    console.error(err);
  }
});

$('remove-last-page').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true, throwOnInvalidObject: false,
    });
    const count = doc.getPageCount();
    if (count <= 1) {
      log('Cannot remove last page — PDF must have at least 1 page', 'error');
      return;
    }

    log(`Removing page ${count}...`, 'info');
    doc.removePage(count - 1);
    currentPdfBytes = await doc.save();
    log(`Removed page ${count}. Now ${count - 1} page(s). PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'success');
    await refreshViewer();
  } catch (err: any) {
    log(`Remove page failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Step 18: Two-Step Signing ────────────────────────────────────

$('twostep-sign').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  const btn = $('twostep-sign') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Preparing...';

  try {
    const certDer = await loadDerCert('/keys/user1.cert.der');
    const signer = createSigner(user1KeyPem, user1CertPem, certDer, 'User 1');

    log('Two-step: Step 1 — Preparing PDF with appearance...', 'info');

    const prepared = await preparePdfWithAppearance(currentPdfBytes!, signer, {
      signatureAppearance: {
        text: `Two-Step Signed - ${new Date().toLocaleString()}`,
        position: {
          page: 0,
          x: 50 + signatureCount * 260,
          y: 300,
          width: 240,
          height: 70,
        },
      },
      reason: 'Two-step approval',
      location: 'Browser Test Harness',
    });

    log(`  Prepared PDF: ${prepared.pdfBytes.length.toLocaleString()} bytes`, 'dim');

    btn.textContent = 'Signing...';
    log('Two-step: Step 2 — Applying cryptographic signature...', 'info');

    const result = await signPreparedPdfWithPDFBox(prepared, signer);

    currentPdfBytes = result.signedData;
    signatureCount++;

    log('Two-step signing complete!', 'success');
    log(`  Signature: ${result.signatureInfo.signatureSize} bytes`, 'dim');
    log(`  PDF size:  ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    const sigDiv = document.createElement('div');
    sigDiv.className = 'sig-info';
    sigDiv.setAttribute('data-sig', String(signatureCount));
    sigDiv.innerHTML = `
      <div><strong>Signature ${signatureCount}: User 1 (two-step)</strong></div>
      <div>ByteRange: [${result.signatureInfo.byteRange.join(', ')}]</div>
      <div>Size: ${result.signatureInfo.signatureSize} bytes</div>
    `;
    $('signatures-container').appendChild(sigDiv);

    show('result-section');
    $('download-info').textContent = `${signatureCount} signature(s) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Two-step signing failed: ${err.message}`, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Prepare \u2192 Sign (Two-Step)';
  }
});

// ── Step 19: Encrypt / Decrypt ────────────────────────────────

$('encrypt-pdf').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  const ownerPassword = ($('enc-owner-pwd') as HTMLInputElement).value;
  const userPassword = ($('enc-user-pwd') as HTMLInputElement).value;
  const keyLength = parseInt(($('enc-key-length') as HTMLSelectElement).value) as 128 | 256;

  if (!ownerPassword) {
    log('Owner password is required for encryption', 'error');
    return;
  }

  const permissions = {
    print: ($('perm-print') as HTMLInputElement).checked,
    copy: ($('perm-copy') as HTMLInputElement).checked,
    modify: ($('perm-modify') as HTMLInputElement).checked,
    annotate: ($('perm-annotate') as HTMLInputElement).checked,
  };

  log(`Encrypting PDF with AES-${keyLength}...`, 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });

    const encrypted = await doc.save({
      encrypt: {
        ownerPassword,
        userPassword,
        keyLength,
        permissions,
      },
    });

    currentPdfBytes = encrypted;
    // Track password so renderer can decrypt for display
    // Empty user password = no password needed to open, so only set if non-empty
    currentPassword = userPassword || undefined;
    log(`Encrypted! AES-${keyLength}, ${encrypted.length.toLocaleString()} bytes`, 'success');
    log(`  Owner password: "${ownerPassword}"`, 'dim');
    log(`  User password: ${userPassword ? `"${userPassword}"` : '(empty — no password needed to open)'}`, 'dim');
    log(`  Permissions: print=${permissions.print}, copy=${permissions.copy}, modify=${permissions.modify}, annotate=${permissions.annotate}`, 'dim');

    show('result-section');
    $('download-info').textContent = `Encrypted (AES-${keyLength}) \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;
    await refreshViewer();
  } catch (err: any) {
    log(`Encryption failed: ${err.message}`, 'error');
    console.error(err);
  }
});

$('decrypt-pdf').addEventListener('click', async () => {
  if (!currentPdfBytes) {
    log('No PDF loaded — load or create a PDF first', 'error');
    return;
  }

  const password = ($('dec-password') as HTMLInputElement).value;

  log(`Decrypting PDF${password ? '' : ' (trying empty password)'}...`, 'info');
  try {
    const doc = await PDFDocument.load(currentPdfBytes, {
      password: password || undefined,
      throwOnInvalidObject: false,
    });

    if (doc.isEncrypted) {
      log(`Decrypted! Encryption was: ${doc.encryptionType}`, 'success');
    } else {
      log('PDF was not encrypted — loaded normally', 'info');
    }

    // Save decrypted version (no longer encrypted)
    currentPdfBytes = await doc.save();
    currentPassword = undefined;
    log(`Decrypted PDF: ${currentPdfBytes.length.toLocaleString()} bytes (saved without encryption)`, 'success');

    $('load-status').innerHTML = '<span class="status-badge loaded">Decrypted</span>';
    show('sign-section');
    show('result-section');
    $('download-info').textContent = `Decrypted \u00B7 ${(currentPdfBytes.length / 1024).toFixed(0)} KB`;

    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Decryption failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Form Builder ────────────────────────────────────────────────

// Show/hide options row based on field type
$('form-field-type').addEventListener('change', () => {
  const type = ($('form-field-type') as HTMLSelectElement).value;
  const optionsRow = $('form-options-row');
  optionsRow.style.display = (type === 'dropdown' || type === 'radio') ? 'flex' : 'none';
});

function renderFormQueue() {
  const container = $('form-field-queue');
  container.innerHTML = '';
  const badge = $('form-queue-count');
  badge.textContent = formFieldQueue.length > 0 ? `(${formFieldQueue.length})` : '';

  for (let i = 0; i < formFieldQueue.length; i++) {
    const field = formFieldQueue[i];
    const item = document.createElement('div');
    item.className = 'form-field-queue-item';
    const optStr = field.options ? ` [${field.options.join(', ')}]` : '';
    item.innerHTML = `
      <span class="field-type-badge">${field.type}</span>
      <span>${field.name}${optStr}</span>
      <button class="remove-field" data-index="${i}">&times;</button>
    `;
    container.appendChild(item);
  }

  // Bind remove buttons
  container.querySelectorAll('.remove-field').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.index!);
      formFieldQueue.splice(idx, 1);
      renderFormQueue();
    });
  });
}

$('add-form-field').addEventListener('click', () => {
  const type = ($('form-field-type') as HTMLSelectElement).value as FormFieldConfig['type'];
  const name = ($('form-field-name') as HTMLInputElement).value.trim();

  if (!name) {
    log('Field name is required', 'error');
    showToast('Enter a field name', 'error');
    return;
  }

  // Check for duplicate names
  if (formFieldQueue.some(f => f.name === name)) {
    log(`Field "${name}" already in queue`, 'error');
    showToast(`Field "${name}" already exists`, 'error');
    return;
  }

  const config: FormFieldConfig = { type, name };

  if (type === 'dropdown' || type === 'radio') {
    const optStr = ($('form-field-options') as HTMLInputElement).value.trim();
    if (!optStr) {
      log('Options are required for dropdown/radio fields', 'error');
      showToast('Enter comma-separated options', 'error');
      return;
    }
    config.options = optStr.split(',').map(s => s.trim()).filter(Boolean);
  }

  formFieldQueue.push(config);
  renderFormQueue();
  log(`Added ${type} field "${name}" to queue`, 'dim');

  // Clear inputs
  ($('form-field-name') as HTMLInputElement).value = '';
  ($('form-field-options') as HTMLInputElement).value = '';
});

$('create-custom-form').addEventListener('click', async () => {
  if (formFieldQueue.length === 0) {
    log('Add at least one field to the queue first', 'error');
    showToast('Add fields before creating form', 'error');
    return;
  }

  log(`Creating custom form with ${formFieldQueue.length} field(s)...`, 'info');
  try {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);

    // Header
    page.drawRectangle({
      x: 0, y: 742, width: 612, height: 50,
      color: rgb(0.15, 0.25, 0.45),
    });
    page.drawText('Custom Form', {
      x: 50, y: 758, size: 22, font: helveticaBold, color: rgb(1, 1, 1),
    });

    const form = doc.getForm();
    let y = 680;
    const fieldSpacing = 50;

    for (const config of formFieldQueue) {
      if (y < 100) {
        // Add a new page if running out of space
        y = 750;
        doc.addPage([612, 792]);
      }

      page.drawText(`${config.name}:`, {
        x: 50, y, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
      });

      switch (config.type) {
        case 'text': {
          const tf = form.createTextField(config.name);
          tf.addToPage(page, {
            x: 150, y: y - 10, width: 300, height: 24,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
            backgroundColor: rgb(0.98, 0.98, 0.98),
          });
          break;
        }
        case 'checkbox': {
          const cb = form.createCheckBox(config.name);
          cb.addToPage(page, {
            x: 150, y: y - 8, width: 18, height: 18,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
            backgroundColor: rgb(0.98, 0.98, 0.98),
          });
          break;
        }
        case 'dropdown': {
          const dd = form.createDropdown(config.name);
          dd.setOptions(config.options || ['Option 1', 'Option 2']);
          dd.addToPage(page, {
            x: 150, y: y - 10, width: 300, height: 24,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
            backgroundColor: rgb(0.98, 0.98, 0.98),
          });
          break;
        }
        case 'radio': {
          const rg = form.createRadioGroup(config.name);
          const opts = config.options || ['Option 1', 'Option 2'];
          let rx = 150;
          for (const opt of opts) {
            page.drawText(opt, {
              x: rx + 22, y: y - 4, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3),
            });
            rg.addOptionToPage(opt, page, {
              x: rx, y: y - 8, width: 16, height: 16,
              borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1,
              backgroundColor: rgb(0.98, 0.98, 0.98),
            });
            rx += 90;
          }
          break;
        }
        case 'signature': {
          page.drawRectangle({
            x: 150, y: y - 60, width: 240, height: 70,
            borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1,
            color: rgb(0.97, 0.97, 0.97),
          });
          page.drawText('(signature area)', {
            x: 220, y: y - 30, size: 10, font: helvetica, color: rgb(0.7, 0.7, 0.7),
          });
          break;
        }
      }

      y -= fieldSpacing;
    }

    currentPdfBytes = await doc.save();
    signatureCount = 0;

    const fields = form.getFields();
    log(`Created custom form with ${fields.length} field(s): ${fields.map(f => f.getName()).join(', ')}`, 'success');
    showToast(`Created form with ${fields.length} field(s)`, 'success');
    log(`PDF: ${currentPdfBytes.length.toLocaleString()} bytes`, 'dim');

    // Clear queue
    formFieldQueue.length = 0;
    renderFormQueue();

    $('load-status').innerHTML = '<span class="status-badge loaded">Custom Form</span>';
    await showFields();
    await refreshViewer();
  } catch (err: any) {
    log(`Custom form creation failed: ${err.message}`, 'error');
    showToast(`Form creation failed: ${err.message}`, 'error');
    console.error(err);
  }
});

// ── Init ────────────────────────────────────────────────────────

log('pdfbox-ts test harness ready', 'info');
log('Load a PDF to begin, or click "Use Demo PDF" / "Create Form"', 'dim');
