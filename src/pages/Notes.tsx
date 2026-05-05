import { useState, useCallback, useEffect, useDeferredValue, useTransition, useMemo } from 'react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Note } from '@/types/note';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { NoteEditor } from '@/components/NoteEditor';
import { Layers, Settings, Pin, Download, ListTodo, FileText, Archive, ArchiveRestore, Trash2, RotateCcw, Sun, Moon, Search, X, Crown, Tag } from 'lucide-react';


import { debouncedSaveNotes, saveNoteToDBSingle, saveNotesToDB, deleteNoteFromDB } from '@/utils/noteStorage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { exportNoteToMarkdown } from '@/utils/markdownExport';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '@/components/AppLogo';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDarkMode } from '@/hooks/useDarkMode';
import { prefetchRoute } from '@/utils/routePrefetch';

import { useTranslation } from 'react-i18next';
import { useNotes } from '@/contexts/NotesContext';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { TagManagementSheet } from '@/components/TagManagementSheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const STICKY_COLORS: Record<string, string> = {
  yellow: 'hsl(var(--sticky-yellow))',
  blue: 'hsl(var(--sticky-blue))',
  green: 'hsl(var(--sticky-green))',
  pink: 'hsl(var(--sticky-pink))',
  orange: 'hsl(var(--sticky-orange))',
};

// Vibrant colors for notes display
const RANDOM_COLORS = [
  'hsl(330, 100%, 75%)', // Vibrant Pink
  'hsl(160, 70%, 70%)', // Vibrant Mint
  'hsl(280, 70%, 75%)', // Vibrant Lavender
  'hsl(20, 95%, 75%)', // Vibrant Coral
  'hsl(140, 65%, 70%)', // Vibrant Green
  'hsl(350, 80%, 75%)', // Vibrant Rose
  'hsl(45, 90%, 75%)', // Vibrant Peach
  'hsl(270, 65%, 75%)', // Vibrant Purple
  'hsl(200, 80%, 70%)', // Vibrant Sky Blue
  'hsl(60, 90%, 75%)', // Vibrant Yellow
];

const Notes = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  
  const { requireFeature, openPaywall, isPro, isNewFreeUser, softRequireCreate, softRequireMutate } = useSubscription();
  
  // Use global notes context - no more local loading!
  const { notes, notesMeta, setNotes, isLoading, counts } = useNotes();
  
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'archived' | 'trash'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [showTagManager, setShowTagManager] = useState(false);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const deferredFilterTagIds = useDeferredValue(filterTagIds);
  const [allTags, setAllTags] = useState<import('@/utils/tagStorage').AppTag[]>([]);

  // Load tags for filtering
  useEffect(() => {
    import('@/utils/tagStorage').then(({ getAllTags }) => {
      getAllTags().then(setAllTags);
    });
  }, [showTagManager]);


  const handleSaveNote = useCallback((note: Note): boolean => {
    const isExisting = notes.some(n => n.id === note.id);
    if (isExisting) {
      if (!softRequireMutate()) return false;
    } else if (!isPro && !softRequireCreate('notes', notes.length)) {
      return false;
    }

    setNotes(prevNotes => {
      const existingIndex = prevNotes.findIndex((n) => n.id === note.id);
      let updatedNotes;
      if (existingIndex >= 0) {
        updatedNotes = prevNotes.map((n) => (n.id === note.id ? note : n));
      } else {
        updatedNotes = [note, ...prevNotes];
      }
      debouncedSaveNotes(updatedNotes, 1000);
      saveNoteToDBSingle(note);
      return updatedNotes;
    });
    return true;
  }, [isPro, softRequireCreate, softRequireMutate, notes, setNotes]);

  const handleEditNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditorOpen(true);
  };

  const handleTogglePin = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPro && isNewFreeUser && !softRequireMutate()) return;
    if (!requireFeature('pin_feature')) return;
    const updatedNotes = notes.map((n) => {
      if (n.id === noteId) {
        return {
          ...n,
          isPinned: !n.isPinned,
          pinnedOrder: !n.isPinned ? Date.now() : undefined,
        };
      }
      return n;
    });
    setNotes(updatedNotes);
    debouncedSaveNotes(updatedNotes);
  };

  const handleToggleArchive = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPro && isNewFreeUser && !softRequireMutate()) return;
    const noteBeforeUpdate = notes.find(n => n.id === noteId);
    const updatedNotes = notes.map((n) => {
      if (n.id === noteId) {
        const isArchiving = !n.isArchived;
        return {
          ...n,
          isArchived: isArchiving,
          archivedAt: isArchiving ? new Date() : undefined,
          isPinned: isArchiving ? false : n.isPinned,
        };
      }
      return n;
    });
    setNotes(updatedNotes);
    debouncedSaveNotes(updatedNotes);
    toast.success(noteBeforeUpdate?.isArchived ? t('toasts.noteRestored') : t('toasts.noteArchived'));
  };

  const handleMoveToTrash = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPro && isNewFreeUser && !softRequireMutate()) return;
    const updatedNotes = notes.map((n) => {
      if (n.id === noteId) {
        return {
          ...n,
          isDeleted: true,
          deletedAt: new Date(),
          isArchived: false,
          isPinned: false,
        };
      }
      return n;
    });
    setNotes(updatedNotes);
    debouncedSaveNotes(updatedNotes);
    toast.success(t('toasts.noteMoved'));
  };

  const handleRestoreFromTrash = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPro && isNewFreeUser && !softRequireMutate()) return;
    const updatedNotes = notes.map((n) => {
      if (n.id === noteId) {
        return {
          ...n,
          isDeleted: false,
          deletedAt: undefined,
        };
      }
      return n;
    });
    setNotes(updatedNotes);
    debouncedSaveNotes(updatedNotes);
    toast.success(t('toasts.noteRestored'));
  };

  const handleDeletePermanently = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPro && isNewFreeUser && !softRequireMutate()) return;
    const updatedNotes = notes.filter((n) => n.id !== noteId);
    setNotes(updatedNotes);
    deleteNoteFromDB(noteId);
    toast.success(t('toasts.noteDeleted'));
  };

  // Auto-delete notes older than 30 days in trash — run once on mount only
  useEffect(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    setNotes(prev => {
      const updatedNotes = prev.filter((n) => {
        if (n.isDeleted && n.deletedAt) {
          return new Date(n.deletedAt) > thirtyDaysAgo;
        }
        return true;
      });
      if (updatedNotes.length === prev.length) return prev; // no change — skip re-render
      debouncedSaveNotes(updatedNotes);
      return updatedNotes;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', noteId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    const draggedNoteId = e.dataTransfer.getData('text/html');

    if (draggedNoteId === targetNoteId) return;

    const draggedNote = notes.find(n => n.id === draggedNoteId);
    const targetNote = notes.find(n => n.id === targetNoteId);

    if (!draggedNote || !targetNote) return;

    // Only allow reordering within pinned or unpinned sections
    if (draggedNote.isPinned !== targetNote.isPinned) return;

    const updatedNotes = [...notes];
    const draggedIndex = updatedNotes.findIndex(n => n.id === draggedNoteId);
    const targetIndex = updatedNotes.findIndex(n => n.id === targetNoteId);

    const [removed] = updatedNotes.splice(draggedIndex, 1);
    updatedNotes.splice(targetIndex, 0, removed);

    // Update pinned order for all pinned notes
    if (draggedNote.isPinned) {
      updatedNotes.forEach((note, idx) => {
        if (note.isPinned) {
          note.pinnedOrder = idx;
        }
      });
    }

    setNotes(updatedNotes);
    debouncedSaveNotes(updatedNotes);
  };

  // Filter notes using lightweight metadata for instant performance
  const notesMetaById = useMemo(() => new Map(notesMeta.map(meta => [meta.id, meta])), [notesMeta]);

  const filteredNotes = useMemo(() => notes.filter(note => {
    const meta = notesMetaById.get(note.id);

    let viewMatch = false;
    if (viewMode === 'trash') viewMatch = note.isDeleted === true;
    else if (viewMode === 'archived') viewMatch = note.isArchived === true && !note.isDeleted;
    else viewMatch = !note.isArchived && !note.isDeleted;

    if (!viewMatch) return false;

    if (deferredFilterTagIds.length > 0) {
      if (!note.tagIds || !deferredFilterTagIds.some(id => note.tagIds!.includes(id))) {
        return false;
      }
    }

    if (deferredSearchQuery.trim()) {
      const search = deferredSearchQuery.toLowerCase();
      const titleMatch = note.title.toLowerCase().includes(search);
      const contentMatch = meta?.contentPreview?.toLowerCase().includes(search) ?? false;
      return titleMatch || contentMatch;
    }

    return true;
  }), [notes, notesMetaById, viewMode, deferredFilterTagIds, deferredSearchQuery]);

  const sortedNotes = useMemo(() => [...filteredNotes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) {
      return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }), [filteredNotes]);

  // Use pre-computed counts from context — O(1) instead of 3x full-array scans
  const activeCount = counts.active;
  const archivedCount = counts.archived;
  const trashCount = counts.trash;

  const getDaysRemaining = (deletedAt: Date | undefined) => {
    if (!deletedAt) return 30;
    const deleted = new Date(deletedAt);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - deleted.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - daysPassed);
  };

  const handleEmptyTrash = () => {
    const updatedNotes = notes.filter(n => !n.isDeleted);
    setNotes(updatedNotes);
    saveNotesToDB(updatedNotes);
    toast.success(t('notes.trashEmptied'));
  };

  const getCardColor = (note: Note) => {
    if (note.type === 'sticky' && note.color) {
      return STICKY_COLORS[note.color];
    }
    // Use random colors for other notes (excluding yellow and sky blue)
    const index = note.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return RANDOM_COLORS[index % RANDOM_COLORS.length];
  };

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-background pb-14">
      <header className="bg-background sticky top-0 z-10" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
         <div className="container mx-auto px-2 xs:px-3 sm:px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-1 xs:gap-2">
            <div className="flex items-center gap-1.5 xs:gap-2 min-w-0 flex-shrink-0">
              <AppLogo />
              <h1 className="text-base xs:text-lg sm:text-xl font-bold">{t('notes.title')}</h1>
              
            </div>
            <div className="flex items-center gap-0.5 xs:gap-1 sm:gap-2 flex-shrink-0">
              {!isPro && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openPaywall('pro')}
                  className="h-7 w-7 xs:h-8 xs:w-8 sm:h-10 sm:w-10 touch-target"
                  title={t('common.goPro')}
                >
                  <Crown className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#3c78f0' }} />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (!isPro) { openPaywall('dark_mode'); return; }
                  toggleDarkMode();
                }}
                className="h-7 w-7 xs:h-8 xs:w-8 sm:h-10 sm:w-10 touch-target"
                title={t('common.toggleDarkMode')}
              >
                {isDarkMode ? <Sun className="h-4 w-4 sm:h-5 sm:w-5" /> : <Moon className="h-4 w-4 sm:h-5 sm:w-5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowTagManager(true)}
                title={t('common.tags', 'Tags')}
                className="h-7 w-7 xs:h-8 xs:w-8 sm:h-10 sm:w-10 touch-target"
              >
                <Tag className="h-4 w-4 xs:h-5 xs:w-5 sm:h-5 sm:w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  await prefetchRoute('/todo/today');
                  navigate('/todo/today');
                }}
                title={t('common.switchToTodo')}
                className="h-7 w-7 xs:h-8 xs:w-8 sm:h-10 sm:w-10 touch-target"
              >
                <ListTodo className="h-4 w-4 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              </Button>
            </div>
          </div>
        </div>
        <div className="h-[1px] bg-border" />
      </header>

      <main className="container mx-auto px-2 xs:px-3 sm:px-4 py-3 xs:py-4 sm:py-6">
        {/* Archive & Trash Tabs - Simplified to only Archive and Trash */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'active' | 'archived' | 'trash')} className="mb-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="archived" className="flex items-center gap-1 text-xs sm:text-sm">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">{t('notes.archived')}</span> ({archivedCount})
            </TabsTrigger>
            <TabsTrigger value="trash" className="flex items-center gap-1 text-xs sm:text-sm">
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('notes.trash')}</span> ({trashCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder={t('notes.searchNotes')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 rounded-lg border-none bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="h-[1px] bg-border mt-3" />
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {allTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => {
                  setFilterTagIds(prev =>
                    prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                  );
                }}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0',
                  filterTagIds.includes(tag.id)
                    ? 'text-white shadow-sm scale-105'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
                style={filterTagIds.includes(tag.id) ? { backgroundColor: `hsl(${tag.color})` } : undefined}
              >
                {tag.icon && <span>{tag.icon}</span>}
                {tag.name}
                {filterTagIds.includes(tag.id) && <X className="h-3 w-3 ml-0.5" />}
              </button>
            ))}
          </div>
        )}


        {viewMode === 'trash' && trashCount > 0 && (
          <div className="mb-4 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('notes.emptyTrash')} ({trashCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('notes.emptyTrash')}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('dialogs.deleteWarning')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEmptyTrash} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {sortedNotes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              {viewMode === 'trash' ? t('notes.trashEmpty') : viewMode === 'archived' ? t('notes.noArchivedNotes') : t('notes.noNotes')}
            </p>
            {viewMode === 'active' && (
              <p className="text-muted-foreground/60 text-sm mt-2">
                {t('emptyStates.tapToCreateNote')}
              </p>
            )}
          </div>
        ) : (
          <div className="columns-2 gap-3 space-y-3">
            {sortedNotes.map((note) => (
              <div
                key={note.id}
                draggable={!note.isArchived && !note.isDeleted}
                onDragStart={(e) => handleDragStart(e, note.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, note.id)}
                className={cn(
                  "break-inside-avoid cursor-move transition-all hover:scale-105 relative group",
                  (note.isArchived || note.isDeleted) && "opacity-75"
                )}
                style={{ backgroundColor: getCardColor(note) }}
                onClick={() => !note.isDeleted && handleEditNote(note)}
              >
                <div className="p-4 rounded-2xl">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title={t('common.export')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card z-50" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => {
                           import('@/utils/exportToDocx').then(({ exportNoteToDocx }) => exportNoteToDocx(note));
                          toast.success(t('notes.exportedToWord'));
                        }}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('notes.exportWord')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          exportNoteToMarkdown(note);
                          toast.success(t('notes.exportedToMarkdown'));
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          {t('notes.exportMarkdown')}
                        </DropdownMenuItem>
                        {!note.isDeleted && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleToggleArchive(note.id, e as unknown as React.MouseEvent);
                            }}>
                              {note.isArchived ? (
                                <>
                                  <ArchiveRestore className="h-4 w-4 mr-2" />
                                  {t('notes.restoreFromArchive')}
                                </>
                              ) : (
                                <>
                                  <Archive className="h-4 w-4 mr-2" />
                                  {t('notes.archiveNote')}
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => handleMoveToTrash(note.id, e as unknown as React.MouseEvent)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('notes.moveToTrash')}
                            </DropdownMenuItem>
                          </>
                        )}
                        {note.isDeleted && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => handleRestoreFromTrash(note.id, e as unknown as React.MouseEvent)}>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              {t('notes.restore')}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => handleDeletePermanently(note.id, e as unknown as React.MouseEvent)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('notes.deletePermanently')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {!note.isArchived && !note.isDeleted && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleTogglePin(note.id, e)}
                        className={cn(
                          "h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10",
                          note.isPinned && "opacity-100"
                        )}
                      >
                        <Pin className={cn("h-4 w-4", note.isPinned && "fill-current")} />
                      </Button>
                    )}
                    {note.isArchived && !note.isDeleted && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleToggleArchive(note.id, e)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title={t('common.restore')}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    )}
                    {note.isDeleted && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleRestoreFromTrash(note.id, e)}
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title={t('notes.restoreFromTrash', 'Restore from Trash')}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {note.title && (
                    <h3 className="font-bold text-base mb-2 text-foreground pr-10">
                      {note.title}
                    </h3>
                  )}
                  {/* Show metaDescription if available, otherwise show content preview */}
                  {(note.metaDescription || note.content) && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-4">
                      {note.metaDescription || note.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-block px-3 py-1 rounded-full border border-foreground/20 text-xs text-foreground">
                      {new Date(note.updatedAt).toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        year: '2-digit'
                      })} {new Date(note.updatedAt).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>
                    {note.isDeleted && note.deletedAt && (
                      <div className="inline-block px-2 py-1 rounded-full bg-destructive/20 text-xs text-destructive font-medium">
                        {t('notes.daysRemaining', { days: getDaysRemaining(note.deletedAt) })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        allNotes={notes}
        returnTo="/notesdashboard"
      />


      {/* Tag Management Sheet */}
      <TagManagementSheet
        open={showTagManager}
        onOpenChange={setShowTagManager}
      />

      <BottomNavigation />
    </div>
  );
};

export default Notes;
