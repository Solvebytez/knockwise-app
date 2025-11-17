import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { getGoogleMapsApiKey } from "@/lib/googleMaps";

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

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  territoryId: string;
  onSuccess?: (newProperty: Property) => void;
}

export interface AddPropertyModalRef {
  updateCoordinates: (latitude: number, longitude: number) => void;
}

const getStatusDisplayName = (status: Property["status"]): string => {
  const statusMap: Record<Property["status"], string> = {
    "not-visited": "⏳ Not Visited",
    interested: "✓ Interested",
    visited: "✓ Visited",
    callback: "📞 Callback",
    appointment: "📅 Appointment",
    "follow-up": "🔄 Follow-up",
    "not-interested": "❌ Not Interested",
  };
  return statusMap[status] || "⏳ Not Visited";
};

const AddPropertyModal = React.forwardRef<
  AddPropertyModalRef,
  AddPropertyModalProps
>(({ isOpen, onClose, territoryId, onSuccess }, ref): React.JSX.Element => {
  const queryClient = useQueryClient();

  // Form data state
  const [addFormData, setAddFormData] = useState({
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

  // Loading and validation states
  const [isAddingResident, setIsAddingResident] = useState(false);
  const [isAddValidating, setIsAddValidating] = useState(false);
  const [addValidationErrors, setAddValidationErrors] = useState<string[]>([]);
  const [isAddGettingLocation, setIsAddGettingLocation] = useState(false);
  const [showAddDatePicker, setShowAddDatePicker] = useState(false);
  const [addStatusDropdownVisible, setAddStatusDropdownVisible] =
    useState(false);

  // Address autocomplete states
  const [addAddressSuggestions, setAddAddressSuggestions] = useState<any[]>([]);
  const [showAddAddressSuggestions, setShowAddAddressSuggestions] =
    useState(false);
  const [isLoadingAddSuggestions, setIsLoadingAddSuggestions] =
    useState(false);
  const addAddressInputRef = useRef<TextInput>(null);
  const addAddressSearchTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Handle form change
  const handleAddFormChange = (field: string, value: string) => {
    if (isAddingResident) return;
    setAddFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setTimeout(() => validateAddForm(), 500);
  };

  // Validate form
  const validateAddForm = async (): Promise<boolean> => {
    setIsAddValidating(true);
    setAddValidationErrors([]);

    const errors: string[] = [];

    try {
      if (!addFormData.houseNumber.trim()) {
        errors.push("House number is required");
      }

      if (addFormData.latitude && addFormData.longitude) {
        const lat = parseFloat(addFormData.latitude);
        const lng = parseFloat(addFormData.longitude);

        if (isNaN(lat) || isNaN(lng)) {
          errors.push("Invalid coordinates format");
        } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          errors.push("Coordinates are out of valid range");
        }
      }

      setAddValidationErrors(errors);
      return errors.length === 0;
    } catch (error) {
      console.error("Error validating add form:", error);
      setAddValidationErrors(["Validation error occurred"]);
      return false;
    } finally {
      setIsAddValidating(false);
    }
  };

  // Check if form is valid
  const isAddFormValid = (): boolean => {
    const basicInfoValid =
      addFormData.address.trim() !== "" &&
      addFormData.houseNumber.trim() !== "" &&
      addFormData.longitude.trim() !== "" &&
      addFormData.latitude.trim() !== "";

    const statusValid =
      (addFormData.status as string) === "not-visited" ||
      ((addFormData.status as string) !== "not-visited" &&
        addFormData.lastVisited.trim() !== "");

    return basicInfoValid && statusValid;
  };

  // Handle address input change with debounced autocomplete
  const handleAddAddressInputChange = (value: string) => {
    handleAddFormChange("address", value);

    if (addAddressSearchTimeoutRef.current) {
      clearTimeout(addAddressSearchTimeoutRef.current);
    }

    addAddressSearchTimeoutRef.current = setTimeout(() => {
      fetchAddAddressSuggestions(value);
    }, 300);
  };

  // Fetch address suggestions
  const fetchAddAddressSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setAddAddressSuggestions([]);
      setShowAddAddressSuggestions(false);
      return;
    }

    try {
      setIsLoadingAddSuggestions(true);
      const apiKey = "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M";
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          query
        )}&key=${apiKey}&types=address&components=country:ca`
      );

      const data = await response.json();

      if (data.status === "OK" && data.predictions) {
        setAddAddressSuggestions(data.predictions);
        setShowAddAddressSuggestions(true);
      } else {
        setAddAddressSuggestions([]);
        setShowAddAddressSuggestions(false);
      }
    } catch (error) {
      console.error("Error fetching address suggestions:", error);
      setAddAddressSuggestions([]);
      setShowAddAddressSuggestions(false);
    } finally {
      setIsLoadingAddSuggestions(false);
    }
  };

  // Handle address suggestion selection
  const handleSelectAddAddressSuggestion = async (suggestion: any) => {
    setAddFormData((prev) => ({
      ...prev,
      address: suggestion.description,
    }));
    setShowAddAddressSuggestions(false);
    setAddAddressSuggestions([]);
    await handleAddAddressSearchForSuggestion(suggestion.description);
  };

  // Helper function to geocode address using Google Geocoding API (bypasses location permission)
  const geocodeAddressWithPlaces = async (address: string) => {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    const location = result.geometry.location;
    const addressComponents = result.address_components || [];

    // Extract address components
    const getComponent = (type: string) => {
      const component = addressComponents.find((comp: any) =>
        comp.types.includes(type)
      );
      return component?.long_name || "";
    };

    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: result.formatted_address,
      streetNumber: getComponent("street_number"),
      street: getComponent("route"),
      city: getComponent("locality") || getComponent("administrative_area_level_2"),
      region: getComponent("administrative_area_level_1"),
      postalCode: getComponent("postal_code"),
      country: getComponent("country"),
    };
  };

  // Handle address search for selected suggestion
  const handleAddAddressSearchForSuggestion = async (address: string) => {
    if (!address.trim()) {
      return;
    }

    try {
      setIsAddValidating(true);
      const geocodeData = await geocodeAddressWithPlaces(address);

      if (geocodeData) {
        const { latitude: lat, longitude: lng, formattedAddress, streetNumber, street, city, region, postalCode, country } = geocodeData;

        const formattedAddressParts = [
          streetNumber,
          street,
          city,
          region,
          postalCode,
          country,
        ].filter(Boolean);

        const finalFormattedAddress =
          formattedAddressParts.length > 0
            ? formattedAddressParts.join(", ")
            : formattedAddress || address || `${lat}, ${lng}`;

        const houseNumber =
          streetNumber ||
          finalFormattedAddress.match(/^(\d+)/)?.[1] ||
          addFormData.houseNumber;

        setAddFormData((prev) => ({
          ...prev,
          latitude: lat.toString(),
          longitude: lng.toString(),
          address: finalFormattedAddress || prev.address,
          houseNumber: houseNumber || prev.houseNumber,
        }));
      }
    } catch (error) {
      console.error("❌ Error finding exact coordinates:", error);
    } finally {
      setIsAddValidating(false);
    }
  };

  // Handle address search
  const handleAddAddressSearch = async () => {
    if (!addFormData.address.trim()) {
      Alert.alert("Error", "Please enter an address to search");
      return;
    }

    try {
      setIsAddValidating(true);
      const geocodeData = await geocodeAddressWithPlaces(addFormData.address);

      if (geocodeData) {
        const { latitude: lat, longitude: lng, formattedAddress, streetNumber, street, city, region, postalCode, country } = geocodeData;

        const formattedAddressParts = [
          streetNumber,
          street,
          city,
          region,
          postalCode,
          country,
        ].filter(Boolean);

        const finalFormattedAddress =
          formattedAddressParts.length > 0
            ? formattedAddressParts.join(", ")
            : formattedAddress || addFormData.address || `${lat}, ${lng}`;

        const houseNumber =
          streetNumber ||
          finalFormattedAddress.match(/^(\d+)/)?.[1] ||
          addFormData.houseNumber;

        setAddFormData((prev) => ({
          ...prev,
          latitude: lat.toString(),
          longitude: lng.toString(),
          address: finalFormattedAddress || prev.address,
          houseNumber: houseNumber || prev.houseNumber,
        }));

        Alert.alert(
          "Success",
          `Coordinates found: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        );
      } else {
        Alert.alert("Error", "No location data found for this address");
      }
    } catch (error) {
      console.error("❌ Error finding exact coordinates:", error);
      Alert.alert(
        "Error",
        "Failed to find coordinates. Please check the address and try again."
      );
    } finally {
      setIsAddValidating(false);
    }
  };

  // Handle use my location
  const handleAddUseMyLocation = async () => {
    try {
      setIsAddGettingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to use this feature. Please enable location access in your device settings."
        );
        setIsAddGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = location.coords.latitude;
      const lng = location.coords.longitude;

      setAddFormData((prev) => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString(),
      }));

      try {
        const geocodeResult = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });

        if (geocodeResult && geocodeResult.length > 0) {
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
            addr.streetNumber || formattedAddress.match(/^(\d+)/)?.[1] || "";

          setAddFormData((prev) => ({
            ...prev,
            address: formattedAddress || prev.address,
            houseNumber: houseNumber || prev.houseNumber,
          }));

          Alert.alert(
            "Success",
            `Location captured: ${formattedAddress || `${lat}, ${lng}`}`
          );
        } else {
          Alert.alert(
            "Success",
            `Coordinates captured: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
          );
        }
      } catch (geocodeError) {
        console.error("❌ Error reverse geocoding:", geocodeError);
        Alert.alert(
          "Success",
          `Coordinates captured: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        );
      }
    } catch (error) {
      console.error("❌ Error getting location:", error);
      Alert.alert(
        "Error",
        "Failed to get your location. Please check your device settings and try again."
      );
    } finally {
      setIsAddGettingLocation(false);
    }
  };

  // Handle add resident
  const handleAddResident = async () => {
    try {
      setIsAddingResident(true);

      if (!addFormData.houseNumber) {
        Alert.alert("Error", "Please enter a house number");
        setIsAddingResident(false);
        return;
      }

      const createData = {
        zoneId: territoryId,
        address: addFormData.address,
        houseNumber: parseInt(addFormData.houseNumber),
        coordinates: [
          parseFloat(addFormData.longitude),
          parseFloat(addFormData.latitude),
        ],
        status: addFormData.status,
        lastVisited: addFormData.lastVisited || undefined,
        notes: addFormData.notes || undefined,
        phone: addFormData.phone || undefined,
        email: addFormData.email || undefined,
        ownerName: addFormData.ownerName || undefined,
        ownerPhone: addFormData.ownerPhone || undefined,
        ownerEmail: addFormData.ownerEmail || undefined,
        ownerMailingAddress: addFormData.ownerMailingAddress || undefined,
      };

      const response = await apiInstance.post("/residents", createData);

      if (response.data.success) {
        Alert.alert("Success", "Property added successfully!");

        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: ["myTerritories"] });
        queryClient.invalidateQueries({
          queryKey: ["admin", "team-performance"],
        });
        queryClient.invalidateQueries({
          queryKey: ["admin", "territory-stats"],
        });
        queryClient.invalidateQueries({
          queryKey: ["admin", "assignment-status"],
        });
        queryClient.invalidateQueries({
          queryKey: ["territoryMapView", territoryId],
        });

        // Create new property object
        const newProperty: Property = {
          _id: response.data.data._id,
          address: createData.address,
          houseNumber: createData.houseNumber,
          coordinates: createData.coordinates as [number, number],
          status: createData.status,
          lastVisited: createData.lastVisited,
          notes: createData.notes,
          dataSource: "MANUAL",
          ...(response.data.data?.lastUpdatedBy && {
            lastUpdatedBy: response.data.data.lastUpdatedBy,
          }),
        };

        // Call onSuccess callback
        if (onSuccess) {
          onSuccess(newProperty);
        }

        // Reset form and close
        handleCloseModal();
      }
    } catch (error: any) {
      console.error("❌ Error creating resident:", error);

      let errorMessage = "Failed to add property. Please try again.";

      if (error.response?.status === 403) {
        errorMessage =
          "Permission denied. You may not have permission to add properties, or your session may have expired. Please try logging in again.";
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
      setIsAddingResident(false);
    }
  };

  // Handle close modal
  const handleCloseModal = () => {
    setAddFormData({
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
    setAddValidationErrors([]);
    setShowAddAddressSuggestions(false);
    setAddAddressSuggestions([]);
    onClose();
  };

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setAddFormData({
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
      setAddValidationErrors([]);
      setShowAddAddressSuggestions(false);
      setAddAddressSuggestions([]);
    }
  }, [isOpen]);

  // Expose form data update function for map click handler
  React.useImperativeHandle(
    ref,
    () => ({
      updateCoordinates: (latitude: number, longitude: number) => {
        setAddFormData((prev) => ({
          ...prev,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        }));
        Alert.alert(
          "Coordinates Captured",
          `Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        );
      },
    })
  );

  return (
    <>
      <Modal
        visible={isOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          // Prevent Android back button from closing modal
        }}
      >
        <Pressable
          style={styles.propertyModalOverlay}
          onPress={() => {
            // Prevent overlay click from closing modal
          }}
        >
          <View style={styles.editModalContent}>
            {/* Modal Header */}
            <View style={styles.editModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.editModalTitle}>Add New Property</Text>
                <Text style={styles.editModalSubtitle}>
                  Use your GPS location, click on the map, or enter coordinates
                  manually
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.propertyModalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>

            {/* Modal Content (Form) */}
            <View style={styles.editModalScrollWrapper}>
              <ScrollView
                style={styles.editModalScroll}
                contentContainerStyle={styles.editModalScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Basic Information Section */}
                <View style={styles.editFormSection}>
                  <View style={styles.editFormSectionHeader}>
                    <View
                      style={[
                        styles.editFormSectionHeaderBar,
                        { backgroundColor: COLORS.primary[500] },
                      ]}
                    />
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
                          ref={addAddressInputRef}
                          style={styles.editFormInput}
                          value={addFormData.address}
                          onChangeText={handleAddAddressInputChange}
                          placeholder="Enter full property address"
                          editable={!isAddingResident}
                          onFocus={() => {
                            if (
                              addFormData.address &&
                              addAddressSuggestions.length === 0
                            ) {
                              fetchAddAddressSuggestions(addFormData.address);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setShowAddAddressSuggestions(false);
                            }, 200);
                          }}
                        />
                        {isLoadingAddSuggestions && (
                          <ActivityIndicator
                            size="small"
                            color={COLORS.primary[500]}
                            style={styles.editFormSearchButton}
                          />
                        )}
                        {!isLoadingAddSuggestions && (
                          <TouchableOpacity
                            style={styles.editFormSearchButton}
                            onPress={handleAddAddressSearch}
                            disabled={
                              !addFormData.address || isAddingResident
                            }
                          >
                            <Ionicons
                              name="search-outline"
                              size={responsiveScale(16)}
                              color={
                                !addFormData.address || isAddingResident
                                  ? COLORS.text.light
                                  : COLORS.text.secondary
                              }
                            />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Address Suggestions Dropdown */}
                      {showAddAddressSuggestions &&
                        addAddressSuggestions.length > 0 && (
                          <View style={styles.addressSuggestionsContainer}>
                            <ScrollView
                              style={styles.addressSuggestionsList}
                              keyboardShouldPersistTaps="handled"
                              nestedScrollEnabled={true}
                              showsVerticalScrollIndicator={true}
                            >
                              {addAddressSuggestions.map((suggestion, index) => (
                                <TouchableOpacity
                                  key={suggestion.place_id || index}
                                  style={styles.addressSuggestionItem}
                                  onPress={() =>
                                    handleSelectAddAddressSuggestion(suggestion)
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
                        <Text style={styles.editFormLabel}>
                          House Number *
                        </Text>
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={addFormData.houseNumber}
                          onChangeText={(value) =>
                            handleAddFormChange("houseNumber", value)
                          }
                          placeholder="House number"
                          placeholderTextColor={COLORS.text.light}
                          keyboardType="numeric"
                          editable={!isAddingResident}
                        />
                      </View>
                      <View style={[styles.editFormField, { flex: 1 }]}>
                        <Text style={styles.editFormLabel}>Location</Text>
                        <TouchableOpacity
                          style={styles.editFormLocationButton}
                          onPress={handleAddUseMyLocation}
                          disabled={isAddingResident || isAddGettingLocation}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="location-outline"
                            size={responsiveScale(16)}
                            color={COLORS.primary[600]}
                          />
                          <Text style={styles.editFormLocationButtonText}>
                            {isAddGettingLocation
                              ? "Finding.."
                              : "Use My location"}
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
                          value={addFormData.longitude}
                          onChangeText={(value) =>
                            handleAddFormChange("longitude", value)
                          }
                          placeholder="Click map or enter manually"
                          keyboardType="numeric"
                          editable={!isAddingResident}
                        />
                      </View>
                      <View style={[styles.editFormField, { flex: 1 }]}>
                        <Text style={styles.editFormLabel}>Latitude</Text>
                        <TextInput
                          style={styles.editFormInputStandalone}
                          value={addFormData.latitude}
                          onChangeText={(value) =>
                            handleAddFormChange("latitude", value)
                          }
                          placeholder="Click map or enter manually"
                          keyboardType="numeric"
                          editable={!isAddingResident}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Status & Tracking Section */}
                <View style={[styles.editFormSection, styles.editFormSectionGreen]}>
                  <View style={styles.editFormSectionHeader}>
                    <View
                      style={[
                        styles.editFormSectionHeaderBar,
                        { backgroundColor: COLORS.success[500] },
                      ]}
                    />
                    <Text style={styles.editFormSectionTitle}>
                      Status & Tracking
                    </Text>
                  </View>

                  <View style={styles.editFormFields}>
                    {/* Status */}
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Status *</Text>
                      <TouchableOpacity
                        style={styles.editFormSelect}
                        onPress={() => setAddStatusDropdownVisible(true)}
                        disabled={isAddingResident}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.editFormSelectText}>
                          {getStatusDisplayName(addFormData.status)}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={responsiveScale(16)}
                          color={COLORS.text.secondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Last Visited */}
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>
                        Last Visited{" "}
                        {addFormData.status !== "not-visited" && (
                          <Text style={{ color: COLORS.error[500] }}>*</Text>
                        )}
                      </Text>
                      <View style={styles.editFormInputContainer}>
                        <TextInput
                          style={styles.editFormInput}
                          value={addFormData.lastVisited}
                          onChangeText={(value) =>
                            handleAddFormChange("lastVisited", value)
                          }
                          placeholder="YYYY-MM-DD"
                          editable={false}
                          onPressIn={() => setShowAddDatePicker(true)}
                        />
                        <TouchableOpacity
                          style={styles.editFormDatePickerButton}
                          onPress={() => setShowAddDatePicker(true)}
                          activeOpacity={0.7}
                          disabled={isAddingResident}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={responsiveScale(18)}
                            color={COLORS.text.secondary}
                          />
                        </TouchableOpacity>
                      </View>
                      {addFormData.status !== "not-visited" &&
                        !addFormData.lastVisited && (
                          <Text style={styles.editFormHelperText}>
                            Required when status is not &quot;Not Visited&quot;
                          </Text>
                        )}
                      <DateTimePickerModal
                        isVisible={showAddDatePicker}
                        mode="date"
                        date={
                          addFormData.lastVisited
                            ? new Date(addFormData.lastVisited)
                            : new Date()
                        }
                        maximumDate={new Date()}
                        onConfirm={(selectedDate) => {
                          const formattedDate = selectedDate
                            .toISOString()
                            .split("T")[0];
                          handleAddFormChange("lastVisited", formattedDate);
                          setShowAddDatePicker(false);
                        }}
                        onCancel={() => {
                          setShowAddDatePicker(false);
                        }}
                      />
                    </View>

                    {/* Notes */}
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Notes</Text>
                      <TextInput
                        style={[
                          styles.editFormInputStandalone,
                          {
                            minHeight: responsiveScale(80),
                            textAlignVertical: "top",
                            paddingTop: responsiveSpacing(SPACING.sm),
                          },
                        ]}
                        value={addFormData.notes}
                        onChangeText={(value) =>
                          handleAddFormChange("notes", value)
                        }
                        placeholder="Enter notes about the property..."
                        multiline={true}
                        numberOfLines={3}
                        editable={!isAddingResident}
                      />
                    </View>
                  </View>
                </View>

                {/* Contact Information Section */}
                <View style={[styles.editFormSection, styles.editFormSectionOrange]}>
                  <View style={styles.editFormSectionHeader}>
                    <View
                      style={[
                        styles.editFormSectionHeaderBar,
                        { backgroundColor: COLORS.warning[500] },
                      ]}
                    />
                    <Text style={styles.editFormSectionTitle}>
                      Contact Information
                    </Text>
                  </View>

                  <View style={styles.editFormFields}>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Phone</Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.phone}
                        onChangeText={(value) =>
                          handleAddFormChange("phone", value)
                        }
                        placeholder="Enter phone number"
                        keyboardType="phone-pad"
                        editable={!isAddingResident}
                      />
                    </View>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Email</Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.email}
                        onChangeText={(value) =>
                          handleAddFormChange("email", value)
                        }
                        placeholder="Enter email address"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!isAddingResident}
                      />
                    </View>
                  </View>
                </View>

                {/* Owner Information Section */}
                <View style={[styles.editFormSection, styles.editFormSectionPurple]}>
                  <View style={styles.editFormSectionHeader}>
                    <View
                      style={[
                        styles.editFormSectionHeaderBar,
                        { backgroundColor: COLORS.error[400] },
                      ]}
                    />
                    <Text style={styles.editFormSectionTitle}>
                      Owner Information
                    </Text>
                  </View>

                  <View style={styles.editFormFields}>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Owner Name</Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.ownerName}
                        onChangeText={(value) =>
                          handleAddFormChange("ownerName", value)
                        }
                        placeholder="Enter owner name"
                        editable={!isAddingResident}
                      />
                    </View>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Owner Phone</Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.ownerPhone}
                        onChangeText={(value) =>
                          handleAddFormChange("ownerPhone", value)
                        }
                        placeholder="Enter owner phone"
                        keyboardType="phone-pad"
                        editable={!isAddingResident}
                      />
                    </View>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>Owner Email</Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.ownerEmail}
                        onChangeText={(value) =>
                          handleAddFormChange("ownerEmail", value)
                        }
                        placeholder="Enter owner email"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!isAddingResident}
                      />
                    </View>
                    <View style={styles.editFormField}>
                      <Text style={styles.editFormLabel}>
                        Owner Mailing Address
                      </Text>
                      <TextInput
                        style={styles.editFormInputStandalone}
                        value={addFormData.ownerMailingAddress}
                        onChangeText={(value) =>
                          handleAddFormChange("ownerMailingAddress", value)
                        }
                        placeholder="Enter owner mailing address"
                        editable={!isAddingResident}
                      />
                    </View>
                  </View>
                </View>

                {/* Validation Errors */}
                {addValidationErrors.length > 0 && (
                  <View style={styles.editFormValidationErrors}>
                    <Text style={styles.editFormValidationErrorsTitle}>
                      Please fix the following errors:
                    </Text>
                    {addValidationErrors.map((error, index) => (
                      <Text
                        key={index}
                        style={styles.editFormValidationErrorText}
                      >
                        • {error}
                      </Text>
                    ))}
                  </View>
                )}

                {/* Validation Status */}
                {isAddValidating && (
                  <View style={styles.editFormValidating}>
                    <ActivityIndicator
                      size="small"
                      color={COLORS.primary[600]}
                    />
                    <Text style={styles.editFormValidatingText}>
                      Validating location and checking requirements...
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Footer */}
            <View style={styles.editModalFooter}>
              <TouchableOpacity
                style={styles.editModalCancelButton}
                onPress={handleCloseModal}
                disabled={isAddingResident}
                activeOpacity={0.7}
              >
                <Text style={styles.editModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editModalSaveButton,
                  (!isAddFormValid() || isAddingResident) &&
                    styles.editModalSaveButtonDisabled,
                ]}
                onPress={handleAddResident}
                disabled={isAddingResident || !isAddFormValid()}
                activeOpacity={0.7}
              >
                {isAddingResident && (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                    style={{ marginRight: responsiveSpacing(SPACING.xs) }}
                  />
                )}
                <Text style={styles.editModalSaveButtonText}>
                  {isAddingResident
                    ? "Adding..."
                    : isAddValidating
                    ? "Validating..."
                    : "Add Property"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Add Status Dropdown Modal */}
      <Modal
        visible={addStatusDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAddStatusDropdownVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAddStatusDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Status</Text>
              <TouchableOpacity
                onPress={() => setAddStatusDropdownVisible(false)}
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
                  "callback",
                  "appointment",
                  "follow-up",
                  "not-interested",
                ] as Property["status"][]
              ).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.modalOption,
                    addFormData.status === status && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    handleAddFormChange("status", status);
                    setAddStatusDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      ...(addFormData.status === status
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
    </>
  );
});

// Import styles from the main file - we'll need to copy them or create a shared styles file
// For now, I'll include the necessary styles here
const styles = StyleSheet.create({
  propertyModalOverlay: {
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
    marginTop: responsiveSpacing(SPACING.lg),
    marginBottom: responsiveSpacing(SPACING.lg),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
    flexDirection: "column",
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
  editModalTitle: {
    fontSize: responsiveScale(20),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  editModalSubtitle: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  propertyModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs / 2),
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
  editFormSectionTitle: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  editFormFields: {
    gap: responsiveSpacing(SPACING.md),
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
  editFormInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border.light,
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.white,
    paddingLeft: responsiveSpacing(SPACING.md),
    paddingRight: responsiveSpacing(SPACING.xs),
    minHeight: responsiveScale(44),
  },
  editFormInput: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  editFormSearchButton: {
    padding: responsiveSpacing(SPACING.xs),
    justifyContent: "center",
    alignItems: "center",
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
    padding: responsiveSpacing(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  addressSuggestionText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    flex: 1,
  },
  editFormRow: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
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
    gap: responsiveSpacing(SPACING.xs),
    borderWidth: 1,
    borderColor: COLORS.primary[300],
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.white,
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(44),
  },
  editFormLocationButtonText: {
    fontSize: responsiveScale(14),
    color: COLORS.primary[600],
    fontWeight: "500",
  },
  editFormDatePickerButton: {
    padding: responsiveSpacing(SPACING.xs),
    justifyContent: "center",
    alignItems: "center",
  },
  editFormHelperText: {
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
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(8),
    backgroundColor: COLORS.neutral[100],
  },
  editModalCancelButtonText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
    fontWeight: "500",
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
    color: COLORS.white,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(SPACING.md),
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
    padding: responsiveSpacing(SPACING.md),
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
});

export default AddPropertyModal;

