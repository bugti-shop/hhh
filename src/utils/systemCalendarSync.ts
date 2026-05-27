/**
 * Bidirectional sync between app tasks/events and the device's native calendar.
 * Uses @ebarooni/capacitor-calendar (v8) for Capacitor 8.
 *
 * ── Deduplication strategy ──
 *   • A "syncMap" persists appId → nativeEventId for outbound (app→native) events.
 *   • A "pulledIdsSet" persists native event IDs that were imported into the app,
 *     so they are never pushed back to the native calendar.
 *   • Pulled events use a stable ID: `native_${nativeId}` — the same native event
 *     always maps to the same app ID, preventing duplicates on repeated pulls.
 *
 * ── Outbound (App → System Calendar) ──
 *   • Every task with a dueDate or app-created event is pushed to the native calendar.
 *   • Events originally pulled FROM native (id starts with "native_") are skipped.
 *
 * ── Inbound (System Calendar → App) ──
 *   • Events fetched from the native calendar that weren't pushed by us
 *     and aren't already in the app are added once.
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar as _CapacitorCalendar } from '@ebarooni/capacitor-calendar';
const CapacitorCalendar: any = _CapacitorCalendar;
import { TodoItem, CalendarEvent as AppCalendarEvent } from '@/types/note';
import { getSetting, setSetting } from './settingsStorage';

// ─── Types ───────────────────────────────────────────────────────
export interface SystemCalendarSyncResult {
  pushed: number;
  pulled: number;
  updated: number;
  errors: string[];
}

// ─── Guard: only run on native ──────────────────────────────────
const isNative = () => Capacitor.isNativePlatform();

// ─── Permissions ─────────────────────────────────────────────────
export const requestCalendarPermissions = async (): Promise<boolean> => {
  if (!isNative()) return false;
  try {
    const cal = CapacitorCalendar;
    const platform = Capacitor.getPlatform();
    
    if (platform === 'android') {
      try {
        const read = await Promise.resolve(cal.requestReadOnlyCalendarAccess());
        const write = await Promise.resolve(cal.requestWriteOnlyCalendarAccess());
        return read?.result === 'granted' && write?.result === 'granted';
      } catch (e) {
        console.warn('Android calendar permission request failed:', e);
        return false;
      }
    } else {
      const { result } = await Promise.resolve(cal.requestFullCalendarAccess());
      return result === 'granted';
    }
  } catch (e) {
    console.error('Calendar permission error:', e);
    return false;
  }
};

export const checkCalendarPermissions = async (): Promise<boolean> => {
  if (!isNative()) return false;
  try {
    const cal = CapacitorCalendar;
    const read = await Promise.resolve(cal.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR }));
    const write = await Promise.resolve(cal.checkPermission({ scope: CalendarPermissionScope.WRITE_CALENDAR }));
    return read?.result === 'granted' && write?.result === 'granted';
  } catch {
    return false;
  }
};

// ─── Sync enable/disable setting ─────────────────────────────────
const SYNC_ENABLED_KEY = 'systemCalendarSyncEnabled';
const SYNC_MAP_KEY = 'systemCalendarSyncMap'; // appId → nativeEventId (outbound)
const PULLED_IDS_KEY = 'systemCalendarPulledIds'; // Set of native IDs we imported
const SYNC_STATUS_KEY = 'systemCalendarSyncStatus';

export interface CalendarSyncStatus {
  lastSyncedAt: string | null;
  pushed: number;
  pulled: number;
  totalSynced: number;
  errors: string[];
}

export type CalendarSyncDirection = 'bidirectional' | 'push' | 'pull';

export const isCalendarSyncEnabled = () => getSetting<boolean>(SYNC_ENABLED_KEY, false);
export const setCalendarSyncEnabled = (v: boolean) => setSetting(SYNC_ENABLED_KEY, v);
export const getCalendarSyncDirection = () => getSetting<CalendarSyncDirection>('calendarSyncDirection', 'bidirectional');
export const getCalendarSyncStatus = () => getSetting<CalendarSyncStatus>(SYNC_STATUS_KEY, {
  lastSyncedAt: null, pushed: 0, pulled: 0, totalSynced: 0, errors: [],
});

const saveSyncStatus = (s: CalendarSyncStatus) => {
  setSetting(SYNC_STATUS_KEY, s);
  window.dispatchEvent(new CustomEvent('calendarSyncStatusUpdated'));
};

// ─── Sync maps ──────────────────────────────────────────────────
type SyncMap = Record<string, string>; // appId → nativeEventId
const loadSyncMap = () => getSetting<SyncMap>(SYNC_MAP_KEY, {});
const saveSyncMap = (m: SyncMap) => setSetting(SYNC_MAP_KEY, m);

// Pulled IDs: native event IDs that we imported into the app
const loadPulledIds = async (): Promise<Set<string>> => {
  const arr = await getSetting<string[]>(PULLED_IDS_KEY, []);
  return new Set(arr);
};
const savePulledIds = (s: Set<string>) => setSetting(PULLED_IDS_KEY, [...s]);

// ─── Helpers ────────────────────────────────────────────────────
/** Returns true if an app event/task ID represents a pulled native event */
const isPulledNativeId = (id: string) => id.startsWith('native_');

const reminderToMinutes = (reminder?: string): number[] => {
  switch (reminder) {
    case '5min': return [-5];
    case '10min': return [-10];
    case '15min': return [-15];
    case '30min': return [-30];
    case '1hour': return [-60];
    case '1day': return [-1440];
    default: return [-15];
  }
};

// ─── Push a single task to native calendar ───────────────────────
export const pushTaskToNativeCalendar = async (task: TodoItem): Promise<string | null> => {
  if (!isNative() || !task.dueDate) return null;
  // Never push pulled native events back
  if (isPulledNativeId(task.id)) return null;

  try {
    const cal = CapacitorCalendar;
    const syncMap = await loadSyncMap();
    const existingId = syncMap[task.id];

    const startDate = new Date(task.dueDate).getTime();
    const endDate = startDate + 60 * 60 * 1000;

    const eventData = {
      title: task.text,
      startDate,
      endDate,
      description: task.description || '',
      location: task.location || '',
      isAllDay: false,
      alerts: task.reminderTime ? reminderToMinutes() : [-15],
    };

    if (existingId) {
      try {
        await Promise.resolve(cal.modifyEvent({ id: existingId, ...eventData }));
        return existingId;
      } catch {
        // Event was deleted externally → create new
        const { id } = await Promise.resolve(cal.createEvent(eventData));
        syncMap[task.id] = id;
        await saveSyncMap(syncMap);
        return id;
      }
    } else {
      const { id } = await Promise.resolve(cal.createEvent(eventData));
      syncMap[task.id] = id;
      await saveSyncMap(syncMap);
      return id;
    }
  } catch (e) {
    console.error('Failed to push task to native calendar:', e);
    return null;
  }
};

// ─── Push an app CalendarEvent to native calendar ────────────────
export const pushEventToNativeCalendar = async (event: AppCalendarEvent): Promise<string | null> => {
  if (!isNative()) return null;
  // Never push pulled native events back — this prevents the duplication loop
  if (isPulledNativeId(event.id)) return null;

  try {
    const cal = CapacitorCalendar;
    const syncMap = await loadSyncMap();
    const existingId = syncMap[event.id];

    const eventData = {
      title: event.title,
      startDate: new Date(event.startDate).getTime(),
      endDate: new Date(event.endDate).getTime(),
      description: event.description || '',
      location: event.location || '',
      isAllDay: event.allDay,
      alerts: reminderToMinutes(event.reminder),
    };

    if (existingId) {
      try {
        await Promise.resolve(cal.modifyEvent({ id: existingId, ...eventData }));
        return existingId;
      } catch {
        const { id } = await Promise.resolve(cal.createEvent(eventData));
        syncMap[event.id] = id;
        await saveSyncMap(syncMap);
        return id;
      }
    } else {
      const { id } = await Promise.resolve(cal.createEvent(eventData));
      syncMap[event.id] = id;
      await saveSyncMap(syncMap);
      return id;
    }
  } catch (e) {
    console.error('Failed to push event to native calendar:', e);
    return null;
  }
};

// ─── Remove a task/event from native calendar ────────────────────
export const removeFromNativeCalendar = async (appId: string): Promise<void> => {
  if (!isNative()) return;
  try {
    const cal = CapacitorCalendar;
    const syncMap = await loadSyncMap();
    const nativeId = syncMap[appId];
    if (nativeId) {
      await Promise.resolve(cal.deleteEvent({ id: nativeId })).catch(() => {});
      delete syncMap[appId];
      await saveSyncMap(syncMap);
    }
  } catch (e) {
    console.error('Failed to remove from native calendar:', e);
  }
};

// ─── Pull events from native calendar into app ──────────────────
export const pullFromNativeCalendar = async (
  daysAhead = 30,
  daysBehind = 7,
): Promise<{ newEvents: AppCalendarEvent[]; updatedEvents: AppCalendarEvent[] }> => {
  if (!isNative()) return { newEvents: [], updatedEvents: [] };
  try {
    const cal = CapacitorCalendar;
    const now = Date.now();
    const from = now - daysBehind * 24 * 60 * 60 * 1000;
    const to = now + daysAhead * 24 * 60 * 60 * 1000;

    let nativeEvents: any[] = [];
    try {
      const response = await Promise.resolve(cal.listEventsInRange({ from, to }));
      nativeEvents = response?.result ?? [];
    } catch (listErr) {
      const msg = String(listErr);
      if (msg.includes('not implemented') || msg.includes('UNIMPLEMENTED')) {
        console.warn('listEventsInRange not supported on this device');
        return { newEvents: [], updatedEvents: [] };
      }
      throw listErr;
    }

    if (!Array.isArray(nativeEvents) || nativeEvents.length === 0) {
      return { newEvents: [], updatedEvents: [] };
    }

    // Load both maps
    const syncMap = await loadSyncMap();
    const pulledIds = await loadPulledIds();
    const pushedNativeIds = new Set(Object.values(syncMap));

    // Load existing app events for update detection
    const existingAppEvents = await getSetting<AppCalendarEvent[]>('calendarEvents', []);
    const existingByNativeKey = new Map<string, AppCalendarEvent>();
    for (const e of existingAppEvents) {
      if (isPulledNativeId(e.id)) {
        existingByNativeKey.set(e.id, e);
      }
    }

    const newEvents: AppCalendarEvent[] = [];
    const updatedEvents: AppCalendarEvent[] = [];

    for (const e of nativeEvents) {
      if (!e?.id) continue;
      const nativeId = String(e.id);

      // Skip events WE pushed to native calendar
      if (pushedNativeIds.has(nativeId)) continue;

      const startTs = typeof e.startDate === 'number' ? e.startDate : Date.now();
      const endTs = typeof e.endDate === 'number' ? e.endDate : startTs + 3600000;
      const startDate = new Date(startTs);
      const endDate = new Date(endTs);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

      const appId = `native_${nativeId}`;
      const mapped: AppCalendarEvent = {
        id: appId,
        title: e.title || 'Untitled',
        description: e.description || undefined,
        location: e.location || undefined,
        allDay: e.isAllDay ?? false,
        startDate,
        endDate,
        timezone: e.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        repeat: 'never' as const,
        reminder: 'at_time' as const,
        createdAt: e.creationDate ? new Date(e.creationDate) : new Date(),
        updatedAt: e.lastModifiedDate ? new Date(e.lastModifiedDate) : new Date(),
      };

      const existing = existingByNativeKey.get(appId);
      if (existing) {
        // Check if the native event was modified since we last pulled it
        const existingModified = existing.updatedAt instanceof Date
          ? existing.updatedAt.getTime()
          : new Date(existing.updatedAt).getTime();
        const nativeModified = mapped.updatedAt instanceof Date
          ? mapped.updatedAt.getTime()
          : new Date(mapped.updatedAt).getTime();

        if (nativeModified > existingModified) {
          updatedEvents.push(mapped);
        }
        // Already exists and not modified → skip (no duplicate)
      } else if (!pulledIds.has(nativeId)) {
        // Truly new event we haven't seen before
        newEvents.push(mapped);
        pulledIds.add(nativeId);
      }
      // else: we pulled it before but it was deleted from app → don't re-import
    }

    // Persist the pulled IDs set
    await savePulledIds(pulledIds);

    return { newEvents, updatedEvents };
  } catch (e) {
    console.error('Failed to pull from native calendar:', e);
    return { newEvents: [], updatedEvents: [] };
  }
};

// ─── Yield to UI thread ─────────────────────────────────────────
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

// ─── Batch processing helper ────────────────────────────────────
const BATCH_SIZE = 25;

export type SyncProgressCallback = (info: { phase: string; current: number; total: number }) => void;

const processBatch = async <T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ processed: number; errors: string[] }> => {
  let processed = 0;
  const errors: string[] = [];
  const total = items.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    for (const item of batch) {
      try {
        await processor(item);
        processed++;
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (!msg.includes('not implemented') && !msg.includes('UNIMPLEMENTED')) {
          errors.push(msg);
        }
      }
    }

    onProgress?.(processed, total);
    await yieldToUI();
  }

  return { processed, errors };
};

// ─── Full bidirectional sync ─────────────────────────────────────
export const performFullCalendarSync = async (
  tasks: TodoItem[],
  appEvents: AppCalendarEvent[],
  onProgress?: SyncProgressCallback,
): Promise<SystemCalendarSyncResult> => {
  const result: SystemCalendarSyncResult = { pushed: 0, pulled: 0, updated: 0, errors: [] };

  if (!isNative()) return result;

  try {
    const enabled = await isCalendarSyncEnabled();
    if (!enabled) return result;

    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) {
      result.errors.push('Calendar permissions not granted');
      return result;
    }

    const direction = await getCalendarSyncDirection();

    // ── Push (App → Calendar) — skip if direction is 'pull' only ──
    if (direction !== 'pull') {
      const tasksWithDates = (tasks || []).filter(
        t => t?.dueDate && !t?.completed && !isPulledNativeId(t.id)
      );
      onProgress?.({ phase: 'Pushing tasks', current: 0, total: tasksWithDates.length });
      const taskResult = await processBatch(tasksWithDates, async (task) => {
        await pushTaskToNativeCalendar(task);
      }, (cur, tot) => {
        result.pushed = cur;
        onProgress?.({ phase: 'Pushing tasks', current: cur, total: tot });
      });
      result.pushed = taskResult.processed;
      result.errors.push(...taskResult.errors.map(e => `Task push: ${e}`));

      const appCreatedEvents = (appEvents || []).filter(e => !isPulledNativeId(e.id));
      onProgress?.({ phase: 'Pushing events', current: 0, total: appCreatedEvents.length });
      const eventResult = await processBatch(appCreatedEvents, async (event) => {
        await pushEventToNativeCalendar(event);
      }, (cur, tot) => {
        onProgress?.({ phase: 'Pushing events', current: result.pushed + cur, total: result.pushed + tot });
      });
      result.pushed += eventResult.processed;
      result.errors.push(...eventResult.errors.map(e => `Event push: ${e}`));
    }

    // ── Pull (Calendar → App) — skip if direction is 'push' only ──
    if (direction !== 'push') {
      onProgress?.({ phase: 'Pulling events', current: 0, total: 0 });
      try {
        const { newEvents, updatedEvents } = await pullFromNativeCalendar();
        const existingAppEvents = await getSetting<AppCalendarEvent[]>('calendarEvents', []);

        let changed = false;
        let merged = [...existingAppEvents];

        if (newEvents.length > 0) {
          merged = [...merged, ...newEvents];
          result.pulled = newEvents.length;
          changed = true;
        }

        if (updatedEvents.length > 0) {
          const updateMap = new Map(updatedEvents.map(e => [e.id, e]));
          merged = merged.map(e => updateMap.get(e.id) || e);
          result.updated = updatedEvents.length;
          changed = true;
        }

        if (changed) {
          await setSetting('calendarEvents', merged);
          window.dispatchEvent(new CustomEvent('calendarEventsUpdated', { detail: { fromSync: true } }));
        }

        onProgress?.({ phase: 'Pulling events', current: result.pulled, total: result.pulled });
      } catch (pullErr) {
        const msg = String(pullErr);
        if (!msg.includes('not implemented') && !msg.includes('UNIMPLEMENTED')) {
          result.errors.push(`Pull failed: ${msg}`);
        }
      }
    }

    // ── Save sync status ──
    try {
      const syncMap = await loadSyncMap();
      await saveSyncStatus({
        lastSyncedAt: new Date().toISOString(),
        pushed: result.pushed,
        pulled: result.pulled,
        totalSynced: Object.keys(syncMap).length,
        errors: result.errors,
      });
    } catch {}
  } catch (outerErr) {
    const msg = String(outerErr);
    if (!msg.includes('not implemented') && !msg.includes('UNIMPLEMENTED')) {
      result.errors.push(`Sync error: ${msg}`);
    }
  }

  onProgress?.({ phase: 'Done', current: result.pushed + result.pulled, total: result.pushed + result.pulled });
  return result;
};

// ─── Initialize: request permissions + initial sync ──────────────
export const initializeCalendarSync = async (): Promise<void> => {
  if (!isNative()) return;

  const enabled = await isCalendarSyncEnabled();
  if (!enabled) return;

  const granted = await requestCalendarPermissions();
  if (!granted) {
    console.warn('Calendar permissions not granted, disabling sync');
    return;
  }

  console.log('System calendar sync initialized');
};

// ─── Clear duplicate calendar events ─────────────────────────────
/**
 * Removes duplicate app calendar events based on title + startDate matching.
 * Keeps the first occurrence (oldest createdAt) and removes the rest.
 * Returns the number of duplicates removed.
 */
export const clearDuplicateCalendarEvents = async (): Promise<number> => {
  const events = await getSetting<AppCalendarEvent[]>('calendarEvents', []);
  if (events.length === 0) return 0;

  const seen = new Map<string, AppCalendarEvent>();
  const deduped: AppCalendarEvent[] = [];

  for (const event of events) {
    const startStr = event.startDate instanceof Date
      ? event.startDate.toISOString()
      : new Date(event.startDate).toISOString();
    const key = `${(event.title || '').trim().toLowerCase()}|${startStr}`;

    if (!seen.has(key)) {
      seen.set(key, event);
      deduped.push(event);
    }
    // else: duplicate → skip
  }

  const removed = events.length - deduped.length;
  if (removed > 0) {
    await setSetting('calendarEvents', deduped);
    window.dispatchEvent(new CustomEvent('calendarEventsUpdated', { detail: { fromSync: true } }));
  }

  return removed;
};
