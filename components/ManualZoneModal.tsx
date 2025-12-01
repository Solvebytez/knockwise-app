import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Text, Body2, Body3, Button, H3 } from "@/components/ui";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveScale,
  responsiveSpacing,
} from "@/constants";
import { getGoogleMapsApiKey } from "@/lib/googleMaps";
import { apiInstance } from "@/lib/apiInstance";
import type { ManualZoneContext } from "@/components/ManualZoneDetailsModal";

export type ManualEntryMode = "sequential" | "even" | "odd";

export interface LastPropertyInfo {
  address: string;
  houseNumber: number;
}

interface ManualZoneModalProps {
  visible: boolean;
  mode: ManualEntryMode;
  zone: ManualZoneContext | null;
  lastProperty?: LastPropertyInfo;
  onClose: () => void;
  onPropertySaved?: () => void;
}

interface PropertyFormState {
  address: string;
  houseNumber: string;
  latitude: string;
  longitude: string;
  notes: string;
}

const DEFAULT_PROPERTY_FORM: PropertyFormState = {
  address: "",
  houseNumber: "",
  latitude: "",
  longitude: "",
  notes: "",
};

const ManualZoneModal: React.FC<ManualZoneModalProps> = ({
  visible,
  mode,
  zone,
  lastProperty,
  onClose,
  onPropertySaved,
}) => {
  const [propertyForm, setPropertyForm] =
    useState<PropertyFormState>(DEFAULT_PROPERTY_FORM);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [baseStreetName, setBaseStreetName] = useState("");
  const [lastHouseNumber, setLastHouseNumber] = useState<number | null>(null);
  const [initialStreetCaptured, setInitialStreetCaptured] = useState(false);

  useEffect(() => {
    if (visible) {
      resetFormState();
      // Auto-fill from last property if available
      if (lastProperty) {
        const { number, street } = parseStreetData(lastProperty.address);
        const lastNumber = lastProperty.houseNumber;
        
        // Calculate next house number based on mode
        let nextNumber: number;
        if (mode === "even") {
          // Next even number
          nextNumber = lastNumber % 2 === 0 ? lastNumber + 2 : lastNumber + 1;
        } else if (mode === "odd") {
          // Next odd number
          nextNumber = lastNumber % 2 !== 0 ? lastNumber + 2 : lastNumber + 1;
        } else {
          // Sequential: just add 1
          nextNumber = lastNumber + 1;
        }
        
        // Set the form with next address
        setPropertyForm({
          address: street ? `${nextNumber} ${street}` : lastProperty.address.replace(number?.toString() || "", nextNumber.toString()),
          houseNumber: nextNumber.toString(),
          latitude: "",
          longitude: "",
          notes: "",
        });
        
        setBaseStreetName(street || "");
        setLastHouseNumber(lastNumber);
      }
    }
  }, [visible, mode, lastProperty]);

  const resetFormState = () => {
    setPropertyForm(DEFAULT_PROPERTY_FORM);
    setIsValidatingAddress(false);
    setIsSavingProperty(false);
    setBaseStreetName("");
    setLastHouseNumber(null);
    setInitialStreetCaptured(false);
  };

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "even":
        return "Even Numbers";
      case "odd":
        return "Odd Numbers";
      default:
        return "Sequential Numbers";
    }
  }, [mode]);

  const handlePropertyFormChange = (
    field: keyof PropertyFormState,
    value: string
  ) => {
    setPropertyForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

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

  const geocodeAddressWithPlaces = async (address: string) => {
    let apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      console.warn(
        "[ManualZoneModal] Google Maps API key missing, using fallback key"
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
    const addressComponents = result.address_components || [];

    const getComponent = (type: string) => {
      const component = addressComponents.find((comp: any) =>
        comp.types.includes(type)
      );
      return component?.long_name || "";
    };

    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address,
      streetNumber: getComponent("street_number"),
      street: getComponent("route"),
    };
  };

  const handleValidateAddress = async () => {
    if (!propertyForm.address.trim()) {
      Alert.alert("Address required", "Please enter an address to validate.");
      return;
    }

    try {
      setIsValidatingAddress(true);
      const geocodeData = await geocodeAddressWithPlaces(propertyForm.address);

      const parsedStreet =
        geocodeData.street || parseStreetData(propertyForm.address).street;
      const detectedHouseNumber =
        geocodeData.streetNumber ||
        parseStreetData(propertyForm.address).number ||
        lastHouseNumber;

      setPropertyForm((prev) => ({
        ...prev,
        latitude: geocodeData.latitude.toString(),
        longitude: geocodeData.longitude.toString(),
        address: geocodeData.formattedAddress || prev.address,
        houseNumber: detectedHouseNumber
          ? detectedHouseNumber.toString()
          : prev.houseNumber,
      }));

      if (parsedStreet) {
        setBaseStreetName(parsedStreet);
        setInitialStreetCaptured(true);
      }

      if (detectedHouseNumber) {
        setLastHouseNumber(detectedHouseNumber);
      }

      Alert.alert("Validated", "Address verified successfully.");
    } catch (error: any) {
      console.error("[ManualZoneModal] Address validation failed:", error);
      Alert.alert("Validation failed", error?.message || "Please try again.");
    } finally {
      setIsValidatingAddress(false);
    }
  };

  const handleUseLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Location permission is required to use this feature."
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setPropertyForm((prev) => ({
        ...prev,
        latitude: location.coords.latitude.toString(),
        longitude: location.coords.longitude.toString(),
      }));

      Alert.alert(
        "Location captured",
        `Lat: ${location.coords.latitude.toFixed(
          6
        )}, Lng: ${location.coords.longitude.toFixed(6)}`
      );
    } catch (error) {
      console.error("[ManualZoneModal] Failed to use location:", error);
      Alert.alert(
        "Error",
        "Failed to get your location. Please try again or enter manually."
      );
    }
  };

  const computeNextHouseNumber = (current: number): number => {
    if (mode === "sequential") {
      return current + 1;
    }
    return current + 2;
  };

  const prepareNextAddress = (currentNumber: number) => {
    if (!baseStreetName || !initialStreetCaptured) {
      return;
    }
    const nextNumber = computeNextHouseNumber(currentNumber);
    setLastHouseNumber(nextNumber);
    setPropertyForm({
      ...DEFAULT_PROPERTY_FORM,
      address: `${nextNumber} ${baseStreetName}`,
      houseNumber: nextNumber.toString(),
    });
  };

  const handleSaveProperty = async () => {
    if (!zone?.zoneId) {
      Alert.alert(
        "Zone missing",
        "Please configure the zone details before saving properties."
      );
      return;
    }

    if (
      !propertyForm.address.trim() ||
      !propertyForm.houseNumber.trim() ||
      !propertyForm.latitude.trim() ||
      !propertyForm.longitude.trim()
    ) {
      Alert.alert(
        "Missing information",
        "Please validate the address and ensure all fields are filled."
      );
      return;
    }

    try {
      setIsSavingProperty(true);
      const payload = {
        zoneId: zone.zoneId,
        address: propertyForm.address.trim(),
        houseNumber: parseInt(propertyForm.houseNumber, 10),
        coordinates: [
          parseFloat(propertyForm.longitude),
          parseFloat(propertyForm.latitude),
        ],
        status: "not-visited",
        dataSource: "MANUAL",
        notes: propertyForm.notes?.trim() || undefined,
      };

      console.log("📝 [ManualZoneModal] Saving property with payload:", {
        zoneId: payload.zoneId,
        address: payload.address,
        houseNumber: payload.houseNumber,
      });

      const response = await apiInstance.post("/residents", payload);
      
      console.log("✅ [ManualZoneModal] Property saved successfully:", {
        residentId: response.data?.data?._id,
        zoneId: payload.zoneId,
      });

      Alert.alert("Saved", "Property saved successfully.");

      if (payload.houseNumber && !lastHouseNumber) {
        setLastHouseNumber(payload.houseNumber);
      }

      // Notify parent to refresh property list
      if (onPropertySaved) {
        onPropertySaved();
      }

      prepareNextAddress(payload.houseNumber);
    } catch (error: any) {
      console.error("[ManualZoneModal] Failed to save property:", error);
      Alert.alert(
        "Save failed",
        error?.response?.data?.message ||
          "Unable to save property. Please try again."
      );
    } finally {
      setIsSavingProperty(false);
    }
  };

  const closeModal = () => {
    if (isSavingProperty) return;
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeModal}>
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalHeader}>
          <H3>Manual Zone Entry</H3>
          <Body2 color={COLORS.text.secondary}>{modeLabel}</Body2>
          <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
            <Text color={COLORS.white}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <H3 style={styles.sectionTitle}>Zone summary</H3>
            {zone ? (
              <>
                <Body2 weight="bold">{zone.zoneName}</Body2>
                <Body3 color={COLORS.text.secondary}>
                  ID: {zone.zoneId}
                </Body3>
                <Body3 color={COLORS.text.secondary}>
                  {zone.zoneDescription || "No description"}
                </Body3>
                <Body3 color={COLORS.text.secondary} style={styles.locationLine}>
                  {zone.area?.name || "Area"} ·{" "}
                  {zone.municipality?.name || "Municipality"} ·{" "}
                  {zone.community?.name || "Community"}
                </Body3>
              </>
            ) : (
              <Body2 color={COLORS.error[500]}>
                Please configure zone details before adding properties.
              </Body2>
            )}
          </View>

          <View style={styles.section}>
            <H3 style={styles.sectionTitle}>Property Entry</H3>
            <Body2
              color={COLORS.text.secondary}
              style={styles.sectionSubtitle}
            >
              Start with the first address. After saving, the next address will
              auto-fill.
            </Body2>

            <TextInput
              placeholder="Address"
              value={propertyForm.address}
              onChangeText={(value) => handlePropertyFormChange("address", value)}
              style={styles.input}
              placeholderTextColor={COLORS.text.light}
            />

            <View style={styles.inlineRow}>
              <Button
                title="Validate"
                variant="outline"
                size="small"
                onPress={handleValidateAddress}
                loading={isValidatingAddress}
                containerStyle={styles.inlineButton}
                disabled={!zone}
              />
              <Button
                title="Use My Location"
                variant="ghost"
                size="small"
                onPress={handleUseLocation}
                containerStyle={styles.inlineButton}
                disabled={!zone}
              />
            </View>

            <TextInput
              placeholder="House Number"
              value={propertyForm.houseNumber}
              onChangeText={(value) =>
                handlePropertyFormChange(
                  "houseNumber",
                  value.replace(/\D/g, "")
                )
              }
              style={styles.input}
              keyboardType="number-pad"
              placeholderTextColor={COLORS.text.light}
            />

            <TextInput
              placeholder="Latitude"
              value={propertyForm.latitude}
              onChangeText={(value) =>
                handlePropertyFormChange("latitude", value)
              }
              style={styles.input}
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.text.light}
            />

            <TextInput
              placeholder="Longitude"
              value={propertyForm.longitude}
              onChangeText={(value) =>
                handlePropertyFormChange("longitude", value)
              }
              style={styles.input}
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.text.light}
            />

            <TextInput
              placeholder="Notes (optional)"
              value={propertyForm.notes}
              onChangeText={(value) => handlePropertyFormChange("notes", value)}
              style={[styles.input, styles.textArea]}
              placeholderTextColor={COLORS.text.light}
              multiline
            />

            <Button
              title="Save Property"
              variant="primary"
              size="large"
              onPress={handleSaveProperty}
              loading={isSavingProperty}
              containerStyle={styles.ctaButton}
              disabled={!zone}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
    paddingTop: responsiveSpacing(SPACING.lg),
  },
  modalHeader: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  closeButton: {
    position: "absolute",
    right: responsiveSpacing(PADDING.screenLarge),
    top: 0,
    backgroundColor: COLORS.primary[500],
    width: responsiveScale(32),
    height: responsiveScale(32),
    borderRadius: responsiveScale(16),
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingBottom: responsiveSpacing(SPACING.xl),
    gap: responsiveSpacing(SPACING.lg),
  },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    padding: responsiveSpacing(SPACING.lg),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  sectionSubtitle: {
    marginBottom: responsiveSpacing(SPACING.md),
  },
  input: {
    backgroundColor: COLORS.background.light,
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(PADDING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
    color: COLORS.text.primary,
  },
  textArea: {
    minHeight: responsiveScale(80),
    textAlignVertical: "top",
  },
  inlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  inlineButton: {
    flex: 1,
  },
  ctaButton: {
    marginTop: responsiveSpacing(SPACING.sm),
  },
  locationLine: {
    marginTop: responsiveSpacing(SPACING.xs),
  },
});

export default ManualZoneModal;

