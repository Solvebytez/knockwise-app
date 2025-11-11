import { apiInstance } from "@/lib/apiInstance";

export interface AgentZone {
  _id: string;
  name: string;
  description?: string;
  boundary: {
    type: "Polygon";
    coordinates: number[][][];
  };
  buildingData?: {
    addresses: string[];
    coordinates: number[][];
  };
  status: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  areaId?: {
    _id: string;
    name: string;
    type?: string;
  };
  municipalityId?: {
    _id: string;
    name: string;
    type?: string;
  };
  communityId?: {
    _id: string;
    name: string;
    type?: string;
  };
  assignedAgentId?: {
    _id: string;
    name: string;
    email?: string;
  };
}

interface AgentZoneResponse {
  success: boolean;
  data: AgentZone;
}

export interface CreateAgentZonePayload {
  name: string;
  description?: string;
  boundary: {
    type: "Polygon";
    coordinates: number[][][];
  };
  buildingData?: {
    addresses: string[];
    coordinates: number[][];
  };
  areaId?: string;
  municipalityId?: string;
  communityId?: string;
}

export interface UpdateAgentZonePayload {
  name?: string;
  description?: string;
  boundary?: {
    type: "Polygon";
    coordinates: number[][][];
  };
  buildingData?: {
    addresses: string[];
    coordinates: number[][];
  };
  areaId?: string;
  municipalityId?: string;
  communityId?: string;
  removeAssignment?: boolean;
  assignedAgentId?: string;
  teamId?: string;
  effectiveFrom?: string;
  isBoundaryUpdateOnly?: boolean;
  isNameDescriptionUpdateOnly?: boolean;
  isDateOnlyChange?: boolean;
}

export const createAgentZone = async (
  payload: CreateAgentZonePayload
): Promise<AgentZoneResponse> => {
  const response = await apiInstance.post<AgentZoneResponse>(
    "/agent-zones",
    payload
  );
  return response.data;
};

export const fetchAgentZoneById = async (
  zoneId: string
): Promise<AgentZoneResponse> => {
  const response = await apiInstance.get<AgentZoneResponse>(
    `/agent-zones/${zoneId}`
  );
  return response.data;
};

export const updateAgentZone = async (
  zoneId: string,
  payload: UpdateAgentZonePayload
): Promise<AgentZoneResponse> => {
  const response = await apiInstance.put<AgentZoneResponse>(
    `/agent-zones/${zoneId}`,
    payload
  );
  return response.data;
};


