/**
 * TodaySheets — All bottom sheets and dialogs used by the Today page.
 * Extracted from Today.tsx to reduce file size.
 */
import { TodoItem, Folder, Priority, TaskSection, Note } from '@/types/note';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskInputSheet } from '@/components/TaskInputSheet';
import { TaskDetailPage } from '@/components/TaskDetailPage';
import { TaskFilterSheet, DateFilter, PriorityFilter, StatusFilter } from '@/components/TaskFilterSheet';
import { DuplicateOptionsSheet, DuplicateOption } from '@/components/DuplicateOptionsSheet';
import { FolderManageSheet } from '@/components/FolderManageSheet';
import { MoveToFolderSheet } from '@/components/MoveToFolderSheet';
import { TaskMoveSheet } from '@/components/TaskMoveSheet';
import { SelectActionsSheet, SelectAction } from '@/components/SelectActionsSheet';
import { PrioritySelectSheet } from '@/components/PrioritySelectSheet';
import { BatchTaskSheet } from '@/components/BatchTaskSheet';
import { SectionEditSheet } from '@/components/SectionEditSheet';
import { SectionMoveSheet } from '@/components/SectionMoveSheet';
import { SubtaskDetailSheet } from '@/components/SubtaskDetailSheet';
import { TaskOptionsSheet, HideDetailsOptions } from '@/components/TaskOptionsSheet';
import { AutoScheduleSheet } from '@/components/AutoScheduleSheet';
import { ResolvedImageDialog } from '@/components/ResolvedImageDialog';
import { lazy, Suspense } from 'react';
 
import { BulkDateSheet } from '@/components/BulkDateSheet';
import { BulkReminderSheet } from '@/components/BulkReminderSheet';
import { BulkRepeatSheet } from '@/components/BulkRepeatSheet';
import { BulkSectionMoveSheet } from '@/components/BulkSectionMoveSheet';
import { BulkStatusSheet } from '@/components/BulkStatusSheet';
import { SaveSmartViewSheet } from '@/components/SaveSmartViewSheet';
import { StreakChallengeDialog } from '@/components/StreakChallengeDialog';
import { playCompletionSound } from '@/utils/taskSounds';
import { loadCustomSmartViews } from '@/utils/customSmartViews';
import { toast } from 'sonner';

interface TodaySheetsProps {
  // Input sheet
  isInputOpen: boolean;
  onCloseInput: () => void;
  onAddTask: (task: Omit<TodoItem, 'id' | 'completed'>) => void;
  folders: Folder[];
  selectedFolderId: string | null;
  onCreateFolder: (name: string, color: string) => void;
  sections: TaskSection[];
  inputSectionId: string | null;
  // Task detail
  selectedTask: TodoItem | null;
  items: TodoItem[];
  onCloseTask: () => void;
  onUpdateTask: (task: TodoItem) => void;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  onDeleteTask: (id: string, showUndo?: boolean, skipConfirm?: boolean) => void;
  onDuplicateTask: (task: TodoItem) => void;
  onConvertToNote: (task: TodoItem) => void;
  onMoveTaskToFolder: (taskId: string, folderId: string | null) => void;
  // Filter
  isFilterSheetOpen: boolean;
  onCloseFilter: () => void;
  dateFilter: DateFilter;
  onDateFilterChange: (f: DateFilter) => void;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (f: PriorityFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (f: StatusFilter) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFolderChange: (id: string | null) => void;
  onClearAll: () => void;
  isSaveSmartViewOpen: boolean;
  onOpenSaveSmartView: () => void;
  onCloseSaveSmartView: () => void;
  onSmartViewSaved: () => void;
  // Duplicate
  isDuplicateSheetOpen: boolean;
  onCloseDuplicate: () => void;
  onDuplicate: (option: DuplicateOption) => void;
  // Folder manage
  isFolderManageOpen: boolean;
  onCloseFolderManage: () => void;
  onEditFolder: (id: string, name: string, color: string) => void;
  onDeleteFolder: (id: string) => void;
  onReorderFolders: (folders: Folder[]) => void;
  onToggleFolderFavorite: (id: string) => void;
  // Auto schedule
  isAutoScheduleOpen: boolean;
  onCloseAutoSchedule: () => void;
  onApplySchedule: (items: TodoItem[]) => void;
  // Move to folder
  isMoveToFolderOpen: boolean;
  onCloseMoveToFolder: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  // Select actions
  isSelectActionsOpen: boolean;
  onCloseSelectActions: () => void;
  selectedCount: number;
  onSelectAction: (action: SelectAction) => void;
  totalCount: number;
  // Priority
  isPrioritySheetOpen: boolean;
  onClosePriority: () => void;
  onSetPriority: (p: Priority) => void;
  // Batch task
  isBatchTaskOpen: boolean;
  onCloseBatchTask: () => void;
  onBatchAddTasks: (texts: string[], sectionId?: string, folderId?: string, priority?: Priority, dueDate?: Date) => void;
  // Section edit
  isSectionEditOpen: boolean;
  onCloseSectionEdit: () => void;
  editingSection: TaskSection | null;
  onSaveSection: (s: TaskSection) => void;
  // Section move
  isSectionMoveOpen: boolean;
  onCloseSectionMove: () => void;
  onMoveToPosition: (index: number) => void;
  // Subtask
  selectedSubtask: { subtask: TodoItem; parentId: string } | null;
  onCloseSubtask: () => void;
  onUpdateSubtask: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void;
  onDeleteSubtask: (parentId: string, subtaskId: string) => void;
  onConvertSubtaskToTask: (parentId: string, subtask: TodoItem) => void;
  // Task options
  isTaskOptionsOpen: boolean;
  onCloseTaskOptions: () => void;
  groupBy: 'custom' | 'date' | 'priority';
  sortBy: 'custom' | 'date' | 'priority';
  onGroupByChange: (v: 'custom' | 'date' | 'priority') => void;
  onSortByChange: (v: 'custom' | 'date' | 'priority') => void;
  defaultSectionId?: string;
  onDefaultSectionChange: (id: string | undefined) => void;
  taskAddPosition: 'top' | 'bottom';
  onTaskAddPositionChange: (v: 'top' | 'bottom') => void;
  hideDetailsOptions: HideDetailsOptions;
  onHideDetailsOptionsChange: (v: HideDetailsOptions) => void;
  // Image
  selectedImage: string | null;
  onCloseImage: () => void;
 
  // Bulk sheets
  isBulkDateSheetOpen: boolean;
  onCloseBulkDate: () => void;
  onBulkSetDate: (date: Date) => void;
  isBulkReminderSheetOpen: boolean;
  onCloseBulkReminder: () => void;
  onBulkSetReminder: (date: Date) => void;
  isBulkRepeatSheetOpen: boolean;
  onCloseBulkRepeat: () => void;
  onBulkSetRepeat: (repeatType: string) => void;
  isBulkSectionMoveOpen: boolean;
  onCloseBulkSectionMove: () => void;
  onBulkMoveToSection: (sectionId: string) => void;
  isBulkStatusOpen: boolean;
  onCloseBulkStatus: () => void;
  onBulkStatusChange: (status: string) => void;
  // Delete confirm
  deleteConfirmItem: TodoItem | null;
  onCloseDeleteConfirm: () => void;
  onConfirmDelete: () => void;
  // Swipe task move
  swipeMoveTaskId: string | null;
  onCloseSwipeMove: () => void;
  onSwipeMoveFolder: (folderId: string | null) => void;
  onSwipeMoveSection: (sectionId: string) => void;
  swipeMoveCurrentFolderId?: string;
  swipeMoveCurrentSectionId?: string;
  // Swipe date
  swipeDateTaskId: string | null;
  onCloseSwipeDate: () => void;
  onSwipeDateSet: (taskId: string, date: Date | undefined) => void;
  // Streak
  showStreakChallenge: boolean;
  onCloseStreakChallenge: () => void;
  currentStreak: number;
  streakWeekData: Array<{ day: string; date: string; completed: boolean; isToday: boolean }>;
}

export const TodaySheets = (props: TodaySheetsProps) => {
  const { t } = useTranslation();

  return (
    <>
      <TaskInputSheet isOpen={props.isInputOpen} onClose={props.onCloseInput} onAddTask={props.onAddTask} folders={props.folders} selectedFolderId={props.selectedFolderId} onCreateFolder={props.onCreateFolder} sections={props.sections} selectedSectionId={props.inputSectionId} />
      <TaskDetailPage 
        isOpen={!!props.selectedTask} 
        task={props.selectedTask} 
        folders={props.folders}
        allTasks={props.items}
        onClose={props.onCloseTask}
        onUpdate={(updatedTask) => { props.updateItem(updatedTask.id, updatedTask); props.onUpdateTask(updatedTask); }}
        onDelete={props.onDeleteTask}
        onDuplicate={props.onDuplicateTask}
        onConvertToNote={props.onConvertToNote}
        onMoveToFolder={props.onMoveTaskToFolder}
      />
      <TaskFilterSheet isOpen={props.isFilterSheetOpen} onClose={props.onCloseFilter} folders={props.folders} selectedFolderId={props.selectedFolderId} onFolderChange={props.onFolderChange} dateFilter={props.dateFilter} onDateFilterChange={props.onDateFilterChange} priorityFilter={props.priorityFilter} onPriorityFilterChange={props.onPriorityFilterChange} statusFilter={props.statusFilter} onStatusFilterChange={props.onStatusFilterChange} selectedTags={props.selectedTags} onTagsChange={props.onTagsChange} onClearAll={props.onClearAll} onSaveAsSmartView={props.onOpenSaveSmartView} />
      <SaveSmartViewSheet
        isOpen={props.isSaveSmartViewOpen}
        onClose={props.onCloseSaveSmartView}
        currentFilters={{ dateFilter: props.dateFilter, priorityFilter: props.priorityFilter, statusFilter: props.statusFilter, tags: props.selectedTags, folderId: props.selectedFolderId }}
        onSaved={props.onSmartViewSaved}
      />
      <DuplicateOptionsSheet isOpen={props.isDuplicateSheetOpen} onClose={props.onCloseDuplicate} onSelect={props.onDuplicate} />
      <FolderManageSheet isOpen={props.isFolderManageOpen} onClose={props.onCloseFolderManage} folders={props.folders} onCreateFolder={props.onCreateFolder} onEditFolder={props.onEditFolder} onDeleteFolder={props.onDeleteFolder} onReorderFolders={props.onReorderFolders} onToggleFavorite={props.onToggleFolderFavorite} />
      <AutoScheduleSheet isOpen={props.isAutoScheduleOpen} onClose={props.onCloseAutoSchedule} tasks={props.items} onApply={props.onApplySchedule} />
      <MoveToFolderSheet isOpen={props.isMoveToFolderOpen} onClose={props.onCloseMoveToFolder} folders={props.folders} onSelect={props.onMoveToFolder} />
      <SelectActionsSheet isOpen={props.isSelectActionsOpen} onClose={props.onCloseSelectActions} selectedCount={props.selectedCount} onAction={props.onSelectAction} totalCount={props.totalCount} />
      <PrioritySelectSheet isOpen={props.isPrioritySheetOpen} onClose={props.onClosePriority} onSelect={props.onSetPriority} />
      <BatchTaskSheet isOpen={props.isBatchTaskOpen} onClose={props.onCloseBatchTask} onAddTasks={props.onBatchAddTasks} sections={props.sections} folders={props.folders} />
      <SectionEditSheet isOpen={props.isSectionEditOpen} onClose={props.onCloseSectionEdit} section={props.editingSection} onSave={props.onSaveSection} />
      <SectionMoveSheet isOpen={props.isSectionMoveOpen} onClose={props.onCloseSectionMove} sections={props.sections} currentSectionId={props.editingSection?.id || ''} onMoveToPosition={props.onMoveToPosition} />
      <SubtaskDetailSheet
        isOpen={!!props.selectedSubtask}
        subtask={props.selectedSubtask?.subtask || null}
        parentId={props.selectedSubtask?.parentId || null}
        onClose={props.onCloseSubtask}
        onUpdate={props.onUpdateSubtask}
        onDelete={props.onDeleteSubtask}
        onConvertToTask={props.onConvertSubtaskToTask}
      />
      <TaskOptionsSheet
        isOpen={props.isTaskOptionsOpen}
        onClose={props.onCloseTaskOptions}
        groupBy={props.groupBy}
        sortBy={props.sortBy}
        onGroupByChange={props.onGroupByChange}
        onSortByChange={props.onSortByChange}
        sections={props.sections}
        defaultSectionId={props.defaultSectionId}
        onDefaultSectionChange={props.onDefaultSectionChange}
        taskAddPosition={props.taskAddPosition}
        onTaskAddPositionChange={props.onTaskAddPositionChange}
        hideDetailsOptions={props.hideDetailsOptions}
        onHideDetailsOptionsChange={props.onHideDetailsOptionsChange}
      />
      <ResolvedImageDialog imageRef={props.selectedImage} onClose={props.onCloseImage} />
       
           
      <BulkDateSheet isOpen={props.isBulkDateSheetOpen} onClose={props.onCloseBulkDate} selectedCount={props.selectedCount} onSetDate={props.onBulkSetDate} />
      <BulkReminderSheet isOpen={props.isBulkReminderSheetOpen} onClose={props.onCloseBulkReminder} selectedCount={props.selectedCount} onSetReminder={props.onBulkSetReminder} />
      <BulkRepeatSheet isOpen={props.isBulkRepeatSheetOpen} onClose={props.onCloseBulkRepeat} selectedCount={props.selectedCount} onSetRepeat={props.onBulkSetRepeat} />
      <BulkSectionMoveSheet isOpen={props.isBulkSectionMoveOpen} onClose={props.onCloseBulkSectionMove} selectedCount={props.selectedCount} sections={props.sections} onMoveToSection={props.onBulkMoveToSection} />
      <BulkStatusSheet isOpen={props.isBulkStatusOpen} onClose={props.onCloseBulkStatus} selectedCount={props.selectedCount} onStatusChange={props.onBulkStatusChange} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!props.deleteConfirmItem} onOpenChange={() => props.onCloseDeleteConfirm()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('tasks.confirmDelete', 'Delete Task?')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{t('tasks.confirmDeleteMessage', 'Are you sure you want to delete this task?')}</p>
          <p className="text-sm font-medium truncate">{props.deleteConfirmItem?.text}</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={props.onCloseDeleteConfirm}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" className="flex-1" onClick={props.onConfirmDelete}>{t('common.delete', 'Delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Task Move Sheet (swipe action) */}
      <TaskMoveSheet
        isOpen={!!props.swipeMoveTaskId}
        onClose={props.onCloseSwipeMove}
        folders={props.folders}
        sections={props.sections}
        onSelectFolder={props.onSwipeMoveFolder}
        onSelectSection={props.onSwipeMoveSection}
        currentFolderId={props.swipeMoveCurrentFolderId}
        currentSectionId={props.swipeMoveCurrentSectionId}
      />

      {/* Single Task Date Sheet (swipe action) */}
      <Sheet open={!!props.swipeDateTaskId} onOpenChange={(open) => !open && props.onCloseSwipeDate()}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <CalendarIcon2 className="h-5 w-5" />
              {t('tasks.setDate', 'Set Date')}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => { if (props.swipeDateTaskId) props.onSwipeDateSet(props.swipeDateTaskId, new Date()); props.onCloseSwipeDate(); }}>
                {t('common.today', 'Today')}
              </Button>
              <Button variant="outline" onClick={() => { if (props.swipeDateTaskId) { const d = new Date(); d.setDate(d.getDate() + 1); props.onSwipeDateSet(props.swipeDateTaskId, d); } props.onCloseSwipeDate(); }}>
                {t('common.tomorrow', 'Tomorrow')}
              </Button>
              <Button variant="outline" onClick={() => { if (props.swipeDateTaskId) { const d = new Date(); d.setDate(d.getDate() + 7); props.onSwipeDateSet(props.swipeDateTaskId, d); } props.onCloseSwipeDate(); }}>
                {t('common.nextWeek', 'Next Week')}
              </Button>
            </div>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { if (props.swipeDateTaskId) props.onSwipeDateSet(props.swipeDateTaskId, undefined); props.onCloseSwipeDate(); }}>
              {t('tasks.clearDate', 'Clear Date')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Streak Challenge Dialog */}
      <StreakChallengeDialog
        isOpen={props.showStreakChallenge}
        onClose={props.onCloseStreakChallenge}
        currentStreak={props.currentStreak}
        weekData={props.streakWeekData}
      />
    </>
  );
};
