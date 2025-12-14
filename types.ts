export interface TreeState {
  handX: number; // Normalized X position (0 to 1)
  handY: number; // Normalized Y position (0 to 1)
  handZ: number; // Normalized Scale/Proximity (0 to 1 approx)
  isTracking: boolean;
  isHandOpen: boolean; // true = scatter/control, false = tree
  userPhotos: string[]; // List of uploaded image Data URLs
  setHandPosition: (x: number, y: number, z: number, isTracking: boolean, isHandOpen: boolean) => void;
  addUserPhotos: (photos: string[]) => void;
}

export enum LoadingStatus {
  INITIALIZING = 'INITIALIZING',
  LOADING_MODEL = 'LOADING_MODEL',
  READY = 'READY',
  ERROR = 'ERROR'
}