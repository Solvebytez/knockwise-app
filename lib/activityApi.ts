import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";

export type VisitResponse =
  | "NO_ANSWER"
  | "NOT_INTERESTED"
  | "CALL_BACK"
  | "APPOINTMENT_SET"
  | "FOLLOW_UP"
  | "LEAD_CREATED";

export type ActivityType = "VISIT" | "ZONE_OPERATION" | "PROPERTY_OPERATION" | "ROUTE_OPERATION";
export type OperationType = "CREATE" | "UPDATE" | "DELETE";

export interface Activity {
  _id: string;
  activityType?: ActivityType;
  agentId: {
    _id: string;
    name: string;
    email: string;
  };
  propertyId?: {
    _id: string;
    addressLine1?: string;
    city?: string;
    state?: string;
  } | null;
  zoneId?: {
    _id: string;
    name: string;
  } | null;
  residentId?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  response?: VisitResponse;
  operationType?: OperationType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyActivitiesResponse {
  success: boolean;
  data: Activity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ActivityStats {
  totalActivities: number;
  completedToday: number;
  pendingToday: number;
}

export const getMyActivities = async (params?: {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  zoneId?: string;
  response?: VisitResponse;
}): Promise<MyActivitiesResponse> => {
  const response = await apiInstance.get<MyActivitiesResponse>(
    "/activities/my",
    {
      params,
    }
  );
  return response.data;
};

export const useMyActivities = (params?: {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  zoneId?: string;
  response?: VisitResponse;
}) => {
  return useQuery<MyActivitiesResponse, Error>({
    queryKey: ["myActivities", params],
    queryFn: () => getMyActivities(params),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useMyActivitiesInfinite = (params?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
  zoneId?: string;
  response?: VisitResponse;
}) => {
  return useInfiniteQuery<MyActivitiesResponse, Error>({
    queryKey: ["myActivitiesInfinite", params],
    queryFn: ({ pageParam = 1 }) =>
      getMyActivities({ ...params, page: pageParam }),
    getNextPageParam: (lastPage) => {
      const { page, pages } = lastPage.pagination;
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

