import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Body2, Body3, Button, H3 } from "@/components/ui";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveScale,
  responsiveSpacing,
} from "@/constants";
import {
  fetchAreas,
  fetchMunicipalitiesByArea,
  fetchCommunitiesByMunicipality,
  type Area,
  type Municipality,
  type Community,
} from "@/lib/locationApi";
import {
  createManualZone,
  updateManualZone,
  type ManualZoneRecord,
} from "@/lib/manualZoneApi";

export interface ManualZoneContext {
  zoneId: string;
  zoneName: string;
  zoneDescription: string;
  area?: { id: string; name: string };
  municipality?: { id: string; name: string };
  community?: { id: string; name: string };
}

interface ManualZoneDetailsModalProps {
  visible: boolean;
  initialValue?: ManualZoneContext | null;
  onSave: (zone: ManualZoneContext) => void;
  onClose: () => void;
}

const ManualZoneDetailsModal: React.FC<ManualZoneDetailsModalProps> = ({
  visible,
  initialValue,
  onSave,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [areas, setAreas] = useState<Area[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);

  const [zoneName, setZoneName] = useState(initialValue?.zoneName ?? "");
  const [zoneDescription, setZoneDescription] = useState(
    initialValue?.zoneDescription ?? ""
  );
  
  // Debug log for initial state
  useEffect(() => {
    console.log("📝 [ManualZoneDetailsModal] Initial zoneDescription state:", zoneDescription);
  }, []);
  const [selectedArea, setSelectedArea] = useState<
    ManualZoneContext["area"]
  >(initialValue?.area);
  const [selectedMunicipality, setSelectedMunicipality] = useState<
    ManualZoneContext["municipality"]
  >(initialValue?.municipality);
  const [selectedCommunity, setSelectedCommunity] = useState<
    ManualZoneContext["community"]
  >(initialValue?.community);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [isSavingZone, setIsSavingZone] = useState(false);
  
  // Determine if we're in edit mode (has initialValue with zoneId)
  const isEditMode = Boolean(initialValue?.zoneId);

  useEffect(() => {
    if (visible) {
      console.log("📝 [ManualZoneDetailsModal] Modal opened, initialValue:", initialValue);
      console.log("📝 [ManualZoneDetailsModal] initialValue.zoneId:", initialValue?.zoneId);
      console.log("📝 [ManualZoneDetailsModal] isEditMode:", isEditMode);
      console.log("📝 [ManualZoneDetailsModal] initialValue.zoneName:", initialValue?.zoneName);
      console.log("📝 [ManualZoneDetailsModal] initialValue.zoneDescription:", initialValue?.zoneDescription);
      console.log("📝 [ManualZoneDetailsModal] initialValue.area:", initialValue?.area);
      console.log("📝 [ManualZoneDetailsModal] initialValue.municipality:", initialValue?.municipality);
      console.log("📝 [ManualZoneDetailsModal] initialValue.community:", initialValue?.community);
      
      void loadAreas();
      if (initialValue) {
        setZoneName(initialValue.zoneName);
        setZoneDescription(initialValue.zoneDescription || "");
        setSelectedArea(initialValue.area);
        setSelectedMunicipality(initialValue.municipality);
        setSelectedCommunity(initialValue.community);
      } else {
        setZoneName("");
        setZoneDescription("");
        setSelectedArea(undefined);
        setSelectedMunicipality(undefined);
        setSelectedCommunity(undefined);
        setErrors([]);
      }
    }
  }, [visible, initialValue, loadAreas]);

  const loadAreas = useCallback(async () => {
    try {
      setIsLoadingAreas(true);
      const data = await fetchAreas();
      setAreas(data);
    } catch (error: any) {
      console.error("[ManualZoneDetailsModal] Failed to load areas:", error);
      Alert.alert(
        "Unable to load areas",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingAreas(false);
    }
  }, []);

  const loadMunicipalities = useCallback(async (areaId?: string) => {
    if (!areaId) {
      setMunicipalities([]);
      return;
    }
    try {
      setIsLoadingMunicipalities(true);
      const data = await fetchMunicipalitiesByArea(areaId);
      setMunicipalities(data);
    } catch (error: any) {
      console.error(
        "[ManualZoneDetailsModal] Failed to load municipalities:",
        error
      );
      Alert.alert(
        "Unable to load municipalities",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingMunicipalities(false);
    }
  }, []);

  const loadCommunities = useCallback(async (municipalityId?: string) => {
    if (!municipalityId) {
      setCommunities([]);
      return;
    }
    try {
      setIsLoadingCommunities(true);
      const data = await fetchCommunitiesByMunicipality(municipalityId);
      setCommunities(data);
    } catch (error: any) {
      console.error(
        "[ManualZoneDetailsModal] Failed to load communities:",
        error
      );
      Alert.alert(
        "Unable to load communities",
        error?.response?.data?.message || "Please try again later."
      );
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  useEffect(() => {
    if (selectedArea?.id) {
      void loadMunicipalities(selectedArea.id);
    }
  }, [selectedArea, loadMunicipalities]);

  useEffect(() => {
    if (selectedMunicipality?.id) {
      void loadCommunities(selectedMunicipality.id);
    }
  }, [selectedMunicipality, loadCommunities]);

  const isLocationComplete =
    Boolean(selectedArea && selectedMunicipality && selectedCommunity);

  const validate = () => {
    const validationIssues: string[] = [];
    if (!zoneName.trim()) {
      validationIssues.push("Zone name is required");
    }
    if (!zoneDescription.trim()) {
      validationIssues.push("Zone description is required");
    }
    if (!isLocationComplete) {
      validationIssues.push("Please select area, municipality, and community");
    }
    setErrors(validationIssues);
    return validationIssues.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (
      !selectedArea?.id ||
      !selectedMunicipality?.id ||
      !selectedCommunity?.id
    ) {
      return;
    }

    try {
      setIsSavingZone(true);
      
      console.log("📝 [ManualZoneDetailsModal] handleSave called");
      console.log("📝 [ManualZoneDetailsModal] isEditMode:", isEditMode);
      console.log("📝 [ManualZoneDetailsModal] initialValue?.zoneId:", initialValue?.zoneId);
      
      if (isEditMode && initialValue?.zoneId) {
        console.log("📝 [ManualZoneDetailsModal] Updating zone with ID:", initialValue.zoneId);
        // Update existing zone using mobile-specific endpoint
        const updatePayload = {
          name: zoneName.trim(),
          description: zoneDescription.trim(),
          areaId: selectedArea.id,
          municipalityId: selectedMunicipality.id,
          communityId: selectedCommunity.id,
        };
        
        console.log("📝 [ManualZoneDetailsModal] Update payload:", updatePayload);
        const updatedZone = await updateManualZone(initialValue.zoneId, updatePayload);
        console.log("📝 [ManualZoneDetailsModal] Update response:", updatedZone);

        const resolvedAreaName =
          typeof updatedZone.areaId === "object"
            ? updatedZone.areaId?.name
            : selectedArea.name;
        const resolvedMunicipalityName =
          typeof updatedZone.municipalityId === "object"
            ? updatedZone.municipalityId?.name
            : selectedMunicipality.name;
        const resolvedCommunityName =
          typeof updatedZone.communityId === "object"
            ? updatedZone.communityId?.name
            : selectedCommunity.name;

        onSave({
          zoneId: updatedZone._id,
          zoneName: updatedZone.name || zoneName.trim(),
          zoneDescription: updatedZone.description || zoneDescription.trim(),
          area: {
            id: selectedArea.id,
            name: resolvedAreaName || selectedArea.name,
          },
          municipality: {
            id: selectedMunicipality.id,
            name: resolvedMunicipalityName || selectedMunicipality.name,
          },
          community: {
            id: selectedCommunity.id,
            name: resolvedCommunityName || selectedCommunity.name,
          },
        });
      } else {
        console.log("📝 [ManualZoneDetailsModal] Creating new zone (isEditMode is false or no zoneId)");
        // Create new zone
        const response: ManualZoneRecord = await createManualZone({
          name: zoneName.trim(),
          description: zoneDescription.trim(),
          areaId: selectedArea.id,
          municipalityId: selectedMunicipality.id,
          communityId: selectedCommunity.id,
        });

        const resolvedAreaName =
          typeof response.areaId === "object"
            ? response.areaId?.name
            : selectedArea.name;
        const resolvedMunicipalityName =
          typeof response.municipalityId === "object"
            ? response.municipalityId?.name
            : selectedMunicipality.name;
        const resolvedCommunityName =
          typeof response.communityId === "object"
            ? response.communityId?.name
            : selectedCommunity.name;

        onSave({
          zoneId: response._id,
          zoneName: response.name || zoneName.trim(),
          zoneDescription: response.description || zoneDescription.trim(),
          area: {
            id: selectedArea.id,
            name: resolvedAreaName || selectedArea.name,
          },
          municipality: {
            id: selectedMunicipality.id,
            name: resolvedMunicipalityName || selectedMunicipality.name,
          },
          community: {
            id: selectedCommunity.id,
            name: resolvedCommunityName || selectedCommunity.name,
          },
        });
      }
    } catch (error: any) {
      console.error(
        `[ManualZoneDetailsModal] Failed to ${isEditMode ? "update" : "create"} zone:`,
        error
      );
      Alert.alert(
        `Unable to ${isEditMode ? "update" : "create"} zone`,
        error?.response?.data?.message ||
          error?.message ||
          "Please try again later."
      );
    } finally {
      setIsSavingZone(false);
    }
  };

  const handleSelectArea = (area: Area) => {
    setSelectedArea({ id: area._id, name: area.name });
    setSelectedMunicipality(undefined);
    setSelectedCommunity(undefined);
  };

  const handleSelectMunicipality = (municipality: Municipality) => {
    setSelectedMunicipality({ id: municipality._id, name: municipality.name });
    setSelectedCommunity(undefined);
  };

  const handleSelectCommunity = (community: Community) => {
    setSelectedCommunity({ id: community._id, name: community.name });
    setIsLocationModalVisible(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalHeader}>
          <H3>{isEditMode ? "Edit Manual Zone" : "Create Manual Zone"}</H3>
          <Button 
            variant="ghost" 
            size="small" 
            title="Close" 
            onPress={onClose}
          />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formSection}>
            <Body2 color={COLORS.text.secondary} style={styles.sectionSubtitle}>
              Enter the zone metadata before adding properties.
            </Body2>

            <View style={styles.inputGroup}>
              <Body2 weight="bold" color={COLORS.text.primary}>
                Zone Name
              </Body2>
              <TextInput
                placeholder="Enter zone name"
                value={zoneName}
                onChangeText={setZoneName}
                style={styles.input}
                placeholderTextColor={COLORS.text.light}
              />
            </View>

            <View style={styles.inputGroup}>
              <Body2 weight="bold" color={COLORS.text.primary}>
                Description
              </Body2>
              <TextInput
                placeholder="Optional description"
                value={zoneDescription}
                onChangeText={setZoneDescription}
                style={[styles.input, styles.textArea]}
                placeholderTextColor={COLORS.text.light}
                multiline
                maxLength={500}
              />
              <Body3 color={COLORS.text.light} style={styles.helperText}>
                {(zoneDescription || "").length}/500
              </Body3>
            </View>

            <View style={styles.sectionHeader}>
              <Body2 weight="bold">Location</Body2>
              <Button
                variant="outline"
                size="small"
                title="Choose Location"
                onPress={() => setIsLocationModalVisible(true)}
              />
            </View>
          </View>

          <View style={styles.locationSummaryContainer}>
            <View style={styles.locationSummaryCard}>
              <Body2 weight="bold" color={COLORS.text.primary} numberOfLines={1}>
                Area
              </Body2>
              <Text weight="semiBold" numberOfLines={1} ellipsizeMode="tail">
                {selectedArea?.name || "Not selected"}
              </Text>
            </View>
            <View style={styles.locationSummaryCard}>
              <Body2 weight="bold" color={COLORS.text.primary} numberOfLines={1}>
                Municipality
              </Body2>
              <Text weight="semiBold" numberOfLines={1} ellipsizeMode="tail">
                {selectedMunicipality?.name || "Not selected"}
              </Text>
            </View>
            <View style={styles.locationSummaryCard}>
              <Body2 weight="bold" color={COLORS.text.primary} numberOfLines={1}>
                Community
              </Body2>
              <Text weight="semiBold" numberOfLines={1} ellipsizeMode="tail">
                {selectedCommunity?.name || "Not selected"}
              </Text>
            </View>
          </View>

          {errors.length > 0 && (
            <View style={styles.errorBox}>
              {errors.map((error) => (
                <Body2 key={error} color={COLORS.error[500]}>
                  • {error}
                </Body2>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            title={
              isSavingZone 
                ? (isEditMode ? "Updating..." : "Saving...") 
                : (isEditMode ? "Update Zone" : "Save Zone")
            }
            variant="primary"
            size="large"
            onPress={handleSave}
            loading={isSavingZone}
            disabled={isSavingZone}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent
        animationType="slide"
        visible={isLocationModalVisible}
        onRequestClose={() => setIsLocationModalVisible(false)}
      >
        <View style={styles.locationModalOverlay}>
          <TouchableOpacity
            style={styles.locationModalBackdrop}
            activeOpacity={1}
            onPress={() => setIsLocationModalVisible(false)}
          />
          <View
            style={[
              styles.locationModalContent,
              {
                paddingBottom:
                  insets.bottom || responsiveSpacing(SPACING.md),
              },
            ]}
          >
            <View style={styles.locationModalHeader}>
              <Body2 weight="semiBold">Choose Location</Body2>
              <Button
                variant="ghost"
                size="small"
                title="Close"
                onPress={() => setIsLocationModalVisible(false)}
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
                  <ActivityIndicator
                    size="small"
                    color={COLORS.primary[500]}
                  />
                ) : (
                  <View style={styles.selectorOptions}>
                    {areas.map((area) => {
                      const isSelected = selectedArea?.id === area._id;
                      return (
                        <TouchableOpacity
                          key={area._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() => handleSelectArea(area)}
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
                  <ActivityIndicator
                    size="small"
                    color={COLORS.primary[500]}
                  />
                ) : selectedArea ? (
                  <View style={styles.selectorOptions}>
                    {municipalities.map((municipality) => {
                      const isSelected =
                        selectedMunicipality?.id === municipality._id;
                      return (
                        <TouchableOpacity
                          key={municipality._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() =>
                            handleSelectMunicipality(municipality)
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
                        No municipalities available.
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
                  <ActivityIndicator
                    size="small"
                    color={COLORS.primary[500]}
                  />
                ) : selectedMunicipality ? (
                  <View style={styles.selectorOptions}>
                    {communities.map((community) => {
                      const isSelected =
                        selectedCommunity?.id === community._id;
                      return (
                        <TouchableOpacity
                          key={community._id}
                          style={[
                            styles.selectorOption,
                            isSelected && styles.selectorOptionSelected,
                          ]}
                          onPress={() => handleSelectCommunity(community)}
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
                        No communities available.
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingBottom: responsiveSpacing(SPACING.xl * 2),
    gap: responsiveSpacing(SPACING.lg),
  },
  formSection: {
    gap: responsiveSpacing(SPACING.md),
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
  inputGroup: {
    marginBottom: responsiveSpacing(SPACING.md),
  },
  input: {
    backgroundColor: COLORS.background.light,
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(PADDING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    marginTop: responsiveSpacing(SPACING.xs),
    color: COLORS.text.primary,
  },
  textArea: {
    minHeight: responsiveScale(90),
    textAlignVertical: "top",
  },
  helperText: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  locationSummaryContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.background.primary,
    borderRadius: responsiveScale(16),
    padding: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  locationSummaryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#EEF2FF",
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.sm),
    minHeight: responsiveScale(64),
  },
  errorBox: {
    backgroundColor: COLORS.error[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  ctaButton: {
    marginTop: responsiveSpacing(SPACING.sm),
  },
  footer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingBottom: responsiveSpacing(SPACING.lg),
    paddingTop: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.background.secondary,
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationModalScroll: {
    maxHeight: responsiveScale(420),
  },
  locationModalScrollContent: {
    paddingBottom: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
  },
  selectorGroup: {
    gap: responsiveSpacing(SPACING.sm),
  },
  selectorOptions: {
    gap: responsiveSpacing(SPACING.xs),
  },
  selectorOption: {
    padding: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(10),
    backgroundColor: COLORS.background.light,
  },
  selectorOptionSelected: {
    borderWidth: 1.5,
    borderColor: COLORS.primary[500],
    backgroundColor: COLORS.white,
  },
});

export default ManualZoneDetailsModal;

