/**
 * ScanNoteSheet — Upload a page photo from gallery, OCR + structure it via AI vision,
 * preview as formatted HTML, and insert into the current note.
 *
 * Pro-gated via the `ai_dictation` feature flag (shared "AI features" entitlement).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Loader2, Sparkles, X, RotateCcw, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForDisplay } from '@/lib/sanitize';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { canUseAiFeature, recordAiUsage, getLimitReachedMessage } from '@/utils/aiUsageLimits';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';

const AI_SCAN_TIMEOUT_MS = 45_000;
const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Receives sanitized HTML to insert into the editor at the cursor. */
  onInsertHtml: (html: string, suggestedTitle?: string) => void;
}

export const ScanNoteSheet = ({ isOpen, onClose, onInsertHtml }: Props) => {
  const { t, i18n } = useTranslation();
  const { isPro, isLocalTrial, isAdminBypass, isRevenueCatTrial, requireFeature } = useSubscription();
  const isStripeTrialing = typeof window !== 'undefined' && Boolean((window as any).__stripeIsTrialing);
  const isPaidTrial = isStripeTrialing || isRevenueCatTrial;
  const isOnTrial = isLocalTrial || isPaidTrial;
  const isPaidPro = isPro && !isOnTrial;
  const hasUnlimitedAi = isPaidPro || isAdminBypass || isPaidTrial;
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [html, setHtml] = useState('');
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const [hasRun, setHasRun] = useState(false);
  const captureLockRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setImageDataUrl(null);
      setHtml('');
      setSuggestedTitle('');
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
    const release = acquireAiLock();
    if (!release) {
      toast.error(getAiBusyMessage());
      return;
    }
    setIsExtracting(true);
    setHasRun(false);
    setHtml('');
    setSuggestedTitle('');
    try {
      await yieldToPaint();
      const { data, error } = await supabase.functions.invoke(
        'ai-extract-note-from-image',
        {
          body: {
            imageBase64: dataUrl,
            languageCode: (i18n.language || 'en').split('-')[0],
            languageName: 'auto',
          },
          timeout: AI_SCAN_TIMEOUT_MS,
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const rawHtml = String((data as any)?.html || '').trim();
      const title = String((data as any)?.title || '').trim();
      setHtml(rawHtml);
      setSuggestedTitle(title);
      setHasRun(true);
      if (!hasUnlimitedAi) recordAiUsage('scan');

      if (!rawHtml) {
        toast.info(t('scanNote.noText', 'No readable text found in this image'));
      }
    } catch (e: any) {
      console.error('[scan note] error', e);
      const msg = e?.message || '';
      if (msg.includes('429')) {
        toast.error(t('tasks.aiRateLimit', 'AI is busy, try again shortly'));
      } else if (msg.includes('402')) {
        toast.error(t('tasks.aiCredits', 'AI credits exhausted'));
      } else if (msg.includes('AbortError') || msg.includes('aborted') || msg.includes('timeout')) {
        toast.error(t('scanNote.timeout', 'This scan took too long. Try a clearer or smaller photo.'));
      } else {
        toast.error(t('scanNote.failed', 'Could not read this page'));
      }
    } finally {
      setIsExtracting(false);
      release();
    }
  };

  const handleInsert = () => {
    if (!html.trim()) {
      toast.error(t('scanNote.nothingToInsert', 'Nothing to insert'));
      return;
    }
    onInsertHtml(html, suggestedTitle || undefined);
    toast.success(t('scanNote.inserted', 'Inserted into your note'));
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[92vh] overflow-y-auto p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('scanNote.title', 'Scan page to note')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('scanNote.description', 'Choose a page photo and convert it into a formatted note with AI.')}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {!imageDataUrl && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t(
                  'scanNote.helperGallery',
                  'Pick a photo of a handwritten or printed page from your gallery. AI will transcribe it and keep the headings and lists.',
                )}
              </p>
              <Button onClick={runCapture} className="h-14 w-full gap-2">
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">{t('imageExtract.fromGallery', 'From gallery')}</span>
              </Button>
            </div>
          )}

          {imageDataUrl && (
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <img
                src={imageDataUrl}
                alt={t('scanNote.previewAlt', 'Captured page')}
                className="w-full max-h-40 object-cover"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  disabled={isExtracting}
                  onClick={runCapture}
                  className="h-8 px-3 rounded-full bg-black/60 text-white flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('imageExtract.replacePhoto', 'Replace photo')}
                </button>
                <button
                  onClick={() => {
                    setImageDataUrl(null);
                    setHtml('');
                    setSuggestedTitle('');
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

          {isExtracting && (
            <div className="flex items-center gap-3 px-3 py-4 rounded-xl bg-primary/5">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <span className="text-sm text-foreground">
                {t('scanNote.reading', 'Transcribing your page…')}
              </span>
            </div>
          )}

          {!isExtracting && hasRun && html && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('scanNote.preview', 'Preview')}
              </div>
              {suggestedTitle && (
                <div className="text-xs text-muted-foreground">
                  {t('scanNote.suggestedTitle', 'Suggested title')}:{' '}
                  <span className="text-foreground font-medium">{suggestedTitle}</span>
                </div>
              )}
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-xl border bg-card max-h-[40vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(html) }}
              />
              <Button onClick={handleInsert} className="w-full h-12 gap-2">
                <Check className="h-4 w-4" />
                {t('scanNote.insertIntoNote', 'Insert into note')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
