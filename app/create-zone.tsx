import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
} from "react-native";
import * as Location from "expo-location";
import type { LocationGeocodedLocation } from "expo-location";
import MapView, {
  LatLng as MapLatLng,
  MapPressEvent,
  Marker,
  Polygon,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, H3, Body2, Body3, Button } from "@/components/ui";
import { useTerritoryStore } from "@/store/territoryStore";
import { apiInstance } from "@/lib/apiInstance";
import {
  detectBuildingsForPolygon,
  type DetectedBuilding,
} from "@/lib/detectBuildings";
import {
  fetchAreas,
  fetchMunicipalitiesByArea,
  fetchCommunitiesByMunicipality,
  type Area,
  type Municipality,
  type Community,
} from "@/lib/locationApi";
import {
  createAgentZone,
  fetchAgentZoneById,
  updateAgentZone,
  type AgentZone,
  type UpdateAgentZonePayload,
} from "@/lib/agentZoneApi";
import {
  COLORS,
  PADDING,
  SPACING,
  responsiveScale,
  responsiveSpacing,
} from "@/constants";
import type {
  Resident,
  ResidentStatus,
  Territory,
  TerritoryStatus,
} from "@/types/territory";

type WorkflowStep = "drawing" | "saving";

interface PendingTerritory {
  polygon: MapLatLng[];
  residents: Resident[];
  duplicateAddresses: string[];
  detectedBuildings: DetectedBuilding[];
}

interface ZoneScreenProps {
  mode?: "create" | "edit";
  territoryId?: string;
}

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const MIN_MAP_DELTA = 0.0005;
const MAX_MAP_DELTA = 60;
const ZOOM_IN_FACTOR = 0.65;
const ZOOM_OUT_FACTOR = 1.35;

const MAP_TYPE_SEQUENCE: (
  | "standard"
  | "satellite"
  | "hybrid"
  | "terrain"
  | "mutedStandard"
)[] = ["standard", "hybrid", "satellite", "terrain"];

const GOOGLE_PLACES_API_KEY = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";

const normalizeStatus = (status: string | undefined): TerritoryStatus => {
  const normalized = (status || "draft").toLowerCase();
  if (normalized === "assigned" || normalized === "active") {
    return normalized as TerritoryStatus;
  }
  if (normalized === "inactive") {
    return "inactive";
  }
  return "draft";
};

const stripClosingPoint = <T extends { latitude: number; longitude: number }>(
  points: T[]
): T[] => {
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (
      Math.abs(first.latitude - last.latitude) < Number.EPSILON &&
      Math.abs(first.longitude - last.longitude) < Number.EPSILON
    ) {
      return points.slice(0, -1);
    }
  }
  return points;
};

const arePolygonsEqual = (
  a: MapLatLng[] | undefined,
  b: MapLatLng[] | undefined,
  tolerance = 1e-6
): boolean => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const pointA = a[i];
    const pointB = b[i];
    if (
      Math.abs(pointA.latitude - pointB.latitude) > tolerance ||
      Math.abs(pointA.longitude - pointB.longitude) > tolerance
    ) {
      return false;
    }
  }
  return true;
};

const resolveEntityId = (input: any): string => {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    if (typeof input._id === "string") return input._id;
    if (typeof input.id === "string") return input.id;
  }
  return "";
};

const mapResidentFromApi = (input: any): Resident | null => {
  if (!input) return null;

  const lat =
    typeof input.lat === "number"
      ? input.lat
      : typeof input.latitude === "number"
      ? input.latitude
      : Array.isArray(input.coordinates)
      ? Number(input.coordinates[1])
      : undefined;
  const lng =
    typeof input.lng === "number"
      ? input.lng
      : typeof input.longitude === "number"
      ? input.longitude
      : Array.isArray(input.coordinates)
      ? Number(input.coordinates[0])
      : undefined;

  if (typeof lat !== "number" || Number.isNaN(lat)) {
    return null;
  }

  const status = (input.status?.toLowerCase?.() ||
    "not-visited") as ResidentStatus;

  return {
    id: input._id || input.id || `${lat}-${lng}`,
    name: input.name || `Resident at ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    address:
      input.address ||
      input.formattedAddress ||
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    latitude: lat,
    longitude: lng,
    status,
    lastVisited: input.lastVisited ? new Date(input.lastVisited) : undefined,
    notes: input.notes,
    phone: input.phone,
    email: input.email,
  };
};

export default function CreateZoneScreen({
  mode: modeProp,
  territoryId: territoryIdProp,
}: ZoneScreenProps = {}): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    territory_id?: string;
  }>();
  const resolvedMode = useMemo<"create" | "edit">(() => {
    if (modeProp === "edit" || modeProp === "create") {
      return modeProp;
    }
    return params.mode === "edit" ? "edit" : "create";
  }, [modeProp, params.mode]);

  const isEditMode = resolvedMode === "edit";
  const editTerritoryId = useMemo(() => {
    if (territoryIdProp && typeof territoryIdProp === "string") {
      return territoryIdProp;
    }
    const value = params.territory_id;
    return typeof value === "string" ? value : "";
  }, [params.territory_id, territoryIdProp]);

  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);

  const {
    territories,
    residents,
    addTerritory,
    updateTerritory,
    clearAllTerritories,
    addResidents,
    clearAllResidents,
    setDrawingMode,
    isDrawingMode,
    mapSettings,
    setMapType,
    filterResidentsInPolygon,
  } = useTerritoryStore();

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isLoadingTerritory, setIsLoadingTerritory] = useState(isEditMode);
  const [territoryLoadError, setTerritoryLoadError] = useState<string | null>(
    null
  );
  const [originalTerritory, setOriginalTerritory] = useState<AgentZone | null>(
    null
  );
  const [territoryReloadKey, setTerritoryReloadKey] = useState(0);

  const [currentDrawing, setCurrentDrawing] = useState<MapLatLng[]>([]);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("drawing");
  const [pendingTerritory, setPendingTerritory] =
    useState<PendingTerritory | null>(null);
  const [territoryName, setTerritoryName] = useState("");
  const [territoryDescription, setTerritoryDescription] = useState("");
  const [selectedAreaName, setSelectedAreaName] = useState("");
  const [selectedMunicipalityName, setSelectedMunicipalityName] = useState("");
  const [selectedCommunityName, setSelectedCommunityName] = useState("");
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isProcessingPolygon, setIsProcessingPolygon] = useState(false);
  const [showExistingTerritories, setShowExistingTerritories] = useState(false);

  const [residentsInDrawing, setResidentsInDrawing] = useState<Resident[]>([]);
  const [hasStartedEditing, setHasStartedEditing] = useState(false);
  const [isDetectingBuildings, setIsDetectingBuildings] = useState(false);

  const [mapTypeIndex, setMapTypeIndex] = useState(() =>
    Math.max(0, MAP_TYPE_SEQUENCE.indexOf(mapSettings.mapType))
  );

  const mapTypeLabel = useMemo(() => {
    if (!mapSettings.mapType) return "";
    return (
      mapSettings.mapType.charAt(0).toUpperCase() + mapSettings.mapType.slice(1)
    );
  }, [mapSettings.mapType]);

  const [areas, setAreas] = useState<Area[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [selectedMunicipalityId, setSelectedMunicipalityId] =
    useState<string>("");
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>("");
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isSavingZone, setIsSavingZone] = useState(false);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [isLoadingSearchSuggestions, setIsLoadingSearchSuggestions] =
    useState(false);
  const searchSuggestionsTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (!isSearchActive) {
      return;
    }
    const timeout = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 80);
    return () => clearTimeout(timeout);
  }, [isSearchActive]);

  useEffect(() => {
    if (!isSearchActive) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      if (searchSuggestionsTimeoutRef.current) {
        clearTimeout(searchSuggestionsTimeoutRef.current);
        searchSuggestionsTimeoutRef.current = null;
      }
    }
  }, [isSearchActive]);

  useEffect(() => {
    return () => {
      if (searchSuggestionsTimeoutRef.current) {
        clearTimeout(searchSuggestionsTimeoutRef.current);
      }
    };
  }, []);

  const resetAssignmentState = useCallback(() => {
    setCurrentDrawing([]);
    setPendingTerritory(null);
    setResidentsInDrawing([]);
    setTerritoryName("");
    setTerritoryDescription("");
    setValidationErrors([]);
    setValidationWarnings([]);
    setWorkflowStep("drawing");
    setSelectedAreaId("");
    setSelectedMunicipalityId("");
    setSelectedCommunityId("");
    setSelectedAreaName("");
    setSelectedMunicipalityName("");
    setSelectedCommunityName("");
    setIsLocationModalVisible(false);
  }, []);

  const loadExistingTerritories = useCallback(async () => {
    setIsLoadingData(true);
    setLoadingError(null);
    try {
      clearAllTerritories();
      clearAllResidents();

      const response = await apiInstance.get(
        "/zones/list-all?visualization=true"
      );
      const zones = response.data?.data ?? [];

      const loadedTerritories: Territory[] = [];
      const loadedResidents: Resident[] = [];

      for (const zone of zones) {
        const coordinates =
          zone?.boundary?.coordinates && zone.boundary.coordinates[0];

        if (!Array.isArray(coordinates) || coordinates.length < 3) {
          continue;
        }

        const polygon: MapLatLng[] = coordinates
          .map((coord: unknown) => {
            if (!Array.isArray(coord) || coord.length < 2) {
              return null;
            }
            const [lng, lat] = coord as [number, number];
            if (
              typeof lat !== "number" ||
              typeof lng !== "number" ||
              Number.isNaN(lat) ||
              Number.isNaN(lng)
            ) {
              return null;
            }
            return { latitude: lat, longitude: lng };
          })
          .filter(Boolean) as MapLatLng[];

        if (polygon.length < 3) {
          continue;
        }

        const territory: Territory = {
          id: zone._id,
          name: zone.name || "Untitled Territory",
          description: zone.description || "",
          polygon,
          status: normalizeStatus(zone.status),
          assignedTo: zone.assignedTo,
          assignedDate: zone.assignedDate
            ? new Date(zone.assignedDate)
            : undefined,
          residents: Array.isArray(zone.residents)
            ? zone.residents.map((res: any) => res?._id).filter(Boolean)
            : [],
          createdAt: zone.createdAt ? new Date(zone.createdAt) : new Date(),
          updatedAt: zone.updatedAt ? new Date(zone.updatedAt) : new Date(),
        };

        loadedTerritories.push(territory);

        if (Array.isArray(zone.residents) && zone.residents.length > 0) {
          zone.residents.forEach((resident: any) => {
            const mapped = mapResidentFromApi(resident);
            if (mapped) {
              loadedResidents.push(mapped);
            }
          });
        }
      }

      loadedTerritories.forEach(addTerritory);
      if (loadedResidents.length > 0) {
        addResidents(loadedResidents);
      }

      if (loadedTerritories.length > 0) {
        const firstPolygon = loadedTerritories[0].polygon;
        if (firstPolygon.length > 0) {
          setRegion((prev) => ({
            ...prev,
            latitude: firstPolygon[0].latitude,
            longitude: firstPolygon[0].longitude,
          }));
        }
      }
    } catch (error: any) {
      console.error("[CreateZone] Failed to load territories:", error);
      setLoadingError(
        error?.response?.data?.message ||
          "Unable to load existing territories. Please try again."
      );
    } finally {
      setIsLoadingData(false);
    }
  }, [addResidents, addTerritory, clearAllResidents, clearAllTerritories]);

  const loadAreasList = useCallback(async () => {
    try {
      setIsLoadingAreas(true);
      const data = await fetchAreas();
      setAreas(data);
    } catch (error: any) {
      console.error("[CreateZone] Failed to load areas:", error);
      Alert.alert(
        "Unable to load areas",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingAreas(false);
    }
  }, []);

  const loadMunicipalitiesList = useCallback(async (areaId: string) => {
    try {
      setIsLoadingMunicipalities(true);
      const data = await fetchMunicipalitiesByArea(areaId);
      setMunicipalities(data);
    } catch (error: any) {
      console.error("[CreateZone] Failed to load municipalities:", error);
      Alert.alert(
        "Unable to load municipalities",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingMunicipalities(false);
    }
  }, []);

  const loadCommunitiesList = useCallback(async (municipalityId: string) => {
    try {
      setIsLoadingCommunities(true);
      const data = await fetchCommunitiesByMunicipality(municipalityId);
      setCommunities(data);
    } catch (error: any) {
      console.error("[CreateZone] Failed to load communities:", error);
      Alert.alert(
        "Unable to load communities",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  useEffect(() => {
    loadExistingTerritories();
  }, [loadExistingTerritories]);

  useEffect(() => {
    if (!isEditMode) {
      setIsLoadingTerritory(false);
      return;
    }
    if (!editTerritoryId) {
      setTerritoryLoadError("Missing territory identifier.");
      setIsLoadingTerritory(false);
      return;
    }

    let isCancelled = false;

    const loadTerritory = async () => {
      setIsLoadingTerritory(true);
      setTerritoryLoadError(null);
      try {
        const response = await fetchAgentZoneById(editTerritoryId);
        const zone = response.data;
        if (!zone) {
          throw new Error("Territory not found");
        }
        if (isCancelled) return;

        setOriginalTerritory(zone);
        setTerritoryName(zone.name || "");
        setTerritoryDescription(zone.description || "");

        const areaIdValue = resolveEntityId(zone.areaId);
        const municipalityIdValue = resolveEntityId(zone.municipalityId);
        const communityIdValue = resolveEntityId(zone.communityId);
        setSelectedAreaName((zone as any)?.areaId?.name || "");
        setSelectedMunicipalityName((zone as any)?.municipalityId?.name || "");
        setSelectedCommunityName((zone as any)?.communityId?.name || "");

        if (areaIdValue) {
          await loadAreasList();
          if (isCancelled) return;
          setSelectedAreaId(areaIdValue);
          await loadMunicipalitiesList(areaIdValue);
        }
        if (municipalityIdValue) {
          if (isCancelled) return;
          setSelectedMunicipalityId(municipalityIdValue);
          await loadCommunitiesList(municipalityIdValue);
        }
        if (communityIdValue) {
          if (isCancelled) return;
          setSelectedCommunityId(communityIdValue);
        }

        const coordinates = zone.boundary?.coordinates?.[0];
        const polygon: MapLatLng[] = Array.isArray(coordinates)
          ? (coordinates
              .map((coord: any) => {
                if (!Array.isArray(coord) || coord.length < 2) {
                  return null;
                }
                const [lng, lat] = coord as [number, number];
                if (
                  typeof lat !== "number" ||
                  typeof lng !== "number" ||
                  Number.isNaN(lat) ||
                  Number.isNaN(lng)
                ) {
                  return null;
                }
                return { latitude: lat, longitude: lng };
              })
              .filter(Boolean) as MapLatLng[])
          : [];
        const normalizedPolygon = stripClosingPoint(polygon);

        let mapViewResidents: Resident[] = [];
        let mapViewDetectedBuildings: DetectedBuilding[] = [];

        if (editTerritoryId) {
          try {
            const mapViewResponse = await apiInstance.get(
              `/zones/map-view/${editTerritoryId}`
            );
            if (isCancelled) return;
            const properties = mapViewResponse.data?.data?.properties ?? [];

            properties.forEach((property: any, index: number) => {
              const coordinatesArray = property?.coordinates;
              if (
                !Array.isArray(coordinatesArray) ||
                coordinatesArray.length < 2
              ) {
                return;
              }
              const [lng, lat] = coordinatesArray as [number, number];
              if (
                typeof lat !== "number" ||
                typeof lng !== "number" ||
                Number.isNaN(lat) ||
                Number.isNaN(lng)
              ) {
                return;
              }

              const address =
                typeof property?.address === "string" &&
                property.address.trim().length > 0
                  ? property.address
                  : `Property ${property?.houseNumber ?? index + 1}`;

              mapViewResidents.push({
                id: property?._id ? String(property._id) : `property-${index}`,
                name: address,
                address,
                latitude: lat,
                longitude: lng,
                status: (property?.status as ResidentStatus) || "not-visited",
              });

              mapViewDetectedBuildings.push({
                id: property?._id
                  ? `existing-${property._id}`
                  : `existing-${index}`,
                latitude: lat,
                longitude: lng,
                address,
                buildingNumber:
                  typeof property?.houseNumber === "number"
                    ? property.houseNumber
                    : undefined,
                source: property?.dataSource === "MANUAL" ? "simulated" : "osm",
              });
            });
          } catch (mapViewError) {
            console.warn(
              "[CreateZone] Failed to load existing properties for edit:",
              mapViewError
            );
          }
        }

        if (!isCancelled && mapViewResidents.length > 0) {
          addResidents(mapViewResidents);
        }

        if (normalizedPolygon.length >= 3) {
          const hasExistingData =
            mapViewDetectedBuildings.length > 0 || mapViewResidents.length > 0;

          setPendingTerritory({
            polygon: normalizedPolygon,
            residents: hasExistingData ? mapViewResidents : [],
            duplicateAddresses: [],
            detectedBuildings: hasExistingData
              ? [...mapViewDetectedBuildings]
              : [],
          });
          setResidentsInDrawing(hasExistingData ? mapViewResidents : []);
          setCurrentDrawing([]);
          setWorkflowStep("drawing");
          setDrawingMode(false);
          setHasStartedEditing(false);
          setValidationWarnings([]);
          setValidationErrors([]);

          if (!hasExistingData) {
            const detectionResult = await detectBuildingsForPolygon(
              normalizedPolygon
            );
            if (isCancelled) return;

            const existingResidents =
              filterResidentsInPolygon(normalizedPolygon);

            const newDetectedResidents = detectionResult.buildings
              .map((building, index) => {
                const buildingKey =
                  building.id ||
                  `detected-${building.latitude.toFixed(
                    6
                  )}-${building.longitude.toFixed(6)}-${index}`;
                const existingMatch = existingResidents.find(
                  (resident) =>
                    resident.latitude === building.latitude &&
                    resident.longitude === building.longitude
                );
                if (existingMatch) {
                  return null;
                }
                return {
                  id: buildingKey,
                  name: building.address,
                  address: building.address,
                  latitude: building.latitude,
                  longitude: building.longitude,
                  status: "not-visited" as ResidentStatus,
                } satisfies Resident;
              })
              .filter(Boolean) as Resident[];

            const combinedResidents = [
              ...existingResidents,
              ...newDetectedResidents,
            ];

            const combinedDetectedBuildings = detectionResult.buildings.filter(
              (building) => {
                const residentMatch = combinedResidents.find(
                  (resident) =>
                    resident.latitude === building.latitude &&
                    resident.longitude === building.longitude
                );
                return residentMatch != null;
              }
            );

            setPendingTerritory({
              polygon: normalizedPolygon,
              residents: combinedResidents,
              duplicateAddresses: [],
              detectedBuildings: combinedDetectedBuildings,
            });
            setResidentsInDrawing(combinedResidents);
            setValidationWarnings(detectionResult.warnings ?? []);
          }

          if (normalizedPolygon.length > 0 && mapRef.current) {
            // Ensure polygon is closed for fitToCoordinates by duplicating first point when needed
            const coordinatesForFit =
              normalizedPolygon[0].latitude ===
                normalizedPolygon[normalizedPolygon.length - 1].latitude &&
              normalizedPolygon[0].longitude ===
                normalizedPolygon[normalizedPolygon.length - 1].longitude
                ? normalizedPolygon
                : [...normalizedPolygon, normalizedPolygon[0]];

            setRegion((prev) => ({
              ...prev,
              latitude: normalizedPolygon[0].latitude,
              longitude: normalizedPolygon[0].longitude,
            }));

            setTimeout(() => {
              mapRef.current?.fitToCoordinates(coordinatesForFit, {
                edgePadding: {
                  top: 48,
                  right: 48,
                  bottom: 48,
                  left: 48,
                },
                animated: true,
              });
            }, 300);
          }
        } else {
          setPendingTerritory(null);
          setWorkflowStep("drawing");
          setCurrentDrawing([]);
          setResidentsInDrawing([]);
          setHasStartedEditing(false);
        }
      } catch (error: any) {
        if (isCancelled) return;
        console.error(
          "[CreateZone] Failed to load territory for editing:",
          error
        );
        setTerritoryLoadError(
          error?.response?.data?.message ||
            error?.message ||
            "Unable to load territory."
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingTerritory(false);
        }
      }
    };

    loadTerritory();

    return () => {
      isCancelled = true;
    };
  }, [
    addResidents,
    editTerritoryId,
    filterResidentsInPolygon,
    isEditMode,
    loadAreasList,
    loadCommunitiesList,
    loadMunicipalitiesList,
    setCurrentDrawing,
    setDrawingMode,
    setRegion,
    setValidationErrors,
    setValidationWarnings,
    territoryReloadKey,
    mapRef,
  ]);

  useFocusEffect(
    useCallback(() => {
      setDrawingMode(false);
      setHasStartedEditing(false);
      return () => {
        setDrawingMode(false);
        setHasStartedEditing(false);
      };
    }, [setDrawingMode])
  );

  const handleSelectArea = useCallback(
    async (areaId: string) => {
      if (selectedAreaId === areaId) {
        return;
      }
      setSelectedAreaId(areaId);
      setSelectedMunicipalityId("");
      setSelectedCommunityId("");
      setMunicipalities([]);
      setCommunities([]);
      const selectedArea = areas.find((area) => area._id === areaId);
      setSelectedAreaName(selectedArea?.name || "");
      setSelectedMunicipalityName("");
      setSelectedCommunityName("");
      if (areaId) {
        await loadMunicipalitiesList(areaId);
      }
    },
    [areas, loadMunicipalitiesList, selectedAreaId]
  );

  const handleSelectMunicipality = useCallback(
    async (municipalityId: string) => {
      if (selectedMunicipalityId === municipalityId) {
        return;
      }
      setSelectedMunicipalityId(municipalityId);
      setSelectedCommunityId("");
      setCommunities([]);
      const selectedMunicipality = municipalities.find(
        (municipality) => municipality._id === municipalityId
      );
      setSelectedMunicipalityName(selectedMunicipality?.name || "");
      setSelectedCommunityName("");
      if (municipalityId) {
        await loadCommunitiesList(municipalityId);
      }
    },
    [loadCommunitiesList, municipalities, selectedMunicipalityId]
  );

  const handleSelectCommunity = useCallback(
    (communityId: string) => {
      setSelectedCommunityId(communityId);
      const selectedCommunity = communities.find(
        (community) => community._id === communityId
      );
      setSelectedCommunityName(selectedCommunity?.name || "");
      setIsLocationModalVisible(false);
    },
    [communities]
  );

  const handleOpenLocationModal = useCallback(async () => {
    if (areas.length === 0 && !isLoadingAreas) {
      await loadAreasList();
    }
    if (
      selectedAreaId &&
      municipalities.length === 0 &&
      !isLoadingMunicipalities
    ) {
      await loadMunicipalitiesList(selectedAreaId);
    }
    if (
      selectedMunicipalityId &&
      communities.length === 0 &&
      !isLoadingCommunities
    ) {
      await loadCommunitiesList(selectedMunicipalityId);
    }
    setIsLocationModalVisible(true);
  }, [
    areas.length,
    communities.length,
    isLoadingAreas,
    isLoadingCommunities,
    isLoadingMunicipalities,
    loadAreasList,
    loadCommunitiesList,
    loadMunicipalitiesList,
    municipalities.length,
    selectedAreaId,
    selectedMunicipalityId,
  ]);

  const handleCloseLocationModal = useCallback(() => {
    setIsLocationModalVisible(false);
  }, []);

  const isLocationSelectionComplete = Boolean(
    selectedAreaId && selectedMunicipalityId && selectedCommunityId
  );

  const fetchSearchSuggestions = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      return;
    }

    try {
      setIsLoadingSearchSuggestions(true);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          trimmed
        )}&key=${GOOGLE_PLACES_API_KEY}&types=address&components=country:ca`
      );
      const data = await response.json();

      if (data.status === "OK" && Array.isArray(data.predictions)) {
        setSearchSuggestions(data.predictions);
        setShowSearchSuggestions(true);
      } else {
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
      }
    } catch (error) {
      console.error(
        "[CreateZone] Failed to fetch location suggestions:",
        error
      );
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
    } finally {
      setIsLoadingSearchSuggestions(false);
    }
  }, []);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchSuggestionsTimeoutRef.current) {
        clearTimeout(searchSuggestionsTimeoutRef.current);
        searchSuggestionsTimeoutRef.current = null;
      }
      if (!value.trim()) {
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
        return;
      }
      searchSuggestionsTimeoutRef.current = setTimeout(() => {
        fetchSearchSuggestions(value);
      }, 300);
    },
    [fetchSearchSuggestions]
  );

  const handleStartSearch = useCallback(() => {
    setIsSearchActive(true);
    if (searchQuery.trim().length >= 3) {
      fetchSearchSuggestions(searchQuery);
    }
  }, [fetchSearchSuggestions, searchQuery]);

  const handleCancelSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery("");
    setIsSearchingLocation(false);
    setSearchSuggestions([]);
    setShowSearchSuggestions(false);
    if (searchSuggestionsTimeoutRef.current) {
      clearTimeout(searchSuggestionsTimeoutRef.current);
      searchSuggestionsTimeoutRef.current = null;
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchSuggestions([]);
    setShowSearchSuggestions(false);
    if (searchSuggestionsTimeoutRef.current) {
      clearTimeout(searchSuggestionsTimeoutRef.current);
      searchSuggestionsTimeoutRef.current = null;
    }
  }, []);

  const selectPreferredGeocodeResult = useCallback(
    (results: LocationGeocodedLocation[]) => {
      if (!Array.isArray(results) || results.length === 0) {
        return null;
      }
      const canadianResult = results.find((result) => {
        const country =
          ((result as any)?.country as string | undefined) ??
          ((result as any)?.isoCountryCode as string | undefined);
        if (!country) return false;
        const normalized = country.toLowerCase();
        return normalized === "canada" || normalized === "ca";
      });
      return canadianResult ?? results[0];
    },
    []
  );

  const performLocationSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        Alert.alert("Enter a location", "Type a place name to search the map.");
        return;
      }

      try {
        setIsSearchingLocation(true);
        const results = await Location.geocodeAsync(trimmed);

        if (!results || results.length === 0) {
          Alert.alert(
            "Location not found",
            "Try a different address or place."
          );
          return;
        }

        const preferredResult = selectPreferredGeocodeResult(results);
        if (!preferredResult) {
          Alert.alert(
            "Location not found",
            "Try a different address or place."
          );
          return;
        }

        const { latitude, longitude } = preferredResult;

        setRegion((prevRegion) => {
          const latitudeDelta = Math.min(
            Math.max(
              prevRegion.latitudeDelta ?? DEFAULT_REGION.latitudeDelta,
              MIN_MAP_DELTA
            ),
            MAX_MAP_DELTA
          );
          const longitudeDelta = Math.min(
            Math.max(
              prevRegion.longitudeDelta ?? DEFAULT_REGION.longitudeDelta,
              MIN_MAP_DELTA
            ),
            MAX_MAP_DELTA
          );
          const nextRegion: Region = {
            latitude,
            longitude,
            latitudeDelta,
            longitudeDelta,
          };
          mapRef.current?.animateToRegion(nextRegion, 500);
          return nextRegion;
        });

        setShowSearchSuggestions(false);
        setSearchSuggestions([]);
      } catch (error) {
        console.error("[CreateZone] Failed to search location:", error);
        Alert.alert(
          "Location search failed",
          "We couldn't find that place. Please try again."
        );
      } finally {
        setIsSearchingLocation(false);
      }
    },
    [selectPreferredGeocodeResult]
  );

  const handleSubmitSearch = useCallback(() => {
    void performLocationSearch(searchQuery);
  }, [performLocationSearch, searchQuery]);

  const handleSelectSearchSuggestion = useCallback(
    async (suggestion: any) => {
      const description =
        typeof suggestion?.description === "string"
          ? suggestion.description
          : "";
      if (!description) {
        return;
      }

      setSearchQuery(description);
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      await performLocationSearch(description);
    },
    [performLocationSearch]
  );

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setHeaderHeight((prev) => (Math.abs(prev - height) > 0.5 ? height : prev));
  }, []);

  const resetDrawingState = useCallback(() => {
    setCurrentDrawing([]);
    setPendingTerritory(null);
    setResidentsInDrawing([]);
    setTerritoryName("");
    setTerritoryDescription("");
    setValidationErrors([]);
    setValidationWarnings([]);
    setWorkflowStep("drawing");
  }, []);

  const handleSaveZone = useCallback(async () => {
    if (!pendingTerritory) {
      Alert.alert("Nothing to save", "Draw and validate a territory first.");
      return;
    }
    if (territoryName.trim().length === 0) {
      Alert.alert("Missing name", "Please enter a territory name.");
      return;
    }

    const originalAreaId = resolveEntityId(originalTerritory?.areaId);
    const originalMunicipalityId = resolveEntityId(
      originalTerritory?.municipalityId
    );
    const originalCommunityId = resolveEntityId(originalTerritory?.communityId);

    const locationChanged = isEditMode
      ? originalAreaId !== selectedAreaId ||
        originalMunicipalityId !== selectedMunicipalityId ||
        originalCommunityId !== selectedCommunityId
      : true;

    if (
      (!isEditMode || locationChanged) &&
      (!selectedAreaId || !selectedMunicipalityId || !selectedCommunityId)
    ) {
      Alert.alert(
        "Select location",
        "Choose an area, municipality, and community before saving."
      );
      return;
    }

    try {
      setIsSavingZone(true);

      const polygonCoordinates = pendingTerritory.polygon.map((point) => [
        point.longitude,
        point.latitude,
      ]);
      if (polygonCoordinates.length > 0) {
        const [firstLng, firstLat] = polygonCoordinates[0];
        const [lastLng, lastLat] =
          polygonCoordinates[polygonCoordinates.length - 1];
        if (firstLng !== lastLng || firstLat !== lastLat) {
          polygonCoordinates.push([firstLng, firstLat]);
        }
      }

      const uniqueAddresses = Array.from(
        new Set(
          pendingTerritory.detectedBuildings.map(
            (building) => building.address ?? ""
          )
        )
      ).filter(Boolean);
      const buildingCoordinates = pendingTerritory.detectedBuildings.map(
        (building) =>
          [building.longitude, building.latitude] as [number, number]
      );

      const sharedBoundary = {
        type: "Polygon" as const,
        coordinates: [polygonCoordinates],
      };

      const baseBuildingData =
        uniqueAddresses.length > 0
          ? {
              addresses: uniqueAddresses,
              coordinates: buildingCoordinates,
            }
          : undefined;

      let savedZone: AgentZone;
      let boundaryChanged = false;
      let locationChanged = false;

      if (isEditMode && editTerritoryId) {
        const originalBoundary =
          originalTerritory?.boundary?.coordinates?.[0] ?? [];
        boundaryChanged =
          originalBoundary.length !== polygonCoordinates.length ||
          originalBoundary.some((coord, index) => {
            const target = polygonCoordinates[index];
            if (!coord || !target) {
              return true;
            }
            return coord[0] !== target[0] || coord[1] !== target[1];
          });

        const nameChanged =
          territoryName.trim() !== (originalTerritory?.name || "");
        const descriptionChanged =
          territoryDescription.trim() !==
          (originalTerritory?.description || "");

        const updatePayload: UpdateAgentZonePayload = {
          name: territoryName.trim(),
          description: territoryDescription.trim(),
          boundary: sharedBoundary,
          buildingData: baseBuildingData,
          areaId: selectedAreaId,
          municipalityId: selectedMunicipalityId,
          communityId: selectedCommunityId,
        };

        if (
          boundaryChanged &&
          !nameChanged &&
          !descriptionChanged &&
          !locationChanged
        ) {
          updatePayload.isBoundaryUpdateOnly = true;
        }

        if (
          (nameChanged || descriptionChanged) &&
          !boundaryChanged &&
          !locationChanged
        ) {
          updatePayload.isNameDescriptionUpdateOnly = true;
        }

        const response = await updateAgentZone(editTerritoryId, updatePayload);
        savedZone = response.data;
        setOriginalTerritory(response.data);
      } else {
        const response = await createAgentZone({
          name: territoryName.trim(),
          description: territoryDescription.trim(),
          boundary: sharedBoundary,
          buildingData: baseBuildingData,
          areaId: selectedAreaId,
          municipalityId: selectedMunicipalityId,
          communityId: selectedCommunityId,
        });
        savedZone = response.data;
        boundaryChanged = true;
        locationChanged = true;
      }

      const boundaryCoordinates =
        savedZone.boundary?.coordinates?.[0] ?? polygonCoordinates;
      const savedPolygon: MapLatLng[] = boundaryCoordinates
        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            return null;
          }
          const [lng, lat] = coord;
          if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            Number.isNaN(lat) ||
            Number.isNaN(lng)
          ) {
            return null;
          }
          return { latitude: lat, longitude: lng };
        })
        .filter(Boolean) as MapLatLng[];

      const zoneId = savedZone._id || editTerritoryId || `zone-${Date.now()}`;

      const baseTerritory: Territory = {
        id: zoneId,
        name: savedZone.name || territoryName.trim(),
        description: savedZone.description || territoryDescription.trim(),
        polygon: savedPolygon,
        status: normalizeStatus(savedZone.status),
        assignedTo: savedZone.assignedAgentId?.name,
        assignedDate: savedZone.createdAt
          ? new Date(savedZone.createdAt)
          : undefined,
        residents: pendingTerritory.residents.map((resident) => resident.id),
        createdAt: savedZone.createdAt
          ? new Date(savedZone.createdAt)
          : new Date(),
        updatedAt: savedZone.updatedAt
          ? new Date(savedZone.updatedAt)
          : new Date(),
      };

      const residentRecords: Resident[] = pendingTerritory.residents.map(
        (resident, index) => ({
          ...resident,
          id: resident.id || `${zoneId}-resident-${index}`,
        })
      );

      if (isEditMode) {
        updateTerritory(baseTerritory.id, baseTerritory);
      } else {
        addTerritory(baseTerritory);
      }

      if (residentRecords.length > 0) {
        addResidents(residentRecords);
      }

      const normalizedSavedPolygon = stripClosingPoint(savedPolygon);

      const updatedAreaId = resolveEntityId(savedZone.areaId);
      const updatedMunicipalityId = resolveEntityId(savedZone.municipalityId);
      const updatedCommunityId = resolveEntityId(savedZone.communityId);

      if (isEditMode) {
        const updatedPending: PendingTerritory = {
          polygon: normalizedSavedPolygon,
          residents: pendingTerritory?.residents ?? [],
          detectedBuildings: pendingTerritory?.detectedBuildings ?? [],
          duplicateAddresses: pendingTerritory?.duplicateAddresses ?? [],
        };

        setPendingTerritory(updatedPending);
        setCurrentDrawing(normalizedSavedPolygon);
        setResidentsInDrawing(updatedPending.residents);
        setWorkflowStep("saving");
        setDrawingMode(false);
        setValidationWarnings([]);
        setValidationErrors([]);

        if (locationChanged) {
          setSelectedAreaId(updatedAreaId);
          setSelectedMunicipalityId(updatedMunicipalityId);
          setSelectedCommunityId(updatedCommunityId);
          setSelectedAreaName(
            (savedZone as any)?.areaId?.name || selectedAreaName
          );
          setSelectedMunicipalityName(
            (savedZone as any)?.municipalityId?.name || selectedMunicipalityName
          );
          setSelectedCommunityName(
            (savedZone as any)?.communityId?.name || selectedCommunityName
          );
        }
      } else {
        resetDrawingState();
        setWorkflowStep("drawing");
        setPendingTerritory(null);
        setValidationWarnings([]);
        setValidationErrors([]);
        resetAssignmentState();
      }

      await loadExistingTerritories();

      Alert.alert(
        isEditMode ? "Territory Updated" : "Territory Created",
        `Zone "${baseTerritory.name}" has been ${
          isEditMode ? "updated" : "assigned"
        } successfully.`,
        [
          {
            text: "View Territories",
            onPress: () => router.push("/(tabs)/my-territory"),
          },
          {
            text: "Stay",
            style: "cancel",
          },
        ]
      );
    } catch (error: any) {
      console.error("[CreateZone] Failed to save territory:", error);
      Alert.alert(
        isEditMode ? "Failed to update territory" : "Failed to save territory",
        error?.response?.data?.message ||
          "We couldn't save this territory. Please try again."
      );
    } finally {
      setIsSavingZone(false);
    }
  }, [
    addResidents,
    addTerritory,
    editTerritoryId,
    isEditMode,
    loadExistingTerritories,
    originalTerritory,
    pendingTerritory,
    resetAssignmentState,
    resetDrawingState,
    router,
    selectedAreaId,
    selectedCommunityId,
    selectedCommunityName,
    selectedMunicipalityId,
    selectedMunicipalityName,
    selectedAreaName,
    setDrawingMode,
    setSelectedAreaId,
    setSelectedAreaName,
    setSelectedCommunityId,
    setSelectedCommunityName,
    setSelectedMunicipalityId,
    setSelectedMunicipalityName,
    territoryDescription,
    territoryName,
    updateTerritory,
  ]);

  useEffect(() => {
    if (!isDrawingMode) {
      setResidentsInDrawing([]);
      return;
    }
    if (currentDrawing.length < 3) {
      setResidentsInDrawing([]);
      return;
    }
    const normalizedCurrent = stripClosingPoint(currentDrawing);
    if (
      pendingTerritory?.residents?.length &&
      arePolygonsEqual(normalizedCurrent, pendingTerritory.polygon)
    ) {
      setResidentsInDrawing(pendingTerritory.residents);
      return;
    }
    const filteredResidents = filterResidentsInPolygon(currentDrawing);
    setResidentsInDrawing(filteredResidents);
  }, [
    currentDrawing,
    filterResidentsInPolygon,
    isDrawingMode,
    pendingTerritory?.polygon,
    pendingTerritory?.residents,
  ]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (!isDrawingMode || isProcessingPolygon) {
        return;
      }
      const point = event.nativeEvent.coordinate;
      setCurrentDrawing((prev) => {
        if (!hasStartedEditing) {
          setHasStartedEditing(true);
          return [point];
        }
        return [...prev, point];
      });
    },
    [hasStartedEditing, isDrawingMode, isProcessingPolygon]
  );

  const handleStartDrawing = useCallback(() => {
    if (pendingTerritory?.polygon?.length) {
      setCurrentDrawing(pendingTerritory.polygon);
      setResidentsInDrawing(pendingTerritory.residents);
      setHasStartedEditing(false);
    } else {
      resetDrawingState();
      setHasStartedEditing(true);
    }
    setValidationWarnings([]);
    setValidationErrors([]);
    setDrawingMode(true);
  }, [
    pendingTerritory?.polygon,
    pendingTerritory?.residents,
    resetDrawingState,
    setValidationErrors,
    setValidationWarnings,
    setDrawingMode,
  ]);

  const handleStopDrawing = useCallback(() => {
    setDrawingMode(false);
    setHasStartedEditing(false);
  }, [setDrawingMode]);

  const handleUndoPoint = useCallback(() => {
    setCurrentDrawing((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const updated = prev.slice(0, -1);
      if (updated.length === 0) {
        setHasStartedEditing(false);
      }
      return updated;
    });
  }, []);

  const buildGeoJsonPayload = useCallback((polygon: MapLatLng[]) => {
    const coordinates = polygon.map((point) => [
      point.longitude,
      point.latitude,
    ]);
    if (coordinates.length > 0) {
      const [firstLng, firstLat] = coordinates[0];
      const [lastLng, lastLat] = coordinates[coordinates.length - 1];
      if (firstLng !== lastLng || firstLat !== lastLat) {
        coordinates.push([firstLng, firstLat]);
      }
    }
    return {
      type: "Polygon",
      coordinates: [coordinates],
    };
  }, []);

  const validatePolygon = useCallback(
    async (polygon: MapLatLng[]) => {
      setIsProcessingPolygon(true);
      setValidationErrors([]);
      setValidationWarnings([]);
      try {
        const normalizedPolygon = stripClosingPoint(polygon);

        if (
          pendingTerritory?.polygon &&
          arePolygonsEqual(normalizedPolygon, pendingTerritory.polygon)
        ) {
          setCurrentDrawing(normalizedPolygon);
          if (pendingTerritory.residents?.length) {
            setResidentsInDrawing(pendingTerritory.residents);
          }
          setWorkflowStep("saving");
          setDrawingMode(false);
          setIsProcessingPolygon(false);
          setValidationErrors([]);
          setValidationWarnings([]);
          return;
        }
        const payload = {
          boundary: buildGeoJsonPayload(normalizedPolygon),
          buildingData: {
            addresses: [] as string[],
            coordinates: [] as [number, number][],
          },
          ...(isEditMode && editTerritoryId
            ? { excludeZoneId: editTerritoryId }
            : {}),
        };

        const response = await apiInstance.post(
          "/agent-zones/check-overlap",
          payload
        );
        const data = response.data?.data ?? response.data;

        const errors: string[] = [];
        const warnings: string[] = [];
        const duplicateAddresses: string[] = Array.isArray(
          data?.duplicateBuildings
        )
          ? data.duplicateBuildings
          : [];

        if (data?.hasOverlap) {
          const zoneNames = data.overlappingZones
            ?.map((zone: any) => zone?.name)
            .filter(Boolean)
            .join(", ");
          if (zoneNames) {
            errors.push(
              `This territory overlaps with existing zone(s): ${zoneNames}. Adjust the drawing to continue.`
            );
          } else {
            errors.push("This territory overlaps with an existing zone.");
          }
        }

        if (duplicateAddresses.length > 0) {
          warnings.push(
            `${duplicateAddresses.length} buildings are already assigned to other territories.`
          );
        }

        if (errors.length === 0) {
          setIsDetectingBuildings(true);
          const detectionResult = await detectBuildingsForPolygon(
            normalizedPolygon
          );
          const combinedWarnings = [
            ...warnings,
            ...detectionResult.warnings.filter(
              (warning) => !warnings.includes(warning)
            ),
          ];

          const existingResidents = filterResidentsInPolygon(normalizedPolygon);
          const existingIds = new Set(
            existingResidents.map((resident) => resident.id)
          );

          const detectedResidents = detectionResult.buildings
            .map((building, index) => {
              const baseId = building.id || `detected-${index}`;
              if (existingIds.has(baseId)) {
                return null;
              }
              return {
                id: baseId,
                name: building.address,
                address: building.address,
                latitude: building.latitude,
                longitude: building.longitude,
                status: "not-visited" as ResidentStatus,
              } satisfies Resident;
            })
            .filter(Boolean) as Resident[];

          const combinedResidents = [
            ...existingResidents,
            ...detectedResidents,
          ];

          setPendingTerritory({
            polygon: normalizedPolygon,
            residents: combinedResidents,
            duplicateAddresses,
            detectedBuildings: detectionResult.buildings,
          });
          setResidentsInDrawing(combinedResidents);
          setWorkflowStep("saving");
          setDrawingMode(false);
          setHasStartedEditing(false);
          setValidationWarnings(combinedWarnings);
          setIsDetectingBuildings(false);
        } else {
          setPendingTerritory(null);
          setWorkflowStep("drawing");
          setDrawingMode(true);
          setHasStartedEditing(false);
          setValidationWarnings(warnings);
          setResidentsInDrawing([]);
        }

        setValidationErrors(errors);
      } catch (error: any) {
        console.error("[CreateZone] validatePolygon error:", error);
        setValidationErrors([
          error?.response?.data?.message ||
            "We could not validate this territory. Please try again.",
        ]);
        setPendingTerritory(null);
        setWorkflowStep("drawing");
        setDrawingMode(true);
        setHasStartedEditing(false);
        setIsDetectingBuildings(false);
        setResidentsInDrawing([]);
      } finally {
        setIsProcessingPolygon(false);
        setIsDetectingBuildings(false);
      }
    },
    [
      buildGeoJsonPayload,
      editTerritoryId,
      filterResidentsInPolygon,
      isEditMode,
      pendingTerritory?.polygon,
      pendingTerritory?.residents,
      setDrawingMode,
    ]
  );

  const handleCompletePolygon = useCallback(() => {
    if (currentDrawing.length < 3) {
      Alert.alert(
        "Incomplete Shape",
        "Add at least three points to define a territory."
      );
      return;
    }
    validatePolygon(currentDrawing);
  }, [currentDrawing, validatePolygon]);

  const handleClearDrawing = useCallback(() => {
    if (currentDrawing.length === 0 && !pendingTerritory) {
      return;
    }
    Alert.alert(
      "Clear Current Drawing?",
      "This will remove the current shape and reset your progress.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            resetDrawingState();
            setDrawingMode(false);
          },
        },
      ]
    );
  }, [
    currentDrawing.length,
    pendingTerritory,
    resetDrawingState,
    setDrawingMode,
  ]);

  const handleFitToTerritories = useCallback(() => {
    if (!mapRef.current) {
      return;
    }

    let targetCoordinates: MapLatLng[] = [];

    if (isEditMode) {
      if (pendingTerritory?.polygon?.length) {
        targetCoordinates = pendingTerritory.polygon;
      } else if (currentDrawing.length) {
        targetCoordinates = currentDrawing;
      } else if (editTerritoryId) {
        const match = territories.find((territory) => {
          return territory.id === editTerritoryId;
        });
        if (match?.polygon?.length) {
          targetCoordinates = match.polygon;
        }
      }
    } else {
      if (currentDrawing.length) {
        targetCoordinates = currentDrawing;
      } else if (pendingTerritory?.polygon?.length) {
        targetCoordinates = pendingTerritory.polygon;
      } else if (territories.length > 0) {
        targetCoordinates = territories.flatMap(
          (territory) => territory.polygon
        );
      }
    }

    if (targetCoordinates.length === 0) {
      return;
    }

    mapRef.current.fitToCoordinates(targetCoordinates, {
      edgePadding: {
        top: 48,
        right: 48,
        bottom: 48,
        left: 48,
      },
      animated: true,
    });
  }, [
    currentDrawing,
    editTerritoryId,
    isEditMode,
    pendingTerritory?.polygon,
    territories,
  ]);

  const handleCycleMapType = useCallback(() => {
    const nextIndex = (mapTypeIndex + 1) % MAP_TYPE_SEQUENCE.length;
    setMapTypeIndex(nextIndex);
    setMapType(MAP_TYPE_SEQUENCE[nextIndex]);
  }, [mapTypeIndex, setMapType]);

  const adjustMapZoom = useCallback(
    (factor: number) => {
      setRegion((prevRegion) => {
        const nextLatitudeDelta = Math.min(
          MAX_MAP_DELTA,
          Math.max(MIN_MAP_DELTA, prevRegion.latitudeDelta * factor)
        );
        const nextLongitudeDelta = Math.min(
          MAX_MAP_DELTA,
          Math.max(MIN_MAP_DELTA, prevRegion.longitudeDelta * factor)
        );

        const nextRegion = {
          ...prevRegion,
          latitudeDelta: nextLatitudeDelta,
          longitudeDelta: nextLongitudeDelta,
        };

        if (mapRef.current) {
          mapRef.current.animateToRegion(nextRegion, 160);
        }

        return nextRegion;
      });
    },
    [mapRef]
  );

  const handleZoomIn = useCallback(() => {
    adjustMapZoom(ZOOM_IN_FACTOR);
  }, [adjustMapZoom]);

  const handleZoomOut = useCallback(() => {
    adjustMapZoom(ZOOM_OUT_FACTOR);
  }, [adjustMapZoom]);

  const existingTerritoryPolygons = useMemo(
    () =>
      territories.map((territory) => ({
        id: territory.id,
        polygon: territory.polygon,
        name: territory.name,
      })),
    [territories]
  );

  const renderResidentsMarkers = useMemo(
    () =>
      residents.map((resident) => (
        <Marker
          key={resident.id}
          coordinate={{
            latitude: resident.latitude,
            longitude: resident.longitude,
          }}
          pinColor={
            resident.status === "interested"
              ? COLORS.success[500]
              : resident.status === "visited"
              ? COLORS.primary[500]
              : COLORS.neutral[500]
          }
        />
      )),
    [residents]
  );

  const renderDetectedBuildingMarkers = useMemo(() => {
    if (!pendingTerritory?.detectedBuildings?.length) {
      return null;
    }
    return pendingTerritory.detectedBuildings.map((building) => (
      <Marker
        key={`building-${building.id}`}
        coordinate={{
          latitude: building.latitude,
          longitude: building.longitude,
        }}
        pinColor={COLORS.warning[600]}
        title={building.address}
        description={
          building.source === "osm" ? "OSM building" : "Simulated building"
        }
      />
    ));
  }, [pendingTerritory?.detectedBuildings]);

  const warningColor = useMemo(() => COLORS.warning[600], []);
  const drawingStrokeColor = useMemo(
    () => (isEditMode ? COLORS.error[600] : COLORS.primary[500]),
    [isEditMode]
  );
  const drawingFillColor = useMemo(
    () => (isEditMode ? "rgba(239, 68, 68, 0.2)" : "rgba(66, 165, 245, 0.2)"),
    [isEditMode]
  );
  const reviewStrokeColor = useMemo(
    () => (isEditMode ? COLORS.error[600] : COLORS.primary[600]),
    [isEditMode]
  );
  const reviewFillColor = useMemo(
    () => (isEditMode ? "rgba(220, 38, 38, 0.25)" : "rgba(66, 165, 245, 0.25)"),
    [isEditMode]
  );
  const drawingVertexColor = useMemo(
    () => (isEditMode ? COLORS.error[600] : COLORS.primary[500]),
    [isEditMode]
  );

  const pointsPlacedCount = useMemo(() => {
    if (isDrawingMode) {
      return currentDrawing.length;
    }
    return pendingTerritory?.polygon?.length ?? 0;
  }, [currentDrawing.length, isDrawingMode, pendingTerritory?.polygon?.length]);

  const residentsCapturedCount = useMemo(() => {
    if (isDrawingMode) {
      return residentsInDrawing.length;
    }
    if (pendingTerritory?.residents?.length) {
      return pendingTerritory.residents.length;
    }
    return pendingTerritory?.detectedBuildings?.length ?? 0;
  }, [
    isDrawingMode,
    residentsInDrawing.length,
    pendingTerritory?.residents?.length,
    pendingTerritory?.detectedBuildings?.length,
  ]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primary[500]}
      />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        mapType={mapSettings.mapType}
        onPress={handleMapPress}
      >
        {existingTerritoryPolygons.map((territory) => (
          <Polygon
            key={territory.id}
            coordinates={territory.polygon}
            strokeColor={
              showExistingTerritories
                ? COLORS.warning[600]
                : COLORS.primary[500]
            }
            strokeWidth={showExistingTerritories ? 3 : 2}
            fillColor={
              showExistingTerritories
                ? "rgba(255, 165, 0, 0.25)"
                : "rgba(16, 185, 129, 0.2)"
            }
          />
        ))}

        {currentDrawing.length > 0 && workflowStep === "drawing" && (
          <>
            <Polygon
              coordinates={currentDrawing}
              strokeColor={drawingStrokeColor}
              fillColor={drawingFillColor}
              strokeWidth={2}
            />
            {currentDrawing.map((point, index) => (
              <Marker
                key={`${point.latitude}-${point.longitude}-${index}`}
                coordinate={point}
                pinColor={drawingVertexColor}
              />
            ))}
          </>
        )}

        {pendingTerritory && workflowStep === "drawing" && (
          <Polygon
            coordinates={pendingTerritory.polygon}
            strokeColor="rgba(220, 38, 38, 0.6)"
            fillColor="rgba(220, 38, 38, 0.15)"
            strokeWidth={2}
          />
        )}

        {pendingTerritory && workflowStep === "saving" && (
          <Polygon
            coordinates={pendingTerritory.polygon}
            strokeColor={reviewStrokeColor}
            fillColor={reviewFillColor}
            strokeWidth={2}
          />
        )}

        {renderResidentsMarkers}
        {renderDetectedBuildingMarkers}
      </MapView>

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + responsiveSpacing(SPACING.sm) },
        ]}
        onLayout={handleHeaderLayout}
      >
        {isSearchActive ? (
          <View style={styles.headerSearchBar}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleBack}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={responsiveScale(18)}
                color={COLORS.white}
              />
            </TouchableOpacity>
            <View style={styles.headerSearchInputContainer}>
              <Ionicons
                name="search-outline"
                size={responsiveScale(16)}
                color={COLORS.white}
                style={styles.headerSearchIcon}
              />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={handleSearchInputChange}
                placeholder="Search map location"
                placeholderTextColor="rgba(255, 255, 255, 0.7)"
                style={styles.headerSearchInput}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                onSubmitEditing={handleSubmitSearch}
                editable={!isSearchingLocation}
              />
              {isSearchingLocation ? (
                <ActivityIndicator
                  size="small"
                  color={COLORS.white}
                  style={styles.headerSearchSpinner}
                />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleClearSearch}
                  style={styles.headerSearchClearButton}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons
                    name="close-circle"
                    size={responsiveScale(16)}
                    color="rgba(255, 255, 255, 0.7)"
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleCancelSearch}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Ionicons
                name="close"
                size={responsiveScale(18)}
                color={COLORS.white}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleBack}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons
                  name="chevron-back"
                  size={responsiveScale(18)}
                  color={COLORS.white}
                />
              </TouchableOpacity>
              <View>
                <H3 style={styles.headerTitle}>
                  {isEditMode
                    ? territoryName.trim() ||
                      originalTerritory?.name ||
                      "Loading zone..."
                    : "Create Zone"}
                </H3>
                <Body3 style={styles.headerSubtitle}>
                  {isEditMode
                    ? "Adjust the boundary and details for this territory"
                    : "Draw and assign your next territory"}
                </Body3>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleStartSearch}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Search location"
              >
                <Ionicons
                  name="search-outline"
                  size={responsiveScale(18)}
                  color={COLORS.white}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {isSearchActive && (
        <View
          pointerEvents="box-none"
          style={[
            styles.searchSuggestionsPortal,
            {
              top:
                (headerHeight > 0
                  ? headerHeight
                  : insets.top +
                    responsiveSpacing(SPACING.sm) +
                    responsiveScale(40)) + responsiveSpacing(SPACING.xs),
            },
          ]}
        >
          {(showSearchSuggestions || isLoadingSearchSuggestions) && (
            <View style={styles.searchSuggestionsContainer}>
              {isLoadingSearchSuggestions ? (
                <View style={styles.searchSuggestionsLoading}>
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                  <Body3
                    color={COLORS.text.secondary}
                    style={styles.searchSuggestionsLoadingText}
                  >
                    Searching locations...
                  </Body3>
                </View>
              ) : searchSuggestions.length === 0 ? (
                <View style={styles.searchSuggestionsEmpty}>
                  <Body3 color={COLORS.text.secondary}>
                    No suggestions found.
                  </Body3>
                </View>
              ) : (
                <ScrollView
                  style={styles.searchSuggestionsScroll}
                  contentContainerStyle={styles.searchSuggestionsList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {searchSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={
                        suggestion?.place_id ??
                        `${suggestion?.description ?? "suggestion"}-${index}`
                      }
                      activeOpacity={0.85}
                      onPress={() =>
                        void handleSelectSearchSuggestion(suggestion)
                      }
                      style={[
                        styles.searchSuggestionItem,
                        index === searchSuggestions.length - 1 &&
                          styles.searchSuggestionItemLast,
                      ]}
                    >
                      <Text color={COLORS.text.primary}>
                        {suggestion?.description}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}

      <View
        style={[styles.fabGroup, { top: insets.top + responsiveScale(96) }]}
      >
        <TouchableOpacity
          style={[styles.fab, styles.fabPrimary]}
          onPress={handleCycleMapType}
          activeOpacity={0.85}
        >
          <Text variant="body2" weight="medium" color={COLORS.white}>
            {mapTypeLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fab, styles.fabSecondary]}
          onPress={() => setShowExistingTerritories((prev) => !prev)}
          activeOpacity={0.85}
        >
          <Text variant="body2" weight="medium" color={COLORS.white}>
            {showExistingTerritories ? "Hide Zones" : "Show Zones"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.fab,
            styles.fabTertiary,
            territories.length === 0 && styles.fabDisabled,
          ]}
          onPress={handleFitToTerritories}
          disabled={territories.length === 0}
          activeOpacity={0.85}
        >
          <Text variant="body2" weight="medium" color={COLORS.white}>
            Fit Map
          </Text>
        </TouchableOpacity>
        <View style={styles.zoomGroup}>
          <TouchableOpacity
            style={[styles.zoomButton, styles.zoomButtonTop]}
            onPress={handleZoomIn}
            activeOpacity={0.85}
          >
            <Text variant="body1" weight="semiBold" color={COLORS.white}>
              +
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoomButton, styles.zoomButtonBottom]}
            onPress={handleZoomOut}
            activeOpacity={0.85}
          >
            <Text variant="body1" weight="semiBold" color={COLORS.white}>
              -
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomSheet}>
        {isLoadingTerritory ? (
          <View style={[styles.stepCard, styles.centeredCard]}>
            <ActivityIndicator size="large" color={COLORS.primary[500]} />
            <Body2 color={COLORS.text.secondary} style={styles.loadingText}>
              Loading territory details...
            </Body2>
          </View>
        ) : territoryLoadError ? (
          <View style={styles.stepCard}>
            <H3 color={COLORS.error[600]}>Unable to load territory</H3>
            <Body2 color={COLORS.text.secondary} style={styles.errorMessage}>
              {territoryLoadError}
            </Body2>
            <Button
              title="Retry"
              onPress={() => {
                if (editTerritoryId) {
                  setOriginalTerritory(null);
                  setTerritoryLoadError(null);
                  setIsLoadingTerritory(true);
                  setTerritoryReloadKey((prev) => prev + 1);
                }
              }}
              fullWidth
            />
          </View>
        ) : isLoadingData ? (
          <View style={[styles.stepCard, styles.centeredCard]}>
            <ActivityIndicator size="large" color={COLORS.primary[500]} />
            <Body2 color={COLORS.text.secondary} style={styles.loadingText}>
              Loading existing territories...
            </Body2>
          </View>
        ) : loadingError ? (
          <View style={styles.stepCard}>
            <H3 color={COLORS.error[600]}>Unable to load territories</H3>
            <Body2 color={COLORS.text.secondary} style={styles.errorMessage}>
              {loadingError}
            </Body2>
            <Button
              title="Try Again"
              onPress={loadExistingTerritories}
              fullWidth
            />
          </View>
        ) : workflowStep === "drawing" ? (
          <View style={[styles.stepCard, styles.drawingStepCard]}>
            <H3 style={styles.stepTitle}>Draw Territory</H3>
            <Body2 color={COLORS.text.secondary}>
              Tap the map to place vertices. Complete the loop when ready.
            </Body2>

            <View style={styles.actionsRow}>
              {isDrawingMode ? (
                <Button
                  title="Stop Drawing"
                  onPress={handleStopDrawing}
                  variant="outline"
                  size="small"
                  containerStyle={styles.actionButton}
                />
              ) : (
                <Button
                  title="Start Drawing"
                  onPress={handleStartDrawing}
                  size="small"
                  containerStyle={styles.actionButton}
                />
              )}
              <Button
                title="Clear"
                onPress={handleClearDrawing}
                variant="outline"
                size="small"
                containerStyle={styles.actionButton}
              />
            </View>

            <View style={styles.drawingInfo}>
              <Body3 color={COLORS.text.secondary}>
                Points placed:{" "}
                <Text weight="semiBold">{pointsPlacedCount}</Text>
              </Body3>
              <Body3 color={COLORS.text.secondary}>
                Residents captured:{" "}
                <Text weight="semiBold">{residentsCapturedCount}</Text>
              </Body3>
            </View>

            <View style={styles.secondaryActions}>
              <Button
                title="Undo Last"
                onPress={handleUndoPoint}
                variant="outline"
                size="small"
                disabled={currentDrawing.length === 0}
                containerStyle={styles.secondaryButton}
              />
              <Button
                title={
                  isProcessingPolygon
                    ? "Validating..."
                    : isDetectingBuildings
                    ? "Detecting buildings..."
                    : "Complete Shape"
                }
                onPress={handleCompletePolygon}
                size="small"
                disabled={
                  isProcessingPolygon ||
                  isDetectingBuildings ||
                  currentDrawing.length < 3
                }
                containerStyle={styles.secondaryButton}
              />
              {isEditMode && pendingTerritory && !isDrawingMode && (
                <Button
                  title="Edit"
                  onPress={() => {
                    setWorkflowStep("saving");
                    setDrawingMode(false);
                    setHasStartedEditing(false);
                  }}
                  variant="outline"
                  size="small"
                  leftIcon={
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={COLORS.primary[500]}
                    />
                  }
                  containerStyle={StyleSheet.flatten([
                    styles.secondaryButton,
                    styles.secondaryButtonInfo,
                  ])}
                />
              )}
            </View>

            {validationErrors.length > 0 && (
              <View style={[styles.callout, styles.errorCallout]}>
                {validationErrors.map((message, index) => (
                  <Body3 key={`${message}-${index}`} color={COLORS.error[600]}>
                    {message}
                  </Body3>
                ))}
              </View>
            )}
          </View>
        ) : pendingTerritory ? (
          <View style={styles.stepCard}>
            <H3 style={styles.reviewTitle}>
              {isEditMode ? "Review & Update" : "Review & Save"}
            </H3>
            <Body2 color={COLORS.text.secondary} style={styles.reviewSubtitle}>
              {isEditMode
                ? "Double-check details before saving your updates."
                : "Name your territory and confirm the detected residents."}
            </Body2>

            {validationWarnings.length > 0 && (
              <View style={[styles.callout, styles.warningCallout]}>
                {validationWarnings.map((warning, index) => (
                  <Body3
                    key={`${warning}-${index}`}
                    color={warningColor}
                    style={styles.calloutText}
                  >
                    {warning}
                  </Body3>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Body2 weight="bold">Summary</Body2>
                <Body3 color={COLORS.text.secondary}>
                  Quick snapshot of this territory
                </Body3>
              </View>
              <View style={styles.metricRow}>
                <View style={styles.metricCard}>
                  <Text weight="semiBold" style={styles.metricValue}>
                    {pendingTerritory.residents.length}
                  </Text>
                  <Body3 style={styles.metricLabel}>Residents detected</Body3>
                </View>
                <View style={styles.metricCard}>
                  <Text weight="semiBold" style={styles.metricValue}>
                    {pendingTerritory.detectedBuildings.length}
                  </Text>
                  <Body3 style={styles.metricLabel}>Buildings identified</Body3>
                </View>
              </View>
              {pendingTerritory.duplicateAddresses.length > 0 && (
                <View style={styles.metricNotice}>
                  <Body3 color={COLORS.warning[700]}>
                    {pendingTerritory.duplicateAddresses.length} building
                    {pendingTerritory.duplicateAddresses.length > 1
                      ? "s"
                      : ""}{" "}
                    already assigned elsewhere.
                  </Body3>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Body2 weight="bold" style={styles.sectionHeaderTitle}>
                Details
              </Body2>

              <View style={styles.inputGroup}>
                <Body3 weight="medium" color={COLORS.text.secondary}>
                  Territory Name *
                </Body3>
                <TextInput
                  value={territoryName}
                  onChangeText={setTerritoryName}
                  placeholder="Enter territory name"
                  placeholderTextColor={COLORS.text.light}
                  style={styles.textInput}
                  maxLength={120}
                />
              </View>

              <View style={styles.inputGroup}>
                <Body3 weight="medium" color={COLORS.text.secondary}>
                  Description
                </Body3>
                <TextInput
                  value={territoryDescription}
                  onChangeText={setTerritoryDescription}
                  placeholder="Optional description"
                  placeholderTextColor={COLORS.text.light}
                  style={[styles.textInput, styles.descriptionInput]}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
                <Body3 style={styles.helperText}>
                  {territoryDescription.length}/500
                </Body3>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Body2 weight="bold">Location</Body2>
                <Button
                  variant="outline"
                  size="small"
                  title="Choose Location"
                  onPress={handleOpenLocationModal}
                />
              </View>
              <View style={styles.locationGrid}>
                <View style={styles.locationItem}>
                  <Body3 color={COLORS.text.secondary}>Area</Body3>
                  <Text weight="semiBold">
                    {selectedAreaName || "Not assigned"}
                  </Text>
                </View>
                <View style={styles.locationItem}>
                  <Body3 color={COLORS.text.secondary}>Municipality</Body3>
                  <Text weight="semiBold">
                    {selectedMunicipalityName || "Not assigned"}
                  </Text>
                </View>
                <View style={styles.locationItem}>
                  <Body3 color={COLORS.text.secondary}>Community</Body3>
                  <Text weight="semiBold">
                    {selectedCommunityName || "Not assigned"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}
        {workflowStep === "saving" && pendingTerritory && (
          <View
            style={[
              styles.saveActionsFixed,
              {
                paddingBottom: insets.bottom || responsiveSpacing(SPACING.sm),
              },
            ]}
          >
            <Button
              title={isEditMode ? "Edit Boundary" : "Back to Drawing"}
              onPress={() => {
                setWorkflowStep("drawing");
                setDrawingMode(false);
                setValidationWarnings([]);
                setValidationErrors([]);
              }}
              variant="outline"
              containerStyle={styles.saveButton}
            />
            <Button
              title={
                isSavingZone
                  ? "Saving..."
                  : isEditMode
                  ? "Save Changes"
                  : "Save & Assign"
              }
              onPress={handleSaveZone}
              disabled={
                territoryName.trim().length === 0 ||
                isSavingZone ||
                pendingTerritory === null ||
                !isLocationSelectionComplete
              }
              containerStyle={styles.saveButton}
            />
          </View>
        )}
      </View>
      <Modal
        transparent
        animationType="slide"
        visible={isLocationModalVisible}
        onRequestClose={handleCloseLocationModal}
      >
        <View style={styles.locationModalOverlay}>
          <TouchableOpacity
            style={styles.locationModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseLocationModal}
          />
          <View
            style={[
              styles.locationModalContent,
              {
                paddingBottom: insets.bottom || responsiveSpacing(SPACING.md),
              },
            ]}
          >
            <View style={styles.locationModalHeader}>
              <Body2 weight="semiBold">Choose Location</Body2>
              <Button
                variant="ghost"
                size="small"
                title="Close"
                onPress={handleCloseLocationModal}
              />
            </View>
            <ScrollView
              style={styles.locationModalScroll}
              contentContainerStyle={styles.locationModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.selectorGroup}>
                <Body2 weight="semiBold">Area</Body2>
                {isLoadingAreas ? (
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                ) : (
                  <View style={styles.selectorOptions}>
                    {areas.map((area) => {
                      const isSelected = selectedAreaId === area._id;
                      return (
                        <TouchableOpacity
                          key={area._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() => handleSelectArea(area._id)}
                        >
                          <Text
                            weight={isSelected ? "semiBold" : "regular"}
                            color={
                              isSelected
                                ? COLORS.primary[500]
                                : COLORS.text.primary
                            }
                          >
                            {area.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {areas.length === 0 && (
                      <Body3 color={COLORS.text.secondary}>
                        No areas available.
                      </Body3>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.selectorGroup}>
                <Body2 weight="semiBold">Municipality</Body2>
                {isLoadingMunicipalities ? (
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                ) : selectedAreaId ? (
                  <View style={styles.selectorOptions}>
                    {municipalities.map((municipality) => {
                      const isSelected =
                        selectedMunicipalityId === municipality._id;
                      return (
                        <TouchableOpacity
                          key={municipality._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() =>
                            handleSelectMunicipality(municipality._id)
                          }
                        >
                          <Text
                            weight={isSelected ? "semiBold" : "regular"}
                            color={
                              isSelected
                                ? COLORS.primary[500]
                                : COLORS.text.primary
                            }
                          >
                            {municipality.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {municipalities.length === 0 && (
                      <Body3 color={COLORS.text.secondary}>
                        Select an area to view municipalities.
                      </Body3>
                    )}
                  </View>
                ) : (
                  <Body3 color={COLORS.text.secondary}>
                    Select an area first.
                  </Body3>
                )}
              </View>

              <View style={styles.selectorGroup}>
                <Body2 weight="semiBold">Community</Body2>
                {isLoadingCommunities ? (
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                ) : selectedMunicipalityId ? (
                  <View style={styles.selectorOptions}>
                    {communities.map((community) => {
                      const isSelected = selectedCommunityId === community._id;
                      return (
                        <TouchableOpacity
                          key={community._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() => handleSelectCommunity(community._id)}
                        >
                          <Text
                            weight={isSelected ? "semiBold" : "regular"}
                            color={
                              isSelected
                                ? COLORS.primary[500]
                                : COLORS.text.primary
                            }
                          >
                            {community.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {communities.length === 0 && (
                      <Body3 color={COLORS.text.secondary}>
                        Select a municipality to view communities.
                      </Body3>
                    )}
                  </View>
                ) : (
                  <Body3 color={COLORS.text.secondary}>
                    Select a municipality first.
                  </Body3>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  map: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PADDING.md,
    paddingBottom: PADDING.sm,
    backgroundColor: COLORS.primary[500],
    borderBottomLeftRadius: SPACING.md,
    borderBottomRightRadius: SPACING.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  headerSearchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    paddingBottom: responsiveSpacing(SPACING.xs / 2),
    paddingTop: responsiveSpacing(SPACING.xs - 4 / 9),
  },
  headerSearchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: responsiveScale(19),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xs / 4),
    height: responsiveScale(38),
  },
  headerSearchIcon: {
    marginRight: responsiveSpacing(SPACING.xs / 2),
  },
  headerSearchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: responsiveScale(14),
    paddingVertical: 0,
  },
  headerSearchClearButton: {
    padding: responsiveSpacing(SPACING.xs / 4),
  },
  headerSearchSpinner: {
    marginLeft: responsiveSpacing(SPACING.xs / 2),
  },
  headerTitle: {
    color: COLORS.white,
  },
  headerSubtitle: {
    color: COLORS.white,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconButton: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(10),
    borderWidth: 1,
    borderColor: COLORS.white,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchSuggestionsPortal: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 19,
    paddingHorizontal: PADDING.md,
  },
  searchSuggestionsContainer: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  searchSuggestionsScroll: {
    maxHeight: responsiveScale(240),
  },
  searchSuggestionsList: {
    paddingVertical: responsiveSpacing(SPACING.xs),
  },
  searchSuggestionItem: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148, 163, 184, 0.4)",
  },
  searchSuggestionItemLast: {
    borderBottomWidth: 0,
  },
  searchSuggestionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
  },
  searchSuggestionsLoadingText: {
    flex: 1,
  },
  searchSuggestionsEmpty: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
  },
  fabGroup: {
    position: "absolute",
    top: 0,
    right: responsiveSpacing(SPACING.sm),
    flexDirection: "column",
    alignItems: "flex-end",
    gap: responsiveSpacing(SPACING.xs),
    zIndex: 10,
    backgroundColor: "transparent",
  },
  fab: {
    minWidth: responsiveScale(72),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.xs),
    borderRadius: responsiveScale(12),
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  fabPrimary: {
    backgroundColor: COLORS.primary[500],
  },
  fabSecondary: {
    backgroundColor: COLORS.success[600],
  },
  fabTertiary: {
    backgroundColor: COLORS.warning[500],
  },
  fabDisabled: {
    opacity: 0.5,
  },
  zoomGroup: {
    marginTop: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(12),
    overflow: "hidden",
    backgroundColor: COLORS.neutral[700],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  zoomButton: {
    width: responsiveScale(44),
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  zoomButtonTop: {
    backgroundColor: COLORS.primary[500],
  },
  zoomButtonBottom: {
    backgroundColor: COLORS.primary[600],
  },
  locationModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  locationModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  locationModalContent: {
    backgroundColor: COLORS.background.primary,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingTop: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
  },
  locationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationModalScroll: {
    maxHeight: responsiveScale(420),
  },
  locationModalScrollContent: {
    gap: responsiveSpacing(SPACING.md),
    paddingBottom: responsiveSpacing(SPACING.md),
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SPACING.md,
    borderTopRightRadius: SPACING.md,
    paddingHorizontal: PADDING.md,
    paddingTop: responsiveSpacing(SPACING.sm),
    paddingBottom: responsiveSpacing(SPACING.sm),
    gap: responsiveSpacing(SPACING.xs),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 20,
    zIndex: 30,
  },
  centeredCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: responsiveSpacing(SPACING.md),
  },
  loadingText: {
    marginTop: SPACING.sm,
  },
  stepCard: {
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: responsiveSpacing(SPACING.xs),
  },
  drawingStepCard: {
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  stepTitle: {
    marginBottom: responsiveSpacing(SPACING.xs),
    paddingTop: responsiveSpacing(SPACING.md),
  },
  reviewTitle: {
    paddingTop: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  reviewSubtitle: {
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  section: {
    backgroundColor: COLORS.background.primary,
    borderRadius: 5,
    padding: responsiveSpacing(SPACING.md),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.light,
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs),
  },
  sectionHeaderTitle: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  metricRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(14),
    paddingVertical: responsiveSpacing(SPACING.md),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.primary[100],
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  metricValue: {
    fontSize: responsiveScale(20),
    color: COLORS.primary[600],
  },
  metricLabel: {
    color: COLORS.text.secondary,
  },
  metricNotice: {
    backgroundColor: COLORS.warning[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.sm),
  },
  locationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.sm),
  },
  locationItem: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: responsiveScale(120),
    backgroundColor: COLORS.neutral[100],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.sm),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral[200],
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  selectorGroup: {
    gap: responsiveSpacing(SPACING.xs),
  },
  selectorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.sm),
    marginTop: responsiveSpacing(SPACING.xs),
  },
  selectorOption: {
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.medium,
    backgroundColor: COLORS.background.primary,
  },
  selectorOptionSelected: {
    borderColor: COLORS.primary[500],
    backgroundColor: COLORS.primary[50],
  },
  actionsRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  actionButton: {
    flex: 1,
  },
  drawingInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: responsiveSpacing(SPACING.sm),
  },
  secondaryActions: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  reviewShortcut: {
    marginTop: responsiveSpacing(SPACING.sm),
  },
  secondaryButton: {
    flex: 1,
    justifyContent: "center",
  },
  secondaryButtonInfo: {
    flex: 0.35,
  },
  callout: {
    marginTop: responsiveSpacing(SPACING.sm),
    padding: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(10),
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorCallout: {
    backgroundColor: COLORS.error[50],
    borderColor: COLORS.error[100],
  },
  warningCallout: {
    backgroundColor: COLORS.warning[50],
    borderColor: COLORS.warning[100],
  },
  calloutText: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  errorMessage: {
    textAlign: "center",
    marginTop: SPACING.sm,
  },
  saveActionsFixed: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.sm),
  },
  saveButton: {
    flex: 1,
  },
  inputGroup: {
    gap: responsiveSpacing(SPACING.xs / 1.5),
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.black,
    borderRadius: responsiveScale(16),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.background.primary,
    color: COLORS.text.primary,
    fontSize: responsiveScale(14),
  },
  descriptionInput: {
    minHeight: responsiveScale(96),
    textAlignVertical: "top",
  },
  helperText: {
    textAlign: "right",
    color: COLORS.text.secondary,
    fontSize: responsiveScale(11),
  },
});
