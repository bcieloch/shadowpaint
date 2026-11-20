import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { encodeColorPng, encodeGrayscaleMapPng } from '@/export/png';
import {
  isProjectCorruptedError,
  packReliefProject,
  ProjectCorruptedError,
  unpackReliefProject,
} from '@/persistence/projectArchive';

function buildFixtureData() {
  const widthPx = 12;
  const heightPx = 10;
  const n = widthPx * heightPx;

  const project = createDefaultProject({
    name: 'Archive Test Painting',
    canvas: {
      widthCm: 24,
      heightCm: 20,
      widthPx,
      heightPx,
      minThicknessMm: 0.2,
      maxThicknessMm: 6.4,
    },
  });
  project.lighting.mode = 'combined';
  project.lighting.balance = 0.65;
  project.lighting.back.type = 'panel';
  project.lighting.back.globalTransmissionPct = 135;
  project.material.preset = 'oilImpasto';
  project.material.muA = 0.85;
  project.material.muS = 0.55;
  project.material.scatterRadiusMm = 3.2;
  project.adjustments.color.brightness = 0.1;
  project.adjustments.height.contrast = 0.15;
  project.adjustments.opacity.maxTransmissionPct = 92;
  project.grid.spacingCm = 2.5;
  project.grid.show2D = true;
  project.selection.mode = 'editInside';
  project.export.pdfPageSize = 'A3';

  const colorBase = new Uint8ClampedArray(n * 4);
  const colorWorking = new Uint8ClampedArray(n * 4);
  const heightBase = new Float32Array(n);
  const heightWorking = new Float32Array(n);
  const opacityBase = new Float32Array(n);
  const opacityWorking = new Float32Array(n);
  const selection = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    colorBase[i * 4] = (i * 7) & 255;
    colorBase[i * 4 + 1] = (i * 11) & 255;
    colorBase[i * 4 + 2] = (i * 13) & 255;
    colorBase[i * 4 + 3] = 255;

    colorWorking[i * 4] = (i * 17) & 255;
    colorWorking[i * 4 + 1] = (i * 19) & 255;
    colorWorking[i * 4 + 2] = (i * 23) & 255;
    colorWorking[i * 4 + 3] = 255;

    heightBase[i] = (i % 17) / 16;
    heightWorking[i] = ((i * 3) % 29) / 28;
    opacityBase[i] = 0.25 + ((i % 7) / 6) * 0.5;
    opacityWorking[i] = 0.1 + ((i % 11) / 10) * 0.85;
    selection[i] = i % 3 === 0 ? 255 : 0;
  }

  const colorEffective = new Uint8ClampedArray(n * 4);
  const heightEffective = new Float32Array(n);
  const opacityEffective = new Float32Array(n);
  applyColorAdjustments(colorWorking, colorEffective, widthPx, heightPx, project.adjustments.color);
  applyHeightAdjustments(
    heightWorking,
    heightEffective,
    widthPx,
    heightPx,
    project.adjustments.height,
  );
  applyOpacityAdjustments(
    opacityWorking,
    opacityEffective,
    widthPx,
    heightPx,
    project.adjustments.opacity,
  );

  return {
    project,
    colorBase,
    colorWorking,
    colorEffective,
    heightBase,
    heightWorking,
    heightEffective,
    opacityBase,
    opacityWorking,
    opacityEffective,
    selection,
  };
}

describe('projectArchive (.relief/.zip pack & unpack)', () => {
  it('round-trips pack -> unpack with lossless buffers, selection, and settings', () => {
    const fixture = buildFixtureData();
    const progressValues: number[] = [];

    const zipBytes = packReliefProject({
      ...fixture,
      exportedAt: '2026-01-15T12:00:00.000Z',
      onProgress: (p) => progressValues.push(p),
    });

    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    expect(progressValues.at(-1)).toBe(1);

    const unpacked = unpackReliefProject(zipBytes);
    expect(unpacked.usedPngFallback).toBe(false);
    expect(unpacked.project).toEqual(fixture.project);
    expect(unpacked.colorBase).toEqual(fixture.colorBase);
    expect(unpacked.colorWorking).toEqual(fixture.colorWorking);
    expect(unpacked.colorEffective).toEqual(fixture.colorEffective);
    expect(unpacked.heightBase).toEqual(fixture.heightBase);
    expect(unpacked.heightWorking).toEqual(fixture.heightWorking);
    expect(unpacked.heightEffective).toEqual(fixture.heightEffective);
    expect(unpacked.opacityBase).toEqual(fixture.opacityBase);
    expect(unpacked.opacityWorking).toEqual(fixture.opacityWorking);
    expect(unpacked.opacityEffective).toEqual(fixture.opacityEffective);
    expect(unpacked.selection).toEqual(fixture.selection);
  });

  it('migrates legacy partial settings cleanly when newer fields are omitted', () => {
    const fixture = buildFixtureData();
    const zipBytes = packReliefProject(fixture);
    const files = unzipSync(zipBytes);

    const legacySettings = {
      id: 'legacy-proj-1',
      name: 'Legacy Archive',
      canvas: fixture.project.canvas,
      lighting: {
        mode: 'front',
        front: {
          intensity: 1.5,
        },
      },
      material: {
        muA: 1.2,
      },
    };
    files['project_settings.json'] = new TextEncoder().encode(JSON.stringify(legacySettings));

    const migrated = unpackReliefProject(zipSync(files));
    expect(migrated.project.id).toBe('legacy-proj-1');
    expect(migrated.project.name).toBe('Legacy Archive');
    expect(migrated.project.lighting.front.intensity).toBe(1.5);
    expect(migrated.project.material.muA).toBe(1.2);
    expect(migrated.project.grid.spacingCm).toBeGreaterThan(0);
    expect(migrated.project.selection.mode).toBe('protect');
    expect(migrated.project.lighting.back.type).toBe('point');
  });

  it('detects CRC32 corruption inside raw map entries without silent pass', () => {
    const fixture = buildFixtureData();
    const zipBytes = packReliefProject(fixture);
    const files = unzipSync(zipBytes);

    const hw = files['maps/height.working.f32'];
    expect(hw).toBeDefined();
    if (!hw) return;
    hw[0] = (hw[0] ?? 0) ^ 0xff;

    const tamperedZip = zipSync(files);
    try {
      unpackReliefProject(tamperedZip);
      expect.unreachable('Expected ProjectCorruptedError');
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectCorruptedError);
      expect(isProjectCorruptedError(err)).toBe(true);
    }
  });

  it('throws ProjectCorruptedError on invalid ZIP, bad manifest, or missing maps/index.json', () => {
    expect(() => unpackReliefProject(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(
      ProjectCorruptedError,
    );

    const fixture = buildFixtureData();
    const zipBytes = packReliefProject(fixture);

    const badManifestFiles = unzipSync(zipBytes);
    badManifestFiles['manifest.json'] = new TextEncoder().encode(
      JSON.stringify({ format: 'other-format', formatVersion: 99 }),
    );
    expect(() => unpackReliefProject(zipSync(badManifestFiles))).toThrow(ProjectCorruptedError);

    const missingIndexFiles = unzipSync(zipBytes);
    delete missingIndexFiles['maps/index.json'];
    expect(() => unpackReliefProject(zipSync(missingIndexFiles))).toThrow(ProjectCorruptedError);

    const missingSettingsFiles = unzipSync(zipBytes);
    delete missingSettingsFiles['project_settings.json'];
    expect(() => unpackReliefProject(zipSync(missingSettingsFiles))).toThrow(ProjectCorruptedError);
  });

  it('reconstructs maps from PNG preview fallback when raw map buffers are absent', () => {
    const fixture = buildFixtureData();
    fixture.project.adjustments.color.brightness = 0;
    fixture.project.adjustments.height.contrast = 0;
    fixture.project.adjustments.opacity.maxTransmissionPct = 100;

    const { widthPx, heightPx } = fixture.project.canvas;
    const colorPng = encodeColorPng(fixture.colorWorking, widthPx, heightPx, false);
    const heightPng = encodeGrayscaleMapPng(fixture.heightWorking, widthPx, heightPx);
    const opacityPng = encodeGrayscaleMapPng(fixture.opacityWorking, widthPx, heightPx);

    const fallbackZip = zipSync({
      'project_settings.json': new TextEncoder().encode(JSON.stringify(fixture.project)),
      'previews/color_map.png': colorPng,
      'previews/height_map.png': heightPng,
      'previews/opacity_map.png': opacityPng,
    });

    const unpacked = unpackReliefProject(fallbackZip);
    expect(unpacked.usedPngFallback).toBe(true);
    expect(unpacked.colorWorking).toEqual(fixture.colorWorking);
    expect(unpacked.colorBase).toEqual(fixture.colorWorking);
    for (let i = 0; i < widthPx * heightPx; i++) {
      expect(Math.abs((unpacked.heightWorking[i] ?? 0) - (fixture.heightWorking[i] ?? 0))).toBeLessThan(
        0.01,
      );
      expect(
        Math.abs((unpacked.opacityWorking[i] ?? 0) - (fixture.opacityWorking[i] ?? 0)),
      ).toBeLessThan(0.01);
    }
  });
});
