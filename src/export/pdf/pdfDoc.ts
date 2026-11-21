import { jsPDF } from 'jspdf';
import { clamp01 } from '@/core/maps/quantize';
import { colorSpecToHex } from '@/core/units/colorTemperature';
import type { LightingMode, PdfOrientation, PdfPageSize, ProjectSettings } from '@/core/types';
import { valueToMm } from '@/core/units/calibration';
import { sampleTurboRgb01 } from '@/core/units/colormaps';
import { frontLightToPolar, frontLightToWorld } from '@/core/units/lighting';
import {
  appendReferenceGridPages,
  appendTiled1to1Pages,
  type ExtendedPdfContext,
} from '@/export/pdf/extendedPages';
import type { PdfFontData } from '@/export/pdf/fontLoader';
import {
  prepareColorPdfImage,
  prepareGrayscalePdfImage,
  prepareHeatmapPdfImage,
  prepareRgbPreviewPdfImage,
  type EncodedPdfImage,
} from '@/export/pdf/imagePrep';
import type { ProjectMapStats } from '@/export/settingsJson';

export interface PdfLabels {
  docTitle: string;
  generatedBy: string;
  pageOf: string; // expects {page}, {total}
  exportedAt: string;
  sectionCoverTitle: string;
  sectionColorTitle: string;
  sectionHeightTitle: string;
  sectionOpacityTitle: string;
  sectionLightingTitle: string;
  sectionGridColorTitle: string;
  sectionGridHeightTitle: string;
  sectionTile1to1Title: string; // expects {tileId}
  specProject: string;
  specCanvasSize: string;
  specResolution: string;
  specDensity: string;
  specThicknessRange: string;
  specMmPerLevel: string;
  specReliefMultiplier: string;
  specMeshDetail: string;
  specLightingMode: string;
  previewsTitle: string;
  previewFront: string;
  previewBack: string;
  previewCombined: string;
  previewUnavailable: string;
  colorCaption: string;
  scaleBarLabel: string; // expects {cm}
  heightGrayTitle: string;
  heightHeatTitle: string;
  heightStatsSummary: string; // expects {min}, {max}, {mean}
  heightLegendTitle: string;
  heightTableTitle: string;
  tablePct: string;
  tableLevel8: string;
  tableThicknessMm: string;
  opacityCaption: string;
  opacityLegendTitle: string;
  opacityStatsSummary: string; // expects {min}, {max}, {mean}
  opacityOpaqueLabel: string;
  opacityTransmissiveLabel: string;
  frontLightTitle: string;
  backLightTitle: string;
  sceneMixTitle: string;
  materialTitle: string;
  beerLambertTitle: string;
  rowFrontPosCartesian: string;
  rowFrontTarget: string;
  rowFrontPolar: string;
  rowFrontDistance: string;
  rowIntensity: string;
  rowColor: string;
  rowSourceSize: string;
  rowConePenumbra: string;
  rowShadows: string;
  rowBackType: string;
  rowBackTypePoint: string;
  rowBackTypePanel: string;
  rowBackPos: string;
  rowBackGlobalT: string;
  rowBackAttenuation: string;
  rowLightingMode: string;
  rowModeFront: string;
  rowModeBack: string;
  rowModeCombined: string;
  rowBalance: string;
  rowExposure: string;
  rowAmbient: string;
  rowMaterialPreset: string;
  rowRoughness: string;
  rowMuA: string;
  rowMuS: string;
  rowKTint: string;
  rowCanvasT: string;
  rowScatterRadius: string;
  rowCanvasBackColor: string;
  beerLambertFormula1: string;
  beerLambertFormula2: string;
  beerLambertNote: string;
  gridSubtitle: string; // expects {spacing}, {lastCol}, {lastRow}
  gridColorCaption: string;
  gridHeightCaption: string; // expects {step}
  tileMeta: string; // expects {tileId}, {col}, {cols}, {row}, {rows}, {x0}, {x1}, {y0}, {y1}
  tileOverlapNote: string;
  tileControlRulerLabel: string;
  yes: string;
  no: string;
}

export interface PdfPreviewInput {
  mode: LightingMode;
  width: number;
  height: number;
  rgb: Uint8Array;
}

export interface BuildDocumentationPdfInput {
  project: ProjectSettings;
  stats: ProjectMapStats;
  colorEffective: Uint8ClampedArray | Uint8Array;
  heightEffective: Float32Array;
  opacityEffective: Float32Array;
  previews?: Partial<Record<LightingMode, PdfPreviewInput>>;
  fonts: PdfFontData;
  labels: PdfLabels;
  exportedAt: string;
  onProgress?: (progress01: number) => void;
}

const FONT_REGULAR = 'DejaVuSans';
const MARGIN_MM = 12;

function toJsPdfFormat(size: PdfPageSize): 'a4' | 'a3' | 'letter' {
  if (size === 'A3') return 'a3';
  if (size === 'Letter') return 'letter';
  return 'a4';
}

function toJsPdfOrientation(orientation: PdfOrientation): 'p' | 'l' {
  return orientation === 'portrait' ? 'p' : 'l';
}

function formatTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return [255, 255, 255];
  const n = Number.parseInt(normalized, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fitRectInBox(
  imgW: number,
  imgH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  const aspect = Math.max(1, imgW) / Math.max(1, imgH);
  const boxAspect = Math.max(1e-6, boxW) / Math.max(1e-6, boxH);
  let w: number;
  let h: number;
  if (aspect > boxAspect) {
    w = boxW;
    h = boxW / aspect;
  } else {
    h = boxH;
    w = boxH * aspect;
  }
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  };
}

function drawPageHeader(doc: jsPDF, pageW: number, title: string, subtitle: string): number {
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text(title, MARGIN_MM, MARGIN_MM + 5);

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 90);
  doc.text(subtitle, pageW - MARGIN_MM, MARGIN_MM + 5, { align: 'right' });

  doc.setDrawColor(210, 210, 218);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_MM, MARGIN_MM + 8, pageW - MARGIN_MM, MARGIN_MM + 8);
  return MARGIN_MM + 13;
}

function drawFooter(
  doc: jsPDF,
  page: number,
  total: number,
  pageW: number,
  pageH: number,
  projectName: string,
  dateStr: string,
  labels: PdfLabels,
): void {
  const yLine = pageH - MARGIN_MM - 4;
  const yText = pageH - MARGIN_MM;
  doc.setDrawColor(220, 220, 226);
  doc.setLineWidth(0.25);
  doc.line(MARGIN_MM, yLine, pageW - MARGIN_MM, yLine);

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 92);
  doc.text(`${projectName} · ${dateStr}`, MARGIN_MM, yText);
  doc.text(labels.generatedBy, pageW / 2, yText, { align: 'center' });
  doc.text(formatTemplate(labels.pageOf, { page, total }), pageW - MARGIN_MM, yText, {
    align: 'right',
  });
}

function drawKeyValueRows(
  doc: jsPDF,
  rows: ReadonlyArray<{ label: string; value: string; swatchHex?: string }>,
  x: number,
  y: number,
  w: number,
  rowH = 6.2,
): number {
  const labelW = w * 0.48;
  let curY = y;
  doc.setFontSize(8.5);

  rows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(246, 246, 248);
      doc.rect(x, curY, w, rowH, 'F');
    }
    doc.setDrawColor(230, 230, 235);
    doc.setLineWidth(0.15);
    doc.rect(x, curY, w, rowH, 'S');

    doc.setFont(FONT_REGULAR, 'bold');
    doc.setTextColor(48, 48, 56);
    doc.text(row.label, x + 2, curY + rowH - 2);

    doc.setFont(FONT_REGULAR, 'normal');
    doc.setTextColor(24, 24, 27);
    let valueX = x + labelW + 2;
    if (row.swatchHex) {
      const [r, g, b] = hexToRgbTuple(row.swatchHex);
      doc.setFillColor(r, g, b);
      doc.setDrawColor(120, 120, 128);
      doc.rect(valueX, curY + 1.3, 4.2, rowH - 2.6, 'FD');
      valueX += 6;
    }
    doc.text(row.value, valueX, curY + rowH - 2, { maxWidth: x + w - valueX - 2 });
    curY += rowH;
  });

  return curY;
}

function addEmbeddedImage(
  doc: jsPDF,
  img: EncodedPdfImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.addImage(img.pngBytes, 'PNG', x, y, w, h, undefined, 'FAST');
  doc.setDrawColor(190, 190, 198);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h, 'S');
}

function formatModeLabel(mode: LightingMode, labels: PdfLabels): string {
  if (mode === 'front') return labels.rowModeFront;
  if (mode === 'back') return labels.rowModeBack;
  return labels.rowModeCombined;
}

export function buildDocumentationPdf(input: BuildDocumentationPdfInput): Uint8Array {
  const {
    project,
    stats,
    colorEffective,
    heightEffective,
    opacityEffective,
    previews,
    fonts,
    labels,
    exportedAt,
    onProgress,
  } = input;

  const doc = new jsPDF({
    orientation: toJsPdfOrientation(project.export.pdfOrientation),
    unit: 'mm',
    format: toJsPdfFormat(project.export.pdfPageSize),
    compress: true,
  });

  doc.addFileToVFS('DejaVuSans.ttf', fonts.regularBase64);
  doc.addFont('DejaVuSans.ttf', FONT_REGULAR, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.boldBase64);
  doc.addFont('DejaVuSans-Bold.ttf', FONT_REGULAR, 'bold');
  doc.setFont(FONT_REGULAR, 'normal');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN_MM * 2;
  const footerReserve = 12;
  const dateDisplay = exportedAt.slice(0, 16).replace('T', ' ');
  const { canvas, lighting, material, view3d } = project;
  const pxPerCm = canvas.widthPx / Math.max(0.01, canvas.widthCm);
  const dpi = pxPerCm * 2.54;
  const mp = ((canvas.widthPx * canvas.heightPx) / 1_000_000).toFixed(2);
  const mmPerLevel = (canvas.maxThicknessMm - canvas.minThicknessMm) / 255;

  // PAGE 1: Cover / Summary + Preview Thumbnails
  let y = drawPageHeader(
    doc,
    pageW,
    `${labels.docTitle} — ${project.name}`,
    labels.sectionCoverTitle,
  );

  const specRows = [
    { label: labels.specProject, value: `${project.name} (v${project.appVersion})` },
    { label: labels.exportedAt, value: dateDisplay },
    {
      label: labels.specCanvasSize,
      value: `${canvas.widthCm} × ${canvas.heightCm} cm (${(canvas.widthCm * canvas.heightCm).toFixed(0)} cm²)`,
    },
    { label: labels.specResolution, value: `${canvas.widthPx} × ${canvas.heightPx} px (${mp} MP)` },
    { label: labels.specDensity, value: `${pxPerCm.toFixed(1)} px/cm · ${dpi.toFixed(1)} DPI` },
    {
      label: labels.specThicknessRange,
      value: `${canvas.minThicknessMm.toFixed(2)} – ${canvas.maxThicknessMm.toFixed(2)} mm`,
    },
    { label: labels.specMmPerLevel, value: `${mmPerLevel.toFixed(5)} mm` },
    {
      label: labels.specReliefMultiplier,
      value: `×${view3d.reliefMultiplier} · ${labels.specMeshDetail}: ${view3d.meshDetail}`,
    },
    { label: labels.specLightingMode, value: formatModeLabel(lighting.mode, labels) },
  ];

  y = drawKeyValueRows(doc, specRows, MARGIN_MM, y, contentW, 6.1);
  y += 6;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.previewsTitle, MARGIN_MM, y);
  y += 3;

  const previewModes: LightingMode[] = ['front', 'back', 'combined'];
  const previewTitles: Record<LightingMode, string> = {
    front: labels.previewFront,
    back: labels.previewBack,
    combined: labels.previewCombined,
  };
  const gap = 5;
  const cardW = (contentW - gap * 2) / 3;
  const availH = Math.max(30, pageH - MARGIN_MM - footerReserve - y - 8);

  previewModes.forEach((mode, idx) => {
    const cx = MARGIN_MM + idx * (cardW + gap);
    const preview = previews?.[mode];
    if (preview && preview.rgb.length >= preview.width * preview.height * 3) {
      const prepared = prepareRgbPreviewPdfImage(preview.rgb, preview.width, preview.height, 640);
      const box = fitRectInBox(prepared.width, prepared.height, cx, y, cardW, availH);
      addEmbeddedImage(doc, prepared, box.x, box.y, box.w, box.h);
      doc.setFont(FONT_REGULAR, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(48, 48, 56);
      doc.text(previewTitles[mode], cx + cardW / 2, box.y + box.h + 4.5, { align: 'center' });
    } else {
      const placeholderH = Math.min(availH, cardW * 0.75);
      doc.setFillColor(240, 240, 244);
      doc.setDrawColor(200, 200, 208);
      doc.rect(cx, y, cardW, placeholderH, 'FD');
      doc.setFont(FONT_REGULAR, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 90);
      doc.text(labels.previewUnavailable, cx + cardW / 2, y + placeholderH / 2, {
        align: 'center',
      });
      doc.text(previewTitles[mode], cx + cardW / 2, y + placeholderH + 4.5, { align: 'center' });
    }
  });

  onProgress?.(0.16);

  // PAGE 2: COLOR MAP + 10 cm Scale Bar
  doc.addPage();
  y = drawPageHeader(doc, pageW, labels.sectionColorTitle, project.name);
  const colorImg = prepareColorPdfImage(colorEffective, canvas.widthPx, canvas.heightPx, 1024);
  const colorBox = fitRectInBox(
    colorImg.width,
    colorImg.height,
    MARGIN_MM,
    y,
    contentW,
    pageH - MARGIN_MM - footerReserve - y - 20,
  );
  addEmbeddedImage(doc, colorImg, colorBox.x, colorBox.y, colorBox.w, colorBox.h);

  const scaleY = colorBox.y + colorBox.h + 7;
  const barCm = canvas.widthCm >= 10 ? 10 : Math.max(1, Math.floor(canvas.widthCm));
  const barMmOnPage = colorBox.w * (barCm / Math.max(0.01, canvas.widthCm));
  const barX = MARGIN_MM;
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(0.6);
  doc.line(barX, scaleY, barX + barMmOnPage, scaleY);
  doc.line(barX, scaleY - 1.8, barX, scaleY + 1.8);
  doc.line(barX + barMmOnPage, scaleY - 1.8, barX + barMmOnPage, scaleY + 1.8);
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  doc.text(
    formatTemplate(labels.scaleBarLabel, { cm: barCm }),
    barX + barMmOnPage / 2,
    scaleY - 2.5,
    {
      align: 'center',
    },
  );

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 80);
  doc.text(labels.colorCaption, pageW - MARGIN_MM, scaleY, { align: 'right' });

  onProgress?.(0.32);

  // PAGE 3: HEIGHT MAP (Gray + Heatmap + Legend + Expanded Conversion Table)
  doc.addPage();
  y = drawPageHeader(doc, pageW, labels.sectionHeightTitle, project.name);

  const heightGrayImg = prepareGrayscalePdfImage(
    heightEffective,
    canvas.widthPx,
    canvas.heightPx,
    860,
  );
  const heightHeatImg = prepareHeatmapPdfImage(
    heightEffective,
    canvas.widthPx,
    canvas.heightPx,
    860,
  );

  const isPortrait = project.export.pdfOrientation === 'portrait';
  const imgPanelW = isPortrait ? (contentW - 6) / 2 : (contentW - 10) * 0.34;
  const imgAreaH = isPortrait ? 90 : pageH - MARGIN_MM - footerReserve - y - 28;

  const grayBox = fitRectInBox(
    heightGrayImg.width,
    heightGrayImg.height,
    MARGIN_MM,
    y + 4,
    imgPanelW,
    imgAreaH,
  );
  addEmbeddedImage(doc, heightGrayImg, grayBox.x, grayBox.y, grayBox.w, grayBox.h);
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 48);
  doc.text(labels.heightGrayTitle, grayBox.x + grayBox.w / 2, y + 2, { align: 'center' });

  const heatStartX = MARGIN_MM + imgPanelW + 6;
  const heatBox = fitRectInBox(
    heightHeatImg.width,
    heightHeatImg.height,
    heatStartX,
    y + 4,
    imgPanelW,
    imgAreaH,
  );
  addEmbeddedImage(doc, heightHeatImg, heatBox.x, heatBox.y, heatBox.w, heatBox.h);
  doc.text(labels.heightHeatTitle, heatBox.x + heatBox.w / 2, y + 2, { align: 'center' });

  const legendY = Math.max(grayBox.y + grayBox.h, heatBox.y + heatBox.h) + 6;
  const legendW = imgPanelW * 2 + 6;
  const steps = 48;
  const segW = legendW / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const c = sampleTurboRgb01(t);
    doc.setFillColor(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
    doc.rect(MARGIN_MM + i * segW, legendY, segW + 0.15, 4, 'F');
  }
  doc.setDrawColor(160, 160, 168);
  doc.rect(MARGIN_MM, legendY, legendW, 4, 'S');
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(48, 48, 56);
  doc.text(`${canvas.minThicknessMm.toFixed(2)} mm`, MARGIN_MM, legendY + 8);
  doc.text(labels.heightLegendTitle, MARGIN_MM + legendW / 2, legendY + 8, { align: 'center' });
  doc.text(`${canvas.maxThicknessMm.toFixed(2)} mm`, MARGIN_MM + legendW, legendY + 8, {
    align: 'right',
  });
  doc.text(
    formatTemplate(labels.heightStatsSummary, {
      min: stats.height.minMm.toFixed(3),
      max: stats.height.maxMm.toFixed(3),
      mean: stats.height.meanMm.toFixed(3),
    }),
    MARGIN_MM,
    legendY + 13,
  );

  // Expanded Level + Percentage -> mm lookup table (covers 0%..100% milestones & 8-bit steps 0, 32, ..., 255)
  const tableX = isPortrait ? MARGIN_MM : MARGIN_MM + legendW + 6;
  const tableY = isPortrait ? legendY + 18 : y;
  const tableW = isPortrait ? contentW : pageW - MARGIN_MM - tableX;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.heightTableTitle, tableX, tableY + 2);

  const tableHeaderY = tableY + 4.5;
  const colW = tableW / 3;
  doc.setFillColor(232, 232, 238);
  doc.rect(tableX, tableHeaderY, tableW, 5.4, 'F');
  doc.setFontSize(8);
  doc.text(labels.tablePct, tableX + 2, tableHeaderY + 3.8);
  doc.text(labels.tableLevel8, tableX + colW + 2, tableHeaderY + 3.8);
  doc.text(labels.tableThicknessMm, tableX + colW * 2 + 2, tableHeaderY + 3.8);

  const sampleLevels = [
    0, 26, 32, 51, 64, 77, 96, 102, 128, 153, 160, 179, 191, 204, 224, 230, 255,
  ];
  let rowY = tableHeaderY + 5.4;
  const lookupRowH = 4.6;
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  sampleLevels.forEach((lvl, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(247, 247, 250);
      doc.rect(tableX, rowY, tableW, lookupRowH, 'F');
    }
    doc.setDrawColor(230, 230, 236);
    doc.rect(tableX, rowY, tableW, lookupRowH, 'S');
    const v01 = lvl / 255;
    const mm = valueToMm(v01, canvas.minThicknessMm, canvas.maxThicknessMm);
    doc.setTextColor(24, 24, 27);
    doc.text(`${Math.round(v01 * 100)}%`, tableX + 2, rowY + 3.3);
    doc.text(String(lvl), tableX + colW + 2, rowY + 3.3);
    doc.text(`${mm.toFixed(3)} mm`, tableX + colW * 2 + 2, rowY + 3.3);
    rowY += lookupRowH;
  });

  onProgress?.(0.48);

  // PAGE 4: OPACITY MAP
  doc.addPage();
  y = drawPageHeader(doc, pageW, labels.sectionOpacityTitle, project.name);
  const opacityImg = prepareGrayscalePdfImage(
    opacityEffective,
    canvas.widthPx,
    canvas.heightPx,
    1024,
  );
  const opacityBox = fitRectInBox(
    opacityImg.width,
    opacityImg.height,
    MARGIN_MM,
    y,
    contentW,
    pageH - MARGIN_MM - footerReserve - y - 24,
  );
  addEmbeddedImage(doc, opacityImg, opacityBox.x, opacityBox.y, opacityBox.w, opacityBox.h);

  const opLegendY = opacityBox.y + opacityBox.h + 6;
  const opBarW = Math.min(120, contentW * 0.6);
  for (let i = 0; i < 40; i++) {
    const g = Math.round((i / 39) * 255);
    doc.setFillColor(g, g, g);
    doc.rect(MARGIN_MM + (i * opBarW) / 40, opLegendY, opBarW / 40 + 0.15, 4, 'F');
  }
  doc.setDrawColor(160, 160, 168);
  doc.rect(MARGIN_MM, opLegendY, opBarW, 4, 'S');
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(48, 48, 56);
  doc.text(`0% (${labels.opacityOpaqueLabel})`, MARGIN_MM, opLegendY + 8);
  doc.text(`100% (${labels.opacityTransmissiveLabel})`, MARGIN_MM + opBarW, opLegendY + 8, {
    align: 'right',
  });
  doc.text(labels.opacityLegendTitle, MARGIN_MM + opBarW / 2, opLegendY + 8, { align: 'center' });
  doc.text(
    formatTemplate(labels.opacityStatsSummary, {
      min: stats.opacity.minPct.toFixed(1),
      max: stats.opacity.maxPct.toFixed(1),
      mean: stats.opacity.meanPct.toFixed(1),
    }),
    MARGIN_MM,
    opLegendY + 13,
  );
  doc.text(labels.opacityCaption, pageW - MARGIN_MM, opLegendY + 4, { align: 'right' });

  onProgress?.(0.64);

  // PAGE 5: LIGHTING & MATERIAL + BEER-LAMBERT
  doc.addPage();
  y = drawPageHeader(doc, pageW, labels.sectionLightingTitle, project.name);

  const frontWorld = frontLightToWorld(lighting.front, canvas);
  const frontPolar = frontLightToPolar(lighting.front, canvas);
  const frontHex = colorSpecToHex(lighting.front.color);
  const backHex = colorSpecToHex(lighting.back.color);
  const canvasBackHex = colorSpecToHex({
    mode: 'rgb',
    kelvin: 6500,
    rgb: material.canvasBackColor,
  });

  const colGap = 6;
  const colWidth = (contentW - colGap) / 2;

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.frontLightTitle, MARGIN_MM, y + 2);
  const leftY1 = drawKeyValueRows(
    doc,
    [
      {
        label: labels.rowFrontPosCartesian,
        value: `X=${lighting.front.xCm.toFixed(1)} · H=${lighting.front.heightAboveTopCm.toFixed(1)} · Z=${lighting.front.distanceCm.toFixed(1)} cm`,
      },
      {
        label: labels.rowFrontTarget,
        value: `(${lighting.front.targetXCm.toFixed(1)}, ${lighting.front.targetYCm.toFixed(1)}) cm`,
      },
      {
        label: labels.rowFrontPolar,
        value: `θ=${frontPolar.incidenceDeg.toFixed(1)}° · el=${(90 - frontPolar.incidenceDeg).toFixed(1)}° · φ=${frontPolar.azimuthDeg.toFixed(1)}°`,
      },
      { label: labels.rowFrontDistance, value: `${frontWorld.distanceToTargetCm.toFixed(2)} cm` },
      { label: labels.rowIntensity, value: lighting.front.intensity.toFixed(2) },
      {
        label: labels.rowColor,
        value:
          lighting.front.color.mode === 'kelvin'
            ? `${lighting.front.color.kelvin} K (${frontHex})`
            : frontHex,
        swatchHex: frontHex,
      },
      { label: labels.rowSourceSize, value: `${lighting.front.sourceSizeCm.toFixed(1)} cm` },
      {
        label: labels.rowConePenumbra,
        value: `${lighting.front.coneAngleDeg.toFixed(0)}° / ${(lighting.front.penumbra * 100).toFixed(0)}%`,
      },
      {
        label: labels.rowShadows,
        value: lighting.front.castShadows
          ? `${labels.yes} (${lighting.front.shadowMapSize} px)`
          : labels.no,
      },
    ],
    MARGIN_MM,
    y + 4,
    colWidth,
    5.6,
  );

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.backLightTitle, MARGIN_MM, leftY1 + 5);
  const leftY2 = drawKeyValueRows(
    doc,
    [
      {
        label: labels.rowBackType,
        value: lighting.back.type === 'panel' ? labels.rowBackTypePanel : labels.rowBackTypePoint,
      },
      {
        label: labels.rowBackPos,
        value: `X=${lighting.back.xCm.toFixed(1)} · Y=${lighting.back.yCm.toFixed(1)} · D=${lighting.back.distanceBehindCm.toFixed(1)} cm`,
      },
      { label: labels.rowIntensity, value: lighting.back.intensity.toFixed(2) },
      {
        label: labels.rowColor,
        value:
          lighting.back.color.mode === 'kelvin'
            ? `${lighting.back.color.kelvin} K (${backHex})`
            : backHex,
        swatchHex: backHex,
      },
      {
        label: labels.rowBackGlobalT,
        value: `${lighting.back.globalTransmissionPct.toFixed(0)} %`,
      },
      { label: labels.rowBackAttenuation, value: lighting.back.attenuation.toFixed(2) },
    ],
    MARGIN_MM,
    leftY1 + 7,
    colWidth,
    5.6,
  );

  const rightX = MARGIN_MM + colWidth + colGap;
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.sceneMixTitle, rightX, y + 2);
  const rightY1 = drawKeyValueRows(
    doc,
    [
      { label: labels.rowLightingMode, value: formatModeLabel(lighting.mode, labels) },
      { label: labels.rowBalance, value: `${Math.round(clamp01(lighting.balance) * 100)} %` },
      { label: labels.rowExposure, value: lighting.exposure.toFixed(2) },
      {
        label: labels.rowAmbient,
        value: `Front ${lighting.ambientFront.toFixed(2)} · Room ${lighting.ambientRoom.toFixed(2)}`,
      },
    ],
    rightX,
    y + 4,
    colWidth,
    5.6,
  );

  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.materialTitle, rightX, rightY1 + 5);
  const rightY2 = drawKeyValueRows(
    doc,
    [
      { label: labels.rowMaterialPreset, value: material.preset },
      { label: labels.rowRoughness, value: material.roughness.toFixed(2) },
      { label: labels.rowMuA, value: `${material.muA.toFixed(2)} /mm` },
      { label: labels.rowMuS, value: `${material.muS.toFixed(2)} /mm` },
      { label: labels.rowKTint, value: material.kTint.toFixed(2) },
      { label: labels.rowCanvasT, value: `${(material.canvasTransmittance * 100).toFixed(0)} %` },
      { label: labels.rowScatterRadius, value: `${material.scatterRadiusMm.toFixed(2)} mm` },
      {
        label: labels.rowCanvasBackColor,
        value: canvasBackHex,
        swatchHex: canvasBackHex,
      },
    ],
    rightX,
    rightY1 + 7,
    colWidth,
    5.6,
  );

  const blY = Math.max(leftY2, rightY2) + 5;
  doc.setFillColor(244, 245, 248);
  doc.setDrawColor(215, 215, 222);
  doc.rect(MARGIN_MM, blY, contentW, 20, 'FD');
  doc.setFont(FONT_REGULAR, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  doc.text(labels.beerLambertTitle, MARGIN_MM + 3, blY + 4.5);
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(48, 48, 56);
  doc.text(labels.beerLambertFormula1, MARGIN_MM + 3, blY + 9.5);
  doc.text(labels.beerLambertFormula2, MARGIN_MM + 3, blY + 13.8);
  doc.setTextColor(70, 70, 80);
  doc.text(labels.beerLambertNote, MARGIN_MM + 3, blY + 18, { maxWidth: contentW - 6 });

  onProgress?.(0.76);

  // PAGES 6 & 7 (+ Optional 1:1 Tiles): Reference Grid & 1:1 Printing Sheets
  const extCtx: ExtendedPdfContext = {
    project,
    colorEffective,
    heightEffective,
    pageW,
    pageH,
    contentW,
    marginMm: MARGIN_MM,
    footerReserveMm: footerReserve,
    fontName: FONT_REGULAR,
    labels,
    drawPageHeader,
    fitRectInBox,
    addEmbeddedImage,
    formatTemplate,
    onProgress,
  };
  appendReferenceGridPages(doc, extCtx);
  if (project.export.includeTiles1to1) {
    appendTiled1to1Pages(doc, extCtx);
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, pageW, pageH, project.name, dateDisplay, labels);
  }

  onProgress?.(1);
  return new Uint8Array(doc.output('arraybuffer'));
}
