import type { jsPDF } from 'jspdf';
import type { ProjectSettings } from '@/core/types';
import {
  prepareColorPdfImage,
  prepareColorTilePdfImage,
  prepareHeightContoursPdfImage,
  type EncodedPdfImage,
} from '@/export/pdf/imagePrep';
import { computeGridDivisions, computeTiles1to1Layout } from '@/export/pdf/tiling';

export interface ExtendedPdfContext {
  project: ProjectSettings;
  colorEffective: Uint8ClampedArray | Uint8Array;
  heightEffective: Float32Array;
  pageW: number;
  pageH: number;
  contentW: number;
  marginMm: number;
  footerReserveMm: number;
  fontName: string;
  labels: {
    sectionGridColorTitle: string;
    sectionGridHeightTitle: string;
    sectionTile1to1Title: string;
    gridSubtitle: string;
    gridColorCaption: string;
    gridHeightCaption: string;
    tileMeta: string;
    tileOverlapNote: string;
    tileControlRulerLabel: string;
    scaleBarLabel: string;
  };
  drawPageHeader: (doc: jsPDF, pageW: number, title: string, subtitle: string) => number;
  fitRectInBox: (
    imgW: number,
    imgH: number,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
  ) => { x: number; y: number; w: number; h: number };
  addEmbeddedImage: (
    doc: jsPDF,
    img: EncodedPdfImage,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  formatTemplate: (template: string, params: Record<string, string | number>) => string;
  onProgress?: (progress01: number) => void;
}

function drawGridOverlayWithLabels(
  doc: jsPDF,
  ctx: ExtendedPdfContext,
  box: { x: number; y: number; w: number; h: number },
  spacingCm: number,
): void {
  const { widthCm, heightCm } = ctx.project.canvas;
  const cols = computeGridDivisions(widthCm, spacingCm, 'col');
  const rows = computeGridDivisions(heightCm, spacingCm, 'row');
  const pxPerCmX = box.w / Math.max(0.01, widthCm);
  const pxPerCmY = box.h / Math.max(0.01, heightCm);

  // Subtle white halo under dark amber grid lines for contrast over dark or bright areas
  for (let i = 1; i < cols.length; i++) {
    const col = cols[i];
    if (!col) continue;
    const gx = box.x + col.startCm * pxPerCmX;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(gx, box.y, gx, box.y + box.h);
    doc.setDrawColor(180, 75, 10);
    doc.setLineWidth(0.22);
    doc.line(gx, box.y, gx, box.y + box.h);
  }
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const gy = box.y + row.startCm * pxPerCmY;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(box.x, gy, box.x + box.w, gy);
    doc.setDrawColor(180, 75, 10);
    doc.setLineWidth(0.22);
    doc.line(box.x, gy, box.x + box.w, gy);
  }

  // Outer frame + 1 cm edge ruler ticks
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(0.35);
  doc.rect(box.x, box.y, box.w, box.h, 'S');

  for (let cm = 0; cm <= Math.floor(widthCm + 1e-6); cm++) {
    const tx = box.x + cm * pxPerCmX;
    const isMajor =
      spacingCm >= 1
        ? Math.abs(cm / spacingCm - Math.round(cm / spacingCm)) < 1e-6
        : cm % 5 === 0;
    const tickLen = isMajor ? 2.2 : 1.1;
    doc.line(tx, box.y - tickLen, tx, box.y);
    doc.line(tx, box.y + box.h, tx, box.y + box.h + tickLen);
  }
  for (let cm = 0; cm <= Math.floor(heightCm + 1e-6); cm++) {
    const ty = box.y + cm * pxPerCmY;
    const isMajor =
      spacingCm >= 1
        ? Math.abs(cm / spacingCm - Math.round(cm / spacingCm)) < 1e-6
        : cm % 5 === 0;
    const tickLen = isMajor ? 2.2 : 1.1;
    doc.line(box.x - tickLen, ty, box.x, ty);
    doc.line(box.x + box.w, ty, box.x + box.w + tickLen, ty);
  }

  // Column headers (A, B, C...) & Row headers (1, 2, 3...) >= 8 pt, high contrast
  doc.setFont(ctx.fontName, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  for (const col of cols) {
    const cx = box.x + ((col.startCm + col.endCm) / 2) * pxPerCmX;
    doc.text(col.label, cx, box.y - 3.2, { align: 'center' });
    doc.text(col.label, cx, box.y + box.h + 5.8, { align: 'center' });
  }
  for (const row of rows) {
    const cy = box.y + ((row.startCm + row.endCm) / 2) * pxPerCmY + 1.1;
    doc.text(row.label, box.x - 4.2, cy, { align: 'right' });
    doc.text(row.label, box.x + box.w + 4.2, cy, { align: 'left' });
  }
}

export function appendReferenceGridPages(doc: jsPDF, ctx: ExtendedPdfContext): void {
  const { project, pageW, pageH, contentW, marginMm, footerReserveMm, labels } = ctx;
  const { canvas } = project;
  const spacingCm = Math.max(0.5, project.export.gridSheetSpacingCm || 5);
  const cols = computeGridDivisions(canvas.widthCm, spacingCm, 'col');
  const rows = computeGridDivisions(canvas.heightCm, spacingCm, 'row');
  const lastCol = cols[cols.length - 1]?.label ?? 'A';
  const lastRow = rows[rows.length - 1]?.label ?? '1';
  const subtitle = ctx.formatTemplate(labels.gridSubtitle, {
    spacing: spacingCm,
    lastCol,
    lastRow,
  });

  const labelPadX = 11;
  const labelPadTop = 11;
  const labelPadBottom = 14;

  // Page 6: Color Map Reference Grid
  doc.addPage();
  let y = ctx.drawPageHeader(doc, pageW, labels.sectionGridColorTitle, project.name);
  doc.setFont(ctx.fontName, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(48, 48, 56);
  doc.text(subtitle, marginMm, y + 1.5);
  doc.text(labels.gridColorCaption, pageW - marginMm, y + 1.5, { align: 'right' });
  y += 4;

  const colorImg = prepareColorPdfImage(ctx.colorEffective, canvas.widthPx, canvas.heightPx, 1024);
  const colorBox = ctx.fitRectInBox(
    colorImg.width,
    colorImg.height,
    marginMm + labelPadX,
    y + labelPadTop,
    contentW - labelPadX * 2,
    pageH - marginMm - footerReserveMm - y - labelPadTop - labelPadBottom,
  );
  ctx.addEmbeddedImage(doc, colorImg, colorBox.x, colorBox.y, colorBox.w, colorBox.h);
  drawGridOverlayWithLabels(doc, ctx, colorBox, spacingCm);

  ctx.onProgress?.(0.86);

  // Page 7: Height Map Reference Grid + Contours
  doc.addPage();
  y = ctx.drawPageHeader(doc, pageW, labels.sectionGridHeightTitle, project.name);
  const spanMm = Math.max(0.01, canvas.maxThicknessMm - canvas.minThicknessMm);
  const contourStepMm = spanMm >= 1 ? 1 : Number((spanMm / 5).toFixed(2));

  doc.setFont(ctx.fontName, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(48, 48, 56);
  doc.text(subtitle, marginMm, y + 1.5);
  doc.text(
    ctx.formatTemplate(labels.gridHeightCaption, { step: contourStepMm }),
    pageW - marginMm,
    y + 1.5,
    { align: 'right' },
  );
  y += 4;

  const heightImg = prepareHeightContoursPdfImage(
    ctx.heightEffective,
    canvas.widthPx,
    canvas.heightPx,
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    1024,
  );
  const heightBox = ctx.fitRectInBox(
    heightImg.width,
    heightImg.height,
    marginMm + labelPadX,
    y + labelPadTop,
    contentW - labelPadX * 2,
    pageH - marginMm - footerReserveMm - y - labelPadTop - labelPadBottom,
  );
  ctx.addEmbeddedImage(doc, heightImg, heightBox.x, heightBox.y, heightBox.w, heightBox.h);
  drawGridOverlayWithLabels(doc, ctx, heightBox, spacingCm);

  ctx.onProgress?.(0.92);
}

function drawRegistrationCross(doc: jsPDF, cx: number, cy: number, armMm = 3): void {
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(0.25);
  doc.line(cx - armMm, cy, cx + armMm, cy);
  doc.line(cx, cy - armMm, cx, cy + armMm);
  doc.circle(cx, cy, 1.1, 'S');
}

function drawControlRuler10Cm(
  doc: jsPDF,
  fontName: string,
  x: number,
  y: number,
  maxLabelW: number,
  label: string,
): void {
  const rulerLengthMm = 100; // Exact 10 cm = 283.464567 pt
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(0.5);
  doc.line(x, y, x + rulerLengthMm, y);

  for (let mm = 0; mm <= rulerLengthMm; mm += 5) {
    const tx = x + mm;
    const tickH = mm % 10 === 0 ? 3.2 : 1.8;
    doc.setLineWidth(mm % 10 === 0 ? 0.4 : 0.25);
    doc.line(tx, y - tickH, tx, y);
  }

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text('0', x, y + 3.4, { align: 'center' });
  doc.text('5 cm', x + 50, y + 3.4, { align: 'center' });
  doc.text('10 cm', x + 100, y + 3.4, { align: 'center' });

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.5);
  doc.text(label, x + rulerLengthMm + 5, y + 0.5, { maxWidth: Math.max(40, maxLabelW) });
}

export function appendTiled1to1Pages(doc: jsPDF, ctx: ExtendedPdfContext): void {
  const { project, pageW, pageH, contentW, marginMm, footerReserveMm, labels } = ctx;
  const { canvas } = project;
  const headerBottomY = marginMm + 13;
  const topInfoH = 14;
  const bottomRulerReserve = 21;

  const slotWmm = Math.max(40, contentW - 14);
  const slotHmm = Math.max(
    40,
    pageH - marginMm - footerReserveMm - headerBottomY - topInfoH - bottomRulerReserve,
  );

  const tiles = computeTiles1to1Layout({
    widthCm: canvas.widthCm,
    heightCm: canvas.heightCm,
    widthPx: canvas.widthPx,
    heightPx: canvas.heightPx,
    slotWmm,
    slotHmm,
    overlapMm: 10,
  });

  const totalCols = Math.max(...tiles.map((t) => t.col)) + 1;
  const totalRows = Math.max(...tiles.map((t) => t.row)) + 1;

  tiles.forEach((tile, idx) => {
    doc.addPage();
    const y = ctx.drawPageHeader(
      doc,
      pageW,
      ctx.formatTemplate(labels.sectionTile1to1Title, { tileId: tile.id }),
      project.name,
    );

    // Tile badge + physical coordinate summary
    doc.setFillColor(24, 24, 27);
    doc.rect(marginMm, y, 16, 7.5, 'F');
    doc.setFont(ctx.fontName, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(tile.id, marginMm + 8, y + 5.2, { align: 'center' });

    doc.setFont(ctx.fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(24, 24, 27);
    doc.text(
      ctx.formatTemplate(labels.tileMeta, {
        tileId: tile.id,
        col: tile.col + 1,
        cols: totalCols,
        row: tile.row + 1,
        rows: totalRows,
        x0: (tile.x0Mm / 10).toFixed(1),
        x1: ((tile.x0Mm + tile.tileWmm) / 10).toFixed(1),
        y0: (tile.y0Mm / 10).toFixed(1),
        y1: ((tile.y0Mm + tile.tileHmm) / 10).toFixed(1),
      }),
      marginMm + 19,
      y + 3.2,
    );

    doc.setFont(ctx.fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(55, 55, 64);
    doc.text(labels.tileOverlapNote, marginMm + 19, y + 7.2);

    // Exact 1:1 physical placement centered inside slot
    const tileImg = prepareColorTilePdfImage(
      ctx.colorEffective,
      canvas.widthPx,
      canvas.heightPx,
      { x: tile.srcX, y: tile.srcY, w: tile.srcW, h: tile.srcH },
      1400,
    );

    const tileX = marginMm + (contentW - tile.tileWmm) / 2;
    const tileY = y + topInfoH;
    ctx.addEmbeddedImage(doc, tileImg, tileX, tileY, tile.tileWmm, tile.tileHmm);

    // Dashed 1 cm overlap seam guides
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([2, 1.5], 0);
    if (tile.overlapLeftMm > 0) {
      const lx = tileX + tile.overlapLeftMm;
      doc.line(lx, tileY, lx, tileY + tile.tileHmm);
    }
    if (tile.overlapRightMm > 0) {
      const rx = tileX + tile.tileWmm - tile.overlapRightMm;
      doc.line(rx, tileY, rx, tileY + tile.tileHmm);
    }
    if (tile.overlapTopMm > 0) {
      const ty = tileY + tile.overlapTopMm;
      doc.line(tileX, ty, tileX + tile.tileWmm, ty);
    }
    if (tile.overlapBottomMm > 0) {
      const by = tileY + tile.tileHmm - tile.overlapBottomMm;
      doc.line(tileX, by, tileX + tile.tileWmm, by);
    }
    doc.setLineDashPattern([], 0);

    // Corner crop / registration crosshairs
    drawRegistrationCross(doc, tileX, tileY);
    drawRegistrationCross(doc, tileX + tile.tileWmm, tileY);
    drawRegistrationCross(doc, tileX, tileY + tile.tileHmm);
    drawRegistrationCross(doc, tileX + tile.tileWmm, tileY + tile.tileHmm);

    // Bottom 10 cm calibration control ruler above footer
    const rulerY = pageH - marginMm - footerReserveMm - 9;
    drawControlRuler10Cm(
      doc,
      ctx.fontName,
      marginMm,
      rulerY,
      contentW - 105,
      labels.tileControlRulerLabel,
    );

    ctx.onProgress?.(0.92 + ((idx + 1) / tiles.length) * 0.07);
  });
}
