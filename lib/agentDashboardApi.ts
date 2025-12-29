import { useQuery } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";
import { AgentRoute } from "./routeApi";
import { Activity } from "./activityApi";

export interface AgentDashboardStats {
  todayTasks: number;
  completedTasks: number;
  pendingTasks: number;
  performance: number;
  territories: number;
  routes: number;
  totalVisitsToday: number;
  totalVisitsYesterday: number;
  leadsCreatedToday: number;
  completedVisitsToday: number;
  pendingVisitsToday: number;
  totalPropertiesInCreatedZones: number;
  totalZonesCreatedByUser: number;
}

export interface AgentDashboardResponse {
  success: boolean;
  data: {
    stats: AgentDashboardStats;
    todaySchedule: AgentRoute[];
    recentActivities: Activity[];
  };
}

export const getAgentDashboardStats =
  async (): Promise<AgentDashboardResponse> => {
    try {
      const response = await apiInstance.get<AgentDashboardResponse>(
        "/users/dashboard-stats"
      );
      return response.data;
    } catch (error: any) {
      console.error("❌ Error fetching dashboard stats:", error);
      console.error("❌ Error response:", error.response?.data);
      console.error("❌ Error status:", error.response?.status);
      throw error;
    }
  };

export const useAgentDashboardStats = () => {
  return useQuery<AgentDashboardResponse, Error>({
    queryKey: ["agentDashboardStats"],
    queryFn: getAgentDashboardStats,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
};
