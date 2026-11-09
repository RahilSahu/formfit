import { fitToRange, PRESETS } from "./fit.mjs";

const $ = (id) => document.getElementById(id);
const kb = (bytes) => (bytes / 1024).toFixed(1) + " KB";

/* ---------------- tabs ---------------- */
function showTab(which) {
  $("panel-image").hidden = which !== "image";
  $("panel-pdf").hidden = which !== "pdf";
  $("tab-image").classList.toggle("active", which === "image");
  $("tab-pdf").classList.toggle("active", which === "pdf");
}
$("tab-image").addEventListener("click", () => showTab("image"));
$("tab-pdf").addEventListener("click", () => showTab("pdf"));

/* ---------------- image mode ---------------- */
const presetSelect = $("preset");
for (const p of PRESETS) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.label;
  presetSelect.appendChild(opt);
}
presetSelect.addEventListener("change", () => {
  const p = PRESETS.find((x) => x.id === presetSelect.value);
  if (!p) return;
  $("in-w").value = p.w || "";
  $("in-h").value = p.h || "";
  $("in-min").value = p.minKB;
  $("in-max").value = p.maxKB;
});

let sourceImage = null; // HTMLImageElement
let sourceName = "photo";

$("file-image").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  sourceName = file.name.replace(/\.[^.]+$/, "") || "photo";
  sourceImage = await loadImage(file);
  const prev = $("preview-image");
  prev.src = sourceImage.src;
  prev.hidden = false;
  $("go-image").disabled = false;
  $("error-image").textContent = "";
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image. If it is an iPhone HEIC photo, convert it to JPG first (Settings, Camera, Formats, Most Compatible)."));
    img.src = url;
  });
}

/** Center-crop the source to the target aspect, then hand back a canvas
 *  at the target pixel size (or native size when no target is set). */
function baseCanvas(targetW, targetH) {
  const sw = sourceImage.naturalWidth, sh = sourceImage.naturalHeight;
  let cropW = sw, cropH = sh, sx = 0, sy = 0;
  if (targetW && targetH) {
    const targetAspect = targetW / targetH;
    if (sw / sh > targetAspect) { cropW = Math.round(sh * targetAspect); sx = Math.round((sw - cropW) / 2); }
    else { cropH = Math.round(sw / targetAspect); sy = Math.round((sh - cropH) / 2); }
  }
  const outW = targetW || cropW, outH = targetH || cropH;
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(sourceImage, sx, sy, cropW, cropH, 0, 0, outW, outH);
  return canvas;
}

function canvasEncoder(canvas) {
  return (quality, scale) =>
    new Promise((resolve) => {
      if (scale === 1.0) {
        canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), "image/jpeg", quality);
        return;
      }
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(canvas.width * scale));
      small.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = small.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, small.width, small.height);
      ctx.drawImage(canvas, 0, 0, small.width, small.height);
      small.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), "image/jpeg", quality);
    });
}

$("go-image").addEventListener("click", async () => {
  const err = $("error-image");
  err.textContent = "";
  try {
    const targetW = parseInt($("in-w").value || "0", 10);
    const targetH = parseInt($("in-h").value || "0", 10);
    const minKB = parseFloat($("in-min").value || "0");
    const maxKB = parseFloat($("in-max").value || "0");
    if (!(maxKB > 0)) throw new Error("Set a maximum size in KB.");
    if (minKB >= maxKB) throw new Error("Minimum must be smaller than maximum.");
    const canvas = baseCanvas(targetW, targetH);
    const { bytes } = await fitToRange(canvasEncoder(canvas), { minKB, maxKB });
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    $("out-preview").src = url;
    const dims = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(`${i.naturalWidth} x ${i.naturalHeight} px`);
      i.src = url;
    });
    $("checks-image").innerHTML = [
      `Final size: ${kb(bytes.length)} (target ${minKB} to ${maxKB} KB)`,
      `Dimensions: ${dims}`,
      "Format: JPG",
      "Processed on your device. Nothing was uploaded.",
    ].map((t) => `<li>${t}</li>`).join("");
    const dl = $("download-image");
    dl.href = url;
    dl.download = `${sourceName}-formfit.jpg`;
    $("result-image").hidden = false;
  } catch (e) {
    err.textContent = e.message || String(e);
  }
});

/* ---------------- PDF mode ---------------- */
let pdfFiles = [];
$("file-pdf").addEventListener("change", (e) => {
  pdfFiles = [...e.target.files];
  $("pdf-count").textContent = pdfFiles.length
    ? `${pdfFiles.length} page(s) selected, in order.`
    : "";
  $("go-pdf").disabled = pdfFiles.length === 0;
  $("error-pdf").textContent = "";
});

async function imageBlobToJpegBytes(file, quality, maxDim = 1240) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

$("go-pdf").addEventListener("click", async () => {
  const err = $("error-pdf");
  err.textContent = "";
  try {
    if (!window.PDFLib) throw new Error("The PDF library has not loaded yet. Check your connection and try again in a few seconds.");
    const maxBytes = parseInt($("in-pdf-max").value, 10) * 1024;
    let built = null;
    for (const quality of [0.85, 0.7, 0.55, 0.4, 0.28, 0.18]) {
      const doc = await window.PDFLib.PDFDocument.create();
      for (const file of pdfFiles) {
        const { bytes, w, h } = await imageBlobToJpegBytes(file, quality);
        const embedded = await doc.embedJpg(bytes);
        const page = doc.addPage([w, h]);
        page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
      }
      const out = await doc.save();
      built = out;
      if (out.length <= maxBytes) break;
    }
    const blob = new Blob([built], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    $("checks-pdf").innerHTML = [
      `Final PDF: ${kb(built.length)} (${pdfFiles.length} page(s), limit ${kb(maxBytes)})`,
      built.length <= maxBytes ? "Inside your portal limit." : "Even the strongest setting could not reach that limit; the smallest possible PDF is offered.",
      "Processed on your device. Nothing was uploaded.",
    ].map((t) => `<li>${t}</li>`).join("");
    $("download-pdf").href = url;
    $("result-pdf").hidden = false;
  } catch (e) {
    err.textContent = e.message || String(e);
  }
});
