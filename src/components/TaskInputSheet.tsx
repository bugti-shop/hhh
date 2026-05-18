import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { TodoItem, Priority, RepeatType, Folder, VoiceRecording, LocationReminder, TaskAttachment } from '@/types/note';
import { TagManagementSheet } from '@/components/TagManagementSheet';
import { useGlobalTags } from '@/hooks/useGlobalTags';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

import { toast } from 'sonner';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { saveTaskMedia, makeTaskMediaRef, deleteTaskMedia, parseTaskMediaRef } from '@/utils/taskMediaStorage';
import { TasksSettings } from './TasksSettingsSheet';
import { usePriorities } from '@/hooks/usePriorities';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Ref for pending subtasks (sync access during task creation)
let pendingSubtasksRef: { current: TodoItem[] | undefined } = { current: undefined };

import {
  Calendar as CalendarIcon,
  Flag,
  FolderIcon,
  Image as ImageIcon,
  Send,
  X,
  Play,
  Pause,
  Timer,
  CalendarCheck,
  Tag,
  CalendarClock,
  Settings2,
  ListTodo,
  FileText,
  MapPin,
  Sparkles,
  LayoutTemplate,
  Paperclip,
  File,
  Trash2,
  Crown,
  AlertTriangle,
} from 'lucide-react';
import { EditActionsSheet, ActionItem, defaultActions } from './EditActionsSheet';
import { WaveformVisualizer } from './WaveformVisualizer';
import { VoiceTrimmer } from './VoiceTrimmer';
import { WaveformProgressBar } from './WaveformProgressBar';

import { TaskTemplateSheet, TaskTemplate } from './TaskTemplateSheet';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskDateTimePage, RepeatSettings } from './TaskDateTimePage';
import { parseNaturalLanguageTask, hasNaturalLanguagePatterns } from '@/utils/naturalLanguageParser';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles as SparklesIcon, ScanLine } from 'lucide-react';
import { ImageTaskExtractorSheet } from './ImageTaskExtractorSheet';
import { SafeComponent } from './ErrorBoundary';
import { canUseAiFeature, recordAiUsage, getLimitReachedMessage } from '@/utils/aiUsageLimits';
import { acquireAiLock, getAiBusyMessage, releaseAllAiLocks } from '@/utils/aiConcurrencyLock';

interface TaskSection {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  order: number;
}

interface TaskInputSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (task: Omit<TodoItem, 'id' | 'completed'>) => void;
  folders: Folder[];
  selectedFolderId?: string | null;
  onCreateFolder: (name: string, color: string) => void;
  sections?: TaskSection[];
  selectedSectionId?: string | null;
  defaultDate?: Date; // New prop for calendar auto-assignment
  preventBackdropClose?: boolean;
}

export const TaskInputSheet = ({ isOpen, onClose, onAddTask, folders, selectedFolderId, onCreateFolder, sections = [], selectedSectionId, defaultDate, preventBackdropClose = false }: TaskInputSheetProps) => {
  const { t } = useTranslation();



  // Swipe-down to close
  const swipeStartY = useRef<number | null>(null);
  const swipeCurrentY = useRef<number>(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
    swipeCurrentY.current = 0;
  }, []);
  
  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeStartY.current === null) return;
    const delta = e.touches[0].clientY - swipeStartY.current;
    if (delta > 0) {
      setSwipeOffset(delta);
      swipeCurrentY.current = delta;
    }
  }, []);
  
  const handleSwipeTouchEnd = useCallback(() => {
    if (swipeCurrentY.current > 80) {
      onClose();
    }
    setSwipeOffset(0);
    swipeStartY.current = null;
    swipeCurrentY.current = 0;
  }, [onClose]);
  
  // Keyboard height detection.
  // On Android native the WebView resizes (adjustResize) when keyboard opens,
  // so the sheet at bottom:0 already sits above the keyboard — don't double-lift.
  const keyboardHeight = useKeyboardHeight();
  const isAndroidNative = typeof document !== 'undefined' && document.body.classList.contains('android-app');
  const shouldLiftForKeyboard = keyboardHeight > 0 && !isAndroidNative;
  
  // Load custom priorities
  const { priorities, getPriorityColor, getPriorityName } = usePriorities();
  
  // Hardware back button support - use 'sheet' priority to close sheet before navigation
  useHardwareBackButton({
    onBack: onClose,
    enabled: isOpen,
    priority: 'sheet',
  });

  const { requireFeature, isRecurringSubscriber, isPro, isLocalTrial, isAdminBypass, isRevenueCatTrial } = useSubscription();
  const isStripeTrialing = typeof window !== 'undefined' && Boolean((window as any).__stripeIsTrialing);
  const isPaidTrial = isStripeTrialing || isRevenueCatTrial;
  const isOnTrial = isLocalTrial || isPaidTrial;
  const isPaidPro = isPro && !isOnTrial;
  // Unlimited AI for: paid Pro, admin (BUGTI), and any trial with a card on file
  // (Stripe web trial or Android/iOS native RevenueCat trial).
  const hasUnlimitedAi = isPaidPro || isAdminBypass || isPaidTrial;
  const [taskText, setTaskText] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [reminderTime, setReminderTime] = useState<Date | undefined>();
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [folderId, setFolderId] = useState<string | undefined>();
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [showDateTimePage, setShowDateTimePage] = useState(false);
  const [showDeadlinePage, setShowDeadlinePage] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showSectionPopover, setShowSectionPopover] = useState(false);
  const [repeatSettings, setRepeatSettings] = useState<RepeatSettings | undefined>();
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagSheet, setShowTagSheet] = useState(false);
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [deadlineReminderTime, setDeadlineReminderTime] = useState<Date | undefined>();
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [showDescriptionInput, setShowDescriptionInput] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showEditActions, setShowEditActions] = useState(false);
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>(defaultActions);
  const [tasksSettings, setTasksSettings] = useState<TasksSettings | null>(null);
  const { tags: globalTags, resolveTagIds, invalidateCache: refreshGlobalTags } = useGlobalTags();
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [estimatedHours, setEstimatedHours] = useState<number | undefined>();
  const [isUrgent, setIsUrgent] = useState(false);
  
  // Load saved actions, tags, and task settings from IndexedDB
  useEffect(() => {
    const loadSavedData = async () => {
      const savedActions = await getSetting<ActionItem[] | null>('taskInputActions', null);
      if (savedActions) setActionItems(savedActions);
      const savedTasksSettings = await getSetting<TasksSettings | null>('tasksSettings', null);
      if (savedTasksSettings) setTasksSettings(savedTasksSettings);
    };
    loadSavedData();
    
    // Listen for settings changes
    const handleSettingsChange = (e: CustomEvent<TasksSettings>) => {
      setTasksSettings(e.detail);
    };
    window.addEventListener('tasksSettingsChanged', handleSettingsChange as EventListener);
    return () => window.removeEventListener('tasksSettingsChanged', handleSettingsChange as EventListener);
  }, []);
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0); // Track actual duration
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecording | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const animationFrameRef = useRef<number>();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);




  // AI vision: scan tasks from a paper / sticky-note image (Pro-gated)
  const [showImageExtractor, setShowImageExtractor] = useState(false);
  const [showScanCoachmark, setShowScanCoachmark] = useState(false);
  const SCAN_COACHMARK_KEY = 'scanTasksCoachmarkSeen_v1';
  const openImageExtractor = () => {
    if (!requireFeature('ai_dictation')) return;
    const seen = typeof window !== 'undefined' && localStorage.getItem(SCAN_COACHMARK_KEY) === '1';
    if (!seen) {
      setShowScanCoachmark(true);
      try { localStorage.setItem(SCAN_COACHMARK_KEY, '1'); } catch {}
      return;
    }
    setShowImageExtractor(true);
  };
  const dismissScanCoachmark = () => {
    setShowScanCoachmark(false);
    setShowImageExtractor(true);
  };
  const handleExtractedTasksAdd = (
    tasks: Array<Omit<TodoItem, 'id' | 'completed'>>,
  ) => {
    tasks.forEach((tk) => onAddTask(tk));
    setShowImageExtractor(false);
    onClose();
  };

  const folderColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Natural language parsing - real-time preview
  const parsedTask = useMemo(() => {
    if (!taskText.trim()) return null;
    return parseNaturalLanguageTask(taskText);
  }, [taskText]);

  const hasNLPPatterns = useMemo(() => {
    return hasNaturalLanguagePatterns(taskText);
  }, [taskText]);

  const handleSaveActions = async (actions: ActionItem[]) => {
    setActionItems(actions);
    await setSetting('taskInputActions', actions);
    toast.success(t('toasts.actionsUpdated'));
  };

  const isActionEnabled = (id: string) => actionItems.find(a => a.id === id)?.enabled ?? true;
  const getActionOrder = () => actionItems.filter(a => a.enabled).map(a => a.id);

  useEffect(() => {
    if (!isOpen) {
      // Force-release any in-flight AI lock so the app never stays "busy"
      // if the user closed the sheet mid-request.
      releaseAllAiLocks();
      setTaskText('');
      setPriority('none');
      setDueDate(undefined);
      setReminderTime(undefined);
      setRepeatType('none');
      setRepeatDays([]);
      setFolderId(undefined);
      setSectionId(undefined);
      setImageUrl(undefined);
      setSelectedTagIds([]);
      setShowTagSheet(false);
      setDeadline(undefined);
      setDeadlineReminderTime(undefined);
      setDescription('');
      setLocation('');
      setShowDescriptionInput(false);
      setAttachments([]);
      setVoiceRecording(undefined);
      setIsUrgent(false);
      setIsRecording(false);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      setIsPlaying(false);
      setPlaybackProgress(0);
      setPlaybackCurrentTime(0);
      setShowTrimmer(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } else {
      // Apply default settings when sheet opens
      if (tasksSettings) {
        // Apply default priority
        if (tasksSettings.defaultPriority && tasksSettings.defaultPriority !== 'none') {
          setPriority(tasksSettings.defaultPriority);
        }
        // Apply default due date
        if (tasksSettings.defaultDueDate && tasksSettings.defaultDueDate !== 'none') {
          const today = new Date();
          if (tasksSettings.defaultDueDate === 'today') {
            setDueDate(today);
          } else if (tasksSettings.defaultDueDate === 'tomorrow') {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            setDueDate(tomorrow);
          }
        }
      }
      // Override with explicit defaultDate if provided (for calendar)
      if (defaultDate) {
        setDueDate(defaultDate);
      }
    }
  }, [isOpen, defaultDate, tasksSettings]);

  useEffect(() => {
    if (selectedSectionId) {
      setSectionId(selectedSectionId);
    }
  }, [selectedSectionId]);

  useEffect(() => {
    if (selectedFolderId) {
      setFolderId(selectedFolderId);
    }
  }, [selectedFolderId]);

  const handleSend = (e?: React.MouseEvent) => {
    // Prevent event from bubbling up and closing the sheet
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (!taskText.trim() && !voiceRecording) return;

    // Fire haptics non-blocking (don't await - prevents native jerk)
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});

    // Use natural language parsing to extract date/time/priority/repeat/location/tags/folder from text
    const parsed = taskText.trim() ? parseNaturalLanguageTask(taskText) : null;
    
    // Use parsed values if available, otherwise use manually set values
    const finalText = taskText || (voiceRecording ? 'Voice Task' : '');
    const finalDueDate = dueDate || parsed?.dueDate;
    const finalPriority = priority !== 'none' ? priority : parsed?.priority;
    const finalRepeatType = repeatType !== 'none' ? repeatType : parsed?.repeatType;
    const finalDescription = description.trim() || parsed?.description;
    const finalEstimatedHours = estimatedHours || parsed?.estimatedHours;
    const finalRepeatDays = repeatType === 'custom' && repeatDays.length > 0 ? repeatDays : parsed?.repeatDays;
    const finalLocation = location.trim() || parsed?.location;
    const finalReminderTime = reminderTime || deadlineReminderTime || parsed?.reminderTime;
    
    // Use selected global tags
    const finalTagIds = [...selectedTagIds];
    
    // Resolve folder name to folder ID
    let finalFolderId = folderId;
    if (parsed?.folderName && !folderId) {
      const matchedFolder = folders.find(f => 
        f.name.toLowerCase().includes(parsed.folderName!.toLowerCase())
      );
      if (matchedFolder) {
        finalFolderId = matchedFolder.id;
      }
    }

    // Check for pending subtasks from template (use ref to avoid async issues)
    const subtasks = pendingSubtasksRef.current;
    pendingSubtasksRef.current = undefined;

    const mainTask: Omit<TodoItem, 'id' | 'completed'> = {
      text: finalText,
      priority: finalPriority,
      dueDate: finalDueDate,
      reminderTime: finalReminderTime,
      repeatType: finalRepeatType,
      repeatDays: finalRepeatDays,
      advancedRepeat: parsed?.advancedRepeat,
      folderId: finalFolderId,
      sectionId,
      imageUrl,
      tagIds: finalTagIds.length > 0 ? finalTagIds : undefined,
      voiceRecording,
      description: finalDescription || undefined,
      location: finalLocation,
      subtasks: subtasks,
      attachments: attachments.length > 0 ? attachments : undefined,
      estimatedHours: finalEstimatedHours,
      isUrgent: isUrgent || undefined,
    };

    // If deadline is set, store it in dueDate
    if (deadline) {
      mainTask.dueDate = deadline;
    }

    // Add task first
    onAddTask(mainTask);
    
    // Reset fields using setTimeout for native batching (prevents jerk/flicker)
    setTimeout(() => {
      setTaskText('');
      setPriority(tasksSettings?.defaultPriority || 'none');
      setDueDate(tasksSettings?.defaultDueDate === 'today' ? new Date() : 
                 tasksSettings?.defaultDueDate === 'tomorrow' ? new Date(Date.now() + 86400000) : undefined);
      setReminderTime(undefined);
      setRepeatType('none');
      setRepeatDays([]);
      setRepeatSettings(undefined);
      setImageUrl(undefined);
      setSelectedTagIds([]);
      setDeadline(undefined);
      setDeadlineReminderTime(undefined);
      setDescription('');
      setLocation('');
      setShowDescriptionInput(false);
      setAttachments([]);
      setEstimatedHours(undefined);
      setVoiceRecording(undefined);
      setIsUrgent(false);
      inputRef.current?.focus();
    }, 0);
  };

  // Handle template selection
  const handleSelectTemplate = (template: TaskTemplate) => {
    setTaskText(template.taskText);
    setPriority(template.priority);
    setRepeatType(template.repeatType);
    if (template.repeatDays) {
      setRepeatDays(template.repeatDays);
    }
    // Template tags are legacy coloredTags - skip for global tags
    
    // Create subtasks from template
    if (template.subtasks && template.subtasks.length > 0) {
      const subtasksList = template.subtasks.map((text, idx) => ({
        id: `subtask-${Date.now()}-${idx}`,
        text,
        completed: false
      }));
      // Store subtasks to be added when task is created (use ref for sync access)
      pendingSubtasksRef.current = subtasksList as TodoItem[];
    }
    
    toast.success(t('toasts.templateApplied', { name: template.name }));
  };

  // Voice recording functions
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };



  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Set up audio analysis for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start analyzing audio
      const analyzeAudio = () => {
        if (!analyserRef.current) return;
        const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getFloatTimeDomainData(dataArray);
        setAudioData(new Float32Array(dataArray));
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      };
      analyzeAudio();

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop audio analysis
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        setAudioData(null);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const audioBase64 = reader.result as string;
          // Use ref value for accurate duration (state may be stale in callback)
          const recording: VoiceRecording = {
            id: genId(),
            audioUrl: audioBase64,
            duration: recordingTimeRef.current,
            timestamp: new Date(),
          };
          setVoiceRecording(recording);
          stream.getTracks().forEach(track => track.stop());
          setRecordingTime(0);
          recordingTimeRef.current = 0;
          toast.success(t('toasts.voiceRecordingSaved'));
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
      }, 1000);

      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {}
    } catch (error) {
      toast.error(t('errors.microphoneFailed'));
      console.error(error);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {}
    }
  };

  const playVoiceRecording = () => {
    if (!voiceRecording) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setPlaybackProgress(0);
      setPlaybackCurrentTime(0);
      return;
    }

    const audio = new Audio(voiceRecording.audioUrl);
    audio.playbackRate = playbackSpeed;
    audioRef.current = audio;
    
    audio.ontimeupdate = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setPlaybackProgress((audio.currentTime / audio.duration) * 100);
        setPlaybackCurrentTime(audio.currentTime);
      }
    };
    
    audio.onloadedmetadata = () => {
      // Update duration from actual audio metadata if available
      if (audio.duration && !isNaN(audio.duration) && voiceRecording.duration === 0) {
        setVoiceRecording(prev => prev ? { ...prev, duration: Math.round(audio.duration) } : prev);
      }
    };
    
    audio.onended = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
      setPlaybackCurrentTime(0);
      audioRef.current = null;
    };
    
    audio.play();
    setIsPlaying(true);
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !voiceRecording) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const duration = audioRef.current.duration || voiceRecording.duration;
    if (duration && !isNaN(duration)) {
      audioRef.current.currentTime = percentage * duration;
      setPlaybackProgress(percentage * 100);
      setPlaybackCurrentTime(percentage * duration);
    }
  };

  const removeVoiceRecording = () => {
    setVoiceRecording(undefined);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleDateTimeSave = (data: {
    selectedDate?: Date;
    selectedTime?: { hour: number; minute: number; period: 'AM' | 'PM' };
    reminder?: string;
    repeatSettings?: RepeatSettings;
  }) => {
    // Combine date with time
    let finalDate: Date | undefined;
    if (data.selectedDate) {
      finalDate = new Date(data.selectedDate);
      if (data.selectedTime) {
        let hour = data.selectedTime.hour;
        // Convert 12-hour to 24-hour format
        if (data.selectedTime.period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (data.selectedTime.period === 'AM' && hour === 12) {
          hour = 0;
        }
        finalDate.setHours(hour, data.selectedTime.minute, 0, 0);
      }
    }
    
    setDueDate(finalDate);
    
    // Set reminder time based on reminder option
    if (data.reminder && data.reminder !== 'none' && finalDate) {
      const reminderDate = new Date(finalDate);
      switch (data.reminder) {
        case 'instant':
          // Reminder at the exact task time
          break;
        case '5min':
          reminderDate.setMinutes(reminderDate.getMinutes() - 5);
          break;
        case '10min':
          reminderDate.setMinutes(reminderDate.getMinutes() - 10);
          break;
        case '15min':
          reminderDate.setMinutes(reminderDate.getMinutes() - 15);
          break;
        case '30min':
          reminderDate.setMinutes(reminderDate.getMinutes() - 30);
          break;
        case '1hour':
          reminderDate.setHours(reminderDate.getHours() - 1);
          break;
        case '2hours':
          reminderDate.setHours(reminderDate.getHours() - 2);
          break;
        case '1day':
          reminderDate.setDate(reminderDate.getDate() - 1);
          break;
      }
      setReminderTime(reminderDate);
    } else {
      setReminderTime(undefined);
    }
    
    // Set repeat settings
    if (data.repeatSettings) {
      setRepeatSettings(data.repeatSettings);
      // Map to legacy repeatType for compatibility
      switch (data.repeatSettings.frequency) {
        case 'daily':
          setRepeatType('daily');
          break;
        case 'weekly':
          setRepeatType('weekly');
          setRepeatDays(data.repeatSettings.weeklyDays || []);
          break;
        case 'monthly':
          setRepeatType('monthly');
          break;
        default:
          setRepeatType('none');
      }
    } else {
      setRepeatSettings(undefined);
      setRepeatType('none');
      setRepeatDays([]);
    }
    
    setShowDateTimePage(false);
    toast.success(t('toasts.dateTimeSaved'));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
    onCreateFolder(newFolderName.trim(), selectedColor);
    setNewFolderName('');
    setSelectedColor('#3b82f6');
    setShowFolderDialog(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // File attachment upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Save to IndexedDB
        await saveTaskMedia('file', id, dataUrl);
        
        const attachment: TaskAttachment = {
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          ref: makeTaskMediaRef('file', id),
        };
        
        setAttachments(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    
    const attachment = attachments.find(a => a.id === attachmentId);
    if (attachment) {
      const parsed = parseTaskMediaRef(attachment.ref);
      if (parsed) {
        await deleteTaskMedia(parsed.kind, parsed.id);
      }
    }
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const resolvedSelectedTags = resolveTagIds(selectedTagIds);
  const detectedTaskPreview = parsedTask;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-[60]"
        onClick={preventBackdropClose ? undefined : onClose}
      />

      <div
        className="fixed left-0 right-0 bg-card z-[70] rounded-t-3xl shadow-2xl pointer-events-auto transition-opacity overflow-y-auto"
        style={{ 
          bottom: shouldLiftForKeyboard ? `${keyboardHeight}px` : '0px',
          paddingBottom: keyboardHeight > 0 ? '0px' : 'max(var(--safe-bottom, 0px), 4px)',
          maxHeight: isAndroidNative ? '60vh' : (shouldLiftForKeyboard ? `calc(100vh - ${keyboardHeight}px)` : '80vh'),
          transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : undefined,
          opacity: swipeOffset > 60 ? 0.6 : 1,
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Input
              ref={inputRef}
              placeholder={t('tasks.naturalLanguagePlaceholder')}
              value={taskText}
              onChange={(e) => {
                setTaskText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSend();
                }
              }}
              className="text-[17px] border-0 px-0 py-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none bg-transparent placeholder:text-muted-foreground/40"
              autoFocus
            />



            {taskText.trim() || voiceRecording ? (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={(e) => handleSend(e)}
                className="w-10 h-10 rounded-lg bg-primary hover:opacity-90 flex items-center justify-center transition-all flex-shrink-0"
              >
                <Send className="h-5 w-5 text-primary-foreground rotate-45" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Popover open={showScanCoachmark} onOpenChange={(o) => !o && dismissScanCoachmark()}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={openImageExtractor}
                      className="w-10 h-10 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors relative"
                      aria-label={t('tasks.aiScanImage', 'Scan tasks from photo')}
                      title={t('tasks.aiScanImageHint', 'Scan a paper or sticky-note board to add tasks')}
                    >
                      <ScanLine className="h-5 w-5 text-primary" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    className="w-72 p-3 border-primary/20"
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ScanLine className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium leading-tight">
                          {t('tasks.scanCoachmarkTitle', 'Scan tasks from photos')}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                            'tasks.scanCoachmarkBody',
                            'Scan paper, sticky notes, or whiteboard photos — AI extracts each task automatically.',
                          )}
                        </p>
                        <button
                          onClick={dismissScanCoachmark}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('common.gotIt', 'Got it')}
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Natural Language Parsing Preview */}
          {detectedTaskPreview && (detectedTaskPreview.dueDate || detectedTaskPreview.priority || detectedTaskPreview.repeatType || detectedTaskPreview.location || (detectedTaskPreview.tags && detectedTaskPreview.tags.length > 0) || ('folderName' in detectedTaskPreview && detectedTaskPreview.folderName) || detectedTaskPreview.description || ('estimatedHours' in detectedTaskPreview && detectedTaskPreview.estimatedHours) || ('reminderOffset' in detectedTaskPreview && detectedTaskPreview.reminderOffset)) && (
            <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="text-xs text-muted-foreground">{t('tasks.detected')}:</span>
              {detectedTaskPreview.dueDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                  <CalendarIcon className="h-3 w-3" />
                  {format(detectedTaskPreview.dueDate, 'MMM d, h:mm a')}
                </span>
              )}
              {'reminderOffset' in detectedTaskPreview && detectedTaskPreview.reminderOffset && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-warning/10 text-warning">
                  🔔 {detectedTaskPreview.reminderOffset === 'exact' ? t('taskInput.atTime') : detectedTaskPreview.reminderOffset}
                </span>
              )}
              {detectedTaskPreview.repeatType && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-purple/10 text-accent-purple">
                  <Timer className="h-3 w-3" />
                  {detectedTaskPreview.repeatType === 'custom' && 'repeatDays' in detectedTaskPreview && detectedTaskPreview.repeatDays
                    ? `${t('dateTime.repeatEvery')} ${[t('dateTime.weekDays.sun'), t('dateTime.weekDays.mon'), t('dateTime.weekDays.tue'), t('dateTime.weekDays.wed'), t('dateTime.weekDays.thu'), t('dateTime.weekDays.fri'), t('dateTime.weekDays.sat')].filter((_, i) => detectedTaskPreview.repeatDays?.includes(i)).join(', ')}`
                    : detectedTaskPreview.repeatType}
                </span>
              )}
              {detectedTaskPreview.location && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-info/10 text-info">
                  <MapPin className="h-3 w-3" />
                  {detectedTaskPreview.location}
                </span>
              )}
              {detectedTaskPreview.priority && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full",
                  detectedTaskPreview.priority === 'high' && "bg-destructive/10 text-destructive",
                  detectedTaskPreview.priority === 'medium' && "bg-warning/10 text-warning",
                  detectedTaskPreview.priority === 'low' && "bg-success/10 text-success",
                )}>
                  <Flag className="h-3 w-3" />
                  {detectedTaskPreview.priority}
                </span>
              )}
              {detectedTaskPreview.tags && detectedTaskPreview.tags.length > 0 && detectedTaskPreview.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-teal/10 text-accent-teal">
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}
              {'folderName' in detectedTaskPreview && detectedTaskPreview.folderName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-streak/10 text-streak">
                  <FolderIcon className="h-3 w-3" />
                  {detectedTaskPreview.folderName}
                </span>
              )}
              {'estimatedHours' in detectedTaskPreview && detectedTaskPreview.estimatedHours && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-indigo/10 text-accent-indigo">
                  ⏱ {detectedTaskPreview.estimatedHours >= 1 
                    ? `${Math.floor(detectedTaskPreview.estimatedHours)}h${Math.round((detectedTaskPreview.estimatedHours % 1) * 60) > 0 ? `${Math.round((detectedTaskPreview.estimatedHours % 1) * 60)}m` : ''}`
                    : `${Math.round(detectedTaskPreview.estimatedHours * 60)}m`}
                </span>
              )}
              {detectedTaskPreview.description && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground max-w-[200px] truncate">
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  {detectedTaskPreview.description}
                </span>
              )}
            </div>
          )}
          {voiceRecording && !showTrimmer && (
            <div className="px-4 py-3 bg-primary/10 rounded-lg flex items-center gap-3 mb-4 border border-primary/20">
              <button
                onClick={playVoiceRecording}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-primary-foreground" />
                ) : (
                  <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                )}
              </button>
              <div className="flex-1 flex flex-col gap-1">
                {/* Waveform progress bar */}
                <WaveformProgressBar
                  audioUrl={voiceRecording.audioUrl}
                  progress={playbackProgress}
                  duration={voiceRecording.duration}
                  isPlaying={isPlaying}
                  onSeek={(percent) => {
                    if (audioRef.current && voiceRecording) {
                      const duration = audioRef.current.duration || voiceRecording.duration;
                      if (duration && !isNaN(duration)) {
                        audioRef.current.currentTime = (percent / 100) * duration;
                        setPlaybackProgress(percent);
                        setPlaybackCurrentTime((percent / 100) * duration);
                      }
                    }
                  }}
                  height={20}
                />
                {/* Time display */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-primary font-medium">
                    {isPlaying ? formatRecordingTime(Math.round(playbackCurrentTime)) : '0:00'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRecordingTime(voiceRecording.duration)}
                  </p>
                </div>
              </div>
              <button
                onClick={cyclePlaybackSpeed}
                className="px-2 py-1 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 transition-colors min-w-[40px]"
              >
                {playbackSpeed}x
              </button>
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                  }
                  setIsPlaying(false);
                  setShowTrimmer(true);
                }}
                className="p-2 hover:bg-muted rounded-full transition-colors"
                title={t('taskInput.trimRecording')}
              >
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={removeVoiceRecording}
                className="p-2 hover:bg-destructive/10 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-destructive" />
              </button>
            </div>
          )}
          
          {/* Voice Trimmer */}
          {voiceRecording && showTrimmer && (
            <div className="mb-4">
              <VoiceTrimmer
                audioUrl={voiceRecording.audioUrl}
                duration={voiceRecording.duration}
                onSave={(trimmedUrl, newDuration) => {
                  setVoiceRecording({
                    ...voiceRecording,
                    audioUrl: trimmedUrl,
                    duration: newDuration,
                  });
                  setShowTrimmer(false);
                  toast.success(t('toasts.recordingTrimmed'));
                }}
                onCancel={() => setShowTrimmer(false)}
              />
            </div>
          )}

          {/* Date/Time/Repeat indicator */}
          {(dueDate || repeatSettings) && (
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg flex items-center gap-2 mb-4">
              <CalendarCheck className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {dueDate ? format(dueDate, 'MMM d') : ''}
                {dueDate && (dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0) ? ` • ${format(dueDate, 'h:mm a')}` : ''}
                {repeatSettings ? ` • ${t('taskInput.repeatsFrequency', { frequency: t(`dateTime.frequency.${repeatSettings.frequency}`) })}` : ''}
              </span>
              <button
                onClick={() => {
                  setDueDate(undefined);
                  setReminderTime(undefined);
                  setRepeatSettings(undefined);
                  setRepeatType('none');
                  setRepeatDays([]);
                }}
                className="ml-auto"
              >
                <X className="h-4 w-4 text-blue-500 hover:text-blue-700" />
              </button>
            </div>
          )}

          {/* Deadline indicator */}
          {deadline && (
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/20 rounded-lg flex items-center gap-2 mb-4">
              <CalendarClock className="h-4 w-4 text-rose-500" />
              <span className="text-sm text-rose-700 dark:text-rose-300 font-medium">
                {t('taskInput.deadlineLabel', { date: format(deadline, 'MMM d') })}
                {deadlineReminderTime ? ` • ${t('taskInput.reminderAt', { time: format(deadlineReminderTime, 'h:mm a') })}` : ''}
              </span>
              <button
                onClick={() => {
                  setDeadline(undefined);
                  setDeadlineReminderTime(undefined);
                }}
                className="ml-auto"
              >
                <X className="h-4 w-4 text-rose-500 hover:text-rose-700" />
              </button>
            </div>
          )}

          {/* Tags display */}
          {resolvedSelectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {resolvedSelectedTags.map((tag) => (
                <span 
                  key={tag.id} 
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border text-white"
                  style={{ 
                    backgroundColor: `hsl(${tag.color})`,
                    borderColor: `hsl(${tag.color} / 0.4)`,
                  }}
                >
                  {tag.icon && <span>{tag.icon}</span>}
                  <Tag className="h-3 w-3" />
                  {tag.name}
                  <button onClick={() => setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id))}>
                    <X className="h-3 w-3 hover:opacity-70" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Description indicator */}
          {description && (
            <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-cyan-500" />
              <span className="text-sm text-cyan-700 dark:text-cyan-300 font-medium truncate flex-1">
                {description.length > 50 ? description.substring(0, 50) + '...' : description}
              </span>
              <button
                onClick={() => {
                  setDescription('');
                }}
                className="ml-auto"
              >
                <X className="h-4 w-4 text-cyan-500 hover:text-cyan-700" />
              </button>
            </div>
          )}

          {/* Urgent indicator */}
          {isUrgent && (
            <div className="px-4 py-2 bg-destructive/10 dark:bg-destructive/20 rounded-lg flex items-center gap-2 mb-4 border border-destructive/30">
              <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
              <span className="text-sm text-destructive font-medium">
                {t('taskInput.urgentEnabled', 'Urgent — Full-screen reminder will trigger')}
              </span>
              <button onClick={() => setIsUrgent(false)} className="ml-auto">
                <X className="h-4 w-4 text-destructive hover:text-destructive/70" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {/* Template button - always first */}
            <button
              onClick={() => setShowTemplateSheet(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all whitespace-nowrap"
            >
              <LayoutTemplate className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm text-primary font-medium">{t('taskInput.templates')}</span>
            </button>
            
            {/* Render action buttons in the order defined by actionItems */}
            {actionItems.filter(a => a.enabled).map((action) => {
              if (action.id === 'date') {
                return (
                  <button
                    key={action.id}
                    onClick={() => setShowDateTimePage(true)}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      dueDate ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    {dueDate && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />}
                    {dueDate ? (
                      <CalendarCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={cn("text-sm whitespace-nowrap", dueDate ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
                      {dueDate ? format(dueDate, 'MMM d') : t('taskInput.date')}
                    </span>
                  </button>
                );
              }

              if (action.id === 'priority') {
                const currentPriorityColor = getPriorityColor(priority);
                const currentPriorityName = getPriorityName(priority);
                return (
                  <Popover key={action.id} open={showPriorityMenu} onOpenChange={setShowPriorityMenu}>
                    <PopoverTrigger asChild>
                      <button 
                        className="relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap"
                        style={{
                          borderColor: priority !== 'none' ? currentPriorityColor : undefined,
                          backgroundColor: priority !== 'none' ? `${currentPriorityColor}15` : undefined,
                        }}
                      >
                        {priority !== 'none' && (
                          <span 
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                            style={{ backgroundColor: currentPriorityColor }}
                          />
                        )}
                        <Flag 
                          className="h-4 w-4 flex-shrink-0"
                          style={{ 
                            color: priority !== 'none' ? currentPriorityColor : undefined,
                            fill: priority !== 'none' ? currentPriorityColor : 'none',
                          }}
                        />
                        <span 
                          className="text-sm whitespace-nowrap"
                          style={{ color: priority !== 'none' ? currentPriorityColor : undefined }}
                        >
                          {priority !== 'none' ? currentPriorityName : t('taskInput.priority')}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2 bg-popover z-[100]" align="start">
                      <div className="space-y-1">
                        {priorities.map((p) => (
                          <Button 
                            key={p.id}
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-start" 
                            onClick={() => { setPriority(p.id); setShowPriorityMenu(false); }}
                          >
                            <Flag 
                              className="h-4 w-4 mr-2" 
                              style={{ 
                                color: p.color, 
                                fill: p.id !== 'none' ? p.color : 'none' 
                              }} 
                            />
                            {p.name}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              // Reminder and Repeat are now handled in the Date/Time page
              if (action.id === 'reminder' || action.id === 'repeat') {
                return null;
              }

              if (action.id === 'tags') {
                return (
                  <button
                    key={action.id}
                    onClick={() => setShowTagSheet(true)}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      selectedTagIds.length > 0 ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    {selectedTagIds.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-teal-500 rounded-full" />}
                    <Tag className={cn("h-4 w-4 flex-shrink-0", selectedTagIds.length > 0 ? "text-teal-500" : "text-muted-foreground")} />
                    <span className={cn("text-sm whitespace-nowrap", selectedTagIds.length > 0 ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground")}>
                      {selectedTagIds.length > 0 ? `${selectedTagIds.length} ${t('taskInput.tags')}` : t('taskInput.tags')}
                    </span>
                  </button>
                );
              }

              if (action.id === 'deadline') {
                return (
                  <button
                    key={action.id}
                    onClick={() => { if (!requireFeature('deadline')) return; setShowDeadlinePage(true); }}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      deadline ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    {deadline && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />}
                    <CalendarClock className={cn("h-4 w-4 flex-shrink-0", deadline ? "text-rose-500" : "text-muted-foreground")} />
                    <span className={cn("text-sm whitespace-nowrap", deadline ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                      {deadline ? format(deadline, 'MMM d') : t('taskInput.deadline')}
                    </span>
                  </button>
                );
              }

              if (action.id === 'section') {
                return (
                  <Popover key={action.id} open={showSectionPopover} onOpenChange={setShowSectionPopover}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                          sectionId ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-border bg-card hover:bg-muted"
                        )}
                      >
                        {sectionId && <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full" />}
                        <ListTodo className={cn("h-4 w-4 flex-shrink-0", sectionId ? "text-violet-500" : "text-muted-foreground")} />
                        <span className={cn("text-sm whitespace-nowrap", sectionId ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground")}>
                          {sectionId ? sections.find(s => s.id === sectionId)?.name || t('taskInput.section') : t('taskInput.section')}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 bg-popover z-[100]" align="start">
                      <div className="space-y-1">
                        {sections.map((section) => (
                          <Button
                            key={section.id}
                            variant={sectionId === section.id ? "secondary" : "ghost"}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setSectionId(section.id); setShowSectionPopover(false); }}
                          >
                            <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: section.color }} />
                            {section.name}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              if (action.id === 'folder') {
                return (
                  <button
                    key={action.id}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      folderId ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-border bg-card hover:bg-muted"
                    )}
                    onClick={() => setShowFolderDialog(true)}
                  >
                    {folderId && <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />}
                    <FolderIcon className={cn("h-4 w-4 flex-shrink-0", folderId ? "text-amber-500" : "text-muted-foreground")} />
                    <span className={cn("text-sm whitespace-nowrap", folderId ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                      {folderId ? folders.find(f => f.id === folderId)?.name || t('taskInput.folder') : t('taskInput.folder')}
                    </span>
                  </button>
                );
              }

              if (action.id === 'image') {
                return (
                  <button
                    key={action.id}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      imageUrl ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-card hover:bg-muted"
                    )}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {imageUrl && <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />}
                    <ImageIcon className={cn("h-4 w-4 flex-shrink-0", imageUrl ? "text-emerald-500" : "text-muted-foreground")} />
                    <span className={cn("text-sm whitespace-nowrap", imageUrl ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      {imageUrl ? t('taskInput.imageAdded') : t('taskInput.image')}
                    </span>
                  </button>
                );
              }

              if (action.id === 'attachment') {
                return (
                  <Popover key={action.id}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                          attachments.length > 0 ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-border bg-card hover:bg-muted"
                        )}
                      >
                        {attachments.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 rounded-full" />}
                        <Paperclip className={cn("h-4 w-4 flex-shrink-0", attachments.length > 0 ? "text-sky-500" : "text-muted-foreground")} />
                        <span className={cn("text-sm whitespace-nowrap", attachments.length > 0 ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}>
                          {attachments.length > 0 ? `${attachments.length} ${t('taskInput.filesAdded', 'Files')}` : t('taskInput.attachment', 'Files')}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 bg-popover z-[100]" align="start">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">{t('taskInput.attachments', 'File Attachments')}</p>
                        
                        {/* List attached files */}
                        {attachments.length > 0 && (
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {attachments.map((att) => (
                              <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                <File className="h-4 w-4 text-sky-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{att.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(att.size)}</p>
                                </div>
                                <button
                                  onClick={() => handleRemoveAttachment(att.id)}
                                  className="p-1 hover:bg-destructive/10 rounded"
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full" 
                          onClick={() => { if (!requireFeature('file_attachments')) return; fileInputRef.current?.click(); }}
                        >
                          <Paperclip className="h-4 w-4 mr-2" />
                          {t('taskInput.addFiles', 'Add Files')}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              if (action.id === 'description') {
                return (
                  <Popover key={action.id} open={showDescriptionInput} onOpenChange={setShowDescriptionInput}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                          description ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30" : "border-border bg-card hover:bg-muted"
                        )}
                      >
                        {description && <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-500 rounded-full" />}
                        <FileText className={cn("h-4 w-4 flex-shrink-0", description ? "text-cyan-500" : "text-muted-foreground")} />
                        <span className={cn("text-sm whitespace-nowrap", description ? "text-cyan-600 dark:text-cyan-400" : "text-muted-foreground")}>
                          {description ? t('taskInput.hasDescription') : t('taskInput.description')}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 bg-popover z-[100]" align="start">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">{t('taskInput.taskDescription')}</p>
                        <textarea
                          ref={descTextareaRef}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder={t('taskInput.addMoreDetails')}
                          className="w-full h-24 px-3 py-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <Button size="sm" className="w-full" onClick={() => setShowDescriptionInput(false)}>
                          {t('common.done')}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              }

              if (action.id === 'urgent') {
                return (
                  <button
                    key={action.id}
                    onClick={() => {
                      if (!requireFeature('urgent_reminder')) return;
                      setIsUrgent(!isUrgent);
                    }}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 rounded-md border transition-all whitespace-nowrap",
                      isUrgent ? "border-destructive bg-destructive/10 dark:bg-destructive/20" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    {isUrgent && <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />}
                    <AlertTriangle className={cn("h-4 w-4 flex-shrink-0", isUrgent ? "text-destructive" : "text-muted-foreground")} />
                    <span className={cn("text-sm whitespace-nowrap", isUrgent ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {t('taskInput.urgent', 'Urgent')}
                    </span>
                    
                  </button>
                );
              }

              return null;
            })}

            {/* Edit Actions Button - always last */}
            <button
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-all whitespace-nowrap"
              onClick={() => setShowEditActions(true)}
            >
              <Settings2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">{t('taskInput.editActions')}</span>
            </button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      </div>

      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="max-w-md" style={{ zIndex: document.body.classList.contains('onboarding-active') ? 400 : 100 }}>
          <DialogHeader>
            <DialogTitle>{t('taskInput.selectOrCreateFolder')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {folders.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('taskInput.selectFolder')}:</p>
                <div className="space-y-1">
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setFolderId(undefined); setShowFolderDialog(false); }}>
                    <FolderIcon className="h-4 w-4 mr-2" />{t('taskInput.allTasks')}
                  </Button>
                  {folders.map((folder) => (
                    <Button
                      key={folder.id}
                      variant={folderId === folder.id ? "secondary" : "ghost"}
                      className="w-full justify-start"
                      onClick={() => { setFolderId(folder.id); setShowFolderDialog(false); }}
                    >
                      <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: folder.color }} />
                      {folder.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('taskInput.createNewFolder')}:</p>
              <Input
                placeholder={t('taskInput.folderName')}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              />
              <div>
                <p className="text-sm text-muted-foreground mb-2">{t('taskInput.folderColor')}</p>
                <div className="flex gap-2">
                  {folderColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={cn("w-10 h-10 rounded-full transition-all", selectedColor === color && "ring-2 ring-primary ring-offset-2")}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={handleCreateFolder} className="w-full" disabled={!newFolderName.trim()}>
                {t('notesMenu.createFolder')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TaskDateTimePage - Full page date/time/repeat picker */}
      <TaskDateTimePage
        isOpen={showDateTimePage}
        onClose={() => setShowDateTimePage(false)}
        onSave={handleDateTimeSave}
        initialDate={dueDate}
        initialRepeatSettings={repeatSettings}
      />

      {/* Deadline Page - Date/Time/Reminder without repeat */}
      <TaskDateTimePage
        isOpen={showDeadlinePage}
        onClose={() => setShowDeadlinePage(false)}
        onSave={(data) => {
          setDeadline(data.selectedDate);
          if (data.reminder && data.reminder !== 'none' && data.selectedDate) {
            const reminderDate = new Date(data.selectedDate);
            switch (data.reminder) {
              case '5min':
                reminderDate.setMinutes(reminderDate.getMinutes() - 5);
                break;
              case '10min':
                reminderDate.setMinutes(reminderDate.getMinutes() - 10);
                break;
              case '15min':
                reminderDate.setMinutes(reminderDate.getMinutes() - 15);
                break;
              case '30min':
                reminderDate.setMinutes(reminderDate.getMinutes() - 30);
                break;
              case '1hour':
                reminderDate.setHours(reminderDate.getHours() - 1);
                break;
              case '2hours':
                reminderDate.setHours(reminderDate.getHours() - 2);
                break;
              case '1day':
                reminderDate.setDate(reminderDate.getDate() - 1);
                break;
            }
            setDeadlineReminderTime(reminderDate);
          } else {
            setDeadlineReminderTime(undefined);
          }
          setShowDeadlinePage(false);
          toast.success(t('toasts.deadlineSaved'));
        }}
        initialDate={deadline}
        hideRepeat={true}
      />

      {/* Edit Actions Sheet */}
      <EditActionsSheet
        isOpen={showEditActions}
        onClose={() => setShowEditActions(false)}
        actions={actionItems}
        onSave={handleSaveActions}
      />

      {/* Tag Management Sheet (Global Tags) */}
      <TagManagementSheet
        open={showTagSheet}
        onOpenChange={(open) => {
          setShowTagSheet(open);
          if (!open) refreshGlobalTags();
        }}
        selectionMode
        selectedTagIds={selectedTagIds}
        onSelectionChange={setSelectedTagIds}
      />

      {/* Task Template Sheet */}
      <TaskTemplateSheet
        isOpen={showTemplateSheet}
        onClose={() => setShowTemplateSheet(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* AI vision: Scan tasks from a paper / sticky-note image */}
      <SafeComponent fallback={null}>
        <ImageTaskExtractorSheet
          isOpen={showImageExtractor}
          onClose={() => setShowImageExtractor(false)}
          onAddTasks={handleExtractedTasksAdd}
          folders={folders}
          sections={sections}
          currentFolderId={folderId ?? selectedFolderId ?? null}
          currentSectionId={sectionId ?? selectedSectionId ?? null}
        />
      </SafeComponent>
    </>
  );
};
