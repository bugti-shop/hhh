import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ALL_JOURNEYS, startJourney } from '@/utils/virtualJourneyStorage';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Camera, User, Check, PenLine, CheckCircle2, CalendarDays, Target, Lightbulb, Bell, BarChart3, Star, Trophy, FlaskConical, Link, Monitor, Rocket, Heart, TrendingUp, Brain, Zap, Palette, Save, Trash2, BookOpen, Briefcase, Activity, Sparkles, MapPin, Plus, Folder as FolderIcon, Gift, Info, Unlock, Crown } from 'lucide-react';
import appLogo from '@/assets/app-logo.webp';

import { MemoryRouter } from 'react-router-dom';

import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';
import type { TodoItem, TaskSection, Folder } from '@/types/note';
import { NoteEditor } from '@/components/NoteEditor';
import { TaskInputSheet } from '@/components/TaskInputSheet';
import { ProfileImageCropper } from '@/components/ProfileImageCropper';
import { LazyConfetti } from '@/components/LazyConfetti';
import { triggerHaptic } from '@/utils/haptics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { setSetting, getSetting } from '@/utils/settingsStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { saveUserProfile, loadUserProfile } from '@/hooks/useUserProfile';

import { StreakDay1Screen } from '@/components/StreakDay1Screen';
import { StreakConsistencyCertificate } from '@/components/StreakConsistencyCertificate';


const ONBOARDING_COLOR = '#3c78f0';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const goalOptions = [
  'Study & Learning',
  'Work & Career',
  'Personal & Daily Life',
  'Creative Projects',
  'Health & Fitness',
  'Something else',
];


const PLAN_STEPS = [
  'Analyzing your answers',
  'Building your productivity plan',
  'Setting up your workspace',
  'Adding finishing touches',
];

const PlanLoadingScreen = ({ onComplete, displayName }: { onComplete: () => void; displayName: string }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const tPlanSteps = useMemo(() => [
    t('onboarding.loadingAnalyzing'),
    t('onboarding.loadingBuilding'),
    t('onboarding.loadingSetup'),
    t('onboarding.loadingFinishing'),
  ], [t]);

  useEffect(() => {
    const duration = 4500;
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      const stepIdx = Math.min(PLAN_STEPS.length, Math.floor((elapsed / duration) * (PLAN_STEPS.length + 0.5)));
      setCompletedSteps(stepIdx);
      if (elapsed >= duration) {
        clearInterval(timer);
        triggerHaptic();
        setTimeout(onComplete, 600);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [onComplete]);

  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-white items-center justify-center"
      style={{
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
      }}
    >
      <div className="flex flex-col items-center px-8">
        {/* Circular progress */}
        <div className="relative w-52 h-52 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#e8e8e8" strokeWidth="12" />
            <circle
              cx="100" cy="100" r="90" fill="none"
              stroke={ONBOARDING_COLOR}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[42px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight">{progress}%</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[28px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-center leading-tight mb-8">
          {t('onboarding.creatingPlan')}
        </h1>

        {/* Checklist */}
        <div className="flex flex-col gap-4 w-full max-w-[300px]">
          {tPlanSteps.map((label, i) => {
            const done = i < completedSteps;
            const active = i === completedSteps && progress < 100;
            return (
              <div key={label} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={{
                    backgroundColor: done ? ONBOARDING_COLOR : 'transparent',
                    border: `2px solid ${done ? ONBOARDING_COLOR : active ? '#aaa' : '#ddd'}`,
                  }}
                >
                  {done && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </div>
                <span
                  className="text-[15px] font-medium font-['Nunito_Sans'] transition-all duration-300"
                  style={{
                    color: done ? '#1a1a1a' : active ? '#888' : '#ccc',
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const FOLDER_COLORS = ['#3c78f0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4'];

// Sub-component for folder creation in onboarding
const OnboardingFolderCreation = ({ type, folders, setFolders, progressPercent, stepLabel, handleBack, goNext }: {
  type: 'notes' | 'tasks';
  folders: { id: string; name: string; color: string }[];
  setFolders: (folders: { id: string; name: string; color: string }[]) => void;
  progressPercent: string;
  stepLabel: string;
  handleBack: () => void;
  goNext: () => void;
}) => {
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);

  const handleCreate = () => {
    if (!folderName.trim()) return;
    triggerHaptic();
    const newFolder = { id: crypto.randomUUID(), name: folderName.trim(), color: selectedColor };
    setFolders([...folders, newFolder]);
    setFolderName('');
    setSelectedColor(FOLDER_COLORS[(folders.length + 1) % FOLDER_COLORS.length]);
  };

  const handleRemove = (id: string) => {
    triggerHaptic();
    setFolders(folders.filter(f => f.id !== id));
  };

  const title = type === 'notes' ? t('onboarding.createNotesFolders') : t('onboarding.createTaskFolders');
  const subtitle = type === 'notes'
    ? t('onboarding.notesFolderSubtitle')
    : t('onboarding.tasksFolderSubtitle');
  const icon = type === 'notes' ? '📝' : '✅';
  const accentGradient = type === 'notes'
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ paddingTop: 'var(--safe-top, 0px)', paddingBottom: 'var(--safe-bottom, 0px)' }}>
      {/* Header */}
      <div className="flex items-end gap-3 px-4 pt-3 pb-2">
        <motion.button
          className="w-[17px] h-[17px] flex items-center justify-center cursor-pointer"
          onClick={handleBack}
          aria-label="Back"
          whileTap={{ scale: 0.85 }}
        >
          <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
        </motion.button>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
          <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
            <motion.div className="h-full rounded-[6px]" style={{ backgroundColor: '#3c78f0' }} initial={{ width: '0%' }} animate={{ width: progressPercent }} transition={{ duration: 0.5, ease: 'easeOut' }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pt-4 overflow-y-auto pb-4">
        {/* Hero section with gradient accent */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5"
        >
          {/* Icon removed per design */}
          <h1 className="text-[26px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight leading-tight">{title}</h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] mt-1.5"
          >
            {subtitle}
          </motion.p>
        </motion.div>

        {/* Create folder form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[#eee] bg-gradient-to-b from-[#fafafa] to-white p-4 mb-4 shadow-sm"
        >
          <p className="text-[14px] font-bold text-[#1a1a1a] font-['Nunito_Sans'] mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4" style={{ color: type === 'notes' ? '#667eea' : '#11998e' }} />
            {t('onboarding.newFolder')}
          </p>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={t('onboarding.folderName')}
            className="w-full px-4 py-3 rounded-xl border border-[#e0e0e0] bg-white text-[15px] text-[#1a1a1a] placeholder-[#bbb] outline-none focus:border-[#3c78f0] focus:ring-2 focus:ring-[#3c78f0]/10 transition-all duration-200 mb-3"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />

          {/* Color picker */}
          <p className="text-[12px] font-semibold text-[#999] uppercase tracking-wider mb-2">{t('onboarding.color')}</p>
          <div className="flex gap-2 mb-4 flex-wrap">
            {FOLDER_COLORS.map((color, i) => (
              <motion.button
                key={color}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 300 }}
                onClick={() => { triggerHaptic(); setSelectedColor(color); }}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200"
                style={{
                  backgroundColor: color,
                  boxShadow: selectedColor === color ? `0 0 0 3px white, 0 0 0 5px ${color}` : `0 2px 8px ${color}30`,
                  transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)',
                }}
                whileTap={{ scale: 0.85 }}
              >
                {selectedColor === color && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          {/* Create button */}
          <motion.button
            onClick={handleCreate}
            disabled={!folderName.trim()}
            className="w-full py-3 rounded-xl text-[15px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md active:translate-y-[2px]"
            style={{
              background: folderName.trim() ? '#1a1a1a' : '#ebeff2',
              color: folderName.trim() ? '#f7f7f7' : '#82878a',
              boxShadow: folderName.trim() ? '0 4px 0 0 #000' : 'none',
            }}
            whileTap={{ scale: 0.97 }}
          >
            {t('onboarding.createFolder')}
          </motion.button>
        </motion.div>

        {/* Created folders list */}
        {folders.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-2"
          >
            <p className="text-[12px] font-semibold text-[#999] uppercase tracking-wider px-1 mb-1">
              {t('onboarding.foldersCreated', { count: folders.length })}
            </p>
            {folders.map((folder, i) => (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
                className="flex items-center gap-3 py-3 px-4 rounded-xl bg-white border border-[#eee] shadow-sm"
              >
                <motion.div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${folder.color}, ${folder.color}cc)` }}
                  whileHover={{ rotate: 5 }}
                >
                  <FolderIcon className="h-4 w-4 text-white" />
                </motion.div>
                <span className="flex-1 text-[15px] font-semibold text-[#1a1a1a]">{folder.name}</span>
                <motion.button
                  onClick={() => handleRemove(folder.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer hover:bg-red-50 active:bg-red-100 transition-colors"
                  whileTap={{ scale: 0.85 }}
                >
                  <Trash2 className="h-4 w-4 text-[#ccc] hover:text-red-400 transition-colors" />
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Empty state */}
        {folders.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col items-center justify-center py-8 opacity-40"
          >
            <FolderIcon className="h-10 w-10 text-[#ccc] mb-2" />
            <p className="text-[13px] text-[#aaa]">{t('onboarding.noFoldersEmpty')}</p>
          </motion.div>
        )}
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
        <motion.button
          onClick={() => { triggerHaptic(); goNext(); }}
          className="w-full py-3.5 rounded-2xl text-[17px] font-bold active:translate-y-[2px]"
          style={{
            background: folders.length > 0 ? 'linear-gradient(135deg, #1a1a1a 0%, #333 100%)' : '#ebeff2',
            boxShadow: folders.length > 0 ? '0 8px 0 0 #000' : '0 6px 0 0 #d1d5d8',
            color: folders.length > 0 ? '#f7f7f7' : '#82878a',
          }}
          whileTap={{ scale: 0.97, y: 4 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          {folders.length > 0 ? `${t('onboarding.continue')} · ${t('onboarding.foldersCreated', { count: folders.length })}` : t('onboarding.skip')}
        </motion.button>
      </div>
    </div>
  );
};

// Sub-component for step 15: embeds the real Today page with all features
const OnboardingTaskViewStep = ({ createdTasks, setCreatedTasks, progressPercent, stepLabel, handleBack, goNext, onOpenBatch }: {
  createdTasks: TodoItem[];
  setCreatedTasks: (tasks: TodoItem[]) => void;
  progressPercent: string;
  stepLabel: string;
  handleBack: () => void;
  goNext: () => void;
  onOpenBatch: () => void;
}) => {
  const { t } = useTranslation();
  const TodayPage = useMemo(() => lazy(() => import('@/pages/todo/Today')), []);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
      {/* Onboarding progress header */}
      <div className="flex items-center gap-3 px-4 pt-1 pb-1 relative z-50 bg-white">
        <button className="w-[17px] h-[17px] flex items-center justify-center" onClick={handleBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
          <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
            <motion.div className="h-full" style={{ backgroundColor: ONBOARDING_COLOR }} initial={{ width: '0%' }} animate={{ width: progressPercent }} transition={{ duration: 0.5, ease: 'easeOut' }} />
          </div>
        </div>
      </div>

      {/* Real Today page embedded */}
      <div className="flex-1 overflow-hidden relative onboarding-embedded">
        <Suspense fallback={null}>
          <MemoryRouter initialEntries={['/todo/today']}>
            <TodayPage />
          </MemoryRouter>
        </Suspense>
      </div>

      {/* Bottom buttons */}
      <div className="px-4 pb-2 pt-1 flex flex-col gap-1.5 relative z-50 bg-white" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 4px)' }}>
        <motion.button onClick={goNext} className="w-full py-3 rounded-2xl text-[17px] font-bold" style={{ backgroundColor: '#333333', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }} whileTap={{ scale: 0.97 }}>
          {t('onboarding.continue')}
        </motion.button>
      </div>
    </div>
  );
};

// Inline batch task form for onboarding full-screen
const OnboardingBatchTaskForm = ({ sections, folders, onAddTasks, onCancel }: {
  sections: TaskSection[];
  folders: Folder[];
  onAddTasks: (tasks: string[], sectionId?: string, folderId?: string, priority?: string, dueDate?: Date) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('none');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const taskCount = text.split('\n').filter(line => line.trim().length > 0).length;

  const handleAdd = () => {
    const tasks = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (tasks.length > 0) {
      onAddTasks(tasks, selectedSection || undefined, selectedFolder || undefined, selectedPriority !== 'none' ? selectedPriority : undefined, selectedDate);
    }
  };

  const priorityOptions = [
    { value: 'high', label: t('onboarding.priorityHigh', 'High'), color: '#DC2626' },
    { value: 'medium', label: t('onboarding.priorityMedium', 'Medium'), color: '#F59E0B' },
    { value: 'low', label: t('onboarding.priorityLow', 'Low'), color: '#22C55E' },
    { value: 'none', label: t('onboarding.priorityNone', 'None'), color: '#9CA3AF' },
  ];

  return (
    <div className="flex flex-col gap-4 flex-1">
      <textarea
        placeholder={t('onboarding.taskPlaceholder', 'Buy groceries\nCall dentist\nFinish report\n...')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full min-h-[180px] resize-none rounded-2xl p-4 text-[15px] outline-none"
        style={{ backgroundColor: '#f9fafb', border: '2px solid #e5e7eb', color: '#1a1a1a' }}
        autoFocus
      />

      {/* Section selector */}
      {sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#767b7e]">{t('common.section', 'Section')}</span>
          <div className="flex flex-wrap gap-2">
            {sections.map(s => (
              <motion.button
                key={s.id}
                onClick={() => { triggerHaptic(); setSelectedSection(selectedSection === s.id ? '' : s.id); }}
                className="px-3 py-1.5 rounded-xl text-[13px] font-medium cursor-pointer"
                style={{
                  backgroundColor: selectedSection === s.id ? `${s.color}20` : '#f3f4f6',
                  border: `1.5px solid ${selectedSection === s.id ? s.color : '#e5e7eb'}`,
                  color: selectedSection === s.id ? s.color : '#6b7280',
                }}
                whileTap={{ scale: 0.95 }}
              >
                {s.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Folder selector */}
      {folders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#767b7e]">{t('common.folder', 'Folder')}</span>
          <div className="flex flex-wrap gap-2">
            {folders.map(f => (
              <motion.button
                key={f.id}
                onClick={() => { triggerHaptic(); setSelectedFolder(selectedFolder === f.id ? '' : f.id); }}
                className="px-3 py-1.5 rounded-xl text-[13px] font-medium cursor-pointer"
                style={{
                  backgroundColor: selectedFolder === f.id ? '#3c78f010' : '#f3f4f6',
                  border: `1.5px solid ${selectedFolder === f.id ? '#3c78f0' : '#e5e7eb'}`,
                  color: selectedFolder === f.id ? '#3c78f0' : '#6b7280',
                }}
                whileTap={{ scale: 0.95 }}
              >
                {f.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Priority selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#767b7e]">{t('common.priority', 'Priority')}</span>
        <div className="flex gap-2">
          {priorityOptions.map(p => (
            <motion.button
              key={p.value}
              onClick={() => { triggerHaptic(); setSelectedPriority(p.value); }}
              className="flex-1 py-2 rounded-xl text-[13px] font-medium cursor-pointer"
              style={{
                backgroundColor: selectedPriority === p.value ? `${p.color}15` : '#f3f4f6',
                border: `1.5px solid ${selectedPriority === p.value ? p.color : '#e5e7eb'}`,
                color: selectedPriority === p.value ? p.color : '#6b7280',
              }}
              whileTap={{ scale: 0.95 }}
            >
              {p.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Due date picker */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#767b7e]">{t('common.dueDate', 'Due Date')}</span>
        <motion.button
          onClick={() => { triggerHaptic(); }}
          className="relative w-full cursor-pointer"
          whileTap={{ scale: 0.98 }}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-full py-2.5 px-3 rounded-xl text-[13px] font-medium text-left flex items-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: selectedDate ? '#3c78f010' : '#f3f4f6',
                  border: `1.5px solid ${selectedDate ? '#3c78f0' : '#e5e7eb'}`,
                  color: selectedDate ? '#3c78f0' : '#6b7280',
                }}
              >
                <CalendarDays className="h-4 w-4" />
                {selectedDate ? format(selectedDate, 'MMM d, yyyy') : t('onboarding.noDueDate', 'No due date')}
                {selectedDate && (
                  <span
                    className="ml-auto text-[11px] underline"
                    onClick={(e) => { e.stopPropagation(); setSelectedDate(undefined); triggerHaptic(); }}
                  >
                    Clear
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[600]" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </motion.button>
      </div>

      <div className="flex-1" />

      {/* Task count + Add button */}
      <div className="flex flex-col gap-2 pb-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 8px)' }}>
        {taskCount > 0 && (
          <p className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] text-center">{t('onboarding.tasksReadyToAdd', '{{count}} task(s) ready to add', { count: taskCount })}</p>
        )}
        <motion.button
          onClick={handleAdd}
          disabled={taskCount === 0}
          className="w-full py-3 rounded-2xl text-[16px] font-bold cursor-pointer"
          style={{
            backgroundColor: taskCount > 0 ? '#333333' : '#e5e7eb',
            color: taskCount > 0 ? '#ffffff' : '#9ca3af',
            boxShadow: taskCount > 0 ? '0 8px 0 0 #000000' : 'none',
          }}
          whileTap={taskCount > 0 ? { scale: 0.97 } : undefined}
        >
          {taskCount > 0 ? t('onboarding.addCountTasks', 'Add {{count}} Task(s)', { count: taskCount }) : t('onboarding.addTasks', 'Add Tasks')}
        </motion.button>
      </div>
    </div>
  );
};

const TodayPage = lazy(() => import('@/pages/todo/Today'));

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(-3); // -3 = language selection
  const [selectedGoal, setSelectedGoal] = useState<Set<string>>(new Set());
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedPreviousApp, setSelectedPreviousApp] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState(i18n?.language?.split('-')[0] || 'en');
  // Interactive creation states
  const [selectedUnfinished, setSelectedUnfinished] = useState<string | null>(null);
  const [selectedSlowdown, setSelectedSlowdown] = useState<string | null>(null);
  const [selectedWhyFail, setSelectedWhyFail] = useState<string | null>(null);
  const [onboardingNoteSaved, setOnboardingNoteSaved] = useState(false);
  const [sketchSaved, setSketchSaved] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<TodoItem[]>([]);
  const [createdTask, setCreatedTask] = useState<TodoItem | null>(null);
  const [isTaskInputSheetOpen, setIsTaskInputSheetOpen] = useState(true);
  const [showNotesFolderCreation, setShowNotesFolderCreation] = useState(false);
  const [showTasksFolderCreation, setShowTasksFolderCreation] = useState(false);
  const [notesFolders, setNotesFolders] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tasksFolders, setTasksFolders] = useState<{ id: string; name: string; color: string }[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [selectedFrustration, setSelectedFrustration] = useState<string | null>(null);
  const [selectedTaskView, setSelectedTaskView] = useState<string | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [selectedOffline, setSelectedOffline] = useState<string | null>(null);
  const [firstStepShown, setFirstStepShown] = useState(false);
  const [showStreakDay1, setShowStreakDay1] = useState(false);
  const [showOnboardingCertificate, setShowOnboardingCertificate] = useState(false);
  const [showReadyScreen, setShowReadyScreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openPaywall, checkStripeByEmail } = useSubscription();
  

  // ===== ONBOARDING STATE PERSISTENCE =====
  // Load saved onboarding state on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await getSetting<any>('onboarding_progress_state', null);
        if (!saved || typeof saved !== 'object') return;
        if (typeof saved.step === 'number' && saved.step >= -2 && saved.step <= 36) {
          // Redirect removed steps to the closest valid step
          const removedSteps = new Set([1, 2, 4, 7, 8, 9, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 27]);
          if (removedSteps.has(saved.step)) {
            setStep(0); // restart from first question
          } else {
            setStep(saved.step);
          }
        }
        if (saved.userName) setUserName(saved.userName);
        if (saved.avatarPreview) setAvatarPreview(saved.avatarPreview);
        if (saved.selectedGoal) setSelectedGoal(new Set(Array.isArray(saved.selectedGoal) ? saved.selectedGoal : [saved.selectedGoal]));
        if (saved.selectedSource) setSelectedSource(saved.selectedSource);
        if (saved.selectedPreviousApp) setSelectedPreviousApp(saved.selectedPreviousApp);
        // Legacy fields from removed steps are ignored
        if (saved.onboardingNoteSaved) setOnboardingNoteSaved(true);
        if (saved.sketchSaved) setSketchSaved(true);
        if (saved.selectedJourneyId) setSelectedJourneyId(saved.selectedJourneyId);
        if (saved.selectedLang) setSelectedLang(saved.selectedLang);
        if (saved.firstStepShown) setFirstStepShown(true);
        if (saved.createdTaskIds?.length) {
          const tasks = await loadTodoItems();
          setCreatedTasks(tasks.filter(t => saved.createdTaskIds.includes(t.id)));
        }
        if (saved.notesFolders?.length) setNotesFolders(saved.notesFolders);
        if (saved.tasksFolders?.length) setTasksFolders(saved.tasksFolders);
      } catch (e) {
        console.warn('Failed to restore onboarding state:', e);
      }
    })();
  }, []);

  // Save onboarding state on every meaningful change
  useEffect(() => {
    if (step < -2) return; // Don't save language/splash screens
    const state = {
      step,
      userName,
      avatarPreview,
      selectedGoal: Array.from(selectedGoal),
      selectedSource,
      selectedPreviousApp,
      onboardingNoteSaved,
      sketchSaved,
      createdTaskIds: createdTasks.map(t => t.id),
      selectedJourneyId,
      notesFolders,
      tasksFolders,
      selectedLang,
      firstStepShown,
    };
    setSetting('onboarding_progress_state', state);
  }, [step, userName, avatarPreview, selectedGoal, selectedSource, selectedPreviousApp, onboardingNoteSaved, sketchSaved, createdTasks, selectedJourneyId, notesFolders, tasksFolders, selectedLang, firstStepShown]);

  // ===== FIRST STEP CELEBRATION — triggered after welcome screen =====
  // (No longer auto-triggers at step 15; instead triggered when user taps "Let's Go" on welcome screen)

  // Translated option arrays (must be inside component to access t())
  const tGoalOptions = useMemo(() => [
    t('onboarding.goalNoteTaking'),
    t('onboarding.goalTaskManagement'),
    t('onboarding.goalSketchBook'),
    t('onboarding.goalCoding'),
    t('onboarding.goalPersonalInfo'),
  ], [t]);

  const tSourceOptions = useMemo(() => [
    t('onboarding.sourceInstagram'),
    t('onboarding.sourceFacebook'),
    t('onboarding.sourceTikTok'),
    t('onboarding.sourceYouTube'),
    t('onboarding.sourceFriends'),
    t('onboarding.sourceCreator'),
    t('onboarding.sourceAI'),
    t('onboarding.sourceOther'),
  ], [t]);

  const tPreviousAppOptions = useMemo(() => [
    t('onboarding.prevAppNotion'),
    t('onboarding.prevAppEvernote'),
    t('onboarding.prevAppTodoist'),
    t('onboarding.prevAppTickTick'),
    t('onboarding.prevAppAnyDo'),
    t('onboarding.prevAppEasyNotes'),
    t('onboarding.prevAppNone'),
  ], [t]);


  const displayName = (userName.trim().split(/\s+/)[0]) || 'Friend';

  // Dynamic points based on selected goal
  const goalPointMap: Record<string, { icon: any; bg: string; color: string; key: string }> = useMemo(() => ({
    [t('onboarding.goalStudy')]: { icon: BookOpen, bg: '#EEF2FF', color: '#4F46E5', key: 'infoGoalStudy' },
    [t('onboarding.goalWork')]: { icon: Briefcase, bg: '#F0F9FF', color: '#0284C7', key: 'infoGoalWork' },
    [t('onboarding.goalPersonal')]: { icon: Heart, bg: '#FEF2F2', color: '#DC2626', key: 'infoGoalPersonal' },
    [t('onboarding.goalCreative')]: { icon: Palette, bg: '#FDF4FF', color: '#A855F7', key: 'infoGoalCreative' },
    [t('onboarding.goalHealth')]: { icon: Activity, bg: '#ECFDF5', color: '#059669', key: 'infoGoalHealth' },
    [t('onboarding.goalOther')]: { icon: Lightbulb, bg: '#FFF7ED', color: '#EA580C', key: 'infoGoalOther' },
  }), [t]);

  const expPointMap: Record<string, { icon: any; bg: string; color: string; key: string }> = useMemo(() => ({
    [t('onboarding.expBeginner')]: { icon: Sparkles, bg: '#FEFCE8', color: '#CA8A04', key: 'infoExpBeginner' },
    [t('onboarding.expIntermediate')]: { icon: Zap, bg: '#FFF7ED', color: '#EA580C', key: 'infoExpIntermediate' },
    [t('onboarding.expAdvanced')]: { icon: Rocket, bg: '#F0F9FF', color: '#0284C7', key: 'infoExpAdvanced' },
  }), [t]);

  const dynamicPoints = useMemo(() => {
    const points: { icon: any; bg: string; color: string; text: string }[] = [];
    const firstGoal = selectedGoal.size > 0 ? Array.from(selectedGoal)[0] : null;
    const goalEntry = firstGoal ? goalPointMap[firstGoal] : null;
    if (goalEntry) points.push({ icon: goalEntry.icon, bg: goalEntry.bg, color: goalEntry.color, text: t(`onboarding.${goalEntry.key}`) });
    points.push({ icon: Trophy, bg: '#FEFCE8', color: '#CA8A04', text: t('onboarding.infoPersonalizedPoint3') });
    return points;
  }, [selectedGoal, goalPointMap, t]);

  const tInfoScreens = useMemo(() => ({
    5: {
      title: t('onboarding.info1Title'),
      icons: [] as { icon: any; bg: string; color: string }[],
      points: [
        { icon: FlaskConical, bg: '#F0F9FF', color: '#0284C7', text: t('onboarding.info1Point1') },
        { icon: Link, bg: '#EEF2FF', color: '#4F46E5', text: t('onboarding.info1Point2') },
        { icon: Monitor, bg: '#FAF5FF', color: '#9333EA', text: t('onboarding.info1Point3') },
      ],
      button: t('onboarding.gotIt'),
    },
    13: {
      title: t('onboarding.info2Title'),
      icons: [] as { icon: any; bg: string; color: string }[],
      points: [
        { icon: TrendingUp, bg: '#ECFDF5', color: '#059669', text: t('onboarding.info2Point1') },
        { icon: Brain, bg: '#FAF5FF', color: '#9333EA', text: t('onboarding.info2Point2') },
        { icon: Zap, bg: '#FEFCE8', color: '#CA8A04', text: t('onboarding.info2Point3') },
      ],
      button: t('onboarding.continue'),
    },
  }), [t]);

  const tFeatureShowcase = useMemo(() => [
    { icon: CheckCircle2, bg: '#ECFDF5', color: '#059669', title: t('onboarding.showcaseSmartTask'), description: t('onboarding.showcaseSmartTaskDesc') },
    { icon: PenLine, bg: '#EEF2FF', color: '#4F46E5', title: t('onboarding.showcaseRichNotes'), description: t('onboarding.showcaseRichNotesDesc') },
    { icon: Target, bg: '#FEF2F2', color: '#DC2626', title: t('onboarding.showcaseHabits'), description: t('onboarding.showcaseHabitsDesc') },
    { icon: Palette, bg: '#FAF5FF', color: '#9333EA', title: t('onboarding.showcaseThemes'), description: t('onboarding.showcaseThemesDesc') },
    { icon: BarChart3, bg: '#FFF7ED', color: '#EA580C', title: t('onboarding.showcaseAnalytics'), description: t('onboarding.showcaseAnalyticsDesc') },
    { icon: Bell, bg: '#F0F9FF', color: '#0284C7', title: t('onboarding.showcaseReminders'), description: t('onboarding.showcaseRemindersDesc') },
  ], [t]);

  const tPlanSteps = useMemo(() => [
    t('onboarding.loadingAnalyzing'),
    t('onboarding.loadingBuilding'),
    t('onboarding.loadingSettingUp'),
    t('onboarding.loadingFinishing'),
  ], [t]);
  const [onboardingSections, setOnboardingSections] = useState<TaskSection[]>([]);
  const [onboardingFolders, setOnboardingFolders] = useState<Folder[]>([]);

  useEffect(() => {
    (async () => {
      const savedSections = await getSetting<TaskSection[]>('todoSections', []);
      if (savedSections.length > 0) setOnboardingSections(savedSections);
      else setOnboardingSections([{ id: 'default', name: 'Tasks', color: '#3b82f6', isCollapsed: false, order: 0 }]);
      const savedFolders = await getSetting<Folder[] | null>('todoFolders', null);
      if (savedFolders) setOnboardingFolders(savedFolders.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) })));
    })();
  }, []);

  const handleToggleGoal = useCallback(async (option: string) => {
    triggerHaptic();
    setSelectedGoal(prev => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }, []);

  const handleSelectSource = useCallback(async (option: string) => {
    triggerHaptic();
    setSelectedSource(option);
  }, []);

  const handleSelectPreviousApp = useCallback(async (option: string) => {
    triggerHaptic();
    setSelectedPreviousApp(option);
  }, []);

  // New step flow:
  // 0:goal 1:source 2:experience 3:profile 4:challenges
  // 5:INFO 6:CREATE_NOTE 7:productivity 8:focus
  // 9:workstyle 10:CREATE_SKETCH 11:schedule 12:celebrate
  // 13:INFO 14:CREATE_TASK 15:VIEW_EDIT_TASK 16:progress 17:consistency
  // 18:energy 19:streak 20:remind
  // 21:INFO 22:features 23:improve
  // 24:JOURNEY_SELECT 25:showcase 26:loading 27:welcome

  const goNext = useCallback(async () => {
    try {
    triggerHaptic();

    if (step === 0) {
      // Skip old question screens, go straight to profile
      setStep(3);
    } else if (step === 3) {
      if (!userName.trim()) return;
      const existing = await loadUserProfile();
      await saveUserProfile({ ...existing, name: userName.trim(), avatarUrl: avatarPreview || existing.avatarUrl });
      setStep(28); // → previous app question
    } else if (step === 28) {
      if (!selectedPreviousApp) return;
      await setSetting('onboarding_previous_app', selectedPreviousApp);
      if (selectedPreviousApp === 'None') {
        setStep(31); // skip frustration if no previous app, go to task view
      } else {
        setStep(30); // → frustration question
      }
    } else if (step === 30) {
      if (!selectedFrustration) return;
      await setSetting('onboarding_frustration', selectedFrustration);
      setStep(31); // → task view preference
    } else if (step === 31) {
      if (!selectedTaskView) return;
      await setSetting('onboarding_task_view', selectedTaskView);
      setStep(24); // → journey selection
    } else if (step === 32) {
      if (selectedDevices.size === 0) return;
      await setSetting('onboarding_devices', Array.from(selectedDevices));
      setStep(10); // → sketch (moved here, after devices)
    } else if (step === 10) {
      setStep(33); // → offline (sketch now leads to offline)
    } else if (step === 33) {
      if (!selectedOffline) return;
      await setSetting('onboarding_offline', selectedOffline);
      setStep(5); // → folders
    } else if (step === 34) {
      if (!selectedUnfinished) return;
      await setSetting('onboarding_unfinished', selectedUnfinished);
      setStep(35); // → slowdown
    } else if (step === 35) {
      if (!selectedSlowdown) return;
      await setSetting('onboarding_slowdown', selectedSlowdown);
      setStep(36); // → why apps fail
    } else if (step === 36) {
      if (!selectedWhyFail) return;
      await setSetting('onboarding_why_fail', selectedWhyFail);
      setStep(6); // → create note
    } else if (step === 5 && !showNotesFolderCreation && !showTasksFolderCreation) {
      setShowNotesFolderCreation(true); // INFO → Notes folder creation
    } else if (step === 5 && showNotesFolderCreation) {
      // Save notes folders to settings (same key as Notes page: 'folders')
      try {
        if (notesFolders.length > 0) {
          const existingFolders = await getSetting<Folder[]>('folders', []);
          const newFolders: Folder[] = notesFolders.map(f => ({
            id: f.id,
            name: f.name,
            color: f.color,
            isDefault: false,
            createdAt: new Date(),
          }));
          const merged = [...existingFolders, ...newFolders];
          await setSetting('folders', merged);
          // Verify persistence
          const verify = await getSetting<Folder[]>('folders', []);
          console.log('[Onboarding] Saved notes folders:', merged.length, 'Verified:', verify.length, verify.map(f => f.name));
          window.dispatchEvent(new Event('foldersUpdated'));
        }
      } catch (e) {
        console.warn('Failed to save notes folders:', e);
      }
      setShowNotesFolderCreation(false);
      setShowTasksFolderCreation(true); // → Tasks folder creation
    } else if (step === 5 && showTasksFolderCreation) {
      // Save tasks folders to settings (same key as Tasks page: 'todoFolders')
      try {
        if (tasksFolders.length > 0) {
          const existingFolders = await getSetting<Folder[]>('todoFolders', []);
          const newFolders: Folder[] = tasksFolders.map(f => ({
            id: f.id,
            name: f.name,
            color: f.color,
            isDefault: false,
            createdAt: new Date(),
          }));
          const merged = [...existingFolders, ...newFolders];
          await setSetting('todoFolders', merged);
          // Verify persistence
          const verify = await getSetting<Folder[]>('todoFolders', []);
          console.log('[Onboarding] Saved task folders:', merged.length, 'Verified:', verify.length, verify.map(f => f.name));
          window.dispatchEvent(new Event('foldersUpdated'));
        }
      } catch (e) {
        console.warn('Failed to save task folders:', e);
      }
      setShowTasksFolderCreation(false);
      setStep(34); // → unfinished tasks
    } else if (step === 6) {
      setStep(13); // → INFO (sketch moved to after devices)
    } else if (step === 13) {
      setStep(25); // → feature showcase (skip task creation step 14)
    } else if (step === 25) {
      setStep(26); // → loading screen
    } else if (step === 24) {
      if (selectedJourneyId) {
        startJourney(selectedJourneyId);
        setStep(29);
      } else {
        setStep(32); // no journey → devices directly
      }
    } else if (step === 29) {
      setStep(32); // → devices
    }
    } catch (error) {
      console.warn('Onboarding goNext error:', error);
    }
  }, [step, selectedGoal, selectedSource, selectedPreviousApp, selectedFrustration, selectedTaskView, selectedDevices, selectedOffline, selectedUnfinished, selectedSlowdown, selectedWhyFail, userName, avatarPreview, onboardingNoteSaved, sketchSaved, showNotesFolderCreation, showTasksFolderCreation, notesFolders, tasksFolders, selectedJourneyId]);

  const saveOnboardingResponses = useCallback(async () => {
    try {
      const deviceId = localStorage.getItem('flowist_device_id') || crypto.randomUUID();
      localStorage.setItem('flowist_device_id', deviceId);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('onboarding_responses' as any).insert({
        device_id: deviceId,
        user_email: user?.email || null,
        language: selectedLang,
        goals: Array.from(selectedGoal),
        source: selectedSource,
        previous_app: selectedPreviousApp,
        frustration: selectedFrustration,
        task_view_preference: selectedTaskView,
        journey_selected: selectedJourneyId,
        devices: Array.from(selectedDevices),
        offline_preference: selectedOffline,
        unfinished_reason: selectedUnfinished,
        slowdown_reason: selectedSlowdown,
        why_apps_fail: selectedWhyFail,
        user_name: userName.trim(),
        note_created: onboardingNoteSaved,
        sketch_created: sketchSaved,
        tasks_created_count: createdTasks.length,
        notes_folders_count: notesFolders.length,
        tasks_folders_count: tasksFolders.length,
      });
      console.log('[Onboarding] Responses saved to database');
    } catch (e) {
      console.warn('[Onboarding] Failed to save responses:', e);
    }
  }, [selectedLang, selectedGoal, selectedSource, selectedPreviousApp, selectedFrustration, selectedTaskView, selectedJourneyId, selectedDevices, selectedOffline, selectedUnfinished, selectedSlowdown, selectedWhyFail, userName, onboardingNoteSaved, sketchSaved, createdTasks.length, notesFolders.length, tasksFolders.length]);

  const handleFinishWelcome = useCallback(async () => {
    triggerHaptic();
    // Save all onboarding responses to database
    await saveOnboardingResponses();
    // If user earned the first step badge, show celebration before paywall
    const earned = onboardingNoteSaved && sketchSaved && createdTasks.length > 0;
    if (earned && !firstStepShown) {
      setFirstStepShown(true);
      await setSetting('flowist_first_step_earned', {
        userName: userName.trim(),
        earnedAt: new Date().toISOString(),
      });
      setShowStreakDay1(true);
    } else {
      // No celebration needed, show streak day 1
      setShowStreakDay1(true);
    }
  }, [onComplete, openPaywall, onboardingNoteSaved, sketchSaved, createdTasks.length, firstStepShown, userName, saveOnboardingResponses]);

  const handleBack = useCallback(async () => {
    await triggerHaptic();
    if (step === 0) setStep(-2);
    else if (step === -2) setStep(-3);
    else if (step === 3) setStep(0); // back from profile → pre-steps
    else if (step === 28) setStep(3); // back from previous app → profile
    else if (step === 30) setStep(28); // back from frustration → previous app
    else if (step === 31) setStep(selectedPreviousApp === 'None' || !selectedPreviousApp ? 28 : 30); // back from task view → frustration or previous app
    else if (step === 24) setStep(31); // back from journey → task view
    else if (step === 29) setStep(24); // back from adventure begins → journey
    else if (step === 32) setStep(selectedJourneyId ? 29 : 24); // back from devices → adventure or journey
    else if (step === 33) setStep(10); // back from offline → sketch
    else if (step === 10) setStep(32); // back from sketch → devices
    else if (step === 5) setStep(33); // back from folders → offline
    else if (step === 34) setStep(5); // back from unfinished → folders
    else if (step === 35) setStep(34); // back from slowdown → unfinished
    else if (step === 36) setStep(35); // back from why fail → slowdown
    else if (step === 6) setStep(36); // back from note → why fail
    else if (step === 13) setStep(6); // back from INFO → note (sketch removed from here)
    else if (step === 25) setStep(13); // back from showcase → INFO (skip task step 14)
  }, [step, selectedJourneyId]);

  const handleImagePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropImageSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  useEffect(() => {
    if (step === 14) {
      setIsTaskInputSheetOpen(true);
    }
  }, [step]);

  const INFO_STEPS = new Set([5, 13]);
  const INTERACTIVE_STEPS = new Set([6, 10, 14]);

  // Sequential flow order mapping: internal step → display position (exclude pre-steps -3,-2,-1)
  // Step 5 has 3 sub-screens (info, notes folders, tasks folders) — use 5.1/5.2 as virtual entries
  const FLOW_ORDER: number[] = [0, 3, 28, 30, 31, 24, 29, 32, 10, 33, 5, 5.1, 5.2, 34, 35, 36, 6, 13, 25, 26];
  const stepCount = FLOW_ORDER.length;
  // For step 5, determine sub-step based on folder creation state
  const getDisplayStep = () => {
    if (step === 5) {
      if (showTasksFolderCreation) return FLOW_ORDER.indexOf(5.2) + 1;
      if (showNotesFolderCreation) return FLOW_ORDER.indexOf(5.1) + 1;
      return FLOW_ORDER.indexOf(5) + 1;
    }
    const flowIndex = FLOW_ORDER.indexOf(step);
    return flowIndex >= 0 ? flowIndex + 1 : step < 0 ? 0 : Math.min(step + 1, stepCount);
  };
  const displayStep = getDisplayStep();
  const stepLabel = step < 0 ? '' : `${displayStep} / ${stepCount}`;
  const progressPercent = step < 0 ? '0%' : `${Math.min(100, Math.round(((displayStep - 1 + (currentStepDone() ? 1 : 0.4)) / stepCount) * 100))}%`;

  function currentStepDone() {
    if (INFO_STEPS.has(step)) return true;
    if (INTERACTIVE_STEPS.has(step)) return true;
    if (step === 0) return selectedGoal.size > 0;
    if (step === 3) return !!userName.trim();
    
    if (step === 28) return !!selectedPreviousApp;
    if (step === 30) return !!selectedFrustration;
    if (step === 31) return !!selectedTaskView;
    if (step === 32) return selectedDevices.size > 0;
    if (step === 33) return !!selectedOffline;
    if (step === 34) return !!selectedUnfinished;
    if (step === 35) return !!selectedSlowdown;
    if (step === 36) return !!selectedWhyFail;
    return true;
  }

  const currentValid = currentStepDone();

  // displayName already defined above

  // Add/remove body class for z-index overrides on Radix portals
  useEffect(() => {
    if ([6, 10].includes(step)) {
      document.body.classList.add('onboarding-active');
    } else {
      document.body.classList.remove('onboarding-active');
    }
    return () => { document.body.classList.remove('onboarding-active'); };
  }, [step]);

  // Welcome splash (step -1) removed

  // Language selection screen (step -3)
  if (step === -3) {
    const languages = [
      { code: 'en', name: 'English', native: 'English' },
      { code: 'es', name: 'Spanish', native: 'Español' },
      { code: 'fr', name: 'French', native: 'Français' },
      { code: 'de', name: 'German', native: 'Deutsch' },
      { code: 'pt', name: 'Portuguese', native: 'Português' },
      { code: 'it', name: 'Italian', native: 'Italiano' },
      { code: 'tr', name: 'Turkish', native: 'Türkçe' },
      { code: 'ar', name: 'Arabic', native: 'العربية' },
      { code: 'he', name: 'Hebrew', native: 'עברית' },
      { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
      { code: 'ur', name: 'Urdu', native: 'اردو' },
      { code: 'ko', name: 'Korean', native: '한국어' },
      { code: 'zh', name: 'Chinese', native: '中文' },
      { code: 'ja', name: 'Japanese', native: '日本語' },
      { code: 'bn', name: 'Bengali', native: 'বাংলা' },
      { code: 'ru', name: 'Russian', native: 'Русский' },
      { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
      { code: 'mr', name: 'Marathi', native: 'मराठी' },
      { code: 'te', name: 'Telugu', native: 'తెలుగు' },
      { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    ];
    const currentLang = selectedLang;

    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center pt-10 pb-4"
        >
          <div className="flex items-center gap-2.5">
            <motion.img
              src="/favicon.webp?v=3"
              alt="Flowist"
              className="w-8 h-8"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
            />
            <span style={{ fontFamily: "'Nunito', 'Quicksand', sans-serif", fontWeight: 900, fontSize: 28, color: '#1a1a1a', letterSpacing: '-0.5px' }}>
              Flowist
            </span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="text-center text-[22px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight mb-1 px-6"
        >
          {t('onboarding.selectLanguage')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-center text-[13px] text-[#767b7e] font-['Nunito_Sans'] mb-4 px-6"
        >
          {t('onboarding.chooseLanguage')}
        </motion.p>

        {/* Language list */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="space-y-2">
            {languages.map((lang, i) => (
              <motion.button
                key={lang.code}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.1 + i * 0.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  await triggerHaptic();
                  setSelectedLang(lang.code);
                  i18n.changeLanguage(lang.code);
                  localStorage.setItem('flowist_language', lang.code);
                  const rtl = ['ar', 'he', 'ur'].includes(lang.code);
                  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
                  document.documentElement.lang = lang.code;
                }}
                className="w-full text-left px-4 py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-between"
                style={{
                  backgroundColor: currentLang === lang.code ? `${ONBOARDING_COLOR}20` : '#ffffff',
                  border: `2px solid ${currentLang === lang.code ? ONBOARDING_COLOR : '#eee'}`,
                  boxShadow: currentLang === lang.code ? `0 3px 0 0 ${ONBOARDING_COLOR}` : '0 3px 0 0 #e8e8e8',
                }}
              >
                <div>
                  <span className="font-bold text-[15px] text-[#1a1a1a]">{lang.native}</span>
                  <span className="text-[12px] text-[#999] ml-2">{lang.name}</span>
                </div>
                {currentLang === lang.code && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ONBOARDING_COLOR }}>
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Continue button */}
        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <p className="text-center text-[11px] text-[#999] mb-3 px-4">
            {t('onboarding.continue')}{' '}
            <a href="https://www.flowist.me/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline text-[#999]">
              {t('privacy.title', 'Privacy Policy')}
            </a>
            {' & '}
            <a href="https://www.flowist.me/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="underline text-[#999]">
              {t('terms.title', 'Terms & Conditions')}
            </a>
          </p>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={async () => { await triggerHaptic(); setStep(-2); }}
            className="w-full max-w-[340px] mx-auto py-3 rounded-2xl text-[16px] font-bold block"
            style={{ backgroundColor: '#333333', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }}
            whileTap={{ scale: 0.97 }}
          >
            {t('onboarding.continue')}
          </motion.button>
        </div>
      </div>
    );
  }

  // Google Sign-in / Continue without sign in screen (step -2)
  if (step === -2) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center pt-16 pb-4"
        >
          <div className="flex items-center gap-2.5">
            <motion.img
              src="/favicon.webp?v=3"
              alt="Flowist"
              className="w-9 h-9"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
            />
            <span style={{ fontFamily: "'Nunito', 'Quicksand', sans-serif", fontWeight: 900, fontSize: 28, color: '#1a1a1a', letterSpacing: '-0.5px' }}>
              Flowist
            </span>
          </div>
        </motion.div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="text-[28px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-center leading-tight mb-3"
          >
            {t('onboarding.signInTitle', 'Welcome Back?')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-[14px] text-[#767b7e] font-['Nunito_Sans'] text-center mb-10 max-w-[300px]"
          >
            {t('onboarding.signInSubtitle', 'Sign in to restore your subscription or continue as a new user')}
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onClick={async () => {
              await triggerHaptic();
              try {
                const { signInWithGoogle } = await import('@/utils/googleAuth');
                const user = await signInWithGoogle(true);
                if (user?.email) {
                  // Check Stripe for existing subscription on this Gmail
                  const hasSubscription = await checkStripeByEmail(user.email);
                  if (hasSubscription) {
                    // User has active subscription — skip onboarding, go to app
                    await setSetting('onboarding_completed', true);
                    await setSetting('onboarding_progress_state', null);
                    onComplete();
                    return;
                  }
                }
                // No subscription found — continue to onboarding
                setStep(0);
              } catch (err) {
                console.error('Google sign-in failed:', err);
                // On error, continue to onboarding
                setStep(0);
              }
            }}
            className="w-full max-w-[340px] py-3.5 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-3 cursor-pointer"
            style={{
              backgroundColor: '#ffffff',
              border: '2px solid #e8e8e8',
              color: '#1a1a1a',
              boxShadow: '0 6px 0 0 #e4e8ea',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('onboarding.signInWithGoogle', 'Sign in with Google')}
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            onClick={async () => {
              await triggerHaptic();
              setStep(0);
            }}
            className="w-full max-w-[340px] mt-4 py-3.5 rounded-2xl text-[16px] font-bold cursor-pointer"
            style={{
              backgroundColor: '#333333',
              color: '#ffffff',
              boxShadow: '0 8px 0 0 #000000',
            }}
            whileTap={{ scale: 0.97 }}
          >
            {t('onboarding.continueWithoutSignIn', 'Continue without sign in')}
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-[12px] text-[#999] text-center mt-6 max-w-[280px]"
          >
            {t('onboarding.signInNote', 'Sign in to restore a previous subscription or sync across devices')}
          </motion.p>
        </div>
      </div>
    );
  }

  // Trust screen removed

  // Folder creation screens (shown during step 5)
  if (step === 5 && showNotesFolderCreation) {
    return <OnboardingFolderCreation
      type="notes"
      folders={notesFolders}
      setFolders={setNotesFolders}
      progressPercent={progressPercent}
      stepLabel={stepLabel}
      handleBack={() => { setShowNotesFolderCreation(false); }}
      goNext={goNext}
    />;
  }
  if (step === 5 && showTasksFolderCreation) {
    return <OnboardingFolderCreation
      type="tasks"
      folders={tasksFolders}
      setFolders={setTasksFolders}
      progressPercent={progressPercent}
      stepLabel={stepLabel}
      handleBack={() => { setShowTasksFolderCreation(false); setShowNotesFolderCreation(true); }}
      goNext={goNext}
    />;
  }

  // Info screens
  const infoData = tInfoScreens[step as keyof typeof tInfoScreens];
  if (infoData) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        {/* Top bar */}
        <div className="flex items-end gap-3 px-4 pt-3 pb-2">
          <button
            className="w-[17px] h-[17px] flex items-center justify-center"
            onClick={handleBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
          <div className="flex-1 flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
            <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
              <motion.div
                className="h-full"
                style={{ backgroundColor: ONBOARDING_COLOR }}
                initial={{ width: '0%' }}
                animate={{ width: progressPercent }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Icon banner */}
        {infoData.icons.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center gap-3 py-6 px-4"
          >
            {infoData.icons.map((item, i) => {
              const IconComp = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 * i, type: 'spring', stiffness: 200 }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: item.bg }}
                >
                  <IconComp size={18} color={item.color} strokeWidth={2} />
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <div className="flex-1 flex flex-col justify-center px-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[30px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-center leading-tight mb-10"
          >
            {infoData.title}
          </motion.h1>

          <div className="flex flex-col gap-6 px-2">
            {infoData.points.map((point, i) => {
              const PointIcon = point.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 + i * 0.15 }}
                  className="flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: point.bg }}>
                    <PointIcon size={18} color={point.color} strokeWidth={2} />
                  </div>
                  <p className="text-[15px] text-[#4a4f54] leading-relaxed pt-2 font-['Nunito_Sans']">{point.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom button */}
        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            onClick={goNext}
            className="w-full py-3 rounded-2xl text-[17px] font-bold"
            style={{
              backgroundColor: '#333333',
              color: '#ffffff',
              boxShadow: '0 8px 0 0 #000000',
            }}
            whileTap={{ scale: 0.97 }}
          >
            {infoData.button}
          </motion.button>
        </div>
      </div>
    );
  }

  // ============ CREATE NOTE SCREEN (step 6) — Real NoteEditor ============
  if (step === 6) {
    return (
      <div className="fixed inset-0 z-[300]">
        <MemoryRouter>
          <NoteEditor
            note={null}
            isOpen={true}
            onClose={() => {
              setOnboardingNoteSaved(true);
              goNext();
            }}
            onSave={(note) => {
              setOnboardingNoteSaved(true);
            }}
            defaultType="regular"
            skipHistory
          />
        </MemoryRouter>
      </div>
    );
  }

  // ============ CREATE SKETCH SCREEN (step 10) — Real NoteEditor in sketch mode ============
  if (step === 10) {
    return (
      <div className="fixed inset-0 z-[300]">
        <MemoryRouter>
          <NoteEditor
            note={null}
            isOpen={true}
            onClose={() => {
              setSketchSaved(true);
              goNext();
            }}
            onSave={(note) => {
              setSketchSaved(true);
            }}
            defaultType="sketch"
            skipHistory
          />
        </MemoryRouter>
      </div>
    );
  }

  // ============ CREATE TASK SCREEN (step 14) — Real Today page with TaskInputSheet auto-open ============
  if (step === 14) {
    const MAX_ONBOARDING_TASKS = 3;
    const canAddMore = createdTasks.length < MAX_ONBOARDING_TASKS;

    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
        {/* Onboarding progress header */}
        <div className="flex items-center gap-3 px-4 pt-1 pb-1 relative z-50 bg-white">
          <button className="w-[17px] h-[17px] flex items-center justify-center" onClick={handleBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
          <div className="flex-1 flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
            <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
              <motion.div className="h-full" style={{ backgroundColor: ONBOARDING_COLOR }} initial={{ width: '0%' }} animate={{ width: progressPercent }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
          </div>
        </div>

        {/* Real Today page embedded */}
        <div className="flex-1 overflow-hidden relative">
          <Suspense fallback={null}>
            <MemoryRouter initialEntries={['/todo/today']}>
              <TodayPage />
            </MemoryRouter>
          </Suspense>
        </div>

        {/* Bottom buttons - hide when task input sheet is open */}
        {!isTaskInputSheetOpen && (
          <div className="px-4 pb-2 pt-1 flex flex-col gap-1.5 relative z-50 bg-white" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 4px)' }}>
            <motion.button onClick={goNext} className="w-full py-3 rounded-2xl text-[17px] font-bold" style={{ backgroundColor: '#333333', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }} whileTap={{ scale: 0.97 }}>
              {createdTasks.length > 0 ? `${t('onboarding.continue')} · ${createdTasks.length} ${t('common.tasks', 'tasks')}` : t('onboarding.continue')}
            </motion.button>
          </div>
        )}

        {/* TaskInputSheet auto-opens */}
        {canAddMore && (
          <TaskInputSheet
            isOpen={isTaskInputSheetOpen}
            onClose={() => {
              setIsTaskInputSheetOpen(false);
            }}
            onAddTask={async (taskData) => {
              const now = new Date();
              const task: TodoItem = {
                id: crypto.randomUUID(),
                completed: false,
                createdAt: now,
                modifiedAt: now,
                ...taskData,
              };
              const existing = await loadTodoItems();
              await saveTodoItems([task, ...existing]);
              // Notify embedded TodayPage to reload tasks from IndexedDB
              window.dispatchEvent(new Event('tasksRestored'));
              setCreatedTasks(prev => {
                const updated = [...prev, task];
                // Auto-close sheet if max reached
                if (updated.length >= MAX_ONBOARDING_TASKS) {
                  setIsTaskInputSheetOpen(false);
                }
                return updated;
              });
              setCreatedTask(task);
              await triggerHaptic();
            }}
            folders={onboardingFolders}
            onCreateFolder={(name) => {
              const newFolder: Folder = { id: crypto.randomUUID(), name, isDefault: false, createdAt: new Date() };
              setOnboardingFolders(prev => [...prev, newFolder]);
              setSetting('todoFolders', [...onboardingFolders, newFolder]);
            }}
            sections={onboardingSections}
          />
        )}
      </div>
    );
  }


  // ============ STREAK DAY 1 SCREEN ============
  if (showStreakDay1) {
    return (
      <StreakDay1Screen
        userName={userName}
        onContinue={async () => {
          setShowStreakDay1(false);
          setShowOnboardingCertificate(true);
        }}
      />
    );
  }

  // ============ ONBOARDING CERTIFICATE OVERLAY ============
  if (showOnboardingCertificate) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[28px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-center mb-1"
          >
            {t('onboarding.certificateTitle')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] text-center mb-5"
          >
            {t('onboarding.certificateSubtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
          >
            <StreakConsistencyCertificate
              currentStreak={1}
              totalCompletions={1}
              longestStreak={1}
            />
          </motion.div>
        </div>
        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <motion.button
            onClick={async () => {
              setShowOnboardingCertificate(false);
              setShowReadyScreen(true);
            }}
            className="w-full py-3 rounded-2xl text-[17px] font-bold"
            style={{ backgroundColor: '#333333', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }}
            whileTap={{ scale: 0.97 }}
          >
            {t('onboarding.continue')}
          </motion.button>
        </div>
      </div>
    );
  }


  // ============ READY TO START JOURNEY SCREEN ============
  if (showReadyScreen) {
    const featureItems = [
      { icon: <Unlock size={16} strokeWidth={2} />, title: t('onboarding.readyUnlockAll'), desc: t('onboarding.readyUnlockAllDesc') },
      { icon: <Bell size={16} strokeWidth={2} />, title: t('onboarding.readyUnlimited'), desc: t('onboarding.readyUnlimitedDesc') },
      { icon: <Crown size={16} strokeWidth={2} />, title: t('onboarding.readyProMember'), desc: t('onboarding.readyProMemberDesc') },
      { icon: <Gift size={16} strokeWidth={2} />, title: t('onboarding.readyFreeTrial'), desc: t('onboarding.readyFreeTrialDesc') },
    ];
    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ paddingTop: 'var(--safe-top, 0px)', paddingBottom: 'var(--safe-bottom, 0px)' }}>
        <div className="px-4 pt-3 pb-1">
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { setShowReadyScreen(false); setShowOnboardingCertificate(true); }} className="w-10 h-10 flex items-center justify-center">
            <ArrowLeft size={22} color="#1a1a1a" />
          </motion.button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-center leading-tight mb-8">
            {t('onboarding.readyTitle')}
          </motion.h1>
          <div className="flex flex-col items-start mx-auto w-80 relative">
            <div className="absolute left-[10.5px] top-[20px] bottom-[20px] w-[11px] rounded-b-full" style={{ background: 'hsl(var(--primary) / 0.2)' }} />
            {featureItems.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-start gap-3 mb-6 relative">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground z-10 flex-shrink-0">{item.icon}</div>
                <div>
                  <p className="font-semibold" style={{ color: 'hsl(0 0% 3.9%)', fontFamily: "'Nunito', sans-serif" }}>{item.title}</p>
                  <p className="text-sm" style={{ color: 'hsl(0 0% 45.1%)' }}>{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mt-8 rounded-2xl p-5 relative overflow-hidden flex items-end" style={{ backgroundColor: '#e8faf3', minHeight: '140px' }}>
            <div className="flex-1">
              <h3 className="text-[17px] font-bold text-[#1a1a1a] font-['Nunito'] leading-tight mb-1">{t('onboarding.readyCancelTitle')}</h3>
              <p className="text-[13px] text-[#5a6065] font-['Nunito_Sans'] leading-relaxed max-w-[200px]">{t('onboarding.readyCancelDesc')}</p>
            </div>
            
          </motion.div>
        </div>
        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="text-center text-[13px] font-medium mb-3" style={{ color: 'hsl(0 0% 45.1%)' }}>
            {t('onboarding.noCommitment')}
          </motion.p>
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} onClick={async () => {
            setShowReadyScreen(false);
            await setSetting('onboarding_completed', true);
            await setSetting('onboarding_progress_state', null);
            // Mark as new free user (soft paywall mode) — paywall becomes dismissable.
            // Returning users with active subscriptions already skipped onboarding earlier (see step 1308).
            try {
              await setSetting('flowist_new_user', true);
              try { localStorage.setItem('flowist_new_user', 'true'); } catch {}
              window.dispatchEvent(new CustomEvent('flowistNewFreeUserChanged', { detail: { value: true } }));
            } catch (e) {
              console.warn('[Onboarding] Could not mark as new free user:', e);
            }
            onComplete();
            // Delay paywall slightly longer to ensure isNewFreeUser state propagates before render
            setTimeout(() => openPaywall(), 400);
          }} className="w-full py-4 rounded-2xl text-[17px] font-bold" style={{ backgroundColor: '#1a1a1a', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }} whileTap={{ scale: 0.97 }}>
            {t('onboarding.continue')}
          </motion.button>
        </div>
      </div>
    );
  }

  // Journey selection screen (step 24)
  if (step === 24) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        <div className="flex items-end gap-3 px-4 pt-3 pb-2">
          <motion.button
            className="w-[17px] h-[17px] flex items-center justify-center cursor-pointer"
            onClick={handleBack}
            aria-label="Back"
            whileTap={{ scale: 0.85 }}
          >
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </motion.button>
          <div className="flex-1 flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
            <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
              <motion.div className="h-full" style={{ backgroundColor: ONBOARDING_COLOR }} initial={{ width: '0%' }} animate={{ width: progressPercent }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4 overflow-y-auto pb-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="text-3xl mb-2 block">🧭</span>
            <h1 className="text-[24px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight leading-tight">{t('onboarding.chooseAdventure')}</h1>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] mb-5">
            {t('onboarding.chooseAdventureSubtitle')}
          </motion.p>

          <div className="space-y-3">
            {ALL_JOURNEYS.map((journey, i) => (
              <motion.button
                key={journey.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { triggerHaptic(); setSelectedJourneyId(selectedJourneyId === journey.id ? null : journey.id); }}
                className="w-full text-left p-4 rounded-2xl transition-all cursor-pointer"
                style={{
                  backgroundColor: selectedJourneyId === journey.id ? `${ONBOARDING_COLOR}20` : '#ffffff',
                  border: `2px solid ${selectedJourneyId === journey.id ? ONBOARDING_COLOR : '#e8e8e8'}`,
                  boxShadow: selectedJourneyId === journey.id ? `0 4px 0 0 ${ONBOARDING_COLOR}` : '0 4px 0 0 #e4e8ea',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{journey.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-[15px] text-[#1a1a1a]">{t(`journey.${journey.id}.name`, journey.name)}</h4>
                    </div>
                    <p className="text-[12px] text-[#767b7e] mt-0.5 leading-relaxed">{t(`journey.${journey.id}.description`, journey.description)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-[#767b7e] bg-[#f3f4f6] px-2 py-0.5 rounded-full">
                        {journey.totalTasks} {t('common.tasks', 'tasks')}
                      </span>
                      <span className="text-[10px] text-[#767b7e] bg-[#f3f4f6] px-2 py-0.5 rounded-full">
                        {t('onboarding.milestonesCount', { count: journey.milestones.length })}
                      </span>
                    </div>
                  </div>
                  {selectedJourneyId === journey.id && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ONBOARDING_COLOR }}>
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <motion.button
            onClick={goNext}
            className="w-full py-3 rounded-2xl text-[17px] font-bold cursor-pointer"
            style={{
              backgroundColor: selectedJourneyId ? '#333333' : '#ebeff2',
              color: selectedJourneyId ? '#ffffff' : '#767b7e',
              boxShadow: selectedJourneyId ? '0 8px 0 0 #000000' : 'none',
            }}
            whileTap={selectedJourneyId ? { scale: 0.97 } : {}}
          >
            {selectedJourneyId ? t('onboarding.startJourney') : t('onboarding.skip')}
          </motion.button>
        </div>
      </div>
    );
  }

  // Adventure Begins screen (step 29) — shown after journey selection
  if (step === 29) {
    const selectedJourney = ALL_JOURNEYS.find(j => j.id === selectedJourneyId);
    const firstMilestone = selectedJourney?.milestones[0];
    return (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
        onClick={goNext}
      >
        <div className="flex flex-col items-center px-8 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
            className="text-7xl mb-4"
          >
            {selectedJourney?.emoji}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-2xl font-black text-white font-['Nunito'] tracking-tight"
          >
            {t('journey.yourAdventure', 'Your Adventure Begins!')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="text-white/60 text-sm font-['Nunito_Sans'] mt-2 mb-6"
          >
            {t(`journey.${selectedJourney?.id}.name`, selectedJourney?.name)} — {selectedJourney?.totalTasks} {t('common.tasks', 'tasks')}
          </motion.p>

          {/* Milestone path preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="flex items-center gap-2"
          >
            {selectedJourney?.milestones.slice(0, 5).map((ms, i) => (
              <motion.div
                key={ms.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.12, type: 'spring', damping: 15 }}
                className="flex flex-col items-center"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-lg">
                  {ms.icon}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* First milestone hint */}
          {firstMilestone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="mt-6 flex items-center gap-2 text-white/50 text-xs font-['Nunito_Sans']"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{t('journey.firstStop', 'First stop')}: {t(`journey.${selectedJourney?.id}.${firstMilestone.id}`, firstMilestone.name)}</span>
            </motion.div>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.8 }}
            className="text-white/30 text-xs mt-8 font-['Nunito_Sans']"
          >
            {t('common.tapToContinue', 'Tap to continue')}
          </motion.p>
        </div>
      </div>
    );
  }

  // Feature showcase screen (step 25)
  if (step === 25) {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        <div className="flex items-end gap-3 px-4 pt-3 pb-2">
          <button className="w-[17px] h-[17px] flex items-center justify-center" onClick={handleBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
          <div className="flex-1 flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
            <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
              <motion.div className="h-full" style={{ backgroundColor: ONBOARDING_COLOR }} initial={{ width: '0%' }} animate={{ width: progressPercent }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4 overflow-y-auto pb-4">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-[28px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
            {t('onboarding.showcaseTitle')}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
            {t('onboarding.showcaseSubtitle')}
          </motion.p>

          <div className="flex flex-col gap-4">
            {tFeatureShowcase.map((feature, i) => {
              const FeatureIcon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-4 rounded-2xl p-4"
                  style={{ border: '1.5px solid #e8e8e8', backgroundColor: '#fafafa' }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: feature.bg }}>
                    <FeatureIcon size={20} color={feature.color} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-1">{feature.title}</h3>
                    <p className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="flex items-center gap-1 justify-center mt-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} size={22} fill="#FBBF24" color="#FBBF24" />
            ))}
            <span className="text-[13px] text-[#767b7e] font-['Nunito_Sans'] ml-2">{t('onboarding.builtForSuccess')}</span>
          </motion.div>
        </div>

        <div className="px-6 pb-6 pt-2" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            onClick={goNext}
            className="w-full py-3 rounded-2xl text-[17px] font-bold"
            style={{ backgroundColor: '#333333', color: '#ffffff', boxShadow: '0 8px 0 0 #000000' }}
            whileTap={{ scale: 0.97 }}
          >
            {t('onboarding.loveIt')}
          </motion.button>
        </div>
      </div>
    );
  }

  // Loading screen
  if (step === 26) {
    return <PlanLoadingScreen onComplete={handleFinishWelcome} displayName={displayName} />;
  }

  const renderSingleSelect = (
    options: string[],
    selected: string | null,
    onSelect: (o: string) => void,
  ) => (
    <div className="flex flex-col gap-3.5">
      {options.map((option, index) => {
        const isSelected = selected === option;
        return (
          <motion.button
            key={option}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 + index * 0.03 }}
            onClick={() => onSelect(option)}
            className="relative w-full text-left rounded-2xl px-5 py-4 text-[15px] font-medium font-['Nunito_Sans'] transition-all duration-150 cursor-pointer active:brightness-95"
            style={{
              backgroundColor: isSelected ? `${ONBOARDING_COLOR}40` : '#ffffff',
              border: `2px solid ${isSelected ? ONBOARDING_COLOR : '#e8e8e8'}`,
              color: '#1a1a1a',
              boxShadow: isSelected ? `0 4px 0 0 ${ONBOARDING_COLOR}` : '0 4px 0 0 #e4e8ea',
              WebkitTapHighlightColor: 'transparent',
            }}
            whileTap={{ scale: 0.99, y: 1 }}
          >
            <span>{option}</span>
          </motion.button>
        );
      })}
    </div>
  );

  const renderMultiSelect = (
    options: string[],
    selected: Set<string>,
    onToggle: (o: string) => void,
  ) => (
    <div className="flex flex-col gap-3.5">
      {options.map((option, index) => {
        const isSelected = selected.has(option);
        return (
          <motion.button
            key={option}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 + index * 0.03 }}
            onClick={() => onToggle(option)}
            className="relative w-full text-left rounded-2xl px-5 py-4 text-[15px] font-medium font-['Nunito_Sans'] transition-all duration-150 flex items-center justify-between cursor-pointer active:brightness-95"
            style={{
              backgroundColor: isSelected ? `${ONBOARDING_COLOR}40` : '#ffffff',
              border: `2px solid ${isSelected ? ONBOARDING_COLOR : '#e8e8e8'}`,
              color: '#1a1a1a',
              boxShadow: isSelected ? `0 4px 0 0 ${ONBOARDING_COLOR}` : '0 4px 0 0 #e4e8ea',
              WebkitTapHighlightColor: 'transparent',
            }}
            whileTap={{ scale: 0.99, y: 1 }}
          >
            <span>{option}</span>
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-150"
              style={{
                backgroundColor: isSelected ? ONBOARDING_COLOR : 'transparent',
                border: `2px solid ${isSelected ? ONBOARDING_COLOR : '#d0d5d9'}`,
              }}
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </div>
          </motion.button>
        );
      })}
    </div>
  );


  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-white"
      style={{
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-end gap-3 px-4 pt-3 pb-2">
        <motion.button
          className="w-[17px] h-[17px] flex items-center justify-center cursor-pointer"
          onClick={handleBack}
          aria-label="Back"
          style={{ opacity: step < 0 ? 0.3 : 1, WebkitTapHighlightColor: 'transparent' }}
          disabled={step < 0}
          whileTap={{ scale: 0.85 }}
          transition={{ duration: 0.1 }}
        >
          <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
        </motion.button>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[#999] text-right">{stepLabel}</span>
          <div className="h-[17px] rounded-[6px] bg-[#e5e5e5] overflow-hidden">
            <motion.div
              className="h-full"
              style={{ backgroundColor: ONBOARDING_COLOR }}
              initial={{ width: '0%' }}
              animate={{ width: progressPercent }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="step0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.whyUseFlowist')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.personalizeExperience')}
            </motion.p>
            {renderMultiSelect(tGoalOptions, selectedGoal, handleToggleGoal)}
          </motion.div>
        )}


        {step === 28 && (
          <motion.div key="step28" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.previousAppTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.previousAppSubtitle')}
            </motion.p>
            {renderSingleSelect(tPreviousAppOptions, selectedPreviousApp, handleSelectPreviousApp)}
          </motion.div>
        )}

        {step === 30 && (
          <motion.div key="step30" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.frustrationTitle', { app: selectedPreviousApp })}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.frustrationSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.frustTooSlow'), t('onboarding.frustTooExpensive'), t('onboarding.frustLacksFeatures'), t('onboarding.frustTooComplicated'), t('onboarding.frustBadMobile'), t('onboarding.frustOther')],
              selectedFrustration,
              (val: string) => { triggerHaptic(); setSelectedFrustration(selectedFrustration === val ? null : val); }
            )}
          </motion.div>
        )}

        {step === 31 && (
          <motion.div key="step31" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.taskViewTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.taskViewSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.taskViewDaily'), t('onboarding.taskViewKanban'), t('onboarding.taskViewProgress'), t('onboarding.taskViewPriority')],
              selectedTaskView,
              (val: string) => { triggerHaptic(); setSelectedTaskView(selectedTaskView === val ? null : val); }
            )}
          </motion.div>
        )}

        {step === 32 && (
          <motion.div key="step32" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.devicesTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.devicesSubtitle')}
            </motion.p>
            {renderMultiSelect(
              [t('onboarding.deviceIPhone'), t('onboarding.deviceIPad'), t('onboarding.deviceMac'), t('onboarding.deviceAndroid'), t('onboarding.deviceWindows'), t('onboarding.deviceSingle')],
              selectedDevices,
              (val: string) => {
                triggerHaptic();
                setSelectedDevices(prev => {
                  const next = new Set(prev);
                  if (val === t('onboarding.deviceSingle')) {
                    return next.has(val) ? new Set() : new Set([val]);
                  }
                  next.delete(t('onboarding.deviceSingle'));
                  next.has(val) ? next.delete(val) : next.add(val);
                  return next;
                });
              }
            )}
          </motion.div>
        )}

        {step === 33 && (
          <motion.div key="step33" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.offlineTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.offlineSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.offlineCritical'), t('onboarding.offlineNice'), t('onboarding.offlineNoMatter')],
              selectedOffline,
              (val: string) => { triggerHaptic(); setSelectedOffline(selectedOffline === val ? null : val); }
            )}
          </motion.div>
        )}

        {step === 34 && (
          <motion.div key="step34" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.unfinishedTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.unfinishedSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.unfinishedEveryday'), t('onboarding.unfinishedSometimes'), t('onboarding.unfinishedRarely')],
              selectedUnfinished,
              (val: string) => { triggerHaptic(); setSelectedUnfinished(selectedUnfinished === val ? null : val); }
            )}
          </motion.div>
        )}

        {step === 35 && (
          <motion.div key="step35" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.slowdownTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.slowdownSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.slowdownApps'), t('onboarding.slowdownSubscriptions'), t('onboarding.slowdownLosingWork')],
              selectedSlowdown,
              (val: string) => { triggerHaptic(); setSelectedSlowdown(selectedSlowdown === val ? null : val); }
            )}
          </motion.div>
        )}


        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.setupProfile')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[15px] text-[#767b7e] mb-8">
              {t('onboarding.profileSubtitle')}
            </motion.p>
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="flex justify-center mb-8">
              <button onClick={() => fileInputRef.current?.click()} className="relative w-28 h-28 rounded-full" style={{ border: `3px solid ${avatarPreview ? ONBOARDING_COLOR : '#e4e8ea'}`, boxShadow: avatarPreview ? `0 4px 0 0 ${ONBOARDING_COLOR}` : '0 4px 0 0 #e4e8ea' }}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <div className="w-full h-full bg-[#f5f6f8] flex items-center justify-center rounded-full">
                    <User className="h-10 w-10 text-[#b0b5b9]" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white" style={{ backgroundColor: ONBOARDING_COLOR }}>
                  <Camera className="h-3.5 w-3.5 text-white" />
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }}>
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder={t('onboarding.yourName')} autoCapitalize="words" autoCorrect="off" autoComplete="name"
                className="w-full text-left rounded-2xl px-5 py-4 text-[15px] font-medium font-['Nunito_Sans'] transition-all duration-200 outline-none"
                style={{ backgroundColor: '#ffffff', border: `2px solid ${userName.trim() ? ONBOARDING_COLOR : '#e8e8e8'}`, color: '#1a1a1a', boxShadow: userName.trim() ? `0 4px 0 0 ${ONBOARDING_COLOR}` : '0 4px 0 0 #e4e8ea' }}
              />
            </motion.div>
          </motion.div>
        )}

        {/* Image Cropper overlay for profile setup */}
        {cropImageSrc && (
          <div className="fixed inset-0 z-[400]">
            <ProfileImageCropper
              imageSrc={cropImageSrc}
              onCropComplete={(croppedDataUrl) => {
                setAvatarPreview(croppedDataUrl);
                setCropImageSrc(null);
                triggerHaptic();
              }}
              onCancel={() => setCropImageSrc(null)}
              cropShape="round"
            />
          </div>
        )}



        {step === 36 && (
          <motion.div key="step36" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col px-6 pt-6 overflow-y-auto">
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="text-[32px] font-black text-[#1a1a1a] font-['Nunito'] tracking-tight text-left leading-tight mb-2">
              {t('onboarding.whyFailTitle')}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[#767b7e] mb-6">
              {t('onboarding.whyFailSubtitle')}
            </motion.p>
            {renderSingleSelect(
              [t('onboarding.whyFailForgot'), t('onboarding.whyFailComplex'), t('onboarding.whyFailDontFit')],
              selectedWhyFail,
              (val: string) => { triggerHaptic(); setSelectedWhyFail(selectedWhyFail === val ? null : val); }
            )}
          </motion.div>
        )}


      </AnimatePresence>

      {/* Bottom Next button */}
      <div className="px-6 pb-3 pt-2 flex flex-col items-center" style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 12px)' }}>
        <motion.button
          onClick={goNext}
          disabled={!currentValid}
          className="w-full py-3 rounded-2xl text-[17px] font-bold transition-all duration-150 cursor-pointer active:brightness-95"
          style={{
            backgroundColor: currentValid ? '#333333' : '#ebeff2',
            color: currentValid ? '#ffffff' : '#767b7e',
            boxShadow: currentValid ? '0 8px 0 0 #000000' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
          whileTap={currentValid ? { scale: 0.98, y: 2 } : {}}
        >
          {t('onboarding.next')}
        </motion.button>
      </div>
    </div>
  );
};
