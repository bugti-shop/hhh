import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronDown, MoreVertical, Image } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { loadNotesFromDB } from '@/utils/noteStorage';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotesCalendarViewProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  highlightedDates?: Date[];
  taskDates?: Date[];
  eventDates?: Date[];
   
  showWeekNumbers?: boolean;
  emptyStateMessage?: string;
  emptyStateSubMessage?: string;
  showEmptyState?: boolean;
  calendarBackground?: string;
  onBackgroundSettingsClick?: () => void;
}

const BACKGROUND_GRADIENTS: Record<string, string | null> = {
  none: null,
  sunset: 'linear-gradient(135deg, hsl(25, 95%, 75%) 0%, hsl(350, 85%, 70%) 50%, hsl(280, 75%, 65%) 100%)',
  ocean: 'linear-gradient(135deg, hsl(200, 85%, 70%) 0%, hsl(210, 90%, 55%) 50%, hsl(220, 85%, 45%) 100%)',
  forest: 'linear-gradient(135deg, hsl(140, 65%, 65%) 0%, hsl(150, 60%, 45%) 50%, hsl(160, 55%, 35%) 100%)',
  night: 'linear-gradient(135deg, hsl(240, 50%, 25%) 0%, hsl(260, 60%, 20%) 50%, hsl(280, 55%, 15%) 100%)',
  aurora: 'linear-gradient(135deg, hsl(180, 70%, 50%) 0%, hsl(280, 80%, 60%) 50%, hsl(320, 75%, 55%) 100%)',
  mountain: 'linear-gradient(135deg, hsl(220, 40%, 70%) 0%, hsl(210, 50%, 50%) 50%, hsl(200, 45%, 35%) 100%)',
  cloudy: 'linear-gradient(135deg, hsl(210, 30%, 85%) 0%, hsl(220, 35%, 75%) 50%, hsl(230, 40%, 65%) 100%)',
  lavender: 'linear-gradient(135deg, hsl(270, 60%, 80%) 0%, hsl(280, 55%, 70%) 50%, hsl(290, 50%, 60%) 100%)',
  mint: 'linear-gradient(135deg, hsl(160, 50%, 80%) 0%, hsl(170, 55%, 65%) 50%, hsl(180, 60%, 50%) 100%)',
  coral: 'linear-gradient(135deg, hsl(15, 85%, 75%) 0%, hsl(5, 80%, 65%) 50%, hsl(355, 75%, 55%) 100%)',
  golden: 'linear-gradient(135deg, hsl(45, 90%, 75%) 0%, hsl(35, 85%, 60%) 50%, hsl(25, 80%, 50%) 100%)',
};

// Check if background needs light text
const needsLightText = (bgId: string) => {
  return ['night', 'ocean', 'forest', 'mountain', 'aurora'].includes(bgId);
};

export const NotesCalendarView = ({
  selectedDate,
  onDateSelect,
  highlightedDates,
  taskDates = [],
  eventDates = [],
   
  emptyStateMessage,
  emptyStateSubMessage,
  showEmptyState = false,
  calendarBackground = 'none',
  onBackgroundSettingsClick,
}: NotesCalendarViewProps) => {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyStateMessage || t('calendar.noNotes', 'No notes for the day.');
  const resolvedEmptySubMessage = emptyStateSubMessage || t('calendar.clickToCreate', 'Click "+" to create your notes.');
  const today = new Date();
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(selectedDate || today));
  const [noteDates, setNoteDates] = useState<Date[]>([]);

  const backgroundGradient = BACKGROUND_GRADIENTS[calendarBackground];
  const useLightText = needsLightText(calendarBackground);

  useEffect(() => {
    if (highlightedDates) {
      setNoteDates(highlightedDates);
      return;
    }

    const loadNotes = async () => {
      const notes = await loadNotesFromDB();
      const dates = notes.map(note => new Date(note.createdAt));
      setNoteDates(dates);
    };

    loadNotes();

    const handleNotesUpdate = () => loadNotes();
    window.addEventListener('notesUpdated', handleNotesUpdate);

    return () => window.removeEventListener('notesUpdated', handleNotesUpdate);
  }, [highlightedDates]);

  // Calculate calendar grid with leading/trailing days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Get leading days from previous month
    const startDayOfWeek = getDay(monthStart);
    const leadingDays: Date[] = [];
    if (startDayOfWeek > 0) {
      const prevMonth = subMonths(monthStart, 1);
      const prevMonthEnd = endOfMonth(prevMonth);
      for (let i = startDayOfWeek - 1; i >= 0; i--) {
        leadingDays.push(new Date(prevMonthEnd.getTime() - i * 24 * 60 * 60 * 1000));
      }
    }
    
    // Get trailing days to complete the last week
    const totalDays = leadingDays.length + daysInMonth.length;
    const trailingDaysCount = totalDays % 7 === 0 ? 0 : 7 - (totalDays % 7);
    const trailingDays: Date[] = [];
    const nextMonth = addMonths(monthStart, 1);
    for (let i = 1; i <= trailingDaysCount; i++) {
      trailingDays.push(new Date(nextMonth.getTime() + (i - 1) * 24 * 60 * 60 * 1000));
    }
    
    return [...leadingDays, ...daysInMonth, ...trailingDays];
  }, [displayMonth]);

  const hasNote = (date: Date) => noteDates.some((nDate) => isSameDay(nDate, date));
  const hasTask = (date: Date) => taskDates.some((tDate) => isSameDay(tDate, date));
  const hasEvent = (date: Date) => eventDates.some((eDate) => isSameDay(eDate, date));
   

  const handlePrevMonth = () => {
    setDisplayMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setDisplayMonth(prev => addMonths(prev, 1));
  };

  const handleGoToToday = () => {
    setDisplayMonth(startOfMonth(today));
    onDateSelect?.(today);
  };

  const weekDays = [t('calendar.sun', 'Sun'), t('calendar.mon', 'Mon'), t('calendar.tue', 'Tue'), t('calendar.wed', 'Wed'), t('calendar.thu', 'Thu'), t('calendar.fri', 'Fri'), t('calendar.sat', 'Sat')];

  return (
    <div 
      className={cn(
        "w-full transition-all duration-300 flex-shrink-0",
        !backgroundGradient && "bg-gradient-to-b from-primary/5 to-transparent"
      )}
      style={{
        background: backgroundGradient || undefined,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header - Clean Month/Year with Navigation */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className={cn(
              "p-1.5 hover:bg-accent/50 rounded-full transition-colors",
              useLightText && "hover:bg-white/20"
            )}
            aria-label="Previous month"
          >
            <ChevronLeft className={cn("w-5 h-5", useLightText ? "text-white/80" : "text-muted-foreground")} />
          </button>
          
          <h2 className={cn(
            "text-xl font-normal flex items-center gap-1",
            useLightText ? "text-white" : "text-foreground"
          )}>
            <span className={useLightText ? "text-white" : "text-primary"}>
              {format(displayMonth, "MMMM").toUpperCase()}
            </span>
            <span>{format(displayMonth, "yyyy")}</span>
          </h2>
          
          <button
            onClick={handleNextMonth}
            className={cn(
              "p-1.5 hover:bg-accent/50 rounded-full transition-colors",
              useLightText && "hover:bg-white/20"
            )}
            aria-label="Next month"
          >
            <ChevronRight className={cn("w-5 h-5", useLightText ? "text-white/80" : "text-muted-foreground")} />
          </button>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={handleGoToToday}
            className={cn(
              "p-1.5 hover:bg-accent/50 rounded-full transition-colors",
              useLightText && "hover:bg-white/20"
            )}
            aria-label="Go to today"
          >
            <ChevronDown className={cn("w-5 h-5", useLightText ? "text-white/80" : "text-muted-foreground")} />
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "p-1.5 hover:bg-accent/50 rounded-full transition-colors",
                useLightText && "hover:bg-white/20"
              )}>
                <MoreVertical className={cn("w-5 h-5", useLightText ? "text-white/80" : "text-muted-foreground")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card">
              <DropdownMenuItem onClick={handleGoToToday}>
                {t('calendar.goToToday', 'Go to Today')}
              </DropdownMenuItem>
              {onBackgroundSettingsClick && (
                <DropdownMenuItem onClick={onBackgroundSettingsClick} className="gap-2">
                  <Image className="h-4 w-4" />
                  {t('calendar.changeBackground', 'Change Background')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {weekDays.map((day) => (
          <div
            key={day}
            className={cn(
              "text-center text-sm font-normal py-2",
              useLightText ? "text-white/70" : "text-muted-foreground"
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 px-2 gap-y-1 pb-4">
        {calendarDays.map((day, index) => {
          const isCurrentMonth = isSameMonth(day, displayMonth);
          const hasNoteOnDay = hasNote(day);
          const hasTaskOnDay = hasTask(day);
          const hasEventOnDay = hasEvent(day);
           
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate && isSameDay(day, selectedDate) && !isToday;
          const hasAnyIndicator = hasNoteOnDay || hasTaskOnDay || hasEventOnDay;

          return (
            <button
              key={`${day.toString()}-${index}`}
              onClick={() => onDateSelect?.(day)}
              className="h-12 flex flex-col items-center justify-center relative"
            >
              <span 
                className={cn(
                  "w-10 h-10 flex items-center justify-center rounded-full text-base font-normal transition-all",
                  !isCurrentMonth && (useLightText ? "text-white/30" : "text-muted-foreground/40"),
                  isCurrentMonth && !isToday && !isSelected && !hasAnyIndicator && (useLightText ? "text-white" : "text-foreground"),
                  isCurrentMonth && !isToday && !isSelected && hasAnyIndicator && "text-white",
                  isToday && "text-white font-normal",
                  isSelected && !isToday && !hasAnyIndicator && (useLightText 
                    ? "text-white font-normal ring-2 ring-white/30" 
                    : "text-white font-normal ring-2 ring-white/30")
                )}
                style={{
                  backgroundColor: isToday
                    ? '#3c78f0'
                    : (isSelected && !isToday)
                      ? '#3c78f0'
                      : (hasAnyIndicator && isCurrentMonth && !isToday)
                        ? '#3c78f0'
                        : undefined,
                }}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {showEmptyState && (
        <div className="flex flex-col items-center justify-center py-16 px-8">
          {/* Calendar Illustration */}
          <div className="relative mb-8">
            <svg 
              width="180" 
              height="140" 
              viewBox="0 0 180 140" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className={useLightText ? "opacity-80" : "opacity-60"}
            >
              {/* Calendar base */}
              <rect x="40" y="30" width="100" height="90" rx="8" fill={useLightText ? "rgba(255,255,255,0.1)" : "hsl(var(--primary) / 0.1)"} stroke={useLightText ? "rgba(255,255,255,0.3)" : "hsl(var(--primary) / 0.3)"} strokeWidth="2"/>
              {/* Calendar header */}
              <rect x="40" y="30" width="100" height="24" rx="8" fill={useLightText ? "rgba(255,255,255,0.2)" : "hsl(var(--primary) / 0.2)"}/>
              <rect x="48" y="48" width="84" height="2" rx="1" fill={useLightText ? "rgba(255,255,255,0.2)" : "hsl(var(--muted-foreground) / 0.2)"}/>
              {/* Calendar lines */}
              <rect x="48" y="58" width="84" height="2" rx="1" fill={useLightText ? "rgba(255,255,255,0.15)" : "hsl(var(--muted-foreground) / 0.15)"}/>
              <rect x="48" y="70" width="84" height="2" rx="1" fill={useLightText ? "rgba(255,255,255,0.15)" : "hsl(var(--muted-foreground) / 0.15)"}/>
              <rect x="48" y="82" width="84" height="2" rx="1" fill={useLightText ? "rgba(255,255,255,0.15)" : "hsl(var(--muted-foreground) / 0.15)"}/>
              <rect x="48" y="94" width="60" height="2" rx="1" fill={useLightText ? "rgba(255,255,255,0.15)" : "hsl(var(--muted-foreground) / 0.15)"}/>
              {/* Decorative elements */}
              <circle cx="25" cy="100" r="15" fill={useLightText ? "rgba(255,255,255,0.15)" : "hsl(var(--primary) / 0.15)"}/>
              <circle cx="160" cy="50" r="10" fill={useLightText ? "rgba(255,255,255,0.1)" : "hsl(var(--primary) / 0.1)"}/>
              {/* Curly decoration */}
              <path 
                d="M145 60 Q155 55, 160 65 Q165 75, 155 80 Q145 85, 150 75" 
                stroke={useLightText ? "rgba(255,255,255,0.3)" : "hsl(var(--muted-foreground) / 0.3)"} 
                strokeWidth="2" 
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          
          <p className={cn(
            "text-lg text-center mb-1",
            useLightText ? "text-white/80" : "text-muted-foreground"
          )}>
            {resolvedEmptyMessage}
          </p>
          <p className={cn(
            "text-sm text-center",
            useLightText ? "text-white/60" : "text-muted-foreground/70"
          )}>
            {resolvedEmptySubMessage}
          </p>
        </div>
      )}
    </div>
  );
};
