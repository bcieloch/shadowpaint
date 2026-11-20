import { computeTransformScales } from '@/imaging/transform';
import type { ImportSlotDraft } from '@/services/importService';

export function drawTransformedThumbnail(
  canvas: HTMLCanvasElement,
  slot: ImportSlotDraft,
  targetWidthPx: number,
  targetHeightPx: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0f0f12';
  ctx.fillRect(0, 0, w, h);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = slot.decoded.thumbWidth;
  srcCanvas.height = slot.decoded.thumbHeight;
  const sCtx = srcCanvas.getContext('2d');
  if (!sCtx) return;
  const copy = new Uint8ClampedArray(slot.decoded.thumbRgba.length);
  copy.set(slot.decoded.thumbRgba);
  sCtx.putImageData(new ImageData(copy, slot.decoded.thumbWidth, slot.decoded.thumbHeight), 0, 0);

  const scales = computeTransformScales(
    slot.decoded.width,
    slot.decoded.height,
    targetWidthPx,
    targetHeightPx,
    slot.fit,
    slot.transform,
  );

  const previewScaleX = w / targetWidthPx;
  const previewScaleY = h / targetHeightPx;

  ctx.save();
  ctx.translate(
    w / 2 + slot.transform.offsetXPx * previewScaleX,
    h / 2 + slot.transform.offsetYPx * previewScaleY,
  );
  ctx.scale(scales.scaleX * previewScaleX, scales.scaleY * previewScaleY);
  if (slot.transform.flipH) ctx.scale(-1, 1);
  if (slot.transform.flipV) ctx.scale(1, -1);
  ctx.rotate((slot.transform.rotate90 * Math.PI) / 2);

  const crop = scales.crop;
  const thumbRatioX = slot.decoded.thumbWidth / slot.decoded.width;
  const thumbRatioY = slot.decoded.thumbHeight / slot.decoded.height;

  ctx.drawImage(
    srcCanvas,
    crop.x * thumbRatioX,
    crop.y * thumbRatioY,
    crop.w * thumbRatioX,
    crop.h * thumbRatioY,
    -crop.w / 2,
    -crop.h / 2,
    crop.w,
    crop.h,
  );
  ctx.restore();
}
