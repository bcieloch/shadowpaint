import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { buildExportSettingsJson, serializeSettingsJson } from '@/export/settingsJson';

describe('export settingsJson', () => {
  it('builds complete derived metrics, map descriptors, and stats matching schema D§2', () => {
    const project = createDefaultProject({
      name: 'Sunset Relief',
      canvas: {
        widthCm: 50,
        heightCm: 70,
        widthPx: 3000,
        heightPx: 4200,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });

    const heightEffective = new Float32Array([0, 0.5, 1, 0.5]);
    const opacityEffective = new Float32Array([0.2, 0.4, 0.8, 1]);

    const json = buildExportSettingsJson({
      project,
      heightEffective,
      opacityEffective,
      exportedAt: '2026-11-20T12:00:00.000Z',
    });

    expect(json.format).toBe('shadowpaint-settings');
    expect(json.schemaVersion).toBe(1);
    expect(json.derived.pxPerCm).toBe(60);
    expect(json.derived.dpi).toBeCloseTo(152.4, 1);
    expect(json.derived.aspectRatio).toBe('5:7');
    expect(json.derived.canvasAreaCm2).toBe(3500);
    expect(json.derived.thicknessRangeMm).toEqual([0, 5]);
    expect(json.derived.mmPerLevel8).toBeCloseTo(5 / 255, 6);
    expect(json.maps['color_map.png'].colorType).toBe(2);
    expect(json.maps['height_map.png'].colorType).toBe(0);
    expect(json.maps['opacity_map.png'].colorType).toBe(0);
    expect(json.stats.height).toEqual({ minMm: 0, maxMm: 5, meanMm: 2.5 });
    expect(json.stats.opacity).toEqual({ minPct: 20, maxPct: 100, meanPct: 60 });
    expect(json.exportedAt).toBe('2026-11-20T12:00:00.000Z');

    const bytes = serializeSettingsJson(json);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as typeof json;
    expect(parsed.project.name).toBe('Sunset Relief');
  });
});
