import { apiInstance } from "@/lib/apiInstance";

export interface Lead {
  _id: string;
  propertyId: string | {
    _id: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  ownerName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  status: "NEW" | "CONTACTED" | "FOLLOW_UP" | "APPOINTMENT_SET" | "VISITED" | "NOT_INTERESTED" | "CONVERTED" | "LOST";
  source: "DOOR_KNOCK" | "DATAGRID" | "IMPORT" | "REFERRAL" | "OTHER";
  priority?: number;
  tags?: string[];
  assignedAgentId?: string;
  teamId?: string;
  zoneId?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsResponse {
  success?: boolean;
  data?: Lead[];
}

/**
 * Get leads assigned to the current agent
 */
export const getMyLeads = async (): Promise<Lead[]> => {
  const response = await apiInstance.get<Lead[] | LeadsResponse>("/leads/my");
  
  // Handle both response formats
  if (Array.isArray(response.data)) {
    return response.data;
  }
  
  if (response.data?.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  
  return [];
};












