import { useRef } from 'react';
import { Archive, Download, FileCode2, FileText, Image as ImageIcon } from 'lucide-react';
import type { ExportSettings, PdfOrientation, PdfPageSize } from '@/core/types';
import type { SingleExportKind } from '@/export/package';
import { exportPackage, exportSingleFile } from '@/services/exportService';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
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
import { useI18n } from '@/ui/hooks/useI18n';
import { UnitNumberField } from '@/ui/widgets/UnitNumberField';

export function ExportPanel() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const exportSettings = useProjectStore((s) => s.project.export);
  const updateProject = useProjectStore((s) => s.updateProject);
  const isExporting = useUiStore((s) => s.tasks.length > 0);
  const pendingExportBeforeRef = useRef<ExportSettings | null>(null);

  const commitExportUpdate = (mutate: (draft: ExportSettings) => void) => {
    const before = pendingExportBeforeRef.current ?? {
      ...useProjectStore.getState().project.export,
    };
    pendingExportBeforeRef.current = null;
    updateProject((projectDraft) => {
      mutate(projectDraft.export);
    }, true);
    const after = { ...useProjectStore.getState().project.export };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      recordSettingsPatchHistory('settingsChange', {
        path: 'export',
        before,
        after,
      });
    }
  };

  const orientationLabel =
    exportSettings.pdfOrientation === 'portrait'
      ? t('export.orientationPortrait')
      : t('export.orientationLandscape');

  const files: ReadonlyArray<{
    kind: SingleExportKind;
    name: string;
    desc: string;
    icon: typeof ImageIcon;
  }> = [
    {
      kind: 'colorPng',
      name: t('export.fileColorPng'),
      desc: t('export.fileColorDesc', { w: canvas.widthPx, h: canvas.heightPx }),
      icon: ImageIcon,
    },
    {
      kind: 'heightPng',
      name: t('export.fileHeightPng'),
      desc: t('export.fileHeightDesc', { w: canvas.widthPx, h: canvas.heightPx }),
      icon: ImageIcon,
    },
    {
      kind: 'opacityPng',
      name: t('export.fileOpacityPng'),
      desc: t('export.fileOpacityDesc', { w: canvas.widthPx, h: canvas.heightPx }),
      icon: ImageIcon,
    },
    {
      kind: 'settingsJson',
      name: t('export.fileSettingsJson'),
      desc: t('export.fileSettingsDesc'),
      icon: FileCode2,
    },
    {
      kind: 'documentationPdf',
      name: t('export.fileDocumentationPdf'),
      desc: t('export.fileDocumentationDesc', {
        size: exportSettings.pdfPageSize,
        orientation: orientationLabel,
      }),
      icon: FileText,
    },
    {
      kind: 'previewFrontPng',
      name: t('export.filePreviewFront'),
      desc: t('export.filePreviewDesc', { size: exportSettings.previewLongestSide }),
      icon: ImageIcon,
    },
    {
      kind: 'previewBackPng',
      name: t('export.filePreviewBack'),
      desc: t('export.filePreviewDesc', { size: exportSettings.previewLongestSide }),
      icon: ImageIcon,
    },
    {
      kind: 'previewCombinedPng',
      name: t('export.filePreviewCombined'),
      desc: t('export.filePreviewDesc', { size: exportSettings.previewLongestSide }),
      icon: ImageIcon,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('export.packageTitle')}
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full gap-2"
          disabled={isExporting}
          onClick={() => void exportPackage()}
          data-testid="btn-export-package-panel"
        >
          <Archive className="size-4" />
          <span>{t('export.exportPackageButton')}</span>
        </Button>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {t('export.packageHint')}
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('export.settingsTitle')}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-normal">
              {t('export.pdfPageSize')}
            </Label>
            <Select
              value={exportSettings.pdfPageSize}
              onValueChange={(v) =>
                commitExportUpdate((d) => {
                  d.pdfPageSize = v as PdfPageSize;
                })
              }
            >
              <SelectTrigger size="sm" className="h-7 text-xs" data-testid="export-pdf-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A3">A3</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-normal">
              {t('export.pdfOrientation')}
            </Label>
            <Select
              value={exportSettings.pdfOrientation}
              onValueChange={(v) =>
                commitExportUpdate((d) => {
                  d.pdfOrientation = v as PdfOrientation;
                })
              }
            >
              <SelectTrigger size="sm" className="h-7 text-xs" data-testid="export-pdf-orientation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">{t('export.orientationLandscape')}</SelectItem>
                <SelectItem value="portrait">{t('export.orientationPortrait')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-normal">
              {t('export.previewResolution')}
            </Label>
            <Select
              value={String(exportSettings.previewLongestSide)}
              onValueChange={(v) =>
                commitExportUpdate((d) => {
                  d.previewLongestSide = Number(v);
                })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 font-mono text-xs"
                data-testid="export-preview-size"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1024">1024 px</SelectItem>
                <SelectItem value="2048">2048 px</SelectItem>
                <SelectItem value="4096">4096 px</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <UnitNumberField
            id="export-grid-spacing-cm"
            label={t('export.gridSheetSpacingCm')}
            value={exportSettings.gridSheetSpacingCm}
            min={1}
            max={50}
            step={0.5}
            decimals={1}
            suffix="cm"
            testId="export-grid-spacing-cm"
            onValueChange={(val) => {
              if (!pendingExportBeforeRef.current) {
                pendingExportBeforeRef.current = { ...useProjectStore.getState().project.export };
              }
              updateProject((projectDraft) => {
                projectDraft.export.gridSheetSpacingCm = Math.max(1, Math.min(50, val));
              });
            }}
            onValueCommit={(val) =>
              commitExportUpdate((d) => {
                d.gridSheetSpacingCm = Math.max(1, Math.min(50, val));
              })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="export-include-tiles-1to1"
            className="text-muted-foreground cursor-pointer text-xs font-normal"
          >
            {t('export.includeTiles1to1')}
          </Label>
          <Switch
            id="export-include-tiles-1to1"
            checked={exportSettings.includeTiles1to1}
            data-testid="export-include-tiles-1to1"
            onCheckedChange={(checked) =>
              commitExportUpdate((d) => {
                d.includeTiles1to1 = checked;
              })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="export-include-previews"
            className="text-muted-foreground cursor-pointer text-xs font-normal"
          >
            {t('export.includePreviews')}
          </Label>
          <Switch
            id="export-include-previews"
            checked={exportSettings.includePreviews}
            data-testid="export-include-previews"
            onCheckedChange={(checked) =>
              commitExportUpdate((d) => {
                d.includePreviews = checked;
              })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="export-color-alpha"
            className="text-muted-foreground cursor-pointer text-xs font-normal"
          >
            {t('export.colorPngAlpha')}
          </Label>
          <Switch
            id="export-color-alpha"
            checked={exportSettings.colorPngAlpha}
            data-testid="export-color-alpha"
            onCheckedChange={(checked) =>
              commitExportUpdate((d) => {
                d.colorPngAlpha = checked;
              })
            }
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('export.filesTitle')}
        </div>

        <div className="space-y-1.5">
          {files.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.kind}
                className="border-border bg-background/60 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-foreground truncate font-mono text-[11px] font-medium">
                      {item.name}
                    </div>
                    <div className="text-muted-foreground truncate text-[10px]">{item.desc}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={isExporting}
                  onClick={() => void exportSingleFile(item.kind)}
                  data-testid={`btn-download-${item.kind}`}
                  className="shrink-0 gap-1 px-2 text-[11px]"
                >
                  <Download className="size-3" />
                  <span>{t('export.downloadButton')}</span>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
