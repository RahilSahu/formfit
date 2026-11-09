import { test } from "node:test";
import assert from "node:assert/strict";
import { fitToRange, padJpeg, PRESETS } from "../fit.mjs";

/** Fake JPEG encoder: size grows with quality^2 and scale^2, like the
 *  real thing. Returns bytes starting with the FFD8 SOI marker. */
function fakeEncoder(baseBytes) {
  return async (quality, scale) => {
    const size = Math.max(400, Math.round(baseBytes * quality * quality * scale * scale));
    const bytes = new Uint8Array(size);
    bytes[0] = 0xff; bytes[1] = 0xd8;
    return bytes;
  };
}

test("heavy photo is compressed under the max, no padding needed", async () => {
  const { bytes } = await fitToRange(fakeEncoder(4_000_000), { minKB: 20, maxKB: 50 });
  assert.ok(bytes.length <= 50 * 1024, `got ${bytes.length}`);
  assert.ok(bytes.length >= 20 * 1024, `got ${bytes.length}`);
});

test("tiny signature is padded UP into the range", async () => {
  const { bytes, path } = await fitToRange(fakeEncoder(6_000), { minKB: 10, maxKB: 20 });
  assert.ok(bytes.length >= 10 * 1024, `got ${bytes.length}`);
  assert.ok(bytes.length <= 20 * 1024, `got ${bytes.length}`);
  assert.ok(path.some((p) => p.includes("padded")), path.join("; "));
});

test("padding keeps a valid JPEG structure at the exact target", () => {
  const src = new Uint8Array(1000);
  src[0] = 0xff; src[1] = 0xd8; src[999] = 0xd9;
  const out = padJpeg(src, 15 * 1024);
  assert.equal(out.length, 15 * 1024);
  assert.equal(out[0], 0xff); assert.equal(out[1], 0xd8);
  assert.equal(out[2], 0xff); assert.equal(out[3], 0xfe); // COM marker follows SOI
  assert.equal(out[out.length - 1], 0xd9, "original tail preserved");
});

test("padding a non-JPEG throws", () => {
  assert.throws(() => padJpeg(new Uint8Array([1, 2, 3]), 5000), /not a JPEG/);
});

test("large padding spans multiple COM segments exactly", () => {
  const src = new Uint8Array(500);
  src[0] = 0xff; src[1] = 0xd8;
  const out = padJpeg(src, 200 * 1024);
  assert.equal(out.length, 200 * 1024);
});

test("downscale path engages when quality alone cannot fit", async () => {
  // base so large that even quality 0.05 at scale 1 exceeds 20 KB,
  // but a smaller scale fits.
  const { bytes, path } = await fitToRange(fakeEncoder(60_000_000), { minKB: 0, maxKB: 20 });
  assert.ok(bytes.length <= 20 * 1024);
  assert.ok(path.length > 1, "should have tried more than one scale");
});

test("unreachable range throws instead of lying", async () => {
  const stuck = async () => new Uint8Array(10_000_000);
  await assert.rejects(() => fitToRange(stuck, { maxKB: 20 }), /cannot fit/);
});

test("presets are sane: min below max, positive dimensions when set", () => {
  for (const p of PRESETS) {
    assert.ok(p.minKB < p.maxKB, p.id);
    if (p.w > 0) assert.ok(p.h > 0, p.id);
  }
});
