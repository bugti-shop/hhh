/**
 * ImageTaskExtractorSheet — Capture a paper / sticky-note photo, run AI vision
 * extraction, and let the user review & add the detected tasks in bulk.
 *
 * Pro-gated via the `ai_dictation` (alias `ai_vision`) feature flag.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Loader2, Sparkles, X, Check, Trash2, RotateCcw, Minus, Plus, Maximize2 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetPortal } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { supabase } from '@/integrations/supabase/client';
import { TodoItem, Folder, Priority, RepeatType } from '@/types/note';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { canUseAiFeature, recordAiUsage, getLimitReachedMessage } from '@/utils/aiUsageLimits';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';

const AI_SCAN_TIMEOUT_MS = 45_000;
const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

interface TaskSection { id: string; name: string }

interface ExtractedTask {
  title: string;
  description?: string | null;
  dueDateIso: string | null;
  reminderIso?: string | null;
  deadlineIso: string | null;
  priority: Priority;
  isUrgent?: boolean;
  folderId: string | null;
  sectionId: string | null;
  repeatType: RepeatType;
  repeatDays?: number[];
  tags?: string[];
  location?: string | null;
}

interface ReviewItem extends ExtractedTask {
  uid: string;
  selected: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddTasks: (tasks: Array<Omit<TodoItem, 'id' | 'completed'>>) => void;
  folders: Folder[];
  sections: TaskSection[];
  currentFolderId?: string | null;
  currentSectionId?: string | null;
}

export const ImageTaskExtractorSheet = ({
  isOpen,
  onClose,
  onAddTasks,
  folders,
  sections,
  currentFolderId,
  currentSectionId,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { isPro, isLocalTrial, isAdminBypass, isRevenueCatTrial, requireFeature } = useSubscription();
  const isStripeTrialing = typeof window !== 'undefined' && Boolean((window as any).__stripeIsTrialing);
  // Any trial that has a payment method attached (Stripe web trial, RevenueCat native trial).
  const isPaidTrial = isStripeTrialing || isRevenueCatTrial;
  const isOnTrial = isLocalTrial || isPaidTrial;
  const isPaidPro = isPro && !isOnTrial;
  // Unlimited AI for: paid Pro, admin (BUGTI code), and any trial with a card on file
  // (Stripe trial OR Android/iOS native RevenueCat trial). Only the local no-card trial gets the daily cap.
  const hasUnlimitedAi = isPaidPro || isAdminBypass || isPaidTrial;
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const captureLockRef = useRef(false);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setImageDataUrl(null);
      setItems([]);
      setIsExtracting(false);
      setHasRun(false);
      captureLockRef.current = false;
      releaseAllAiLocks();
    }
  }, [isOpen]);

  const runCapture = async () => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    try {
      const dataUrl = await captureImageForAI('gallery');
      if (!dataUrl) return;
      setImageDataUrl(dataUrl);
      await runExtraction(dataUrl);
    } finally {
      captureLockRef.current = false;
    }
  };

  const runExtraction = async (dataUrl: string) => {
    if (!hasUnlimitedAi && !isOnTrial) {
      onClose();
      requireFeature('ai_scan' as any);
      return;
    }
    if (!hasUnlimitedAi && !canUseAiFeature('scan')) {
      toast.error(getLimitReachedMessage('scan'));
      return;
    }
    // Prevent concurrent AI calls — Android WebView OOMs with parallel base64 uploads.
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      return;
    }
    setIsExtracting(true);
    setHasRun(false);
    setItems([]);
    try {
      await yieldToPaint();
      const { data, error } = await supabase.functions.invoke(
        'ai-extract-tasks-from-image',
        {
          body: {
            imageBase64: dataUrl,
            folders: folders.map((f) => ({ id: f.id, name: f.name })),
            sections: sections.map((s) => ({ id: s.id, name: s.name })),
            nowIso: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            languageCode: (i18n.language || 'en').split('-')[0],
            languageName: 'auto',
          },
          timeout: AI_SCAN_TIMEOUT_MS,
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const rawTasks: ExtractedTask[] = Array.isArray((data as any)?.tasks)
        ? (data as any).tasks
        : [];

      const reviewItems: ReviewItem[] = rawTasks
        .filter((tk) => tk && typeof tk.title === 'string' && tk.title.trim().length > 0)
        .map((tk, i) => ({
          uid: `extracted-${Date.now()}-${i}`,
          title: tk.title.trim(),
          dueDateIso: tk.dueDateIso || null,
          deadlineIso: tk.deadlineIso || null,
          priority: (tk.priority || 'none') as Priority,
          folderId: tk.folderId || null,
          sectionId: tk.sectionId || null,
          repeatType: (tk.repeatType || 'none') as RepeatType,
          selected: true,
        }));

      setItems(reviewItems);
      setHasRun(true);
      if (!hasUnlimitedAi) recordAiUsage('scan');

      if (reviewItems.length === 0) {
        toast.info(t('imageExtract.noTasks', 'No tasks detected in this image'));
      }
    } catch (e: any) {
      console.error('[image extract] error', e);
      const msg = e?.message || '';
      if (msg.includes('429')) {
        toast.error(t('tasks.aiRateLimit', 'AI is busy, try again shortly'));
      } else if (msg.includes('402')) {
        toast.error(t('tasks.aiCredits', 'AI credits exhausted'));
      } else if (msg.includes('AbortError') || msg.includes('aborted') || msg.includes('timeout')) {
        toast.error(t('imageExtract.timeout', 'This scan took too long. Try a clearer or smaller photo.'));
      } else {
        toast.error(
          t('imageExtract.failed', 'Could not read tasks from this image'),
        );
      }
    } finally {
      setIsExtracting(false);
      release();
    }
  };

  const toggleSelect = (uid: string) => {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, selected: !it.selected } : it)),
    );
  };

  const updateTitle = (uid: string, title: string) => {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, title } : it)),
    );
  };

  const removeItem = (uid: string) => {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  };

  const selectedCount = items.filter((i) => i.selected && i.title.trim()).length;

  const formatDateChip = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const folderName = (id: string | null): string | null => {
    if (!id) return null;
    return folders.find((f) => f.id === id)?.name || null;
  };

  const handleAddAll = () => {
    const selected = items.filter((i) => i.selected && i.title.trim());
    if (selected.length === 0) {
      toast.error(t('imageExtract.nothingSelected', 'Nothing selected to add'));
      return;
    }

    const newTasks: Array<Omit<TodoItem, 'id' | 'completed'>> = selected.map(
      (it) => ({
        text: it.title.trim(),
        priority: it.priority,
        dueDate: it.dueDateIso ? new Date(it.dueDateIso) : undefined,
        repeatType: it.repeatType,
        folderId: it.folderId || currentFolderId || undefined,
        sectionId: it.sectionId || currentSectionId || undefined,
      }),
    );

    onAddTasks(newTasks);
    toast.success(
      t('imageExtract.added', '{{count}} tasks added', {
        count: newTasks.length,
      }),
    );
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetPortal>
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-[199] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ zIndex: 199 }}
        />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-[200] gap-4 bg-background border border-white/20 p-0 shadow-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-300 data-[state=open]:duration-500"
          style={{ zIndex: 200, paddingBottom: `calc(1.5rem + var(--safe-bottom, 0px))` }}
        >
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none">
            <X className="h-4 w-4" />
          </SheetPrimitive.Close>
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('imageExtract.title', 'Scan tasks from paper')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('imageExtract.description', 'Choose a photo and extract tasks with AI.')}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Capture buttons (only when no image yet) */}
          {!imageDataUrl && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t(
                  'imageExtract.helper',
                  'Snap a photo of your sticky notes, whiteboard, or handwritten to-do list. AI will extract each task.',
                )}
              </p>
              <Button
                onClick={runCapture}
                className="h-14 w-full gap-2"
              >
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">
                  {t('imageExtract.fromGallery', 'From gallery')}
                </span>
              </Button>
            </div>
          )}

          {/* Image preview */}
          {imageDataUrl && (
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <button
                type="button"
                onClick={() => setIsZoomed(true)}
                className="block w-full"
                aria-label={t('imageExtract.zoom', 'Tap to zoom')}
              >
                <img
                  src={imageDataUrl}
                  alt={t('imageExtract.previewAlt', 'Captured tasks')}
                  className="w-full max-h-48 object-cover"
                />
              </button>
              <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white pointer-events-none">
                {t('imageExtract.tapToZoom', 'Tap to zoom')}
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  disabled={isExtracting}
                  onClick={() => {
                    setImageDataUrl(null);
                    setItems([]);
                    setHasRun(false);
                    runCapture();
                  }}
                  className="h-8 px-3 rounded-full bg-black/60 text-white flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                  aria-label={t('imageExtract.replacePhoto', 'Replace photo')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('imageExtract.replacePhoto', 'Replace photo')}
                </button>
                <button
                  onClick={() => {
                    setImageDataUrl(null);
                    setItems([]);
                    setHasRun(false);
                  }}
                  className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label={t('common.remove', 'Remove')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isExtracting && (
            <div className="flex items-center gap-3 px-3 py-4 rounded-xl bg-primary/5">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <span className="text-sm text-foreground">
                {t('imageExtract.reading', 'Reading your tasks…')}
              </span>
            </div>
          )}

          {/* Extracted tasks list */}
          {!isExtracting && items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('imageExtract.detected', 'Detected tasks')} · {items.length}
                </span>
                <button
                  onClick={() =>
                    setItems((prev) =>
                      prev.map((it) => ({ ...it, selected: true })),
                    )
                  }
                  className="text-xs text-primary"
                >
                  {t('common.selectAll', 'Select all')}
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it) => {
                  const dateChip = formatDateChip(it.dueDateIso);
                  const fName = folderName(it.folderId);
                  return (
                    <div
                      key={it.uid}
                      className={cn(
                        'flex items-start gap-2 p-3 rounded-xl border bg-card transition-colors',
                        it.selected
                          ? 'border-primary/30'
                          : 'border-border opacity-60',
                      )}
                    >
                      <Checkbox
                        checked={it.selected}
                        onCheckedChange={() => toggleSelect(it.uid)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Input
                          value={it.title}
                          onChange={(e) => updateTitle(it.uid, e.target.value)}
                          className="h-8 text-sm border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent"
                        />
                        {(dateChip || fName || it.priority !== 'none' || it.repeatType !== 'none') && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dateChip && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                {dateChip}
                              </span>
                            )}
                            {it.priority !== 'none' && (
                              <span
                                className={cn(
                                  'text-[11px] px-1.5 py-0.5 rounded-full',
                                  it.priority === 'high' && 'bg-destructive/10 text-destructive',
                                  it.priority === 'medium' && 'bg-warning/10 text-warning',
                                  it.priority === 'low' && 'bg-success/10 text-success',
                                )}
                              >
                                {it.priority}
                              </span>
                            )}
                            {it.repeatType !== 'none' && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple">
                                {it.repeatType}
                              </span>
                            )}
                            {fName && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-streak/10 text-streak">
                                {fName}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(it.uid)}
                        className="flex-shrink-0 w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                        aria-label={t('common.remove', 'Remove')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state after run */}
          {!isExtracting && hasRun && items.length === 0 && imageDataUrl && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {t(
                'imageExtract.noTasks',
                'No tasks detected. Try a clearer photo with one task per line.',
              )}
            </div>
          )}

          {/* Action bar */}
          {items.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleAddAll}
                disabled={selectedCount === 0}
                className="flex-1 gap-1"
              >
                <Check className="h-4 w-4" />
                {t('imageExtract.addCount', 'Add {{count}}', {
                  count: selectedCount,
                })}
              </Button>
            </div>
          )}
        </div>
        </SheetPrimitive.Content>
      </SheetPortal>

      <Dialog open={isZoomed} onOpenChange={setIsZoomed}>
        <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 border-0 bg-black rounded-none shadow-none overflow-hidden sm:rounded-none">
          {imageDataUrl && (
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={6}
              doubleClick={{ mode: 'toggle', step: 2 }}
              wheel={{ step: 0.2 }}
              pinch={{ step: 5 }}
              centerOnInit
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperClass="!w-full !h-full"
                    contentClass="!w-full !h-full flex items-center justify-center"
                  >
                    <img
                      src={imageDataUrl}
                      alt={t('imageExtract.previewAlt', 'Captured tasks')}
                      className="max-w-full max-h-full object-contain select-none"
                      draggable={false}
                    />
                  </TransformComponent>

                  {/* Top-right close */}
                  <button
                    onClick={() => setIsZoomed(false)}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center hover:bg-white/25 transition-colors z-10"
                    aria-label={t('common.close', 'Close')}
                  >
                    <X className="h-5 w-5" />
                  </button>

                  {/* Bottom controls */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/15 backdrop-blur z-10">
                    <button
                      onClick={() => zoomOut()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.zoomOut', 'Zoom out')}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => resetTransform()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.reset', 'Reset zoom')}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => zoomIn()}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                      aria-label={t('imageExtract.zoomIn', 'Zoom in')}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Hint */}
                  <div className="absolute top-4 left-4 text-[11px] px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-white pointer-events-none z-10">
                    {t('imageExtract.pinchHint', 'Pinch or double-tap to zoom')}
                  </div>
                </>
              )}
            </TransformWrapper>
          )}
        </DialogContent>
      </Dialog>

    </Sheet>
  );
};
