/**
 * fit.mjs: fit an image into a portal's file-size RANGE.
 *
 * Portals do not just cap file size, they specify a window: a minimum
 * AND a maximum in KB. Too heavy is rejected, and so is too light.
 * This module finds the highest JPEG quality that fits under the max
 * (downscaling only when quality alone cannot get there), then, if the
 * result is under the minimum, pads the JPEG with a comment segment to
 * land mid-range. The picture itself is never altered by padding.
 *
 * The encoder is injected, so the search logic is unit-testable in
 * Node with a fake encoder and runs in the browser with a canvas one.
 *
 * encode(quality, scale) -> Promise<Uint8Array>  (a JPEG byte array)
 */

/** Insert JPEG COM (comment) segments so the file reaches targetBytes.
 *  Pure byte surgery: SOI (FFD8) is kept first, segments are inserted
 *  right after it. Viewers and portal validators read past comments. */
export function padJpeg(bytes, targetBytes) {
  if (bytes.length >= targetBytes) return bytes;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("not a JPEG (missing FFD8 SOI)");
  }
  let needed = targetBytes - bytes.length;
  const chunks = [];
  while (needed > 0) {
    // A COM segment: FF FE + 2-byte length (incl. length bytes) + data.
    // Max segment payload is 65533 bytes; each segment adds 4 overhead.
    const payload = Math.min(needed - 4, 65533);
    if (payload < 0) {
      // 1 to 3 bytes short: the smallest legal COM segment is 4 bytes
      // (marker + length 2 + no data). Overshooting by up to 3 bytes
      // is safe because padding only happens when targeting mid-range.
      chunks.push(new Uint8Array([0xff, 0xfe, 0x00, 0x02]));
      needed = 0;
      break;
    }
    const seg = new Uint8Array(payload + 4);
    seg[0] = 0xff; seg[1] = 0xfe;
    seg[2] = ((payload + 2) >> 8) & 0xff;
    seg[3] = (payload + 2) & 0xff;
    seg.fill(0x20, 4); // spaces: a harmless comment
    chunks.push(seg);
    needed -= payload + 4;
  }
  const total = bytes.length + chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  out.set(bytes.subarray(0, 2), 0);
  let offset = 2;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  out.set(bytes.subarray(2), offset);
  return out;
}

/** Binary-search the best quality at one scale. Returns the largest
 *  encoding that is <= maxBytes, or null when even the floor quality
 *  is too heavy. */
export async function bestAtScale(encode, scale, maxBytes, floor = 0.05) {
  let lo = floor, hi = 1.0, best = null;
  const atFloor = await encode(floor, scale);
  if (atFloor.length > maxBytes) return null;
  best = atFloor;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const candidate = await encode(mid, scale);
    if (candidate.length <= maxBytes) { best = candidate; lo = mid; }
    else { hi = mid; }
  }
  return best;
}

/**
 * Fit an image into [minKB, maxKB] (1 KB = 1024 bytes, as portals
 * count it). Returns { bytes, qualityPath } where bytes is guaranteed
 * inside the range, or throws when the range is unreachable.
 */
export async function fitToRange(encode, { minKB = 0, maxKB, downscaleSteps = 8 }) {
  const minBytes = Math.round(minKB * 1024);
  const maxBytes = Math.round(maxKB * 1024);
  const path = [];
  let scale = 1.0;
  let fitted = null;
  for (let step = 0; step <= downscaleSteps; step++) {
    fitted = await bestAtScale(encode, scale, maxBytes);
    path.push(`scale ${scale.toFixed(2)}: ${fitted ? fitted.length + " bytes" : "too heavy"}`);
    if (fitted) break;
    scale *= 0.8;
  }
  if (!fitted) {
    throw new Error(`cannot fit under ${maxKB} KB even after downscaling`);
  }
  if (fitted.length < minBytes) {
    // Aim for the middle of the range: safely above the floor even if
    // a portal re-saves the file, safely below the ceiling.
    const target = Math.min(maxBytes, Math.round((minBytes + maxBytes) / 2));
    fitted = padJpeg(fitted, Math.max(target, minBytes));
    path.push(`padded to ${fitted.length} bytes (min ${minBytes})`);
  }
  return { bytes: fitted, path };
}

/** Portal presets. Specs as commonly published in recent notices;
 *  they change between cycles, so the UI always offers Custom and
 *  tells the user to check their own notice. */
export const PRESETS = [
  { id: "ibps-photo", label: "Bank exams photo (IBPS/SBI)", w: 200, h: 230, minKB: 20, maxKB: 50 },
  { id: "ibps-sign", label: "Bank exams signature", w: 140, h: 60, minKB: 10, maxKB: 20 },
  { id: "ssc-sign", label: "SSC signature", w: 240, h: 80, minKB: 10, maxKB: 20 },
  { id: "upsc-photo", label: "UPSC photo / signature", w: 350, h: 350, minKB: 20, maxKB: 300 },
  { id: "nta-photo", label: "NTA (JEE/NEET/CUET) photo", w: 350, h: 450, minKB: 10, maxKB: 200 },
  { id: "passport-in", label: "Passport photo (3.5 x 4.5 cm, 300 dpi)", w: 413, h: 531, minKB: 0, maxKB: 200 },
  { id: "doc-200", label: "Document scan, under 200 KB", w: 0, h: 0, minKB: 0, maxKB: 200 },
  { id: "doc-300", label: "Document scan, under 300 KB", w: 0, h: 0, minKB: 0, maxKB: 300 },
];
