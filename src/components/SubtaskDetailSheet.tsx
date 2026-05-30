import { useState, useEffect, useCallback, useRef } from 'react';
import { genId } from '@/utils/genId';
import { useTranslation } from 'react-i18next';
import { TodoItem, Priority, LocationReminder, Folder } from '@/types/note';
import { useGlobalTags } from '@/hooks/useGlobalTags';
import { TagManagementSheet } from '@/components/TagManagementSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import {
  X,
  Flag,
  Trash2,
  Tag,
  Check,
  Bell,
  Clock,
  Copy,
  MapPin,
  FileText,
  ArrowUpFromLine,
  Calendar as CalendarIcon,
  Repeat,
  Plus,
  MoreVertical,
  FolderIcon,
  ChevronDown,
  Pin,
  Paperclip,
  Link,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { lazy, Suspense } from 'react';
 
import { TaskInputSheet } from './TaskInputSheet';
import { TaskDateTimePage, RepeatSettings } from './TaskDateTimePage';
import { TaskTimeTracker } from './TaskTimeTracker';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface SubtaskDetailSheetProps {
  isOpen: boolean;
  subtask: TodoItem | null;
  parentId: string | null;
  onClose: () => void;
  onUpdate: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void;
  onDelete: (parentId: string, subtaskId: string) => void;
  onConvertToTask: (parentId: string, subtask: TodoItem) => void;
}

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', 
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

export const SubtaskDetailSheet = ({
  isOpen,
  subtask,
  parentId,
  onClose,
  onUpdate,
  onDelete,
  onConvertToTask
}: SubtaskDetailSheetProps) => {
  const { t } = useTranslation();
  const { tags: globalTags } = useGlobalTags();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [showDateTimePage, setShowDateTimePage] = useState(false);
  const [showLocationReminder, setShowLocationReminder] = useState(false);
  const [isNestedSubtaskInputOpen, setIsNestedSubtaskInputOpen] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !subtask || !parentId) return;
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onUpdate(parentId, subtask.id, { imageUrl: dataUrl });
        toast.success(t('subtaskDetail.attachmentAdded'));
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Hardware back button support
  useHardwareBackButton({
    onBack: onClose,
    enabled: isOpen && !showDateTimePage,
    priority: 'sheet',
  });

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.text);
      setDescription(subtask.description || '');
    }
  }, [subtask]);

  useEffect(() => {
    if (showSubtaskInput && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [showSubtaskInput]);

  if (!isOpen || !subtask || !parentId) return null;

  const handleTitleBlur = () => {
    if (title.trim() !== subtask.text) {
      onUpdate(parentId, subtask.id, { text: title.trim() });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (subtask.description || '')) {
      onUpdate(parentId, subtask.id, { description });
    }
  };

  const handleToggleComplete = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    onUpdate(parentId, subtask.id, { completed: !subtask.completed });
  };

  const handleSetPriority = async (priority: Priority) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    onUpdate(parentId, subtask.id, { priority });
    toast.success(t('subtaskDetail.prioritySet', { priority }));
  };

  const handleDelete = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    onDelete(parentId, subtask.id);
    onClose();
    toast.success(t('subtaskDetail.subtaskDeleted'));
  };

  const handleConvertToTask = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    onConvertToTask(parentId, subtask);
    onClose();
    toast.success(t('subtaskDetail.convertedToTask'));
  };

  const handleDuplicate = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    toast.success(t('subtaskDetail.subtaskDuplicated'));
  };

  const handlePin = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    toast.success(t('subtaskDetail.subtaskPinned'));
  };

  const handleToggleTagSelection = (tagIds: string[]) => {
    onUpdate(parentId, subtask.id, { tagIds });
  };

  const handleRemoveTag = (tagId: string) => {
    onUpdate(parentId, subtask.id, {
      tagIds: (subtask.tagIds || []).filter(id => id !== tagId)
    });
  };

  const handleSaveLocationReminder = (reminder: LocationReminder) => {
    onUpdate(parentId, subtask.id, { locationReminder: reminder });
    toast.success(t('subtaskDetail.locationReminderSet', { address: reminder.address.split(',')[0] }));
  };

  const handleRemoveLocationReminder = () => {
    onUpdate(parentId, subtask.id, { locationReminder: undefined });
    toast.success(t('subtaskDetail.locationReminderRemoved'));
  };

  const handleAddNestedSubtask = async () => {
    if (!newSubtaskText.trim()) return;
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    
    const now = new Date();
    const nested: TodoItem = {
      id: genId(),
      text: newSubtaskText.trim(),
      completed: false,
      createdAt: now,
      modifiedAt: now,
    };

    onUpdate(parentId, subtask.id, {
      subtasks: [...(subtask.subtasks || []), nested]
    });
    setNewSubtaskText('');
    // Keep input open for continuous adding
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNestedSubtask();
    }
  };

  const handleToggleNestedSubtask = async (nestedId: string) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    const updatedNested = (subtask.subtasks || []).map(st =>
      st.id === nestedId ? { ...st, completed: !st.completed } : st
    );
    onUpdate(parentId, subtask.id, { subtasks: updatedNested });
  };

  const handleDeleteNestedSubtask = (nestedId: string) => {
    onUpdate(parentId, subtask.id, {
      subtasks: (subtask.subtasks || []).filter(st => st.id !== nestedId)
    });
  };

  const handleDateTimeSave = (data: {
    selectedDate?: Date;
    selectedTime?: { hour: number; minute: number; period: 'AM' | 'PM' };
    reminder?: string;
    repeatSettings?: RepeatSettings;
  }) => {
    let reminderTime: Date | undefined;
    
    if (data.selectedDate) {
      if (data.selectedTime) {
        let hours = data.selectedTime.hour;
        if (data.selectedTime.period === 'PM' && hours !== 12) hours += 12;
        if (data.selectedTime.period === 'AM' && hours === 12) hours = 0;
        reminderTime = new Date(data.selectedDate);
        reminderTime.setHours(hours, data.selectedTime.minute, 0, 0);
      }
    }

    onUpdate(parentId, subtask.id, {
      dueDate: data.selectedDate,
      reminderTime,
      repeatType: data.repeatSettings?.frequency === 'daily' ? 'daily' 
        : data.repeatSettings?.frequency === 'weekly' ? 'weekly'
        : data.repeatSettings?.frequency === 'monthly' ? 'monthly'
        : 'none' as const,
    });

    setShowDateTimePage(false);
  };

  const getPriorityColor = (p: Priority) => {
    switch (p) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-orange-500';
      case 'low': return 'text-green-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <>
      <div className={cn(
        "fixed inset-0 bg-background z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header - Similar to TaskDetailPage */}
        <header 
          className="flex items-center justify-between px-4 py-3 border-b border-border"
          style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
        >
          {/* Left: All Tasks label */}
          <Button variant="ghost" size="sm" className="gap-2">
            <FolderIcon className="h-4 w-4" />
            <span>{t('subtaskDetail.allTasks')}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>

          {/* Right: Options Menu */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg z-[60]">
                <DropdownMenuItem onClick={handleToggleComplete} className="cursor-pointer">
                  <Check className="h-4 w-4 mr-2" />
                  {subtask.completed ? t('subtaskDetail.markIncomplete') : t('subtaskDetail.markDone')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSetPriority('high')} className="cursor-pointer">
                  <Flag className="h-4 w-4 mr-2 text-red-500" />{t('subtaskDetail.highPriority')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSetPriority('medium')} className="cursor-pointer">
                  <Flag className="h-4 w-4 mr-2 text-orange-500" />{t('subtaskDetail.mediumPriority')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSetPriority('low')} className="cursor-pointer">
                  <Flag className="h-4 w-4 mr-2 text-green-500" />{t('subtaskDetail.lowPriority')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSetPriority('none')} className="cursor-pointer">
                  <Flag className="h-4 w-4 mr-2 text-muted-foreground" />{t('subtaskDetail.noPriority')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer">
                  <Copy className="h-4 w-4 mr-2" />{t('subtaskDetail.duplicateSubtask')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePin} className="cursor-pointer">
                  <Pin className="h-4 w-4 mr-2" />{t('subtaskDetail.pinSubtask')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleConvertToTask} className="cursor-pointer">
                  <ArrowUpFromLine className="h-4 w-4 mr-2" />{t('subtaskDetail.convertToTask')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />{t('subtaskDetail.deleteSubtask')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Subtask Title */}
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder={t('subtaskDetail.subtaskTitle')}
              className={cn(
                "text-xl font-semibold border-none shadow-none px-0 h-auto focus-visible:ring-0",
                subtask.completed && "line-through opacity-60"
              )}
            />
            {subtask.priority && subtask.priority !== 'none' && (
              <div className="flex items-center gap-1.5">
                <Flag className={cn("h-4 w-4", getPriorityColor(subtask.priority))} />
                <span className={cn("text-sm capitalize", getPriorityColor(subtask.priority))}>
                  {t('subtaskDetail.priority', { priority: subtask.priority })}
                </span>
              </div>
            )}
          </div>

          {/* Nested Subtasks */}
          <div className="space-y-3">
            <button
              onClick={() => setIsNestedSubtaskInputOpen(true)}
              className="flex items-center gap-2 text-primary font-medium"
            >
              <Plus className="h-5 w-5" />
              {t('subtaskDetail.addSubtask')}
            </button>

            {/* Keep inline input as fallback if sheet fails */}

            {subtask.subtasks && subtask.subtasks.length > 0 && (
              <div className="space-y-2 pl-2">
                {subtask.subtasks.map((nested) => (
                  <div key={nested.id} className="flex items-center gap-3 py-2 group">
                    <Checkbox
                      checked={nested.completed}
                      onCheckedChange={() => handleToggleNestedSubtask(nested.id)}
                      className={cn(
                        "h-5 w-5 rounded-sm border-2",
                        nested.completed && "border-muted-foreground/50"
                      )}
                    />
                    <span className={cn("flex-1 text-sm", nested.completed && "line-through text-muted-foreground")}>
                      {nested.text}
                    </span>
                    <button
                      onClick={() => handleDeleteNestedSubtask(nested.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time Tracking */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              {t('subtaskDetail.timeTracking')}
            </div>
            <TaskTimeTracker
              timeTracking={subtask.timeTracking}
              onUpdate={(tracking) => onUpdate(parentId, subtask.id, { timeTracking: tracking })}
            />
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <button
              className="w-full flex items-center gap-3 py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
            >
              <Link className="h-5 w-5 text-purple-500" />
              <span className="flex-1 text-left">{t('subtaskDetail.dependencies')}</span>
              <span className="text-sm text-muted-foreground">
                {t('subtaskDetail.linked', { count: subtask.dependsOn?.length || 0 })}
              </span>
            </button>
          </div>

          {/* Action Items */}
          <div className="space-y-1 border-t border-border pt-4">
            {/* Date, Time & Reminder */}
            <button 
              onClick={() => setShowDateTimePage(true)}
              className="w-full flex items-center gap-3 py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
            >
              <CalendarIcon className="h-5 w-5 text-cyan-500" />
              <span className="flex-1 text-left">{t('subtaskDetail.dateTimeReminder')}</span>
              <span className="text-sm text-muted-foreground">
                {subtask.dueDate 
                  ? `${format(new Date(subtask.dueDate), 'MMM d')}${subtask.reminderTime ? ` • ${format(new Date(subtask.reminderTime), 'h:mm a')}` : ''}`
                  : t('subtaskDetail.notSet')}
              </span>
            </button>

            {/* Convert to Notes */}
            <button 
              onClick={handleConvertToTask}
              className="w-full flex items-center gap-3 py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
            >
              <FileText className="h-5 w-5 text-blue-500" />
              <span className="flex-1 text-left">{t('subtaskDetail.convertToNotes')}</span>
            </button>

            {/* Attachment */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt"
              multiple
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
            >
              <Paperclip className="h-5 w-5 text-pink-500" />
              <span className="flex-1 text-left">{t('subtaskDetail.attachment')}</span>
              {subtask.imageUrl && <ImageIcon className="h-4 w-4 text-muted-foreground" />}
            </button>

            {/* Tag */}
            <div className="space-y-2">
              <button 
                onClick={() => setShowTagInput(true)}
                className="w-full flex items-center gap-3 py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
              >
                <Tag className="h-5 w-5 text-yellow-500" />
                <span className="flex-1 text-left">{t('subtaskDetail.tag')}</span>
                <span className="text-sm text-muted-foreground">
                  {t('subtaskDetail.tagCount', { count: subtask.tagIds?.length || 0 })}
                </span>
              </button>

              <TagManagementSheet
                open={showTagInput}
                onOpenChange={setShowTagInput}
                selectionMode
                selectedTagIds={subtask.tagIds || []}
                onSelectionChange={handleToggleTagSelection}
              />

              {/* Display existing tags */}
              {subtask.tagIds && subtask.tagIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-10">
                  {subtask.tagIds.map((tagId) => {
                    const globalTag = globalTags.find(t => t.id === tagId);
                    if (!globalTag) return null;
                    return (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full text-white"
                        style={{ backgroundColor: `hsl(${globalTag.color})` }}
                      >
                        {globalTag.icon && <span>{globalTag.icon}</span>}
                        {globalTag.name}
                        <button onClick={() => handleRemoveTag(tagId)}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Description Section - After Tag as requested */}
            <div className="pt-4 border-t border-border mt-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-medium">{t('subtaskDetail.description')}</h3>
              </div>
              <Textarea
                placeholder={t('subtaskDetail.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                className="min-h-[120px] resize-none border bg-muted/30 rounded-xl p-3 focus-visible:ring-1 placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Subtask Timestamps Section */}
            <div className="pt-4 border-t border-border mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-medium">{t('subtaskDetail.subtaskHistory')}</h3>
              </div>
              <div className="space-y-2 text-sm">
                {subtask.createdAt && (
                  <div className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">{t('subtaskDetail.created')}</span>
                    <span className="font-medium">{format(new Date(subtask.createdAt), 'MMM d, yyyy • h:mm a')}</span>
                  </div>
                )}
                {subtask.modifiedAt && (
                  <div className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">{t('subtaskDetail.lastModified')}</span>
                    <span className="font-medium">{format(new Date(subtask.modifiedAt), 'MMM d, yyyy • h:mm a')}</span>
                  </div>
                )}
                {subtask.completed && subtask.completedAt && (
                  <div className="flex items-center justify-between py-2 px-3 bg-green-500/10 rounded-lg">
                    <span className="text-green-600 dark:text-green-400">{t('subtaskDetail.completedLabel')}</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{format(new Date(subtask.completedAt), 'MMM d, yyyy • h:mm a')}</span>
                  </div>
                )}
                {!subtask.createdAt && !subtask.modifiedAt && !subtask.completedAt && (
                  <div className="text-muted-foreground text-center py-2">{t('subtaskDetail.noTimestamp')}</div>
                )}
              </div>
            </div>
          </div>

           
        </div>

        {/* Safe area padding for bottom */}
        <div style={{ paddingBottom: 'var(--safe-bottom, 0px)' }} />

        {/* TaskDateTimePage */}
        <TaskDateTimePage
          isOpen={showDateTimePage}
          onClose={() => setShowDateTimePage(false)}
          onSave={handleDateTimeSave}
          initialDate={subtask.dueDate ? new Date(subtask.dueDate) : undefined}
          initialTime={subtask.reminderTime ? {
            hour: new Date(subtask.reminderTime).getHours() % 12 || 12,
            minute: new Date(subtask.reminderTime).getMinutes(),
            period: new Date(subtask.reminderTime).getHours() >= 12 ? 'PM' : 'AM'
          } : undefined}
        />
      </div>

       

      {/* Nested subtask input sheet */}
      <TaskInputSheet
        isOpen={isNestedSubtaskInputOpen}
        onClose={() => setIsNestedSubtaskInputOpen(false)}
        onAddTask={(task) => {
          const nested: TodoItem = {
            id: genId(),
            completed: false,
            ...task,
          };
          onUpdate(parentId, subtask.id, {
            subtasks: [...(subtask.subtasks || []), nested]
          });
          setIsNestedSubtaskInputOpen(false);
        }}
        folders={[]}
        selectedFolderId={null}
        onCreateFolder={() => {}}
        sections={[]}
        selectedSectionId={null}
      />
    </>
  );
};
