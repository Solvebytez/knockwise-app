import type { LatLng } from "react-native-maps";

export type ResidentStatus =
  | "not-visited"
  | "interested"
  | "visited"
  | "appointment"
  | "follow-up"
  | "not-interested"
  | "not-opened";

export interface Resident {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: ResidentStatus;
  lastVisited?: Date;
  notes?: string;
  phone?: string;
  email?: string;
}

export type TerritoryStatus = "draft" | "assigned" | "active" | "inactive";

export interface Territory {
  id: string;
  name: string;
  polygon: LatLng[];
  description?: string;
  status: TerritoryStatus;
  assignedTo?: string;
  assignedDate?: Date;
  residents: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MapSettings {
  center: LatLng;
  zoom: number;
  mapType: "standard" | "satellite" | "hybrid" | "terrain" | "mutedStandard";
}













