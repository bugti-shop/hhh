import { useState, useEffect, useCallback, useRef } from 'react';
import { genId } from '@/utils/genId';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { compressImage, isCompressibleImage } from '@/utils/imageCompression';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { Note, NoteType, StickyColor, VoiceRecording, Folder, FloatingImage } from '@/types/note';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from './RichTextEditor';
import { FloatingImageLayer, FloatingImageLayerHandle } from './FloatingImageLayer';
import { LinkedInTextFormatter } from './LinkedInTextFormatter';
import { getTableStyles, TableStyle } from './TableEditor';
import { InlineFindReplace } from './InlineFindReplace';

import { VirtualizedCodeEditor } from './VirtualizedCodeEditor';
import { lazy, Suspense } from 'react';

const sketchImport = () => import('./SketchEditor').then(m => ({ default: m.SketchEditor }));
const SketchEditor = lazy(() =>
  sketchImport().catch(() => sketchImport())
);

// Preload sketch chunk as soon as NoteEditor module is loaded
sketchImport().catch(() => {});
import { SketchNotebookLibrary } from './SketchNotebookLibrary';
import { TemplateSelector } from './TemplateSelector';
import { NoteVersionHistorySheet } from './NoteVersionHistorySheet';
import { NoteLinkingSheet } from './NoteLinkingSheet';
import { injectHeadingIds } from './NoteTableOfContents';
import { InputSheetPage } from './InputSheetPage';
import { VoiceRecordingSheet } from './VoiceRecordingSheet';
import { ScanNoteSheet } from './ScanNoteSheet';
import { SafeComponent } from './ErrorBoundary';

import { NoteVoicePlayer } from './NoteVoicePlayer';
import { AudioPlayer } from './AudioPlayer';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { sanitizeForDisplay } from '@/lib/sanitize';

import { ErrorBoundary } from './ErrorBoundary';
import { PdfExportSuccessDialog } from './PdfExportSuccessDialog';
import { PdfExportOptionsSheet, PdfExportSettings } from './PdfExportOptionsSheet';
import { ArrowLeft, Folder as FolderIcon, Plus, CalendarIcon, History, FileDown, Link2, ChevronDown, FileText, BookOpen, BarChart3, MoreVertical, Mic, Share2, Search, Image, Table, Minus, SeparatorHorizontal, MessageSquare, FileSymlink, FileType, Bell, Clock, Repeat, Trash2, Mail, Phone, LinkIcon, Copy, Replace, Palette, Hash, Crown, ListFilter, CaseLower, Tag as TagIcon, Camera, Sparkles } from 'lucide-react';
import { exportNoteToPdf, getPageBreakCount, PdfExportResult } from '@/utils/exportToPdf';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';

import { saveNoteVersion } from '@/utils/noteVersionHistory';
import { triggerTripleHeavyHaptic } from '@/utils/haptics';
import { saveNoteToDBSingle } from '@/utils/noteStorage';
import { exportNoteToMarkdown } from '@/utils/markdownExport';
import { insertNoteLink, findBacklinks } from '@/utils/noteLinking';
import { calculateNoteStats, formatReadingTime } from '@/utils/noteStats';
import { copyWithFormatting } from '@/utils/richTextCopy';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { TagManagementSheet } from './TagManagementSheet';

interface NoteEditorProps {
  note: Note | null;
  isOpen: boolean;
  onClose: () => void;
  /** Return false (or resolve to false) to block persistence — e.g. when a soft paywall rejects the save. */
  onSave: (note: Note) => boolean | void | Promise<boolean | void>;
  defaultType?: NoteType;
  defaultFolderId?: string;
  allNotes?: Note[];
  /** Route to navigate back to when editor closes. If not provided, stays on current route. */
  returnTo?: string;
  /** When true, skip browser history push/pop (used inside onboarding to avoid step skipping) */
  skipHistory?: boolean;
}

// User-created folders only - no default note type folders

const STICKY_COLORS: StickyColor[] = ['yellow', 'blue', 'green', 'pink', 'orange'];

const STICKY_COLOR_VALUES = {
  yellow: 'hsl(var(--sticky-yellow))',
  blue: 'hsl(var(--sticky-blue))',
  green: 'hsl(var(--sticky-green))',
  pink: 'hsl(var(--sticky-pink))',
  orange: 'hsl(var(--sticky-orange))',
};

export const NoteEditor = ({ note, isOpen, onClose, onSave, defaultType = 'regular', defaultFolderId, allNotes = [], returnTo, skipHistory = false }: NoteEditorProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requireFeature, isPro } = useSubscription();
  
  const draftIdRef = useRef<string | null>(null);
  const isOpenRef = useRef(isOpen);
  const pushedHistoryRef = useRef(false);
  const isPoppingHistoryRef = useRef(false);
  const returnToRef = useRef(returnTo);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Capture the returnTo route when editor opens
  useEffect(() => {
    if (isOpen && returnTo) {
      returnToRef.current = returnTo;
    }
  }, [isOpen, returnTo]);

  const getCurrentNoteId = useCallback(() => {
    if (note?.id) return note.id;
    if (!draftIdRef.current) draftIdRef.current = `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return draftIdRef.current;
  }, [note?.id]);

  const [noteType, setNoteType] = useState<NoteType>(defaultType);
  const [title, setTitle] = useState('');
  const [content, setContentState] = useState('');
  const contentRef = useRef('');
  const setContent = useCallback((val: React.SetStateAction<string>) => {
    setContentState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      contentRef.current = next;
      return next;
    });
  }, []);
  const [color, setColor] = useState<StickyColor>('yellow');
  const [images, setImages] = useState<string[]>([]);
  const [floatingImages, setFloatingImages] = useState<FloatingImage[]>([]);
  const floatingImageRef = useRef<FloatingImageLayerHandle>(null);
  const [voiceRecordings, setVoiceRecordings] = useState<VoiceRecording[]>([]);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [tableStyle, setTableStyle] = useState<'default' | 'striped' | 'bordered' | 'minimal' | 'modern'>('default');
  
  const TABLE_STYLE_OPTIONS = [
    { id: 'default', name: t('editor.tableStyles.default', 'Default') },
    { id: 'striped', name: t('editor.tableStyles.striped', 'Striped') },
    { id: 'bordered', name: t('editor.tableStyles.bordered', 'Bordered') },
    { id: 'minimal', name: t('editor.tableStyles.minimal', 'Minimal') },
    { id: 'modern', name: t('editor.tableStyles.modern', 'Modern') },
  ] as const;
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [fontFamily, setFontFamily] = useState<string>('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  const [fontSize, setFontSize] = useState<string>('16px');
  const [fontWeight, setFontWeight] = useState<string>('400');
  const [letterSpacing, setLetterSpacing] = useState<string>('0em');
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [lineHeight, setLineHeight] = useState<string>('1.5');
  const [createdAt, setCreatedAt] = useState<Date>(new Date());
  const [createdTime, setCreatedTime] = useState<string>('12:00');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<string>('12:00');
  const [reminderRecurring, setReminderRecurring] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [reminderVibration, setReminderVibration] = useState<boolean>(true);
  const [notificationId, setNotificationId] = useState<number | undefined>(undefined);
  const [notificationIds, setNotificationIds] = useState<number[] | undefined>(undefined);

  // Code note state
  const [codeContent, setCodeContent] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<string>('auto');


  // Folder state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // Tag state
  const [noteTagIds, setNoteTagIds] = useState<string[]>([]);
  const [showTagSheet, setShowTagSheet] = useState(false);
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isNoteLinkingOpen, setIsNoteLinkingOpen] = useState(false);
  const [isBacklinksOpen, setIsBacklinksOpen] = useState(true);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [metaDescription, setMetaDescription] = useState<string>('');
  const [customColor, setCustomColor] = useState<string | undefined>(undefined);
  
  
  // Voice recorder state
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showScanNote, setShowScanNote] = useState(false);
  
  const [showSketchLibrary, setShowSketchLibrary] = useState(false);
  
  // Input sheet page states (replaces window.prompt)
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false);
  const [isCommentInputOpen, setIsCommentInputOpen] = useState(false);
  const [isMetaDescInputOpen, setIsMetaDescInputOpen] = useState(false);
  const [isTitleEditOpen, setIsTitleEditOpen] = useState(false);
  
  // Sketch meta dialog state - shown when closing a sketch note
  const [showSketchMetaDialog, setShowSketchMetaDialog] = useState(false);
  const [sketchMetaTitle, setSketchMetaTitle] = useState('');
  const [sketchMetaDesc, setSketchMetaDesc] = useState('');
  const sketchMetaPendingCloseRef = useRef(false);
  // PDF export success dialog state
  const [pdfExportResult, setPdfExportResult] = useState<{ filename: string; base64Data: string } | null>(null);
  const [showPdfOptionsSheet, setShowPdfOptionsSheet] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  const editorRef = useRef<HTMLDivElement>(null);
  
  // Handle voice recording completion - insert inline at cursor position
  const handleVoiceRecordingComplete = useCallback((audioBlob: Blob, audioUrl: string, duration: number) => {
    const newRecording: VoiceRecording = {
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      audioUrl,
      duration,
      timestamp: new Date(),
    };
    setVoiceRecordings(prev => [...prev, newRecording]);
    
    // Insert audio player HTML at cursor position in the editor
    const formatDuration = (secs: number) => {
      const mins = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${mins}:${s.toString().padStart(2, '0')}`;
    };
    
    // Generate waveform bars with varying heights for dynamic look
    const generateWaveformBars = (isProgress = false) => {
      const bars = [];
      // Pre-defined heights to create a natural waveform pattern
      const heights = [4, 8, 12, 6, 14, 10, 16, 8, 12, 18, 10, 6, 14, 8, 16, 12, 6, 10, 14, 8, 18, 12, 6, 10, 16, 8, 14, 10, 6, 12];
      for (let i = 0; i < 30; i++) {
        const height = heights[i % heights.length];
        const color = isProgress ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.35)';
        bars.push(`<span class="waveform-bar" data-index="${i}" style="display: inline-block; width: 3px; height: ${height}px; border-radius: 2px; background: ${color}; margin: 0 1px;"></span>`);
      }
      return bars.join('');
    };
    
    const audioPlayerHtml = `
      <div class="voice-recording-inline" data-voice-id="${newRecording.id}" data-duration="${duration}" data-speed="1" contenteditable="false">
        <audio src="${audioUrl}" data-duration="${duration}"></audio>
        <button class="voice-play-btn" type="button" aria-label="Play/Pause">
          <svg class="play-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg class="pause-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display: none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <div class="voice-waveform voice-seek-area" role="slider" aria-label="Seek audio" tabindex="0">
          <div class="waveform-progress" style="position: absolute; left: 0; top: 0; height: 100%; width: 0%; overflow: hidden; display: flex; align-items: center; pointer-events: none;">
            ${generateWaveformBars(true)}
          </div>
          <div class="waveform-background" style="display: flex; align-items: center; pointer-events: none;">
            ${generateWaveformBars(false)}
          </div>
        </div>
        <span class="voice-duration">${formatDuration(duration)}</span>
        <button class="voice-speed-btn" type="button" aria-label="Playback speed">1x</button>
        <button class="voice-delete-btn" type="button" aria-label="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
        </button>
      </div>
    `.trim();
    
    // Try to insert at cursor position
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertHTML', false, audioPlayerHtml + '<p><br></p>');
    } else {
      // Fallback: append to content
      setContent(prev => prev + audioPlayerHtml);
    }
  }, []);
  
  // Calculate stats
  const noteStats = calculateNoteStats(content, title);
  
  // Calculate backlinks
  const backlinks = note ? findBacklinks(note, allNotes) : [];

  useEffect(() => {
    const loadFolders = async () => {
      const savedFolders = await getSetting<Folder[] | null>('folders', null);
      if (savedFolders) {
        setFolders(savedFolders.map((f: Folder) => ({
          ...f,
          createdAt: new Date(f.createdAt),
        })));
      }
    };
    loadFolders();
    
    // Re-load when folders change externally
    const handleFoldersUpdated = () => loadFolders();
    window.addEventListener('foldersUpdated', handleFoldersUpdated);
    return () => window.removeEventListener('foldersUpdated', handleFoldersUpdated);
  }, []);

  useEffect(() => {
    if (note) {
      console.log(`[NoteEditor] Loading note: id=${note.id}, type=${note.type}, content length=${note.content?.length || 0}`);
      setNoteType(note.type);
      setTitle(note.title);
      
      // Check for crash-recovery data that may be newer than what's in IndexedDB
      let recoveredContent = note.content;
      try {
        const recoveryRaw = localStorage.getItem('note_crash_recovery');
        if (recoveryRaw) {
          const recovery = JSON.parse(recoveryRaw);
          // Only use recovery if it's for THIS note and less than 30 seconds old
          if (recovery.id === note.id && (Date.now() - recovery.timestamp) < 30000) {
            if (recovery.content && recovery.content.length > (note.content?.length || 0)) {
              recoveredContent = recovery.content;
              console.log('[NoteEditor] Recovered unsaved content from crash recovery');
            }
            if (recovery.codeContent) {
              setCodeContent(recovery.codeContent);
            }
          }
          // Clear recovery data after use
          localStorage.removeItem('note_crash_recovery');
        }
      } catch {}
      
      setContent(recoveredContent);
      setColor(note.color || 'yellow');
      setCustomColor(note.customColor);
      setImages(note.images || []);
      setFloatingImages(note.floatingImages || []);
      setVoiceRecordings(note.voiceRecordings || []);
      setSelectedFolderId(note.folderId);
      setNoteTagIds(note.tagIds || []);
      setFontFamily(note.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
      setFontSize(note.fontSize || '16px');
      setFontWeight(note.fontWeight || '400');
      setLetterSpacing(note.letterSpacing || '0em');
      setIsItalic(note.isItalic || false);
      setLineHeight(note.lineHeight || '1.5');
      const noteDate = new Date(note.createdAt);
      setCreatedAt(noteDate);
      setCreatedTime(format(noteDate, 'HH:mm'));
      setReminderEnabled(note.reminderEnabled || false);
      setReminderRecurring(note.reminderRecurring || 'none');
      setReminderVibration(note.reminderVibration !== false);
      if (note.reminderTime) {
        const reminderDate = new Date(note.reminderTime);
        setReminderTime(format(reminderDate, 'HH:mm'));
      }
      setNotificationId(note.notificationId);
      setNotificationIds(note.notificationIds);

      // Code fields
      if (!recoveredContent || note.type !== 'code') {
        setCodeContent(note.codeContent || '');
      }
      setCodeLanguage(note.codeLanguage || 'auto');
      setMetaDescription(note.metaDescription || '');
      
    } else {
      // Reset draft ID for new notes to prevent overwriting
      draftIdRef.current = null;
      
      // Load default font settings from notes settings
      const loadDefaultFontSettings = async () => {
        try {
          const notesSettings = await getSetting<{
            normalText?: { fontFamily?: string; fontSize?: string; fontColor?: string };
            headings?: { fontFamily?: string; fontSize?: string; fontColor?: string };
          } | null>('notesEditorSettings', null);
          
          if (notesSettings?.normalText) {
            const { fontFamily: savedFont, fontSize: savedSize } = notesSettings.normalText;
            if (savedFont && savedFont !== 'System Default') {
              setFontFamily(savedFont);
            } else {
              setFontFamily('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
            }
            if (savedSize) {
              setFontSize(`${savedSize}px`);
            } else {
              setFontSize('16px');
            }
          } else {
            setFontFamily('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
            setFontSize('16px');
          }
        } catch (error) {
          console.error('Error loading default font settings:', error);
          setFontFamily('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
          setFontSize('16px');
        }
      };
      
      loadDefaultFontSettings();
      
      setNoteType(defaultType);
      setTitle('');
      setContent('');
      setColor('yellow');
      setCustomColor(undefined);
      setImages([]);
      setFloatingImages([]);
      setVoiceRecordings([]);
      setSelectedFolderId(defaultFolderId);
      setNoteTagIds([]);
      setFontWeight('400');
      setLetterSpacing('0em');
      setIsItalic(false);
      setLineHeight('1.5');
      const now = new Date();
      setCreatedAt(now);
      setCreatedTime(format(now, 'HH:mm'));
      setReminderEnabled(false);
      setReminderTime('12:00');
      setReminderRecurring('none');
      setReminderVibration(true);
      setNotificationId(undefined);
      setNotificationIds(undefined);
      setMetaDescription('');

      // Reset code fields
      setCodeContent('');
      setCodeLanguage('auto');
      
      // Auto-open voice recorder for new voice notes
      if (defaultType === 'voice') {
        setTimeout(() => setShowVoiceRecorder(true), 100);
      }
    }
  }, [note, defaultType, defaultFolderId, isOpen]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    const newFolder: Folder = {
      id: genId(),
      name: newFolderName,
      isDefault: false,
      createdAt: new Date(),
      color: newFolderColor,
    };

    const updatedFolders = [...folders, newFolder];
    setFolders(updatedFolders);
    // Save folders to IndexedDB and dispatch event
    const foldersToSave = updatedFolders.filter(f => !f.isDefault);
    await setSetting('folders', foldersToSave);
    // Dispatch event so Index.tsx can pick up the new folder
    window.dispatchEvent(new Event('foldersUpdated'));
    setSelectedFolderId(newFolder.id);
    setNewFolderName('');
    setNewFolderColor('#3B82F6');
    setIsNewFolderDialogOpen(false);
    toast.success(t('toast.folderCreated'));
  };

  const persistNoteToIndexedDB = useCallback(async (savedNote: Note) => {
    try {
      console.log(`[NoteEditor] persistNoteToIndexedDB: id=${savedNote.id}, type=${savedNote.type}, content length=${savedNote.content?.length || 0}`);
      await saveNoteToDBSingle(savedNote);
    } catch (e) {
      console.warn('Failed to persist note to IndexedDB', e);
    }
  }, []);

  const buildCurrentNote = useCallback((): Note => {
    // Combine date and time
    const [hours, minutes] = createdTime.split(':').map(Number);
    const combinedDateTime = new Date(createdAt);
    combinedDateTime.setHours(hours, minutes, 0, 0);

    return {
      id: getCurrentNoteId(),
      type: noteType,
      title,
      content: noteType === 'code' ? '' : contentRef.current,
      color: noteType === 'sticky' ? color : undefined,
      customColor: noteType !== 'sticky' && noteType !== 'voice' ? customColor : undefined,
      images: noteType === 'sticky' ? undefined : images,
      floatingImages: (noteType === 'regular' || noteType === 'sticky' || noteType === 'textformat') && floatingImages.length > 0 ? floatingImages : undefined,
      voiceRecordings,
      folderId: selectedFolderId || noteType,
      fontFamily: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? fontFamily : undefined,
      fontSize: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? fontSize : undefined,
      fontWeight: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? fontWeight : undefined,
      letterSpacing: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? letterSpacing : undefined,
      isItalic: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? isItalic : undefined,
      lineHeight: (noteType === 'sticky' || noteType === 'lined' || noteType === 'regular' || noteType === 'textformat') ? lineHeight : undefined,
      codeContent: noteType === 'code' ? codeContent : undefined,
      codeLanguage: noteType === 'code' ? codeLanguage : undefined,
      reminderEnabled,
      reminderTime: reminderEnabled ? (() => {
        const [remHours, remMinutes] = reminderTime.split(':').map(Number);
        const reminderDateTime = new Date(createdAt);
        reminderDateTime.setHours(remHours, remMinutes, 0, 0);
        return reminderDateTime;
      })() : undefined,
      reminderRecurring,
      reminderVibration,
      notificationId,
      notificationIds,
      metaDescription: metaDescription || undefined,
      tagIds: noteTagIds.length > 0 ? noteTagIds : undefined,
      createdAt: note?.createdAt || combinedDateTime,
      updatedAt: new Date(),
    };
  }, [
    createdAt,
    createdTime,
    getCurrentNoteId,
    note?.createdAt,
    noteType,
    title,
    content,
    color,
    customColor,
    images,
    floatingImages,
    voiceRecordings,
    selectedFolderId,
    noteTagIds,
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    isItalic,
    lineHeight,
    codeContent,
    codeLanguage,
    reminderEnabled,
    reminderTime,
    reminderRecurring,
    reminderVibration,
    notificationId,
    notificationIds,
    metaDescription,
  ]);

  const commitNote = useCallback(async ({ full }: { full: boolean }) => {
    const savedNote = buildCurrentNote();

    // Ask the parent first — if they reject (e.g. soft paywall), do NOT persist.
    let accepted: boolean | void = true;
    try {
      accepted = await onSave(savedNote);
    } catch (e) {
      console.warn('[NoteEditor] onSave threw, treating as rejected', e);
      accepted = false;
    }
    if (accepted === false) return;

    if (full) {
      // Schedule or cancel note reminder in background
      if (savedNote.reminderEnabled && savedNote.reminderTime) {
        import('@/utils/reminderScheduler').then(({ scheduleNoteReminder }) => {
          scheduleNoteReminder(savedNote.id, savedNote.title || 'Note reminder', new Date(savedNote.reminderTime!)).catch(console.warn);
        });
      } else {
        import('@/utils/reminderScheduler').then(({ cancelNoteReminder }) => {
          cancelNoteReminder(savedNote.id).catch(console.warn);
        });
      }

      // Save version history (only on "full" save)
      saveNoteVersion(savedNote, note ? 'edit' : 'create');
    }

    persistNoteToIndexedDB(savedNote);
  }, [buildCurrentNote, note, onSave, persistNoteToIndexedDB]);

  const handleSave = useCallback(async () => {
    triggerTripleHeavyHaptic();
    await commitNote({ full: true });
  }, [commitNote]);

  // Use ref to always have access to the latest save function
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const closeHistoryOverlay = useCallback(() => {
    if (!pushedHistoryRef.current) return;
    pushedHistoryRef.current = false;
    isPoppingHistoryRef.current = true;
    window.history.back();
  }, []);

  // The actual close logic (called after sketch meta dialog if needed)
  const performClose = useCallback(async () => {
    // Mark as closing to prevent re-entry
    if (!isOpenRef.current) return;
    
    await commitNote({ full: true });
    // Clear crash recovery since we saved successfully
    try { localStorage.removeItem('note_crash_recovery'); } catch {}
    
    // Close first, then handle navigation
    onClose();
    
    // Clean up history state
    if (pushedHistoryRef.current) {
      pushedHistoryRef.current = false;
      isPoppingHistoryRef.current = true;
      window.history.back();
    }
    
    // Navigate back to the origin screen if provided (after a small delay to avoid race)
    if (returnToRef.current) {
      setTimeout(() => {
        navigate(returnToRef.current!, { replace: true });
      }, 10);
    }
  }, [commitNote, navigate, onClose]);

  const handleClose = useCallback(async () => {
    if (!isOpenRef.current) return;
    
    // For sketch notes, only show dialog if title or description is missing
    if (noteType === 'sketch' && (!title.trim() || !metaDescription.trim())) {
      setSketchMetaTitle(title);
      setSketchMetaDesc(metaDescription);
      setShowSketchMetaDialog(true);
      return;
    }
    
    await performClose();
  }, [noteType, title, metaDescription, performClose]);

  // Called when user confirms sketch meta dialog
  const handleSketchMetaSave = useCallback(async () => {
    if (!sketchMetaTitle.trim()) {
      toast.error(t('editor.sketchTitleRequired', 'Title is required for sketch notes'));
      return;
    }
    if (!sketchMetaDesc.trim()) {
      toast.error(t('editor.sketchDescRequired', 'Description is required for sketch notes'));
      return;
    }
    // Update state for UI - performClose will be called after state propagates
    setTitle(sketchMetaTitle.trim());
    setMetaDescription(sketchMetaDesc.trim());
    setShowSketchMetaDialog(false);
    // Use a flag to trigger close after state update
    sketchMetaPendingCloseRef.current = true;
  }, [sketchMetaTitle, sketchMetaDesc, t]);

  // Effect: close after sketch meta state has propagated
  useEffect(() => {
    if (sketchMetaPendingCloseRef.current && title.trim() && metaDescription.trim()) {
      sketchMetaPendingCloseRef.current = false;
      performClose();
    }
  }, [title, metaDescription, performClose]);

  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  // When editor opens, push a history entry so "Back" closes editor instead of leaving/exiting
  useEffect(() => {
    if (!isOpen || skipHistory) return;
    if (typeof window === 'undefined') return;

    // Small delay to ensure component is fully mounted
    const timeoutId = setTimeout(() => {
      if (isOpenRef.current) {
        pushedHistoryRef.current = true;
        window.history.pushState({ __noteEditor: true }, '');
      }
    }, 50);

    const onPopState = () => {
      if (isPoppingHistoryRef.current) {
        isPoppingHistoryRef.current = false;
        return;
      }

      if (!isOpenRef.current) return;

      // Don't push another state, just close
      void handleCloseRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('popstate', onPopState);
    };
  }, [isOpen]);

  // Auto-save as user types (debounced) - shorter debounce for sketch
  useEffect(() => {
    if (!isOpen) return;

    const hasText = (title?.trim() || '') !== '' || (content?.trim() || '') !== '' || (codeContent?.trim() || '') !== '';
    if (!hasText) return;

    // For sketch notes, don't auto-save if content looks like default empty sketch
    // (no strokes in any layer). This prevents overwriting real data on mount.
    if (noteType === 'sketch' && content) {
      try {
        const parsed = JSON.parse(content);
        const totalStrokes = (parsed.layers || []).reduce((sum: number, l: any) => 
          sum + (l.strokes?.length || 0) + (l.textAnnotations?.length || 0) + (l.stickyNotes?.length || 0) + (l.images?.length || 0), 0);
        if (totalStrokes === 0 && note?.content) {
          // Empty sketch but note has existing content - skip auto-save to prevent data loss
          return;
        }
      } catch {}
    }

    // Sketch data can be large; use shorter debounce to save sooner
    const delay = noteType === 'sketch' ? 300 : 700;
    const t = window.setTimeout(() => {
      void commitNote({ full: false });
    }, delay);

    return () => window.clearTimeout(t);
  }, [isOpen, title, content, codeContent, commitNote, noteType, note?.content]);

  // Save immediately if tab/app is backgrounded or page is refreshed/closed
  const buildCurrentNoteRef = useRef(buildCurrentNote);
  buildCurrentNoteRef.current = buildCurrentNote;
  
  // Crash-recovery key for localStorage fallback
  const CRASH_RECOVERY_KEY = 'note_crash_recovery';

  useEffect(() => {
    if (!isOpen) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void commitNote({ full: false });
        // Also write to localStorage as synchronous fallback
        try {
          const savedNote = buildCurrentNoteRef.current();
          localStorage.setItem(CRASH_RECOVERY_KEY, JSON.stringify({
            id: savedNote.id,
            type: savedNote.type,
            title: savedNote.title,
            content: savedNote.content,
            timestamp: Date.now(),
          }));
        } catch {}
      }
    };

    // Force-save on page refresh/close to prevent data loss
    // localStorage.setItem is SYNCHRONOUS and guaranteed to persist
    const onBeforeUnload = () => {
      try {
        const savedNote = buildCurrentNoteRef.current();
        // Synchronous localStorage write - guaranteed to complete before page unloads
        localStorage.setItem(CRASH_RECOVERY_KEY, JSON.stringify({
          id: savedNote.id,
          type: savedNote.type,
          title: savedNote.title,
          content: savedNote.content,
          codeContent: savedNote.codeContent,
          timestamp: Date.now(),
        }));
        // Also fire-and-forget IndexedDB save (may or may not complete)
        saveNoteToDBSingle(savedNote);
      } catch (e) {
        console.warn('beforeunload save failed:', e);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isOpen, commitNote]);

  // Handle hardware back button on Android - save and close editor (parent keeps correct screen)
  useHardwareBackButton({
    onBack: handleClose,
    enabled: isOpen,
    priority: 'sheet',
  });

  const handleRestoreVersion = (restoredContent: string, restoredTitle: string) => {
    setContent(restoredContent);
    setTitle(restoredTitle);
    toast.success(t('toast.versionRestored'));
  };

  const handleInsertNoteLink = (noteTitle: string) => {
    const linkText = insertNoteLink(noteTitle);
    setContent(prev => prev + linkText);
    toast.success(t('toast.linkInserted', { title: noteTitle }));
  };

  const handleExportMarkdown = () => {
    const currentNote: Note = {
      id: note?.id || Date.now().toString(),
      type: noteType,
      title,
      content,
      codeContent,
      codeLanguage,
      voiceRecordings,
      createdAt: note?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    exportNoteToMarkdown(currentNote);
    toast.success(t('toast.noteExportedMarkdown'));
  };

  const handleImageAdd = async (imageUrl: string) => {
    try {
      if (isCompressibleImage(imageUrl)) {
        imageUrl = await compressImage(imageUrl, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
      }
    } catch (e) {
      console.warn('Image compression failed, using original:', e);
    }
    setImages([...images, imageUrl]);
  };

  const handleRecordingAdd = (recording: VoiceRecording) => {
    setVoiceRecordings([...voiceRecordings, recording]);
  };

  const handleInsertAudioAtCursor = (audioBase64: string, recordingId: string) => {
    // For rich text editors (sticky, lined, regular), insert audio element at cursor position
    // We use a custom data attribute to identify and render with AudioPlayer component
    if (['sticky', 'lined', 'regular'].includes(noteType) && editorRef.current) {
      // Focus the editor to ensure cursor is active
      editorRef.current.focus();
      
      // For lined notes, wrap in div with proper class for alignment, followed by a new paragraph for cursor
      const audioHtml = `<div class="audio-player-container" style="margin: 12px 0; display: block; text-align: center;" data-recording-id="${recordingId}" data-audio-src="${audioBase64}"><audio controls src="${audioBase64}" style="width: 100%; max-width: 400px; height: 54px;"></audio></div><p style="text-align: center;"><br></p>`;
      
      // Insert at cursor position using execCommand
      document.execCommand('insertHTML', false, audioHtml);
      
      // Move cursor to the new paragraph
      const selection = window.getSelection();
      if (selection && editorRef.current) {
        const paragraphs = editorRef.current.querySelectorAll('p');
        const lastP = paragraphs[paragraphs.length - 1];
        if (lastP) {
          const range = document.createRange();
          range.selectNodeContents(lastP);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      
      // Trigger content update
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
      }
    }
  };

  const handleRecordingDelete = (id: string) => {
    setVoiceRecordings(voiceRecordings.filter(r => r.id !== id));
  };

  // Insert AI-generated HTML (from page scan) at cursor or append to end.
  // For code/voice/sketch notes (which don't render rich HTML), strips tags
  // and appends plain text to the appropriate field, plus copies to clipboard
  // so the user can paste anywhere they want.
  const handleAiInsertHtml = (html: string, suggestedTitle?: string) => {
    if (!html) return;
    if (suggestedTitle && !title.trim()) {
      setTitle(suggestedTitle);
    }
    if (['sticky', 'lined', 'regular', 'textformat'].includes(noteType) && editorRef.current) {
      const editor = editorRef.current;
      editor.focus();
      // Ensure a valid selection exists INSIDE the editor. If the user never
      // tapped into the note (opened dictation straight away), selection is
      // null or outside the editor → execCommand('insertHTML') silently
      // no-ops and the transcript is lost. Place caret at end first so
      // insert ALWAYS lands, even without prior cursor placement.
      try {
        const sel = window.getSelection();
        const needsRestore =
          !sel ||
          sel.rangeCount === 0 ||
          !editor.contains(sel.getRangeAt(0).commonAncestorContainer);
        if (needsRestore && sel) {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false); // end of editor
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
      let inserted = false;
      try {
        inserted = document.execCommand('insertHTML', false, html + '<p><br></p>');
      } catch {
        inserted = false;
      }
      if (!inserted) {
        // Fallback: direct DOM append so transcript is never lost even if
        // execCommand is blocked/deprecated.
        editor.insertAdjacentHTML('beforeend', html + '<p><br></p>');
      }
      setContent(editor.innerHTML);
    } else if (noteType === 'code') {
      // Strip HTML → plain text, append to code buffer.
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const plain = (tmp.textContent || '').trim();
      if (plain) {
        setCodeContent(prev => (prev ? prev + '\n\n' : '') + plain);
        toast.success(t('scanNote.appendedToCode', 'Extracted text added to code'));
      }
    } else if (noteType === 'voice' || noteType === 'sketch') {
      // Voice/sketch don't render HTML body — extract plain text, store in
      // content (persists with the note) and copy to clipboard for easy paste.
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const plain = (tmp.textContent || '').trim();
      if (plain) {
        setContent(prev => (prev ? prev + '\n\n' : '') + plain);
        try { void navigator.clipboard?.writeText(plain); } catch {}
        toast.success(t('scanNote.copiedToClipboard', 'Extracted text copied to clipboard'));
      }
    } else {
      setContent(prev => (prev || '') + html);
    }
  };

  const getEditorBackgroundColor = () => {
    if (noteType === 'sticky') {
      return STICKY_COLOR_VALUES[color];
    }
    // Use custom color if set for non-sticky notes
    if (customColor && noteType !== 'voice') {
      return customColor;
    }
    // Use CSS variable for regular/lined notes to match dark mode
    return 'hsl(var(--background))';
  };

  if (!isOpen) return null;

  // Insert handlers for + icon dropdown
  const handleInsertLink = () => {
    setIsLinkInputOpen(true);
  };

  const handleInsertLinkSave = (url: string) => {
    if (url) {
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      setContent(prev => prev + linkHtml);
      toast.success(t('editor.linkInserted'));
    }
  };

  const handleInsertComment = () => {
    setIsCommentInputOpen(true);
  };

  const handleInsertCommentSave = (comment: string) => {
    if (comment) {
      const commentHtml = `<div style="background: hsl(var(--muted)); border-left: 3px solid hsl(var(--primary)); padding: 8px 12px; margin: 8px 0; border-radius: 4px; font-style: italic; color: hsl(var(--muted-foreground));">💬 ${comment}</div>`;
      setContent(prev => prev + commentHtml);
      toast.success(t('editor.commentAdded'));
    }
  };

  const handleInsertHorizontalLine = () => {
    // Insert solid black separator at cursor position using execCommand
    // Use proper block display for lined notes alignment
    const lineHtml = `<hr style="border: none; border-top: 2px solid currentColor; margin: 16px 0; display: block;" /><p><br></p>`;
    document.execCommand('insertHTML', false, lineHtml);
    toast.success(t('editor.separatorAdded'));
  };

  const handleInsertPageBreak = () => {
    // MS Word/Google Docs style page break - creates a visual page separation
    // Added display: block and proper spacing for lined notes
    const pageBreakHtml = `
      <div class="page-break-container" style="page-break-after: always; margin: 32px 0; position: relative; display: block;" contenteditable="false">
        <div style="
          border: 1px dashed #999;
          background: linear-gradient(to bottom, hsl(var(--muted)), hsl(var(--background)));
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        ">
          <span style="
            background: hsl(var(--background));
            border: 1px solid hsl(var(--border));
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11px;
            color: hsl(var(--muted-foreground));
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          ">${t('editor.pageBreak')}</span>
        </div>
      </div>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, pageBreakHtml);
    toast.success(t('editor.pageBreakAdded'));
  };

  return (
    <div
      className={cn("fixed inset-0 z-50 flex flex-col")}
      style={{ backgroundColor: getEditorBackgroundColor() }}
    >
      {/* Top Header */}
      {true && (
        <div
          className="flex justify-between items-center px-4 py-3 pt-4"
          style={{ backgroundColor: getEditorBackgroundColor(), borderColor: 'rgba(0,0,0,0.1)', paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
        >
          <Button variant="ghost" size="icon" onClick={handleClose} className={cn("h-9 w-9", noteType === 'sticky' && "text-black hover:text-black")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-1">
            {/* Copy with Formatting Button - prominent for textformat notes */}
            {noteType === 'textformat' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  const editorElement = editorRef.current;
                  copyWithFormatting(editorElement, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing);
                }}
                className="gap-1.5 h-8 px-3"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">{t('editor.copyAll', 'Copy All')}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Table Picker moved to toolbar/options menu */}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("h-9 w-9", noteType === 'sticky' && "text-black hover:text-black")}>
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card z-50 max-h-[70vh] overflow-y-auto">
                {/* Global Font Size Control */}
                {['sticky', 'lined', 'regular'].includes(noteType) && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
                      <FileType className="h-4 w-4" />
                      {t('editor.globalFontSize', 'Font Size')}
                    </div>
                    <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => {
                          const currentSize = parseInt(fontSize) || 16;
                          const newSize = Math.max(10, currentSize - 2);
                          setFontSize(`${newSize}px`);
                        }}
                      >
                        <Minus className="h-4 w-4 stroke-[3]" />
                      </Button>
                      <span className="text-sm font-semibold min-w-[48px] text-center">{fontSize}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => {
                          const currentSize = parseInt(fontSize) || 16;
                          const newSize = Math.min(48, currentSize + 2);
                          setFontSize(`${newSize}px`);
                        }}
                      >
                        <Plus className="h-4 w-4 stroke-[3]" />
                      </Button>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setShowStats(!showStats)}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {showStats ? t('editor.hideStats') : t('editor.showStats')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsReadingMode(!isReadingMode)}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {isReadingMode ? t('editor.exitReadingMode') : t('editor.enterReadingMode')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsFindReplaceOpen(true)}>
                  <Search className="h-4 w-4 mr-2" />
                  {t('editor.findReplace')}
                </DropdownMenuItem>
                {/* Copy with Formatting - special for textformat notes */}
                {noteType === 'textformat' && (
                  <DropdownMenuItem 
                    onClick={() => {
                      const editorElement = editorRef.current;
                      copyWithFormatting(editorElement, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing);
                    }}
                    className="bg-primary/10"
                  >
                    <Copy className="h-4 w-4 mr-2 text-primary" />
                    <span className="font-medium text-primary">{t('editor.copyWithFormatting', 'Copy with Formatting')}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsTitleEditOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  {t('editor.editTitle', 'Edit Title')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsMetaDescInputOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  {metaDescription ? t('editor.editMetaDescription') : t('editor.addMetaDescription')}
                </DropdownMenuItem>


                {/* Note Reminder */}
                <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  {t('editor.reminder', 'Reminder')}
                </div>
                <div className="px-2 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t('editor.enableReminder', 'Enable')}</span>
                    <Switch
                      checked={reminderEnabled}
                      onCheckedChange={setReminderEnabled}
                    />
                  </div>
                  {reminderEnabled && (
                    <>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => setReminderTime(e.target.value)}
                          className="flex-1 h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-muted-foreground" />
                        <select
                          value={reminderRecurring}
                          onChange={(e) => setReminderRecurring(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly')}
                          className="flex-1 h-8 text-sm rounded-md border bg-background px-2"
                        >
                          <option value="none">{t('reminder.once', 'Once')}</option>
                          <option value="daily">{t('reminder.daily', 'Daily')}</option>
                          <option value="weekly">{t('reminder.weekly', 'Weekly')}</option>
                          <option value="monthly">{t('reminder.monthly', 'Monthly')}</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
                <DropdownMenuSeparator />
                
                {/* Created & Modified Dates - Premium */}
                <div 
                  className={cn("px-2 py-1.5 text-xs text-muted-foreground flex flex-col gap-1", !isPro && "select-none cursor-pointer")}
                  onClick={() => { if (!isPro) requireFeature('time_tracking'); }}
                >
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    <span>{t('editor.created')}:</span>
                    {isPro ? (
                      <span>{format(note?.createdAt || createdAt, 'MMM dd, yyyy • h:mm a')}</span>
                    ) : (
                      <span className="blur-[6px] select-none">Jan 1, 2025 • 12:00 PM</span>
                    )}
                  </div>
                  {note && (
                    <div className="flex items-center gap-1">
                      <span>{t('editor.modified')}:</span>
                      {isPro ? (
                        <span>{format(new Date(note.updatedAt), 'MMM dd, yyyy • h:mm a')}</span>
                      ) : (
                        <span className="blur-[6px] select-none">Jan 5, 2025 • 3:45 PM</span>
                      )}
                    </div>
                  )}
                </div>
                <DropdownMenuSeparator />
                
                {/* Folder Selection */}
                <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
                  <FolderIcon className="h-4 w-4" />
                  {t('editor.moveToFolder')}
                </div>
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      toast.success(t('toast.movedToFolder', { folder: folder.name }));
                      // Persist immediately
                      setTimeout(() => handleSaveRef.current?.(), 100);
                    }}
                    className={cn(selectedFolderId === folder.id && "bg-accent", "pl-6")}
                  >
                    <span 
                      className="h-3 w-3 rounded-full mr-2 flex-shrink-0" 
                      style={{ backgroundColor: folder.color || '#3B82F6' }} 
                    />
                    {folder.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setIsNewFolderDialogOpen(true)} className="pl-6">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('notes.newFolder')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Tags */}
                <DropdownMenuItem onClick={() => setShowTagSheet(true)}>
                  <TagIcon className="h-4 w-4 mr-2" />
                  Tags ({noteTagIds.length})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Email Extractor with inline sub-options - Premium */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground w-full"
                      onClick={(e) => { e.stopPropagation(); if (!requireFeature('extract_features')) { e.preventDefault(); } }}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {t('editor.extractEmails', 'Extract Emails')}
                      
                      <ChevronDown className="h-3 w-3 ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 bg-muted/30 rounded-sm mx-1">
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                        const emails = plainText.match(emailRegex);
                        if (emails && emails.length > 0) {
                          const uniqueEmails = [...new Set(emails)];
                          const emailContent = uniqueEmails.map(email => `<p>${email}</p>`).join('');
                          setContent(emailContent);
                          toast.success(t('editor.emailsExtracted', { count: uniqueEmails.length }) || `${uniqueEmails.length} emails extracted`);
                        } else {
                          toast.error(t('editor.noEmailsFound') || 'No emails found in content');
                        }
                      }}
                    >
                      <Replace className="h-4 w-4 mr-2" />
                      {t('editor.replaceContent', 'Replace Content')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                        const emails = plainText.match(emailRegex);
                        if (emails && emails.length > 0) {
                          const uniqueEmails = [...new Set(emails)];
                          await navigator.clipboard.writeText(uniqueEmails.join('\n'));
                          toast.success(t('editor.emailsCopied', { count: uniqueEmails.length }) || `${uniqueEmails.length} emails copied to clipboard`);
                        } else {
                          toast.error(t('editor.noEmailsFound') || 'No emails found in content');
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('editor.copyToClipboard', 'Copy to Clipboard')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                        const emails = plainText.match(emailRegex);
                        if (emails && emails.length > 0) {
                          const uniqueEmails = [...new Set(emails)];
                          const duplicatesRemoved = emails.length - uniqueEmails.length;
                          if (duplicatesRemoved > 0) {
                            const emailContent = uniqueEmails.map(email => `<p>${email}</p>`).join('');
                            setContent(emailContent);
                            toast.success(t('editor.duplicatesRemoved', { count: duplicatesRemoved }) || `${duplicatesRemoved} duplicate email(s) removed, ${uniqueEmails.length} unique emails kept`);
                          } else {
                            toast.info(t('editor.noDuplicates') || 'No duplicate emails found');
                          }
                        } else {
                          toast.error(t('editor.noEmailsFound') || 'No emails found in content');
                        }
                      }}
                    >
                      <ListFilter className="h-4 w-4 mr-2" />
                      {t('editor.removeDuplicate', 'Remove Duplicate')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                        const emails = plainText.match(emailRegex);
                        if (emails && emails.length > 0) {
                          const lowercaseEmails = emails.map(email => email.toLowerCase());
                          const uniqueEmails = [...new Set(lowercaseEmails)];
                          const emailContent = uniqueEmails.map(email => `<p>${email}</p>`).join('');
                          setContent(emailContent);
                          toast.success(t('editor.emailsLowercased', { count: uniqueEmails.length }) || `${uniqueEmails.length} email(s) converted to lowercase`);
                        } else {
                          toast.error(t('editor.noEmailsFound') || 'No emails found in content');
                        }
                      }}
                    >
                      <CaseLower className="h-4 w-4 mr-2" />
                      {t('editor.convertToLowercase', 'Convert to Lowercase')}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Phone Extractor with inline sub-options - Premium */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground w-full"
                      onClick={(e) => { e.stopPropagation(); if (!requireFeature('extract_features')) { e.preventDefault(); } }}
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      {t('editor.extractPhones', 'Extract Phone Numbers')}
                      
                      <ChevronDown className="h-3 w-3 ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 bg-muted/30 rounded-sm mx-1">
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;
                        const phones = plainText.match(phoneRegex);
                        if (phones && phones.length > 0) {
                          const validPhones = phones.filter(phone => {
                            const digitsOnly = phone.replace(/\D/g, '');
                            return digitsOnly.length >= 7 && digitsOnly.length <= 15;
                          });
                          if (validPhones.length > 0) {
                            const uniquePhones = [...new Set(validPhones.map(p => p.trim()))];
                            const phoneContent = uniquePhones.map(phone => `<p>${phone}</p>`).join('');
                            setContent(phoneContent);
                            toast.success(t('editor.phonesExtracted', { count: uniquePhones.length }) || `${uniquePhones.length} phone numbers extracted`);
                          } else {
                            toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                          }
                        } else {
                          toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                        }
                      }}
                    >
                      <Replace className="h-4 w-4 mr-2" />
                      {t('editor.replaceContent', 'Replace Content')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;
                        const phones = plainText.match(phoneRegex);
                        if (phones && phones.length > 0) {
                          const validPhones = phones.filter(phone => {
                            const digitsOnly = phone.replace(/\D/g, '');
                            return digitsOnly.length >= 7 && digitsOnly.length <= 15;
                          });
                          if (validPhones.length > 0) {
                            const uniquePhones = [...new Set(validPhones.map(p => p.trim()))];
                            await navigator.clipboard.writeText(uniquePhones.join('\n'));
                            toast.success(t('editor.phonesCopied', { count: uniquePhones.length }) || `${uniquePhones.length} phone numbers copied to clipboard`);
                          } else {
                            toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                          }
                        } else {
                          toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('editor.copyToClipboard', 'Copy to Clipboard')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;
                        const phones = plainText.match(phoneRegex);
                        if (phones && phones.length > 0) {
                          const validPhones = phones.filter(phone => {
                            const digitsOnly = phone.replace(/\D/g, '');
                            return digitsOnly.length >= 7 && digitsOnly.length <= 15;
                          });
                          if (validPhones.length > 0) {
                            const trimmed = validPhones.map(p => p.trim());
                            const uniquePhones = [...new Set(trimmed)];
                            const duplicatesRemoved = trimmed.length - uniquePhones.length;
                            if (duplicatesRemoved > 0) {
                              const phoneContent = uniquePhones.map(phone => `<p>${phone}</p>`).join('');
                              setContent(phoneContent);
                              toast.success(t('editor.duplicatesRemoved', { count: duplicatesRemoved }) || `${duplicatesRemoved} duplicate phone number(s) removed, ${uniquePhones.length} unique kept`);
                            } else {
                              toast.info(t('editor.noDuplicates') || 'No duplicate phone numbers found');
                            }
                          } else {
                            toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                          }
                        } else {
                          toast.error(t('editor.noPhonesFound') || 'No phone numbers found in content');
                        }
                      }}
                    >
                      <ListFilter className="h-4 w-4 mr-2" />
                      {t('editor.removeDuplicate', 'Remove Duplicate')}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* URL Extractor with inline sub-options - Premium */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground w-full"
                      onClick={(e) => { e.stopPropagation(); if (!requireFeature('extract_features')) { e.preventDefault(); } }}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {t('editor.extractUrls', 'Extract URLs')}
                      
                      <ChevronDown className="h-3 w-3 ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 bg-muted/30 rounded-sm mx-1">
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hrefRegex = /href=["']([^"']+)["']/gi;
                        const hrefMatches = [...content.matchAll(hrefRegex)].map(m => m[1]);
                        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
                        const urls = plainText.match(urlRegex) || [];
                        const allUrls = [...urls, ...hrefMatches];
                        
                        if (allUrls.length > 0) {
                          const uniqueUrls = [...new Set(allUrls.map(url => url.trim().replace(/[.,;:!?)]+$/, '')))];
                          const urlContent = uniqueUrls.map(url => `<p><a href="${url}" target="_blank">${url}</a></p>`).join('');
                          setContent(urlContent);
                          toast.success(t('editor.urlsExtracted', { count: uniqueUrls.length }) || `${uniqueUrls.length} URLs extracted`);
                        } else {
                          toast.error(t('editor.noUrlsFound') || 'No URLs found in content');
                        }
                      }}
                    >
                      <Replace className="h-4 w-4 mr-2" />
                      {t('editor.replaceContent', 'Replace Content')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hrefRegex = /href=["']([^"']+)["']/gi;
                        const hrefMatches = [...content.matchAll(hrefRegex)].map(m => m[1]);
                        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
                        const urls = plainText.match(urlRegex) || [];
                        const allUrls = [...urls, ...hrefMatches];
                        
                        if (allUrls.length > 0) {
                          const uniqueUrls = [...new Set(allUrls.map(url => url.trim().replace(/[.,;:!?)]+$/, '')))];
                          await navigator.clipboard.writeText(uniqueUrls.join('\n'));
                          toast.success(t('editor.urlsCopied', { count: uniqueUrls.length }) || `${uniqueUrls.length} URLs copied to clipboard`);
                        } else {
                          toast.error(t('editor.noUrlsFound') || 'No URLs found in content');
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('editor.copyToClipboard', 'Copy to Clipboard')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hrefRegex = /href=["']([^"']+)["']/gi;
                        const hrefMatches = [...content.matchAll(hrefRegex)].map(m => m[1]);
                        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
                        const urls = plainText.match(urlRegex) || [];
                        const allUrls = [...urls, ...hrefMatches].map(url => url.trim().replace(/[.,;:!?)]+$/, ''));
                        
                        if (allUrls.length > 0) {
                          const uniqueUrls = [...new Set(allUrls)];
                          const duplicatesRemoved = allUrls.length - uniqueUrls.length;
                          if (duplicatesRemoved > 0) {
                            const urlContent = uniqueUrls.map(url => `<p><a href="${url}" target="_blank">${url}</a></p>`).join('');
                            setContent(urlContent);
                            toast.success(t('editor.duplicatesRemoved', { count: duplicatesRemoved }) || `${duplicatesRemoved} duplicate URL(s) removed, ${uniqueUrls.length} unique kept`);
                          } else {
                            toast.info(t('editor.noDuplicates') || 'No duplicate URLs found');
                          }
                        } else {
                          toast.error(t('editor.noUrlsFound') || 'No URLs found in content');
                        }
                      }}
                    >
                      <ListFilter className="h-4 w-4 mr-2" />
                      {t('editor.removeDuplicate', 'Remove Duplicate')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hrefRegex = /href=["']([^"']+)["']/gi;
                        const hrefMatches = [...content.matchAll(hrefRegex)].map(m => m[1]);
                        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
                        const urls = plainText.match(urlRegex) || [];
                        const allUrls = [...urls, ...hrefMatches].map(url => url.trim().replace(/[.,;:!?)]+$/, ''));
                        if (allUrls.length > 0) {
                          const lowercaseUrls = allUrls.map(url => url.toLowerCase());
                          const uniqueUrls = [...new Set(lowercaseUrls)];
                          const urlContent = uniqueUrls.map(url => `<p><a href="${url}" target="_blank">${url}</a></p>`).join('');
                          setContent(urlContent);
                          toast.success(t('editor.urlsLowercased', { count: uniqueUrls.length }) || `${uniqueUrls.length} URL(s) converted to lowercase`);
                        } else {
                          toast.error(t('editor.noUrlsFound') || 'No URLs found in content');
                        }
                      }}
                    >
                      <CaseLower className="h-4 w-4 mr-2" />
                      {t('editor.convertToLowercase', 'Convert to Lowercase')}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Hashtag Extractor with inline sub-options - Premium */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground w-full"
                      onClick={(e) => { e.stopPropagation(); if (!requireFeature('extract_features')) { e.preventDefault(); } }}
                    >
                      <Hash className="h-4 w-4 mr-2" />
                      {t('editor.extractHashtags', 'Extract Hashtags')}
                      
                      <ChevronDown className="h-3 w-3 ml-auto transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 bg-muted/30 rounded-sm mx-1">
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
                        const hashtags = plainText.match(hashtagRegex);
                        if (hashtags && hashtags.length > 0) {
                          const uniqueHashtags = [...new Set(hashtags.map(h => h.trim()))];
                          const hashtagContent = uniqueHashtags.map(tag => `<p>${tag}</p>`).join('');
                          setContent(hashtagContent);
                          toast.success(t('editor.hashtagsExtracted', { count: uniqueHashtags.length }) || `${uniqueHashtags.length} hashtags extracted`);
                        } else {
                          toast.error(t('editor.noHashtagsFound') || 'No hashtags found in content');
                        }
                      }}
                    >
                      <Replace className="h-4 w-4 mr-2" />
                      {t('editor.replaceContent', 'Replace Content')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
                        const hashtags = plainText.match(hashtagRegex);
                        if (hashtags && hashtags.length > 0) {
                          const uniqueHashtags = [...new Set(hashtags.map(h => h.trim()))];
                          await navigator.clipboard.writeText(uniqueHashtags.join('\n'));
                          toast.success(t('editor.hashtagsCopied', { count: uniqueHashtags.length }) || `${uniqueHashtags.length} hashtags copied to clipboard`);
                        } else {
                          toast.error(t('editor.noHashtagsFound') || 'No hashtags found in content');
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('editor.copyToClipboard', 'Copy to Clipboard')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
                        const hashtags = plainText.match(hashtagRegex);
                        if (hashtags && hashtags.length > 0) {
                          const trimmed = hashtags.map(h => h.trim());
                          const uniqueHashtags = [...new Set(trimmed)];
                          const duplicatesRemoved = trimmed.length - uniqueHashtags.length;
                          if (duplicatesRemoved > 0) {
                            const hashtagContent = uniqueHashtags.map(tag => `<p>${tag}</p>`).join('');
                            setContent(hashtagContent);
                            toast.success(t('editor.duplicatesRemoved', { count: duplicatesRemoved }) || `${duplicatesRemoved} duplicate hashtag(s) removed, ${uniqueHashtags.length} unique kept`);
                          } else {
                            toast.info(t('editor.noDuplicates') || 'No duplicate hashtags found');
                          }
                        } else {
                          toast.error(t('editor.noHashtagsFound') || 'No hashtags found in content');
                        }
                      }}
                    >
                      <ListFilter className="h-4 w-4 mr-2" />
                      {t('editor.removeDuplicate', 'Remove Duplicate')}
                    </div>
                    <div 
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        const plainText = content.replace(/<[^>]*>/g, ' ');
                        const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
                        const hashtags = plainText.match(hashtagRegex);
                        if (hashtags && hashtags.length > 0) {
                          const lowercaseHashtags = hashtags.map(h => h.toLowerCase());
                          const uniqueHashtags = [...new Set(lowercaseHashtags)];
                          const hashtagContent = uniqueHashtags.map(tag => `<p>${tag}</p>`).join('');
                          setContent(hashtagContent);
                          toast.success(t('editor.hashtagsLowercased', { count: uniqueHashtags.length }) || `${uniqueHashtags.length} hashtag(s) converted to lowercase`);
                        } else {
                          toast.error(t('editor.noHashtagsFound') || 'No hashtags found in content');
                        }
                      }}
                    >
                      <CaseLower className="h-4 w-4 mr-2" />
                      {t('editor.convertToLowercase', 'Convert to Lowercase')}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                {note && (
                  <>
                    <DropdownMenuItem onClick={() => setIsVersionHistoryOpen(true)}>
                      <History className="h-4 w-4 mr-2" />
                      {t('editor.versionHistory')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Inline Find & Replace - appears below header when active */}
      <InlineFindReplace
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        editorRef={editorRef}
        onContentChange={setContent}
        content={content}
      />

      {/* Word Count Stats Bar with Page Indicator - only shows when enabled */}
      {showStats && (
        <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between text-xs text-muted-foreground" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-2">
            {getPageBreakCount(content) > 1 && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                {t('editor.pagesCount', { count: getPageBreakCount(content) })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>{t('editor.wordsCount', { count: noteStats.wordCount })}</span>
            <span>•</span>
            <span>{t('editor.charsCount', { count: noteStats.characterCount })}</span>
          </div>
        </div>
      )}

      {/* Sticky note color picker */}
      {noteType === 'sticky' && !isReadingMode && (
        <div className="px-4 py-2 border-b bg-background">
          <div className="flex items-center gap-2">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set sticky color ${c}`}
                onClick={() => setColor(c)}
                className={cn("h-7 w-7 rounded-full border", c === color && "ring-2 ring-ring")}
                style={{ backgroundColor: STICKY_COLOR_VALUES[c] }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full Page Content Editor */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <ErrorBoundary>
          {noteType === 'voice' ? (
            <div className="h-full flex flex-col overflow-y-auto">
              {/* Title input for voice note */}
              <div className="px-4 pt-4 pb-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('notes.untitled', 'Untitled Voice Note')}
                  className="w-full text-xl font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
                />
              </div>
              
              {/* Voice recordings list */}
              {voiceRecordings.length > 0 ? (
                <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
                  {voiceRecordings.map((recording) => (
                    <NoteVoicePlayer
                      key={recording.id}
                      audioUrl={recording.audioUrl}
                      duration={recording.duration}
                      onDelete={() => {
                        setVoiceRecordings(prev => prev.filter(r => r.id !== recording.id));
                        URL.revokeObjectURL(recording.audioUrl);
                      }}
                    />
                  ))}
                  
                  {/* Add more recordings button */}
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setShowVoiceRecorder(true)}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    {t('voice.addRecording', 'Add Recording')}
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                  <p className="text-muted-foreground text-center">
                    {t('voice.noRecordings', 'No recordings yet')}
                  </p>
                  <Button
                    onClick={() => setShowVoiceRecorder(true)}
                    className="gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    {t('voice.startRecording', 'Start Recording')}
                  </Button>
                </div>
              )}
              
              {/* Voice Recording Sheet */}
              <VoiceRecordingSheet
                isOpen={showVoiceRecorder}
                onClose={() => setShowVoiceRecorder(false)}
                onRecordingComplete={(blob, url, duration) => {
                  handleVoiceRecordingComplete(blob, url, duration);
                  setShowVoiceRecorder(false);
                }}
              />
            </div>
          ) : noteType === 'sketch' ? (
            <div className="flex flex-col h-full relative">
              <div className="flex-1 relative">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center h-full bg-background" />}>
                  <SketchEditor
                    initialData={content}
                    onChange={setContent}
                    onImageExport={(png) => {
                      setImages(prev => [...prev, png]);
                      toast.success(t('toast.sketchExported', 'Sketch exported as image'));
                    }}
                  />
                </Suspense>
              </div>
            </div>
          ) : noteType === 'code' ? (
            <VirtualizedCodeEditor
              code={codeContent}
              onChange={setCodeContent}
              language={codeLanguage}
              onLanguageChange={setCodeLanguage}
              title={title}
              onTitleChange={setTitle}
              onClose={handleClose}
            />
          ) : noteType === 'linkedin' ? (
            <div className="flex flex-col h-full">
              <div className="flex-shrink-0 p-4 border-b">
                <Input
                  type="text"
                  placeholder={t('notes.untitled')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-semibold border-0 px-0 focus-visible:ring-0 bg-transparent"
                />
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <LinkedInTextFormatter
                  initialContent={content}
                  onContentChange={setContent}
                  placeholder={t('notes.writeHere', 'Write here...')}
                  className="h-full"
                />
              </div>
            </div>
          ) : isReadingMode ? (
            <div 
              className="h-full overflow-y-auto overscroll-contain"
              style={{ 
                WebkitOverflowScrolling: 'touch',
                minHeight: 0,
              }}
            >
              <div className="p-4 pb-20">
                {title && (
                  <h1 
                    className="text-2xl font-bold mb-4"
                    style={{ fontFamily }}
                  >
                    {title}
                  </h1>
                )}
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert"
                  style={{ fontFamily, fontSize, fontWeight, lineHeight }}
                  dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(content) }}
                />
              </div>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
              <RichTextEditor
                content={content}
                onChange={setContent}
                onImageAdd={handleImageAdd}
                allowImages={noteType !== 'lined'}
                showTable={noteType !== 'lined'}
                className={cn(
                  noteType === 'lined' && 'lined-note',
                  noteType === 'sticky' && 'sticky-note-editor',
                  noteType === 'textformat' && 'textformat-note'
                )}
                toolbarPosition="bottom"
                title={title}
                onTitleChange={setTitle}
                showTitle={true}
                fontFamily={fontFamily}
                onFontFamilyChange={setFontFamily}
                fontSize={fontSize}
                onFontSizeChange={setFontSize}
                fontWeight={fontWeight}
                onFontWeightChange={setFontWeight}
                letterSpacing={letterSpacing}
                onLetterSpacingChange={setLetterSpacing}
                isItalic={isItalic}
                onItalicChange={setIsItalic}
                lineHeight={lineHeight}
                onLineHeightChange={setLineHeight}
                onInsertNoteLink={() => setIsNoteLinkingOpen(true)}
                onVoiceRecord={() => setShowVoiceRecorder(true)}
                onScan={() => { if (requireFeature('ai_dictation')) setShowScanNote(true); }}
                externalEditorRef={editorRef}
                isFindReplaceOpen={isFindReplaceOpen}
                onFloatingImageUpload={(noteType === 'regular' || noteType === 'sticky' || noteType === 'textformat') ? () => floatingImageRef.current?.triggerAdd() : undefined}
              />
              {/* Floating images layer for regular/sticky/lined notes */}
              {(noteType === 'regular' || noteType === 'sticky' || noteType === 'textformat') && (
                <FloatingImageLayer
                  ref={floatingImageRef}
                  images={floatingImages}
                  onChange={setFloatingImages}
                />
              )}

            </div>
          )}
        </ErrorBoundary>

        {/* Floating AI mini-toolbar for voice/code/sketch notes (Pro). The
            rich-editor branch above renders its own toolbar inside the editor
            container; this one overlays the alternate editors so every note
            type can dictate (Mic) and scan images to text (Camera). */}
        {(noteType === 'voice' || noteType === 'code') && (
          <div className="absolute bottom-20 right-3 z-30 flex flex-col gap-2 items-end pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (!requireFeature('ai_dictation')) return;
                setShowScanNote(true);
              }}
              className="group relative h-14 pl-4 pr-5 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform ring-2 ring-primary/20"
              aria-label={t('scanNote.tooltip', 'Scan a handwritten or printed page — AI converts it into a formatted note')}
              title={t('scanNote.tooltip', 'Scan a handwritten or printed page — AI converts it into a formatted note')}
            >
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-60 pointer-events-none" />
              <Camera className="h-5 w-5 relative z-10" />
              <span className="text-sm font-semibold relative z-10">{t('scanNote.scan', 'Scan')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Backlinks Section */}
      {note && backlinks.length > 0 && (
        <div className="border-t bg-background/95 backdrop-blur-sm">
          <Collapsible open={isBacklinksOpen} onOpenChange={setIsBacklinksOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 hover:bg-accent/50 transition-colors">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isBacklinksOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-3 space-y-1 max-h-32 overflow-y-auto">
                {backlinks.map((linkedNote) => (
                  <button
                    key={linkedNote.id}
                    onClick={() => {
                      handleSave();
                      onClose();
                      // Trigger opening the linked note via navigation or callback
                      toast.info(`Navigate to "${linkedNote.title}" to view`);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded-md hover:bg-accent transition-colors"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="truncate">{linkedNote.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* AI page scan → formatted HTML into note */}
      <SafeComponent fallback={null}>
        <ScanNoteSheet
          isOpen={showScanNote}
          onClose={() => setShowScanNote(false)}
          onInsertHtml={handleAiInsertHtml}
        />
      </SafeComponent>



      {/* New Folder Dialog */}
      <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>{t('editor.createNewFolder')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder={t('editor.folderNamePlaceholder')}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('editor.folderColor')}</label>
              <div className="flex flex-wrap gap-2">
                {[
                  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
                  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
                  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
                  '#EC4899', '#F43F5E', '#78716C', '#6B7280', '#64748B'
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewFolderColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${newFolderColor === c ? 'ring-2 ring-ring ring-offset-2' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleCreateFolder} className="w-full">
              {t('editor.createFolder')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Sheet */}
      {note && (
        <NoteVersionHistorySheet
          isOpen={isVersionHistoryOpen}
          onClose={() => setIsVersionHistoryOpen(false)}
          noteId={note.id}
          onRestore={handleRestoreVersion}
        />
      )}

      {/* Note Linking Sheet */}
      <NoteLinkingSheet
        isOpen={isNoteLinkingOpen}
        onClose={() => setIsNoteLinkingOpen(false)}
        notes={allNotes}
        currentNoteId={note?.id}
        onSelectNote={handleInsertNoteLink}
      />

      {/* Inline Find & Replace - removed, now rendered inline in header */}

      {/* Input Sheet Pages - Replace window.prompt */}
      <InputSheetPage
        isOpen={isLinkInputOpen}
        onClose={() => setIsLinkInputOpen(false)}
        onSave={handleInsertLinkSave}
        title={t('editor.insertLinkTitle')}
        placeholder={t('editor.insertLinkPlaceholder')}
      />

      <InputSheetPage
        isOpen={isCommentInputOpen}
        onClose={() => setIsCommentInputOpen(false)}
        onSave={handleInsertCommentSave}
        title={t('editor.addCommentTitle')}
        placeholder={t('editor.addCommentPlaceholder')}
        multiline
      />

      <InputSheetPage
        isOpen={isTitleEditOpen}
        onClose={() => setIsTitleEditOpen(false)}
        onSave={(newTitle) => {
          setTitle(newTitle);
          toast.success(t('editor.titleUpdated', 'Title updated'));
        }}
        title={t('editor.editTitle', 'Edit Title')}
        placeholder={t('editor.titlePlaceholder', 'Enter title...')}
        defaultValue={title}
        maxLength={200}
      />

      <InputSheetPage
        isOpen={isMetaDescInputOpen}
        onClose={() => setIsMetaDescInputOpen(false)}
        onSave={(desc) => {
          setMetaDescription(desc);
          toast.success(t('editor.metaDescUpdated'));
        }}
        title={t('editor.metaDescription')}
        placeholder={t('editor.metaDescPlaceholder')}
        defaultValue={metaDescription}
        maxLength={160}
        multiline
      />

      {/* Global Voice Recording Sheet (for non-voice note types) */}
      {noteType !== 'voice' && (
        <VoiceRecordingSheet
          isOpen={showVoiceRecorder}
          onClose={() => setShowVoiceRecorder(false)}
          onRecordingComplete={(blob, url, duration) => {
            handleVoiceRecordingComplete(blob, url, duration);
            setShowVoiceRecorder(false);
            toast.success(t('voice.recordingAdded', 'Voice recording added'));
          }}
        />
      )}

      {/* PDF Export Options Sheet */}
      <PdfExportOptionsSheet
        isOpen={showPdfOptionsSheet}
        onClose={() => setShowPdfOptionsSheet(false)}
        noteTitle={title || t('notes.untitled')}
        isExporting={isExportingPdf}
        noteType={noteType}
        stickyColor={noteType === 'sticky' ? color : undefined}
        customColor={note?.customColor}
        onExport={async (settings: PdfExportSettings) => {
          setIsExportingPdf(true);
          toast.loading(t('toast.generatingPdf'), { id: 'pdf-export' });
          try {
            const filename = `${title || 'note'}.pdf`;
            const result = await exportNoteToPdf(content, {
              title: settings.includeTitle ? (title || t('notes.untitled')) : undefined,
              filename,
              pageSize: settings.pageSize,
              orientation: settings.orientation,
              marginTop: settings.marginTop,
              marginBottom: settings.marginBottom,
              marginLeft: settings.marginLeft,
              marginRight: settings.marginRight,
              includeTitle: settings.includeTitle,
              includeDate: settings.includeDate,
              includePageNumbers: settings.includePageNumbers,
              headerText: settings.headerText,
              footerText: settings.footerText,
              fontSize: settings.fontSize,
              preserveStyles: true,
              // Note-specific styling
              noteType: settings.preserveNoteStyle ? noteType : undefined,
              stickyColor: settings.preserveNoteStyle && noteType === 'sticky' ? color : undefined,
              customColor: settings.preserveNoteStyle ? note?.customColor : undefined,
              preserveNoteStyle: settings.preserveNoteStyle,
            });
            toast.dismiss('pdf-export');
            setShowPdfOptionsSheet(false);
            
            if (result.success && result.base64Data) {
              setPdfExportResult({
                filename: result.filename,
                base64Data: result.base64Data,
              });
            } else {
              toast.success(t('toast.pdfExported'), { id: 'pdf-export' });
            }
          } catch (error) {
            console.error('PDF export failed:', error);
            toast.error(t('toast.pdfExportFailed'), { id: 'pdf-export' });
          } finally {
            setIsExportingPdf(false);
          }
        }}
      />

      {/* PDF Export Success Dialog */}
      <PdfExportSuccessDialog
        isOpen={!!pdfExportResult}
        onClose={() => setPdfExportResult(null)}
        filename={pdfExportResult?.filename || ''}
        base64Data={pdfExportResult?.base64Data || ''}
      />


      {/* Tag Assignment Sheet */}
      <TagManagementSheet
        open={showTagSheet}
        onOpenChange={setShowTagSheet}
        selectionMode
        selectedTagIds={noteTagIds}
        onSelectionChange={(ids) => {
          setNoteTagIds(ids);
          // Auto-save after tag change
          setTimeout(() => handleSaveRef.current?.(), 100);
        }}
      />

      {/* Sketch Note Title + Meta Description Dialog */}
      {showSketchMetaDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: document.body.classList.contains('onboarding-active') ? 400 : 100 }}>
          <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl border border-border p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">{t('editor.sketchDetails', 'Sketch Details')}</h2>
            <p className="text-sm text-muted-foreground">{t('editor.sketchDetailsDesc', 'Add a title and description for your sketch note.')}</p>
            
            <div className="space-y-2">
              <Label htmlFor="sketch-title" className="text-sm font-medium">{t('editor.title', 'Title')} *</Label>
              <Input
                id="sketch-title"
                value={sketchMetaTitle}
                onChange={(e) => setSketchMetaTitle(e.target.value)}
                placeholder={t('editor.sketchTitlePlaceholder', 'e.g., Meeting Notes Diagram')}
                className="bg-muted/50"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sketch-desc" className="text-sm font-medium">{t('editor.description', 'Description')} *</Label>
              <textarea
                id="sketch-desc"
                value={sketchMetaDesc}
                onChange={(e) => setSketchMetaDesc(e.target.value)}
                placeholder={t('editor.sketchDescPlaceholder', 'Briefly describe what this sketch is about...')}
                rows={3}
                className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSketchMetaDialog(false)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSketchMetaSave}
                disabled={!sketchMetaTitle.trim() || !sketchMetaDesc.trim()}
              >
                {t('common.saveClose', 'Save & Close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
