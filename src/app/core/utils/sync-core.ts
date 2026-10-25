import {
  AssignedRoute,
  CONTENT_COLLECTIONS,
  ContentCollection,
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  ExportFile,
  MergeStats,
  OverlayMap,
  OverlayRecord,
  UserContent,
  UserNote,
  UserPhotoSpotState,
  UserPlaceState,
  UserState,
  emptyUserContent,
} from '../models';

export class SyncError extends Error {}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const stamp = (s: string | undefined) => {
  const t = Date.parse(s ?? '');
  return Number.isFinite(t) ? t : 0;
};
const emptyStats = (): MergeStats => ({ added: 0, updated: 0, removed: 0, keptLocal: 0, same: 0, invalid: 0 });

/** Last-write-wins merge of one keyed record set. Never mutates its inputs. */
function mergeRecords<T>(
  local: Record<string, T>,
  incoming: Record<string, T>,
  stampOf: (t: T) => string,
  deletedOf: (t: T) => boolean,
  plausible: (key: string, value: T) => boolean,
): { merged: Record<string, T>; stats: MergeStats } {
  const merged: Record<string, T> = { ...local };
  const stats = emptyStats();

  for (const [key, record] of Object.entries(incoming ?? {})) {
    if (FORBIDDEN_KEYS.has(key) || !plausible(key, record)) {
      stats.invalid++;
      continue;
    }
    const mine = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : undefined;
    if (!mine) {
      merged[key] = record;
      deletedOf(record) ? stats.removed++ : stats.added++;
      continue;
    }
    const diff = stamp(stampOf(record)) - stamp(stampOf(mine));
    if (diff > 0) {
      merged[key] = record;
      deletedOf(record) ? stats.removed++ : stats.updated++;
    } else if (diff < 0) {
      stats.keptLocal++;
    } else {
      stats.same++;
    }
  }
  return { merged, stats };
}

function mergeList<T>(
  local: T[],
  incoming: T[],
  keyOf: (t: T) => string,
  stampOf: (t: T) => string,
  deletedOf: (t: T) => boolean,
  plausible: (t: T) => boolean = () => true,
): { merged: T[]; stats: MergeStats } {
  const toMap = (list: T[]) => Object.fromEntries((list ?? []).map(t => [keyOf(t), t]));
  const incomingMap = toMap((incoming ?? []).filter(t => plausible(t)));
  const invalid = (incoming ?? []).length - Object.keys(incomingMap).length;
  const result = mergeRecords(toMap(local), incomingMap, stampOf, deletedOf, () => true);
  result.stats.invalid += invalid;
  return { merged: Object.values(result.merged), stats: result.stats };
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Minimal shape check so a damaged or foreign file cannot break the catalog. */
function plausibleEntity(collection: ContentCollection, key: string, record: OverlayRecord<any>): boolean {
  if (!isObj(record) || typeof record.updatedAt !== 'string') return false;
  const v = record.value;
  if (v === null) return true;
  if (!isObj(v) || v['id'] !== key) return false;
  switch (collection) {
    case 'places':
      return typeof v['name'] === 'string' && typeof v['areaId'] === 'string' && isObj(v['coordinates']) && isNum(v['coordinates']['lat']) && isNum(v['coordinates']['lng']);
    case 'areas':
      return typeof v['name'] === 'string' && typeof v['cityId'] === 'string';
    case 'cities':
      return typeof v['name'] === 'string' && typeof v['countryId'] === 'string';
    case 'countries':
      return typeof v['name'] === 'string';
    case 'photoSpots':
      return typeof v['title'] === 'string' && typeof v['areaId'] === 'string';
    case 'routes':
      return typeof v['title'] === 'string' && Array.isArray(v['stops']);
    case 'trips':
      return typeof v['title'] === 'string' && Array.isArray(v['cityIds']);
    case 'bookings':
      return (
        typeof v['tripId'] === 'string' &&
        ((v['kind'] === 'flight' && typeof v['flightNumber'] === 'string' && isObj(v['departure']) && typeof v['departure']['date'] === 'string') ||
          (v['kind'] === 'hotel' && typeof v['name'] === 'string' && isObj(v['checkIn']) && isObj(v['checkOut'])))
      );
  }
}

export function mergeContent(
  local: UserContent,
  incoming: UserContent,
): { merged: UserContent; stats: Record<ContentCollection, MergeStats> } {
  const merged = emptyUserContent();
  const stats = {} as Record<ContentCollection, MergeStats>;
  for (const c of CONTENT_COLLECTIONS) {
    const r = mergeRecords<OverlayRecord<unknown>>(
      local[c] as OverlayMap<unknown>,
      (incoming[c] ?? {}) as OverlayMap<unknown>,
      x => x.updatedAt,
      x => x.value === null,
      (key, value) => plausibleEntity(c, key, value),
    );
    (merged[c] as OverlayMap<unknown>) = r.merged;
    stats[c] = r.stats;
  }
  return { merged, stats };
}

export const GROUP_LABELS: Record<string, string> = {
  places: 'Точки',
  areas: 'Районы',
  cities: 'Города',
  countries: 'Страны',
  routes: 'Маршруты',
  photoSpots: 'Фотолокации',
  trips: 'Поездки',
  bookings: 'Брони',
  assignedRoutes: 'Маршруты по дням',
  notes: 'Заметки',
  placeStates: 'Отметки точек',
  photoSpotStates: 'Отметки фотолокаций',
};

export interface ImportGroup {
  key: string;
  label: string;
  stats: MergeStats;
}

export interface LocalSnapshot {
  content: UserContent;
  state: UserState;
}

export interface ImportPlan {
  content: UserContent;
  assignedRoutes: AssignedRoute[];
  notes: Record<string, UserNote>;
  /** Undefined when marks were not accepted: the local ones stay untouched. */
  placeStates?: UserPlaceState[];
  photoSpotStates?: UserPhotoSpotState[];
  groups: ImportGroup[];
  marksInFile: number;
  marksApplied: boolean;
  /** Anything to change at all? */
  hasChanges: boolean;
}

export function parseExportFile(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SyncError('Это не файл синхронизации: не удалось прочитать JSON.');
  }
  if (!isObj(data) || data['format'] !== EXPORT_FORMAT) {
    throw new SyncError('Это не файл синхронизации Trip Planner.');
  }
  if (typeof data['schemaVersion'] !== 'number' || data['schemaVersion'] > EXPORT_SCHEMA_VERSION) {
    throw new SyncError('Файл создан более новой версией приложения. Обновите приложение и повторите.');
  }
  if (!isObj(data['content'])) {
    throw new SyncError('В файле нет данных для импорта.');
  }

  const content = emptyUserContent();
  for (const c of CONTENT_COLLECTIONS) {
    const part = (data['content'] as Record<string, unknown>)[c];
    if (isObj(part)) {
      (content[c] as OverlayMap<unknown>) = part as OverlayMap<unknown>;
    }
  }
  const plan = isObj(data['plan']) ? data['plan'] : {};
  const marks = isObj(data['marks']) ? data['marks'] : {};

  return {
    format: EXPORT_FORMAT,
    schemaVersion: data['schemaVersion'],
    exportedAt: typeof data['exportedAt'] === 'string' ? data['exportedAt'] : '',
    deviceName: typeof data['deviceName'] === 'string' ? data['deviceName'] : undefined,
    content,
    plan: {
      assignedRoutes: Array.isArray(plan['assignedRoutes']) ? plan['assignedRoutes'] : [],
      notes: isObj(plan['notes']) ? (plan['notes'] as Record<string, UserNote>) : {},
    },
    marks: {
      placeStates: Array.isArray(marks['placeStates']) ? marks['placeStates'] : [],
      photoSpots: Array.isArray(marks['photoSpots']) ? marks['photoSpots'] : [],
    },
    photos: isObj(data['photos']) ? (data['photos'] as Record<string, string>) : undefined,
    attachments: isObj(data['attachments']) ? (data['attachments'] as Record<string, string>) : undefined,
  };
}

/** Computes what an import would do, without applying it. */
export function planImport(local: LocalSnapshot, file: ExportFile, opts: { applyMarks: boolean }): ImportPlan {
  const groups: ImportGroup[] = [];

  const content = mergeContent(local.content, file.content);
  for (const c of CONTENT_COLLECTIONS) {
    groups.push({ key: c, label: GROUP_LABELS[c], stats: content.stats[c] });
  }

  const routeKey = (a: AssignedRoute) => `${a.tripId}|${a.routeId}|${a.date}`;
  const assigned = mergeList(
    local.state.assignedRoutes,
    file.plan.assignedRoutes.filter(a => isObj(a) && typeof a.routeId === 'string' && typeof a.date === 'string' && typeof a.tripId === 'string'),
    routeKey,
    a => a.updatedAt,
    a => !!a.deleted,
  );
  groups.push({ key: 'assignedRoutes', label: GROUP_LABELS['assignedRoutes'], stats: assigned.stats });

  const notes = mergeRecords<UserNote>(
    local.state.notes,
    file.plan.notes,
    n => n.updatedAt,
    n => !n.text,
    (_k, n) => isObj(n) && typeof n.text === 'string' && typeof n.updatedAt === 'string',
  );
  groups.push({ key: 'notes', label: GROUP_LABELS['notes'], stats: notes.stats });

  const marksInFile = file.marks.placeStates.length + file.marks.photoSpots.length;
  const plan: ImportPlan = {
    content: content.merged,
    assignedRoutes: assigned.merged,
    notes: notes.merged,
    groups,
    marksInFile,
    marksApplied: opts.applyMarks,
    hasChanges: false,
  };

  if (opts.applyMarks) {
    const places = mergeList(
      local.state.placeStates,
      file.marks.placeStates.filter(s => isObj(s) && typeof s.placeId === 'string'),
      s => s.placeId,
      s => s.updatedAt,
      () => false,
    );
    const spots = mergeList(
      local.state.photoSpots,
      file.marks.photoSpots.filter(s => isObj(s) && typeof s.photoSpotId === 'string'),
      s => s.photoSpotId,
      s => s.updatedAt,
      () => false,
    );
    plan.placeStates = places.merged;
    plan.photoSpotStates = spots.merged;
    groups.push({ key: 'placeStates', label: GROUP_LABELS['placeStates'], stats: places.stats });
    groups.push({ key: 'photoSpotStates', label: GROUP_LABELS['photoSpotStates'], stats: spots.stats });
  }

  plan.hasChanges = groups.some(g => g.stats.added + g.stats.updated + g.stats.removed > 0);
  return plan;
}
