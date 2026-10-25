import { UserContent } from './user-content.model';
import { AssignedRoute, UserNote, UserPhotoSpotState, UserPlaceState } from './user-state.model';

export const EXPORT_FORMAT = 'trip-planner-export';
export const EXPORT_SCHEMA_VERSION = 1;

/** The file exchanged between devices. */
export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  deviceName?: string;
  /** Places, areas, cities, routes... added or changed on top of the catalog. */
  content: UserContent;
  /** Shared plan: which route is on which day, notes. */
  plan: { assignedRoutes: AssignedRoute[]; notes: Record<string, UserNote> };
  /** Personal marks. Applied on import only if the receiver opts in. */
  marks: { placeStates: UserPlaceState[]; photoSpots: UserPhotoSpotState[] };
  /** Photo id -> data URL. Present only when exported with photos. */
  photos?: Record<string, string>;
  /** Booking documents: attachment id -> data URL. Present only when exported with files. */
  attachments?: Record<string, string>;
}

export interface MergeStats {
  added: number;
  updated: number;
  removed: number;
  /** Records where this device has the newer version, so the file's one was ignored. */
  keptLocal: number;
  same: number;
  invalid: number;
}
