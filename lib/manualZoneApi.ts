import { apiInstance } from "@/lib/apiInstance";

export interface ManualZoneRecord {
  _id: string;
  name: string;
  description?: string;
  areaId?: { _id: string; name: string } | string;
  municipalityId?: { _id: string; name: string } | string;
  communityId?: { _id: string; name: string } | string;
  zoneType?: "MANUAL" | "MAP";
}

interface ManualZoneResponse {
  success: boolean;
  data: ManualZoneRecord;
}

export interface CreateManualZonePayload {
  name: string;
  description?: string;
  areaId: string;
  municipalityId: string;
  communityId: string;
}

export const createManualZone = async (
  payload: CreateManualZonePayload
): Promise<ManualZoneRecord> => {
  // Use the new /agent-zones/manual endpoint (no boundary required)
  const response = await apiInstance.post<ManualZoneResponse>(
    "/agent-zones/manual",
    {
      name: payload.name,
      description: payload.description,
      areaId: payload.areaId,
      municipalityId: payload.municipalityId,
      communityId: payload.communityId,
    }
  );
  if (!response.data?.data?._id) {
    throw new Error("Manual zone response missing ID");
  }
  return response.data.data;
};


