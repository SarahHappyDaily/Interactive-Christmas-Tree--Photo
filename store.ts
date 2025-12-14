import { create } from 'zustand';
import { TreeState } from './types';

export const useTreeStore = create<TreeState>((set) => ({
  handX: 0.5,
  handY: 0.5,
  handZ: 0.5,
  isTracking: false,
  isHandOpen: false,
  userPhotos: [],
  setHandPosition: (x, y, z, isTracking, isHandOpen) => set({ handX: x, handY: y, handZ: z, isTracking, isHandOpen }),
  addUserPhotos: (photos) => set((state) => ({ userPhotos: [...state.userPhotos, ...photos] })),
}));