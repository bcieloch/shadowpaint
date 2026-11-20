import { useRef } from 'react';
import {
  MAX_CANVAS_TRANSMITTANCE,
  MAX_K_TINT,
  MAX_MU_A,
  MAX_MU_S,
  MAX_ROUGHNESS,
  MIN_CANVAS_TRANSMITTANCE,
  MIN_K_TINT,
  MIN_MU_A,
  MIN_MU_S,
  MIN_ROUGHNESS,
} from '@/core/constants';
import type { MaterialSettings } from '@/core/types';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useProjectStore } from '@/state/projectStore';
import { Label } from '@/ui/components/ui/label';
import { Separator } from '@/ui/components/ui/separator';
import { useI18n } from '@/ui/hooks/useI18n';
import { ColorField } from '@/ui/widgets/ColorField';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

export function MaterialPanel() {
  const { t } = useI18n();
  const material = useProjectStore((s) => s.project.material);
  const updateProject = useProjectStore((s) => s.updateProject);
  const pendingBeforeRef = useRef<MaterialSettings | null>(null);

  const previewMaterial = (mutate: (draft: MaterialSettings) => void) => {
    if (!pendingBeforeRef.current) {
      pendingBeforeRef.current = { ...useProjectStore.getState().project.material };
    }
    updateProject((projectDraft) => {
      mutate(projectDraft.material);
    }, true);
  };

  const commitMaterial = () => {
    const before = pendingBeforeRef.current;
    pendingBeforeRef.current = null;
    if (!before) return;
    const after = { ...useProjectStore.getState().project.material };
    recordSettingsPatchHistory('settingsChange', {
      path: 'material',
      before,
      after,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('material.opticsTitle')}
        </div>

        <LabeledSlider
          label={t('material.roughness')}
          value={material.roughness}
          min={MIN_ROUGHNESS}
          max={MAX_ROUGHNESS}
          step={0.01}
          decimals={2}
          testId="material-roughness"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.roughness = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.muA')}
          value={material.muA}
          min={MIN_MU_A}
          max={MAX_MU_A}
          step={0.05}
          decimals={2}
          suffix="/mm"
          testId="material-mu-a"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.muA = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.muS')}
          value={material.muS}
          min={MIN_MU_S}
          max={MAX_MU_S}
          step={0.05}
          decimals={2}
          suffix="/mm"
          testId="material-mu-s"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.muS = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.kTint')}
          value={material.kTint}
          min={MIN_K_TINT}
          max={MAX_K_TINT}
          step={0.01}
          decimals={2}
          testId="material-k-tint"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.kTint = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.canvasTransmittance')}
          value={Math.round(material.canvasTransmittance * 100)}
          min={MIN_CANVAS_TRANSMITTANCE * 100}
          max={MAX_CANVAS_TRANSMITTANCE * 100}
          step={1}
          decimals={0}
          suffix="%"
          testId="material-canvas-transmittance"
          onValueChange={(pct) =>
            previewMaterial((d) => {
              d.canvasTransmittance = Number((pct / 100).toFixed(2));
            })
          }
          onValueCommit={commitMaterial}
        />
      </div>

      <Separator />

      <div className="space-y-2.5">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('material.canvasBackTitle')}
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">
            {t('material.canvasBackColor')}
          </Label>
          <ColorField
            value={material.canvasBackColor}
            pickerTestId="material-back-color-picker"
            hexTestId="material-back-color-hex"
            onValueChange={(hex) =>
              previewMaterial((d) => {
                d.canvasBackColor = hex;
              })
            }
            onValueCommit={commitMaterial}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {t('material.opticsNote')}
      </p>
    </div>
  );
}
