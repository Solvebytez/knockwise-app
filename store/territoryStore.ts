import { create } from "zustand";
import type { LatLng } from "react-native-maps";
import type {
  MapSettings,
  Resident,
  ResidentStatus,
  Territory,
} from "@/types/territory";

interface TerritoryState {
  territories: Territory[];
  residents: Resident[];
  selectedTerritory: Territory | null;
  mapSettings: MapSettings;
  isDrawingMode: boolean;
  selectedResidents: Resident[];

  addTerritory: (territory: Territory) => void;
  updateTerritory: (id: string, updates: Partial<Territory>) => void;
  deleteTerritory: (id: string) => void;
  selectTerritory: (territory: Territory | null) => void;
  clearAllTerritories: () => void;

  addResident: (resident: Resident) => void;
  addResidents: (newResidents: Resident[]) => void;
  updateResident: (id: string, updates: Partial<Resident>) => void;
  updateResidentStatus: (id: string, status: ResidentStatus) => void;
  clearAllResidents: () => void;

  setMapSettings: (settings: Partial<MapSettings>) => void;
  setMapType: (mapType: MapSettings["mapType"]) => void;
  setDrawingMode: (isDrawing: boolean) => void;
  setSelectedResidents: (residents: Resident[]) => void;

  filterResidentsInPolygon: (polygon: LatLng[]) => Resident[];
}

const DEFAULT_CENTER: LatLng = {
  latitude: 43.6532,
  longitude: -79.3832,
};

const DEFAULT_MAP_SETTINGS: MapSettings = {
  center: DEFAULT_CENTER,
  zoom: 14,
  mapType: "standard",
};

const isPointInPolygon = (point: LatLng, polygon: LatLng[]): boolean => {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersect =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude <
        ((xj - xi) * (point.latitude - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
};

export const useTerritoryStore = create<TerritoryState>((set, get) => ({
  territories: [],
  residents: [],
  selectedTerritory: null,
  mapSettings: DEFAULT_MAP_SETTINGS,
  isDrawingMode: false,
  selectedResidents: [],

  addTerritory: (territory) =>
    set((state) => {
      const exists = state.territories.some((t) => t.id === territory.id);
      if (exists) {
        return state;
      }
      return { territories: [...state.territories, territory] };
    }),

  updateTerritory: (id, updates) =>
    set((state) => ({
      territories: state.territories.map((territory) =>
        territory.id === id ? { ...territory, ...updates } : territory
      ),
      selectedTerritory:
        state.selectedTerritory?.id === id
          ? { ...state.selectedTerritory, ...updates }
          : state.selectedTerritory,
    })),

  deleteTerritory: (id) =>
    set((state) => ({
      territories: state.territories.filter((territory) => territory.id !== id),
      selectedTerritory:
        state.selectedTerritory?.id === id ? null : state.selectedTerritory,
    })),

  selectTerritory: (territory) => set({ selectedTerritory: territory }),

  clearAllTerritories: () =>
    set({
      territories: [],
      selectedTerritory: null,
      isDrawingMode: false,
    }),

  addResident: (resident) =>
    set((state) => {
      const exists = state.residents.some((r) => r.id === resident.id);
      if (exists) {
        return state;
      }
      return { residents: [...state.residents, resident] };
    }),

  addResidents: (newResidents) =>
    set((state) => {
      const existingIds = new Set(state.residents.map((resident) => resident.id));
      const deduped = newResidents.filter(
        (resident) => !existingIds.has(resident.id)
      );
      if (deduped.length === 0) {
        return state;
      }
      return { residents: [...state.residents, ...deduped] };
    }),

  clearAllResidents: () => set({ residents: [] }),

  updateResident: (id, updates) =>
    set((state) => ({
      residents: state.residents.map((resident) =>
        resident.id === id ? { ...resident, ...updates } : resident
      ),
    })),

  updateResidentStatus: (id, status) =>
    set((state) => ({
      residents: state.residents.map((resident) =>
        resident.id === id
          ? { ...resident, status, lastVisited: new Date() }
          : resident
      ),
    })),

  setMapSettings: (settings) =>
    set((state) => ({
      mapSettings: { ...state.mapSettings, ...settings },
    })),

  setMapType: (mapType) =>
    set((state) => ({
      mapSettings: { ...state.mapSettings, mapType },
    })),

  setDrawingMode: (isDrawing) => set({ isDrawingMode: isDrawing }),

  setSelectedResidents: (residents) => set({ selectedResidents: residents }),

  filterResidentsInPolygon: (polygon) => {
    const { residents } = get();
    return residents.filter((resident) =>
      isPointInPolygon(
        { latitude: resident.latitude, longitude: resident.longitude },
        polygon
      )
    );
  },
}));

