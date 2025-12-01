import { apiInstance } from "@/lib/apiInstance";

export interface Resident {
  _id: string;
  address: string;
  houseNumber: number;
  status: "not-visited" | "visited" | "interested" | "callback" | "appointment" | "follow-up" | "not-interested";
  phone?: string;
  email?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  notes?: string;
  zoneId: string | {
    _id: string;
    name: string;
  };
  assignedAgentId?: string | {
    _id: string;
    name: string;
    email: string;
  };
  coordinates: [number, number]; // [lng, lat]
  createdAt: string;
  updatedAt: string;
}

/**
 * Get leads (visited residents) from zones created by the current user
 * Returns the latest properties with status other than "not-visited" for display on home screen
 * Includes: visited, interested, callback, appointment, follow-up, not-interested
 */
export const getMyNotVisitedResidents = async (limit: number = 3): Promise<Resident[]> => {
  try {
    console.log("📝 [getMyNotVisitedResidents] Fetching leads (visited residents), limit:", limit);
    const response = await apiInstance.get<Resident[]>(`/residents/my-not-visited?limit=${limit}`);
    console.log("✅ [getMyNotVisitedResidents] Found leads:", response.data.length);
    return response.data;
  } catch (error: any) {
    console.error("❌ Error fetching leads:", error);
    throw error;
  }
};

