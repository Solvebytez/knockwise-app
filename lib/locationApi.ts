import { apiInstance } from "@/lib/apiInstance";

export interface Area {
  _id: string;
  name: string;
  type: string;
}

export interface Municipality {
  _id: string;
  name: string;
  type: string;
  areaId: string;
}

export interface Community {
  _id: string;
  name: string;
  type: string;
  municipalityId: string;
  areaId: string;
}

interface AreasApiResponse {
  success: boolean;
  data: Area[];
}

interface MunicipalitiesApiResponse {
  success: boolean;
  data: Municipality[];
}

interface CommunitiesApiResponse {
  success: boolean;
  data: Community[];
}

export const fetchAreas = async (): Promise<Area[]> => {
  const response = await apiInstance.get<AreasApiResponse>("/areas", {
    _skipTokenCheck: true,
  } as any);
  return response.data?.data ?? [];
};

export const fetchMunicipalitiesByArea = async (
  areaId: string
): Promise<Municipality[]> => {
  if (!areaId) {
    return [];
  }
  const response = await apiInstance.get<MunicipalitiesApiResponse>(
    `/areas/${areaId}/municipalities`,
    { _skipTokenCheck: true } as any
  );
  return response.data?.data ?? [];
};

export const fetchCommunitiesByMunicipality = async (
  municipalityId: string
): Promise<Community[]> => {
  if (!municipalityId) {
    return [];
  }
  const response = await apiInstance.get<CommunitiesApiResponse>(
    `/municipalities/${municipalityId}/communities`,
    { _skipTokenCheck: true } as any
  );
  return response.data?.data ?? [];
};




