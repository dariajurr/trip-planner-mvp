import { ExportFile, UserContent, UserState, emptyUserContent } from '../models';
import { LocalSnapshot, SyncError, parseExportFile, planImport } from './sync-core';

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';

const place = (id: string, name: string) => ({
  id, name, category: 'other', priority: 'optional', areaId: 'shibuya',
  coordinates: { lat: 35.6, lng: 139.7 }, schedule: { weekdays: null, openingHours: null },
});

const state = (over: Partial<UserState> = {}): UserState => ({
  version: 3, placeStates: [], assignedRoutes: [], photoSpots: [], notes: {}, ...over,
});

const file = (over: Partial<ExportFile> = {}): ExportFile => ({
  format: 'trip-planner-export', schemaVersion: 1, exportedAt: T3,
  content: emptyUserContent(), plan: { assignedRoutes: [], notes: {} }, marks: { placeStates: [], photoSpots: [] },
  ...over,
});

const local = (content: UserContent = emptyUserContent(), s: UserState = state()): LocalSnapshot => ({ content, state: s });
const stats = (plan: ReturnType<typeof planImport>, key: string) => plan.groups.find(g => g.key === key)!.stats;

describe('planImport: content', () => {
  it('adds new places and detects changes', () => {
    const incoming = emptyUserContent();
    incoming.places['u-1'] = { value: place('u-1', 'Cafe') as any, updatedAt: T2 };
    const plan = planImport(local(), file({ content: incoming }), { applyMarks: false });
    expect(stats(plan, 'places').added).toBe(1);
    expect(plan.content.places['u-1'].value?.name).toBe('Cafe');
    expect(plan.hasChanges).toBe(true);
  });

  it('newer wins, older is kept local', () => {
    const mine = emptyUserContent();
    mine.places['a'] = { value: place('a', 'Mine new') as any, updatedAt: T3 };
    mine.places['b'] = { value: place('b', 'Mine old') as any, updatedAt: T1 };
    const theirs = emptyUserContent();
    theirs.places['a'] = { value: place('a', 'Theirs old') as any, updatedAt: T2 };
    theirs.places['b'] = { value: place('b', 'Theirs new') as any, updatedAt: T2 };
    const plan = planImport(local(mine), file({ content: theirs }), { applyMarks: false });
    expect(plan.content.places['a'].value?.name).toBe('Mine new');
    expect(plan.content.places['b'].value?.name).toBe('Theirs new');
    expect(stats(plan, 'places')).toEqual(jasmine.objectContaining({ keptLocal: 1, updated: 1 }));
  });

  it('propagates deletions (tombstones)', () => {
    const mine = emptyUserContent();
    mine.places['a'] = { value: place('a', 'Cafe') as any, updatedAt: T1 };
    const theirs = emptyUserContent();
    theirs.places['a'] = { value: null, updatedAt: T2 };
    const plan = planImport(local(mine), file({ content: theirs }), { applyMarks: false });
    expect(plan.content.places['a'].value).toBeNull();
    expect(stats(plan, 'places').removed).toBe(1);
  });

  it('is idempotent: importing the same file twice changes nothing', () => {
    const incoming = emptyUserContent();
    incoming.places['u-1'] = { value: place('u-1', 'Cafe') as any, updatedAt: T2 };
    const f = file({ content: incoming });
    const first = planImport(local(), f, { applyMarks: false });
    const second = planImport(local(first.content), f, { applyMarks: false });
    expect(second.hasChanges).toBe(false);
    expect(stats(second, 'places').same).toBe(1);
  });

  it('rejects malformed entities and prototype pollution keys', () => {
    const incoming: any = emptyUserContent();
    incoming.places['bad'] = { value: { id: 'bad', name: 5 }, updatedAt: T2 };
    incoming.places['wrong-id'] = { value: place('other', 'X'), updatedAt: T2 };
    incoming.places['__proto__'] = { value: place('__proto__', 'X'), updatedAt: T2 };
    const plan = planImport(local(), file({ content: incoming }), { applyMarks: false });
    expect(stats(plan, 'places').invalid).toBeGreaterThanOrEqual(2);
    expect(Object.keys(plan.content.places).length).toBe(0);
    expect(({} as any).name).toBeUndefined();
  });

  it('does not mutate local data', () => {
    const mine = emptyUserContent();
    const incoming = emptyUserContent();
    incoming.places['u-1'] = { value: place('u-1', 'Cafe') as any, updatedAt: T2 };
    planImport(local(mine), file({ content: incoming }), { applyMarks: false });
    expect(Object.keys(mine.places).length).toBe(0);
  });
});

describe('planImport: plan and marks', () => {
  const assigned = (deleted: boolean, updatedAt: string) => ({ tripId: 't', routeId: 'r', date: '2026-12-02', updatedAt, ...(deleted ? { deleted: true } : {}) });

  it('syncs route assignments, including removal', () => {
    const l = local(emptyUserContent(), state({ assignedRoutes: [assigned(false, T1)] }));
    const plan = planImport(l, file({ plan: { assignedRoutes: [assigned(true, T2)], notes: {} } }), { applyMarks: false });
    expect(plan.assignedRoutes[0].deleted).toBe(true);
    expect(stats(plan, 'assignedRoutes').removed).toBe(1);
  });

  it('keeps local marks untouched when the checkbox is off', () => {
    const l = local(emptyUserContent(), state({ placeStates: [{ placeId: 'p', status: 'want', isFavorite: false, updatedAt: T1 }] }));
    const f = file({ marks: { placeStates: [{ placeId: 'p', status: 'visited', isFavorite: true, updatedAt: T3 }], photoSpots: [] } });
    const off = planImport(l, f, { applyMarks: false });
    expect(off.placeStates).toBeUndefined();
    expect(off.marksInFile).toBe(1);
    const on = planImport(l, f, { applyMarks: true });
    expect(on.placeStates?.[0].status).toBe('visited');
    expect(on.placeStates?.[0].isFavorite).toBe(true);
  });

  it('merges notes by timestamp', () => {
    const l = local(emptyUserContent(), state({ notes: { p: { text: 'old', updatedAt: T1 } } }));
    const plan = planImport(l, file({ plan: { assignedRoutes: [], notes: { p: { text: 'new', updatedAt: T2 } } } }), { applyMarks: false });
    expect(plan.notes['p'].text).toBe('new');
  });
});

describe('parseExportFile', () => {
  it('accepts a valid file and fills in missing sections', () => {
    const f = parseExportFile(JSON.stringify({ format: 'trip-planner-export', schemaVersion: 1, content: {} }));
    expect(f.plan.assignedRoutes).toEqual([]);
    expect(f.marks.placeStates).toEqual([]);
  });

  it('rejects foreign, broken and too-new files with readable errors', () => {
    expect(() => parseExportFile('not json')).toThrowError(SyncError);
    expect(() => parseExportFile('{"a":1}')).toThrowError(SyncError);
    expect(() => parseExportFile('{"format":"trip-planner-export","schemaVersion":99,"content":{}}')).toThrowError(/новой версией/);
  });
});

describe('planImport: bookings', () => {
  const flight = (id: string) => ({ id, tripId: 't', kind: 'flight', flightNumber: 'LH 716', from: 'FRA', to: 'HND', departure: { date: '2026-12-12', time: '11:45' } });

  it('adds new bookings, ignores malformed ones', () => {
    const incoming: any = emptyUserContent();
    incoming.bookings['u-b1'] = { value: flight('u-b1'), updatedAt: T2 };
    incoming.bookings['u-b2'] = { value: { id: 'u-b2', tripId: 't', kind: 'flight' }, updatedAt: T2 };
    const plan = planImport(local(), file({ content: incoming }), { applyMarks: false });
    expect(stats(plan, 'bookings').added).toBe(1);
    expect(stats(plan, 'bookings').invalid).toBe(1);
    expect(plan.content.bookings['u-b1'].value).toBeTruthy();
  });

  it('parses the attachments section of an export file', () => {
    const f = parseExportFile(JSON.stringify({ format: 'trip-planner-export', schemaVersion: 1, content: {}, attachments: { 'u-doc-1': 'data:application/pdf;base64,AAAA' } }));
    expect(f.attachments).toEqual({ 'u-doc-1': 'data:application/pdf;base64,AAAA' });
  });
});
