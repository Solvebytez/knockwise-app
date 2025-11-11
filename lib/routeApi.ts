import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";

export type RouteStopStatus =
  | "PENDING"
  | "COMPLETED"
  | "SKIPPED"
  | "RESCHEDULED";

export interface RouteStop {
  propertyId?: string;
  address?: string;
  order: number;
  estimatedDuration: number;
  notes?: string;
  status?: RouteStopStatus;
  actualDuration?: number;
  completedAt?: string;
}

export type RouteStatus =
  | "DRAFT"
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type RoutePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface RouteOptimizationSettings {
  maxStops?: number;
  maxDistance?: number;
  preferredTimeWindow?: {
    start: string;
    end: string;
  };
  optimizationType?: "FASTEST" | "SHORTEST" | "BALANCED";
  avoidFerries?: boolean;
  avoidHighways?: boolean;
  avoidTolls?: boolean;
  avoidTraffic?: boolean;
  startFromOffice?: boolean;
  returnToOffice?: boolean;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  distanceText?: string;
  duration: number;
  durationText?: string;
  startLocation: [number, number];
  endLocation: [number, number];
  maneuver?: string;
  polyline?: string;
}

export interface RouteLeg {
  startAddress: string;
  endAddress: string;
  startLocation: [number, number];
  endLocation: [number, number];
  distance: number;
  distanceText?: string;
  duration: number;
  durationText?: string;
  steps: RouteStep[];
}

export interface RouteAlternative {
  summary: string;
  distance: number;
  distanceRoundedText?: string;
  distanceDetailedText?: string;
  duration: number;
  durationText?: string;
  trafficCondition?: string;
  legs: RouteLeg[];
  overviewPolyline?: string;
  warnings?: string[];
  waypointOrder?: number[];
}

export interface RouteDetails {
  selectedAlternativeIndex: number;
  alternatives: RouteAlternative[];
  bounds?: {
    northeast: [number, number];
    southwest: [number, number];
  };
  copyrights?: string;
  calculatedAt: string;
}

export interface RouteAnalyticsSnapshot {
  totalStops: number;
  completedStops: number;
  skippedStops: number;
  totalDistance: number;
  estimatedDuration: number;
  efficiency: number;
  completionRate: number;
}

export interface AgentRoute {
  _id: string;
  name: string;
  description?: string;
  agentId: string;
  zoneId?: {
    _id?: string;
    name?: string;
  } | null;
  teamId?: {
    _id?: string;
    name?: string;
  } | null;
  date: string;
  stops: RouteStop[];
  totalDistance: number;
  totalDuration: number;
  status: RouteStatus;
  priority: RoutePriority;
  startLocation?: {
    type: "Point";
    coordinates: [number, number];
    address?: string;
  } | null;
  endLocation?: {
    type: "Point";
    coordinates: [number, number];
    address?: string;
  } | null;
  optimizationSettings?: RouteOptimizationSettings;
  analytics?: RouteAnalyticsSnapshot;
  routeDetails?: RouteDetails;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MyRoutesResponse {
  routes: AgentRoute[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateRouteRequest {
  name: string;
  description?: string;
  date: string;
  priority?: RoutePriority;
  startLocation?: {
    coordinates: [number, number];
    address?: string;
  };
  endLocation?: {
    coordinates: [number, number];
    address?: string;
  };
  stops?: RouteStop[];
  totalDistance?: number;
  totalDuration?: number;
  optimizationSettings?: RouteOptimizationSettings;
  analytics?: RouteAnalyticsSnapshot;
  routeDetails?: RouteDetails;
  tags?: string[];
}

export interface UpdateRouteRequest extends Partial<CreateRouteRequest> {
  status?: RouteStatus;
}

export const createRoute = async (
  payload: CreateRouteRequest
): Promise<AgentRoute> => {
  const response = await apiInstance.post<AgentRoute>("/routes/create", payload);
  return response.data;
};

export const getMyRoutes = async (params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  date?: string;
}): Promise<MyRoutesResponse> => {
  const response = await apiInstance.get<MyRoutesResponse>("/routes/my", {
    params,
  });
  return response.data;
};

export const getRouteById = async (id: string): Promise<AgentRoute> => {
  const response = await apiInstance.get<AgentRoute>(`/routes/${id}`);
  return response.data;
};

export const updateRoute = async (
  id: string,
  payload: UpdateRouteRequest
): Promise<AgentRoute> => {
  const response = await apiInstance.put<AgentRoute>(`/routes/${id}`, payload);
  return response.data;
};

export const deleteRoute = async (id: string): Promise<void> => {
  await apiInstance.delete(`/routes/${id}`);
};

export const useMyRoutes = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  date?: string;
}) => {
  return useQuery<MyRoutesResponse, Error>({
    queryKey: ["myRoutes", params],
    queryFn: () => getMyRoutes(params),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useRoute = (id: string) => {
  return useQuery<AgentRoute, Error>({
    queryKey: ["route", id],
    queryFn: () => getRouteById(id),
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateRoute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myRoutes"] });
    },
  });
};

export const useUpdateRoute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRouteRequest }) =>
      updateRoute(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["myRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["route", variables.id] });
    },
  });
};

export const useDeleteRoute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myRoutes"] });
    },
  });
};

