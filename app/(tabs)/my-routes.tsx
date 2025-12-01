import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppHeader,
  Body1,
  Body2,
  Body3,
  Button,
  H3,
  Text,
} from "@/components/ui";
import {
  useMyRoutes,
  AgentRoute,
  RouteStatus,
  useCreateRoute,
  useDeleteRoute,
  useUpdateRoute,
  RouteDetails,
  CreateRouteRequest,
  UpdateRouteRequest,
} from "@/lib/routeApi";
import { getGoogleMapsApiKey } from "@/lib/googleMaps";
import { LinearGradient } from "expo-linear-gradient";
import {
  COLORS,
  PADDING,
  SPACING,
  responsiveScale,
  responsiveSpacing,
} from "@/constants";

const MAX_BULK_ADDRESSES = 25;

type PlannerOptimizationState = {
  fastestRoute: boolean;
  avoidFerries: boolean;
  avoidHighways: boolean;
  avoidTolls: boolean;
};

type PlannerAlternativeRaw = {
  raw: any;
  id: string;
  summary: string;
  distanceKilometers: number;
  durationMinutes: number;
  polyline: { latitude: number; longitude: number }[];
};

const decodePolyline = (
  encoded: string
): { latitude: number; longitude: number }[] => {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: { latitude: number; longitude: number }[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coordinates;
};

const formatReverseGeocodeAddress = (
  entry: Location.LocationGeocodedAddress | undefined,
  coords?: Location.LocationObjectCoords
): string => {
  if (!entry) {
    if (!coords) {
      return "Unknown location";
    }
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  }

  const parts = [
    entry.streetNumber,
    entry.street,
    entry.city,
    entry.region,
    entry.postalCode,
    entry.country,
  ].filter((part) => typeof part === "string" && part.length > 0) as string[];

  if (parts.length === 0 && coords) {
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  }

  return parts.join(", ");
};

const normalizeAddressLine = (line: string): string => {
  let cleaned = line.trim();
  cleaned = cleaned.replace(/^[\s\u2022\-]*\d+\s*[.)\-:]\s*/, "");
  cleaned = cleaned.replace(/\s*\(same as #\d+\)\s*$/i, "");
  cleaned = cleaned.replace(/\s+#\d+\s*$/i, "");
  return cleaned.trim();
};

const kilometersToMiles = (kilometers: number): number => {
  return kilometers * 0.621371;
};

// Color palette for alphabetical badges
const getLetterColor = (letter: string): string => {
  const colors = [
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#84cc16", // Lime
    "#6366f1", // Indigo
    "#14b8a6", // Teal
    "#f43f5e", // Rose
    "#a855f7", // Violet
    "#22c55e", // Emerald
    "#eab308", // Yellow
  ];
  const index = letter.charCodeAt(0) - 65; // A=0, B=1, etc.
  return colors[index % colors.length];
};

export default function MyRoutesScreen(): React.JSX.Element {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const previewTopOffset = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const previewMapRef = useRef<MapView | null>(null);
  const [viewMode, setViewMode] = useState<"routes" | "planner">("routes");
  const [searchTerm, setSearchTerm] = useState("");
  const [plannerName, setPlannerName] = useState("");
  const [plannerDescription, setPlannerDescription] = useState("");
  const [plannerMode, setPlannerMode] = useState<
    "driving" | "walking" | "bicycling" | "transit"
  >("driving");
  const [plannerStartCoordinates, setPlannerStartCoordinates] = useState<
    [number, number] | null
  >(null);
  const [plannerEndCoordinates, setPlannerEndCoordinates] = useState<
    [number, number] | null
  >(null);
  const [plannerPreviewPolyline, setPlannerPreviewPolyline] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [plannerAlternatives, setPlannerAlternatives] = useState<
    {
      id: string;
      summary: string;
      distanceKilometers: number;
      durationMinutes: number;
      distanceRoundedText: string;
      distanceDetailedText: string;
      durationText: string;
      polyline: { latitude: number; longitude: number }[];
    }[]
  >([]);
  const [plannerSelectedAlternativeIndex, setPlannerSelectedAlternativeIndex] =
    useState(0);
  const [plannerTotalDistance, setPlannerTotalDistance] = useState(0);
  const [plannerTotalDuration, setPlannerTotalDuration] = useState(0);
  const [plannerRouteDetails, setPlannerRouteDetails] =
    useState<RouteDetails | null>(null);
  const [plannerIsCalculatingRoute, setPlannerIsCalculatingRoute] =
    useState(false);
  const [plannerFetchingLocationIndex, setPlannerFetchingLocationIndex] =
    useState<number | null>(null);
  const [plannerAddresses, setPlannerAddresses] = useState<string[]>([""]);
  const [plannerOptimization, setPlannerOptimization] =
    useState<PlannerOptimizationState>({
      fastestRoute: false,
      avoidFerries: false,
      avoidHighways: false,
      avoidTolls: false,
    });
  const [bulkImportVisible, setBulkImportVisible] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isPreviewMapVisible, setIsPreviewMapVisible] = useState(false);
  const [selectedRouteForPreview, setSelectedRouteForPreview] =
    useState<AgentRoute | null>(null);
  const [isRoutePreviewVisible, setIsRoutePreviewVisible] = useState(false);
  const [isRouteMapPreviewVisible, setIsRouteMapPreviewVisible] =
    useState(false);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch: refetchRoutes,
  } = useMyRoutes({});
  const createRouteMutation = useCreateRoute();
  const deleteRouteMutation = useDeleteRoute();
  const updateRouteMutation = useUpdateRoute();
  const [editingRoute, setEditingRoute] = useState<AgentRoute | null>(null);

  const routes = useMemo<AgentRoute[]>(() => {
    if (!data?.routes) {
      return [];
    }
    return data.routes;
  }, [data?.routes]);

  const parseBulkAddresses = useCallback((input: string): string[] => {
    return input
      .split(/\r?\n/)
      .map((line) => normalizeAddressLine(line))
      .filter(
        (line) =>
          !line
            .toLowerCase()
            .match(/^(https?:\/\/|www\.|redfin|zolo|zillow|realtor|mls)$/)
      )
      .map((line) => line.replace(/\s+/g, " ").replace(/,\s*$/, ""))
      .filter((line) => line.length > 0)
      .filter((line) => line.length >= 5);
  }, []);

  const resetPlanner = useCallback(() => {
    setPlannerName("");
    setPlannerDescription("");
    setPlannerMode("driving");
    setPlannerStartCoordinates(null);
    setPlannerEndCoordinates(null);
    setPlannerAddresses([""]);
    setPlannerOptimization({
      fastestRoute: false,
      avoidFerries: false,
      avoidHighways: false,
      avoidTolls: false,
    });
    setBulkImportVisible(false);
    setBulkImportText("");
    setPlannerPreviewPolyline([]);
    setPlannerAlternatives([]);
    setPlannerSelectedAlternativeIndex(0);
    setPlannerTotalDistance(0);
    setPlannerTotalDuration(0);
    setPlannerRouteDetails(null);
    setEditingRoute(null);
  }, []);

  const handleAddAddress = useCallback(() => {
    setPlannerAddresses((prev) => [...prev, ""]);
  }, []);

  const handleRemoveAddress = useCallback((index: number) => {
    setPlannerAddresses((prev) => {
      if (prev.length === 1) {
        return [""];
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleUpdateAddress = useCallback((index: number, value: string) => {
    setPlannerAddresses((prev) =>
      prev.map((address, i) => (i === index ? value : address))
    );
  }, []);

  const handleMoveAddress = useCallback(
    (index: number, direction: "up" | "down") => {
      setPlannerAddresses((prev) => {
        const next = [...prev];
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= next.length) {
          return prev;
        }
        const temp = next[targetIndex];
        next[targetIndex] = next[index];
        next[index] = temp;
        return next;
      });
    },
    []
  );

  const handleToggleOptimization = useCallback(
    (key: keyof typeof plannerOptimization) => {
      setPlannerOptimization((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    []
  );

  const trimmedPlannerAddresses = useMemo(
    () => plannerAddresses.map((address) => address.trim()).filter(Boolean),
    [plannerAddresses]
  );

  const plannerCanCalculate = useMemo(() => {
    return trimmedPlannerAddresses.length >= 2 && plannerName.trim().length > 0;
  }, [plannerName, trimmedPlannerAddresses]);

  const formatDuration = useCallback((minutes?: number) => {
    if (!minutes || minutes <= 0) {
      return "—";
    }
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hrs} hr`;
    }
    return `${hrs}h ${mins}m`;
  }, []);

  const formatDurationForSummary = useCallback((minutes?: number) => {
    if (!minutes || minutes <= 0) {
      return "—";
    }
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }

    let hours = Math.round(minutes / 60);
    let mins = Math.round(minutes % 60);

    if (mins === 60) {
      hours += 1;
      mins = 0;
    }

    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }, []);

  const formatDistance = useCallback((kilometers?: number) => {
    if (!kilometers || kilometers <= 0) {
      return "—";
    }
    return `${kilometers.toFixed(1)} km`;
  }, []);

  const formatDistanceRounded = useCallback((kilometers?: number) => {
    if (!kilometers || kilometers <= 0) {
      return "—";
    }
    return `${Math.round(kilometers)} km`;
  }, []);

  const formatDistanceDetailed = useCallback((kilometers?: number) => {
    if (!kilometers || kilometers <= 0) {
      return "—";
    }
    return `${kilometers.toFixed(1)} km`;
  }, []);

  const metersToKilometers = useCallback((value?: number) => {
    if (!value || value <= 0) {
      return 0;
    }
    return value / 1000;
  }, []);

  const secondsToMinutes = useCallback((value?: number) => {
    if (!value || value <= 0) {
      return 0;
    }
    return value / 60;
  }, []);

  const formatDurationFromSeconds = useCallback(
    (value?: number) => formatDurationForSummary(secondsToMinutes(value)),
    [formatDurationForSummary, secondsToMinutes]
  );

  const previewButtonIconColor = useMemo(() => {
    if (plannerIsCalculatingRoute) {
      return COLORS.text.disabled;
    }
    return plannerCanCalculate ? COLORS.primary[500] : COLORS.text.disabled;
  }, [plannerCanCalculate, plannerIsCalculatingRoute]);

  const handleCalculateRoute = useCallback(async () => {
    if (!plannerCanCalculate) {
      Alert.alert(
        "Add more details",
        "Please provide a route name and at least two valid addresses before calculating."
      );
      return;
    }

    let apiKey = getGoogleMapsApiKey();
    
    // Fallback to hardcoded key if not found (for real device compatibility)
    if (!apiKey) {
      console.warn("⚠️ Google Maps API key not found in config, using fallback key");
      apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
    }

    if (!apiKey) {
      Alert.alert(
        "Missing API key",
        "Google Maps API key is not configured. Please update your environment configuration."
      );
      return;
    }

    const originAddress = trimmedPlannerAddresses[0];
    const destinationAddress =
      trimmedPlannerAddresses[trimmedPlannerAddresses.length - 1];

    const intermediateStops = trimmedPlannerAddresses.filter(
      (address, index) => {
        if (index === 0) return false;
        if (index === trimmedPlannerAddresses.length - 1) return false;
        return true;
      }
    );

    const avoidParams: string[] = [];
    if (plannerOptimization.avoidFerries) avoidParams.push("ferries");
    if (plannerOptimization.avoidHighways) avoidParams.push("highways");
    if (plannerOptimization.avoidTolls) avoidParams.push("tolls");
    // Google Directions API does not support avoid traffic directly

    const waypointsParam = intermediateStops.length
      ? `&waypoints=${
          plannerOptimization.fastestRoute ? "optimize:true|" : ""
        }${intermediateStops.map((stop) => encodeURIComponent(stop)).join("|")}`
      : "";
    const avoidParam = avoidParams.length
      ? `&avoid=${avoidParams.join("|")}`
      : "";

    const modeParam = plannerMode.toLowerCase();

    console.log("[RoutePreview] Calculating route with:", {
      origin: originAddress,
      destination: destinationAddress,
      intermediateStops,
      avoidParams,
      rawAddresses: plannerAddresses,
      trimmedAddresses: trimmedPlannerAddresses,
    });

    const directionsUrl =
      `https://maps.googleapis.com/maps/api/directions/json?key=${apiKey}` +
      `&origin=${encodeURIComponent(originAddress)}` +
      `&destination=${encodeURIComponent(destinationAddress)}` +
      `&mode=${modeParam}` +
      `&units=metric` +
      `&alternatives=true` +
      waypointsParam +
      avoidParam;

    setPlannerIsCalculatingRoute(true);

    try {
      const response = await fetch(directionsUrl);
      const payload = await response.json();

      if (payload.status !== "OK") {
        throw new Error(
          payload.error_message || payload.status || "Directions request failed"
        );
      }

      const routesData = Array.isArray(payload.routes)
        ? (payload.routes as any[])
        : [];
      if (routesData.length === 0) {
        throw new Error("No routes returned by Google Maps.");
      }

      console.log("[RoutePreview] Raw routes from Google", {
        count: routesData.length,
        summaries: routesData.map((route: any) => route?.summary ?? ""),
      });

      const alternativesWithRaw: PlannerAlternativeRaw[] = routesData.map(
        (raw: any, index: number) => {
          const legs: any[] = Array.isArray(raw?.legs) ? raw.legs : [];
          const totalDistanceMeters = legs.reduce(
            (total: number, leg: any) => total + (leg?.distance?.value ?? 0),
            0
          );
          const totalDurationSeconds = legs.reduce(
            (total: number, leg: any) => total + (leg?.duration?.value ?? 0),
            0
          );
          const distanceKilometers = totalDistanceMeters / 1000;
          const durationMinutes = totalDurationSeconds / 60;

          const summary: string =
            raw.summary ||
            legs
              .slice(0, 2)
              .map((leg: any) => leg?.end_address)
              .filter(Boolean)
              .join(" → ") ||
            `Route ${index + 1}`;

          const decodedPolyline = raw.overview_polyline?.points
            ? decodePolyline(raw.overview_polyline.points)
            : [];

          return {
            raw,
            id: raw.summary ?? `route-${index}`,
            summary: summary || `Route ${index + 1}`,
            distanceKilometers,
            durationMinutes,
            polyline: decodedPolyline,
          };
        }
      );

      console.log("[RoutePreview] Processed alternatives", alternativesWithRaw);

      if (alternativesWithRaw.length === 0) {
        throw new Error("No valid alternatives generated from Google routes.");
      }

      const alternatives = alternativesWithRaw.map(
        ({ raw: _raw, ...rest }) => ({
          ...rest,
          distanceRoundedText: formatDistanceRounded(rest.distanceKilometers),
          distanceDetailedText: formatDistanceDetailed(rest.distanceKilometers),
          durationText: formatDurationForSummary(rest.durationMinutes),
        })
      );

      const selectedAlternative = alternativesWithRaw[0];
      const selectedRoute = selectedAlternative.raw;

      console.log("[RoutePreview] Selected route stats", {
        summary: selectedAlternative.summary,
        distanceKilometers: selectedAlternative.distanceKilometers,
        durationMinutes: selectedAlternative.durationMinutes,
        legs: (selectedRoute?.legs ?? []).map((leg: any, idx: number) => ({
          index: idx,
          start: leg?.start_address,
          end: leg?.end_address,
          distanceText: leg?.distance?.text,
          durationText: leg?.duration?.text,
          distanceMeters: leg?.distance?.value,
          durationSeconds: leg?.duration?.value,
        })),
      });

      const routeDetailsAlternatives = alternativesWithRaw.map(
        ({ raw, distanceKilometers, durationMinutes }) => ({
          summary: raw.summary || "",
          distance: kilometersToMiles(distanceKilometers),
          duration: durationMinutes,
          distanceRoundedText: formatDistanceRounded(distanceKilometers),
          distanceDetailedText: formatDistanceDetailed(distanceKilometers),
          durationText: formatDurationForSummary(durationMinutes),
          trafficCondition:
            distanceKilometers === selectedAlternative.distanceKilometers
              ? "Best route"
              : "Alternative",
          legs: (raw.legs ?? []).map((leg: any) => {
            const legDistanceKilometers = metersToKilometers(
              leg.distance?.value
            );
            return {
              startAddress: leg.start_address,
              endAddress: leg.end_address,
              startLocation: [
                leg.start_location?.lng ?? 0,
                leg.start_location?.lat ?? 0,
              ] as [number, number],
              endLocation: [
                leg.end_location?.lng ?? 0,
                leg.end_location?.lat ?? 0,
              ] as [number, number],
              distance: leg.distance?.value ?? 0,
              distanceText:
                leg.distance?.text ??
                formatDistanceDetailed(legDistanceKilometers),
              duration: leg.duration?.value ?? 0,
              durationText:
                leg.duration?.text ??
                formatDurationFromSeconds(leg.duration?.value ?? 0),
              steps: (leg.steps ?? []).map((step: any) => {
                const stepDistanceKilometers = metersToKilometers(
                  step.distance?.value
                );
                return {
                  instruction: (step.html_instructions || "").replace(
                    /<[^>]*>/g,
                    ""
                  ),
                  distance: step.distance?.value ?? 0,
                  distanceText:
                    step.distance?.text ??
                    formatDistanceDetailed(stepDistanceKilometers),
                  duration: step.duration?.value ?? 0,
                  durationText:
                    step.duration?.text ??
                    formatDurationFromSeconds(step.duration?.value ?? 0),
                  startLocation: [
                    step.start_location.lng,
                    step.start_location.lat,
                  ] as [number, number],
                  endLocation: [
                    step.end_location.lng,
                    step.end_location.lat,
                  ] as [number, number],
                  maneuver: step.maneuver,
                  polyline: step.polyline?.points,
                };
              }),
              overviewPolyline: leg.overview_polyline?.points,
              warnings: leg.warnings ?? [],
              waypointOrder: leg.waypoint_order ?? [],
            };
          }),
          overviewPolyline: raw.overview_polyline?.points,
          warnings: raw.warnings ?? [],
          waypointOrder: raw.waypoint_order ?? [],
        })
      );

      const bounds = selectedRoute.bounds
        ? {
            northeast: [
              selectedRoute.bounds.northeast.lng,
              selectedRoute.bounds.northeast.lat,
            ] as [number, number],
            southwest: [
              selectedRoute.bounds.southwest.lng,
              selectedRoute.bounds.southwest.lat,
            ] as [number, number],
          }
        : undefined;

      // Extract start and end coordinates from the route
      const firstLeg = selectedRoute?.legs?.[0];
      const lastLeg = selectedRoute?.legs?.[selectedRoute.legs.length - 1];

      if (firstLeg?.start_location) {
        setPlannerStartCoordinates([
          firstLeg.start_location.lng,
          firstLeg.start_location.lat,
        ] as [number, number]);
      }

      if (lastLeg?.end_location) {
        setPlannerEndCoordinates([
          lastLeg.end_location.lng,
          lastLeg.end_location.lat,
        ] as [number, number]);
      }

      setPlannerAlternatives(alternatives);
      setPlannerSelectedAlternativeIndex(0);
      setPlannerPreviewPolyline(selectedAlternative.polyline);
      setPlannerTotalDistance(selectedAlternative.distanceKilometers);
      setPlannerTotalDuration(selectedAlternative.durationMinutes);
      setPlannerRouteDetails({
        selectedAlternativeIndex: 0,
        alternatives: routeDetailsAlternatives,
        bounds,
        copyrights: selectedRoute.copyrights || "",
        calculatedAt: new Date().toISOString(),
      });

      console.log("[RoutePreview] Mobile preview payload", {
        selected: routeDetailsAlternatives[0],
        allAlternatives: routeDetailsAlternatives,
      });

      setIsPreviewVisible(true);
    } catch (error) {
      setPlannerAlternatives([]);
      setPlannerSelectedAlternativeIndex(0);
      setPlannerPreviewPolyline([]);
      setPlannerRouteDetails(null);
      setPlannerTotalDistance(0);
      setPlannerTotalDuration(0);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to calculate directions.";
      Alert.alert("Calculation failed", message);
    } finally {
      setPlannerIsCalculatingRoute(false);
    }
  }, [
    plannerCanCalculate,
    trimmedPlannerAddresses,
    plannerOptimization,
    plannerMode,
    plannerAddresses,
    formatDistanceDetailed,
    formatDistanceRounded,
    formatDurationForSummary,
    formatDurationFromSeconds,
    metersToKilometers,
  ]);

  const handleSaveRoute = useCallback(async () => {
    if (!plannerRouteDetails || plannerAlternatives.length === 0) {
      Alert.alert(
        "Calculate the route first",
        "Please calculate directions before saving the route."
      );
      return;
    }

    if (!plannerName.trim()) {
      Alert.alert("Missing name", "Please enter a route name before saving.");
      return;
    }

    const validAddresses = trimmedPlannerAddresses;
    if (validAddresses.length < 2) {
      Alert.alert(
        "Add more stops",
        "Please provide at least two valid addresses before saving."
      );
      return;
    }

    const startAddressResolved = validAddresses[0];
    const endAddressResolved = validAddresses[validAddresses.length - 1];

    // Try to get coordinates from routeDetails if not already set
    let startCoords = plannerStartCoordinates;
    let endCoords = plannerEndCoordinates;

    if (
      !startCoords &&
      plannerRouteDetails?.alternatives?.[0]?.legs?.[0]?.startLocation
    ) {
      const coords = plannerRouteDetails.alternatives[0].legs[0].startLocation;
      startCoords = [coords[0], coords[1]] as [number, number];
      console.log(
        "[RouteSave] Extracted start coordinates from routeDetails:",
        startCoords
      );
    }

    if (!endCoords && plannerRouteDetails?.alternatives?.[0]?.legs) {
      const legs = plannerRouteDetails.alternatives[0].legs;
      const lastLeg = legs[legs.length - 1];
      if (lastLeg?.endLocation) {
        const coords = lastLeg.endLocation;
        endCoords = [coords[0], coords[1]] as [number, number];
        console.log(
          "[RouteSave] Extracted end coordinates from routeDetails:",
          endCoords
        );
      }
    }

    if (!startCoords) {
      Alert.alert(
        "Missing coordinates",
        "Could not determine start location coordinates from the calculated route."
      );
      return;
    }

    console.log("[RoutePreview] Saving route with addresses:", {
      start: startAddressResolved,
      end: endAddressResolved,
      addresses: validAddresses,
    });

    try {
      const stops = validAddresses.map((address, index) => ({
        address,
        order: index + 1,
        estimatedDuration: 15,
        notes: address,
        status: "PENDING" as const,
      }));

      const payload: CreateRouteRequest = {
        name: plannerName.trim(),
        description: plannerDescription.trim() || undefined,
        date: editingRoute?.date || new Date().toISOString(),
        priority: editingRoute?.priority || "MEDIUM",
        startLocation: {
          address: startAddressResolved,
          coordinates: startCoords,
        },
        endLocation: endCoords
          ? {
              address: endAddressResolved,
              coordinates: endCoords,
            }
          : undefined,
        stops,
        totalDistance: kilometersToMiles(plannerTotalDistance),
        totalDuration: plannerTotalDuration,
        optimizationSettings: {
          optimizationType: plannerOptimization.fastestRoute
            ? "FASTEST"
            : "BALANCED",
          avoidFerries: plannerOptimization.avoidFerries,
          avoidHighways: plannerOptimization.avoidHighways,
          avoidTolls: plannerOptimization.avoidTolls,
        },
        analytics: {
          totalStops: stops.length,
          completedStops: editingRoute?.analytics?.completedStops || 0,
          skippedStops: editingRoute?.analytics?.skippedStops || 0,
          totalDistance: kilometersToMiles(plannerTotalDistance),
          estimatedDuration: plannerTotalDuration,
          efficiency: editingRoute?.analytics?.efficiency || 0,
          completionRate: editingRoute?.analytics?.completionRate || 0,
        },
        routeDetails: plannerRouteDetails,
      };

      console.log(
        editingRoute
          ? "[RouteUpdate] Updating route data to backend:"
          : "[RouteSave] Sending route data to backend:",
        {
          name: payload.name,
          stopsCount: payload.stops?.length,
          totalDistance: payload.totalDistance,
          totalDuration: payload.totalDuration,
          optimizationSettings: payload.optimizationSettings,
          hasRouteDetails: !!payload.routeDetails,
          routeDetailsAlternativesCount:
            payload.routeDetails?.alternatives?.length,
        }
      );

      if (editingRoute) {
        // Update existing route
        await updateRouteMutation.mutateAsync({
          id: editingRoute._id,
          payload: payload as UpdateRouteRequest,
        });
        Alert.alert(
          "Route updated",
          `Route "${payload.name}" updated successfully.`
        );
      } else {
        // Create new route
        await createRouteMutation.mutateAsync(payload);
        Alert.alert(
          "Route saved",
          `Route "${payload.name}" saved successfully.`
        );
      }

      resetPlanner();
      setViewMode("routes");
      refetchRoutes();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save the route.";
      Alert.alert("Save failed", message);
    }
  }, [
    createRouteMutation,
    updateRouteMutation,
    editingRoute,
    plannerAlternatives,
    plannerName,
    plannerDescription,
    plannerStartCoordinates,
    plannerEndCoordinates,
    plannerTotalDistance,
    plannerTotalDuration,
    plannerOptimization,
    plannerRouteDetails,
    trimmedPlannerAddresses,
    resetPlanner,
    refetchRoutes,
    setViewMode,
  ]);

  const handleApplyBulkImport = useCallback(() => {
    const parsed = parseBulkAddresses(bulkImportText);
    console.log("[RoutePreview] Parsed bulk addresses", parsed);
    if (parsed.length === 0) {
      Alert.alert(
        "No addresses detected",
        "Please paste a list of addresses separated by new lines."
      );
      return;
    }
    if (parsed.length > MAX_BULK_ADDRESSES) {
      Alert.alert(
        "Too many addresses",
        `Please limit your import to ${MAX_BULK_ADDRESSES} addresses.`
      );
      return;
    }
    setPlannerAddresses(parsed);
    setBulkImportVisible(false);
    setBulkImportText("");
  }, [bulkImportText, parseBulkAddresses]);

  const plannerOptimizationEntries = useMemo<
    { key: keyof PlannerOptimizationState; label: string }[]
  >(
    () => [
      { key: "fastestRoute", label: "Fastest route" },
      { key: "avoidHighways", label: "Avoid highways" },
      { key: "avoidTolls", label: "Avoid toll roads" },
      { key: "avoidFerries", label: "Avoid ferries" },
    ],
    []
  );

  const handleCloseBulkImport = useCallback(() => {
    setBulkImportVisible(false);
    setBulkImportText("");
  }, []);

  const handleClearAddresses = useCallback(() => {
    setPlannerAddresses([""]);
  }, []);

  const handleUseCurrentLocation = useCallback(
    async (index: number) => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission required",
            "Location permission is needed to use your current position."
          );
          return;
        }

        setPlannerFetchingLocationIndex(index);
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const [reverse] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        const formatted = formatReverseGeocodeAddress(reverse, position.coords);
        handleUpdateAddress(index, formatted);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to fetch your current location.";
        Alert.alert("Location error", message);
      } finally {
        setPlannerFetchingLocationIndex(null);
      }
    },
    [handleUpdateAddress]
  );

  const selectedPreviewDetails = useMemo(() => {
    if (
      !plannerRouteDetails ||
      !plannerRouteDetails.alternatives ||
      plannerRouteDetails.alternatives.length === 0
    ) {
      return null;
    }
    const index = Math.min(
      plannerSelectedAlternativeIndex,
      plannerRouteDetails.alternatives.length - 1
    );
    return plannerRouteDetails.alternatives[index];
  }, [plannerRouteDetails, plannerSelectedAlternativeIndex]);

  const selectedPreviewOption = useMemo(() => {
    if (plannerAlternatives.length === 0) {
      return null;
    }
    const index = Math.min(
      plannerSelectedAlternativeIndex,
      plannerAlternatives.length - 1
    );
    return plannerAlternatives[index];
  }, [plannerAlternatives, plannerSelectedAlternativeIndex]);

  const handleSelectAlternative = useCallback(
    (index: number) => {
      const alternative = plannerAlternatives[index];
      if (!alternative) {
        return;
      }
      setPlannerSelectedAlternativeIndex(index);
      setPlannerPreviewPolyline(alternative.polyline);
      setPlannerTotalDistance(alternative.distanceKilometers);
      setPlannerTotalDuration(alternative.durationMinutes);
      setPlannerRouteDetails((prev) =>
        prev
          ? {
              ...prev,
              selectedAlternativeIndex: index,
            }
          : prev
      );
    },
    [plannerAlternatives]
  );

  const filteredRoutes = useMemo(() => {
    if (!searchTerm.trim()) {
      return routes;
    }
    const term = searchTerm.trim().toLowerCase();
    return routes.filter((route) => {
      const zoneName = route.zoneId?.name?.toLowerCase() ?? "";
      const teamName = route.teamId?.name?.toLowerCase() ?? "";
      return (
        route.name.toLowerCase().includes(term) ||
        route.description?.toLowerCase().includes(term) ||
        zoneName.includes(term) ||
        teamName.includes(term)
      );
    });
  }, [routes, searchTerm]);

  const handleRetry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["myRoutes"] });
    void refetchRoutes();
  }, [queryClient, refetchRoutes]);

  const formatDate = useCallback((value?: string) => {
    if (!value) return "Date not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Date not scheduled";
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const handlePreviewRoute = useCallback((route: AgentRoute) => {
    if (!route.routeDetails || !route.routeDetails.alternatives?.length) {
      Alert.alert(
        "No route details",
        "No route details available for this route."
      );
      return;
    }
    setSelectedRouteForPreview(route);
    setIsRoutePreviewVisible(true);
  }, []);

  const handlePreviewMap = useCallback((route: AgentRoute) => {
    if (!route.routeDetails || !route.routeDetails.alternatives?.length) {
      Alert.alert(
        "No route details",
        "No route details available for this route."
      );
      return;
    }
    setSelectedRouteForPreview(route);
    setIsRouteMapPreviewVisible(true);
  }, []);

  const handleEditRoute = useCallback((route: AgentRoute) => {
    console.log("[EditRoute] Loading route data:", route);

    // Reconstruct addresses from route data
    const addresses: string[] = [];

    // Add start location
    if (route.startLocation?.address) {
      addresses.push(route.startLocation.address);
    }

    // Add all stops (middle addresses)
    if (route.stops?.length > 0) {
      route.stops.forEach((stop) => {
        const address = stop.address || stop.notes || "";
        if (address && address.trim() && !addresses.includes(address)) {
          addresses.push(address);
        }
      });
    }

    // Add end location if different from start
    if (
      route.endLocation?.address &&
      route.endLocation.address !== route.startLocation?.address
    ) {
      addresses.push(route.endLocation.address);
    }

    // If no addresses found, use empty array with one empty string
    const finalAddresses = addresses.length > 0 ? addresses : [""];

    // Determine transportation mode (default to driving if not stored)
    // Note: Route model doesn't store mode, so we default to driving
    const mode: "driving" | "walking" | "bicycling" | "transit" = "driving";

    // Load optimization settings
    const optimization: PlannerOptimizationState = {
      fastestRoute: route.optimizationSettings?.optimizationType === "FASTEST",
      avoidFerries: route.optimizationSettings?.avoidFerries || false,
      avoidHighways: route.optimizationSettings?.avoidHighways || false,
      avoidTolls: route.optimizationSettings?.avoidTolls || false,
    };

    // Populate form fields
    setPlannerName(route.name || "");
    setPlannerDescription(route.description || "");
    setPlannerMode(mode);
    setPlannerAddresses(finalAddresses);
    setPlannerOptimization(optimization);

    // Set editing route
    setEditingRoute(route);

    // If route has routeDetails, we could display it on map
    // For now, just switch to planner view
    setViewMode("planner");

    // Scroll to top of planner (if needed)
    // The viewMode change will show the planner
  }, []);

  const handleDeleteRoute = useCallback(
    (route: AgentRoute) => {
      Alert.alert(
        "Delete Route",
        `Are you sure you want to delete "${route.name}"?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteRouteMutation.mutateAsync(route._id);
                // Route list will automatically refresh due to query invalidation
                // No need for success alert as the route will disappear from the list
              } catch (error) {
                Alert.alert(
                  "Error",
                  error instanceof Error
                    ? error.message
                    : "Failed to delete route"
                );
              }
            },
          },
        ]
      );
    },
    [deleteRouteMutation]
  );

  const renderStatusBadge = (status: RouteStatus) => {
    switch (status) {
      case "IN_PROGRESS":
        return {
          label: "In Progress",
          container: styles.statusBadgeInProgress,
          textColor: COLORS.white,
        };
      case "COMPLETED":
        return {
          label: "Completed",
          container: styles.statusBadgeCompleted,
          textColor: COLORS.white,
        };
      case "CANCELLED":
        return {
          label: "Cancelled",
          container: styles.statusBadgeCancelled,
          textColor: COLORS.error[700],
        };
      case "PLANNED":
        return {
          label: "Planned",
          container: styles.statusBadgePlanned,
          textColor: COLORS.primary[600],
        };
      default:
        return {
          label: status.replace("_", " ").toLowerCase(),
          container: styles.statusBadgeDefault,
          textColor: COLORS.text.secondary,
        };
    }
  };

  const previewMarkers = useMemo(() => {
    if (!selectedPreviewDetails) {
      return [] as {
        key: string;
        coordinate: { latitude: number; longitude: number };
        label: string;
        type: "start" | "stop" | "end";
        letter: string;
      }[];
    }
    const markers: {
      key: string;
      coordinate: { latitude: number; longitude: number };
      label: string;
      type: "start" | "stop" | "end";
      letter: string;
    }[] = [];
    const seen = new Set<string>();
    selectedPreviewDetails.legs.forEach((leg, index) => {
      if (leg.startLocation) {
        const coordKey = `${leg.startLocation[0]},${leg.startLocation[1]}`;
        if (!seen.has(coordKey)) {
          seen.add(coordKey);
          const letter = String.fromCharCode(65 + index); // A, B, C...
          markers.push({
            key: `leg-${index}-start`,
            coordinate: {
              latitude: leg.startLocation[1],
              longitude: leg.startLocation[0],
            },
            label: index === 0 ? "Start" : leg.startAddress,
            type: index === 0 ? "start" : "stop",
            letter: letter,
          });
        }
      }
      if (leg.endLocation) {
        const coordKey = `${leg.endLocation[0]},${leg.endLocation[1]}`;
        if (!seen.has(coordKey)) {
          seen.add(coordKey);
          const letter = String.fromCharCode(66 + index); // B, C, D...
          markers.push({
            key: `leg-${index}-end`,
            coordinate: {
              latitude: leg.endLocation[1],
              longitude: leg.endLocation[0],
            },
            label:
              index === selectedPreviewDetails.legs.length - 1
                ? "Destination"
                : leg.endAddress,
            type:
              index === selectedPreviewDetails.legs.length - 1 ? "end" : "stop",
            letter: letter,
          });
        }
      }
    });
    return markers;
  }, [selectedPreviewDetails]);

  const previewInitialRegion = useMemo(() => {
    if (plannerPreviewPolyline.length > 0) {
      const first = plannerPreviewPolyline[0];
      return {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
    return {
      latitude: 43.6532,
      longitude: -79.3832,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    };
  }, [plannerPreviewPolyline]);

  const previewMapPadding = useMemo(
    () => ({
      top: responsiveScale(60),
      right: responsiveScale(40),
      bottom: responsiveScale(160),
      left: responsiveScale(40),
    }),
    []
  );

  useEffect(() => {
    if (isPreviewMapVisible && plannerPreviewPolyline.length > 0) {
      const timeout = setTimeout(() => {
        previewMapRef.current?.fitToCoordinates(plannerPreviewPolyline, {
          edgePadding: previewMapPadding,
          animated: true,
        });
      }, 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [isPreviewMapVisible, plannerPreviewPolyline, previewMapPadding]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary[500]} />
        <Body2 color={COLORS.text.secondary}>Loading routes...</Body2>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Body3 color={COLORS.error[600]} style={styles.errorMessage}>
          We couldn&apos;t load your routes right now.
        </Body3>
        <Button
          title="Try Again"
          variant="outline"
          size="medium"
          onPress={handleRetry}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primary[500]}
      />
      <AppHeader
        title="My Routes"
        subtext="Review and manage your daily route plans"
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
        showBackButton={false}
        density="compact"
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[
              styles.viewToggleButton,
              viewMode === "routes" && styles.viewToggleActive,
            ]}
            onPress={() => setViewMode("routes")}
            activeOpacity={0.85}
          >
            <Body3
              color={
                viewMode === "routes" ? COLORS.white : COLORS.text.secondary
              }
              weight={viewMode === "routes" ? "semiBold" : "medium"}
            >
              My routes
            </Body3>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewToggleButton,
              viewMode === "planner" && styles.viewToggleActive,
            ]}
            onPress={() => setViewMode("planner")}
            activeOpacity={0.85}
          >
            <Body3
              color={
                viewMode === "planner" ? COLORS.white : COLORS.text.secondary
              }
              weight={viewMode === "planner" ? "semiBold" : "medium"}
            >
              Route planner
            </Body3>
          </TouchableOpacity>
        </View>

        {viewMode === "routes" ? (
          <>
            <Button
              title="Plan a route"
              size="small"
              onPress={() => setViewMode("planner")}
              containerStyle={StyleSheet.flatten([
                styles.planCta,
                styles.planPrimaryButton,
              ])}
              textStyle={styles.planPrimaryText}
            />

            <View style={styles.filterSection}>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search routes, zones, or teams"
                  placeholderTextColor={COLORS.text.light}
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {isFetching && (
              <View style={styles.fetchingIndicator}>
                <ActivityIndicator size="small" color={COLORS.primary[500]} />
                <Body3 color={COLORS.text.secondary}>Refreshing routes…</Body3>
              </View>
            )}

            {filteredRoutes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗺️</Text>
                <H3 style={styles.emptyTitle}>No routes to show</H3>
                <Body2
                  color={COLORS.text.secondary}
                  style={styles.emptyMessage}
                >
                  {searchTerm
                    ? "No routes match your current filters."
                    : "Once you have routes planned, they will appear here."}
                </Body2>
              </View>
            ) : (
              <View style={styles.routeList}>
                {filteredRoutes.map((route) => {
                  return (
                    <View key={route._id} style={styles.routeCard}>
                      <View style={styles.routeHeader}>
                        <View style={styles.routeHeaderTop}>
                          <Text weight="bold" style={styles.routeTitle}>
                            {route.name}
                          </Text>
                          <View style={styles.routeHeaderActions}>
                            <TouchableOpacity
                              onPress={() => handleEditRoute(route)}
                              style={styles.routeIconButtonEdit}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name="pencil"
                                size={responsiveScale(16)}
                                color={COLORS.primary[600]}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteRoute(route)}
                              style={styles.routeIconButtonDelete}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={responsiveScale(16)}
                                color={COLORS.error[600]}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.routeDateRow}>
                          <Ionicons
                            name="calendar-outline"
                            size={responsiveScale(14)}
                            color={COLORS.text.secondary}
                          />
                          <Body3
                            color={COLORS.text.secondary}
                            style={styles.routeDate}
                          >
                            {formatDate(route.date)}
                          </Body3>
                        </View>
                      </View>

                      {route.description ? (
                        <Body3
                          color={COLORS.text.secondary}
                          style={styles.routeDescription}
                        >
                          {route.description}
                        </Body3>
                      ) : null}

                      {/* Start and End Locations */}
                      <View style={styles.routeLocations}>
                        {route.startLocation?.address && (
                          <View style={styles.routeLocationRow}>
                            <Ionicons
                              name="location"
                              size={responsiveScale(16)}
                              color={COLORS.success[600]}
                              style={styles.routeLocationIcon}
                            />
                            <Body3
                              color={COLORS.text.primary}
                              style={styles.routeLocation}
                            >
                              <Text weight="semiBold">From: </Text>
                              {route.startLocation.address}
                            </Body3>
                          </View>
                        )}
                        {route.endLocation?.address && (
                          <View style={styles.routeLocationRow}>
                            <Ionicons
                              name="location"
                              size={responsiveScale(16)}
                              color={COLORS.error[600]}
                              style={styles.routeLocationIcon}
                            />
                            <Body3
                              color={COLORS.text.primary}
                              style={styles.routeLocation}
                            >
                              <Text weight="semiBold">To: </Text>
                              {route.endLocation.address}
                            </Body3>
                          </View>
                        )}
                      </View>

                      {/* Route Meta Info */}
                      <View style={styles.routeMetaRow}>
                        <Body3 color={COLORS.text.light}>
                          Stops:{" "}
                          {route.analytics?.totalStops || route.stops.length}
                        </Body3>
                        {(route.analytics?.totalStops || route.stops.length) >
                          1 && (
                          <>
                            <View style={styles.multiStopBadge}>
                              <Body3
                                color={COLORS.primary[600]}
                                weight="medium"
                              >
                                Multi-stop
                              </Body3>
                            </View>
                          </>
                        )}
                        {route.totalDistance > 0 && (
                          <>
                            <Body3 color={COLORS.text.light}>•</Body3>
                            <Body3 color={COLORS.text.light}>
                              {route.totalDistance.toFixed(1)} mi
                            </Body3>
                          </>
                        )}
                        {route.totalDuration > 0 && (
                          <>
                            <Body3 color={COLORS.text.light}>•</Body3>
                            <Body3 color={COLORS.text.light}>
                              {Math.round(route.totalDuration)} min
                            </Body3>
                          </>
                        )}
                      </View>

                      {/* Analytics Section */}
                      {route.analytics && route.analytics.totalDistance > 0 && (
                        <View style={styles.analyticsBox}>
                          <View style={styles.analyticsGrid}>
                            <View style={styles.analyticsItem}>
                              <Body3
                                color={COLORS.text.primary}
                                weight="semiBold"
                              >
                                Distance:
                              </Body3>
                              <Text
                                weight="semiBold"
                                color={COLORS.text.primary}
                              >
                                {route.analytics.totalDistance.toFixed(1)} mi
                              </Text>
                            </View>
                            <View style={styles.analyticsItem}>
                              <Body3
                                color={COLORS.text.primary}
                                weight="semiBold"
                              >
                                Duration:
                              </Body3>
                              <Text
                                weight="semiBold"
                                color={COLORS.text.primary}
                              >
                                {Math.round(route.analytics.estimatedDuration)}{" "}
                                min
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}

                      {/* Optimization Settings Badges */}
                      {route.optimizationSettings && (
                        <View style={styles.optimizationBadges}>
                          {route.optimizationSettings.optimizationType ===
                            "FASTEST" && (
                            <View style={styles.optBadgeFastest}>
                              <Body3
                                color={COLORS.primary[600]}
                                weight="medium"
                              >
                                Fastest Route
                              </Body3>
                            </View>
                          )}
                          {route.optimizationSettings.avoidFerries && (
                            <View style={styles.optBadgeAvoid}>
                              <Body3
                                color={COLORS.success[600]}
                                weight="medium"
                              >
                                Avoid Ferries
                              </Body3>
                            </View>
                          )}
                          {route.optimizationSettings.avoidHighways && (
                            <View style={styles.optBadgeWarning}>
                              <Body3
                                color={COLORS.warning[600]}
                                weight="medium"
                              >
                                Avoid Highways
                              </Body3>
                            </View>
                          )}
                          {route.optimizationSettings.avoidTolls && (
                            <View style={styles.optBadgeError}>
                              <Body3 color={COLORS.error[600]} weight="medium">
                                Avoid Tolls
                              </Body3>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Action Buttons */}
                      <View style={styles.routeActions}>
                        <Button
                          title="Preview Route"
                          variant="outline"
                          size="small"
                          onPress={() => handlePreviewRoute(route)}
                          containerStyle={styles.routeActionButton}
                        />
                        <Button
                          title="Preview Map"
                          variant="outline"
                          size="small"
                          onPress={() => handlePreviewMap(route)}
                          containerStyle={styles.routeActionButton}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.plannerAvoiding}
            keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
          >
            <View style={styles.plannerIntro}>
              <H3 style={styles.plannerTitle}>
                {editingRoute
                  ? `Edit Route: ${editingRoute.name}`
                  : "Create new route"}
              </H3>
              <Body3 color={COLORS.text.secondary} align="center">
                {editingRoute
                  ? "Modify route details, addresses, and preferences."
                  : "Enter stops, tweak preferences, and preview the trip before saving."}
              </Body3>
            </View>
            <View style={styles.plannerCard}>
              <View style={styles.formColumn}>
                <Body3 color={COLORS.text.secondary} style={styles.inputLabel}>
                  Route name
                </Body3>
                <TextInput
                  value={plannerName}
                  onChangeText={setPlannerName}
                  placeholder="Enter route name"
                  placeholderTextColor={COLORS.text.light}
                  style={styles.textInput}
                />
              </View>

              <View style={styles.formColumn}>
                <Body3 color={COLORS.text.secondary} style={styles.inputLabel}>
                  Description (optional)
                </Body3>
                <TextInput
                  value={plannerDescription}
                  onChangeText={setPlannerDescription}
                  placeholder="Add internal notes for this route"
                  placeholderTextColor={COLORS.text.light}
                  style={[styles.textInput, styles.multilineInput]}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.sectionHeader}>
                <Body1
                  weight="semiBold"
                  style={styles.sectionTitleUpper}
                  color={COLORS.text.primary}
                >
                  Route addresses
                </Body1>
                <Body3 color={COLORS.text.secondary}>
                  Add at least two stops. Drag controls match Start (S) and End
                  (E) points.
                </Body3>
              </View>

              <View style={styles.addressToolbar}>
                <Button
                  title="Add address"
                  variant="outline"
                  size="small"
                  onPress={handleAddAddress}
                />
                <Button
                  title="Bulk import"
                  variant="outline"
                  size="small"
                  onPress={() => setBulkImportVisible(true)}
                />
                {plannerAddresses.length > 1 && (
                  <Button
                    title="Clear all"
                    variant="outline"
                    size="small"
                    onPress={handleClearAddresses}
                  />
                )}
              </View>

              <View style={styles.addressList}>
                {plannerAddresses.length === 0 && (
                  <View style={styles.addressEmpty}>
                    <Text>
                      Tap &ldquo;Add address&rdquo; to begin building this
                      route.
                    </Text>
                  </View>
                )}

                {plannerAddresses.map((address, index) => {
                  const isFirst = index === 0;
                  const isLast = index === plannerAddresses.length - 1;
                  const badgeStyle = isFirst
                    ? styles.addressBadgeStart
                    : isLast
                    ? styles.addressBadgeEnd
                    : styles.addressBadge;
                  const badgeLabel = isFirst
                    ? "S"
                    : isLast
                    ? "E"
                    : String(index);

                  const isFetchingLocation =
                    plannerFetchingLocationIndex === index;

                  return (
                    <View key={`address-${index}`} style={styles.addressRow}>
                      <View style={badgeStyle}>
                        <Text style={styles.addressBadgeText}>
                          {badgeLabel}
                        </Text>
                      </View>
                      <View style={styles.addressContent}>
                        <TextInput
                          value={address}
                          onChangeText={(value) =>
                            handleUpdateAddress(index, value)
                          }
                          placeholder={`Stop ${index + 1} address`}
                          placeholderTextColor={COLORS.text.light}
                          style={styles.addressInput}
                          multiline
                        />
                        <View style={styles.addressActionRow}>
                          <TouchableOpacity
                            style={styles.addressActionButton}
                            onPress={() => handleUseCurrentLocation(index)}
                            disabled={isFetchingLocation}
                          >
                            <Body3 color={COLORS.primary[600]} weight="medium">
                              {isFetchingLocation
                                ? "Locating..."
                                : "Use current location"}
                            </Body3>
                          </TouchableOpacity>
                          <View style={styles.addressReorderGroup}>
                            <TouchableOpacity
                              style={styles.addressReorderButton}
                              onPress={() => handleMoveAddress(index, "up")}
                              disabled={isFirst}
                            >
                              <Text style={styles.addressReorderText}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.addressReorderButton}
                              onPress={() => handleMoveAddress(index, "down")}
                              disabled={isLast}
                            >
                              <Text style={styles.addressReorderText}>↓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.addressRemoveButton}
                              onPress={() => handleRemoveAddress(index)}
                              disabled={plannerAddresses.length === 1}
                            >
                              <Text style={styles.addressReorderText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.transportSection}>
                <Body1
                  weight="semiBold"
                  style={styles.sectionTitleUpper}
                  color={COLORS.text.primary}
                >
                  Transportation mode
                </Body1>
                <View style={styles.modeOptionsGrid}>
                  {[
                    { key: "driving", label: "Driving", icon: "🚗" },
                    { key: "walking", label: "Walking", icon: "🚶" },
                    { key: "bicycling", label: "Biking", icon: "🚴" },
                    { key: "transit", label: "Transit", icon: "🚌" },
                  ].map(({ key, label, icon }) => {
                    const isActive = plannerMode === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.modeOption,
                          isActive && styles.modeOptionActive,
                        ]}
                        onPress={() =>
                          setPlannerMode(key as typeof plannerMode)
                        }
                        activeOpacity={0.85}
                      >
                        <Text style={styles.modeOptionIcon}>{icon}</Text>
                        <Body3
                          color={
                            isActive ? COLORS.white : COLORS.text.secondary
                          }
                          weight={isActive ? "semiBold" : "regular"}
                        >
                          {label}
                        </Body3>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Body1
                  weight="semiBold"
                  style={styles.sectionTitleUpper}
                  color={COLORS.text.primary}
                >
                  Optimization preferences
                </Body1>
                <Body3 color={COLORS.text.secondary}>
                  Adjust how the route should be optimized.
                </Body3>
              </View>

              <View style={styles.optimizationList}>
                {plannerOptimizationEntries.map((entry) => (
                  <View key={entry.key} style={styles.optimizationRow}>
                    <Body3 color={COLORS.text.secondary}>{entry.label}</Body3>
                    <Switch
                      value={plannerOptimization[entry.key]}
                      onValueChange={() => handleToggleOptimization(entry.key)}
                      thumbColor={COLORS.white}
                      trackColor={{
                        false: COLORS.neutral[300],
                        true: COLORS.primary[500],
                      }}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.plannerActionsGroup}>
                <View style={styles.plannerActionsRow}>
                  <View style={styles.plannerActionColumn}>
                    <Button
                      title="Preview Route"
                      variant="outline"
                      size="medium"
                      onPress={handleCalculateRoute}
                      disabled={
                        !plannerCanCalculate || plannerIsCalculatingRoute
                      }
                      loading={plannerIsCalculatingRoute}
                      leftIcon={
                        !plannerIsCalculatingRoute ? (
                          <Ionicons
                            name="navigate-outline"
                            size={responsiveScale(16)}
                            color={previewButtonIconColor}
                          />
                        ) : undefined
                      }
                      fullWidth
                      containerStyle={styles.previewActionButton}
                      textStyle={{ color: previewButtonIconColor }}
                    />
                  </View>
                  <View style={styles.plannerActionColumn}>
                    <Button
                      title={editingRoute ? "Update Route" : "Save Route"}
                      size="medium"
                      onPress={handleSaveRoute}
                      disabled={
                        plannerAlternatives.length === 0 ||
                        createRouteMutation.isPending ||
                        updateRouteMutation.isPending ||
                        plannerIsCalculatingRoute
                      }
                      loading={
                        createRouteMutation.isPending ||
                        updateRouteMutation.isPending
                      }
                      fullWidth
                      containerStyle={styles.saveActionButton}
                    />
                  </View>
                </View>
                <Button
                  title="See preview map"
                  variant="outline"
                  size="medium"
                  onPress={() => setIsPreviewMapVisible(true)}
                  disabled={plannerPreviewPolyline.length === 0}
                  fullWidth
                  containerStyle={styles.previewActionStandalone}
                />
                <Button
                  title={editingRoute ? "Cancel Edit" : "Clear"}
                  variant="outline"
                  size="medium"
                  onPress={() => {
                    resetPlanner();
                    if (editingRoute) {
                      setViewMode("routes");
                    }
                  }}
                  fullWidth
                  containerStyle={styles.clearActionButton}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </ScrollView>
      <Modal
        visible={bulkImportVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseBulkImport}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleCloseBulkImport}
          />
          <View style={styles.modalCard}>
            <H3 style={styles.modalTitle}>Bulk import stops</H3>
            <Body3 color={COLORS.text.secondary} style={styles.modalSubtitle}>
              Paste one address per line. Maximum of {MAX_BULK_ADDRESSES} stops.
            </Body3>
            <TextInput
              value={bulkImportText}
              onChangeText={setBulkImportText}
              placeholder="123 Main St, Toronto, ON&#10;456 Queen St W, Toronto, ON"
              placeholderTextColor={COLORS.text.light}
              style={styles.modalTextArea}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                size="small"
                onPress={handleCloseBulkImport}
              />
              <Button
                title="Import"
                size="small"
                onPress={handleApplyBulkImport}
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={isPreviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPreviewVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsPreviewVisible(false)}
          />
          <View
            style={[
              styles.previewModalContainer,
              { paddingTop: previewTopOffset },
            ]}
          >
            <View style={styles.previewModalCard}>
              <View style={styles.previewHeader}>
                <H3 style={styles.modalTitle}>Route preview</H3>
                <Button
                  title="Close"
                  variant="ghost"
                  size="small"
                  onPress={() => setIsPreviewVisible(false)}
                />
              </View>
              <Body3 color={COLORS.text.secondary}>
                Review route options, stats, and step-by-step directions.
              </Body3>
            </View>
            {selectedPreviewDetails ? (
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={styles.previewScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.previewSection}>
                  <Body1
                    weight="semiBold"
                    style={styles.previewSectionTitle}
                    color={COLORS.text.primary}
                  >
                    Route details
                  </Body1>
                  <Body3 color={COLORS.text.secondary}>
                    Tap a route to view detailed directions and stats.
                  </Body3>
                  <View style={styles.previewOptionsList}>
                    {plannerRouteDetails?.alternatives.map(
                      (alternative, index) => {
                        const isActive =
                          index === plannerSelectedAlternativeIndex;
                        return (
                          <TouchableOpacity
                            key={alternative.summary ?? `alt-${index}`}
                            style={[
                              styles.previewOptionCard,
                              isActive && styles.previewOptionCardActive,
                            ]}
                            onPress={() => handleSelectAlternative(index)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.previewOptionHeader}>
                              <Body3
                                weight="semiBold"
                                style={
                                  isActive
                                    ? styles.previewOptionTitleActive
                                    : styles.previewOptionTitle
                                }
                                numberOfLines={1}
                              >
                                {alternative.summary || `Route ${index + 1}`}
                              </Body3>
                              <Body3
                                style={
                                  isActive
                                    ? styles.previewOptionDurationActive
                                    : styles.previewOptionDuration
                                }
                              >
                                {alternative.durationText ||
                                  formatDurationForSummary(
                                    alternative.duration
                                  )}
                              </Body3>
                            </View>
                            <View style={styles.previewOptionMeta}>
                              <Body3
                                style={
                                  isActive
                                    ? styles.previewOptionMetaTextActive
                                    : styles.previewOptionMetaText
                                }
                              >
                                {alternative.distanceRoundedText ||
                                  formatDistanceRounded(alternative.distance)}
                              </Body3>
                              <Body3
                                style={
                                  isActive
                                    ? styles.previewOptionMetaTextActive
                                    : styles.previewOptionMetaText
                                }
                              >
                                {alternative.distanceDetailedText ||
                                  formatDistanceDetailed(alternative.distance)}
                              </Body3>
                            </View>
                            <Body3
                              style={
                                isActive
                                  ? styles.previewOptionTrafficActive
                                  : styles.previewOptionTraffic
                              }
                            >
                              {index === 0
                                ? "Best route now due to traffic conditions"
                                : "Alternative route"}
                            </Body3>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </View>

                <View style={styles.previewSection}>
                  <Body1
                    weight="semiBold"
                    style={styles.previewSectionTitle}
                    color={COLORS.text.primary}
                  >
                    Detailed directions
                  </Body1>
                  <Body3 color={COLORS.text.secondary}>
                    Step-by-step guidance for each leg of the trip.
                  </Body3>
                  {selectedPreviewDetails.legs.length > 0 && (
                    <View style={styles.previewLocationsGroup}>
                      <LinearGradient
                        colors={["#10b981", "#059669"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.previewLocationCard}
                      >
                        <View style={styles.previewLocationCardContent}>
                          <View style={styles.previewLetterBadgeLarge}>
                            <Body3
                              weight="bold"
                              style={[
                                styles.previewLetterBadgeTextLarge,
                                { color: getLetterColor("A") },
                              ]}
                            >
                              A
                            </Body3>
                          </View>
                          <Body3 style={styles.previewLocationAddressStart}>
                          {selectedPreviewDetails.legs[0]?.startAddress}
                        </Body3>
                      </View>
                      </LinearGradient>
                      <LinearGradient
                        colors={["#f59e0b", "#d97706"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.previewLocationCard}
                      >
                        <View style={styles.previewLocationCardContent}>
                          <View style={styles.previewLetterBadgeLarge}>
                            <Body3
                              weight="bold"
                              style={[
                                styles.previewLetterBadgeTextLarge,
                                {
                                  color: getLetterColor(
                                    String.fromCharCode(65 + selectedPreviewDetails.legs.length)
                                  ),
                                },
                              ]}
                            >
                              {String.fromCharCode(65 + selectedPreviewDetails.legs.length)}
                        </Body3>
                          </View>
                          <Body3 style={styles.previewLocationAddressDestination}>
                          {
                            selectedPreviewDetails.legs[
                              selectedPreviewDetails.legs.length - 1
                            ]?.endAddress
                          }
                        </Body3>
                      </View>
                      </LinearGradient>
                    </View>
                  )}
                  <View style={styles.previewSummaryGrid}>
                    <View style={styles.previewSummaryItem}>
                      <Body3 style={styles.previewSummaryLabel}>Route:</Body3>
                      <Body3 style={styles.previewSummaryValue}>
                        {selectedPreviewDetails.summary ||
                          selectedPreviewOption?.summary ||
                          "Route"}
                      </Body3>
                    </View>
                    <View style={styles.previewSummaryItem}>
                      <Body3 style={styles.previewSummaryLabel}>
                        Condition:
                      </Body3>
                      <Body3 style={styles.previewSummaryValue}>
                        {selectedPreviewDetails.trafficCondition}
                      </Body3>
                    </View>
                    <View style={styles.previewSummaryItem}>
                      <Body3 style={styles.previewSummaryLabel}>
                        Distance:
                      </Body3>
                      <Body3 style={styles.previewSummaryValue}>
                        {selectedPreviewDetails.distanceDetailedText ||
                          formatDistanceDetailed(
                            selectedPreviewDetails.distance
                          )}
                      </Body3>
                    </View>
                    <View style={styles.previewSummaryItem}>
                      <Body3 style={styles.previewSummaryLabel}>
                        Duration:
                      </Body3>
                      <Body3 style={styles.previewSummaryValue}>
                        {selectedPreviewDetails.durationText ||
                          formatDurationForSummary(
                            selectedPreviewDetails.duration
                          )}
                      </Body3>
                    </View>
                  </View>
                  {selectedPreviewDetails.legs.map((leg, legIndex) => {
                    const legDistanceText =
                      leg.distanceText ||
                      formatDistanceDetailed(metersToKilometers(leg.distance));
                    const legDurationText =
                      leg.durationText ||
                      formatDurationFromSeconds(leg.duration);
                    // Convert index to alphabetical label (0 -> A, 1 -> B, etc.)
                    const startLetter = String.fromCharCode(65 + legIndex); // A, B, C...
                    const endLetter = String.fromCharCode(66 + legIndex); // B, C, D...
                    return (
                      <View key={`leg-${legIndex}`} style={styles.previewLeg}>
                        <View style={styles.previewLegHeader}>
                          <View style={styles.previewLegRoute}>
                            <View style={styles.previewLegLocationBlock}>
                              <View
                                style={[
                                  styles.previewLetterBadge,
                                  { backgroundColor: getLetterColor(startLetter) },
                                ]}
                              >
                                <Body3
                                  weight="bold"
                                  style={styles.previewLetterBadgeText}
                                >
                                  {startLetter}
                              </Body3>
                              </View>
                              <Body3
                                style={styles.previewLegLocationText}
                                numberOfLines={2}
                              >
                                {leg.startAddress}
                              </Body3>
                            </View>
                            <Body3 style={styles.previewLegArrow}>→</Body3>
                            <View style={styles.previewLegLocationBlock}>
                              <View
                                style={[
                                  styles.previewLetterBadge,
                                  { backgroundColor: getLetterColor(endLetter) },
                                ]}
                              >
                                <Body3
                                  weight="bold"
                                  style={styles.previewLetterBadgeText}
                                >
                                  {endLetter}
                              </Body3>
                              </View>
                              <Body3
                                style={styles.previewLegLocationText}
                                numberOfLines={2}
                              >
                                {leg.endAddress}
                              </Body3>
                            </View>
                          </View>
                          <View style={styles.previewLegChipRow}>
                            <Body3 style={styles.previewLegChipText}>
                              {legDurationText} • {legDistanceText}
                            </Body3>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.previewEmpty}>
                <Body1 weight="semiBold" color={COLORS.text.primary}>
                  No route preview yet
                </Body1>
                <Body3 color={COLORS.text.secondary}>
                  Calculate a route to view the live preview.
                </Body3>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={isPreviewMapVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPreviewMapVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsPreviewMapVisible(false)}
          />
          <View
            style={[
              styles.previewModalContainer,
              { paddingTop: previewTopOffset },
            ]}
          >
            <View style={styles.previewMapSheet}>
              <View style={styles.previewMapHeader}>
                <View style={styles.previewHeader}>
                  <H3 style={styles.modalTitle}>Map preview</H3>
                  <Button
                    title="Close"
                    variant="ghost"
                    size="small"
                    onPress={() => setIsPreviewMapVisible(false)}
                  />
                </View>
                <Body3 color={COLORS.text.secondary}>
                  Live Google Map with the selected route and stop markers.
                </Body3>
              </View>
              {selectedPreviewDetails && plannerPreviewPolyline.length > 0 && (
                <View style={styles.mapLegendContainer}>
                  <View style={styles.mapLegendItem}>
                    <View
                      style={[
                        styles.mapLegendBadge,
                        { backgroundColor: COLORS.success[600] },
                      ]}
                    >
                      <Body3
                        weight="bold"
                        style={styles.mapLegendBadgeText}
                      >
                        A
                      </Body3>
                    </View>
                    <Body3 style={styles.mapLegendLabel}>Start</Body3>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View
                      style={[
                        styles.mapLegendBadge,
                        {
                          backgroundColor: COLORS.error[500],
                        },
                      ]}
                    >
                      <Body3
                        weight="bold"
                        style={styles.mapLegendBadgeText}
                      >
                        {String.fromCharCode(65 + selectedPreviewDetails.legs.length)}
                      </Body3>
                    </View>
                    <Body3 style={styles.mapLegendLabel}>Destination</Body3>
                  </View>
                </View>
              )}
              {selectedPreviewDetails && plannerPreviewPolyline.length > 0 ? (
                <View style={styles.previewMapContainer}>
                  <MapView
                    ref={previewMapRef}
                    style={styles.previewMap}
                    initialRegion={previewInitialRegion}
                    provider={PROVIDER_GOOGLE}
                  >
                    <Polyline
                      coordinates={plannerPreviewPolyline}
                      strokeColor={COLORS.primary[600]}
                      strokeWidth={4}
                    />
                    {previewMarkers.map((marker) => (
                      <Marker
                        key={marker.key}
                        coordinate={marker.coordinate}
                        title={marker.label}
                      >
                        <View
                          style={[
                            styles.mapMarkerBadge,
                            {
                              backgroundColor:
                          marker.type === "start"
                            ? COLORS.success[600]
                            : marker.type === "end"
                            ? COLORS.error[500]
                                  : getLetterColor(marker.letter),
                            },
                          ]}
                        >
                          <Body3
                            weight="bold"
                            style={styles.mapMarkerBadgeText}
                          >
                            {marker.letter}
                          </Body3>
                        </View>
                      </Marker>
                    ))}
                  </MapView>
                </View>
              ) : (
                <View style={styles.previewEmpty}>
                  <Body1 weight="semiBold" color={COLORS.text.primary}>
                    No map preview yet
                  </Body1>
                  <Body3 color={COLORS.text.secondary}>
                    Calculate a route to view the map preview.
                  </Body3>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* Saved Route Preview Modal */}
      <Modal
        visible={isRoutePreviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsRoutePreviewVisible(false);
          setSelectedRouteForPreview(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsRoutePreviewVisible(false);
              setSelectedRouteForPreview(null);
            }}
          />
          <View
            style={[
              styles.previewModalContainer,
              { paddingTop: previewTopOffset },
            ]}
          >
            <View style={styles.previewModalCard}>
              <View style={styles.previewHeader}>
                <H3 style={styles.modalTitle}>
                  {selectedRouteForPreview?.name || "Route preview"}
                </H3>
                <Button
                  title="Close"
                  variant="ghost"
                  size="small"
                  onPress={() => {
                    setIsRoutePreviewVisible(false);
                    setSelectedRouteForPreview(null);
                  }}
                />
              </View>
              <Body3 color={COLORS.text.secondary}>
                Review route options, stats, and step-by-step directions.
              </Body3>
            </View>
            {selectedRouteForPreview?.routeDetails?.alternatives?.[0] ? (
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={styles.previewScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {(() => {
                  const routeDetails = selectedRouteForPreview.routeDetails!;
                  const selectedAlt =
                    routeDetails.alternatives[
                      routeDetails.selectedAlternativeIndex || 0
                    ];
                  return (
                    <>
                      <View style={styles.previewSection}>
                        <Body1
                          weight="semiBold"
                          style={styles.previewSectionTitle}
                          color={COLORS.text.primary}
                        >
                          Route details
                        </Body1>
                        <View style={styles.previewSummaryGrid}>
                          <View style={styles.previewSummaryItem}>
                            <Body3 style={styles.previewSummaryLabel}>
                              Route:
                            </Body3>
                            <Body3 style={styles.previewSummaryValue}>
                              {selectedAlt.summary || "Route"}
                            </Body3>
                          </View>
                          <View style={styles.previewSummaryItem}>
                            <Body3 style={styles.previewSummaryLabel}>
                              Distance:
                            </Body3>
                            <Body3 style={styles.previewSummaryValue}>
                              {selectedAlt.distanceDetailedText ||
                                formatDistanceDetailed(selectedAlt.distance)}
                            </Body3>
                          </View>
                          <View style={styles.previewSummaryItem}>
                            <Body3 style={styles.previewSummaryLabel}>
                              Duration:
                            </Body3>
                            <Body3 style={styles.previewSummaryValue}>
                              {selectedAlt.durationText ||
                                formatDurationForSummary(selectedAlt.duration)}
                            </Body3>
                          </View>
                        </View>
                      </View>
                      <View style={styles.previewSection}>
                        <Body1
                          weight="semiBold"
                          style={styles.previewSectionTitle}
                          color={COLORS.text.primary}
                        >
                          Detailed directions
                        </Body1>
                        {selectedAlt.legs.length > 0 && (
                          <View style={styles.previewLocationsGroup}>
                            <LinearGradient
                              colors={["#10b981", "#059669"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.previewLocationCard}
                            >
                              <View style={styles.previewLocationCardContent}>
                                <View style={styles.previewLetterBadgeLarge}>
                                  <Body3
                                    weight="bold"
                                    style={[
                                      styles.previewLetterBadgeTextLarge,
                                      { color: getLetterColor("A") },
                                    ]}
                                  >
                                    A
                              </Body3>
                                </View>
                                <Body3 style={styles.previewLocationAddressStart}>
                                {selectedAlt.legs[0]?.startAddress}
                              </Body3>
                            </View>
                            </LinearGradient>
                            <LinearGradient
                              colors={["#f59e0b", "#d97706"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.previewLocationCard}
                            >
                              <View style={styles.previewLocationCardContent}>
                                <View style={styles.previewLetterBadgeLarge}>
                                  <Body3
                                    weight="bold"
                                    style={[
                                      styles.previewLetterBadgeTextLarge,
                                      {
                                        color: getLetterColor(
                                          String.fromCharCode(65 + selectedAlt.legs.length)
                                        ),
                                      },
                                    ]}
                                  >
                                    {String.fromCharCode(65 + selectedAlt.legs.length)}
                              </Body3>
                                </View>
                                <Body3
                                  style={styles.previewLocationAddressDestination}
                                >
                                {
                                  selectedAlt.legs[selectedAlt.legs.length - 1]
                                    ?.endAddress
                                }
                              </Body3>
                            </View>
                            </LinearGradient>
                          </View>
                        )}
                        {selectedAlt.legs.map((leg, legIndex) => {
                          const legDistanceText =
                            leg.distanceText ||
                            formatDistanceDetailed(
                              metersToKilometers(leg.distance)
                            );
                          const legDurationText =
                            leg.durationText ||
                            formatDurationFromSeconds(leg.duration);
                          // Convert index to alphabetical label (0 -> A, 1 -> B, etc.)
                          const startLetter = String.fromCharCode(65 + legIndex); // A, B, C...
                          const endLetter = String.fromCharCode(66 + legIndex); // B, C, D...
                          return (
                            <View
                              key={`leg-${legIndex}`}
                              style={styles.previewLeg}
                            >
                              <View style={styles.previewLegHeader}>
                                <View style={styles.previewLegRoute}>
                                  <View style={styles.previewLegLocationBlock}>
                                    <View
                                      style={[
                                        styles.previewLetterBadge,
                                        { backgroundColor: getLetterColor(startLetter) },
                                      ]}
                                    >
                                    <Body3
                                        weight="bold"
                                        style={styles.previewLetterBadgeText}
                                    >
                                        {startLetter}
                                    </Body3>
                                    </View>
                                    <Body3
                                      style={styles.previewLegLocationText}
                                      numberOfLines={2}
                                    >
                                      {leg.startAddress}
                                    </Body3>
                                  </View>
                                  <Body3 style={styles.previewLegArrow}>
                                    →
                                  </Body3>
                                  <View style={styles.previewLegLocationBlock}>
                                    <View
                                      style={[
                                        styles.previewLetterBadge,
                                        { backgroundColor: getLetterColor(endLetter) },
                                      ]}
                                    >
                                    <Body3
                                        weight="bold"
                                        style={styles.previewLetterBadgeText}
                                    >
                                        {endLetter}
                                    </Body3>
                                    </View>
                                    <Body3
                                      style={styles.previewLegLocationText}
                                      numberOfLines={2}
                                    >
                                      {leg.endAddress}
                                    </Body3>
                                  </View>
                                </View>
                                <View style={styles.previewLegChipRow}>
                                  <Body3 style={styles.previewLegChipText}>
                                    {legDurationText} • {legDistanceText}
                                  </Body3>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
            ) : (
              <View style={styles.previewEmpty}>
                <Body1 weight="semiBold" color={COLORS.text.primary}>
                  No route details available
                </Body1>
                <Body3 color={COLORS.text.secondary}>
                  This route does not have detailed directions.
                </Body3>
              </View>
            )}
          </View>
        </View>
      </Modal>
      {/* Saved Route Map Preview Modal */}
      <Modal
        visible={isRouteMapPreviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsRouteMapPreviewVisible(false);
          setSelectedRouteForPreview(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsRouteMapPreviewVisible(false);
              setSelectedRouteForPreview(null);
            }}
          />
          <View
            style={[
              styles.previewModalContainer,
              { paddingTop: previewTopOffset },
            ]}
          >
            <View style={styles.previewMapSheet}>
              <View style={styles.previewMapHeader}>
                <View style={styles.previewHeader}>
                  <H3 style={styles.modalTitle}>
                    {selectedRouteForPreview?.name || "Map preview"}
                  </H3>
                  <Button
                    title="Close"
                    variant="ghost"
                    size="small"
                    onPress={() => {
                      setIsRouteMapPreviewVisible(false);
                      setSelectedRouteForPreview(null);
                    }}
                  />
                </View>
                <Body3 color={COLORS.text.secondary}>
                  Live Google Map with the selected route and stop markers.
                </Body3>
              </View>
              {selectedRouteForPreview?.routeDetails?.alternatives?.[0] && (
                <View style={styles.mapLegendContainer}>
                  <View style={styles.mapLegendItem}>
                    <View
                      style={[
                        styles.mapLegendBadge,
                        { backgroundColor: COLORS.success[600] },
                      ]}
                    >
                      <Body3
                        weight="bold"
                        style={styles.mapLegendBadgeText}
                      >
                        A
                      </Body3>
                    </View>
                    <Body3 style={styles.mapLegendLabel}>Start</Body3>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View
                      style={[
                        styles.mapLegendBadge,
                        {
                          backgroundColor: COLORS.error[500],
                        },
                      ]}
                    >
                      <Body3
                        weight="bold"
                        style={styles.mapLegendBadgeText}
                      >
                        {String.fromCharCode(
                          65 +
                            (selectedRouteForPreview.routeDetails.alternatives[
                              selectedRouteForPreview.routeDetails
                                .selectedAlternativeIndex || 0
                            ]?.legs?.length || 0)
                        )}
                      </Body3>
                    </View>
                    <Body3 style={styles.mapLegendLabel}>Destination</Body3>
                  </View>
                </View>
              )}
              {selectedRouteForPreview?.routeDetails?.alternatives?.[0] ? (
                <View style={styles.previewMapContainer}>
                  <MapView
                    style={styles.previewMap}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={
                      selectedRouteForPreview.routeDetails.bounds
                        ? {
                            latitude:
                              (selectedRouteForPreview.routeDetails.bounds
                                .northeast[1] +
                                selectedRouteForPreview.routeDetails.bounds
                                  .southwest[1]) /
                              2,
                            longitude:
                              (selectedRouteForPreview.routeDetails.bounds
                                .northeast[0] +
                                selectedRouteForPreview.routeDetails.bounds
                                  .southwest[0]) /
                              2,
                            latitudeDelta:
                              Math.abs(
                                selectedRouteForPreview.routeDetails.bounds
                                  .northeast[1] -
                                  selectedRouteForPreview.routeDetails.bounds
                                    .southwest[1]
                              ) * 1.5,
                            longitudeDelta:
                              Math.abs(
                                selectedRouteForPreview.routeDetails.bounds
                                  .northeast[0] -
                                  selectedRouteForPreview.routeDetails.bounds
                                    .southwest[0]
                              ) * 1.5,
                          }
                        : undefined
                    }
                  >
                    {selectedRouteForPreview.routeDetails.alternatives[
                      selectedRouteForPreview.routeDetails
                        .selectedAlternativeIndex || 0
                    ].legs.map((leg, legIndex) => {
                      // Create polyline from step coordinates
                      const coordinates: {
                        latitude: number;
                        longitude: number;
                      }[] = [];
                      leg.steps.forEach((step) => {
                        coordinates.push({
                          latitude: step.startLocation[1],
                          longitude: step.startLocation[0],
                        });
                        coordinates.push({
                          latitude: step.endLocation[1],
                          longitude: step.endLocation[0],
                        });
                      });
                      if (coordinates.length > 0) {
                        return (
                          <Polyline
                            key={`polyline-${legIndex}`}
                            coordinates={coordinates}
                            strokeColor={COLORS.primary[600]}
                            strokeWidth={4}
                          />
                        );
                      }
                      return null;
                    })}
                    {selectedRouteForPreview.routeDetails.alternatives[
                      selectedRouteForPreview.routeDetails
                        .selectedAlternativeIndex || 0
                    ].legs.map((leg, legIndex) => {
                      const markers = [];
                      const startLetter = String.fromCharCode(65 + legIndex); // A, B, C...
                      const endLetter = String.fromCharCode(66 + legIndex); // B, C, D...
                      const totalLegs =
                        selectedRouteForPreview.routeDetails!.alternatives[
                          selectedRouteForPreview.routeDetails!
                            .selectedAlternativeIndex || 0
                        ].legs.length;

                      if (legIndex === 0) {
                        markers.push(
                          <Marker
                            key={`start-${legIndex}`}
                            coordinate={{
                              latitude: leg.startLocation[1],
                              longitude: leg.startLocation[0],
                            }}
                            title="Start"
                          >
                            <View
                              style={[
                                styles.mapMarkerBadge,
                                { backgroundColor: COLORS.success[600] },
                              ]}
                            >
                              <Body3
                                weight="bold"
                                style={styles.mapMarkerBadgeText}
                              >
                                {startLetter}
                              </Body3>
                            </View>
                          </Marker>
                        );
                      }
                      markers.push(
                        <Marker
                          key={`end-${legIndex}`}
                          coordinate={{
                            latitude: leg.endLocation[1],
                            longitude: leg.endLocation[0],
                          }}
                          title={leg.endAddress}
                        >
                          <View
                            style={[
                              styles.mapMarkerBadge,
                              {
                                backgroundColor:
                                  legIndex === totalLegs - 1
                              ? COLORS.error[500]
                                    : getLetterColor(endLetter),
                              },
                            ]}
                          >
                            <Body3
                              weight="bold"
                              style={styles.mapMarkerBadgeText}
                            >
                              {endLetter}
                            </Body3>
                          </View>
                        </Marker>
                      );
                      return markers;
                    })}
                  </MapView>
                </View>
              ) : (
                <View style={styles.previewEmpty}>
                  <Body1 weight="semiBold" color={COLORS.text.primary}>
                    No map preview available
                  </Body1>
                  <Body3 color={COLORS.text.secondary}>
                    This route does not have map data.
                  </Body3>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.background.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    backgroundColor: COLORS.background.secondary,
  },
  errorMessage: {
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginTop: responsiveSpacing(SPACING.lg),
    marginBottom: responsiveSpacing(SPACING.lg),
  },
  statCard: {
    flex: 1,
    borderRadius: responsiveScale(16),
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingVertical: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: responsiveSpacing(SPACING.xs),
  },
  statCardPrimary: {
    backgroundColor: COLORS.primary[100],
  },
  statCardSuccess: {
    backgroundColor: COLORS.success[100],
  },
  statCardWarning: {
    backgroundColor: COLORS.warning[100],
  },
  statValue: {
    fontSize: responsiveScale(20),
  },
  filterSection: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.lg),
  },
  filterLabel: {
    marginTop: responsiveSpacing(SPACING.xs),
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
  },
  filterChip: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(16),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    borderColor: COLORS.primary[500],
    backgroundColor: COLORS.primary[50],
  },
  searchContainer: {
    marginTop: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.white,
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.xs),
  },
  searchInput: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
  },
  fetchingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  viewToggle: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginTop: responsiveSpacing(SPACING.lg),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(14),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  viewToggleActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  plannerTitle: {
    fontSize: responsiveScale(18),
  },
  plannerIntro: {
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.md),
  },
  plannerAvoiding: {
    flex: 1,
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
  },
  plannerCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    padding: responsiveSpacing(SPACING.lg),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginTop: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  formColumn: {
    flex: 1,
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  inputLabel: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.white,
    color: COLORS.text.primary,
    fontSize: responsiveScale(14),
    minHeight: responsiveScale(44),
  },
  multilineInput: {
    minHeight: responsiveScale(88),
    textAlignVertical: "top",
  },
  transportSection: {
    gap: responsiveSpacing(SPACING.xs),
  },
  modeOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: responsiveSpacing(SPACING.xs),
    rowGap: responsiveSpacing(SPACING.xs),
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    flexBasis: "49%",
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.white,
  },
  modeOptionActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  modeOptionIcon: {
    fontSize: responsiveScale(16),
  },
  prioritySection: {
    gap: responsiveSpacing(SPACING.xs),
  },
  sectionHeader: {
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  sectionTitleUpper: {
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  priorityChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
  },
  priorityChip: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 1.5),
    borderRadius: responsiveScale(16),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.white,
  },
  priorityChipActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  addressToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
  },
  addressList: {
    gap: responsiveSpacing(SPACING.sm),
  },
  addressEmpty: {
    padding: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.neutral[100],
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.neutral[300],
    alignItems: "center",
  },
  addressRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
  },
  addressBadge: {
    width: responsiveScale(28),
    height: responsiveScale(28),
    borderRadius: responsiveScale(14),
    backgroundColor: COLORS.neutral[300],
    alignItems: "center",
    justifyContent: "center",
    marginTop: responsiveSpacing(SPACING.xs),
  },
  addressBadgeStart: {
    width: responsiveScale(28),
    height: responsiveScale(28),
    borderRadius: responsiveScale(14),
    backgroundColor: COLORS.success[500],
    alignItems: "center",
    justifyContent: "center",
    marginTop: responsiveSpacing(SPACING.xs),
  },
  addressBadgeEnd: {
    width: responsiveScale(28),
    height: responsiveScale(28),
    borderRadius: responsiveScale(14),
    backgroundColor: COLORS.error[500],
    alignItems: "center",
    justifyContent: "center",
    marginTop: responsiveSpacing(SPACING.xs),
  },
  addressBadgeText: {
    color: COLORS.white,
    fontWeight: "600",
  },
  addressContent: {
    flex: 1,
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  addressInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.white,
    color: COLORS.text.primary,
    fontSize: responsiveScale(14),
    minHeight: responsiveScale(48),
    textAlignVertical: "top",
  },
  addressActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: responsiveSpacing(SPACING.xs),
  },
  addressActionButton: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 1.5),
    borderRadius: responsiveScale(10),
    borderWidth: 1,
    borderColor: COLORS.primary[500],
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  addressActionText: {
    color: COLORS.primary[600],
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  addressReorderGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  addressReorderButton: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.neutral[100],
  },
  addressRemoveButton: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.error[300],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.error[50],
  },
  addressReorderText: {
    color: COLORS.text.primary,
  },
  plannerSubmitSection: {
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(14),
    padding: responsiveSpacing(SPACING.sm),
    gap: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.neutral[200],
  },
  optimizationList: {
    gap: responsiveSpacing(SPACING.sm),
  },
  optimizationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    borderRadius: responsiveScale(12),
    backgroundColor: COLORS.neutral[50],
  },
  mapPreview: {
    position: "relative",
    height: responsiveScale(220),
    borderRadius: responsiveScale(16),
    overflow: "hidden",
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(SPACING.lg),
  },
  plannerStatsRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
  },
  plannerStatCard: {
    flex: 1,
    borderRadius: responsiveScale(14),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  plannerStatValue: {
    fontSize: responsiveScale(16),
  },
  plannerActionsGroup: {
    gap: responsiveSpacing(SPACING.xs) + responsiveScale(5),
  },
  plannerActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: responsiveSpacing(SPACING.xs),
  },
  plannerActionColumn: {
    flex: 1,
  },
  previewActionButton: {
    flex: 1,
  },
  saveActionButton: {
    flex: 1,
  },
  previewActionStandalone: {
    marginTop: 0,
    marginBottom: 0,
  },
  clearActionButton: {
    marginTop: 0,
  },
  planCta: {
    marginHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginTop: responsiveSpacing(SPACING.lg),
  },
  planPrimaryButton: {
    backgroundColor: COLORS.warning[500],
    borderRadius: responsiveScale(12),
  },
  planPrimaryText: {
    color: COLORS.white,
  },
  emptyState: {
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginTop: responsiveSpacing(SPACING.lg),
  },
  emptyIcon: {
    fontSize: responsiveScale(48),
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyMessage: {
    textAlign: "center",
  },
  routeList: {
    gap: responsiveSpacing(SPACING.md),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
  },
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    padding: responsiveSpacing(SPACING.lg),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: responsiveSpacing(SPACING.sm),
  },
  routeHeader: {
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  routeHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: responsiveSpacing(SPACING.sm),
  },
  routeTitle: {
    fontSize: responsiveScale(16),
    flex: 1,
    marginRight: responsiveSpacing(SPACING.sm),
  },
  routeDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  routeDate: {
    marginTop: 0,
  },
  routeHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  routeIconButtonEdit: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.primary[50],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary[100],
  },
  routeIconButtonDelete: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.error[50],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.error[100],
  },
  statusBadge: {
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  priorityBadge: {
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  statusBadgePlanned: {
    backgroundColor: COLORS.primary[50],
  },
  statusBadgeInProgress: {
    backgroundColor: COLORS.success[600],
  },
  statusBadgeCompleted: {
    backgroundColor: COLORS.success[700],
  },
  statusBadgeCancelled: {
    backgroundColor: COLORS.error[100],
  },
  statusBadgeDefault: {
    backgroundColor: COLORS.neutral[200],
  },
  priorityBadgeHigh: {
    backgroundColor: COLORS.error[500],
  },
  priorityBadgeUrgent: {
    backgroundColor: COLORS.error[700],
  },
  priorityBadgeLow: {
    backgroundColor: COLORS.success[100],
  },
  priorityBadgeDefault: {
    backgroundColor: COLORS.primary[100],
  },
  routeMeta: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  routeDescription: {
    lineHeight: responsiveScale(18),
  },
  routeLocations: {
    gap: responsiveSpacing(SPACING.xs / 2),
    marginTop: responsiveSpacing(SPACING.xs),
  },
  routeLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  routeLocationIcon: {
    marginTop: responsiveScale(2),
  },
  routeLocation: {
    flex: 1,
    lineHeight: responsiveScale(18),
  },
  routeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs / 2),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  multiStopBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.primary[100],
    borderRadius: responsiveScale(8),
  },
  analyticsBox: {
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.sm),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  analyticsGrid: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
  },
  analyticsItem: {
    flex: 1,
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  optimizationBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  optBadgeFastest: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.primary[100],
    borderRadius: responsiveScale(8),
  },
  optBadgeAvoid: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.success[100],
    borderRadius: responsiveScale(8),
  },
  optBadgeWarning: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.warning[100],
    borderRadius: responsiveScale(8),
  },
  optBadgeError: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.error[100],
    borderRadius: responsiveScale(8),
  },
  routeActions: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    marginTop: responsiveSpacing(SPACING.md),
  },
  routeActionButton: {
    flex: 1,
  },
  routeStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.md),
  },
  routeStat: {
    minWidth: responsiveScale(120),
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.xs),
  },
  tagChip: {
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    backgroundColor: COLORS.primary[50],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.lg),
    paddingBottom: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  modalTitle: {
    fontSize: responsiveScale(18),
  },
  modalSubtitle: {
    lineHeight: responsiveScale(18),
  },
  modalTextArea: {
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(140),
    backgroundColor: COLORS.white,
    color: COLORS.text.primary,
    fontSize: responsiveScale(14),
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: responsiveSpacing(SPACING.sm),
  },
  previewModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  previewModalCard: {
    maxHeight: "92%",
    backgroundColor: COLORS.white,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.lg),
    paddingBottom: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewScroll: {
    flexGrow: 1,
    backgroundColor: COLORS.neutral[50],
  },
  previewScrollContent: {
    paddingBottom: responsiveSpacing(SPACING.xl),
    gap: responsiveSpacing(SPACING.sm),
  },
  previewSection: {
    marginBottom: responsiveSpacing(SPACING.sm),
    padding: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderColor: COLORS.neutral[200],
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  previewLocationsGroup: {
    marginTop: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.sm),
  },
  previewLocationCard: {
    borderRadius: responsiveScale(10),
    overflow: "hidden",
    width: "100%",
    minHeight: responsiveScale(60),
  },
  previewLocationCardContent: {
    padding: responsiveSpacing(SPACING.sm),
    flexDirection: "column",
  },
  previewLocationLabel: {
    color: COLORS.text.secondary,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  previewLocationAddress: {
    color: COLORS.text.primary,
    fontWeight: "600",
  },
  previewLocationLabelStart: {
    color: COLORS.white,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: responsiveScale(11),
    letterSpacing: 0.5,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  previewLocationAddressStart: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: responsiveScale(13),
  },
  previewLocationLabelDestination: {
    color: COLORS.white,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: responsiveScale(11),
    letterSpacing: 0.5,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  previewLocationAddressDestination: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: responsiveScale(13),
  },
  previewLetterBadge: {
    width: responsiveScale(28),
    height: responsiveScale(28),
    borderRadius: responsiveScale(14),
    backgroundColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.xs / 2),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  previewLetterBadgeText: {
    color: COLORS.white,
    fontSize: responsiveScale(12),
    fontWeight: "700",
  },
  previewLetterBadgeLarge: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    borderRadius: responsiveScale(20),
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.xs / 2),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 2,
    borderColor: COLORS.neutral[200],
  },
  previewLetterBadgeTextLarge: {
    fontSize: responsiveScale(16),
    fontWeight: "700",
  },
  previewSectionTitle: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  previewOptionsList: {
    gap: responsiveSpacing(SPACING.xs),
  },
  previewOptionCard: {
    flexDirection: "column",
    gap: responsiveSpacing(SPACING.xs / 2),
    padding: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(10),
    borderWidth: 1,
    borderColor: COLORS.neutral[200],
    backgroundColor: COLORS.white,
    overflow: "hidden",
  },
  previewOptionCardActive: {
    backgroundColor: COLORS.primary[50],
    borderColor: COLORS.primary[500],
  },
  previewOptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  previewOptionTitle: {
    flex: 1,
    color: COLORS.text.primary,
    fontSize: responsiveScale(14),
  },
  previewOptionTitleActive: {
    flex: 1,
    color: COLORS.primary[600],
    fontSize: responsiveScale(14),
  },
  previewOptionDuration: {
    color: COLORS.text.secondary,
    fontWeight: "600",
  },
  previewOptionDurationActive: {
    color: COLORS.primary[600],
    fontWeight: "600",
  },
  previewOptionMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewOptionMetaText: {
    color: COLORS.text.secondary,
    fontSize: responsiveScale(13),
  },
  previewOptionMetaTextActive: {
    color: COLORS.primary[500],
    fontSize: responsiveScale(13),
  },
  previewOptionTraffic: {
    color: COLORS.text.secondary,
    fontSize: responsiveScale(12),
  },
  previewOptionTrafficActive: {
    color: COLORS.primary[600],
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  previewLeg: {
    marginBottom: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(10),
    backgroundColor: COLORS.white,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary[500],
    borderWidth: 1,
    borderColor: COLORS.neutral[200],
    gap: responsiveSpacing(SPACING.xs),
  },
  previewLegHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  previewLegRoute: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.sm),
  },
  previewLegLocationBlock: {
    flex: 1,
    gap: responsiveSpacing(SPACING.xs / 4),
  },
  previewLegLocationLabel: {
    color: COLORS.text.secondary,
    fontSize: responsiveScale(11),
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewLegLocationText: {
    color: COLORS.text.primary,
    fontSize: responsiveScale(13),
    fontWeight: "600",
  },
  previewLegArrow: {
    alignSelf: "center",
    color: COLORS.text.secondary,
    fontSize: responsiveScale(16),
  },
  previewLegChipRow: {
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(999),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  previewLegChipText: {
    color: COLORS.primary[600],
    fontWeight: "600",
    fontSize: responsiveScale(13),
  },
  previewSteps: {
    gap: responsiveSpacing(SPACING.xs),
  },
  previewStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs),
  },
  previewStepNumber: {
    width: responsiveScale(24),
    height: responsiveScale(24),
    borderRadius: responsiveScale(12),
    backgroundColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  previewStepContent: {
    flex: 1,
    gap: responsiveSpacing(SPACING.xs / 4),
  },
  previewStepInstruction: {
    color: COLORS.text.primary,
    flexWrap: "wrap",
  },
  previewStepMeta: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    fontStyle: "italic",
  },
  previewEmpty: {
    padding: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.neutral[100],
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.neutral[300],
    alignItems: "center",
  },
  previewSummaryGrid: {
    marginTop: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
    padding: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.neutral[100],
    borderRadius: responsiveScale(10),
    borderWidth: 1,
    borderColor: COLORS.neutral[200],
    gap: responsiveSpacing(SPACING.xs),
  },
  previewSummaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs),
  },
  previewSummaryLabel: {
    color: COLORS.text.secondary,
    fontWeight: "600",
  },
  previewSummaryValue: {
    color: COLORS.text.primary,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  previewMapContainer: {
    flex: 1,
    minHeight: responsiveScale(420),
    width: "100%",
    borderRadius: responsiveScale(20),
    overflow: "hidden",
    marginTop: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.white,
  },
  previewMap: {
    flex: 1,
  },
  previewMapSheet: {
    maxHeight: "92%",
    backgroundColor: COLORS.white,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
    flex: 1,
  },
  previewMapHeader: {
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.lg),
    paddingBottom: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.xs),
  },
  mapMarkerBadge: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(16),
    backgroundColor: COLORS.primary[600],
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  mapMarkerBadgeText: {
    color: COLORS.white,
    fontSize: responsiveScale(14),
    fontWeight: "700",
  },
  mapLegendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingVertical: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.neutral[200],
  },
  mapLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: responsiveSpacing(SPACING.md),
  },
  mapLegendBadge: {
    width: responsiveScale(28),
    height: responsiveScale(28),
    borderRadius: responsiveScale(14),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
    marginRight: responsiveSpacing(SPACING.xs),
  },
  mapLegendBadgeText: {
    color: COLORS.white,
    fontSize: responsiveScale(12),
    fontWeight: "700",
  },
  mapLegendLabel: {
    color: COLORS.text.primary,
    fontSize: responsiveScale(13),
    fontWeight: "600",
  },
});
