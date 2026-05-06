import { useState, useEffect, useMemo, useRef } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { useSubscription, FREE_LIMITS } from '@/contexts/SubscriptionContext';
import { cn } from '@/lib/utils';
import { Note, NoteType, Folder } from '@/types/note';
import { NoteCard } from '@/components/NoteCard';
import { NoteEditor } from '@/components/NoteEditor';
import { BottomNavigation } from '@/components/BottomNavigation';


import { FolderManager } from '@/components/FolderManager';
import { MoveToFolderSheet } from '@/components/MoveToFolderSheet';
import { NoteTemplateSheet } from '@/components/NoteTemplateSheet';


import { MasonryNotesGrid } from '@/components/MasonryNotesGrid';
import { VirtualizedNotesGrid, VirtualizedNotesList, shouldVirtualizeNotes } from '@/components/VirtualizedNotesGrid';
import { useNoteTypeVisibility } from '@/hooks/useNoteTypeVisibility';
import { getVisibleFeatures } from '@/utils/noteTypeVisibility';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, StickyNote, FileText, FileEdit, Pen, ListTodo, Bell, Clock, Repeat, FileCode, GitBranch, Sun, Moon, Receipt, Star, ArrowUpDown, MoreVertical, FolderPlus, CheckSquare, Trash2, Archive, X, RotateCcw, Copy, Folder as FolderIcon, Eye, EyeOff, Mic, Type, LayoutTemplate, Crown, PenTool } from 'lucide-react';

import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '@/components/AppLogo';
import { NotificationCenter } from '@/components/NotificationCenter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { triggerHaptic } from '@/utils/haptics';
import { prefetchRoute } from '@/utils/routePrefetch';

import { saveNoteToDBSingle, deleteNoteFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { getAllSettings, getSetting, setSetting } from '@/utils/settingsStorage';
import { logActivity } from '@/utils/activityLogger';
import { useNotes, NoteMeta } from '@/contexts/NotesContext';
import { NoteTypeVisibilitySheet } from '@/components/NoteTypeVisibilitySheet';
import { loadDeletions, trackDeletion } from '@/utils/deletionTracker';
import { uploadCategory } from '@/utils/googleDriveSync';

const Index = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  
  
  // Use global notes context - no more local loading!
  const { notes, setNotes, notesMeta, notesMap, counts, isLoading: notesLoading } = useNotes();
  
  // Note type visibility
  const { requireFeature, isPro, openPaywall, canCreateWithinSoftLimit, softRequireCreate } = useSubscription();
  const { visibleTypes, isTypeVisible, filterNotesByVisibility } = useNoteTypeVisibility();
  const [showNoteTypeVisibilitySheet, setShowNoteTypeVisibilitySheet] = useState(false);
  const [showNoteTemplates, setShowNoteTemplates] = useState(true);
  
  // Load feature visibility
  useEffect(() => {
    const loadFeatureVisibility = async () => {
      const features = await getVisibleFeatures();
      setShowNoteTemplates(features.includes('noteTemplates'));
    };
    loadFeatureVisibility();
    
    const handleChange = async () => {
      const features = await getVisibleFeatures();
      setShowNoteTemplates(features.includes('noteTemplates'));
    };
    window.addEventListener('featureVisibilityChanged', handleChange);
    return () => window.removeEventListener('featureVisibilityChanged', handleChange);
  }, []);
  
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullSearch, setIsFullSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<NoteType>('regular');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'type'>('date');
  const [filterByType, setFilterByType] = useState<NoteType | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'notes' | 'trash' | 'archive'>('notes');
  const [isGridView, setIsGridView] = useState(false);
  const [showBulkFolderSheet, setShowBulkFolderSheet] = useState(false);
  const [fullSearchResults, setFullSearchResults] = useState<string[]>([]);
  const [movingNoteId, setMovingNoteId] = useState<string | null>(null);
  const [isNoteTemplateOpen, setIsNoteTemplateOpen] = useState(false);
  
  
  // Note type selector dropdown state (for persistent notification integration)
  const [noteTypeSelectorOpen, setNoteTypeSelectorOpen] = useState(false);

  // Load all preferences from IndexedDB
  useEffect(() => {
    const loadPreferences = async () => {
      const [gridViewPref, sortByPref, filterByTypePref, viewModePref] = await Promise.all([
        getSetting<boolean>('notesGridView', false),
        getSetting<'date' | 'title' | 'type'>('notesSortBy', 'date'),
        getSetting<NoteType | null>('notesFilterByType', null),
        getSetting<'notes' | 'trash' | 'archive'>('notesViewMode', 'notes'),
      ]);
      setIsGridView(gridViewPref);
      setSortBy(sortByPref);
      setFilterByType(filterByTypePref);
      setViewMode(viewModePref);
      
      // Log app open activity
      logActivity('app_open', 'User opened Notes home page');
    };
    loadPreferences();
  }, []);

  // Toggle grid view and save preference
  const handleToggleGridView = async () => {
    const newValue = !isGridView;
    setIsGridView(newValue);
    await setSetting('notesGridView', newValue);
    logActivity('grid_view_toggle', `Switched to ${newValue ? 'grid' : 'list'} view`);
  };
  
  // Persist sort/filter/view mode changes
  useEffect(() => { setSetting('notesSortBy', sortBy); }, [sortBy]);
  useEffect(() => { setSetting('notesFilterByType', filterByType); }, [filterByType]);
  useEffect(() => { setSetting('notesViewMode', viewMode); }, [viewMode]);

   // Load folders on mount
  useEffect(() => {
    const loadFolders = async () => {
      const savedFolders = await getSetting<Folder[] | null>('folders', null);
      console.log('[Notes] Loaded folders from settings:', savedFolders?.length ?? 0, savedFolders?.map((f: any) => f.name));
      if (savedFolders && savedFolders.length > 0) {
        setFolders(savedFolders.map((f: Folder) => ({
          ...f,
          createdAt: new Date(f.createdAt),
        })));
        foldersLoadedRef.current = true;
      }
    };
    
    loadFolders();
    
    // Listen for folder updates from NoteEditor
    const handleFoldersUpdated = () => loadFolders();
    window.addEventListener('foldersUpdated', handleFoldersUpdated);
    
    return () => {
      window.removeEventListener('foldersUpdated', handleFoldersUpdated);
    };
  }, []);

  // Notes are now loaded from NotesContext - no local loading needed!

  const foldersLoadedRef = useRef(false);
  useEffect(() => {
    // Don't persist until initial load is complete to avoid wiping saved folders
    if (!foldersLoadedRef.current) {
      if (folders.length > 0) foldersLoadedRef.current = true;
      return;
    }
    setSetting('folders', folders);
  }, [folders]);

  // Upcoming reminders loading removed

  // Auto-delete trash items older than 30 days
  useEffect(() => {
    const cleanupOldTrash = () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      setNotes(prev => {
        const filtered = prev.filter(note => {
          if (note.isDeleted && note.deletedAt) {
            const deletedDate = new Date(note.deletedAt);
            return deletedDate > thirtyDaysAgo;
          }
          return true;
        });
        if (filtered.length !== prev.length) {
          console.log(`Auto-deleted ${prev.length - filtered.length} old trash items`);
        }
        return filtered;
      });
    };
    
    // Run on mount and every hour
    cleanupOldTrash();
    const interval = setInterval(cleanupOldTrash, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveNote = (note: Note): boolean => {
    const isExisting = notes.some((n) => n.id === note.id);
    if (!isExisting && !isPro && !softRequireCreate('notes', notes.length)) {
      return false;
    }

    setNotes((prev) => {
      const existing = prev.find((n) => n.id === note.id);
      if (existing) {
        return prev.map((n) => (n.id === note.id ? note : n));
      }
      const noteWithFolder = { ...note, folderId: note.folderId || note.type };
      return [noteWithFolder, ...prev];
    });
    return true;
  };

  const handleDeleteNote = (id: string) => {
    // Move to trash instead of permanent delete
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => 
        n.id === id 
          ? { ...n, isDeleted: true, deletedAt: new Date() } 
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    logActivity('note_delete', 'Note moved to trash', { entityId: id, entityType: 'note' });
  };

  const handleArchiveNote = (id: string) => {
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => 
        n.id === id 
          ? { ...n, isArchived: true, archivedAt: new Date() } 
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    logActivity('note_archive', 'Note archived', { entityId: id, entityType: 'note' });
  };

  const handleRestoreFromTrash = (id: string) => {
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => 
        n.id === id 
          ? { ...n, isDeleted: false, deletedAt: undefined } 
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    logActivity('note_restore', 'Note restored from trash', { entityId: id, entityType: 'note' });
  };

  const handleRestoreFromArchive = (id: string) => {
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => 
        n.id === id 
          ? { ...n, isArchived: false, archivedAt: undefined } 
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    logActivity('note_restore', 'Note restored from archive', { entityId: id, entityType: 'note' });
  };

  const handlePermanentDelete = async (id: string) => {
    // Delete from IndexedDB first
    await deleteNoteFromDB(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    logActivity('note_delete', 'Note permanently deleted', { entityId: id, entityType: 'note' });
  };

  const handleEmptyTrash = () => {
    setNotes((prev) => {
      const updatedNotes = prev.filter((n) => !n.isDeleted);
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    logActivity('note_delete', 'Trash emptied');
  };

  const handleDuplicateNote = (noteId: string) => {
    const noteToDuplicate = notes.find(n => n.id === noteId);
    if (!noteToDuplicate) return;
    
    const duplicatedNote: Note = {
      ...noteToDuplicate,
      id: genId(),
      title: `${noteToDuplicate.title || 'Untitled'} (Copy)`,
      isPinned: false,
      pinnedOrder: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setNotes(prev => [duplicatedNote, ...prev]);
  };

  const handleTogglePin = (noteId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!requireFeature('pin_feature')) return;
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            isPinned: !n.isPinned,
            pinnedOrder: !n.isPinned ? Date.now() : undefined,
          };
        }
        return n;
      });
      // Save to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
  };

  const handleToggleFavorite = (noteId: string) => {
    setNotes((prev) => {
      const updatedNotes = prev.map((n) => {
        if (n.id === noteId) {
          return { ...n, isFavorite: !n.isFavorite };
        }
        return n;
      });
      // Save to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
  };

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', noteId);
    setDraggedNoteId(noteId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
  };

  const handleDrop = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/html');

    if (draggedId === targetNoteId) return;

    const draggedNote = notes.find(n => n.id === draggedId);
    const targetNote = notes.find(n => n.id === targetNoteId);

    if (!draggedNote || !targetNote) return;
    if (draggedNote.isPinned !== targetNote.isPinned) return;

    setNotes((prev) => {
      const updatedNotes = [...prev];
      const draggedIndex = updatedNotes.findIndex(n => n.id === draggedId);
      const targetIndex = updatedNotes.findIndex(n => n.id === targetNoteId);

      const [removed] = updatedNotes.splice(draggedIndex, 1);
      updatedNotes.splice(targetIndex, 0, removed);

      if (draggedNote.isPinned) {
        updatedNotes.forEach((note, idx) => {
          if (note.isPinned) {
            note.pinnedOrder = idx;
          }
        });
      }

      // Save to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
  };

  const handleCreateNote = (type: NoteType) => {
    if (!canCreateWithinSoftLimit('notes', notes.length)) {
      softRequireCreate('notes', notes.length);
      return;
    }
    setDefaultType(type);
    setSelectedNote(null);
    setIsEditorOpen(true);
  };

  // Listen for persistent notification to open specific note type directly
  useEffect(() => {
    const handleOpenSpecificNoteType = (event: CustomEvent<{ noteType: NoteType }>) => {
      const { noteType } = event.detail;
      console.log('[Index] Opening specific note type from notification:', noteType);
      handleCreateNote(noteType);
    };
    window.addEventListener('openSpecificNoteType', handleOpenSpecificNoteType as EventListener);
    
    return () => {
      window.removeEventListener('openSpecificNoteType', handleOpenSpecificNoteType as EventListener);
    };
  }, []);

  const handleEditNote = async (note: Note) => {
    if (note.type === 'sketch' && !requireFeature('sketch')) return;
    setSelectedNote(note);
    setIsEditorOpen(true);
  };

  const persistFolders = async (updatedFolders: Folder[]) => {
    await setSetting('folders', updatedFolders);
    window.dispatchEvent(new Event('foldersUpdated'));
  };

  const handleCreateFolder = (name: string, color: string) => {
    // Free users limited to 3 folders
    if (!isPro && folders.length >= FREE_LIMITS.maxNoteFolders) {
      requireFeature('extra_folders');
      return;
    }
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      isDefault: false,
      createdAt: new Date(),
      color,
    };
    setFolders(prev => {
      const updated = [...prev, newFolder];
      persistFolders(updated);
      return updated;
    });
  };

  const handleApplyNoteTemplate = (data: {
    folder: Omit<Folder, 'id' | 'createdAt'>;
    notes: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>[];
  }) => {
    // Create the folder
    const folderId = `folder-${Date.now()}`;
    const newFolder: Folder = {
      ...data.folder,
      id: folderId,
      createdAt: new Date(),
    };
    setFolders(prev => {
      const updated = [...prev, newFolder];
      persistFolders(updated);
      return updated;
    });

    // Create all notes in that folder
    const now = new Date();
    const newNotes: Note[] = data.notes.map((noteDef, i) => ({
      ...noteDef,
      id: `note-${Date.now()}-${i}`,
      folderId,
      voiceRecordings: noteDef.voiceRecordings || [],
      createdAt: new Date(now.getTime() + i),
      updatedAt: new Date(now.getTime() + i),
    } as Note));

    setNotes(prev => [...newNotes, ...prev]);
    // Persist
    saveNotesToDB([...newNotes, ...notes]);
    
    // Select the new folder
    setSelectedFolderId(folderId);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const updatedFolders = folders.filter(f => f.id !== folderId);
    setFolders(updatedFolders);
    setNotes(prev => prev.map(n => n.folderId === folderId ? { ...n, folderId: undefined } : n));

    trackDeletion(folderId, 'noteFolders');

    try {
      await persistFolders(updatedFolders);
      const currentSettings = { ...(await getAllSettings()), folders: updatedFolders };

      await Promise.allSettled([
        uploadCategory('flowist_settings.json', currentSettings),
        uploadCategory('flowist_deletions.json', loadDeletions()),
      ]);
    } catch (error) {
      console.warn('Failed to sync deleted note folder state:', error);
    }
  };

  const handleEditFolder = (folderId: string, name: string) => {
    setFolders(prev => {
      const updated = prev.map(f => f.id === folderId ? { ...f, name } : f);
      persistFolders(updated);
      return updated;
    });
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    if (!draggedNoteId) return;

    setNotes(prev => prev.map(n =>
      n.id === draggedNoteId ? { ...n, folderId: targetFolderId || undefined } : n
    ));
    setDraggedNoteId(null);
  };

  const handleHideNote = (noteId: string) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, isHidden: true } : n));
  };

  const handleBulkHideNotes = (noteIds: string[]) => {
    setNotes(prev => prev.map(n => noteIds.includes(n.id) ? { ...n, isHidden: true } : n));
  };

  const handleProtectNote = (noteId: string) => {
    // Protection is handled via NoteProtectionSheet - this just triggers the dialog
    // For now, we'll store a flag that the note needs protection UI
    console.log('Protect note:', noteId);
  };

  // PERFORMANCE OPTIMIZATION: Use memoized filtering with lightweight metadata
  // Instead of searching through massive note.content (200k+ words), we use:
  // 1. notesMeta.contentPreview (first 200 chars only) for quick search
  // 2. Full content search only when user explicitly enables it
  // 3. Lowercase search query computed once outside the filter
  const searchLower = searchQuery.toLowerCase();
  
  // Run full content search when enabled
  useEffect(() => {
    if (!isFullSearch || !searchQuery.trim()) {
      setFullSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    
    // Use setTimeout to avoid blocking UI during heavy search
    const timeoutId = setTimeout(() => {
      const results: string[] = [];
      const search = searchQuery.toLowerCase();
      
      for (const note of notes) {
        if (note.isDeleted || note.isArchived || note.isHidden) continue;
        
        // Title match
        if (note.title.toLowerCase().includes(search)) {
          results.push(note.id);
          continue;
        }
        
        // Meta description match
        if (note.metaDescription?.toLowerCase().includes(search)) {
          results.push(note.id);
          continue;
        }
        
        // Full content search (slow but thorough)
        const plainContent = note.content.replace(/<[^>]*>/g, '').toLowerCase();
        if (plainContent.includes(search)) {
          results.push(note.id);
        }
      }
      
      setFullSearchResults(results);
      setIsSearching(false);
    }, 50); // Small delay to let UI update first
    
    return () => clearTimeout(timeoutId);
  }, [isFullSearch, searchQuery, notes]);
  
  let allFilteredNotes = useMemo(() => {
    // If no search query, use the fast path - no content searching needed
    if (!searchQuery.trim()) {
      return notes.filter(note => 
        !note.isDeleted && 
        !note.isArchived &&
        !note.isHidden
      );
    }
    
    // If full search is enabled, use the pre-computed results
    if (isFullSearch) {
      return notes.filter(note => fullSearchResults.includes(note.id));
    }
    
    // Quick search: use notesMeta for lightweight content search
    // notesMeta.contentPreview is only 200 chars vs 200k+ in full content
    return notes.filter((note, idx) => {
      // Fast filters first (boolean checks are instant)
      if (note.isDeleted || note.isArchived || note.isHidden) return false;
      
      // Title search (usually short, fast)
      if (note.title.toLowerCase().includes(searchLower)) return true;
      
      // Meta description search (short, fast)
      if (note.metaDescription?.toLowerCase().includes(searchLower)) return true;
      
      // Content preview search using notesMeta (200 chars max, very fast)
      // This avoids searching through 200k+ word content
      const meta = notesMeta[idx];
      if (meta && meta.contentPreview.toLowerCase().includes(searchLower)) return true;
      
      return false;
    });
  }, [notes, notesMeta, searchLower, isFullSearch, fullSearchResults]);

  // Filter by folder
  if (selectedFolderId !== null) {
    allFilteredNotes = allFilteredNotes.filter(note => note.folderId === selectedFolderId);
  }

  // Filter favorites only
  if (showFavoritesOnly) {
    allFilteredNotes = allFilteredNotes.filter(note => note.isFavorite);
  }

  // Filter by specific note type (user selection, in addition to visibility)
  if (filterByType) {
    allFilteredNotes = allFilteredNotes.filter(note => note.type === filterByType);
  }

  // Bulk selection handlers
  const handleToggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds(prev =>
      prev.includes(noteId)
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    );
  };

  const handleBulkDelete = () => {
    setNotes(prev => {
      const updatedNotes = prev.map(n =>
        selectedNoteIds.includes(n.id)
          ? { ...n, isDeleted: true, deletedAt: new Date() }
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  const handleBulkArchive = () => {
    setNotes(prev => {
      const updatedNotes = prev.map(n =>
        selectedNoteIds.includes(n.id)
          ? { ...n, isArchived: true, archivedAt: new Date() }
          : n
      );
      // Persist to IndexedDB
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  // New bulk operations
  const handleBulkFavorite = () => {
    setNotes(prev => {
      const updatedNotes = prev.map(n =>
        selectedNoteIds.includes(n.id)
          ? { ...n, isFavorite: true }
          : n
      );
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  const handleBulkDuplicate = () => {
    setNotes(prev => {
      const duplicates = selectedNoteIds
        .map(id => prev.find(n => n.id === id))
        .filter(Boolean)
        .map(note => ({
          ...note!,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: `${note!.title || 'Untitled'} (Copy)`,
          isPinned: false,
          pinnedOrder: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      const updatedNotes = [...duplicates, ...prev];
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  const handleBulkMoveToFolder = (folderId: string | null) => {
    setNotes(prev => {
      const updatedNotes = prev.map(n =>
        selectedNoteIds.includes(n.id)
          ? { ...n, folderId: folderId || undefined }
          : n
      );
      saveNotesToDB(updatedNotes);
      return updatedNotes;
    });
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
    setShowBulkFolderSheet(false);
  };

  // Single note move to folder (for swipe action)
  const handleMoveNoteToFolder = (noteId: string) => {
    setMovingNoteId(noteId);
  };

  const handleConfirmMoveToFolder = (folderId: string | null) => {
    if (movingNoteId) {
      setNotes(prev => {
        const updatedNotes = prev.map(n =>
          n.id === movingNoteId
            ? { ...n, folderId: folderId || undefined, updatedAt: new Date() }
            : n
        );
        const updatedNote = updatedNotes.find(n => n.id === movingNoteId);
        if (updatedNote) {
          saveNoteToDBSingle(updatedNote);
        }
        return updatedNotes;
      });
    }
    setMovingNoteId(null);
  };

  const handleSelectAll = () => {
    setSelectedNoteIds(filteredNotes.map(n => n.id));
  };

  const handleCancelSelection = () => {
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  const filteredNotes = [...allFilteredNotes].sort((a, b) => {
    // Pinned notes always first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) {
      return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
    }
    
    // Then sort by selected option
    switch (sortBy) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'type':
        return a.type.localeCompare(b.type);
      case 'date':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  const favoriteNotes = useMemo(() => filteredNotes.filter(note => note.isFavorite), [filteredNotes]);
  const regularNotes = useMemo(() => filteredNotes.filter(note => !note.isFavorite), [filteredNotes]);
  const hasAnyVisibleNotes = favoriteNotes.length > 0 || regularNotes.length > 0;

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-background pb-14">
      <header 
        className="sticky top-0 bg-background z-10"
        style={{
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
          paddingTop: 'var(--safe-top, 0px)',
        }}
      >
        <div className="container mx-auto px-2 xs:px-3 sm:px-4 pt-3 pb-1.5">
          <div className="flex items-center justify-between mb-2 xs:mb-3 sm:mb-4 gap-1 xs:gap-2">
            <div className="flex items-center gap-1.5 xs:gap-2 min-w-0 flex-shrink-0">
              <AppLogo />
              <h1 className="text-base xs:text-lg sm:text-xl font-bold">Flowist</h1>
            </div>
            <div className="flex items-center gap-0.5 xs:gap-1 sm:gap-2 flex-shrink-0">
              
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (!isPro) { openPaywall('dark_mode'); return; }
                  toggleDarkMode();
                }}
                className="h-7 w-7 xs:h-8 xs:w-8 sm:h-9 sm:w-9 hover:bg-transparent active:bg-transparent touch-target"
                title={t('common.toggleDarkMode')}
                data-tour="dark-mode-toggle"
              >
                {isDarkMode ? <Sun className="h-4 w-4 xs:h-5 xs:w-5 sm:h-5 sm:w-5" /> : <Moon className="h-4 w-4 xs:h-5 xs:w-5 sm:h-5 sm:w-5" />}
              </Button>
              <NotificationCenter />
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  await triggerHaptic('light');
                  await prefetchRoute('/todo/today');
                  navigate('/todo/today');
                }}
                className="h-7 w-7 xs:h-8 xs:w-8 sm:h-9 sm:w-9 hover:bg-transparent active:bg-transparent touch-target"
                title={t('common.switchToTodo')}
                data-tour="switch-to-todo"
              >
                <ListTodo className="h-4 w-4 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              </Button>
            </div>
          </div>

          <div className="flex gap-1.5 xs:gap-2" data-tour="search-bar">
            <div className="relative flex-1">
              {isSearching ? (
                <div className="absolute left-2.5 xs:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 xs:h-4 xs:w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="absolute left-2.5 xs:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 xs:h-4 xs:w-4 text-muted-foreground" />
              )}
              <Input
                placeholder={isFullSearch ? t('notes.fullSearchPlaceholder', 'Deep search...') : t('notes.searchNotes')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 xs:pl-10 pr-20 bg-secondary border-none text-xs xs:text-sm sm:text-base h-9 xs:h-10"
              />
              {/* Full Search Toggle */}
              <button
                type="button"
                onClick={() => setIsFullSearch(!isFullSearch)}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 text-[10px] xs:text-xs px-1.5 xs:px-2 py-0.5 rounded-full font-medium transition-colors",
                  isFullSearch 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                title={isFullSearch ? t('notes.quickSearch', 'Switch to quick search') : t('notes.deepSearch', 'Search full content')}
              >
                {isFullSearch ? t('notes.deep', 'Deep') : t('notes.quick', 'Quick')}
              </button>
            </div>
          </div>
        </div>
        <div className="h-[1px] bg-border" />
      </header>

      <main className="container mx-auto px-2 xs:px-3 sm:px-4 py-2 xs:py-3">
        

        {/* Upcoming Reminders Section - hidden from home UI, functionality preserved */}

        <FolderManager
          data-tour="folders-section"
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onEditFolder={handleEditFolder}
          onDropOnFolder={handleDropOnFolder}
          notes={notes}
          onAddNotesToFolder={(noteIds, folderId) => {
            setNotes(prev => prev.map(note =>
              noteIds.includes(note.id) ? { ...note, folderId } : note
            ));
          }}
          onRemoveNoteFromFolder={(noteId) => {
            setNotes(prev => prev.map(note =>
              note.id === noteId ? { ...note, folderId: undefined } : note
            ));
          }}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={() => setShowFavoritesOnly(!showFavoritesOnly)}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filterByType={filterByType}
          onFilterByTypeChange={setFilterByType}
          onEnterSelectionMode={() => setIsSelectionMode(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          trashedNotesCount={notes.filter(n => n.isDeleted).length}
          archivedNotesCount={notes.filter(n => n.isArchived && !n.isDeleted).length}
          isGridView={isGridView}
          onToggleGridView={handleToggleGridView}
        />

        {/* Bulk Selection Mode Bar */}
        {isSelectionMode && (
          <div className="sticky top-[120px] z-10 bg-primary text-primary-foreground p-3 rounded-lg mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCancelSelection}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t('common.cancel')}
                </Button>
                <span className="text-sm font-medium">
                  {selectedNoteIds.length} {t('actions.selectedCount')}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSelectAll}
              >
                {t('common.selectAll')}
              </Button>
            </div>
            
            {/* Action buttons row */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {/* Move to Folder */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={selectedNoteIds.length === 0}
                    className="shrink-0"
                  >
                    <FolderIcon className="h-4 w-4 mr-1" />
                    Move
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => handleBulkMoveToFolder(null)}>
                    <FolderIcon className="h-4 w-4 mr-2" />
                    All Notes (No Folder)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {folders.map((folder) => (
                    <DropdownMenuItem 
                      key={folder.id} 
                      onClick={() => handleBulkMoveToFolder(folder.id)}
                    >
                      <div 
                        className="h-3 w-3 rounded-full mr-2" 
                        style={{ backgroundColor: folder.color }} 
                      />
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Favorite */}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkFavorite}
                disabled={selectedNoteIds.length === 0}
                className="shrink-0"
              >
                <Star className="h-4 w-4 mr-1" />
                Favorite
              </Button>
              
              {/* Duplicate */}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkDuplicate}
                disabled={selectedNoteIds.length === 0}
                className="shrink-0"
              >
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
              </Button>
              
              {/* Archive */}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkArchive}
                disabled={selectedNoteIds.length === 0}
                className="shrink-0"
              >
                <Archive className="h-4 w-4 mr-1" />
                {t('notes.archive')}
              </Button>
              
              {/* Delete */}
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={selectedNoteIds.length === 0}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('common.delete')}
              </Button>
            </div>
          </div>
        )}

        {/* Trash View */}
        {viewMode === 'trash' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                {t('notes.trash')}
              </h2>
              {notes.filter(n => n.isDeleted).length > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleEmptyTrash}
                >
                  {t('notes.emptyTrash')}
                </Button>
              )}
            </div>
            {notes.filter(n => n.isDeleted).length === 0 ? (
              <div className="text-center py-20">
                <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-1">{t('notes.trashEmpty')}</h3>
                <p className="text-muted-foreground text-sm">{t('notes.trashEmptyDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.filter(n => n.isDeleted).map((note) => (
                  <Card key={note.id} className="p-4 cv-auto-note">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{note.title || t('notes.untitled')}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {note.content.replace(/<[^>]*>/g, '').trim() || t('notes.noContent')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('notes.deleted')}: {note.deletedAt ? new Date(note.deletedAt).toLocaleDateString() : t('notes.unknown')}
                          {note.deletedAt && (
                            <span className="ml-2 text-destructive">
                              • {t('notes.autoDeletesIn', { days: 30 - differenceInDays(new Date(), new Date(note.deletedAt)) })}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestoreFromTrash(note.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {t('notes.restore')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handlePermanentDelete(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Archive View */}
        {viewMode === 'archive' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              {t('notes.archivedNotes')}
            </h2>
            {notes.filter(n => n.isArchived && !n.isDeleted).length === 0 ? (
              <div className="text-center py-20">
                <Archive className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-1">{t('notes.noArchivedNotes')}</h3>
                <p className="text-muted-foreground text-sm">{t('notes.noArchivedNotesDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.filter(n => n.isArchived && !n.isDeleted).map((note) => (
                  <Card key={note.id} className="p-4 cv-auto-note">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{note.title || t('notes.untitled')}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {note.content.replace(/<[^>]*>/g, '').trim() || t('notes.noContent')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('notes.archived')}: {note.archivedAt ? new Date(note.archivedAt).toLocaleDateString() : t('notes.unknown')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestoreFromArchive(note.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {t('notes.restore')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes View (Regular) */}
        {viewMode === 'notes' && (
          <>
            {/* Grid View (Masonry) */}
            {isGridView ? (
              <>
                {/* Favorites in Grid */}
                {favoriteNotes.length > 0 && (
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                      <Star className="h-5 w-5 text-warning fill-warning" />
                      {t('notes.favorites')}
                    </h2>
                    {shouldVirtualizeNotes(favoriteNotes.length) ? (
                      <VirtualizedNotesGrid
                        notes={favoriteNotes}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                        onArchive={handleArchiveNote}
                        isSelectionMode={isSelectionMode}
                        selectedNoteIds={selectedNoteIds}
                        onToggleSelection={handleToggleNoteSelection}
                        className="h-[300px]"
                      />
                    ) : (
                      <MasonryNotesGrid
                        notes={favoriteNotes}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                        onArchive={handleArchiveNote}
                        isSelectionMode={isSelectionMode}
                        selectedNoteIds={selectedNoteIds}
                        onToggleSelection={handleToggleNoteSelection}
                      />
                    )}
                  </div>
                )}
                
                {/* All Notes in Grid */}
                {!hasAnyVisibleNotes ? (
                  <div className="text-center py-20">
                    <h2 className="text-xl font-semibold mb-2">{t('notes.noNotes')}</h2>
                    <p className="text-muted-foreground text-sm">
                      {searchQuery ? t('common.noResults') : t('notes.tapToCreate')}
                    </p>
                  </div>
                ) : regularNotes.length > 0 && (
                  <div>
                    {favoriteNotes.length > 0 && (
                      <h2 className="text-lg font-semibold text-muted-foreground mb-3">{t('notes.allNotes')}</h2>
                    )}
                    {shouldVirtualizeNotes(regularNotes.length) ? (
                      <VirtualizedNotesGrid
                        notes={regularNotes}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                        onArchive={handleArchiveNote}
                        isSelectionMode={isSelectionMode}
                        selectedNoteIds={selectedNoteIds}
                        onToggleSelection={handleToggleNoteSelection}
                        className="h-[calc(100vh-350px)]"
                      />
                    ) : (
                      <MasonryNotesGrid
                        notes={regularNotes}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                        onArchive={handleArchiveNote}
                        isSelectionMode={isSelectionMode}
                        selectedNoteIds={selectedNoteIds}
                        onToggleSelection={handleToggleNoteSelection}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* List View (Default) */}
                {/* Favorites Section */}
                {favoriteNotes.length > 0 && (
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                      <Star className="h-5 w-5 text-warning fill-warning" />
                      {t('notes.favorites')}
                    </h2>
                      <div className="space-y-3">
                        {favoriteNotes.map((note) => (
                        <div key={note.id} className="cv-auto-note"><NoteCard
                          note={note}
                          onEdit={handleEditNote}
                          onDelete={handleDeleteNote}
                          onArchive={handleArchiveNote}
                          onTogglePin={handleTogglePin}
                          onToggleFavorite={handleToggleFavorite}
                          onMoveToFolder={handleMoveNoteToFolder}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragEnd={handleDragEnd}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedNoteIds.includes(note.id)}
                          onToggleSelection={handleToggleNoteSelection}
                          onDuplicate={handleDuplicateNote}
                        /></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Notes */}
                {!hasAnyVisibleNotes ? (
                  <div className="text-center py-20">
                    <h2 className="text-xl font-semibold mb-2">{t('notes.noNotes')}</h2>
                    <p className="text-muted-foreground text-sm">
                      {searchQuery ? t('common.noResults') : t('notes.tapToCreate')}
                    </p>
                  </div>
                ) : regularNotes.length > 0 && (
                  <>
                    {favoriteNotes.length > 0 && (
                      <h2 className="text-lg font-semibold text-muted-foreground mb-3">{t('notes.allNotes')}</h2>
                    )}
                    {shouldVirtualizeNotes(regularNotes.length) ? (
                      <VirtualizedNotesList
                        notes={regularNotes}
                        onEdit={handleEditNote}
                        onDelete={handleDeleteNote}
                        onArchive={handleArchiveNote}
                        isSelectionMode={isSelectionMode}
                        selectedNoteIds={selectedNoteIds}
                        onToggleSelection={handleToggleNoteSelection}
                        className="h-[calc(100vh-350px)]"
                      />
                    ) : (
                      <div className="space-y-3">
                        {regularNotes.map((note) => (
                          <div key={note.id} className="cv-auto-note"><NoteCard
                            note={note}
                            onEdit={handleEditNote}
                            onDelete={handleDeleteNote}
                            onArchive={handleArchiveNote}
                            onTogglePin={handleTogglePin}
                            onToggleFavorite={handleToggleFavorite}
                            onMoveToFolder={handleMoveNoteToFolder}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedNoteIds.includes(note.id)}
                            onToggleSelection={handleToggleNoteSelection}
                            onDuplicate={handleDuplicateNote}
                            
                          /></div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      <NoteEditor
        note={selectedNote}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setSelectedNote(null);
        }}
        onSave={handleSaveNote}
        defaultType={defaultType}
        defaultFolderId={selectedFolderId || undefined}
        returnTo="/notesdashboard"
      />

      {/* Floating Add Note Button - Hide when editor is open */}
      {!isEditorOpen && (
        visibleTypes.length === 1 ? (
          // If only one type is visible, directly open that note type without dropdown
          <Button
            className="fixed left-4 right-4 z-50 h-12 text-base font-semibold"
            style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
            size="lg"
            onClick={() => {
              triggerHaptic('heavy');
              handleCreateNote(visibleTypes[0]);
            }}
          >
            <Plus className="h-5 w-5" />
            {t('notes.newNote')}
          </Button>
        ) : (
          // Show dropdown when multiple types are visible
          <DropdownMenu open={noteTypeSelectorOpen} onOpenChange={setNoteTypeSelectorOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                data-tour="new-note-button"
                className="fixed left-4 right-4 z-50 h-12 text-base font-semibold"
                style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
                size="lg"
                onClick={() => triggerHaptic('heavy')}
              >
                <Plus className="h-5 w-5" />
                {t('notes.newNote')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="mb-2 w-48 bg-card">
              {isTypeVisible('sticky') && (
                <DropdownMenuItem onClick={() => { triggerHaptic('medium'); handleCreateNote('sticky'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <StickyNote className="h-4 w-4 text-warning" />
                  {t('notes.noteTypes.sticky')}
                </DropdownMenuItem>
              )}
              {isTypeVisible('sticky') && isTypeVisible('lined') && <DropdownMenuSeparator />}
              {isTypeVisible('lined') && (
                <DropdownMenuItem onClick={() => { triggerHaptic('medium'); handleCreateNote('lined'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <FileText className="h-4 w-4 text-info" />
                  {t('notes.noteTypes.lined')}
                </DropdownMenuItem>
              )}
              {isTypeVisible('lined') && isTypeVisible('regular') && <DropdownMenuSeparator />}
              {isTypeVisible('regular') && (
                <DropdownMenuItem onClick={() => { triggerHaptic('medium'); handleCreateNote('regular'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <FileEdit className="h-4 w-4 text-success" />
                  {t('notes.noteTypes.regular')}
                </DropdownMenuItem>
              )}
              {isTypeVisible('regular') && isTypeVisible('code') && <DropdownMenuSeparator />}
              {isTypeVisible('code') && (
                <DropdownMenuItem onClick={() => { triggerHaptic('medium'); handleCreateNote('code'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <FileCode className="h-4 w-4 text-streak" />
                  {t('notes.noteTypes.code')}
                </DropdownMenuItem>
              )}
              {isTypeVisible('code') && isTypeVisible('sketch') && <DropdownMenuSeparator />}
              {isTypeVisible('sketch') && (
                <DropdownMenuItem onClick={() => { if (!requireFeature('sketch')) return; triggerHaptic('medium'); handleCreateNote('sketch'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <PenTool className="h-4 w-4 text-teal-500" />
                  {t('notes.noteTypes.sketch', 'Sketch')}
                  
                </DropdownMenuItem>
              )}
              {isTypeVisible('sketch') && isTypeVisible('linkedin') && <DropdownMenuSeparator />}
              {isTypeVisible('linkedin') && (
                <DropdownMenuItem onClick={() => { if (!requireFeature('linkedin_formatter')) return; triggerHaptic('medium'); handleCreateNote('linkedin'); setNoteTypeSelectorOpen(false); }} className="gap-2">
                  <Type className="h-4 w-4 text-info" />
                  {t('notes.noteTypes.linkedin', 'LinkedIn Formatter')}
                  
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}

      <BottomNavigation />
      
      {/* Note Type Visibility Sheet */}
      <NoteTypeVisibilitySheet
        isOpen={showNoteTypeVisibilitySheet}
        onClose={() => setShowNoteTypeVisibilitySheet(false)}
      />
      
      {/* Note Templates Sheet */}
      <NoteTemplateSheet
        isOpen={isNoteTemplateOpen}
        onClose={() => setIsNoteTemplateOpen(false)}
        onApplyTemplate={handleApplyNoteTemplate}
      />
      
      {/* Single Note Move to Folder Sheet */}
      <MoveToFolderSheet
        isOpen={!!movingNoteId}
        onClose={() => setMovingNoteId(null)}
        folders={folders}
        onSelect={handleConfirmMoveToFolder}
        currentFolderId={notes.find(n => n.id === movingNoteId)?.folderId}
      />
      <div className="text-center py-2 pb-16">
        <a href="https://www.flowist.me/privacy-policy" className="text-[10px] text-background hover:text-muted-foreground transition-colors">Privacy Policy</a>
        <span className="text-[10px] text-background mx-1">·</span>
        <a href="https://www.flowist.me/terms-and-conditions" className="text-[10px] text-background hover:text-muted-foreground transition-colors">Terms</a>
      </div>
    </div>
  );
};

export default Index;
