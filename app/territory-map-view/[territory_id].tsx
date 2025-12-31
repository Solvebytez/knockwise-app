import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  Alert,
  Platform,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MapView, {
  Marker,
  Polygon,
  Region,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, Body2, AppHeader } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import AddPropertyModal, {
  AddPropertyModalRef,
} from "@/components/AddPropertyModal";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { getGoogleMapsApiKey } from "@/lib/googleMaps";

// Lazy load expo-sharing to avoid native module errors on startup
// We'll import it dynamically when needed

// Geocode an address using Google Geocoding API to avoid OS location permission
const geocodeAddressWithPlaces = async (address: string) => {
  try {
    let apiKey = getGoogleMapsApiKey();

    // Fallback to hardcoded key if not found (for real device compatibility)
    if (!apiKey) {
      console.warn(
        "⚠️ Google Maps API key not found in config, using fallback key"
      );
      apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
    }

    if (!apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    console.log("🔍 Geocoding address:", address.substring(0, 50) + "...");

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "❌ Geocoding API response not OK:",
        response.status,
        response.statusText
      );
      throw new Error(
        `Geocoding API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    console.log("📊 Geocoding API response status:", data.status);

    if (data.status === "ZERO_RESULTS") {
      console.warn("⚠️ No results found for address:", address);
      throw new Error("No location data found for this address");
    }

    if (data.status === "REQUEST_DENIED") {
      console.error(
        "❌ Geocoding API request denied:",
        data.error_message || "Unknown error"
      );
      throw new Error(
        `Geocoding API request denied: ${
          data.error_message || "Check API key configuration"
        }`
      );
    }

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      console.error("❌ Geocoding API error:", data.status, data.error_message);
      throw new Error(
        `Geocoding failed with status: ${data.status}${
          data.error_message ? ` - ${data.error_message}` : ""
        }`
      );
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    const formattedAddress: string = result.formatted_address;
    const streetNumber =
      result.address_components?.find((c: any) =>
        (c.types || []).includes("street_number")
      )?.long_name || "";

    console.log("✅ Geocoding successful:", lat, lng);

    return { lat, lng, formattedAddress, streetNumber };
  } catch (error: any) {
    console.error("❌ Geocoding error:", error);
    throw error;
  }
};

interface Territory {
  _id: string;
  name: string;
  description?: string;
  boundary: any;
  totalResidents: number;
  activeResidents: number;
  status: string;
}

interface Property {
  _id: string;
  address: string;
  houseNumber: number;
  coordinates: [number, number];
  status:
    | "not-visited"
    | "interested"
    | "visited"
    | "callback"
    | "appointment"
    | "follow-up"
    | "not-interested";
  lastVisited?: string;
  notes?: string;
  dataSource?: "AUTO" | "MANUAL";
}

export default function TerritoryMapViewScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const territoryId = params.territory_id as string;

  console.log("🗺️ TerritoryMapViewScreen: Component mounted", {
    territoryId,
    timestamp: new Date().toISOString(),
  });

  const [territory, setTerritory] = useState<Territory | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null
  );
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<
    string | null
  >(null);

  // Edit property modal states (declared early for use in queries)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPropertyId, setEditPropertyId] = useState<string | null>(null);

  // Add property modal ref
  const addPropertyModalRef = useRef<AddPropertyModalRef>(null);

  // Query client for cache management
  const queryClient = useQueryClient();

  // Property details query for detail modal (with caching)
  const { data: detailedProperty, isLoading: isLoadingPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", selectedProperty?._id],
      queryFn: async () => {
        if (!selectedProperty?._id) return null;
        console.log(
          "📡 Fetching property details (cached if available):",
          selectedProperty._id
        );
        const response = await apiInstance.get(
          `/residents/${selectedProperty._id}`
        );
        return response.data.data;
      },
      enabled: !!selectedProperty?._id && isDetailModalOpen,
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
      gcTime: 10 * 60 * 1000, // 10 minutes - cache kept for 10 min
    });

  // Property details query for edit modal (with caching)
  const { data: editPropertyDetails, isLoading: isLoadingEditPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", editPropertyId],
      queryFn: async () => {
        if (!editPropertyId) return null;
        const response = await apiInstance.get(`/residents/${editPropertyId}`);
        return response.data.data;
      },
      enabled: !!editPropertyId && isEditModalOpen,
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
      gcTime: 10 * 60 * 1000, // 10 minutes - cache kept for 10 min
    });
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { height: screenHeight } = Dimensions.get("window");
  const [showMap, setShowMap] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [dataSourceFilter, setDataSourceFilter] =
    useState<string>("All Sources");
  const [sortBy, setSortBy] = useState<string>("Sequential");

  // Dropdown modal states
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);
  const [dataSourceDropdownVisible, setDataSourceDropdownVisible] =
    useState(false);
  const [editStatusDropdownVisible, setEditStatusDropdownVisible] =
    useState(false);

  // Edit property modal states (additional)
  const [isUpdatingResident, setIsUpdatingResident] = useState(false);
  const [isEditValidating, setIsEditValidating] = useState(false);
  const [editValidationErrors, setEditValidationErrors] = useState<string[]>(
    []
  );
  const [isEditGettingLocation, setIsEditGettingLocation] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isEditModalScrolling, setIsEditModalScrolling] = useState(false);

  // Address autocomplete states
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const addressInputRef = useRef<TextInput>(null);

  const [editFormData, setEditFormData] = useState({
    address: "",
    houseNumber: "",
    longitude: "",
    latitude: "",
    status: "not-visited" as Property["status"],
    lastVisited: "",
    notes: "",
    phone: "",
    email: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    ownerMailingAddress: "",
  });

  // Add property modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [exportFormat, setExportFormat] = useState<"csv" | "excel">("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Property export modal state
  const [isPropertyExportModalOpen, setIsPropertyExportModalOpen] =
    useState(false);
  const [propertyExportFormat, setPropertyExportFormat] = useState<
    "csv" | "excel"
  >("csv");
  const [isPropertyExporting, setIsPropertyExporting] = useState(false);
  const [propertyExportProgress, setPropertyExportProgress] = useState(0);

  // Statistics state (matching web client)
  const [stats, setStats] = useState({
    totalHomes: 0,
    visited: 0,
    remaining: 0,
  });

  // Bottom sheet snap points - leave gap from top when expanded
  const snapPoints = useMemo(() => {
    const gapFromTop = 100; // Gap from top in pixels
    const expandedHeight = screenHeight - gapFromTop;
    // Collapsed height: just enough to show drag handle and header (approximately 100px)
    return [100, expandedHeight];
  }, [screenHeight]);

  // Status colors matching web client
  const statusColors = {
    "not-visited": "#EF4444", // red
    interested: "#F59E0B", // amber
    visited: "#10B981", // emerald
    appointment: "#3B82F6", // blue
    "follow-up": "#EC4899", // pink
    "not-interested": "#6B7280", // gray
    "not-opened": "#F97316", // orange
  };

  // Fetch territory map view data (same API endpoint as web client)
  const { data, isLoading, error } = useQuery({
    queryKey: ["territoryMapView", territoryId],
    queryFn: async () => {
      console.log("📡 Fetching territory map view data...", {
        territoryId,
        endpoint: `/zones/map-view/${territoryId}`,
      });
      try {
        // Same endpoint as web client: /zones/map-view/${territoryId}
        const response = await apiInstance.get(
          `/zones/map-view/${territoryId}`
        );
        console.log("✅ Territory map view data fetched successfully", {
          success: response.data?.success,
          hasZone: !!response.data?.data?.zone,
          propertiesCount: response.data?.data?.properties?.length || 0,
        });
        return response.data;
      } catch (err) {
        console.error("❌ Error fetching territory map view:", err);
        throw err;
      }
    },
    enabled: !!territoryId,
    refetchOnWindowFocus: false,
  });

  console.log("📊 Query state:", {
    isLoading,
    hasError: !!error,
    hasData: !!data,
    errorMessage: error?.message,
  });

  useEffect(() => {
    console.log("🔄 useEffect [data]: Processing territory data", {
      hasData: !!data,
      success: data?.success,
      hasZone: !!data?.data?.zone,
      timestamp: new Date().toISOString(),
    });

    if (data?.success && data?.data) {
      const {
        zone,
        properties: zoneProperties,
        statusSummary,
        statistics,
      } = data.data;

      console.log("📍 Setting territory and properties state", {
        zoneId: zone?._id,
        zoneName: zone?.name,
        propertiesCount: zoneProperties?.length || 0,
        hasBoundary: !!zone?.boundary,
        boundaryCoordinates: zone?.boundary?.coordinates?.[0]?.length || 0,
      });

      // Set territory data (same as web client)
      setTerritory(zone);

      // Set properties data (same as web client)
      setProperties(zoneProperties || []);
      setFilteredProperties(zoneProperties || []);

      // Note: statusSummary and statistics will be used in Phase 7
      console.log("✅ Territory data loaded:", {
        zone,
        propertiesCount: zoneProperties?.length || 0,
        statusSummary,
        statistics,
      });
    } else {
      console.warn("⚠️ Data not ready or invalid", {
        hasData: !!data,
        success: data?.success,
        hasDataField: !!data?.data,
      });
    }
  }, [data]);

  // Filter and sort properties
  useEffect(() => {
    let filtered = [...properties];

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (property) =>
          property.address.toLowerCase().includes(searchLower) ||
          property.houseNumber.toString().includes(searchTerm)
      );
    }

    // Apply status filter
    if (statusFilter && statusFilter !== "All Status") {
      filtered = filtered.filter(
        (property) => property.status === statusFilter
      );
    }

    // Apply data source filter
    if (dataSourceFilter && dataSourceFilter !== "All Sources") {
      filtered = filtered.filter(
        (property) => property.dataSource === dataSourceFilter
      );
    }

    // Apply sorting
    if (sortBy === "Sequential") {
      filtered = filtered.sort((a, b) => a.houseNumber - b.houseNumber);
    } else if (sortBy === "Odd") {
      filtered = filtered
        .filter((property) => property.houseNumber % 2 === 1)
        .sort((a, b) => a.houseNumber - b.houseNumber);
    } else if (sortBy === "Even") {
      filtered = filtered
        .filter((property) => property.houseNumber % 2 === 0)
        .sort((a, b) => a.houseNumber - b.houseNumber);
    }

    setFilteredProperties(filtered);
  }, [properties, searchTerm, statusFilter, dataSourceFilter, sortBy]);

  // Update statistics whenever properties change (matching web client)
  useEffect(() => {
    let visitedCount = 0;

    properties.forEach((property) => {
      // Count visited properties (any status except not-visited and not-interested)
      if (
        property.status === "visited" ||
        property.status === "interested" ||
        property.status === "callback" ||
        property.status === "appointment" ||
        property.status === "follow-up"
      ) {
        visitedCount++;
      }
    });

    setStats({
      totalHomes: properties.length,
      visited: visitedCount,
      remaining: properties.length - visitedCount,
    });
  }, [properties]);

  const handleBack = () => {
    router.back();
  };

  // Convert boundary coordinates from GeoJSON format [lng, lat] to map format { latitude, longitude }
  const boundaryCoordinates = useMemo(() => {
    if (!territory?.boundary?.coordinates?.[0]) return [];

    return territory.boundary.coordinates[0].map(
      ([lng, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      })
    );
  }, [territory?.boundary]);

  // Calculate initial region from boundary coordinates or properties
  const initialRegion = useMemo<Region | undefined>(() => {
    console.log("🗺️ Calculating initialRegion", {
      boundaryCoordinatesCount: boundaryCoordinates.length,
      propertiesCount: properties.length,
    });

    // If we have boundary coordinates, use them
    if (boundaryCoordinates.length > 0) {
      const lats = boundaryCoordinates.map(
        (coord: { latitude: number; longitude: number }) => coord.latitude
      );
      const lngs = boundaryCoordinates.map(
        (coord: { latitude: number; longitude: number }) => coord.longitude
      );

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;

      const latDelta = (maxLat - minLat) * 1.3; // Add 30% padding
      const lngDelta = (maxLng - minLng) * 1.3;

      const region = {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: Math.max(latDelta, 0.01), // Minimum delta
        longitudeDelta: Math.max(lngDelta, 0.01),
      };
      console.log("📍 InitialRegion calculated from boundary:", region);
      return region;
    }

    // If we have properties but no boundary, calculate from properties
    if (properties.length > 0) {
      const lats = properties.map((p) => p.coordinates[1]);
      const lngs = properties.map((p) => p.coordinates[0]);

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;

      const latDelta = (maxLat - minLat) * 1.3 || 0.05;
      const lngDelta = (maxLng - minLng) * 1.3 || 0.05;

      const region = {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: Math.max(latDelta, 0.01),
        longitudeDelta: Math.max(lngDelta, 0.01),
      };
      console.log("📍 InitialRegion calculated from properties:", region);
      return region;
    }

    // Fallback: Default region (can be adjusted based on your app's typical location)
    const fallbackRegion = {
      latitude: 37.7749, // San Francisco default (adjust as needed)
      longitude: -122.4194,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    console.log("📍 InitialRegion using fallback (default):", fallbackRegion);
    return fallbackRegion;
  }, [boundaryCoordinates, properties]);

  // Delay map rendering to ensure layout is stable and Google Maps SDK is ready
  // Only render map when we have territory data (not just fallback region)
  useEffect(() => {
    console.log(
      "⏱️ useEffect [initialRegion, territory]: Checking map readiness",
      {
        hasInitialRegion: !!initialRegion,
        hasTerritory: !!territory,
        initialRegion,
        showMap,
        timestamp: new Date().toISOString(),
      }
    );

    // Only start delay if:
    // 1. initialRegion exists
    // 2. Territory data is loaded (not just fallback region)
    // 3. showMap is not already true
    // This prevents rendering MapView with fallback region and then re-rendering with real region
    const isUsingFallbackRegion =
      initialRegion?.latitude === 37.7749 &&
      initialRegion?.longitude === -122.4194;
    const shouldRenderMap =
      initialRegion && territory && !isUsingFallbackRegion && !showMap;

    if (shouldRenderMap) {
      console.log(
        "⏳ Starting 500ms delay before rendering MapView with real region..."
      );
      const timer = setTimeout(() => {
        console.log("✅ Delay complete, setting showMap to true");
        setShowMap(true);
      }, 500);
      return () => {
        console.log("🧹 Cleaning up map delay timer");
        clearTimeout(timer);
      };
    } else if (showMap) {
      console.log("✅ showMap already true, skipping delay");
    } else if (!territory) {
      console.log("⏸️ Waiting for territory data...");
    } else if (isUsingFallbackRegion) {
      console.log(
        "⏸️ Using fallback region, waiting for real territory data..."
      );
    } else {
      console.log("⏸️ initialRegion not ready yet, waiting...");
    }
  }, [initialRegion, territory, showMap]);

  // Fit map to boundary when territory data loads (moved to onMapReady)
  // This ensures the map is fully initialized before fitting

  // Handle property marker press
  const handlePropertyPress = (property: Property) => {
    setSelectedProperty(property);
    setHighlightedPropertyId(property._id);

    // Open modal immediately - React Query will fetch (or use cache)
    setIsDetailModalOpen(true);

    // Center map on selected property
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: property.coordinates[1],
          longitude: property.coordinates[0],
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }

    // Clear highlight after 2 seconds
    setTimeout(() => {
      setHighlightedPropertyId(null);
    }, 2000);
  };

  // Handle property click from list
  const handlePropertyClick = (property: Property) => {
    // Open edit modal directly instead of detail modal
    handleEditProperty(property);
  };

  // Handle close detail modal
  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    // Don't clear selectedProperty - keep it for cache reuse
  };

  // Handle phone number press
  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Handle edit property (matching web client - open modal immediately, fetch data in background with caching)
  const handleEditProperty = (property: Property) => {
    setSelectedProperty(property);
    setEditPropertyId(property._id); // Set property ID to trigger React Query
    setIsEditModalOpen(true);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Initialize form data with basic property values (from property list)
    setEditFormData({
      address: property.address,
      houseNumber: property.houseNumber?.toString() || "",
      longitude: property.coordinates[0]?.toString() || "",
      latitude: property.coordinates[1]?.toString() || "",
      status: property.status,
      lastVisited: property.lastVisited
        ? new Date(property.lastVisited).toISOString().split("T")[0]
        : today, // Default to today's date if not set
      notes: property.notes || "",
      phone: "",
      email: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
      ownerMailingAddress: "",
    });

    // Close detail modal if open
    setIsDetailModalOpen(false);
  };

  // Update form data when editPropertyDetails loads (from React Query cache or fetch)
  useEffect(() => {
    if (editPropertyDetails && selectedProperty) {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split("T")[0];
      setEditFormData((prev) => ({
        // Update all fields from selectedProperty first (for navigation)
        address: selectedProperty.address || prev.address,
        houseNumber: selectedProperty.houseNumber?.toString() || prev.houseNumber,
        longitude: selectedProperty.coordinates[0]?.toString() || prev.longitude,
        latitude: selectedProperty.coordinates[1]?.toString() || prev.latitude,
        status: selectedProperty.status || prev.status,
        // Then update with detailed data if available
        lastVisited: (() => {
          const detailedDate = editPropertyDetails?.resident?.lastVisited
            ? new Date(editPropertyDetails.resident.lastVisited)
                .toISOString()
                .split("T")[0]
            : "";
          const propertyDate = selectedProperty.lastVisited
            ? new Date(selectedProperty.lastVisited).toISOString().split("T")[0]
            : "";
          return detailedDate || propertyDate || prev.lastVisited || today;
        })(),
        notes:
          editPropertyDetails?.resident?.notes ||
          selectedProperty.notes ||
          prev.notes,
        phone: editPropertyDetails?.resident?.phone || prev.phone,
        email: editPropertyDetails?.resident?.email || prev.email,
        ownerName:
          editPropertyDetails?.propertyData?.ownerName || prev.ownerName,
        ownerPhone:
          editPropertyDetails?.propertyData?.ownerPhone || prev.ownerPhone,
        ownerEmail:
          editPropertyDetails?.propertyData?.ownerEmail || prev.ownerEmail,
        ownerMailingAddress:
          editPropertyDetails?.propertyData?.ownerMailingAddress ||
          prev.ownerMailingAddress,
      }));
    }
  }, [editPropertyDetails, selectedProperty]);

  // Handle form change (matching web client)
  const handleFormChange = (field: string, value: string) => {
    if (isUpdatingResident) return;
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Validate form after change
    setTimeout(() => validateEditForm(), 500);
  };

  // Validate edit form (matching web client)
  const validateEditForm = async (): Promise<boolean> => {
    setIsEditValidating(true);
    setEditValidationErrors([]);

    const errors: string[] = [];

    try {
      // Check required fields - only house number is mandatory
      if (!editFormData.houseNumber) {
        errors.push("House number is required");
      }

      // Validate coordinates format (only if provided)
      if (editFormData.latitude && editFormData.longitude) {
        const lat = parseFloat(editFormData.latitude);
        const lng = parseFloat(editFormData.longitude);

        if (isNaN(lat) || isNaN(lng)) {
          errors.push("Invalid coordinates format");
        } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          errors.push("Coordinates are out of valid range");
        }
      }

      setEditValidationErrors(errors);
      return errors.length === 0;
    } catch (error) {
      console.error("Error validating edit form:", error);
      setEditValidationErrors(["Validation error occurred"]);
      return false;
    } finally {
      setIsEditValidating(false);
    }
  };

  // Check if edit form is valid (matching web client)
  const isEditFormValid = (): boolean => {
    // Basic info is required
    const basicInfoValid =
      editFormData.address.trim() !== "" &&
      editFormData.houseNumber.trim() !== "" &&
      editFormData.longitude.trim() !== "" &&
      editFormData.latitude.trim() !== "";

    // Last Visited is required ONLY when status is not "not-visited"
    const statusValid =
      (editFormData.status as string) === "not-visited" ||
      ((editFormData.status as string) !== "not-visited" &&
        editFormData.lastVisited.trim() !== "");

    return basicInfoValid && statusValid;
  };

  // Handle use my current location (matching web client)
  const handleEditUseMyLocation = async () => {
    try {
      setIsEditGettingLocation(true);
      console.log("📍 Requesting location permission...");

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.error("❌ Location permission denied");
        Alert.alert(
          "Permission Denied",
          "Location permission is required to use this feature. Please enable location access in your device settings."
        );
        setIsEditGettingLocation(false);
        return;
      }

      console.log("✅ Permission granted, getting current location...");

      // Get current location with high accuracy (matching web)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      console.log("📍 Location captured:", lat, lng);

      // Update coordinates first (matching web behavior)
      setEditFormData((prev) => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString(),
      }));

      // Reverse geocode to get address (matching web)
      try {
        const geocodeResult = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });

        if (geocodeResult && geocodeResult.length > 0) {
          const address = geocodeResult[0];
          // Use type assertion since TypeScript types may not include all properties
          const addr = address as any;
          const formattedAddress = [
            addr.streetNumber,
            addr.street,
            addr.city,
            addr.region,
            addr.postalCode,
            addr.country,
          ]
            .filter(Boolean)
            .join(", ");

          // Extract house number from address (matching web)
          const houseNumber =
            addr.streetNumber || formattedAddress.match(/^(\d+)/)?.[1] || "";

          console.log("📍 Reverse geocoding result:");
          console.log("📍 Formatted address:", formattedAddress);
          console.log("📍 House number:", houseNumber);

          // Update form data with address and house number (matching web)
          setEditFormData((prev) => ({
            ...prev,
            address: formattedAddress || prev.address,
            houseNumber: houseNumber || prev.houseNumber,
          }));

          Alert.alert(
            "Location Captured",
            `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n${
              formattedAddress
                ? `Address: ${formattedAddress}`
                : "Address not found"
            }`
          );
        } else {
          console.warn("⚠️ No address found for location");
          Alert.alert(
            "Location Captured",
            `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(
              6
            )}\nAddress not found`
          );
        }
      } catch (geocodeError) {
        console.error("Geocoding error:", geocodeError);
        Alert.alert(
          "Location Captured",
          `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(
            6
          )}\nAddress lookup failed`
        );
      }
    } catch (error: any) {
      console.error("❌ Error getting location:", error);
      setIsEditGettingLocation(false);

      // Handle specific error cases (matching web)
      let errorMessage = "Failed to get your location";
      if (error.code === "E_LOCATION_UNAVAILABLE") {
        errorMessage =
          "Location services are unavailable. Please enable location services in your device settings.";
      } else if (error.code === "E_LOCATION_TIMEOUT") {
        errorMessage = "Location request timed out. Please try again.";
      } else if (error.message?.includes("permission")) {
        errorMessage =
          "Location permission denied. Please enable location access in your device settings.";
      } else if (error.message?.includes("unavailable")) {
        errorMessage =
          "Current location is unavailable. Make sure that location services are enabled.";
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setIsEditGettingLocation(false);
    }
  };

  // Fetch address suggestions from Google Places Autocomplete (matching web version)
  const fetchAddressSuggestions = async (query: string) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    try {
      setIsLoadingSuggestions(true);

      let apiKey = getGoogleMapsApiKey();

      // Fallback to hardcoded key if not found (for real device compatibility)
      if (!apiKey) {
        console.warn(
          "⚠️ Google Maps API key not found in config, using fallback key"
        );
        apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
      }

      if (!apiKey) {
        throw new Error("Google Maps API key not configured");
      }

      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query
      )}&key=${apiKey}&types=address&components=country:ca`;

      console.log(
        "🔍 Fetching address suggestions for:",
        query.substring(0, 50) + "..."
      );

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          "❌ Address suggestions API response not OK:",
          response.status,
          response.statusText
        );
        throw new Error(
          `Address suggestions API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      console.log("📊 Address suggestions API response status:", data.status);

      if (data.status === "OK" && data.predictions) {
        console.log("✅ Found", data.predictions.length, "address suggestions");
        setAddressSuggestions(data.predictions);
        setShowAddressSuggestions(true);
      } else if (data.status === "ZERO_RESULTS") {
        console.log("ℹ️ No address suggestions found");
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      } else if (data.status === "REQUEST_DENIED") {
        console.error(
          "❌ Address suggestions API request denied:",
          data.error_message || "Unknown error"
        );
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      } else {
        console.warn(
          "⚠️ Address suggestions API returned status:",
          data.status,
          data.error_message
        );
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      }
    } catch (error: any) {
      console.error("❌ Error fetching address suggestions:", error);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Debounce timer ref for address suggestions
  const addressSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Handle address input change with debounced autocomplete
  const handleAddressInputChange = (value: string) => {
    handleFormChange("address", value);

    // Clear previous timeout
    if (addressSearchTimeoutRef.current) {
      clearTimeout(addressSearchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    addressSearchTimeoutRef.current = setTimeout(() => {
      fetchAddressSuggestions(value);
    }, 300);
  };

  // Handle address suggestion selection
  const handleSelectAddressSuggestion = async (suggestion: any) => {
    setEditFormData((prev) => ({
      ...prev,
      address: suggestion.description,
    }));
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);

    // Automatically geocode the selected address
    await handleAddressSearchForSuggestion(suggestion.description);
  };

  // Handle address search for selected suggestion
  const handleAddressSearchForSuggestion = async (address: string) => {
    if (!address.trim()) {
      return;
    }

    try {
      setIsEditValidating(true);
      console.log("🔍 Finding exact coordinates for address:", address);

      // Use Google Geocoding API to convert address to coordinates (no OS permission needed)
      const { lat, lng, formattedAddress, streetNumber } =
        await geocodeAddressWithPlaces(address);

      const houseNumber =
        streetNumber ||
        formattedAddress.match(/^(\d+)/)?.[1] ||
        editFormData.houseNumber;

      // Update form with exact coordinates and formatted address
      setEditFormData((prev) => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString(),
        address: formattedAddress || prev.address,
        houseNumber: houseNumber || prev.houseNumber,
      }));

      console.log("✅ Exact coordinates found:", lat, lng);
    } catch (error: any) {
      console.error("❌ Error finding exact coordinates:", error);
      Alert.alert(
        "Error",
        error.message ||
          "Failed to find coordinates. Please check the address and try again."
      );
    } finally {
      setIsEditValidating(false);
    }
  };

  // Handle address search (geocoding) - matching web client findExactCoordinates
  const handleAddressSearch = async () => {
    if (!editFormData.address.trim()) {
      console.error("❌ Please enter an address");
      Alert.alert("Error", "Please enter an address to search");
      return;
    }

    try {
      setIsEditValidating(true);
      console.log(
        "🔍 Finding exact coordinates for address:",
        editFormData.address
      );

      // Use Google Geocoding API to convert address to coordinates (no OS permission needed)
      const { lat, lng, formattedAddress, streetNumber } =
        await geocodeAddressWithPlaces(editFormData.address);

      console.log("🎯 Geocoding Results:");
      console.log("📍 Original Address:", editFormData.address);
      console.log("📍 Formatted Address:", formattedAddress);
      console.log("📍 Coordinates:", lat, lng);

      const houseNumber =
        streetNumber ||
        formattedAddress.match(/^(\d+)/)?.[1] ||
        editFormData.houseNumber;

      // Update form with exact coordinates and formatted address (matching web)
      setEditFormData((prev) => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString(),
        address: formattedAddress || prev.address, // Update with formatted address
        houseNumber: houseNumber || prev.houseNumber,
      }));

      console.log("✅ Exact coordinates found:", lat, lng);
      Alert.alert(
        "Success",
        `Coordinates found: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
      );
    } catch (error: any) {
      console.error("❌ Error finding exact coordinates:", error);
      const errorMessage =
        error.message ||
        "Failed to find coordinates. Please check the address and try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsEditValidating(false);
    }
  };

  // Handle update resident (matching web client)
  const handleUpdateResident = async (keepModalOpen = false) => {
    console.log(`🔵 [Save] handleUpdateResident called - keepModalOpen: ${keepModalOpen}`);
    
    if (!selectedProperty) {
      console.log("❌ [Save] No selectedProperty, returning early");
      return;
    }

    // Use editPropertyId if available, otherwise selectedProperty._id
    const propertyId = editPropertyId || selectedProperty._id;
    console.log(`🔵 [Save] Property ID: ${propertyId}`);

    try {
      setIsUpdatingResident(true);

      const updateData = {
        address: editFormData.address,
        houseNumber: editFormData.houseNumber
          ? parseInt(editFormData.houseNumber)
          : undefined,
        coordinates: [
          parseFloat(editFormData.longitude),
          parseFloat(editFormData.latitude),
        ],
        status: editFormData.status,
        lastVisited: editFormData.lastVisited || undefined,
        notes: editFormData.notes || undefined,
        phone: editFormData.phone || undefined,
        email: editFormData.email || undefined,
        ownerName: editFormData.ownerName || undefined,
        ownerPhone: editFormData.ownerPhone || undefined,
        ownerEmail: editFormData.ownerEmail || undefined,
        ownerMailingAddress: editFormData.ownerMailingAddress || undefined,
      };

      console.log(`🔄 Updating resident: ${propertyId}`);
      console.log(`🔄 Update data keys: ${Object.keys(updateData).join(", ")}`);

      const response = await apiInstance.put(
        `/residents/${propertyId}`,
        updateData
      );

      console.log(`✅ Update response success: ${response.data?.success}`);

      if (response.data.success) {
        console.log(`✅ [Save] Property update successful: ${propertyId}`);
        
        // Invalidate and refetch property details cache
        queryClient.invalidateQueries({
          queryKey: ["propertyDetails", propertyId],
        });

        // Also invalidate territory map view to refresh the list
        queryClient.invalidateQueries({
          queryKey: ["territoryMapView", territoryId],
        });

        // Invalidate dashboard query cache to refresh statistics (matching web)
        queryClient.invalidateQueries({ queryKey: ["myTerritories"] });

        // Invalidate agent dashboard stats to refresh home screen cards
        queryClient.invalidateQueries({ queryKey: ["agentDashboardStats"] });

        // Also invalidate admin dashboard queries (matching web)
        queryClient.invalidateQueries({
          queryKey: ["admin", "team-performance"],
        });
        queryClient.invalidateQueries({
          queryKey: ["admin", "territory-stats"],
        });
        queryClient.invalidateQueries({
          queryKey: ["admin", "assignment-status"],
        });

        // Compute updated properties list synchronously for navigation
        const updatedPropertiesForNav = properties.map((prop) =>
          prop._id === propertyId
            ? {
                ...prop,
                address: updateData.address,
                houseNumber: updateData.houseNumber || prop.houseNumber,
                coordinates: updateData.coordinates as [number, number],
                status: updateData.status,
                lastVisited: updateData.lastVisited,
                ...(response.data.data?.lastUpdatedBy && {
                  lastUpdatedBy: response.data.data.lastUpdatedBy,
                }),
                notes: updateData.notes,
                phone: updateData.phone,
                email: updateData.email,
              }
            : prop
        );

        // Update the local state
        setProperties(updatedPropertiesForNav);

        // Update filtered properties
        setFilteredProperties((prev) =>
          prev.map((prop) =>
            prop._id === propertyId
              ? {
                  ...prop,
                  address: updateData.address,
                  houseNumber: updateData.houseNumber || prop.houseNumber,
                  coordinates: updateData.coordinates as [number, number],
                  status: updateData.status,
                  lastVisited: updateData.lastVisited,
                  ...(response.data.data?.lastUpdatedBy && {
                    lastUpdatedBy: response.data.data.lastUpdatedBy,
                  }),
                  notes: updateData.notes,
                  phone: updateData.phone,
                  email: updateData.email,
                }
              : prop
          )
        );

        // Update selected property (matching web version)
        setSelectedProperty((prev) =>
          prev && prev._id === propertyId
            ? {
                ...prev,
                address: updateData.address,
                houseNumber: updateData.houseNumber || prev.houseNumber,
                coordinates: updateData.coordinates as [number, number],
                status: updateData.status,
                lastVisited: updateData.lastVisited,
                ...(response.data.data?.lastUpdatedBy && {
                  lastUpdatedBy: response.data.data.lastUpdatedBy,
                }),
                notes: updateData.notes,
                phone: updateData.phone,
                email: updateData.email,
              }
            : prev
        );

        // Compute filteredProperties using the same logic as useEffect
        let computedFiltered = [...updatedPropertiesForNav];

        // Apply search filter
        if (searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase();
          computedFiltered = computedFiltered.filter(
            (property) =>
              property.address.toLowerCase().includes(searchLower) ||
              property.houseNumber.toString().includes(searchTerm)
          );
        }

        // Apply status filter
        if (statusFilter && statusFilter !== "All Status") {
          computedFiltered = computedFiltered.filter(
            (property) => property.status === statusFilter
          );
        }

        // Apply data source filter
        if (dataSourceFilter && dataSourceFilter !== "All Sources") {
          computedFiltered = computedFiltered.filter(
            (property) => property.dataSource === dataSourceFilter
          );
        }

        // Apply sorting
        if (sortBy === "Sequential") {
          computedFiltered = computedFiltered.sort((a, b) => a.houseNumber - b.houseNumber);
        } else if (sortBy === "Odd") {
          computedFiltered = computedFiltered
            .filter((property) => property.houseNumber % 2 === 1)
            .sort((a, b) => a.houseNumber - b.houseNumber);
        } else if (sortBy === "Even") {
          computedFiltered = computedFiltered
            .filter((property) => property.houseNumber % 2 === 0)
            .sort((a, b) => a.houseNumber - b.houseNumber);
        }

        console.log(`🔍 [Save] Navigation check - keepModalOpen: ${keepModalOpen}`);
        console.log(`🔍 [Save] Property ID just saved: ${propertyId}`);
        console.log(`🔍 [Save] computedFiltered.length: ${computedFiltered.length}`);
        console.log(`🔍 [Save] computedFiltered IDs: ${JSON.stringify(computedFiltered.map(p => p._id))}`);

        // If not keeping modal open, check if we should auto-navigate to next property
        if (!keepModalOpen) {
          console.log("✅ [Save] Will attempt navigation (keepModalOpen is false)");
          
          // Wait for useEffect to update filteredProperties with the latest data
          await new Promise((resolve) => setTimeout(resolve, 200));

          // Use filteredProperties (which is kept in sync by useEffect) for navigation
          // This ensures we're using the same source as the chevron buttons
          if (filteredProperties.length > 1) {
            console.log("✅ [Save] Conditions met for navigation");
            console.log(`🔍 [Save] filteredProperties.length: ${filteredProperties.length}`);
            console.log(`🔍 [Save] filteredProperties IDs: ${JSON.stringify(filteredProperties.map(p => p._id))}`);
            
            // Find current property index using the propertyId we just saved
            const currentIndex = filteredProperties.findIndex(
              (p) => p._id === propertyId
            );

            console.log(`🔍 [Save] Current property index: ${currentIndex}`);
            console.log(`🔍 [Save] Looking for property ID: ${propertyId}`);

            if (currentIndex !== -1) {
              // Get next property (wrap around to first if at end)
              const nextIndex = (currentIndex + 1) % filteredProperties.length;
              const nextPropertyToNavigate = filteredProperties[nextIndex];

              console.log(`✅ [Save] Found next property - index: ${nextIndex}`);
              console.log(`✅ [Save] Next property ID: ${nextPropertyToNavigate._id}`);
              console.log(`✅ [Save] Next property address: ${nextPropertyToNavigate.address || 'N/A'}`);

              // Update selectedProperty to saved values first (so navigateToProperty doesn't try to save again)
              // This ensures the form data matches what we just saved
              const updatedSelectedProperty = updatedPropertiesForNav.find(p => p._id === propertyId);
              if (updatedSelectedProperty) {
                setSelectedProperty(updatedSelectedProperty);
              }

              // Wait a moment for selectedProperty to update
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Use navigateToProperty which properly handles form data and queries
              // This is the same function the chevron buttons use
              await navigateToProperty(nextPropertyToNavigate);

              console.log("✅ [Save] Navigation completed - showing next property");
              return; // Keep modal open, showing next property
            } else {
              console.log("❌ [Save] Current property not found in filteredProperties list");
              // If navigation failed, show success and close modal
              console.log("⚠️ [Save] Showing success alert and closing modal");
              Alert.alert("Success", "Property updated successfully!");
              handleCloseEditModal();
            }
          } else {
            // If only 1 property, show success and close modal
            console.log(`❌ [Save] Navigation skipped - only ${filteredProperties.length} property(ies)`);
            console.log("⚠️ [Save] Showing success alert and closing modal");
            Alert.alert("Success", "Property updated successfully!");
            handleCloseEditModal();
          }
        } else {
          console.log("ℹ️ [Save] Navigation skipped - keepModalOpen is true");
        }
      }
    } catch (error: any) {
      console.error("Error updating resident:", error);

      // Show user-friendly error message (matching web version)
      let errorMessage = "Failed to update property. Please try again.";

      if (error.response?.status === 403) {
        errorMessage =
          "Permission denied. You may not have permission to update this property, or your session may have expired. Please try logging in again.";
      } else if (error.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.response?.status === 400) {
        errorMessage =
          error.response?.data?.message ||
          "Invalid data. Please check your input and try again.";
      } else if (error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (!error.response) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setIsUpdatingResident(false);
    }
  };

  // Helper function to navigate to a specific property index
  const navigateToProperty = async (targetProperty: Property) => {
    // First, save current property if there are changes
    if (selectedProperty) {
      const hasChanges =
        editFormData.address !== selectedProperty.address ||
        editFormData.houseNumber !==
          (selectedProperty.houseNumber?.toString() || "") ||
        editFormData.status !== selectedProperty.status ||
        editFormData.notes !== (selectedProperty.notes || "") ||
        editFormData.lastVisited !==
          (selectedProperty.lastVisited
            ? new Date(selectedProperty.lastVisited).toISOString().split("T")[0]
            : "");

      if (hasChanges && isEditFormValid()) {
        // Save current property first (keep modal open)
        await handleUpdateResident(true);
        // Wait a bit for the save to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Update to target property
    setSelectedProperty(targetProperty);
    setEditPropertyId(targetProperty._id);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Initialize form data with target property values
    setEditFormData({
      address: targetProperty.address,
      houseNumber: targetProperty.houseNumber?.toString() || "",
      longitude: targetProperty.coordinates[0]?.toString() || "",
      latitude: targetProperty.coordinates[1]?.toString() || "",
      status: targetProperty.status,
      lastVisited: targetProperty.lastVisited
        ? new Date(targetProperty.lastVisited).toISOString().split("T")[0]
        : today,
      notes: targetProperty.notes || "",
      phone: "",
      email: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
      ownerMailingAddress: "",
    });

    // Invalidate queries to refresh property details
    void queryClient.invalidateQueries({
      queryKey: ["propertyDetails", targetProperty._id],
    });
  };

  // Handle previous property in edit modal (wrap around)
  const handlePreviousPropertyEdit = async () => {
    if (!selectedProperty || filteredProperties.length <= 1) return;

    // Find current property index
    const currentIndex = filteredProperties.findIndex(
      (p) => p._id === selectedProperty._id
    );

    if (currentIndex === -1) return;

    // Get previous property (wrap around to last if at first)
    const previousIndex =
      currentIndex === 0
        ? filteredProperties.length - 1
        : currentIndex - 1;
    const previousProperty = filteredProperties[previousIndex];

    await navigateToProperty(previousProperty);
  };

  // Handle next property in edit modal (wrap around)
  const handleNextPropertyEdit = async () => {
    if (!selectedProperty || filteredProperties.length <= 1) return;

    // Find current property index
    const currentIndex = filteredProperties.findIndex(
      (p) => p._id === selectedProperty._id
    );

    if (currentIndex === -1) return;

    // Get next property (wrap around to first if at end)
    const nextIndex = (currentIndex + 1) % filteredProperties.length;
    const nextProperty = filteredProperties[nextIndex];

    await navigateToProperty(nextProperty);
  };

  // Handle close edit modal
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditPropertyId(null); // Clear edit property ID to stop query
    setEditFormData({
      address: "",
      houseNumber: "",
      longitude: "",
      latitude: "",
      status: "not-visited",
      lastVisited: "",
      notes: "",
      phone: "",
      email: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
      ownerMailingAddress: "",
    });
    setEditValidationErrors([]);
  };

  // ========== Add Property Handlers ==========

  // Handle open add modal
  const handleOpenAddModal = () => {
    setIsAddModalOpen(true);
    setSelectedProperty(null); // Close any selected property
  };

  // Handle close add modal
  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
  };

  // Handle add property success
  const handleAddPropertySuccess = (newProperty: Property) => {
    setProperties((prev) => [...prev, newProperty]);
    setFilteredProperties((prev) => [...prev, newProperty]);
  };

  // Fetch detailed property data for export
  const fetchDetailedPropertyData = async (propertyId: string) => {
    try {
      const response = await apiInstance.get(`/residents/${propertyId}`);
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching property ${propertyId}:`, error);
      return null;
    }
  };

  // Export properties to CSV
  const exportToCSV = async (propertiesToExport: Property[]) => {
    try {
      setIsExporting(true);
      setExportProgress(0);

      // Fetch detailed data for all properties
      const detailedData: any[] = [];
      const total = propertiesToExport.length;

      for (let i = 0; i < total; i++) {
        const property = propertiesToExport[i];
        const detailed = await fetchDetailedPropertyData(property._id);

        if (detailed) {
          const row: any = {
            _id: property._id || "",
            address: property.address || "",
            houseNumber: property.houseNumber || "",
            longitude: property.coordinates?.[0] || "",
            latitude: property.coordinates?.[1] || "",
            status: property.status || "",
            lastVisited: property.lastVisited || "",
            notes: property.notes || "",
            dataSource: property.dataSource || "",
            phone: detailed.resident?.phone || "",
            email: detailed.resident?.email || "",
            ownerName: detailed.propertyData?.ownerName || "",
            ownerPhone: detailed.propertyData?.ownerPhone || "",
            ownerEmail: detailed.propertyData?.ownerEmail || "",
            ownerMailingAddress:
              detailed.propertyData?.ownerMailingAddress || "",
          };
          detailedData.push(row);
        }

        setExportProgress(Math.round(((i + 1) / total) * 100));
      }

      // Generate CSV content
      const headers = [
        "_id",
        "address",
        "houseNumber",
        "longitude",
        "latitude",
        "status",
        "lastVisited",
        "notes",
        "dataSource",
        "phone",
        "email",
        "ownerName",
        "ownerPhone",
        "ownerEmail",
        "ownerMailingAddress",
      ];

      const csvRows = [
        headers.join(","),
        ...detailedData.map((row) =>
          headers
            .map((header) => {
              const value = row[header] || "";
              // Escape commas and quotes in CSV
              if (
                typeof value === "string" &&
                (value.includes(",") ||
                  value.includes('"') ||
                  value.includes("\n"))
              ) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            })
            .join(",")
        ),
      ];

      const csvContent = csvRows.join("\n");

      // Save file using legacy FileSystem API
      const fileName = `properties_export_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      // Auto-save to Downloads folder
      try {
        if (Platform.OS === "android") {
          // For Android: Use Storage Access Framework to save to Downloads
          const { StorageAccessFramework } = FileSystem;
          if (StorageAccessFramework) {
            const permissions =
              await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              // Create file in Downloads folder
              const downloadFileUri =
                await StorageAccessFramework.createFileAsync(
                  permissions.directoryUri,
                  fileName,
                  "text/csv"
                );
              // Read the file content and write to Downloads
              const fileContent = await FileSystem.readAsStringAsync(fileUri);
              await FileSystem.writeAsStringAsync(downloadFileUri, fileContent);
              Alert.alert("Success", `File saved to Downloads: ${fileName}`);
            } else {
              // Fallback to sharing if permission denied
              const SharingModule = await import("expo-sharing").catch(
                () => null
              );
              if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
                await SharingModule.shareAsync(fileUri, {
                  mimeType: "text/csv",
                  dialogTitle: "Save CSV file",
                });
              } else {
                Alert.alert("Success", `File saved to: ${fileUri}`);
              }
            }
          } else {
            // Fallback to sharing
            const SharingModule = await import("expo-sharing").catch(
              () => null
            );
            if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
              await SharingModule.shareAsync(fileUri, {
                mimeType: "text/csv",
                dialogTitle: "Save CSV file",
              });
            } else {
              Alert.alert("Success", `File saved to: ${fileUri}`);
            }
          }
        } else {
          // For iOS: Share with option to save to Files
          const SharingModule = await import("expo-sharing").catch(() => null);
          if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
            await SharingModule.shareAsync(fileUri, {
              mimeType: "text/csv",
              dialogTitle: "Save CSV file",
              UTI: "public.comma-separated-values-text",
            });
          } else {
            Alert.alert("Success", `File saved to: ${fileUri}`);
          }
        }
      } catch (shareError) {
        console.error("Sharing error:", shareError);
        Alert.alert("Success", `File saved to: ${fileUri}`);
      }

      setIsExportModalOpen(false);
      Alert.alert("Success", "Properties exported successfully!");
    } catch (error: any) {
      console.error("Export error:", error);
      Alert.alert(
        "Error",
        `Failed to export: ${error.message || "Unknown error"}`
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Export properties to Excel
  const exportToExcel = async (propertiesToExport: Property[]) => {
    try {
      setIsExporting(true);
      setExportProgress(0);

      // Fetch detailed data for all properties
      const detailedData: any[] = [];
      const total = propertiesToExport.length;

      for (let i = 0; i < total; i++) {
        const property = propertiesToExport[i];
        const detailed = await fetchDetailedPropertyData(property._id);

        if (detailed) {
          const row: any = {
            _id: property._id || "",
            address: property.address || "",
            houseNumber: property.houseNumber || "",
            longitude: property.coordinates?.[0] || "",
            latitude: property.coordinates?.[1] || "",
            status: property.status || "",
            lastVisited: property.lastVisited || "",
            notes: property.notes || "",
            dataSource: property.dataSource || "",
            phone: detailed.resident?.phone || "",
            email: detailed.resident?.email || "",
            ownerName: detailed.propertyData?.ownerName || "",
            ownerPhone: detailed.propertyData?.ownerPhone || "",
            ownerEmail: detailed.propertyData?.ownerEmail || "",
            ownerMailingAddress:
              detailed.propertyData?.ownerMailingAddress || "",
          };
          detailedData.push(row);
        }

        setExportProgress(Math.round(((i + 1) / total) * 100));
      }

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(detailedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Properties");

      // Generate Excel file as base64 directly
      const wbout = XLSX.write(workbook, {
        type: "base64",
        bookType: "xlsx",
      });

      // Save file using legacy FileSystem API
      const fileName = `properties_export_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      const fileUri = FileSystem.documentDirectory + fileName;

      // Save the file with base64 encoding
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Auto-save to Downloads folder
      try {
        if (Platform.OS === "android") {
          // For Android: Use Storage Access Framework to save to Downloads
          const { StorageAccessFramework } = FileSystem;
          if (StorageAccessFramework) {
            const permissions =
              await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              // Create file in Downloads folder
              const downloadFileUri =
                await StorageAccessFramework.createFileAsync(
                  permissions.directoryUri,
                  fileName,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                );
              // Read the file content and write to Downloads
              const fileContent = await FileSystem.readAsStringAsync(fileUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              await FileSystem.writeAsStringAsync(
                downloadFileUri,
                fileContent,
                {
                  encoding: FileSystem.EncodingType.Base64,
                }
              );
              Alert.alert("Success", `File saved to Downloads: ${fileName}`);
            } else {
              // Fallback to sharing if permission denied
              const SharingModule = await import("expo-sharing").catch(
                () => null
              );
              if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
                await SharingModule.shareAsync(fileUri, {
                  mimeType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  dialogTitle: "Save Excel file",
                });
              } else {
                Alert.alert("Success", `File saved to: ${fileUri}`);
              }
            }
          } else {
            // Fallback to sharing
            const SharingModule = await import("expo-sharing").catch(
              () => null
            );
            if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
              await SharingModule.shareAsync(fileUri, {
                mimeType:
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                dialogTitle: "Save Excel file",
              });
            } else {
              Alert.alert("Success", `File saved to: ${fileUri}`);
            }
          }
        } else {
          // For iOS: Share with option to save to Files
          const SharingModule = await import("expo-sharing").catch(() => null);
          if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
            await SharingModule.shareAsync(fileUri, {
              mimeType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              dialogTitle: "Save Excel file",
              UTI: "org.openxmlformats.spreadsheetml.sheet",
            });
          } else {
            Alert.alert("Success", `File saved to: ${fileUri}`);
          }
        }
      } catch (shareError) {
        console.error("Sharing error:", shareError);
        Alert.alert("Success", `File saved to: ${fileUri}`);
      }

      setIsExportModalOpen(false);
      Alert.alert("Success", "Properties exported successfully!");
    } catch (error: any) {
      console.error("Export error:", error);
      Alert.alert(
        "Error",
        `Failed to export: ${error.message || "Unknown error"}`
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Handle export
  const handleExport = async () => {
    const propertiesToExport =
      exportScope === "all" ? properties : filteredProperties;

    if (propertiesToExport.length === 0) {
      Alert.alert("No Properties", "There are no properties to export.");
      return;
    }

    if (exportFormat === "csv") {
      await exportToCSV(propertiesToExport);
    } else {
      await exportToExcel(propertiesToExport);
    }
  };

  // Export single property to CSV
  const exportPropertyToCSV = async (property: Property) => {
    try {
      setIsPropertyExporting(true);
      setPropertyExportProgress(0);

      // Fetch detailed data for this property
      const detailed = await fetchDetailedPropertyData(property._id);

      if (!detailed) {
        Alert.alert("Error", "Failed to fetch property details");
        setIsPropertyExporting(false);
        return;
      }

      setPropertyExportProgress(50);

      // Prepare data for export
      const propertyData = {
        _id: property._id || "",
        address: detailed.resident?.address || property.address || "",
        houseNumber:
          detailed.resident?.houseNumber || property.houseNumber || "",
        longitude: property.coordinates?.[0] || "",
        latitude: property.coordinates?.[1] || "",
        status: detailed.resident?.status || property.status || "",
        lastVisited:
          detailed.resident?.lastVisited || property.lastVisited || "",
        notes: detailed.resident?.notes || property.notes || "",
        dataSource: property.dataSource || "",
        phone: detailed.resident?.phone || "",
        email: detailed.resident?.email || "",
        ownerName: detailed.propertyData?.ownerName || "",
        ownerPhone: detailed.propertyData?.ownerPhone || "",
        ownerEmail: detailed.propertyData?.ownerEmail || "",
        ownerMailingAddress: detailed.propertyData?.ownerMailingAddress || "",
      };

      // Generate CSV content
      const headers = [
        "_id",
        "address",
        "houseNumber",
        "longitude",
        "latitude",
        "status",
        "lastVisited",
        "notes",
        "dataSource",
        "phone",
        "email",
        "ownerName",
        "ownerPhone",
        "ownerEmail",
        "ownerMailingAddress",
      ];

      const csvRows = [
        headers.join(","),
        headers
          .map((header) => {
            const value = (propertyData as any)[header] || "";
            if (
              typeof value === "string" &&
              (value.includes(",") ||
                value.includes('"') ||
                value.includes("\n"))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(","),
      ];

      const csvContent = csvRows.join("\n");
      const fileName = `property_${property._id}_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      setPropertyExportProgress(100);

      // Auto-save to Downloads folder
      try {
        if (Platform.OS === "android") {
          // For Android: Use Storage Access Framework to save to Downloads
          const { StorageAccessFramework } = FileSystem;
          if (StorageAccessFramework) {
            const permissions =
              await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              // Create file in Downloads folder
              const downloadFileUri =
                await StorageAccessFramework.createFileAsync(
                  permissions.directoryUri,
                  fileName,
                  "text/csv"
                );
              // Read the file content and write to Downloads
              const fileContent = await FileSystem.readAsStringAsync(fileUri);
              await FileSystem.writeAsStringAsync(downloadFileUri, fileContent);
              Alert.alert("Success", `File saved to Downloads: ${fileName}`);
            } else {
              // Fallback to sharing if permission denied
              const SharingModule = await import("expo-sharing").catch(
                () => null
              );
              if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
                await SharingModule.shareAsync(fileUri, {
                  mimeType: "text/csv",
                  dialogTitle: "Save CSV file",
                });
              } else {
                Alert.alert("Success", `File saved to: ${fileUri}`);
              }
            }
          } else {
            // Fallback to sharing
            const SharingModule = await import("expo-sharing").catch(
              () => null
            );
            if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
              await SharingModule.shareAsync(fileUri, {
                mimeType: "text/csv",
                dialogTitle: "Save CSV file",
              });
            } else {
              Alert.alert("Success", `File saved to: ${fileUri}`);
            }
          }
        } else {
          // For iOS: Share with option to save to Files
          const SharingModule = await import("expo-sharing").catch(() => null);
          if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
            await SharingModule.shareAsync(fileUri, {
              mimeType: "text/csv",
              dialogTitle: "Save CSV file",
              UTI: "public.comma-separated-values-text",
            });
          } else {
            Alert.alert("Success", `File saved to: ${fileUri}`);
          }
        }
      } catch (shareError) {
        console.error("Sharing error:", shareError);
        Alert.alert("Success", `File saved to: ${fileUri}`);
      }

      setIsPropertyExportModalOpen(false);
      Alert.alert("Success", "Property exported successfully!");
    } catch (error: any) {
      console.error("Export error:", error);
      Alert.alert(
        "Error",
        `Failed to export: ${error.message || "Unknown error"}`
      );
    } finally {
      setIsPropertyExporting(false);
      setPropertyExportProgress(0);
    }
  };

  // Export single property to Excel
  const exportPropertyToExcel = async (property: Property) => {
    try {
      setIsPropertyExporting(true);
      setPropertyExportProgress(0);

      // Fetch detailed data for this property
      const detailed = await fetchDetailedPropertyData(property._id);

      if (!detailed) {
        Alert.alert("Error", "Failed to fetch property details");
        setIsPropertyExporting(false);
        return;
      }

      setPropertyExportProgress(50);

      // Prepare data for export
      const propertyData = {
        _id: property._id || "",
        address: detailed.resident?.address || property.address || "",
        houseNumber:
          detailed.resident?.houseNumber || property.houseNumber || "",
        longitude: property.coordinates?.[0] || "",
        latitude: property.coordinates?.[1] || "",
        status: detailed.resident?.status || property.status || "",
        lastVisited:
          detailed.resident?.lastVisited || property.lastVisited || "",
        notes: detailed.resident?.notes || property.notes || "",
        dataSource: property.dataSource || "",
        phone: detailed.resident?.phone || "",
        email: detailed.resident?.email || "",
        ownerName: detailed.propertyData?.ownerName || "",
        ownerPhone: detailed.propertyData?.ownerPhone || "",
        ownerEmail: detailed.propertyData?.ownerEmail || "",
        ownerMailingAddress: detailed.propertyData?.ownerMailingAddress || "",
      };

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet([propertyData]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Property");

      // Generate Excel file as base64 directly
      const wbout = XLSX.write(workbook, {
        type: "base64",
        bookType: "xlsx",
      });

      // Save file using legacy FileSystem API
      const fileName = `property_${property._id}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      const fileUri = FileSystem.documentDirectory + fileName;

      // Save the file with base64 encoding
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setPropertyExportProgress(100);

      // Auto-save to Downloads folder
      try {
        if (Platform.OS === "android") {
          // For Android: Use Storage Access Framework to save to Downloads
          const { StorageAccessFramework } = FileSystem;
          if (StorageAccessFramework) {
            const permissions =
              await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              // Create file in Downloads folder
              const downloadFileUri =
                await StorageAccessFramework.createFileAsync(
                  permissions.directoryUri,
                  fileName,
                  "text/csv"
                );
              // Read the file content and write to Downloads
              const fileContent = await FileSystem.readAsStringAsync(fileUri);
              await FileSystem.writeAsStringAsync(downloadFileUri, fileContent);
              Alert.alert("Success", `File saved to Downloads: ${fileName}`);
            } else {
              // Fallback to sharing if permission denied
              const SharingModule = await import("expo-sharing").catch(
                () => null
              );
              if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
                await SharingModule.shareAsync(fileUri, {
                  mimeType: "text/csv",
                  dialogTitle: "Save CSV file",
                });
              } else {
                Alert.alert("Success", `File saved to: ${fileUri}`);
              }
            }
          } else {
            // Fallback to sharing
            const SharingModule = await import("expo-sharing").catch(
              () => null
            );
            if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
              await SharingModule.shareAsync(fileUri, {
                mimeType: "text/csv",
                dialogTitle: "Save CSV file",
              });
            } else {
              Alert.alert("Success", `File saved to: ${fileUri}`);
            }
          }
        } else {
          // For iOS: Share with option to save to Files
          const SharingModule = await import("expo-sharing").catch(() => null);
          if (SharingModule && (await SharingModule.isAvailableAsync?.())) {
            await SharingModule.shareAsync(fileUri, {
              mimeType: "text/csv",
              dialogTitle: "Save CSV file",
              UTI: "public.comma-separated-values-text",
            });
          } else {
            Alert.alert("Success", `File saved to: ${fileUri}`);
          }
        }
      } catch (shareError) {
        console.error("Sharing error:", shareError);
        Alert.alert("Success", `File saved to: ${fileUri}`);
      }

      setIsPropertyExportModalOpen(false);
      Alert.alert("Success", "Property exported successfully!");
    } catch (error: any) {
      console.error("Export error:", error);
      Alert.alert(
        "Error",
        `Failed to export: ${error.message || "Unknown error"}`
      );
    } finally {
      setIsPropertyExporting(false);
      setPropertyExportProgress(0);
    }
  };

  // Handle property export
  const handlePropertyExport = async () => {
    if (!selectedProperty) {
      Alert.alert("Error", "No property selected");
      return;
    }

    if (propertyExportFormat === "csv") {
      await exportPropertyToCSV(selectedProperty);
    } else {
      await exportPropertyToExcel(selectedProperty);
    }
  };

  // Track sheet index for conditional rendering
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  // Handle sheet changes
  const handleSheetChanges = useCallback((index: number) => {
    setCurrentSheetIndex(index);
  }, []);

  // Get marker color based on status
  const getMarkerColor = (status: Property["status"]): string => {
    return statusColors[status] || statusColors["not-visited"];
  };

  // Get status display name with emojis (matching web client)
  const getStatusDisplayName = (status: Property["status"]): string => {
    const statusMap: Record<Property["status"], string> = {
      "not-visited": "⏳ Not Visited",
      interested: "✓ Interested",
      visited: "✓ Visited",
      appointment: "📅 Appointment",
      "follow-up": "🔄 Follow-up",
      "not-interested": "❌ Not Interested",
      "not-opened": "🚪 Not Opened",
    };
    return statusMap[status] || "⏳ Not Visited";
  };

  // Get status display name without emoji (for legend)
  const getStatusDisplayNamePlain = (status: Property["status"]): string => {
    const statusMap: Record<Property["status"], string> = {
      "not-visited": "Not Visited",
      interested: "Interested",
      visited: "Visited",
      appointment: "Appointment",
      "follow-up": "Follow-up",
      "not-interested": "Not Interested",
      "not-opened": "Not Opened",
    };
    return statusMap[status] || "Not Visited";
  };

  // Calculate status counts (matching web version)
  const statusCounts = useMemo(() => {
    const counts: Record<Property["status"], number> = {
      "not-visited": 0,
      interested: 0,
      visited: 0,
      appointment: 0,
      "follow-up": 0,
      "not-interested": 0,
      "not-opened": 0,
    };

    properties.forEach((property) => {
      if (property.status && counts.hasOwnProperty(property.status)) {
        counts[property.status] = (counts[property.status] || 0) + 1;
      }
    });

    return counts;
  }, [properties]);

  // Get short address (house number + street name without full address)
  const getShortAddress = (property: Property): string => {
    const addressParts = property.address.split(",")[0].split(" ");
    const streetName = addressParts.slice(1).join(" ");
    return `${property.houseNumber} ${streetName}`;
  };

  // Map status to pinColor (react-native-maps only supports predefined colors)
  const getPinColor = (
    status: Property["status"]
  ): "red" | "green" | "purple" | "orange" | "blue" | "gray" => {
    const colorMap: Record<
      Property["status"],
      "red" | "green" | "purple" | "orange" | "blue" | "gray"
    > = {
      "not-visited": "red",
      interested: "orange",
      visited: "green",
      appointment: "blue",
      "follow-up": "purple",
      "not-interested": "gray",
      "not-opened": "orange",
    };
    return colorMap[status] || "red";
  };

  console.log("🎯 Render decision point:", {
    isLoading,
    hasError: !!error,
    hasData: !!data,
    hasTerritory: !!territory,
    showMap,
    hasInitialRegion: !!initialRegion,
    timestamp: new Date().toISOString(),
  });

  if (isLoading) {
    console.log("⏳ Rendering: Loading state");
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.primary[500]}
        />
        <AppHeader
          title="Map View"
          showBackButton={true}
          onBackPress={handleBack}
          backgroundColor={COLORS.primary[500]}
          textColor={COLORS.white}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Loading territory map...</Text>
        </View>
      </View>
    );
  }

  // Only show error if loading is complete AND there's an actual error
  // Don't show error if data is loaded successfully but territory state hasn't updated yet (race condition)
  if (!isLoading && error && !data?.success) {
    console.error("❌ Rendering: Error state", {
      error: error?.message,
      hasData: !!data,
      hasTerritory: !!territory,
      dataSuccess: data?.success,
    });
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.primary[500]}
        />
        <AppHeader
          title="Map View"
          showBackButton={true}
          onBackPress={handleBack}
          backgroundColor={COLORS.primary[500]}
          textColor={COLORS.white}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load territory map</Text>
          <Body2 color={COLORS.text.secondary} style={styles.errorSubtext}>
            {error ? "Please try again later" : "Territory not found"}
          </Body2>
        </View>
      </View>
    );
  }

  // Show error only if data was fetched but zone is missing (not a race condition)
  if (
    !isLoading &&
    data?.success &&
    data?.data &&
    !data?.data?.zone &&
    !territory
  ) {
    console.error("❌ Rendering: Error state - Zone not found in data", {
      hasData: !!data,
      hasZone: !!data?.data?.zone,
      hasTerritory: !!territory,
    });
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.primary[500]}
        />
        <AppHeader
          title="Map View"
          showBackButton={true}
          onBackPress={handleBack}
          backgroundColor={COLORS.primary[500]}
          textColor={COLORS.white}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load territory map</Text>
          <Body2 color={COLORS.text.secondary} style={styles.errorSubtext}>
            Territory not found
          </Body2>
        </View>
      </View>
    );
  }

  // Don't render map if territory is still loading or not available
  if (!territory) {
    console.log("⏸️ Rendering: Waiting for territory data");
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.primary[500]}
        />
        <AppHeader
          title="Map View"
          showBackButton={true}
          onBackPress={handleBack}
          backgroundColor={COLORS.primary[500]}
          textColor={COLORS.white}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Loading territory map...</Text>
        </View>
      </View>
    );
  }

  console.log("✅ Rendering: Main map view");

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primary[500]}
      />
      <AppHeader
        title={territory.name || "Map View"}
        subtext={`${properties.length} properties`}
        showBackButton={true}
        onBackPress={handleBack}
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
        rightActionButton={{
          iconName: "download-outline",
          onPress: () => {
            setIsExportModalOpen(true);
          },
          backgroundColor: COLORS.primary[300],
          iconColor: COLORS.white,
        }}
      />

      {/* Status Legend - Horizontal Scrollable (matching web version) */}
      <View style={styles.statusLegendContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusLegendContent}
        >
          {/* Add Property Button - First item in scrollable legend */}
          <TouchableOpacity
            style={styles.addPropertyButton}
            onPress={handleOpenAddModal}
            activeOpacity={0.7}
          >
            <Ionicons
              name="add-circle-outline"
              size={responsiveScale(16)}
              color={COLORS.primary[500]}
            />
            <Text style={styles.addPropertyButtonText}>Add Property</Text>
          </TouchableOpacity>

          {/* Status Legend Items */}
          {Object.entries(statusColors).map(([status, color]) => {
            const count = statusCounts[status as Property["status"]] || 0;
            return (
              <View key={status} style={styles.statusLegendItem}>
                <View
                  style={[styles.statusLegendDot, { backgroundColor: color }]}
                />
                <Text style={styles.statusLegendText}>
                  {getStatusDisplayNamePlain(status as Property["status"])}
                </Text>
                <Text style={styles.statusLegendCount}>({count})</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        {(() => {
          console.log("🎨 Rendering MapView container", {
            showMap,
            hasInitialRegion: !!initialRegion,
            initialRegion,
            timestamp: new Date().toISOString(),
          });
          return null;
        })()}
        {showMap && initialRegion ? (
          (() => {
            console.log("🗺️ Rendering MapView component", {
              initialRegion,
              boundaryCoordinatesCount: boundaryCoordinates.length,
              timestamp: new Date().toISOString(),
            });
            return (
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={initialRegion}
                region={initialRegion}
                mapType="standard"
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={true}
                zoomEnabled={true}
                scrollEnabled={true}
                rotateEnabled={true}
                pitchEnabled={false}
                loadingEnabled={true}
                renderToHardwareTextureAndroid={true}
                onPress={(event) => {
                  // Handle map click when add modal is open (matching web version)
                  if (isAddModalOpen && event.nativeEvent.coordinate) {
                    const { latitude, longitude } =
                      event.nativeEvent.coordinate;
                    addPropertyModalRef.current?.updateCoordinates(
                      latitude,
                      longitude
                    );
                  }
                }}
                onMapReady={() => {
                  console.log("✅ MapView onMapReady callback fired");
                  console.log("✅ Map is ready", {
                    hasMapRef: !!mapRef.current,
                    boundaryCoordinatesCount: boundaryCoordinates.length,
                    timestamp: new Date().toISOString(),
                  });
                  // Fit map to coordinates after map is ready
                  if (mapRef.current && boundaryCoordinates.length > 0) {
                    console.log("📍 Fitting map to boundary coordinates...");
                    setTimeout(() => {
                      try {
                        mapRef.current?.fitToCoordinates(boundaryCoordinates, {
                          edgePadding: {
                            top: 50,
                            right: 50,
                            bottom: 50,
                            left: 50,
                          },
                          animated: true,
                        });
                        console.log(
                          "✅ Map fitted to coordinates successfully"
                        );
                      } catch (err) {
                        console.error(
                          "❌ Error fitting map to coordinates:",
                          err
                        );
                      }
                    }, 500);
                  } else {
                    console.warn(
                      "⚠️ Cannot fit map - missing mapRef or boundary coordinates"
                    );
                  }
                }}
              >
                {/* Territory Boundary Polygon */}
                {boundaryCoordinates.length > 0 && (
                  <Polygon
                    coordinates={boundaryCoordinates}
                    strokeColor={COLORS.primary[500]}
                    fillColor={COLORS.primary[200] + "80"} // 50% opacity
                    strokeWidth={2}
                  />
                )}

                {/* Property Markers - Show filtered properties */}
                {filteredProperties.map((property) => (
                  <Marker
                    key={property._id}
                    coordinate={{
                      latitude: property.coordinates[1],
                      longitude: property.coordinates[0],
                    }}
                    pinColor={getPinColor(property.status)}
                    onPress={() => handlePropertyPress(property)}
                    title={property.address}
                    description={`House #${
                      property.houseNumber
                    } - ${property.status.replace("-", " ")}`}
                  />
                ))}
              </MapView>
            );
          })()
        ) : (
          <View style={styles.mapPlaceholder}>
            {(() => {
              console.log("⏳ Showing map placeholder", {
                showMap,
                hasInitialRegion: !!initialRegion,
                isLoading,
                timestamp: new Date().toISOString(),
              });
              return null;
            })()}
            <ActivityIndicator size="large" color={COLORS.primary[500]} />
            <Text style={styles.placeholderText}>
              {initialRegion
                ? "Initializing map..."
                : "Calculating map region..."}
            </Text>
          </View>
        )}
      </View>

      {/* Property List Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        enablePanDownToClose={false}
        enableDynamicSizing={false}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={{ display: "none" }}
      >
        {/* Fixed Header and Filters - stays at top when scrolling */}
        <View style={styles.bottomSheetHeaderContainer}>
          {/* Drag Handle */}
          <TouchableOpacity
            style={styles.dragHandle}
            onPress={() => {
              if (currentSheetIndex === 0) {
                bottomSheetRef.current?.snapToIndex(1);
              } else {
                bottomSheetRef.current?.snapToIndex(0);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.dragHandleBar} />
          </TouchableOpacity>

          {/* Header with Property Count */}
          <View style={styles.listHeader}>
            <View style={styles.listHeaderContent}>
              <Text style={styles.listHeaderTitle}>Properties</Text>
              <Text style={styles.listHeaderCount}>
                {filteredProperties.length}{" "}
                {filteredProperties.length === 1 ? "property" : "properties"}
                {filteredProperties.length !== properties.length &&
                  ` of ${properties.length}`}
              </Text>
            </View>
            {currentSheetIndex === 1 && (
              <TouchableOpacity
                style={styles.closeListButton}
                onPress={() => bottomSheetRef.current?.snapToIndex(0)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeListButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Stats Cards (matching web client) */}
          {currentSheetIndex === 1 && (
            <View style={styles.statsContainer}>
              {/* Total Homes Card - Gradient: indigo-500 via purple-500 to pink-500 */}
              <LinearGradient
                colors={["#6366F1", "#A855F7", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
              >
                <Ionicons
                  name="home"
                  size={responsiveScale(20)}
                  color={COLORS.white}
                />
                <Text style={styles.statCardValue}>{stats.totalHomes}</Text>
                <Text style={styles.statCardLabel}>Total Homes</Text>
              </LinearGradient>

              {/* Visited Card - Gradient: emerald-400 via teal-500 to cyan-500 */}
              <LinearGradient
                colors={["#34D399", "#14B8A6", "#06B6D4"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={responsiveScale(20)}
                  color={COLORS.white}
                />
                <Text style={styles.statCardValue}>{stats.visited}</Text>
                <Text style={styles.statCardLabel}>Visited</Text>
              </LinearGradient>

              {/* Remaining Card - Gradient: amber-400 via orange-500 to red-500 */}
              <LinearGradient
                colors={["#FBBF24", "#F97316", "#EF4444"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
              >
                <Ionicons
                  name="time-outline"
                  size={responsiveScale(20)}
                  color={COLORS.white}
                />
                <Text style={styles.statCardValue}>{stats.remaining}</Text>
                <Text style={styles.statCardLabel}>Remaining</Text>
              </LinearGradient>
            </View>
          )}

          {/* Fixed Filters Section - doesn't scroll */}
          {currentSheetIndex === 1 && (
            <View style={styles.filtersContainer}>
              {/* Search Input */}
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search-outline"
                  size={responsiveScale(18)}
                  color={COLORS.text.secondary}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by address or house number"
                  placeholderTextColor={COLORS.text.light}
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                {searchTerm.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchTerm("")}
                    style={styles.clearSearchButton}
                  >
                    <Ionicons
                      name="close-circle"
                      size={responsiveScale(18)}
                      color={COLORS.text.secondary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Sort Buttons */}
              <View style={styles.sortButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "Sequential" && styles.sortButtonActive,
                  ]}
                  onPress={() => setSortBy("Sequential")}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      ...(sortBy === "Sequential"
                        ? [styles.sortButtonTextActive]
                        : []),
                    ]}
                  >
                    Sequential
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    ...(sortBy === "Odd" ? [styles.sortButtonActive] : []),
                  ]}
                  onPress={() => setSortBy("Odd")}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      ...(sortBy === "Odd"
                        ? [styles.sortButtonTextActive]
                        : []),
                    ]}
                  >
                    Odd
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    ...(sortBy === "Even" ? [styles.sortButtonActive] : []),
                  ]}
                  onPress={() => setSortBy("Even")}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      ...(sortBy === "Even"
                        ? [styles.sortButtonTextActive]
                        : []),
                    ]}
                  >
                    Even
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Filter Dropdowns */}
              <View style={styles.filterDropdownsContainer}>
                {/* Status Filter */}
                <View style={styles.filterDropdownWrapper}>
                  <TouchableOpacity
                    style={styles.filterDropdown}
                    onPress={() => setStatusDropdownVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.filterDropdownText}>
                      {statusFilter === "All Status"
                        ? "All Status"
                        : getStatusDisplayName(
                            statusFilter as Property["status"]
                          )}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={responsiveScale(16)}
                      color={COLORS.text.secondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Data Source Filter */}
                <View style={styles.filterDropdownWrapper}>
                  <TouchableOpacity
                    style={styles.filterDropdown}
                    onPress={() => setDataSourceDropdownVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.filterDropdownText}>
                      {dataSourceFilter === "All Sources"
                        ? "All Sources"
                        : dataSourceFilter === "AUTO"
                        ? "Auto-Detected"
                        : "Manually Added"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={responsiveScale(16)}
                      color={COLORS.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Scrollable Property List */}
        <BottomSheetScrollView
          style={styles.propertyListScroll}
          contentContainerStyle={styles.propertyListContent}
          showsVerticalScrollIndicator={true}
        >
          {filteredProperties.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons
                name="search-outline"
                size={responsiveScale(48)}
                color={COLORS.text.light}
              />
              <Text style={styles.emptyStateText}>No properties found</Text>
              <Body2
                color={COLORS.text.secondary}
                style={styles.emptyStateSubtext}
              >
                Try adjusting your filters or search term
              </Body2>
            </View>
          ) : (
            filteredProperties.map((property) => (
              <TouchableOpacity
                key={property._id}
                style={[
                  styles.propertyCard,
                  highlightedPropertyId === property._id &&
                    styles.propertyCardHighlighted,
                ]}
                onPress={() => handlePropertyClick(property)}
                activeOpacity={0.7}
              >
                <View style={styles.propertyCardContent}>
                  {/* Header: Address with Data Source Badge and Status Badge */}
                  <View style={styles.propertyCardHeader}>
                    <View style={styles.propertyCardTopRow}>
                      <View style={styles.propertyCardAddressRow}>
                        <Text
                          style={styles.propertyCardAddress}
                          numberOfLines={2}
                        >
                          {property.address}
                        </Text>
                        {property.dataSource && (
                          <View
                            style={[
                              styles.dataSourceBadge,
                              property.dataSource === "MANUAL"
                                ? styles.dataSourceBadgeManual
                                : styles.dataSourceBadgeAuto,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dataSourceBadgeText,
                                property.dataSource === "MANUAL"
                                  ? styles.dataSourceBadgeTextManual
                                  : styles.dataSourceBadgeTextAuto,
                              ]}
                            >
                              {property.dataSource === "MANUAL"
                                ? "Manual"
                                : "Auto"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.propertyCardRight}>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                getMarkerColor(property.status) + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: getMarkerColor(property.status) },
                            ]}
                          >
                            {getStatusDisplayName(property.status)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleEditProperty(property);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="create-outline"
                            size={responsiveScale(16)}
                            color={COLORS.text.secondary}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Notes */}
                  <Text style={styles.propertyNotes}>
                    {property.notes || "No note"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Status Filter Modal */}
      <Modal
        visible={statusDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setStatusDropdownVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setStatusDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Status</Text>
              <TouchableOpacity
                onPress={() => setStatusDropdownVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.modalOptions}>
              <Pressable
                style={[
                  styles.modalOption,
                  statusFilter === "All Status" && styles.modalOptionActive,
                ]}
                onPress={() => {
                  setStatusFilter("All Status");
                  setStatusDropdownVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ...(statusFilter === "All Status"
                      ? [styles.modalOptionTextActive]
                      : []),
                  ]}
                >
                  All Status
                </Text>
              </Pressable>
              {(
                [
                  "not-visited",
                  "interested",
                  "visited",
                  "appointment",
                  "follow-up",
                  "not-interested",
                  "not-opened",
                ] as Property["status"][]
              ).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.modalOption,
                    ...(statusFilter === status
                      ? [styles.modalOptionActive]
                      : []),
                  ]}
                  onPress={() => {
                    setStatusFilter(status);
                    setStatusDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      ...(statusFilter === status
                        ? [styles.modalOptionTextActive]
                        : []),
                    ]}
                  >
                    {getStatusDisplayName(status)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Data Source Filter Modal */}
      <Modal
        visible={dataSourceDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDataSourceDropdownVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDataSourceDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Source</Text>
              <TouchableOpacity
                onPress={() => setDataSourceDropdownVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.modalOptions}>
              <Pressable
                style={[
                  styles.modalOption,
                  dataSourceFilter === "All Sources" &&
                    styles.modalOptionActive,
                ]}
                onPress={() => {
                  setDataSourceFilter("All Sources");
                  setDataSourceDropdownVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ...(dataSourceFilter === "All Sources"
                      ? [styles.modalOptionTextActive]
                      : []),
                  ]}
                >
                  All Sources
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalOption,
                  ...(dataSourceFilter === "AUTO"
                    ? [styles.modalOptionActive]
                    : []),
                ]}
                onPress={() => {
                  setDataSourceFilter("AUTO");
                  setDataSourceDropdownVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ...(dataSourceFilter === "AUTO"
                      ? [styles.modalOptionTextActive]
                      : []),
                  ]}
                >
                  Auto-Detected
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalOption,
                  ...(dataSourceFilter === "MANUAL"
                    ? [styles.modalOptionActive]
                    : []),
                ]}
                onPress={() => {
                  setDataSourceFilter("MANUAL");
                  setDataSourceDropdownVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ...(dataSourceFilter === "MANUAL"
                      ? [styles.modalOptionTextActive]
                      : []),
                  ]}
                >
                  Manually Added
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Property Details Modal */}
      <Modal
        visible={isDetailModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseDetailModal}
      >
        <Pressable
          style={styles.propertyModalOverlay}
          onPress={handleCloseDetailModal}
        >
          <View style={styles.propertyModalContent}>
            {/* Modal Header */}
            <View style={styles.propertyModalHeader}>
              <Text style={styles.propertyModalTitle}>Property Details</Text>
              <View style={styles.propertyModalHeaderButtons}>
                {selectedProperty && (
                  <TouchableOpacity
                    onPress={() => handleEditProperty(selectedProperty)}
                    style={styles.propertyModalEditButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="create-outline"
                      size={responsiveScale(20)}
                      color={COLORS.primary[500]}
                    />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleCloseDetailModal}
                  style={styles.propertyModalCloseButton}
                >
                  <Ionicons
                    name="close"
                    size={responsiveScale(24)}
                    color={COLORS.text.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Content */}
            {isLoadingPropertyDetails ? (
              <View style={styles.propertyModalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary[500]} />
                <Text style={styles.propertyModalLoadingText}>
                  Loading property details...
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.propertyModalScroll}
                contentContainerStyle={styles.propertyModalScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={false}
              >
                {detailedProperty ? (
                  <>
                    {/* Top Section - Header */}
                    <View style={styles.propertyDetailHeader}>
                      <View style={styles.propertyDetailHeaderRow}>
                        <View
                          style={[
                            styles.propertyDetailIcon,
                            {
                              backgroundColor:
                                getMarkerColor(
                                  detailedProperty.resident?.status ||
                                    "not-visited"
                                ) + "20",
                            },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={responsiveScale(24)}
                            color={getMarkerColor(
                              detailedProperty.resident?.status || "not-visited"
                            )}
                          />
                        </View>
                        <View style={styles.propertyDetailHeaderContent}>
                          <Text style={styles.propertyDetailAddress}>
                            {detailedProperty.resident?.address ||
                              selectedProperty?.address}
                          </Text>
                          <View style={styles.propertyDetailStatusBadge}>
                            <View
                              style={[
                                styles.propertyDetailStatusBadgeInner,
                                {
                                  backgroundColor:
                                    getMarkerColor(
                                      detailedProperty.resident?.status ||
                                        "not-visited"
                                    ) + "20",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.propertyDetailStatusText,
                                  {
                                    color: getMarkerColor(
                                      detailedProperty.resident?.status ||
                                        "not-visited"
                                    ),
                                  },
                                ]}
                              >
                                {getStatusDisplayName(
                                  (detailedProperty.resident?.status ||
                                    "not-visited") as Property["status"]
                                )}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Main Content Card */}
                    <View style={styles.propertyDetailContentCard}>
                      {/* Notes */}
                      {(detailedProperty.resident?.notes ||
                        selectedProperty?.notes) && (
                        <View style={styles.propertyDetailContactRow}>
                          <Ionicons
                            name="document-text-outline"
                            size={responsiveScale(20)}
                            color={COLORS.text.secondary}
                          />
                          <Text style={styles.propertyDetailContactText}>
                            {detailedProperty.resident?.notes ||
                              selectedProperty?.notes}
                          </Text>
                        </View>
                      )}

                      {/* Check if Contact Information has any data */}
                      {(detailedProperty.resident?.phone ||
                        detailedProperty.resident?.email) && (
                        <>
                          <Text
                            style={[
                              styles.propertyDetailSectionTitle,
                              {
                                marginTop:
                                  detailedProperty.resident?.notes ||
                                  selectedProperty?.notes
                                    ? responsiveSpacing(SPACING.lg)
                                    : 0,
                              },
                            ]}
                          >
                            Contact Information
                          </Text>

                          {/* Phone */}
                          {detailedProperty.resident?.phone && (
                            <TouchableOpacity
                              style={styles.propertyDetailContactRow}
                              onPress={() =>
                                handlePhonePress(
                                  detailedProperty.resident.phone
                                )
                              }
                            >
                              <Ionicons
                                name="call-outline"
                                size={responsiveScale(20)}
                                color={COLORS.error[500]}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {detailedProperty.resident.phone}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {/* Email */}
                          {detailedProperty.resident?.email && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="mail-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {detailedProperty.resident.email}
                              </Text>
                            </View>
                          )}
                        </>
                      )}

                      {/* Owner Information */}
                      {(detailedProperty.propertyData?.ownerName ||
                        detailedProperty.propertyData?.ownerPhone ||
                        detailedProperty.propertyData?.ownerEmail ||
                        detailedProperty.propertyData?.ownerMailingAddress) && (
                        <>
                          <Text
                            style={[
                              styles.propertyDetailSectionTitle,
                              {
                                marginTop:
                                  detailedProperty.resident?.notes ||
                                  selectedProperty?.notes ||
                                  detailedProperty.resident?.phone ||
                                  detailedProperty.resident?.email
                                    ? responsiveSpacing(SPACING.lg)
                                    : 0,
                              },
                            ]}
                          >
                            Owner Information
                          </Text>

                          {/* Owner Name */}
                          {detailedProperty.propertyData?.ownerName && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="person-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {detailedProperty.propertyData.ownerName}
                              </Text>
                            </View>
                          )}

                          {/* Owner Phone */}
                          {detailedProperty.propertyData?.ownerPhone && (
                            <TouchableOpacity
                              style={styles.propertyDetailContactRow}
                              onPress={() =>
                                handlePhonePress(
                                  detailedProperty.propertyData.ownerPhone
                                )
                              }
                            >
                              <Ionicons
                                name="call-outline"
                                size={responsiveScale(20)}
                                color={COLORS.error[500]}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                Owner:{" "}
                                {detailedProperty.propertyData.ownerPhone}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {/* Owner Email */}
                          {detailedProperty.propertyData?.ownerEmail && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="mail-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {detailedProperty.propertyData.ownerEmail}
                              </Text>
                            </View>
                          )}

                          {/* Owner Mailing Address */}
                          {detailedProperty.propertyData
                            ?.ownerMailingAddress && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="location-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {
                                  detailedProperty.propertyData
                                    .ownerMailingAddress
                                }
                              </Text>
                            </View>
                          )}
                        </>
                      )}

                      {/* Export Button */}
                      <View style={styles.propertyDetailExportContainer}>
                        <TouchableOpacity
                          style={styles.propertyDetailExportButton}
                          onPress={() => setIsPropertyExportModalOpen(true)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="download-outline"
                            size={responsiveScale(16)}
                            color={COLORS.white}
                          />
                          <Text style={styles.propertyDetailExportButtonText}>
                            Export
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.propertyModalError}>
                    <Text style={styles.propertyModalErrorText}>
                      Failed to load property details
                    </Text>
                    <TouchableOpacity
                      style={styles.propertyModalErrorButton}
                      onPress={handleCloseDetailModal}
                    >
                      <Text style={styles.propertyModalErrorButtonText}>
                        Close
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Edit Property Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          // Prevent Android back button from closing modal during scroll
          // Modal can only be closed via cross icon or cancel button
          if (isEditModalScrolling) {
            return;
          }
        }}
      >
        <Pressable
          style={styles.propertyModalOverlay}
          onPress={() => {
            // Prevent overlay click from closing modal
            // Modal can only be closed via cross icon or cancel button
          }}
        >
          <View style={styles.editModalContent}>
            {/* Modal Header */}
            <View style={styles.editModalHeader}>
              <View style={styles.editModalHeaderLeft}>
                <Text style={styles.editModalTitle}>Edit Property</Text>
                {/* Eye icon to view details */}
                {selectedProperty && (
                  <TouchableOpacity
                    style={styles.editModalEyeButton}
                    onPress={() => {
                      setIsEditModalOpen(false);
                      setIsDetailModalOpen(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="eye-outline"
                      size={responsiveScale(20)}
                      color={COLORS.text.secondary}
                    />
                  </TouchableOpacity>
                )}
                {/* Previous Property Chevron - only show if more than 1 property */}
                {selectedProperty && filteredProperties.length > 1 && (
                  <TouchableOpacity
                    style={[
                      styles.editModalChevronButton,
                      (isUpdatingResident || !isEditFormValid()) &&
                        styles.editModalChevronButtonDisabled,
                    ]}
                    onPress={handlePreviousPropertyEdit}
                    disabled={isUpdatingResident || !isEditFormValid()}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={responsiveScale(24)}
                      color={
                        isUpdatingResident || !isEditFormValid()
                          ? COLORS.text.light
                          : COLORS.primary[500]
                      }
                    />
                  </TouchableOpacity>
                )}
                {/* Next Property Chevron - only show if more than 1 property */}
                {selectedProperty && filteredProperties.length > 1 && (
                  <TouchableOpacity
                    style={[
                      styles.editModalChevronButton,
                      (isUpdatingResident || !isEditFormValid()) &&
                        styles.editModalChevronButtonDisabled,
                    ]}
                    onPress={handleNextPropertyEdit}
                    disabled={isUpdatingResident || !isEditFormValid()}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={responsiveScale(24)}
                      color={
                        isUpdatingResident || !isEditFormValid()
                          ? COLORS.text.light
                          : COLORS.primary[500]
                      }
                    />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={handleCloseEditModal}
                style={styles.propertyModalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>

            {/* Modal Content (Loading or Form) */}
            {isLoadingEditPropertyDetails ? (
              <View style={styles.editModalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary[500]} />
                <Text style={styles.editModalLoadingText}>
                  Loading property details...
                </Text>
              </View>
            ) : (
              <View style={styles.editModalScrollWrapper}>
                <ScrollView
                  style={styles.editModalScroll}
                  contentContainerStyle={styles.editModalScrollContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  scrollEventThrottle={16}
                  onScrollBeginDrag={() => setIsEditModalScrolling(true)}
                  onScrollEndDrag={() => {
                    // Delay to prevent immediate dismissal after scroll
                    setTimeout(() => setIsEditModalScrolling(false), 100);
                  }}
                  onMomentumScrollBegin={() => setIsEditModalScrolling(true)}
                  onMomentumScrollEnd={() => {
                    // Delay to prevent immediate dismissal after scroll
                    setTimeout(() => setIsEditModalScrolling(false), 100);
                  }}
                >
                  {/* Validation Errors */}
                  {editValidationErrors.length > 0 && (
                    <View style={styles.editFormErrorContainer}>
                      <Text style={styles.editFormErrorTitle}>
                        Please fix the following errors:
                      </Text>
                      {editValidationErrors.map((error, index) => (
                        <Text key={index} style={styles.editFormErrorText}>
                          • {error}
                        </Text>
                      ))}
                    </View>
                  )}

                  {/* Validation Status */}
                  {isEditValidating && (
                    <View style={styles.editFormValidatingContainer}>
                      <ActivityIndicator
                        size="small"
                        color={COLORS.primary[500]}
                      />
                      <Text style={styles.editFormValidatingText}>
                        Validating location and checking requirements...
                      </Text>
                    </View>
                  )}

                  {/* Status & Contact Section */}
                  <View
                    style={[
                      styles.editFormSection,
                      styles.editFormSectionGreen,
                    ]}
                  >
                    <View style={styles.editFormSectionHeader}>
                      <View
                        style={[
                          styles.editFormSectionHeaderBar,
                          styles.editFormSectionHeaderBarGreen,
                        ]}
                      />
                      <Text style={styles.editFormSectionTitle}>
                        Status & Contact
                      </Text>
                    </View>

                    <View style={styles.editFormFields}>
                      {/* Status */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Status *</Text>
                        <TouchableOpacity
                          style={styles.editFormSelect}
                          onPress={() => setEditStatusDropdownVisible(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.editFormSelectText}>
                            {getStatusDisplayName(editFormData.status)}
                          </Text>
                          <Ionicons
                            name="chevron-down"
                            size={responsiveScale(16)}
                            color={COLORS.text.secondary}
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Owner Name */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Owner Name</Text>
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={editFormData.ownerName}
                          onChangeText={(value) =>
                            handleFormChange("ownerName", value)
                          }
                          placeholder="Enter owner name"
                        />
                      </View>

                      {/* Email */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Email</Text>
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={editFormData.email}
                          onChangeText={(value) =>
                            handleFormChange("email", value)
                          }
                          placeholder="Enter email address"
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>

                      {/* Phone */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Phone Number</Text>
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={editFormData.phone}
                          onChangeText={(value) =>
                            handleFormChange("phone", value)
                          }
                          placeholder="Enter phone number"
                          keyboardType="phone-pad"
                        />
                      </View>

                      {/* Last Visited */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>
                          Last Visited{" "}
                          {editFormData.status !== "not-visited" && (
                            <Text style={styles.editFormRequired}>*</Text>
                          )}
                        </Text>
                        <View style={styles.editFormInputContainer}>
                          <TextInput
                            style={styles.editFormInput}
                            value={editFormData.lastVisited}
                            onChangeText={(value) =>
                              handleFormChange("lastVisited", value)
                            }
                            placeholder="YYYY-MM-DD"
                            editable={false}
                            onPressIn={() => setShowDatePicker(true)}
                          />
                          <TouchableOpacity
                            style={styles.editFormDatePickerButton}
                            onPress={() => setShowDatePicker(true)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="calendar-outline"
                              size={responsiveScale(18)}
                              color={COLORS.text.secondary}
                            />
                          </TouchableOpacity>
                        </View>
                        {editFormData.status !== "not-visited" &&
                          !editFormData.lastVisited && (
                            <Text style={styles.editFormHelperText}>
                              Required when status is not &quot;Not
                              Visited&quot;
                            </Text>
                          )}
                        <DateTimePickerModal
                          isVisible={showDatePicker}
                          mode="date"
                          date={
                            editFormData.lastVisited
                              ? new Date(editFormData.lastVisited)
                              : new Date()
                          }
                          maximumDate={new Date()}
                          onConfirm={(selectedDate) => {
                            const formattedDate = selectedDate
                              .toISOString()
                              .split("T")[0];
                            handleFormChange("lastVisited", formattedDate);
                            setShowDatePicker(false);
                          }}
                          onCancel={() => {
                            setShowDatePicker(false);
                          }}
                        />
                      </View>

                      {/* Notes */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Notes</Text>
                        <TextInput
                          style={[
                            styles.editFormInputStandalone,
                            styles.editFormTextArea,
                          ]}
                          value={editFormData.notes}
                          onChangeText={(value) =>
                            handleFormChange("notes", value)
                          }
                          placeholder="Enter agent notes about the visit/interaction..."
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Basic Information Section */}
                  <View style={styles.editFormSection}>
                    <View style={styles.editFormSectionHeader}>
                      <View style={styles.editFormSectionHeaderBar} />
                      <Text style={styles.editFormSectionTitle}>
                        Basic Information
                      </Text>
                    </View>

                    <View style={styles.editFormFields}>
                      {/* Address */}
                      <View style={styles.editFormField}>
                        <Text style={styles.editFormLabel}>Address</Text>
                        <View style={styles.editFormInputContainer}>
                          <TextInput
                            ref={addressInputRef}
                            style={styles.editFormInput}
                            value={editFormData.address}
                            onChangeText={handleAddressInputChange}
                            placeholder="Enter full property address"
                            editable={!isUpdatingResident}
                            onFocus={() => {
                              if (
                                editFormData.address &&
                                addressSuggestions.length === 0
                              ) {
                                fetchAddressSuggestions(editFormData.address);
                              }
                            }}
                            onBlur={() => {
                              // Delay hiding suggestions to allow selection
                              setTimeout(() => {
                                setShowAddressSuggestions(false);
                              }, 200);
                            }}
                          />
                          {isLoadingSuggestions && (
                            <ActivityIndicator
                              size="small"
                              color={COLORS.primary[500]}
                              style={styles.editFormSearchButton}
                            />
                          )}
                          {!isLoadingSuggestions && (
                            <TouchableOpacity
                              style={styles.editFormSearchButton}
                              onPress={handleAddressSearch}
                              disabled={
                                !editFormData.address || isUpdatingResident
                              }
                            >
                              <Ionicons
                                name="search-outline"
                                size={responsiveScale(16)}
                                color={
                                  !editFormData.address || isUpdatingResident
                                    ? COLORS.text.light
                                    : COLORS.text.secondary
                                }
                              />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Address Suggestions Dropdown */}
                        {showAddressSuggestions &&
                          addressSuggestions.length > 0 && (
                            <View style={styles.addressSuggestionsContainer}>
                              <ScrollView
                                style={styles.addressSuggestionsList}
                                keyboardShouldPersistTaps="handled"
                                nestedScrollEnabled={true}
                                showsVerticalScrollIndicator={true}
                              >
                                {addressSuggestions.map((suggestion, index) => (
                                  <TouchableOpacity
                                    key={suggestion.place_id || index}
                                    style={styles.addressSuggestionItem}
                                    onPress={() =>
                                      handleSelectAddressSuggestion(suggestion)
                                    }
                                  >
                                    <Ionicons
                                      name="location-outline"
                                      size={responsiveScale(16)}
                                      color={COLORS.primary[500]}
                                      style={{
                                        marginRight: responsiveSpacing(
                                          SPACING.xs
                                        ),
                                      }}
                                    />
                                    <Text style={styles.addressSuggestionText}>
                                      {suggestion.description}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </View>
                          )}
                      </View>

                      {/* House Number and Location */}
                      <View style={styles.editFormRow}>
                        <View style={[styles.editFormField, { flex: 1 }]}>
                          <Text style={styles.editFormLabel}>House Number</Text>
                          <TextInput
                            style={styles.editFormInputStandalone}
                            value={editFormData.houseNumber}
                            onChangeText={(value) =>
                              handleFormChange("houseNumber", value)
                            }
                            placeholder="Enter house number"
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={[styles.editFormField, { flex: 1 }]}>
                          <Text style={styles.editFormLabel}>Location</Text>
                          <TouchableOpacity
                            style={styles.editFormLocationButton}
                            onPress={handleEditUseMyLocation}
                            disabled={
                              isUpdatingResident || isEditGettingLocation
                            }
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="location-outline"
                              size={responsiveScale(16)}
                              color={COLORS.primary[500]}
                            />
                            <Text style={styles.editFormLocationButtonText}>
                              {isEditGettingLocation
                                ? "Getting..."
                                : "Use My Location"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Longitude and Latitude */}
                      <View style={styles.editFormRow}>
                        <View style={[styles.editFormField, { flex: 1 }]}>
                          <Text style={styles.editFormLabel}>Longitude</Text>
                          <TextInput
                            style={styles.editFormInputStandalone}
                            value={editFormData.longitude}
                            onChangeText={(value) =>
                              handleFormChange("longitude", value)
                            }
                            placeholder="Enter longitude"
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={[styles.editFormField, { flex: 1 }]}>
                          <Text style={styles.editFormLabel}>Latitude</Text>
                          <TextInput
                            style={styles.editFormInputStandalone}
                            value={editFormData.latitude}
                            onChangeText={(value) =>
                              handleFormChange("latitude", value)
                            }
                            placeholder="Enter latitude"
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Footer */}
            <View style={styles.editModalFooter}>
              <TouchableOpacity
                style={styles.editModalCancelButton}
                onPress={handleCloseEditModal}
                disabled={isUpdatingResident}
                activeOpacity={0.7}
              >
                <Text style={styles.editModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editModalSaveButton,
                  (!isEditFormValid() || isUpdatingResident) &&
                    styles.editModalSaveButtonDisabled,
                ]}
                onPress={() => handleUpdateResident(false)}
                disabled={isUpdatingResident || !isEditFormValid()}
                activeOpacity={0.7}
              >
                {isUpdatingResident && (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                    style={{ marginRight: responsiveSpacing(SPACING.xs) }}
                  />
                )}
                <Text style={styles.editModalSaveButtonText}>
                  {isUpdatingResident
                    ? "Saving..."
                    : isEditValidating
                    ? "Validating..."
                    : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Edit Status Dropdown Modal */}
      <Modal
        visible={editStatusDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditStatusDropdownVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEditStatusDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Status</Text>
              <TouchableOpacity
                onPress={() => setEditStatusDropdownVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.modalOptions}>
              {(
                [
                  "not-visited",
                  "interested",
                  "visited",
                  "not-opened",
                  "appointment",
                  "follow-up",
                  "not-interested",
                ] as Property["status"][]
              ).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.modalOption,
                    editFormData.status === status && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    handleFormChange("status", status);
                    setEditStatusDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      ...(editFormData.status === status
                        ? [styles.modalOptionTextActive]
                        : []),
                    ]}
                  >
                    {getStatusDisplayName(status)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Add Property Modal */}
      <AddPropertyModal
        ref={addPropertyModalRef}
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        territoryId={territoryId}
        onSuccess={handleAddPropertySuccess}
      />

      {/* Export Modal */}
      <Modal
        visible={isExportModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          // Modal should only close via close button or cancel button
          // Do nothing on Android back button press
        }}
      >
        <Pressable
          style={styles.exportModalOverlay}
          onPress={() => {
            // Modal should only close via close button or cancel button
            // Do nothing on overlay press
          }}
        >
          <View style={styles.exportModalContent}>
            {/* Modal Header */}
            <View style={styles.exportModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportModalTitle}>Export Properties</Text>
                <Text style={styles.exportModalSubtitle}>
                  Choose export options and format
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !isExporting && setIsExportModalOpen(false)}
                style={styles.exportModalCloseButton}
                disabled={isExporting}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <View style={styles.exportModalScrollWrapper}>
              <ScrollView
                style={styles.exportModalScroll}
                contentContainerStyle={styles.exportModalScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {/* Export Scope Selection */}
                <View style={styles.exportOptionSection}>
                  <Text style={styles.exportOptionSectionTitle}>
                    Export Scope
                  </Text>
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setExportScope("all")}
                      disabled={isExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {exportScope === "all" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>
                          All Properties
                        </Text>
                        <Text style={styles.radioOptionDescription}>
                          Export all {properties.length} properties
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setExportScope("filtered")}
                      disabled={isExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {exportScope === "filtered" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>
                          Filtered Properties
                        </Text>
                        <Text style={styles.radioOptionDescription}>
                          Export {filteredProperties.length} filtered properties
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* File Format Selection */}
                <View style={styles.exportOptionSection}>
                  <Text style={styles.exportOptionSectionTitle}>
                    File Format
                  </Text>
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setExportFormat("csv")}
                      disabled={isExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {exportFormat === "csv" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>CSV</Text>
                        <Text style={styles.radioOptionDescription}>
                          Comma-separated values (.csv)
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setExportFormat("excel")}
                      disabled={isExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {exportFormat === "excel" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>Excel</Text>
                        <Text style={styles.radioOptionDescription}>
                          Microsoft Excel (.xlsx)
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Export Progress */}
                {isExporting && (
                  <View style={styles.exportProgressContainer}>
                    <ActivityIndicator
                      size="small"
                      color={COLORS.primary[500]}
                    />
                    <Text style={styles.exportProgressText}>
                      Exporting properties... {exportProgress}%
                    </Text>
                    <View style={styles.exportProgressBar}>
                      <View
                        style={[
                          styles.exportProgressBarFill,
                          { width: `${exportProgress}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Modal Footer */}
            <View style={styles.exportModalFooter}>
              <TouchableOpacity
                style={styles.exportModalCancelButton}
                onPress={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                activeOpacity={0.7}
              >
                <Text style={styles.exportModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.exportModalExportButton,
                  isExporting && styles.exportModalExportButtonDisabled,
                ]}
                onPress={handleExport}
                disabled={isExporting}
                activeOpacity={0.7}
              >
                {isExporting && (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                    style={{ marginRight: responsiveSpacing(SPACING.xs) }}
                  />
                )}
                <Text style={styles.exportModalExportButtonText}>
                  {isExporting ? "Exporting..." : "Export"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Property Export Modal */}
      <Modal
        visible={isPropertyExportModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          // Modal should only close via close button or cancel button
          // Do nothing on Android back button press
        }}
      >
        <Pressable
          style={styles.exportModalOverlay}
          onPress={() => {
            // Modal should only close via close button or cancel button
            // Do nothing on overlay press
          }}
        >
          <View style={styles.exportModalContent}>
            {/* Modal Header */}
            <View style={styles.exportModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportModalTitle}>Export Property</Text>
                <Text style={styles.exportModalSubtitle}>
                  Choose export format
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  !isPropertyExporting && setIsPropertyExportModalOpen(false)
                }
                style={styles.exportModalCloseButton}
                disabled={isPropertyExporting}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <View style={styles.exportModalScrollWrapper}>
              <ScrollView
                style={styles.exportModalScroll}
                contentContainerStyle={styles.exportModalScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {/* File Format Selection */}
                <View style={styles.exportOptionSection}>
                  <Text style={styles.exportOptionSectionTitle}>
                    File Format
                  </Text>
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setPropertyExportFormat("csv")}
                      disabled={isPropertyExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {propertyExportFormat === "csv" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>CSV</Text>
                        <Text style={styles.radioOptionDescription}>
                          Comma-separated values (.csv)
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.radioOption}
                      onPress={() => setPropertyExportFormat("excel")}
                      disabled={isPropertyExporting}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {propertyExportFormat === "excel" && (
                          <View style={styles.radioButtonInner} />
                        )}
                      </View>
                      <View style={styles.radioOptionText}>
                        <Text style={styles.radioOptionLabel}>Excel</Text>
                        <Text style={styles.radioOptionDescription}>
                          Microsoft Excel (.xlsx)
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Export Progress */}
                {isPropertyExporting && (
                  <View style={styles.exportProgressContainer}>
                    <ActivityIndicator
                      size="small"
                      color={COLORS.primary[500]}
                    />
                    <Text style={styles.exportProgressText}>
                      Exporting property... {propertyExportProgress}%
                    </Text>
                    <View style={styles.exportProgressBar}>
                      <View
                        style={[
                          styles.exportProgressBarFill,
                          { width: `${propertyExportProgress}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Modal Footer */}
            <View style={styles.exportModalFooter}>
              <TouchableOpacity
                style={styles.exportModalCancelButton}
                onPress={() => setIsPropertyExportModalOpen(false)}
                disabled={isPropertyExporting}
                activeOpacity={0.7}
              >
                <Text style={styles.exportModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.exportModalExportButton,
                  isPropertyExporting && styles.exportModalExportButtonDisabled,
                ]}
                onPress={handlePropertyExport}
                disabled={isPropertyExporting}
                activeOpacity={0.7}
              >
                {isPropertyExporting && (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                    style={{ marginRight: responsiveSpacing(SPACING.xs) }}
                  />
                )}
                <Text style={styles.exportModalExportButtonText}>
                  {isPropertyExporting ? "Exporting..." : "Export"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
  },
  loadingText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.screenLarge),
    gap: responsiveSpacing(SPACING.sm),
  },
  errorText: {
    fontSize: responsiveScale(16),
    color: COLORS.error[500],
    fontWeight: "600",
    textAlign: "center",
  },
  errorSubtext: {
    textAlign: "center",
  },
  statusLegendContainer: {
    backgroundColor: COLORS.background.light,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    paddingVertical: responsiveSpacing(SPACING.sm),
  },
  statusLegendContent: {
    paddingHorizontal: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
    alignItems: "center",
  },
  statusLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  statusLegendDot: {
    width: responsiveScale(10),
    height: responsiveScale(10),
    borderRadius: responsiveScale(5),
    flexShrink: 0,
  },
  statusLegendText: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    fontWeight: "500",
  },
  statusLegendCount: {
    fontSize: responsiveScale(12),
    color: COLORS.text.light,
    fontWeight: "400",
  },
  addPropertyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(16),
    borderWidth: 1,
    borderColor: COLORS.primary[300],
    marginRight: responsiveSpacing(SPACING.sm),
  },
  addPropertyButtonText: {
    fontSize: responsiveScale(12),
    color: COLORS.primary[600],
    fontWeight: "600",
  },
  mapContainer: {
    // Do NOT use overflow: "hidden" - it causes render clipping on Android with MapView
    flex: 1,
    backgroundColor: COLORS.background.secondary,
  },
  map: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.white,
    gap: responsiveSpacing(SPACING.md),
  },
  placeholderText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  propertyInfoCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
    padding: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: "40%",
  },
  propertyInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  propertyInfoContent: {
    flex: 1,
    marginRight: responsiveSpacing(SPACING.sm),
  },
  propertyInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  propertyStatusDot: {
    width: responsiveScale(12),
    height: responsiveScale(12),
    borderRadius: responsiveScale(6),
  },
  propertyAddress: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
    flex: 1,
  },
  propertyDetails: {
    fontSize: responsiveScale(12),
    marginLeft: responsiveScale(24), // Align with address text
  },
  closeButton: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(16),
    backgroundColor: COLORS.neutral[100],
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: responsiveScale(18),
    color: COLORS.text.secondary,
    fontWeight: "600",
  },
  bottomSheetBackground: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
  },
  bottomSheetHeaderContainer: {
    flexShrink: 0,
    backgroundColor: COLORS.white,
    paddingBottom: 0,
    width: "100%",
  },
  dragHandle: {
    width: "100%",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.xs),
  },
  dragHandleBar: {
    width: responsiveScale(40),
    height: responsiveScale(4),
    backgroundColor: COLORS.neutral[300],
    borderRadius: responsiveScale(2),
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    backgroundColor: COLORS.white,
    width: "100%",
  },
  listHeaderContent: {
    flex: 1,
  },
  listHeaderTitle: {
    fontSize: responsiveScale(18),
    fontWeight: "600",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  listHeaderCount: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  closeListButton: {
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(16),
    backgroundColor: COLORS.neutral[100],
    justifyContent: "center",
    alignItems: "center",
  },
  closeListButtonText: {
    fontSize: responsiveScale(18),
    color: COLORS.text.secondary,
    fontWeight: "600",
  },
  propertyListScroll: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  propertyListContent: {
    padding: responsiveSpacing(PADDING.screen),
    paddingTop: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.white,
  },
  propertyCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    marginBottom: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    overflow: "hidden",
  },
  propertyCardHighlighted: {
    borderColor: COLORS.primary[500],
    borderWidth: 2,
    backgroundColor: COLORS.primary[50],
  },
  propertyCardContent: {
    padding: responsiveSpacing(SPACING.md),
  },
  propertyCardHeader: {
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  propertyCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.sm),
  },
  propertyCardAddressRow: {
    flexDirection: "row",
    flex: 1,
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs),
    flexWrap: "wrap",
  },
  propertyCardAddress: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.text.primary,
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  propertyCardShortAddress: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
  },
  dataSourceBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(4),
    borderWidth: 1,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  dataSourceBadgeManual: {
    backgroundColor: COLORS.warning[50],
    borderColor: COLORS.warning[300],
  },
  dataSourceBadgeAuto: {
    backgroundColor: COLORS.neutral[100],
    borderColor: COLORS.neutral[300],
  },
  dataSourceBadgeText: {
    fontSize: responsiveScale(10),
    fontWeight: "600",
  },
  dataSourceBadgeTextManual: {
    color: COLORS.warning[700],
  },
  dataSourceBadgeTextAuto: {
    color: COLORS.text.secondary,
  },
  propertyCardFooter: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  propertyNotes: {
    marginTop: responsiveSpacing(SPACING.xs),
    fontSize: responsiveScale(12),
    color: COLORS.text.light,
    fontStyle: "italic",
  },
  statusBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.xs / 2),
    paddingTop: responsiveSpacing(SPACING.xs / 8),
    paddingBottom: responsiveSpacing(SPACING.xs / 8),
    borderRadius: responsiveScale(3),
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: responsiveScale(9),
    fontWeight: "500",
    lineHeight: responsiveScale(11),
  },
  propertyCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  editButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
    justifyContent: "center",
    alignItems: "center",
  },
  statsContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.md),
    paddingTop: responsiveSpacing(SPACING.sm),
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    borderRadius: responsiveScale(12),
    minHeight: responsiveScale(80),
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  statCardValue: {
    fontSize: responsiveScale(18),
    fontWeight: "700",
    color: COLORS.white,
    textAlign: "center",
  },
  statCardLabel: {
    fontSize: responsiveScale(11),
    color: COLORS.white,
    textAlign: "center",
    opacity: 0.95,
  },
  filtersContainer: {
    flexShrink: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingTop: responsiveSpacing(SPACING.sm),
    paddingBottom: responsiveSpacing(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(8),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    marginBottom: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  searchIcon: {
    marginRight: responsiveSpacing(SPACING.xs),
  },
  searchInput: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
  },
  clearSearchButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
  },
  sortButtonsContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  sortButton: {
    flex: 1,
    paddingVertical: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(6),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  sortButtonText: {
    fontSize: responsiveScale(12),
    fontWeight: "500",
    color: COLORS.text.primary,
  },
  sortButtonTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  filterDropdownsContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.xs),
  },
  filterDropdownWrapper: {
    flex: 1,
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(8),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  filterDropdownText: {
    fontSize: responsiveScale(12),
    color: COLORS.text.primary,
    flex: 1,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    gap: responsiveSpacing(SPACING.sm),
  },
  emptyStateText: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  emptyStateSubtext: {
    textAlign: "center",
    fontSize: responsiveScale(12),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.screen),
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    width: "100%",
    maxWidth: responsiveScale(400),
    maxHeight: "80%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.screen),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  modalTitle: {
    fontSize: responsiveScale(18),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  modalCloseButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
  },
  modalOptions: {
    maxHeight: responsiveScale(400),
  },
  modalOption: {
    padding: responsiveSpacing(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  modalOptionActive: {
    backgroundColor: COLORS.primary[50],
  },
  modalOptionText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
  },
  modalOptionTextActive: {
    color: COLORS.primary[500],
    fontWeight: "600",
  },
  propertyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  propertyModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(20),
    width: "90%",
    maxWidth: responsiveScale(600),
    maxHeight: "90%",
    flexDirection: "column",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    alignSelf: "center",
  },
  propertyModalHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
  },
  propertyModalEditButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  propertyModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.screen),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    flexShrink: 0,
  },
  propertyModalTitle: {
    fontSize: responsiveScale(20),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  propertyModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
  },
  propertyModalScroll: {
    flexShrink: 1,
  },
  propertyModalScrollContent: {
    padding: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  propertyModalLoading: {
    minHeight: responsiveScale(300),
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    gap: responsiveSpacing(SPACING.md),
  },
  propertyModalLoadingText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  propertyModalError: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    gap: responsiveSpacing(SPACING.md),
  },
  propertyModalErrorText: {
    fontSize: responsiveScale(14),
    color: COLORS.error[500],
    textAlign: "center",
  },
  propertyModalErrorButton: {
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    backgroundColor: COLORS.white,
  },
  propertyModalErrorButtonText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    fontWeight: "500",
  },
  propertyDetailHeader: {
    padding: responsiveSpacing(PADDING.screen),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  propertyDetailHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  propertyDetailIcon: {
    width: responsiveScale(48),
    height: responsiveScale(48),
    borderRadius: responsiveScale(24),
    justifyContent: "center",
    alignItems: "center",
  },
  propertyDetailHeaderContent: {
    flex: 1,
  },
  propertyDetailAddress: {
    fontSize: responsiveScale(18),
    fontWeight: "600",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  propertyDetailStatusBadge: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  propertyDetailStatusBadgeInner: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(6),
    alignSelf: "flex-start",
  },
  propertyDetailStatusText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  propertyDetailStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: responsiveSpacing(SPACING.md),
  },
  propertyDetailStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  propertyDetailStatText: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
  },
  propertyDetailContentCard: {
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    marginTop: responsiveSpacing(SPACING.md),
  },
  propertyDetailField: {
    marginBottom: responsiveSpacing(SPACING.md),
    paddingBottom: responsiveSpacing(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  propertyDetailFieldLabel: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    color: COLORS.text.secondary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  propertyDetailFieldValue: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    lineHeight: responsiveScale(20),
  },
  propertyDetailSectionTitle: {
    fontSize: responsiveScale(18),
    fontWeight: "600",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.md),
  },
  propertyDetailContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  propertyDetailContactText: {
    fontSize: responsiveScale(14),
    color: COLORS.primary[500],
    fontWeight: "500",
  },
  propertyDetailTagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  propertyDetailTag: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(6),
    backgroundColor: COLORS.neutral[200],
  },
  propertyDetailTagText: {
    fontSize: responsiveScale(11),
    color: COLORS.text.secondary,
  },
  propertyDetailZoneInfo: {
    marginTop: responsiveSpacing(SPACING.md),
    paddingTop: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  propertyDetailZoneText: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  propertyDetailZoneLabel: {
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  propertyDetailExportContainer: {
    marginTop: responsiveSpacing(SPACING.md),
    alignItems: "flex-end",
  },
  propertyDetailExportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.success[600] || "#10B981",
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
  },
  propertyDetailExportButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.white,
  },
  // Edit Modal Styles
  editModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(20),
    height: Dimensions.get("window").height * 0.85,
    width: "95%",
    alignSelf: "center",
    marginTop: responsiveSpacing(SPACING.lg),
    marginBottom: responsiveSpacing(SPACING.lg),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: "column",
    overflow: "hidden",
  },
  editModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    flexShrink: 0,
  },
  editModalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    flex: 1,
  },
  editModalTitle: {
    fontSize: responsiveScale(20),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  editModalEyeButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
    justifyContent: "center",
    alignItems: "center",
  },
  editModalChevronButton: {
    padding: responsiveSpacing(SPACING.xs),
    justifyContent: "center",
    alignItems: "center",
  },
  editModalChevronButtonDisabled: {
    opacity: 0.3,
  },
  editModalLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    minHeight: Dimensions.get("window").height * 0.4,
  },
  editModalLoadingText: {
    marginTop: responsiveSpacing(SPACING.md),
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  editModalScrollWrapper: {
    flex: 1,
    minHeight: 0,
  },
  editModalScroll: {
    flex: 1,
  },
  editModalScrollContent: {
    padding: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  editModalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    flexShrink: 0,
  },
  editModalCancelButton: {
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.neutral[100],
  },
  editModalCancelButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "500",
    color: COLORS.text.secondary,
  },
  editModalSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.primary[500],
  },
  editModalSaveButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
    opacity: 0.5,
  },
  editModalSaveButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.white,
  },
  // Edit Form Section Styles
  editFormSection: {
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary[100],
  },
  editFormSectionGreen: {
    backgroundColor: COLORS.success[50],
    borderColor: COLORS.success[100],
  },
  editFormSectionPurple: {
    backgroundColor: "#F3E8FF",
    borderColor: "#E9D5FF",
  },
  editFormSectionOrange: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  editFormSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  editFormSectionHeaderBar: {
    width: responsiveScale(4),
    height: responsiveScale(24),
    backgroundColor: COLORS.primary[500],
    borderRadius: responsiveScale(2),
  },
  editFormSectionHeaderBarGreen: {
    backgroundColor: COLORS.success[500],
  },
  editFormSectionHeaderBarPurple: {
    backgroundColor: "#A855F7",
  },
  editFormSectionHeaderBarOrange: {
    backgroundColor: "#F97316",
  },
  editFormSectionTitle: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  editFormFields: {
    gap: responsiveSpacing(SPACING.md),
  },
  editFormRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
  },
  editFormField: {
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  editFormLabel: {
    fontSize: responsiveScale(14),
    fontWeight: "500",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  editFormRequired: {
    color: COLORS.error[500],
  },
  editFormInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    paddingHorizontal: responsiveSpacing(SPACING.sm),
  },
  editFormInput: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingLeft: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(44),
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  editFormInputStandalone: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingLeft: responsiveSpacing(SPACING.md),
    minHeight: responsiveScale(44),
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  editFormTextArea: {
    minHeight: responsiveScale(80),
    paddingTop: responsiveSpacing(SPACING.sm),
  },
  editFormSearchButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  addressSuggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    maxHeight: Dimensions.get("window").height * 0.3,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addressSuggestionsList: {
    maxHeight: Dimensions.get("window").height * 0.3,
  },
  addressSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  addressSuggestionText: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
  },
  editFormDatePickerButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  editFormSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(44),
  },
  editFormSelectText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
  },
  editFormLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(8),
    borderWidth: 1,
    borderColor: COLORS.primary[300],
    paddingVertical: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(44),
  },
  editFormLocationButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "500",
    color: COLORS.primary[500],
  },
  editFormHelperText: {
    fontSize: responsiveScale(11),
    color: COLORS.text.secondary,
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  editFormErrorContainer: {
    backgroundColor: COLORS.error[50],
    borderRadius: responsiveScale(8),
    padding: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.error[200],
  },
  editFormErrorTitle: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.error[800],
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  editFormErrorText: {
    fontSize: responsiveScale(12),
    color: COLORS.error[700],
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  editFormValidatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(8),
    padding: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary[200],
  },
  editFormValidating: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(8),
    padding: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.primary[200],
  },
  editFormValidatingText: {
    fontSize: responsiveScale(12),
    color: COLORS.primary[600],
  },
  editModalSubtitle: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  editFormValidationErrors: {
    backgroundColor: COLORS.error[50],
    borderRadius: responsiveScale(8),
    padding: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.error[200],
  },
  editFormValidationErrorsTitle: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.error[700],
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  editFormValidationErrorText: {
    fontSize: responsiveScale(12),
    color: COLORS.error[700],
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  // Export Modal Styles
  exportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(SPACING.md),
  },
  exportModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(20),
    width: "100%",
    maxWidth: responsiveScale(500),
    maxHeight: Dimensions.get("window").height * 0.8,
    height: Dimensions.get("window").height * 0.7,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: "column",
  },
  exportModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    flexShrink: 0,
  },
  exportModalTitle: {
    fontSize: responsiveScale(20),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  exportModalSubtitle: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  exportModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
  },
  exportModalScrollWrapper: {
    flex: 1,
    minHeight: 300,
  },
  exportModalScroll: {
    flex: 1,
  },
  exportModalScrollContent: {
    padding: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  exportOptionSection: {
    marginBottom: responsiveSpacing(SPACING.xl),
  },
  exportOptionSectionTitle: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.md),
  },
  radioGroup: {
    gap: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    padding: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(12),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    minHeight: responsiveScale(60),
  },
  radioButton: {
    width: responsiveScale(20),
    height: responsiveScale(20),
    borderRadius: responsiveScale(10),
    borderWidth: 2,
    borderColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonInner: {
    width: responsiveScale(12),
    height: responsiveScale(12),
    borderRadius: responsiveScale(6),
    backgroundColor: COLORS.primary[500],
  },
  radioOptionText: {
    flex: 1,
  },
  radioOptionLabel: {
    fontSize: responsiveScale(16),
    fontWeight: "500",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  radioOptionDescription: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
  },
  exportProgressContainer: {
    marginTop: responsiveSpacing(SPACING.md),
    padding: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.primary[50],
    borderRadius: responsiveScale(12),
    gap: responsiveSpacing(SPACING.sm),
  },
  exportProgressText: {
    fontSize: responsiveScale(14),
    color: COLORS.primary[600],
    fontWeight: "500",
  },
  exportProgressBar: {
    height: responsiveScale(8),
    backgroundColor: COLORS.neutral[200],
    borderRadius: responsiveScale(4),
    overflow: "hidden",
  },
  exportProgressBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary[500],
    borderRadius: responsiveScale(4),
  },
  exportModalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    flexShrink: 0,
  },
  exportModalCancelButton: {
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.neutral[100],
  },
  exportModalCancelButtonText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
    fontWeight: "500",
  },
  exportModalExportButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.primary[500],
  },
  exportModalExportButtonDisabled: {
    opacity: 0.5,
  },
  exportModalExportButtonText: {
    fontSize: responsiveScale(14),
    color: COLORS.white,
    fontWeight: "600",
  },
});
