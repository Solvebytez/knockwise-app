import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  Text,
  Dimensions,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { H3, Body2, Body3 } from "@/components/ui";
import { Button } from "@/components/ui";
import { AppHeader } from "@/components/ui";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Ionicons } from "@expo/vector-icons";
import ManualZoneModal, {
  ManualEntryMode,
  type LastPropertyInfo,
} from "@/components/ManualZoneModal";
import ManualZoneDetailsModal, {
  type ManualZoneContext,
} from "@/components/ManualZoneDetailsModal";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as Location from "expo-location";

interface Property {
  _id: string;
  address: string;
  houseNumber: number;
  coordinates: [number, number];
  status: string;
  notes?: string;
  lastVisited?: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

// Status display name helper (with emoji icons like map zone)
const getStatusDisplayName = (status: string): string => {
  const statusNames: Record<string, string> = {
    "not-visited": "⏳ Not Visited",
    interested: "✓ Interested",
    visited: "✓ Visited",
    appointment: "📅 Appointment",
    "follow-up": "🔄 Follow-up",
    "not-interested": "❌ Not Interested",
    "not-opened": "🚪 Not Opened",
  };
  return statusNames[status] || "⏳ Not Visited";
};

// Status colors
const statusColors: Record<string, string> = {
  "not-visited": "#EF4444",
  interested: "#F59E0B",
  visited: "#10B981",
  appointment: "#3B82F6",
  "follow-up": "#EC4899",
  "not-interested": "#6B7280",
  "not-opened": "#F97316",
};

export default function ManualZoneFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const [zoneContext, setZoneContext] = useState<ManualZoneContext | null>(
    null
  );
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isPropertyModalVisible, setIsPropertyModalVisible] = useState(false);
  const [selectedMode, setSelectedMode] =
    useState<ManualEntryMode>("sequential");

  // Property details modal states
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPropertyForDetails, setSelectedPropertyForDetails] =
    useState<Property | null>(null);

  // Edit property modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPropertyId, setEditPropertyId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null
  );
  const [isUpdatingResident, setIsUpdatingResident] = useState(false);
  const [isEditValidating, setIsEditValidating] = useState(false);
  const [editValidationErrors, setEditValidationErrors] = useState<string[]>(
    []
  );
  const [isEditGettingLocation, setIsEditGettingLocation] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editStatusDropdownVisible, setEditStatusDropdownVisible] =
    useState(false);
  const [isQuickAddingProperty, setIsQuickAddingProperty] = useState(false);

  // Address autocomplete states
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const addressInputRef = useRef<TextInput>(null);
  const addressSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Edit form data
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

  // Check if we're in edit mode
  const editZoneId = params.zoneId as string | undefined;
  const isEditMode = !!editZoneId;

  // Debug logging
  useEffect(() => {}, [params, editZoneId, isEditMode]);

  // Fetch zone details if in edit mode
  const {
    data: zoneDetailsData,
    isLoading: isLoadingZone,
    error: zoneError,
  } = useQuery({
    queryKey: ["zoneDetails", editZoneId],
    queryFn: async () => {
      if (!editZoneId) return null;
      const response = await apiInstance.get(`/agent-zones/${editZoneId}`);
      return response.data;
    },
    enabled: isEditMode,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Handle zone fetch error - redirect back to list
  useEffect(() => {
    if (zoneError && isEditMode) {
      Alert.alert(
        "Zone Not Found",
        "This zone is no longer available or you don't have permission to edit it.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/(tabs)/manual-zone"),
          },
        ]
      );
    }
  }, [zoneError, isEditMode, router]);

  // Set zone context from fetched data in edit mode
  useEffect(() => {
    if (isEditMode && zoneDetailsData?.data) {
      const zone = zoneDetailsData.data;
      const mappedContext = {
        zoneId: zone._id,
        zoneName: zone.name,
        zoneDescription: zone.description || "",
        area: zone.areaId
          ? { id: zone.areaId._id, name: zone.areaId.name }
          : undefined,
        municipality: zone.municipalityId
          ? { id: zone.municipalityId._id, name: zone.municipalityId.name }
          : undefined,
        community: zone.communityId
          ? { id: zone.communityId._id, name: zone.communityId.name }
          : undefined,
      };
      setZoneContext(mappedContext);
    }
  }, [isEditMode, zoneDetailsData]);

  // Show details modal only in create mode
  useEffect(() => {
    if (!isEditMode) {
      setIsDetailsModalVisible(true);
    }
  }, [isEditMode]);

  // Fetch properties for the selected zone
  const {
    data: propertiesData,
    isLoading: isLoadingProperties,
    refetch: refetchProperties,
  } = useQuery({
    queryKey: ["zoneProperties", zoneContext?.zoneId],
    queryFn: async () => {
      if (!zoneContext?.zoneId) return null;
      const response = await apiInstance.get(
        `/zones/${zoneContext.zoneId}/residents?limit=100`
      );
      return response.data;
    },
    enabled: !!zoneContext?.zoneId,
    refetchOnWindowFocus: false,
  });

  const properties: Property[] = propertiesData?.data?.residents || [];

  // Filter properties based on selected mode (tab)
  const filteredProperties = useMemo(() => {
    if (selectedMode === "sequential") {
      // Show all properties, sorted by house number
      return [...properties].sort((a, b) => a.houseNumber - b.houseNumber);
    } else if (selectedMode === "odd") {
      // Show only odd house numbers
      return properties
        .filter((p) => p.houseNumber % 2 !== 0)
        .sort((a, b) => a.houseNumber - b.houseNumber);
    } else {
      // Show only even house numbers
      return properties
        .filter((p) => p.houseNumber % 2 === 0)
        .sort((a, b) => a.houseNumber - b.houseNumber);
    }
  }, [properties, selectedMode]);

  // Get the last property from filtered list for auto-fill
  const lastPropertyInfo = useMemo(() => {
    if (filteredProperties.length === 0) return undefined;
    const lastProp = filteredProperties[filteredProperties.length - 1];
    return {
      address: lastProp.address,
      houseNumber: lastProp.houseNumber,
    };
  }, [filteredProperties]);

  // Fetch property details for detail modal
  const { data: detailedProperty, isLoading: isLoadingPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", selectedPropertyForDetails?._id],
      queryFn: async () => {
        if (!selectedPropertyForDetails?._id) return null;
        const response = await apiInstance.get(
          `/residents/${selectedPropertyForDetails._id}`
        );
        return response.data.data;
      },
      enabled: !!selectedPropertyForDetails?._id && isDetailModalOpen,
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
      gcTime: 10 * 60 * 1000, // 10 minutes - cache kept for 10 min
    });

  // Fetch property details for edit modal
  const { data: editPropertyDetails, isLoading: isLoadingEditPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", editPropertyId],
      queryFn: async () => {
        if (!editPropertyId) return null;
        const response = await apiInstance.get(`/residents/${editPropertyId}`);
        return response.data.data;
      },
      enabled: !!editPropertyId && isEditModalOpen,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });

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

      // Last Visited is required when status is not "not-visited"
      if (
        editFormData.status !== "not-visited" &&
        !editFormData.lastVisited.trim()
      ) {
        errors.push(
          "Last visited date is required when status is not 'Not Visited'"
        );
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

  // Update form data when editPropertyDetails loads
  useEffect(() => {
    if (editPropertyDetails && selectedProperty) {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split("T")[0];
      setEditFormData((prev) => ({
        // Update all fields from selectedProperty first (for navigation)
        address: selectedProperty.address || prev.address,
        houseNumber:
          selectedProperty.houseNumber?.toString() || prev.houseNumber,
        longitude:
          selectedProperty.coordinates[0]?.toString() || prev.longitude,
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

  const handleBack = () => {
    router.back();
  };

  const handleModeSelect = (mode: ManualEntryMode) => {
    setSelectedMode(mode);
  };

  const openAddPropertyModal = () => {
    if (!zoneContext) {
      Alert.alert(
        "Zone details needed",
        "Please create the zone before adding properties.",
        [
          {
            text: "Add details",
            onPress: () => setIsDetailsModalVisible(true),
          },
        ]
      );
      return;
    }
    setIsPropertyModalVisible(true);
  };

  const handleZoneSaved = (zone: ManualZoneContext) => {
    setZoneContext(zone);
    setIsDetailsModalVisible(false);
  };

  const handlePropertySaved = () => {
    // Refetch properties when a new one is saved
    void refetchProperties();
  };

  // Helper function to parse street data from address
  const parseStreetData = (address: string) => {
    const match = address.trim().match(/^(\d+)\s+(.*)$/);
    if (!match) {
      return { number: null, street: "" };
    }
    return {
      number: parseInt(match[1], 10),
      street: match[2],
    };
  };

  // Helper function to geocode address
  const geocodeAddressWithPlaces = async (address: string) => {
    const { getGoogleMapsApiKey } = await import("@/lib/googleMaps");
    let apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      console.warn(
        "[ManualZoneForm] Google Maps API key missing, using fallback key"
      );
      apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
    }
    if (!apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Geocoding API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    if (data.status === "ZERO_RESULTS") {
      throw new Error("No location data found for this address");
    }
    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      throw new Error(
        data.error_message || "Unable to validate address. Please try again."
      );
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address,
    };
  };

  // Quick add property function
  const handleQuickAddProperty = async () => {
    if (!zoneContext?.zoneId) {
      Alert.alert(
        "Zone missing",
        "Please configure the zone details before adding properties."
      );
      return;
    }

    if (filteredProperties.length === 0) {
      Alert.alert(
        "No properties",
        "Please add the first property using the 'Add Property' button above."
      );
      return;
    }

    try {
      setIsQuickAddingProperty(true);

      // Get last property from filtered list
      const lastProp = filteredProperties[filteredProperties.length - 1];
      const { number: lastNumber, street: lastStreet } = parseStreetData(
        lastProp.address
      );

      if (!lastNumber || !lastStreet) {
        Alert.alert(
          "Invalid address format",
          "Unable to calculate next property. Please use the 'Add Property' button to add manually."
        );
        return;
      }

      // Calculate next house number based on mode
      let nextNumber: number;
      if (selectedMode === "even") {
        // Next even number
        nextNumber = lastNumber % 2 === 0 ? lastNumber + 2 : lastNumber + 1;
      } else if (selectedMode === "odd") {
        // Next odd number
        nextNumber = lastNumber % 2 !== 0 ? lastNumber + 2 : lastNumber + 1;
      } else {
        // Sequential: just add 1
        nextNumber = lastNumber + 1;
      }

      // Construct next address
      const nextAddress = `${nextNumber} ${lastStreet}`;

      // Geocode the new address to get coordinates
      let latitude: number;
      let longitude: number;
      let formattedAddress: string;

      try {
        const geocodeData = await geocodeAddressWithPlaces(nextAddress);
        latitude = geocodeData.latitude;
        longitude = geocodeData.longitude;
        formattedAddress = geocodeData.formattedAddress || nextAddress;
      } catch (geocodeError) {
        // If geocoding fails, use coordinates from last property with slight offset
        console.warn(
          "[ManualZoneForm] Geocoding failed, using last property coordinates:",
          geocodeError
        );
        // Use last property's coordinates as fallback
        latitude = lastProp.coordinates[1];
        longitude = lastProp.coordinates[0];
        formattedAddress = nextAddress;
      }

      // Prepare payload (same as modal)
      const payload = {
        zoneId: zoneContext.zoneId,
        address: formattedAddress.trim(),
        houseNumber: nextNumber,
        coordinates: [longitude, latitude],
        status: "not-visited",
        dataSource: "MANUAL",
        notes: undefined, // No notes for quick add
      };

      // Save property
      const response = await apiInstance.post("/residents", payload);

      // Refresh properties list
      await refetchProperties();

      // Show success feedback (optional - can be removed for faster flow)
      // Alert.alert("Added", "Property added successfully.");
    } catch (error: any) {
      console.error("[ManualZoneForm] Failed to quick-add property:", error);
      Alert.alert(
        "Add failed",
        error?.response?.data?.message ||
          "Unable to add property. Please try again."
      );
    } finally {
      setIsQuickAddingProperty(false);
    }
  };

  // Quick add property from edit modal (uses selected property as base)
  const handleQuickAddFromEditModal = async () => {
    if (!zoneContext?.zoneId) {
      Alert.alert(
        "Zone missing",
        "Please configure the zone details before adding properties."
      );
      return;
    }

    if (!selectedProperty) {
      Alert.alert(
        "No property selected",
        "Please select a property to use as base for quick add."
      );
      return;
    }

    try {
      setIsQuickAddingProperty(true);

      // Use selected property as base
      const { number: baseNumber, street: baseStreet } = parseStreetData(
        selectedProperty.address
      );

      if (!baseNumber || !baseStreet) {
        Alert.alert(
          "Invalid address format",
          "Unable to calculate next property. Please use the 'Add Property' button to add manually."
        );
        return;
      }

      // Calculate next house number based on mode
      let nextNumber: number;
      if (selectedMode === "even") {
        // Next even number
        nextNumber = baseNumber % 2 === 0 ? baseNumber + 2 : baseNumber + 1;
      } else if (selectedMode === "odd") {
        // Next odd number
        nextNumber = baseNumber % 2 !== 0 ? baseNumber + 2 : baseNumber + 1;
      } else {
        // Sequential: just add 1
        nextNumber = baseNumber + 1;
      }

      // Construct next address
      const nextAddress = `${nextNumber} ${baseStreet}`;

      // Geocode the new address to get coordinates
      let latitude: number;
      let longitude: number;
      let formattedAddress: string;

      try {
        const geocodeData = await geocodeAddressWithPlaces(nextAddress);
        latitude = geocodeData.latitude;
        longitude = geocodeData.longitude;
        formattedAddress = geocodeData.formattedAddress || nextAddress;
      } catch (geocodeError) {
        // If geocoding fails, use coordinates from selected property
        console.warn(
          "[ManualZoneForm] Geocoding failed, using selected property coordinates:",
          geocodeError
        );
        // Use selected property's coordinates as fallback
        latitude = selectedProperty.coordinates[1];
        longitude = selectedProperty.coordinates[0];
        formattedAddress = nextAddress;
      }

      // Prepare payload
      const payload = {
        zoneId: zoneContext.zoneId,
        address: formattedAddress.trim(),
        houseNumber: nextNumber,
        coordinates: [longitude, latitude],
        status: "not-visited",
        dataSource: "MANUAL",
        notes: undefined, // No notes for quick add
      };

      // Save property
      const response = await apiInstance.post("/residents", payload);

      // Refresh properties list and get the new property
      const newPropertyId = response.data?.data?._id;
      if (newPropertyId) {
        // Refetch properties list
        const refetchResult = await refetchProperties();
        // The response structure is: { data: { data: { residents: [...] } } }
        const refetchedProperties: Property[] =
          refetchResult.data?.data?.residents || [];
        const newProperty = refetchedProperties.find(
          (p) => p._id === newPropertyId
        );

        if (newProperty) {
          // Switch to editing the new property
          setSelectedProperty(newProperty);
          setEditPropertyId(newProperty._id);

          // Get today's date in YYYY-MM-DD format
          const today = new Date().toISOString().split("T")[0];

          // Initialize form data with new property values
          setEditFormData({
            address: newProperty.address,
            houseNumber: newProperty.houseNumber?.toString() || "",
            longitude: newProperty.coordinates[0]?.toString() || "",
            latitude: newProperty.coordinates[1]?.toString() || "",
            status: newProperty.status,
            lastVisited: newProperty.lastVisited
              ? new Date(newProperty.lastVisited).toISOString().split("T")[0]
              : today,
            notes: newProperty.notes || "",
            phone: "",
            email: "",
            ownerName: "",
            ownerPhone: "",
            ownerEmail: "",
            ownerMailingAddress: "",
          });
        }
      }
    } catch (error: any) {
      console.error(
        "[ManualZoneForm] Failed to quick-add property from edit modal:",
        error
      );
      Alert.alert(
        "Add failed",
        error?.response?.data?.message ||
          "Unable to add property. Please try again."
      );
    } finally {
      setIsQuickAddingProperty(false);
    }
  };

  // Handle property click to open edit modal (like map zone view)
  const handlePropertyClick = (property: Property) => {
    // Open edit modal directly instead of detail modal
    handleEditProperty(property);
  };

  // Handle close detail modal
  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    // Don't clear selectedPropertyForDetails - keep it for cache reuse
  };

  // Handle next property in details modal
  const handleNextPropertyDetails = () => {
    if (!selectedPropertyForDetails || filteredProperties.length <= 1) return;

    // Find current property index in filtered list
    const currentIndex = filteredProperties.findIndex(
      (p) => p._id === selectedPropertyForDetails._id
    );

    if (currentIndex === -1) return;

    // Get next property (wrap around if at end)
    const nextIndex = (currentIndex + 1) % filteredProperties.length;
    const nextProperty = filteredProperties[nextIndex];

    // Update to next property
    setSelectedPropertyForDetails(nextProperty);
  };

  // Handle phone number press
  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Handle edit property
  const handleEditProperty = (property: Property) => {
    setSelectedProperty(property);
    setEditPropertyId(property._id);
    setIsEditModalOpen(true);
    // Close detail modal if open
    setIsDetailModalOpen(false);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Initialize form data with property values
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
  };

  // Handle close edit modal
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditPropertyId(null);
    setSelectedProperty(null);
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
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  };

  // Handle form change
  const handleFormChange = (field: string, value: string) => {
    if (isUpdatingResident) return;
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Validate form after change
    setTimeout(() => validateEditForm(), 500);
  };

  // Check if edit form is valid
  const isEditFormValid = (): boolean => {
    const basicInfoValid =
      editFormData.address.trim() !== "" &&
      editFormData.houseNumber.trim() !== "" &&
      editFormData.longitude.trim() !== "" &&
      editFormData.latitude.trim() !== "";

    const statusValid =
      editFormData.status === "not-visited" ||
      (editFormData.status !== "not-visited" &&
        editFormData.lastVisited.trim() !== "");

    return basicInfoValid && statusValid;
  };

  // Handle update resident
  const handleUpdateResident = async (keepModalOpen = false) => {
    if (!selectedProperty) {
      return;
    }

    const propertyId = editPropertyId || selectedProperty._id;

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

      const response = await apiInstance.put(
        `/residents/${propertyId}`,
        updateData
      );

      if (response.data.success) {
        // Update selectedProperty state immediately with saved values
        // This prevents navigateToProperty from detecting changes and trying to save again
        if (selectedProperty) {
          setSelectedProperty({
            ...selectedProperty,
            address: updateData.address,
            houseNumber: updateData.houseNumber || selectedProperty.houseNumber,
            coordinates: updateData.coordinates as [number, number],
            status: updateData.status,
            lastVisited: updateData.lastVisited || selectedProperty.lastVisited,
            notes: updateData.notes || selectedProperty.notes,
            phone: updateData.phone || selectedProperty.phone,
            email: updateData.email || selectedProperty.email,
          });
        }

        // Invalidate and refetch
        queryClient.invalidateQueries({
          queryKey: ["propertyDetails", propertyId],
        });
        queryClient.invalidateQueries({
          queryKey: ["zoneProperties", zoneContext?.zoneId],
        });
        queryClient.invalidateQueries({ queryKey: ["myTerritories"] });
        queryClient.invalidateQueries({ queryKey: ["agentDashboardStats"] });
        queryClient.invalidateQueries({ queryKey: ["manualZones"] });

        // Await refetch to ensure properties are updated
        const refetchResult = await refetchProperties();
        const refetchedProperties: Property[] =
          refetchResult.data?.data?.residents || [];

        // Compute filteredProperties using the same logic as useMemo
        let computedFilteredProperties: Property[] = [];
        if (selectedMode === "sequential") {
          computedFilteredProperties = [...refetchedProperties].sort(
            (a, b) => a.houseNumber - b.houseNumber
          );
        } else if (selectedMode === "odd") {
          computedFilteredProperties = refetchedProperties
            .filter((p) => p.houseNumber % 2 !== 0)
            .sort((a, b) => a.houseNumber - b.houseNumber);
        } else {
          computedFilteredProperties = refetchedProperties
            .filter((p) => p.houseNumber % 2 === 0)
            .sort((a, b) => a.houseNumber - b.houseNumber);
        }

        // If not keeping modal open, check if we should auto-navigate to next property
        if (!keepModalOpen) {
          // Use the computed filteredProperties for navigation
          const updatedFilteredProperties = computedFilteredProperties;

          // Auto-navigate to next property if multiple properties exist
          if (updatedFilteredProperties.length > 1) {
            // Find current property index using the propertyId we just saved
            const currentIndex = updatedFilteredProperties.findIndex(
              (p) => p._id === propertyId
            );

            if (currentIndex !== -1) {
              // Get next property (wrap around to first if at end)
              const nextIndex =
                (currentIndex + 1) % updatedFilteredProperties.length;
              const nextProperty = updatedFilteredProperties[nextIndex];

              // Navigate to next property directly (skip save check since we just saved)
              setSelectedProperty(nextProperty);
              setEditPropertyId(nextProperty._id);

              // Get today's date in YYYY-MM-DD format
              const today = new Date().toISOString().split("T")[0];

              // Initialize form data with next property values
              setEditFormData({
                address: nextProperty.address,
                houseNumber: nextProperty.houseNumber?.toString() || "",
                longitude: nextProperty.coordinates[0]?.toString() || "",
                latitude: nextProperty.coordinates[1]?.toString() || "",
                status: nextProperty.status,
                lastVisited: nextProperty.lastVisited
                  ? new Date(nextProperty.lastVisited)
                      .toISOString()
                      .split("T")[0]
                  : today,
                notes: nextProperty.notes || "",
                phone: "",
                email: "",
                ownerName: "",
                ownerPhone: "",
                ownerEmail: "",
                ownerMailingAddress: "",
              });

              // Invalidate queries to refresh property details
              void queryClient.invalidateQueries({
                queryKey: ["propertyDetails", nextProperty._id],
              });

              // Don't show alert, just navigate silently
              return; // Keep modal open, showing next property
            }
          }

          // If only 1 property or navigation failed, show success and close modal
          Alert.alert("Success", "Property updated successfully!");
          handleCloseEditModal();
        }
      }
    } catch (error: any) {
      console.error("Error updating resident:", error);

      let errorMessage = "Failed to update property. Please try again.";

      if (error.response?.status === 403) {
        errorMessage =
          "Permission denied. You may not have permission to update this property.";
      } else if (error.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.response?.status === 400) {
        errorMessage =
          error.response?.data?.message ||
          "Invalid data. Please check your input.";
      } else if (error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (!error.response) {
        errorMessage = "Network error. Please check your connection.";
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
      currentIndex === 0 ? filteredProperties.length - 1 : currentIndex - 1;
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

  // Show loading state while fetching zone in edit mode
  if (isEditMode && isLoadingZone) {
    return (
      <View style={styles.container}>
        <AppHeader
          onBackPress={handleBack}
          title="Manual Zone"
          showBackButton={true}
          backgroundColor={COLORS.primary[500]}
          navigationStyle={{
            paddingHorizontal: responsiveSpacing(PADDING.md),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Body2 color={COLORS.text.secondary} style={styles.loadingText}>
            Loading zone details...
          </Body2>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        onBackPress={handleBack}
        title={isEditMode ? "Edit Manual Zone" : "Manual Zone"}
        showBackButton={true}
        backgroundColor={COLORS.primary[500]}
        navigationStyle={{
          paddingHorizontal: responsiveSpacing(PADDING.md),
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.headerSection}>
            <H3 style={styles.title} align="center">
              {isEditMode
                ? "Edit Zone & Add Properties"
                : "Select Property Type"}
            </H3>
            <Body2
              color={COLORS.text.secondary}
              style={styles.description}
              align="center"
            >
              {isEditMode
                ? "Continue adding properties or edit zone details"
                : "Choose how you want to organize properties in your zone"}
            </Body2>
          </View>

          <View style={styles.zoneCard}>
            {zoneContext ? (
              <>
                <Body2 weight="bold">{zoneContext.zoneName}</Body2>
                <Body3 color={COLORS.text.secondary}>
                  ID: {zoneContext.zoneId}
                </Body3>
                <Body3 color={COLORS.text.secondary}>
                  {zoneContext.area?.name || "Area"} ·{" "}
                  {zoneContext.municipality?.name || "Municipality"} ·{" "}
                  {zoneContext.community?.name || "Community"}
                </Body3>
                <Button
                  title="Edit Zone Details"
                  variant="ghost"
                  size="small"
                  onPress={() => setIsDetailsModalVisible(true)}
                  containerStyle={styles.zoneActionButton}
                />
              </>
            ) : (
              <>
                <Body2 color={COLORS.text.secondary}>
                  Add zone details to unlock manual property entry.
                </Body2>
                <Button
                  title="Add Zone Details"
                  variant="outline"
                  size="small"
                  onPress={() => setIsDetailsModalVisible(true)}
                  containerStyle={styles.zoneActionButton}
                />
              </>
            )}
          </View>

          <View style={styles.buttonsContainer}>
            <Button
              title="Sequential"
              variant={selectedMode === "sequential" ? "primary" : "outline"}
              size="medium"
              leftIcon={
                <MaterialIcons
                  name="format-list-numbered"
                  size={responsiveScale(18)}
                  color={
                    selectedMode === "sequential"
                      ? COLORS.white
                      : COLORS.primary[500]
                  }
                />
              }
              onPress={() => handleModeSelect("sequential")}
              containerStyle={styles.button}
              textStyle={styles.buttonText}
            />

            <Button
              title="Even"
              variant={selectedMode === "even" ? "primary" : "outline"}
              size="medium"
              leftIcon={
                <MaterialIcons
                  name="looks-two"
                  size={responsiveScale(18)}
                  color={
                    selectedMode === "even" ? COLORS.white : COLORS.primary[500]
                  }
                />
              }
              onPress={() => handleModeSelect("even")}
              containerStyle={styles.button}
              textStyle={styles.buttonText}
            />

            <Button
              title="Odd"
              variant={selectedMode === "odd" ? "primary" : "outline"}
              size="medium"
              leftIcon={
                <MaterialIcons
                  name="looks-one"
                  size={responsiveScale(18)}
                  color={
                    selectedMode === "odd" ? COLORS.white : COLORS.primary[500]
                  }
                />
              }
              onPress={() => handleModeSelect("odd")}
              containerStyle={styles.button}
              textStyle={styles.buttonText}
            />
          </View>

          {/* Add Property Button */}
          <View style={styles.addPropertyContainer}>
            <Button
              title="+ Add Property"
              variant="primary"
              size="medium"
              fullWidth
              leftIcon={
                <MaterialIcons
                  name="add-home"
                  size={responsiveScale(20)}
                  color={COLORS.white}
                />
              }
              onPress={openAddPropertyModal}
              disabled={!zoneContext}
              containerStyle={styles.addPropertyButton}
            />
          </View>

          {/* Property List */}
          {zoneContext && (
            <View style={styles.propertiesSection}>
              <H3 style={styles.propertiesTitle}>
                {selectedMode === "sequential"
                  ? `All Properties (${filteredProperties.length})`
                  : selectedMode === "odd"
                  ? `Odd Properties (${filteredProperties.length})`
                  : `Even Properties (${filteredProperties.length})`}
              </H3>
              {isLoadingProperties ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                  <Body3
                    color={COLORS.text.secondary}
                    style={styles.loadingText}
                  >
                    Loading properties...
                  </Body3>
                </View>
              ) : filteredProperties.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Body2 color={COLORS.text.secondary} align="center">
                    {properties.length === 0
                      ? "No properties added yet. Use the buttons above to add properties."
                      : `No ${
                          selectedMode === "odd" ? "odd" : "even"
                        } house numbers found.`}
                  </Body2>
                </View>
              ) : (
                <View style={styles.propertiesList}>
                  {filteredProperties.map((property) => (
                    <TouchableOpacity
                      key={property._id}
                      style={styles.propertyCard}
                      activeOpacity={0.7}
                      onPress={() => handlePropertyClick(property)}
                    >
                      <View style={styles.propertyCardContent}>
                        {/* Header: Address with Edit Button */}
                        <View style={styles.propertyCardHeader}>
                          <View style={styles.propertyCardTopRow}>
                            <View style={styles.propertyCardAddressRow}>
                              <Text
                                style={styles.propertyCardAddress}
                                numberOfLines={2}
                              >
                                {property.address}
                              </Text>
                            </View>
                            <View style={styles.propertyCardRight}>
                              <View
                                style={[
                                  styles.statusBadge,
                                  {
                                    backgroundColor:
                                      statusColors[property.status] + "20",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusBadgeText,
                                    { color: statusColors[property.status] },
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

                        {/* Footer: House Number */}
                        <View style={styles.propertyCardFooter}>
                          <View style={styles.houseNumberBadge}>
                            <Text style={styles.houseNumberBadgeText}>
                              #{property.houseNumber}
                            </Text>
                          </View>
                        </View>

                        {/* Notes */}
                        <Text style={styles.propertyNotes}>
                          {property.notes || "No note"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Quick Add Button at Bottom */}
              {filteredProperties.length > 0 && zoneContext && (
                <View style={styles.quickAddContainer}>
                  <Button
                    title={isQuickAddingProperty ? "Adding..." : "Quick Add"}
                    variant="primary"
                    size="medium"
                    fullWidth
                    onPress={handleQuickAddProperty}
                    loading={isQuickAddingProperty}
                    disabled={isQuickAddingProperty || !zoneContext}
                    leftIcon={
                      isQuickAddingProperty ? undefined : (
                        <MaterialIcons
                          name="add-circle"
                          size={responsiveScale(20)}
                          color={COLORS.white}
                        />
                      )
                    }
                    containerStyle={styles.quickAddButton}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      <ManualZoneDetailsModal
        visible={isDetailsModalVisible}
        initialValue={(() => {
          if (!zoneContext) return undefined;

          const zoneId = zoneContext.zoneId || editZoneId;
          if (!zoneId) return undefined;

          const value: ManualZoneContext = {
            ...zoneContext,
            zoneId,
          };
          return value;
        })()}
        onSave={handleZoneSaved}
        onClose={() => {
          if (isEditMode) {
            // Edit mode: just close the modal, stay on current screen
            setIsDetailsModalVisible(false);
          } else {
            // Create mode: redirect to home screen
            router.replace("/(tabs)");
          }
        }}
      />
      <ManualZoneModal
        visible={isPropertyModalVisible}
        mode={selectedMode}
        zone={zoneContext}
        lastProperty={lastPropertyInfo}
        onClose={() => setIsPropertyModalVisible(false)}
        onPropertySaved={handlePropertySaved}
      />

      {/* Edit Property Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {}}
      >
        <Pressable style={styles.editModalOverlay} onPress={() => {}}>
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
                      setSelectedPropertyForDetails(selectedProperty);
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
                style={styles.editModalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
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
                          editable={!isUpdatingResident}
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
                          editable={!isUpdatingResident}
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
                          editable={!isUpdatingResident}
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
                          onCancel={() => setShowDatePicker(false)}
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
                          editable={!isUpdatingResident}
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
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={editFormData.address}
                          onChangeText={(value) =>
                            handleFormChange("address", value)
                          }
                          placeholder="Enter full property address"
                          editable={!isUpdatingResident}
                        />
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
                            editable={!isUpdatingResident}
                          />
                        </View>
                        <View style={[styles.editFormField, { flex: 1 }]}>
                          <Text style={styles.editFormLabel}>Location</Text>
                          <TouchableOpacity
                            style={styles.editFormLocationButton}
                            onPress={async () => {
                              try {
                                setIsEditGettingLocation(true);
                                const { status } =
                                  await Location.requestForegroundPermissionsAsync();
                                if (status !== "granted") {
                                  Alert.alert(
                                    "Permission Denied",
                                    "Location permission is required."
                                  );
                                  setIsEditGettingLocation(false);
                                  return;
                                }
                                const location =
                                  await Location.getCurrentPositionAsync({
                                    accuracy: Location.Accuracy.High,
                                  });

                                const lat = location.coords.latitude;
                                const lng = location.coords.longitude;

                                setEditFormData((prev) => ({
                                  ...prev,
                                  latitude: lat.toString(),
                                  longitude: lng.toString(),
                                }));

                                try {
                                  const geocodeResult =
                                    await Location.reverseGeocodeAsync({
                                      latitude: lat,
                                      longitude: lng,
                                    });

                                  if (
                                    geocodeResult &&
                                    geocodeResult.length > 0
                                  ) {
                                    const address = geocodeResult[0];
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

                                    const houseNumber =
                                      addr.streetNumber ||
                                      formattedAddress.match(/^(\d+)/)?.[1] ||
                                      "";

                                    setEditFormData((prev) => ({
                                      ...prev,
                                      address: formattedAddress || prev.address,
                                      houseNumber:
                                        houseNumber || prev.houseNumber,
                                    }));

                                    Alert.alert(
                                      "Location Captured",
                                      `Address: ${
                                        formattedAddress ||
                                        `${lat.toFixed(6)}, ${lng.toFixed(6)}`
                                      }`
                                    );
                                  } else {
                                    Alert.alert(
                                      "Location Captured",
                                      `Coordinates: ${lat.toFixed(
                                        6
                                      )}, ${lng.toFixed(6)}`
                                    );
                                  }
                                } catch (geocodeError) {
                                  console.error(
                                    "Error reverse geocoding:",
                                    geocodeError
                                  );
                                  Alert.alert(
                                    "Location Captured",
                                    `Coordinates: ${lat.toFixed(
                                      6
                                    )}, ${lng.toFixed(6)}`
                                  );
                                }
                              } catch (error: any) {
                                Alert.alert(
                                  "Error",
                                  error.message || "Failed to get location"
                                );
                              } finally {
                                setIsEditGettingLocation(false);
                              }
                            }}
                            disabled={
                              isUpdatingResident || isEditGettingLocation
                            }
                            activeOpacity={0.7}
                          >
                            {isEditGettingLocation ? (
                              <ActivityIndicator
                                size="small"
                                color={COLORS.primary[500]}
                              />
                            ) : (
                              <Ionicons
                                name="location-outline"
                                size={responsiveScale(16)}
                                color={COLORS.primary[500]}
                              />
                            )}
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
                            editable={!isUpdatingResident}
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
                            editable={!isUpdatingResident}
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
                disabled={isUpdatingResident || isQuickAddingProperty}
                activeOpacity={0.7}
              >
                <Text style={styles.editModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <View style={styles.editModalRightButtons}>
                <TouchableOpacity
                  style={[
                    styles.editModalQuickAddButton,
                    (isUpdatingResident ||
                      isQuickAddingProperty ||
                      !zoneContext) &&
                      styles.editModalQuickAddButtonDisabled,
                  ]}
                  onPress={handleQuickAddFromEditModal}
                  disabled={
                    isUpdatingResident || isQuickAddingProperty || !zoneContext
                  }
                  activeOpacity={0.7}
                >
                  {isQuickAddingProperty ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <MaterialIcons
                      name="add-circle"
                      size={responsiveScale(20)}
                      color={COLORS.white}
                    />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.editModalSaveButton,
                    (!isEditFormValid() ||
                      isUpdatingResident ||
                      isQuickAddingProperty) &&
                      styles.editModalSaveButtonDisabled,
                  ]}
                  onPress={() => handleUpdateResident(false)}
                  disabled={
                    isUpdatingResident ||
                    !isEditFormValid() ||
                    isQuickAddingProperty
                  }
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
          style={styles.statusModalOverlay}
          onPress={() => setEditStatusDropdownVisible(false)}
        >
          <View style={styles.statusModalContent}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Select Status</Text>
              <TouchableOpacity
                onPress={() => setEditStatusDropdownVisible(false)}
                style={styles.statusModalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.statusModalOptions}>
              {(
                [
                  "not-visited",
                  "interested",
                  "visited",
                  "not-opened",
                  "appointment",
                  "follow-up",
                  "not-interested",
                ] as const
              ).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.statusModalOption,
                    editFormData.status === status &&
                      styles.statusModalOptionActive,
                  ]}
                  onPress={() => {
                    handleFormChange("status", status);
                    setEditStatusDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.statusModalOptionText,
                      editFormData.status === status &&
                        styles.statusModalOptionTextActive,
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
                {selectedPropertyForDetails && (
                  <TouchableOpacity
                    onPress={() =>
                      handleEditProperty(selectedPropertyForDetails)
                    }
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
                                statusColors[
                                  detailedProperty.resident?.status ||
                                    selectedPropertyForDetails?.status ||
                                    "not-visited"
                                ] + "20",
                            },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={responsiveScale(24)}
                            color={
                              statusColors[
                                detailedProperty.resident?.status ||
                                  selectedPropertyForDetails?.status ||
                                  "not-visited"
                              ]
                            }
                          />
                        </View>
                        <View style={styles.propertyDetailHeaderContent}>
                          <Text style={styles.propertyDetailAddress}>
                            {detailedProperty.resident?.address ||
                              selectedPropertyForDetails?.address}
                          </Text>
                          <View style={styles.propertyDetailStatusBadge}>
                            <View
                              style={[
                                styles.propertyDetailStatusBadgeInner,
                                {
                                  backgroundColor:
                                    statusColors[
                                      detailedProperty.resident?.status ||
                                        selectedPropertyForDetails?.status ||
                                        "not-visited"
                                    ] + "20",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.propertyDetailStatusText,
                                  {
                                    color:
                                      statusColors[
                                        detailedProperty.resident?.status ||
                                          selectedPropertyForDetails?.status ||
                                          "not-visited"
                                      ],
                                  },
                                ]}
                              >
                                {getStatusDisplayName(
                                  (detailedProperty.resident?.status ||
                                    selectedPropertyForDetails?.status ||
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
                        selectedPropertyForDetails?.notes) && (
                        <View style={styles.propertyDetailContactRow}>
                          <Ionicons
                            name="document-text-outline"
                            size={responsiveScale(20)}
                            color={COLORS.text.secondary}
                          />
                          <Text style={styles.propertyDetailContactText}>
                            {detailedProperty.resident?.notes ||
                              selectedPropertyForDetails?.notes}
                          </Text>
                        </View>
                      )}

                      {/* Contact Information */}
                      {(detailedProperty.resident?.phone ||
                        detailedProperty.resident?.email) && (
                        <>
                          <Text
                            style={[
                              styles.propertyDetailSectionTitle,
                              {
                                marginTop:
                                  detailedProperty.resident?.notes ||
                                  selectedPropertyForDetails?.notes
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
                    </View>

                    {/* Next Property Button */}
                    {selectedPropertyForDetails &&
                      filteredProperties.length > 1 && (
                        <View style={styles.propertyDetailNextButtonContainer}>
                          <TouchableOpacity
                            style={styles.propertyDetailNextButton}
                            onPress={handleNextPropertyDetails}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.propertyDetailNextButtonText}>
                              Next Property
                            </Text>
                            <Ionicons
                              name="chevron-forward"
                              size={responsiveScale(18)}
                              color={COLORS.white}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
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
  content: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.xl),
  },
  headerSection: {
    marginBottom: responsiveSpacing(SPACING.xl),
    alignItems: "center",
  },
  title: {
    marginBottom: responsiveSpacing(SPACING.xs),
    textAlign: "center",
  },
  description: {
    marginTop: 0,
    textAlign: "center",
  },
  buttonsContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    alignItems: "stretch",
  },
  addPropertyContainer: {
    marginTop: responsiveSpacing(SPACING.md),
  },
  addPropertyButton: {
    backgroundColor: COLORS.success[500],
  },
  zoneCard: {
    padding: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(16),
    backgroundColor: COLORS.white,
    marginBottom: responsiveSpacing(SPACING.lg),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
    gap: responsiveSpacing(SPACING.xs),
  },
  zoneActionButton: {
    alignSelf: "flex-start",
    marginTop: responsiveSpacing(SPACING.xs),
  },
  button: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
    paddingHorizontal: responsiveSpacing(PADDING.xs / 2),
    paddingVertical: responsiveSpacing(SPACING.xs),
    height: responsiveScale(40),
  },
  buttonText: {
    fontSize: responsiveScale(12),
    lineHeight: responsiveScale(16),
  },
  propertiesSection: {
    marginTop: responsiveSpacing(SPACING.xl),
  },
  propertiesTitle: {
    marginBottom: responsiveSpacing(SPACING.md),
  },
  propertiesList: {
    gap: responsiveSpacing(SPACING.sm),
  },
  quickAddContainer: {
    marginTop: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  quickAddButton: {
    backgroundColor: COLORS.success[500],
  },
  propertyCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    marginBottom: responsiveSpacing(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border.light,
    overflow: "hidden",
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
    minWidth: 0,
  },
  propertyCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  propertyCardFooter: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  houseNumberBadge: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(6),
    alignSelf: "flex-start",
  },
  houseNumberBadgeText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    color: COLORS.white,
  },
  statusBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.xs / 2),
    paddingTop: responsiveSpacing(SPACING.xs / 8),
    paddingBottom: responsiveSpacing(SPACING.xs / 8),
    borderRadius: responsiveScale(3),
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: responsiveScale(11),
    fontWeight: "500",
  },
  editButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
    justifyContent: "center",
    alignItems: "center",
  },
  propertyNotes: {
    marginTop: responsiveSpacing(SPACING.xs),
    fontSize: responsiveScale(12),
    color: COLORS.text.light,
    fontStyle: "italic",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.sm),
  },
  loadingText: {
    marginLeft: responsiveSpacing(SPACING.xs),
  },
  emptyContainer: {
    padding: responsiveSpacing(SPACING.lg),
    alignItems: "center",
  },
  // Edit Modal Styles
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  editModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(20),
    height: Dimensions.get("window").height * 0.85,
    width: "95%",
    alignSelf: "center",
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
  editModalNextButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.primary[500],
    paddingVertical: responsiveSpacing(SPACING.xs),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
  },
  editModalNextButtonHeaderDisabled: {
    backgroundColor: COLORS.neutral[300],
    opacity: 0.5,
  },
  editModalNextButtonHeaderText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    color: COLORS.white,
  },
  editModalChevronButton: {
    padding: responsiveSpacing(SPACING.xs),
    justifyContent: "center",
    alignItems: "center",
  },
  editModalChevronButtonDisabled: {
    opacity: 0.3,
  },
  editModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs),
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    flexShrink: 0,
    gap: responsiveSpacing(SPACING.sm),
  },
  editModalCancelButton: {
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.neutral[100],
    minHeight: responsiveScale(40),
    justifyContent: "center",
    alignItems: "center",
  },
  editModalCancelButtonText: {
    fontSize: responsiveScale(12),
    fontWeight: "500",
    color: COLORS.text.secondary,
  },
  editModalRightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
  },
  editModalNextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.primary[500],
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    borderRadius: responsiveScale(8),
    flex: 1,
    maxWidth: responsiveScale(150),
  },
  editModalNextButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
    opacity: 0.5,
  },
  editModalNextButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.white,
  },
  editModalQuickAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.success[500],
    minWidth: responsiveScale(40),
    minHeight: responsiveScale(40),
  },
  editModalQuickAddButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
    opacity: 0.5,
  },
  editModalQuickAddButtonText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    color: COLORS.white,
  },
  editModalSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.primary[500],
    minHeight: responsiveScale(40),
  },
  editModalSaveButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
    opacity: 0.5,
  },
  editModalSaveButtonText: {
    fontSize: responsiveScale(12),
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
  // Status Modal Styles
  statusModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  statusModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    width: "85%",
    maxHeight: Dimensions.get("window").height * 0.6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  statusModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screen),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  statusModalTitle: {
    fontSize: responsiveScale(18),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  statusModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  statusModalOptions: {
    padding: responsiveSpacing(SPACING.sm),
  },
  statusModalOption: {
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  statusModalOptionActive: {
    backgroundColor: COLORS.primary[100],
  },
  statusModalOptionText: {
    fontSize: responsiveScale(16),
    color: COLORS.text.primary,
  },
  statusModalOptionTextActive: {
    color: COLORS.primary[600],
    fontWeight: "600",
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
  editFormValidatingText: {
    fontSize: responsiveScale(12),
    color: COLORS.primary[600],
  },
  // Property Details Modal Styles
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
  propertyModalHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
  },
  propertyModalEditButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  propertyModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
  },
  propertyModalLoading: {
    minHeight: responsiveScale(300),
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    gap: responsiveSpacing(SPACING.md),
  },
  propertyModalLoadingText: {
    marginTop: responsiveSpacing(SPACING.md),
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  propertyModalScroll: {
    flexShrink: 1,
  },
  propertyModalScrollContent: {
    padding: responsiveSpacing(PADDING.screen),
    paddingBottom: responsiveSpacing(SPACING.xl),
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
    marginBottom: responsiveSpacing(SPACING.md),
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
  propertyDetailContentCard: {
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    marginTop: responsiveSpacing(SPACING.md),
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
  propertyDetailNextButtonContainer: {
    marginTop: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  propertyDetailNextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.primary[500],
    paddingVertical: responsiveSpacing(SPACING.md),
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    borderRadius: responsiveScale(12),
  },
  propertyDetailNextButtonText: {
    fontSize: responsiveScale(14),
    fontWeight: "600",
    color: COLORS.white,
  },
});
