import { useMemo, useRef, useState } from 'react';
import {
  MAX_AMBIENT,
  MAX_ATTENUATION,
  MAX_BACK_DISTANCE_CM,
  MAX_CONE_ANGLE_DEG,
  MAX_EXPOSURE,
  MAX_GLOBAL_TRANSMISSION_PCT,
  MAX_INCIDENCE_DEG,
  MAX_KELVIN,
  MAX_LIGHT_INTENSITY,
  MAX_SOURCE_SIZE_CM,
  MIN_AMBIENT,
  MIN_ATTENUATION,
  MIN_BACK_DISTANCE_CM,
  MIN_CONE_ANGLE_DEG,
  MIN_EXPOSURE,
  MIN_GLOBAL_TRANSMISSION_PCT,
  MIN_INCIDENCE_DEG,
  MIN_KELVIN,
  MIN_LIGHT_INTENSITY,
  MIN_SHADOW_DISTANCE_CM,
  MIN_SOURCE_SIZE_CM,
} from '@/core/constants';
import type { BackLightType, LightingMode, LightingSettings, ShadowMapSize } from '@/core/types';
import { kelvinToHex } from '@/core/units/colorTemperature';
import {
  clampShadowMapSize,
  frontLightToPolar,
  polarToFrontLightCartesian,
} from '@/core/units/lighting';
import { getMaxTextureSize } from '@/lib/webgl';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { Separator } from '@/ui/components/ui/separator';
import { Switch } from '@/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { useI18n } from '@/ui/hooks/useI18n';
import { ColorField } from '@/ui/widgets/ColorField';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';
import { UnitNumberField } from '@/ui/widgets/UnitNumberField';

type CoordMode = 'cartesian' | 'polar';

const SHADOW_SIZES: readonly ShadowMapSize[] = [2048, 4096, 8192];

export function LightPanel() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const lighting = useProjectStore((s) => s.project.lighting);
  const updateProject = useProjectStore((s) => s.updateProject);
  const pcssEnabled = useEditorStore((s) => s.pcssEnabled);
  const setPcssEnabled = useEditorStore((s) => s.setPcssEnabled);

  const [coordMode, setCoordMode] = useState<CoordMode>('cartesian');
  const pendingBeforeRef = useRef<LightingSettings | null>(null);
  const maxTextureSize = useMemo(() => getMaxTextureSize(), []);

  const front = lighting.front;
  const back = lighting.back;
  const polar = useMemo(() => frontLightToPolar(front, canvas), [front, canvas]);
  const effectiveShadowSize = clampShadowMapSize(front.shadowMapSize, maxTextureSize);

  const previewLighting = (mutate: (draft: LightingSettings) => void) => {
    if (!pendingBeforeRef.current) {
      pendingBeforeRef.current = structuredClone(useProjectStore.getState().project.lighting);
    }
    updateProject((projectDraft) => {
      mutate(projectDraft.lighting);
    }, true);
  };

  const commitLighting = () => {
    const before = pendingBeforeRef.current;
    pendingBeforeRef.current = null;
    if (!before) return;
    const after = structuredClone(useProjectStore.getState().project.lighting);
    recordSettingsPatchHistory('settingsChange', {
      path: 'lighting',
      before,
      after,
    });
  };

  const applyImmediateLighting = (mutate: (draft: LightingSettings) => void) => {
    const before = structuredClone(useProjectStore.getState().project.lighting);
    pendingBeforeRef.current = null;
    updateProject((projectDraft) => {
      mutate(projectDraft.lighting);
    }, true);
    const after = structuredClone(useProjectStore.getState().project.lighting);
    recordSettingsPatchHistory('settingsChange', {
      path: 'lighting',
      before,
      after,
    });
  };

  const updatePolar = (
    patch: Partial<{ incidenceDeg: number; azimuthDeg: number; distanceToTargetCm: number }>,
    commit = false,
  ) => {
    const nextPolar = {
      incidenceDeg: patch.incidenceDeg ?? polar.incidenceDeg,
      azimuthDeg: patch.azimuthDeg ?? polar.azimuthDeg,
      distanceToTargetCm: patch.distanceToTargetCm ?? polar.distanceToTargetCm,
    };
    const nextCart = polarToFrontLightCartesian(
      nextPolar,
      front.targetXCm,
      front.targetYCm,
      canvas,
    );
    previewLighting((draft) => {
      draft.front.xCm = Number(nextCart.xCm.toFixed(2));
      draft.front.heightAboveTopCm = Number(nextCart.heightAboveTopCm.toFixed(2));
      draft.front.distanceCm = Number(nextCart.distanceCm.toFixed(2));
    });
    if (commit) {
      commitLighting();
    }
  };

  const frontColorSwatch =
    front.color.mode === 'kelvin' ? kelvinToHex(front.color.kelvin) : front.color.rgb;
  const backColorSwatch =
    back.color.mode === 'kelvin' ? kelvinToHex(back.color.kelvin) : back.color.rgb;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('light.sceneTitle')}
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">
            {t('light.modeLabel')}
          </Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={lighting.mode}
            onValueChange={(val) => {
              if (val === 'front' || val === 'back' || val === 'combined') {
                applyImmediateLighting((d) => {
                  d.mode = val as LightingMode;
                });
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem
              value="front"
              data-testid="lighting-mode-front"
              className="h-7 flex-1 text-xs"
            >
              {t('light.modeFront')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="back"
              data-testid="lighting-mode-back"
              className="h-7 flex-1 text-xs"
            >
              {t('light.modeBack')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="combined"
              data-testid="lighting-mode-combined"
              className="h-7 flex-1 text-xs"
            >
              {t('light.modeCombined')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {lighting.mode === 'combined' && (
          <LabeledSlider
            label={t('light.balance')}
            value={lighting.balance}
            min={0}
            max={1}
            step={0.02}
            decimals={2}
            testId="light-balance"
            onValueChange={(v) =>
              previewLighting((d) => {
                d.balance = v;
              })
            }
            onValueCommit={commitLighting}
          />
        )}

        <LabeledSlider
          label={t('light.exposure')}
          value={lighting.exposure}
          min={MIN_EXPOSURE}
          max={MAX_EXPOSURE}
          step={0.05}
          decimals={2}
          testId="light-exposure"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.exposure = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <LabeledSlider
          label={t('light.ambientFront')}
          value={lighting.ambientFront}
          min={MIN_AMBIENT}
          max={MAX_AMBIENT}
          step={0.01}
          decimals={2}
          testId="light-ambient-front"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.ambientFront = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <LabeledSlider
          label={t('light.ambientRoom')}
          value={lighting.ambientRoom}
          min={MIN_AMBIENT}
          max={MAX_AMBIENT}
          step={0.01}
          decimals={2}
          testId="light-ambient-room"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.ambientRoom = v;
            })
          }
          onValueCommit={commitLighting}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground text-xs font-semibold tracking-wide uppercase">
            {t('light.frontTitle')}
          </span>
          <ToggleGroup
            type="single"
            value={coordMode}
            onValueChange={(val) => {
              if (val === 'cartesian' || val === 'polar') setCoordMode(val);
            }}
            size="sm"
          >
            <ToggleGroupItem
              value="cartesian"
              data-testid="coord-mode-cartesian"
              className="h-6 px-2 text-[10px]"
            >
              {t('light.coordCartesian')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="polar"
              data-testid="coord-mode-polar"
              className="h-6 px-2 text-[10px]"
            >
              {t('light.coordPolar')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {coordMode === 'cartesian' ? (
          <div className="grid grid-cols-2 gap-2">
            <UnitNumberField
              label={t('light.xCm')}
              value={front.xCm}
              min={-500}
              max={1500}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-x-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.xCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <UnitNumberField
              label={t('light.heightAboveTopCm')}
              value={front.heightAboveTopCm}
              min={-1000}
              max={1000}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-height-above-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.heightAboveTopCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <UnitNumberField
              label={t('light.distanceCm')}
              value={front.distanceCm}
              min={MIN_SHADOW_DISTANCE_CM}
              max={1000}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-distance-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.distanceCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <div />
            <UnitNumberField
              label={t('light.targetXCm')}
              value={front.targetXCm}
              min={-500}
              max={1500}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-target-x-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.targetXCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <UnitNumberField
              label={t('light.targetYCm')}
              value={front.targetYCm}
              min={-500}
              max={1500}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-target-y-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.targetYCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <UnitNumberField
                label={t('light.incidenceDeg')}
                value={polar.incidenceDeg}
                min={MIN_INCIDENCE_DEG}
                max={MAX_INCIDENCE_DEG}
                step={1}
                decimals={1}
                suffix="°"
                testId="front-incidence-deg"
                onValueChange={(v) => updatePolar({ incidenceDeg: v }, false)}
                onValueCommit={(v) => updatePolar({ incidenceDeg: v }, true)}
              />
              <UnitNumberField
                label={t('light.azimuthDeg')}
                value={polar.azimuthDeg}
                min={-180}
                max={180}
                step={1}
                decimals={1}
                suffix="°"
                testId="front-azimuth-deg"
                onValueChange={(v) => updatePolar({ azimuthDeg: v }, false)}
                onValueCommit={(v) => updatePolar({ azimuthDeg: v }, true)}
              />
            </div>
            <UnitNumberField
              label={t('light.distanceToTargetCm')}
              value={polar.distanceToTargetCm}
              min={MIN_SHADOW_DISTANCE_CM}
              max={1000}
              step={1}
              decimals={1}
              suffix="cm"
              testId="front-polar-distance-cm"
              onValueChange={(v) => updatePolar({ distanceToTargetCm: v }, false)}
              onValueCommit={(v) => updatePolar({ distanceToTargetCm: v }, true)}
            />
            <div className="grid grid-cols-2 gap-2">
              <UnitNumberField
                label={t('light.targetXCm')}
                value={front.targetXCm}
                min={-500}
                max={1500}
                step={1}
                decimals={1}
                suffix="cm"
                onValueChange={(v) =>
                  previewLighting((d) => {
                    d.front.targetXCm = v;
                  })
                }
                onValueCommit={commitLighting}
              />
              <UnitNumberField
                label={t('light.targetYCm')}
                value={front.targetYCm}
                min={-500}
                max={1500}
                step={1}
                decimals={1}
                suffix="cm"
                onValueChange={(v) =>
                  previewLighting((d) => {
                    d.front.targetYCm = v;
                  })
                }
                onValueCommit={commitLighting}
              />
            </div>
          </div>
        )}

        <LabeledSlider
          label={t('light.intensity')}
          value={front.intensity}
          min={MIN_LIGHT_INTENSITY}
          max={MAX_LIGHT_INTENSITY}
          step={0.05}
          decimals={2}
          testId="front-intensity"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.front.intensity = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-xs font-normal">
                {t('light.color')}
              </Label>
              <span
                className="border-border inline-block size-3.5 rounded-sm border"
                style={{ backgroundColor: frontColorSwatch }}
                aria-hidden="true"
              />
            </div>
            <ToggleGroup
              type="single"
              value={front.color.mode}
              onValueChange={(val) => {
                if (val === 'kelvin' || val === 'rgb') {
                  applyImmediateLighting((d) => {
                    d.front.color.mode = val;
                  });
                }
              }}
              size="sm"
            >
              <ToggleGroupItem
                value="kelvin"
                data-testid="front-color-kelvin"
                className="h-6 px-2 text-[10px]"
              >
                {t('light.colorKelvin')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="rgb"
                data-testid="front-color-rgb"
                className="h-6 px-2 text-[10px]"
              >
                {t('light.colorRgb')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {front.color.mode === 'kelvin' ? (
            <LabeledSlider
              label={t('light.kelvinLabel')}
              value={front.color.kelvin}
              min={MIN_KELVIN}
              max={MAX_KELVIN}
              step={50}
              decimals={0}
              suffix="K"
              testId="front-kelvin"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.front.color.kelvin = v;
                })
              }
              onValueCommit={commitLighting}
            />
          ) : (
            <ColorField
              value={front.color.rgb}
              pickerTestId="front-rgb-picker"
              hexTestId="front-rgb-hex"
              onValueChange={(hex) =>
                previewLighting((d) => {
                  d.front.color.rgb = hex;
                })
              }
              onValueCommit={commitLighting}
            />
          )}
        </div>

        <LabeledSlider
          label={t('light.sourceSize')}
          value={front.sourceSizeCm}
          min={MIN_SOURCE_SIZE_CM}
          max={MAX_SOURCE_SIZE_CM}
          step={0.5}
          decimals={1}
          suffix="cm"
          testId="front-source-size"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.front.sourceSizeCm = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <LabeledSlider
          label={t('light.coneAngle')}
          value={front.coneAngleDeg}
          min={MIN_CONE_ANGLE_DEG}
          max={MAX_CONE_ANGLE_DEG}
          step={1}
          decimals={0}
          suffix="°"
          testId="front-cone-angle"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.front.coneAngleDeg = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <LabeledSlider
          label={t('light.penumbra')}
          value={front.penumbra}
          min={0}
          max={1}
          step={0.02}
          decimals={2}
          testId="front-penumbra"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.front.penumbra = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <div className="flex items-center justify-between pt-0.5">
          <Label htmlFor="front-cast-shadows" className="text-muted-foreground text-xs font-normal">
            {t('light.castShadows')}
          </Label>
          <Switch
            id="front-cast-shadows"
            data-testid="front-cast-shadows"
            checked={front.castShadows}
            onCheckedChange={(checked) => {
              applyImmediateLighting((d) => {
                d.front.castShadows = checked;
              });
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">
            {t('light.shadowQuality')}
          </Label>
          <Select
            value={String(effectiveShadowSize)}
            onValueChange={(val) => {
              const size = Number(val) as ShadowMapSize;
              if (SHADOW_SIZES.includes(size)) {
                applyImmediateLighting((d) => {
                  d.front.shadowMapSize = size;
                });
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="front-shadow-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHADOW_SIZES.map((size) => {
                const disabled = size > maxTextureSize;
                return (
                  <SelectItem key={size} value={String(size)} disabled={disabled}>
                    {size} × {size}
                    {disabled ? ` (${t('light.shadowSizeGpuLimit')})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {front.castShadows && (
          <div className="space-y-1">
            <div className="flex items-center justify-between pt-0.5">
              <Label
                htmlFor="front-pcss-enabled"
                className="text-muted-foreground text-xs font-normal"
              >
                {t('light.pcssSoftShadows')}
              </Label>
              <Switch
                id="front-pcss-enabled"
                data-testid="front-pcss-enabled"
                checked={pcssEnabled}
                onCheckedChange={setPcssEnabled}
              />
            </div>
            <p className="text-muted-foreground text-[10px] leading-snug">
              {t('light.pcssSoftShadowsHint')}
            </p>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('light.backTitle')}
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">{t('light.backType')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={back.type}
            onValueChange={(val) => {
              if (val === 'point' || val === 'panel') {
                applyImmediateLighting((d) => {
                  d.back.type = val as BackLightType;
                });
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem
              value="point"
              data-testid="back-type-point"
              className="h-7 flex-1 text-xs"
            >
              {t('light.backTypePoint')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="panel"
              data-testid="back-type-panel"
              className="h-7 flex-1 text-xs"
            >
              {t('light.backTypePanel')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {back.type === 'point' && (
          <div className="grid grid-cols-2 gap-2">
            <UnitNumberField
              label={t('light.backXCm')}
              value={back.xCm}
              min={-500}
              max={1500}
              step={1}
              decimals={1}
              suffix="cm"
              testId="back-x-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.back.xCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <UnitNumberField
              label={t('light.backYCm')}
              value={back.yCm}
              min={-500}
              max={1500}
              step={1}
              decimals={1}
              suffix="cm"
              testId="back-y-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.back.yCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
            <UnitNumberField
              label={t('light.backDistanceBehindCm')}
              value={back.distanceBehindCm}
              min={MIN_BACK_DISTANCE_CM}
              max={MAX_BACK_DISTANCE_CM}
              step={1}
              decimals={1}
              suffix="cm"
              testId="back-distance-cm"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.back.distanceBehindCm = v;
                })
              }
              onValueCommit={commitLighting}
            />
          </div>
        )}

        <LabeledSlider
          label={t('light.intensity')}
          value={back.intensity}
          min={MIN_LIGHT_INTENSITY}
          max={MAX_LIGHT_INTENSITY}
          step={0.05}
          decimals={2}
          testId="back-intensity"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.back.intensity = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-xs font-normal">
                {t('light.color')}
              </Label>
              <span
                className="border-border inline-block size-3.5 rounded-sm border"
                style={{ backgroundColor: backColorSwatch }}
                aria-hidden="true"
              />
            </div>
            <ToggleGroup
              type="single"
              value={back.color.mode}
              onValueChange={(val) => {
                if (val === 'kelvin' || val === 'rgb') {
                  applyImmediateLighting((d) => {
                    d.back.color.mode = val;
                  });
                }
              }}
              size="sm"
            >
              <ToggleGroupItem
                value="kelvin"
                data-testid="back-color-kelvin"
                className="h-6 px-2 text-[10px]"
              >
                {t('light.colorKelvin')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="rgb"
                data-testid="back-color-rgb"
                className="h-6 px-2 text-[10px]"
              >
                {t('light.colorRgb')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {back.color.mode === 'kelvin' ? (
            <LabeledSlider
              label={t('light.kelvinLabel')}
              value={back.color.kelvin}
              min={MIN_KELVIN}
              max={MAX_KELVIN}
              step={50}
              decimals={0}
              suffix="K"
              testId="back-kelvin"
              onValueChange={(v) =>
                previewLighting((d) => {
                  d.back.color.kelvin = v;
                })
              }
              onValueCommit={commitLighting}
            />
          ) : (
            <ColorField
              value={back.color.rgb}
              pickerTestId="back-rgb-picker"
              hexTestId="back-rgb-hex"
              onValueChange={(hex) =>
                previewLighting((d) => {
                  d.back.color.rgb = hex;
                })
              }
              onValueCommit={commitLighting}
            />
          )}
        </div>

        <LabeledSlider
          label={t('light.backGlobalTransmission')}
          value={back.globalTransmissionPct}
          min={MIN_GLOBAL_TRANSMISSION_PCT}
          max={MAX_GLOBAL_TRANSMISSION_PCT}
          step={1}
          decimals={0}
          suffix="%"
          testId="back-global-transmission"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.back.globalTransmissionPct = v;
            })
          }
          onValueCommit={commitLighting}
        />

        <LabeledSlider
          label={t('light.backAttenuation')}
          value={back.attenuation}
          min={MIN_ATTENUATION}
          max={MAX_ATTENUATION}
          step={0.05}
          decimals={2}
          testId="back-attenuation"
          onValueChange={(v) =>
            previewLighting((d) => {
              d.back.attenuation = v;
            })
          }
          onValueCommit={commitLighting}
        />
      </div>
    </div>
  );
}
