import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, HardDrive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatByteSize } from '@/lib/bytes';
import { sanitizeExportSlug } from '@/lib/download';
import {
  downloadProjectReliefFromDb,
  restoreProjectFromIndexedDb,
} from '@/persistence/autosave';
import {
  deleteProjectFromDb,
  listRecentProjects,
  type ProjectRecord,
} from '@/persistence/db';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { Progress } from '@/ui/components/ui/progress';
import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { useI18n } from '@/ui/hooks/useI18n';

interface ProjectRowItem {
  record: ProjectRecord;
  thumbUrl: string;
}

interface QuotaInfo {
  usage: number;
  quota: number;
}

function RecentProjectsContent({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const currentProjectId = useProjectStore((s) => s.project.id);

  const [rows, setRows] = useState<ProjectRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const urlsRef = useRef<string[]>([]);

  const revokeCurrentUrls = useCallback(() => {
    for (const url of urlsRef.current) {
      URL.revokeObjectURL(url);
    }
    urlsRef.current = [];
  }, []);

  const fetchListAndQuota = useCallback(async () => {
    const records = await listRecentProjects();
    const est =
      typeof navigator !== 'undefined' && navigator.storage?.estimate
        ? await navigator.storage.estimate()
        : null;
    const nextQuota =
      est && typeof est.usage === 'number' && typeof est.quota === 'number' && est.quota > 0
        ? { usage: est.usage, quota: est.quota }
        : null;
    return { records, nextQuota };
  }, []);

  const applyFetchedData = useCallback(
    (records: ProjectRecord[], nextQuota: QuotaInfo | null) => {
      revokeCurrentUrls();
      const nextRows: ProjectRowItem[] = records.map((record) => {
        const thumbUrl =
          record.thumbnail instanceof Blob && record.thumbnail.size > 0
            ? URL.createObjectURL(record.thumbnail)
            : '';
        if (thumbUrl) urlsRef.current.push(thumbUrl);
        return { record, thumbUrl };
      });
      setRows(nextRows);
      setQuota(nextQuota);
      setLoading(false);
    },
    [revokeCurrentUrls],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchListAndQuota()
      .then(({ records, nextQuota }) => {
        if (!cancelled) {
          applyFetchedData(records, nextQuota);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      revokeCurrentUrls();
    };
  }, [applyFetchedData, fetchListAndQuota, revokeCurrentUrls]);

  const handleOpenProject = async (record: ProjectRecord) => {
    setBusyId(record.id);
    try {
      const restored = await restoreProjectFromIndexedDb(record.id);
      const displayName = record.name === 'Untitled' ? t('app.untitledProject') : record.name;
      if (restored) {
        toast.success(t('recentProjects.openedToast', { name: displayName }));
        onClose();
      } else {
        toast.error(t('restoreSession.restoreErrorToast'));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadRelief = async (record: ProjectRecord) => {
    setBusyId(record.id);
    try {
      const ok = await downloadProjectReliefFromDb(record.id);
      if (ok) {
        toast.success(
          t('recentProjects.downloadedToast', {
            file: `${sanitizeExportSlug(record.name)}.relief`,
          }),
        );
      } else {
        toast.error(t('recentProjects.downloadFailedToast'));
      }
    } catch {
      toast.error(t('recentProjects.downloadFailedToast'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteProject = async (record: ProjectRecord) => {
    setBusyId(record.id);
    try {
      await deleteProjectFromDb(record.id);
      const displayName = record.name === 'Untitled' ? t('app.untitledProject') : record.name;
      toast.success(t('recentProjects.deletedToast', { name: displayName }));
      const { records, nextQuota } = await fetchListAndQuota();
      applyFetchedData(records, nextQuota);
    } finally {
      setBusyId(null);
    }
  };

  const quotaPct = quota ? Math.min(100, Math.round((quota.usage / quota.quota) * 100)) : 0;

  return (
    <>
      <div className="border-border bg-background/70 shrink-0 space-y-1.5 rounded-md border p-2.5 text-xs">
        <div className="text-muted-foreground flex items-center gap-2">
          <HardDrive className="size-3.5 shrink-0" />
          <span data-testid="recent-projects-quota">
            {quota
              ? t('recentProjects.storageUsage', {
                  used: formatByteSize(quota.usage),
                  quota: formatByteSize(quota.quota),
                  pct: quotaPct,
                })
              : t('recentProjects.storageUnknown')}
          </span>
        </div>
        {quota && <Progress value={quotaPct} className="h-1.5" />}
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-2">
        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-xs">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p
            className="text-muted-foreground py-8 text-center text-xs"
            data-testid="recent-projects-empty"
          >
            {t('recentProjects.empty')}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(({ record, thumbUrl }) => {
              const displayName =
                record.name === 'Untitled' ? t('app.untitledProject') : record.name;
              const dateObj = new Date(record.updatedAt);
              const formattedDate = Number.isNaN(dateObj.getTime())
                ? record.updatedAt
                : dateObj.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  });
              const isCurrent = record.id === currentProjectId;
              const isRowBusy = busyId === record.id;

              return (
                <div
                  key={record.id}
                  className="border-border bg-background/60 flex items-center gap-3 rounded-md border p-2.5"
                  data-testid={`recent-project-row-${record.id}`}
                >
                  <div className="border-border bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={displayName}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {record.settings.canvas.widthPx}×{record.settings.canvas.heightPx}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{displayName}</span>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('recentProjects.activeBadge')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate font-mono text-[11px]">
                      {t('recentProjects.metaLine', {
                        wCm: record.settings.canvas.widthCm,
                        hCm: record.settings.canvas.heightCm,
                        wPx: record.settings.canvas.widthPx,
                        hPx: record.settings.canvas.heightPx,
                        size: formatByteSize(record.sizeBytes),
                        date: formattedDate,
                      })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={isRowBusy}
                      onClick={() => void handleOpenProject(record)}
                      data-testid={`recent-open-${record.id}`}
                    >
                      <FolderOpen className="mr-1 size-3" />
                      {t('recentProjects.open')}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isRowBusy}
                      onClick={() => void handleDownloadRelief(record)}
                      data-testid={`recent-download-${record.id}`}
                    >
                      <Download className="mr-1 size-3" />
                      {t('recentProjects.downloadRelief')}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={isRowBusy}
                      aria-label={t('recentProjects.delete')}
                      onClick={() => void handleDeleteProject(record)}
                      data-testid={`recent-delete-${record.id}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <DialogFooter className="shrink-0">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RecentProjectsDialog() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.dialogs.recentProjectsOpen);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);

  return (
    <Dialog open={open} onOpenChange={(v) => setDialogOpen('recentProjectsOpen', v)}>
      <DialogContent
        className="bg-card text-foreground flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"
        data-testid="recent-projects-dialog"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('recentProjects.title')}</DialogTitle>
          <DialogDescription>{t('recentProjects.description')}</DialogDescription>
        </DialogHeader>
        {open && <RecentProjectsContent onClose={() => setDialogOpen('recentProjectsOpen', false)} />}
      </DialogContent>
    </Dialog>
  );
}
