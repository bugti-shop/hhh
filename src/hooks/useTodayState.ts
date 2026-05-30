/**
 * useTodayState — Central state management for the Today page.
 * Extracts all useState declarations and settings persistence from Today.tsx
 */
import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue, startTransition } from 'react';
import { useTaskWorker, FilterSortResult } from '@/hooks/useTaskWorker';
import { getTasksCacheVersion } from '@/utils/taskStorage';
import { TodoItem, Folder, Priority, TaskSection, TaskStatus } from '@/types/note';
import { useTranslation } from 'react-i18next';
import { useGlobalTags } from '@/hooks/useGlobalTags';
import { useSubscription, FREE_LIMITS } from '@/contexts/SubscriptionContext';
import { useTasksSettings } from '@/components/TasksSettingsSheet';
import { usePriorities } from '@/hooks/usePriorities';
import { useSmartLists, SmartListType } from '@/components/SmartListsDropdown';
import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';
import { getSetting, setSetting, getAllSettings } from '@/utils/settingsStorage';
import { archiveCompletedTasks } from '@/utils/taskCleanup';
import { logActivity } from '@/utils/activityLogger';
import { toast } from 'sonner';
import { DateFilter, PriorityFilter, StatusFilter } from '@/components/TaskFilterSheet';
import { HideDetailsOptions } from '@/components/TaskOptionsSheet';
import { CustomSmartView, loadCustomSmartViews } from '@/utils/customSmartViews';
import { getSmartListFilter } from '@/components/SmartListsDropdown';
import { isToday, isTomorrow, isThisWeek, isBefore, startOfDay } from 'date-fns';
import { useStreakChallengeDialog } from '@/components/StreakChallengeDialog';
import { useStreak } from '@/hooks/useStreak';

export type ViewMode = 'flat' | 'kanban' | 'kanban-status' | 'timeline' | 'progress' | 'priority' | 'history';
export type SortBy = 'date' | 'priority' | 'name' | 'created';

const getDefaultSections = (t: (key: string) => string): TaskSection[] => [
  { id: 'default', name: t('grouping.tasks'), color: '#3b82f6', isCollapsed: false, order: 0 }
];

export const useTodayState = () => {
  const { t } = useTranslation();
  const tasksSettings = useTasksSettings();
  const { getPriorityColor, getPriorityName } = usePriorities();
  const { requireFeature, isPro } = useSubscription();
  const { tags: allGlobalTags } = useGlobalTags();

  // Core data
  const [items, setItems] = useState<TodoItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sections, setSections] = useState<TaskSection[]>(getDefaultSections(t));

  // UI state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputSectionId, setInputSectionId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TodoItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(tasksSettings.showCompletedTasks);

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [smartList, setSmartList] = useState<SmartListType>('all');

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [hideDetailsOptions, setHideDetailsOptions] = useState<HideDetailsOptions>({ hideDateTime: true, hideStatus: true, hideSubtasks: true });
  const [compactMode, setCompactMode] = useState(false);
  const [groupByOption, setGroupByOption] = useState<'none' | 'section' | 'priority' | 'date'>('none');
  const [viewModeSearch, setViewModeSearch] = useState('');
  const deferredSearch = useDeferredValue(viewModeSearch);
  const [dropdownView, setDropdownView] = useState<'main' | 'smartLists' | 'sortBy' | 'groupBy'>('main');

  // Sheet states
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isDuplicateSheetOpen, setIsDuplicateSheetOpen] = useState(false);
  const [isFolderManageOpen, setIsFolderManageOpen] = useState(false);
  const [isMoveToFolderOpen, setIsMoveToFolderOpen] = useState(false);
  const [isSelectActionsOpen, setIsSelectActionsOpen] = useState(false);
  const [isPrioritySheetOpen, setIsPrioritySheetOpen] = useState(false);
  const [isBatchTaskOpen, setIsBatchTaskOpen] = useState(false);
  const [isSectionEditOpen, setIsSectionEditOpen] = useState(false);
  const [isSectionMoveOpen, setIsSectionMoveOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<TaskSection | null>(null);
  const [selectedSubtask, setSelectedSubtask] = useState<{ subtask: TodoItem; parentId: string } | null>(null);
  const [isLocationMapOpen, setIsLocationMapOpen] = useState(false);
  const [isBulkDateSheetOpen, setIsBulkDateSheetOpen] = useState(false);
  const [isBulkReminderSheetOpen, setIsBulkReminderSheetOpen] = useState(false);
  const [isBulkRepeatSheetOpen, setIsBulkRepeatSheetOpen] = useState(false);
  const [isBulkSectionMoveOpen, setIsBulkSectionMoveOpen] = useState(false);
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [isTaskOptionsOpen, setIsTaskOptionsOpen] = useState(false);
  const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);

  // Task options
  const [defaultSectionId, setDefaultSectionId] = useState<string | undefined>();
  const [taskAddPosition, setTaskAddPosition] = useState<'top' | 'bottom'>('top');
  const [showStatusBadge, setShowStatusBadge] = useState(true);
  const [groupBy, setGroupBy] = useState<'custom' | 'date' | 'priority'>('custom');
  const [optionsSortBy, setOptionsSortBy] = useState<'custom' | 'date' | 'priority'>('custom');

  // Misc
  const [orderVersion, setOrderVersion] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TodoItem | null>(null);
  const [customSmartViews, setCustomSmartViews] = useState<CustomSmartView[]>([]);
  const [activeCustomViewId, setActiveCustomViewId] = useState<string | null>(null);
  const [isSaveSmartViewOpen, setIsSaveSmartViewOpen] = useState(false);
  const [swipeMoveTaskId, setSwipeMoveTaskId] = useState<string | null>(null);
  const [swipeDateTaskId, setSwipeDateTaskId] = useState<string | null>(null);
  const [pendingCompleteId, setPendingCompleteId] = useState<string | null>(null);
  const pendingCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapsed sections
  const [collapsedViewSections, setCollapsedViewSections] = useState<Set<string>>(new Set());
  const [collapsedSectionsLoaded, setCollapsedSectionsLoaded] = useState(false);

  // Expanded tasks (subtask toggle)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Streaks
  const { showDialog: showStreakChallenge, closeDialog: closeStreakChallenge } = useStreakChallengeDialog();
  const { data: streakData, weekData: streakWeekData } = useStreak({ autoCheck: false });

  const smartListData = useSmartLists(items);

  // Sync showCompleted with tasks settings
  useEffect(() => {
    setShowCompleted(tasksSettings.showCompletedTasks);
  }, [tasksSettings.showCompletedTasks]);

  // Load data on mount — run tasks + settings in parallel for speed
  useEffect(() => {
    const loadAll = async () => {
      // Load tasks and settings in parallel — don't wait for one to finish before starting the other
      const [loadedItemsRaw] = await Promise.all([
        loadTodoItems(),
        // Settings load runs concurrently below
      ]);

      let loadedItems = loadedItemsRaw;

      // Defer rollover + archive to after initial render — show tasks first
      requestAnimationFrame(async () => {
        try {
          const { processTaskRollovers } = await import('@/utils/taskRollover');
          const { tasks: rolledOverItems, rolledOverCount } = processTaskRollovers(loadedItems);
          if (rolledOverCount > 0) {
            await saveTodoItems(rolledOverItems);
            loadedItems = rolledOverItems;
            setItems(loadedItems);
            toast.info(t('todayPage.autoUpdatedRecurring', { count: rolledOverCount }), { icon: '🔄' });
          }
          
          const { activeTasks, archivedCount } = await archiveCompletedTasks(loadedItems, 3);
          if (archivedCount > 0) {
            await saveTodoItems(activeTasks);
            setItems(activeTasks);
            toast.info(t('todayPage.archivedCompleted', { count: archivedCount }), { icon: '📦' });
          }
        } catch (e) {
          console.warn('Deferred task processing failed:', e);
        }
      });
      
      setItems(loadedItems);
      setItemsLoaded(true);
    };
    loadAll();

    const loadSettings = async () => {
      // Single IndexedDB read for ALL settings
      const s = await getAllSettings();
      const g = <T,>(key: string, def: T): T => (key in s ? s[key] as T : def);

      // Batch all setState calls inside startTransition to prevent blocking the main thread
      startTransition(() => {
        const savedFolders = g<Folder[] | null>('todoFolders', null);
        if (savedFolders) {
          setFolders(savedFolders.map((f: Folder) => ({ ...f, createdAt: new Date(f.createdAt) })));
        }
        const savedSections = g<TaskSection[]>('todoSections', []);
        setSections(savedSections.length > 0 ? savedSections : getDefaultSections(t));
        setShowCompleted(g<boolean>('todoShowCompleted', true));
        setDateFilter(g<DateFilter>('todoDateFilter', 'all'));
        setPriorityFilter(g<PriorityFilter>('todoPriorityFilter', 'all'));
        setStatusFilter(g<StatusFilter>('todoStatusFilter', 'all'));
        setTagFilter(g<string[]>('todoTagFilter', []));
        setViewMode(g<ViewMode>('todoViewMode', 'flat'));
        setHideDetailsOptions(g<HideDetailsOptions>('todoHideDetailsOptions', { hideDateTime: true, hideStatus: true, hideSubtasks: true }));
        setSortBy(g<SortBy>('todoSortBy', 'date'));
        setSmartList(g<SmartListType>('todoSmartList', 'all'));
        const savedFolderId = g<string | null>('todoSelectedFolder', null);
        setSelectedFolderId(savedFolderId === 'null' ? null : savedFolderId);
        setDefaultSectionId(g<string>('todoDefaultSectionId', '') || undefined);
        setTaskAddPosition(g<'top' | 'bottom'>('todoTaskAddPosition', 'bottom'));
        setShowStatusBadge(g<boolean>('todoShowStatusBadge', true));
        setCompactMode(g<boolean>('todoCompactMode', false));
        setGroupByOption(g<'none' | 'section' | 'priority' | 'date'>('todoGroupByOption', 'none'));
        setSettingsLoaded(true);
      });
    };
    loadSettings();
    loadCustomSmartViews().then(setCustomSmartViews);

    // Local restore events
    // Flag to prevent sync loops: when data comes from cloud restore,
    // don't dispatch tasksUpdated which would re-upload to Firebase
    let isFromSync = false;

    const handleTasksFromSync = async () => {
      isFromSync = true;
      const loadedItems = await loadTodoItems();
      setItems(loadedItems);
      setItemsLoaded(true);
    };
    const handleSectionsFromSync = async () => {
      const savedSections = await getSetting<TaskSection[]>('todoSections', []);
      setSections(savedSections.length > 0 ? savedSections : getDefaultSections(t));
    };
    const handleFoldersFromSync = async () => {
      const savedFolders = await getSetting<Folder[] | null>('todoFolders', null);
      if (savedFolders) {
        setFolders(savedFolders.map((f: Folder) => ({ ...f, createdAt: new Date(f.createdAt) })));
      }
    };

    // Expose the flag via a ref on the window for the save effect to read
    (window as any).__todaySyncFlag = { isFromSync: false };
    const origHandleTasksFromSync = handleTasksFromSync;
    const wrappedHandleTasksFromSync = async () => {
      (window as any).__todaySyncFlag.isFromSync = true;
      await origHandleTasksFromSync();
    };

    window.addEventListener('tasksRestored', wrappedHandleTasksFromSync);
    window.addEventListener('sectionsRestored', handleSectionsFromSync);
    window.addEventListener('foldersRestored', handleFoldersFromSync);
    return () => {
      window.removeEventListener('tasksRestored', wrappedHandleTasksFromSync);
      window.removeEventListener('sectionsRestored', handleSectionsFromSync);
      window.removeEventListener('foldersRestored', handleFoldersFromSync);
    };
  }, []);

  // Debounced save — reduced to 300ms so IndexedDB cache stays fresh for sync
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    // Don't save until settings are loaded AND initial data load is complete
    // This prevents pushing empty state to storage (and subsequently to Firebase) on fresh login
    if (!settingsLoaded || !itemsLoaded) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      return;
    }

    // If this update came from a sync restore, skip dispatching tasksUpdated
    // to prevent re-uploading to Firebase (sync loop)
    const syncFlag = (window as any).__todaySyncFlag;
    if (syncFlag?.isFromSync) {
      syncFlag.isFromSync = false;
      // Still mark as loaded if items came from sync
      if (items.length > 0) initialLoadDoneRef.current = true;
      return;
    }
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTodoItems(itemsRef.current).then(({ persisted }) => {
        if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
      });
    }, 300);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [items, settingsLoaded, itemsLoaded]);

  // Settings persistence
  useEffect(() => { if (settingsLoaded) { setSetting('todoFolders', folders); window.dispatchEvent(new Event('foldersUpdated')); } }, [folders, settingsLoaded]);
  useEffect(() => {
    if (settingsLoaded) {
      setSetting('todoSections', sections);
      window.dispatchEvent(new Event('sectionsUpdated'));
    }
  }, [sections, settingsLoaded]);

  useEffect(() => { if (settingsLoaded) setSetting('todoShowCompleted', showCompleted); }, [showCompleted, settingsLoaded]);
  useEffect(() => { 
    if (!settingsLoaded) return;
    setSetting('todoDateFilter', dateFilter); 
    setSetting('todoPriorityFilter', priorityFilter);
    setSetting('todoStatusFilter', statusFilter);
    setSetting('todoTagFilter', tagFilter);
  }, [dateFilter, priorityFilter, statusFilter, tagFilter, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) { setSetting('todoViewMode', viewMode); logActivity('view_mode_change', `View mode: ${viewMode}`); } }, [viewMode, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) setSetting('todoHideDetailsOptions', hideDetailsOptions); }, [hideDetailsOptions, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) { setSetting('todoSortBy', sortBy); logActivity('sort_change', `Sort by: ${sortBy}`); } }, [sortBy, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) { setSetting('todoSmartList', smartList); logActivity('smart_list_change', `Smart list: ${smartList}`); } }, [smartList, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) setSetting('todoSelectedFolder', selectedFolderId || 'null'); }, [selectedFolderId, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) setSetting('todoDefaultSectionId', defaultSectionId || ''); }, [defaultSectionId, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) setSetting('todoTaskAddPosition', taskAddPosition); }, [taskAddPosition, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) setSetting('todoShowStatusBadge', showStatusBadge); }, [showStatusBadge, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) { setSetting('todoCompactMode', compactMode); logActivity('compact_mode_toggle', `Compact mode: ${compactMode}`); } }, [compactMode, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) { setSetting('todoGroupByOption', groupByOption); logActivity('group_by_change', `Group by: ${groupByOption}`); } }, [groupByOption, settingsLoaded]);

  // Collapsed sections persistence
  useEffect(() => {
    const loadCollapsedSections = async () => {
      const saved = await getSetting<string[]>('todoCollapsedSections', []);
      if (saved && saved.length > 0) setCollapsedViewSections(new Set(saved));
      setCollapsedSectionsLoaded(true);
    };
    loadCollapsedSections();
  }, []);
  useEffect(() => {
    if (collapsedSectionsLoaded) setSetting('todoCollapsedSections', Array.from(collapsedViewSections));
  }, [collapsedViewSections, collapsedSectionsLoaded]);

   

  // Web Worker for heavy filtering/sorting
  const worker = useTaskWorker();
  const [workerResult, setWorkerResult] = useState<FilterSortResult | null>(null);
  const workerPayloadRef = useRef<string>('');

  // Offload filtering + sorting to Web Worker
  useEffect(() => {
    const payload = {
      items,
      smartList,
      selectedFolderId,
      priorityFilter,
      statusFilter,
      dateFilter,
      tagFilter,
      sortBy,
      searchQuery: deferredSearch,
      showCompleted: true,
    };

    // Skip if payload hasn't changed
    const cacheVer = getTasksCacheVersion();
    const key = `${smartList}|${selectedFolderId}|${priorityFilter}|${statusFilter}|${dateFilter}|${tagFilter.join(',')}|${sortBy}|${deferredSearch}|${items.length}|${cacheVer}`;
    if (key === workerPayloadRef.current && workerResult) return;
    workerPayloadRef.current = key;

    if (worker.isAvailable) {
      worker.filterSort(payload).then(result => {
        if (result) setWorkerResult(result);
      });
    }
  }, [items, smartList, selectedFolderId, priorityFilter, statusFilter, dateFilter, tagFilter, sortBy, deferredSearch]);

  // Main-thread fallback (used when worker hasn't returned yet or is unavailable)
  const processedItemsFallback = useMemo(() => {
    // If worker result is available, skip main-thread computation
    if (workerResult && worker.isAvailable) return null;

    let filtered = items.filter(item => {
      if (smartList !== 'all') {
        const smartListFilter = getSmartListFilter(smartList);
        if (!smartListFilter(item)) return false;
      }
      const folderMatch = selectedFolderId ? item.folderId === selectedFolderId : true;
      const priorityMatch = priorityFilter === 'all' ? true : item.priority === priorityFilter;
      let statusMatch = true;
      if (statusFilter === 'completed') statusMatch = item.completed;
      else if (statusFilter === 'uncompleted') statusMatch = !item.completed;
      else if (statusFilter === 'not_started') statusMatch = item.status === 'not_started' || !item.status;
      else if (statusFilter === 'in_progress') statusMatch = item.status === 'in_progress';
      else if (statusFilter === 'almost_done') statusMatch = item.status === 'almost_done';
      let dateMatch = true;
      if (dateFilter !== 'all') {
        const today = startOfDay(new Date());
        const itemDate = item.dueDate ? new Date(item.dueDate) : null;
        switch (dateFilter) {
          case 'today': dateMatch = itemDate ? isToday(itemDate) : false; break;
          case 'tomorrow': dateMatch = itemDate ? isTomorrow(itemDate) : false; break;
          case 'this-week': dateMatch = itemDate ? isThisWeek(itemDate) : false; break;
          case 'overdue': dateMatch = itemDate ? isBefore(itemDate, today) && !item.completed : false; break;
          case 'has-date': dateMatch = !!itemDate; break;
          case 'no-date': dateMatch = !itemDate; break;
        }
      }
      let tagMatch = true;
      if (tagFilter.length > 0) {
        const itemTagIds = item.tagIds || [];
        tagMatch = tagFilter.some(tag => itemTagIds.includes(tag));
      }
      return folderMatch && priorityMatch && statusMatch && dateMatch && tagMatch;
    });

    filtered = [...filtered].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      switch (sortBy) {
        case 'date':
          return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
        case 'priority':
          const po: Record<string, number> = { high: 0, medium: 1, low: 2, undefined: 3 };
          return (po[a.priority || 'undefined'] || 3) - (po[b.priority || 'undefined'] || 3);
        case 'name': return a.text.localeCompare(b.text);
        case 'created': return parseInt(b.id) - parseInt(a.id);
        default: return 0;
      }
    });
    return filtered;
  }, [workerResult, worker.isAvailable, items, selectedFolderId, priorityFilter, statusFilter, dateFilter, tagFilter, smartList, sortBy]);

  // Use worker result when available, fallback otherwise
  const processedItems = useMemo(() => {
    if (workerResult && worker.isAvailable) {
      // Worker returns IDs-only results, but we need to map back to full items
      // Worker returns MinimalTask objects — match by id to get full TodoItem references
      const workerIds = new Set([...workerResult.uncompleted, ...workerResult.completed].map((t: any) => t.id));
      // Preserve original item references, maintain worker ordering
      const idOrder = new Map<string, number>();
      [...workerResult.uncompleted, ...workerResult.completed].forEach((t: any, i: number) => idOrder.set(t.id, i));
      return items.filter(i => workerIds.has(i.id)).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
    }
    return processedItemsFallback || [];
  }, [workerResult, worker.isAvailable, items, processedItemsFallback]);

  const searchFilteredItems = useMemo(() => {
    // If worker already handled search, skip client-side search
    if (workerResult && worker.isAvailable && deferredSearch.trim()) return processedItems;
    if (!deferredSearch.trim()) return processedItems;
    const search = deferredSearch.toLowerCase();
    return processedItems.filter(item => 
      item.text.toLowerCase().includes(search) || item.description?.toLowerCase().includes(search)
    );
  }, [processedItems, deferredSearch, workerResult, worker.isAvailable]);

  const uncompletedItems = useMemo(() => searchFilteredItems.filter(item => !item.completed), [searchFilteredItems]);
  const completedItems = useMemo(() => searchFilteredItems.filter(item => item.completed), [searchFilteredItems]);

  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.order - b.order), [sections]);

  const toggleSubtasks = useCallback((taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  }, []);

  const toggleViewSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedViewSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) newSet.delete(sectionId);
      else newSet.add(sectionId);
      return newSet;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedFolderId(null);
    setDateFilter('all');
    setPriorityFilter('all');
    setStatusFilter('all');
    setTagFilter([]);
    setSmartList('all');
  }, []);

  return {
    // Translation & settings
    t, tasksSettings, getPriorityColor, getPriorityName, requireFeature, isPro, allGlobalTags,
    // Core data
    items, setItems, folders, setFolders, sections, setSections,
    // UI state
    selectedFolderId, setSelectedFolderId, isInputOpen, setIsInputOpen,
    inputSectionId, setInputSectionId, selectedTask, setSelectedTask,
    selectedImage, setSelectedImage, isSelectionMode, setIsSelectionMode,
    selectedTaskIds, setSelectedTaskIds, isCompletedOpen, setIsCompletedOpen,
    showCompleted, setShowCompleted,
    // Filters
    dateFilter, setDateFilter, priorityFilter, setPriorityFilter,
    statusFilter, setStatusFilter, tagFilter, setTagFilter,
    smartList, setSmartList,
    // View
    viewMode, setViewMode, sortBy, setSortBy,
    hideDetailsOptions, setHideDetailsOptions,
    compactMode, setCompactMode, groupByOption, setGroupByOption,
    viewModeSearch, setViewModeSearch, dropdownView, setDropdownView,
    // Sheet states
    isFilterSheetOpen, setIsFilterSheetOpen,
    isDuplicateSheetOpen, setIsDuplicateSheetOpen,
    isFolderManageOpen, setIsFolderManageOpen,
    isMoveToFolderOpen, setIsMoveToFolderOpen,
    isSelectActionsOpen, setIsSelectActionsOpen,
    isPrioritySheetOpen, setIsPrioritySheetOpen,
    isBatchTaskOpen, setIsBatchTaskOpen,
    isSectionEditOpen, setIsSectionEditOpen,
    isSectionMoveOpen, setIsSectionMoveOpen,
    editingSection, setEditingSection,
    selectedSubtask, setSelectedSubtask,
    isLocationMapOpen, setIsLocationMapOpen,
    isBulkDateSheetOpen, setIsBulkDateSheetOpen,
    isBulkReminderSheetOpen, setIsBulkReminderSheetOpen,
    isBulkRepeatSheetOpen, setIsBulkRepeatSheetOpen,
    isBulkSectionMoveOpen, setIsBulkSectionMoveOpen,
    isBulkStatusOpen, setIsBulkStatusOpen,
    isTaskOptionsOpen, setIsTaskOptionsOpen,
    isAutoScheduleOpen, setIsAutoScheduleOpen,
    // Task options
    defaultSectionId, setDefaultSectionId,
    taskAddPosition, setTaskAddPosition,
    showStatusBadge, setShowStatusBadge,
    groupBy, setGroupBy, optionsSortBy, setOptionsSortBy,
    // Misc
    orderVersion, setOrderVersion,
    deleteConfirmItem, setDeleteConfirmItem,
    customSmartViews, setCustomSmartViews,
    activeCustomViewId, setActiveCustomViewId,
    isSaveSmartViewOpen, setIsSaveSmartViewOpen,
    swipeMoveTaskId, setSwipeMoveTaskId,
    swipeDateTaskId, setSwipeDateTaskId,
    pendingCompleteId, setPendingCompleteId,
    pendingCompleteTimer,
    // Collapsed
    collapsedViewSections, setCollapsedViewSections,
    // Expanded
    expandedTasks, toggleSubtasks,
    // Streaks
    showStreakChallenge, closeStreakChallenge,
    streakData, streakWeekData,
    // Smart lists
    smartListData,
    // Computed
    processedItems, searchFilteredItems, uncompletedItems, completedItems,
    sortedSections, toggleViewSectionCollapse, handleClearFilters,
    // Settings loaded flag
    settingsLoaded,
  };
};
