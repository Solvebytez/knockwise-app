import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMyNotVisitedResidents, Resident } from "@/lib/residentsApi";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H3, Body2 } from "@/components/ui";
import { AppHeader } from "@/components/ui";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Ionicons } from "@expo/vector-icons";

// Status colors and display names
const statusColors: Record<string, string> = {
  "not-visited": "#EF4444",
  interested: "#F59E0B",
  visited: "#10B981",
  callback: "#8B5CF6",
  appointment: "#3B82F6",
  "follow-up": "#EC4899",
  "not-interested": "#6B7280",
};

const getStatusDisplayName = (status: string): string => {
  const statusNames: Record<string, string> = {
    "not-visited": "Not Visited",
    interested: "Interested",
    visited: "Visited",
    callback: "Callback",
    appointment: "Appointment",
    "follow-up": "Follow-up",
    "not-interested": "Not Interested",
  };
  return statusNames[status] || status;
};

export default function MyLeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Resident | null>(null);

  // Fetch all leads (not just 3)
  const {
    data: leads,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["myLeadsAll"],
    queryFn: () => getMyNotVisitedResidents(100), // Get up to 100 leads
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Fetch full property details for the selected lead
  const { data: detailedProperty, isLoading: isLoadingPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", selectedLead?._id],
      queryFn: async () => {
        if (!selectedLead?._id) return null;
        const response = await apiInstance.get(`/residents/${selectedLead._id}`);
        return response.data.data;
      },
      enabled: !!selectedLead?._id && isDetailModalOpen,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleLeadPress = useCallback((resident: Resident) => {
    setSelectedLead(resident);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
  }, []);

  const handleNextLead = useCallback(() => {
    if (!selectedLead || !leads || leads.length <= 1) return;

    const currentIndex = leads.findIndex((l) => l._id === selectedLead._id);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + 1) % leads.length;
    const nextLead = leads[nextIndex];
    setSelectedLead(nextLead);
  }, [selectedLead, leads]);

  const handlePhonePress = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary[500]} />
      <AppHeader
        title="My Leads"
        subtext={leads ? `${leads.length} leads` : "Loading leads..."}
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
        showBackButton={true}
        onBackPress={handleBack}
        density="compact"
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary[500]]}
            tintColor={COLORS.primary[500]}
          />
        }
      >
        {isError ? (
          <View style={styles.errorContainer}>
            <Body2 color={COLORS.error[500]}>
              Failed to load leads. Pull down to refresh.
            </Body2>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <Body2 color={COLORS.text.secondary}>Loading leads...</Body2>
          </View>
        ) : leads && leads.length > 0 ? (
          <View style={styles.leadsContainer}>
            {leads.map((resident) => {
              const zoneName =
                typeof resident.zoneId === "object"
                  ? resident.zoneId?.name || "Unknown Zone"
                  : "Unknown Zone";
              const statusColor =
                statusColors[resident.status] || statusColors["visited"];
              const statusDisplayName = getStatusDisplayName(resident.status);

              return (
                <TouchableOpacity
                  key={resident._id}
                  style={styles.leadCard}
                  onPress={() => handleLeadPress(resident)}
                  activeOpacity={0.7}
                >
                  <View style={styles.leadContent}>
                    <View style={styles.leadHeader}>
                      <View style={styles.leadInfo}>
                        <Text
                          variant="body1"
                          weight="semiBold"
                          color={COLORS.text.primary}
                          style={{
                            marginBottom: responsiveSpacing(SPACING.xs / 2),
                          }}
                        >
                          {resident.ownerName ||
                            resident.address ||
                            "Unknown Property"}
                        </Text>
                        <Body2 color={COLORS.text.secondary} numberOfLines={1}>
                          {resident.address}
                        </Body2>
                        <Body2
                          color={COLORS.text.secondary}
                          style={{
                            fontSize: responsiveScale(11),
                            marginTop: responsiveSpacing(SPACING.xs / 2),
                          }}
                        >
                          {zoneName}
                        </Body2>
                      </View>
                      <View
                        style={[
                          styles.leadStatusBadge,
                          { backgroundColor: `${statusColor}15` },
                        ]}
                      >
                        <Body2
                          color={statusColor}
                          weight="medium"
                          style={{ fontSize: responsiveScale(11) }}
                        >
                          {statusDisplayName}
                        </Body2>
                      </View>
                    </View>
                    {resident.phone && (
                      <View style={styles.leadMeta}>
                        <MaterialIcons
                          name="phone"
                          size={responsiveScale(14)}
                          color={COLORS.text.secondary}
                        />
                        <Body2
                          color={COLORS.text.secondary}
                          style={{
                            marginLeft: responsiveSpacing(SPACING.xs / 2),
                          }}
                        >
                          {resident.phone}
                        </Body2>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <Body2 color={COLORS.text.secondary}>No leads available</Body2>
          </View>
        )}
      </ScrollView>

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
                {detailedProperty && selectedLead ? (
                  <>
                    {/* Top Section - Header */}
                    <View style={styles.propertyDetailHeader}>
                      <View style={styles.propertyDetailHeaderRow}>
                        <View
                          style={[
                            styles.propertyDetailIcon,
                            {
                              backgroundColor:
                                statusColors[selectedLead.status] + "20",
                            },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={responsiveScale(24)}
                            color={statusColors[selectedLead.status]}
                          />
                        </View>
                        <View style={styles.propertyDetailHeaderContent}>
                          <Text style={styles.propertyDetailAddress}>
                            {selectedLead.address}
                          </Text>
                          <View style={styles.propertyDetailStatusBadge}>
                            <View
                              style={[
                                styles.propertyDetailStatusBadgeInner,
                                {
                                  backgroundColor:
                                    statusColors[selectedLead.status] + "20",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.propertyDetailStatusText,
                                  {
                                    color: statusColors[selectedLead.status],
                                  },
                                ]}
                              >
                                {getStatusDisplayName(selectedLead.status)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Main Content Card */}
                    <View style={styles.propertyDetailContentCard}>
                      {/* Property Information */}
                      {(selectedLead.houseNumber ||
                        selectedLead.coordinates ||
                        detailedProperty.resident?.lastVisited ||
                        detailedProperty.resident?.notes) && (
                        <>
                          <Text style={styles.propertyDetailSectionTitle}>
                            Property Information
                          </Text>

                          {/* House Number */}
                          {selectedLead.houseNumber && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="home-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                House #{selectedLead.houseNumber}
                              </Text>
                            </View>
                          )}

                          {/* Coordinates */}
                          {selectedLead.coordinates && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="location-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {selectedLead.coordinates[1].toFixed(6)},{" "}
                                {selectedLead.coordinates[0].toFixed(6)}
                              </Text>
                            </View>
                          )}

                          {/* Last Visited */}
                          {detailedProperty.resident?.lastVisited && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="calendar-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                Last Visited:{" "}
                                {new Date(
                                  detailedProperty.resident.lastVisited
                                ).toLocaleDateString()}
                              </Text>
                            </View>
                          )}

                          {/* Notes */}
                          {detailedProperty.resident?.notes && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="document-text-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {detailedProperty.resident.notes}
                              </Text>
                            </View>
                          )}
                        </>
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
                                  selectedLead.houseNumber ||
                                  selectedLead.coordinates ||
                                  detailedProperty.resident?.lastVisited ||
                                  detailedProperty.resident?.notes
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
                                  selectedLead.houseNumber ||
                                  selectedLead.coordinates ||
                                  detailedProperty.resident?.lastVisited ||
                                  detailedProperty.resident?.notes ||
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
                                Owner: {detailedProperty.propertyData.ownerPhone}
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
                          {detailedProperty.propertyData?.ownerMailingAddress && (
                            <View style={styles.propertyDetailContactRow}>
                              <Ionicons
                                name="location-outline"
                                size={responsiveScale(20)}
                                color={COLORS.text.secondary}
                              />
                              <Text style={styles.propertyDetailContactText}>
                                {
                                  detailedProperty.propertyData.ownerMailingAddress
                                }
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>

                    {/* Next Lead Button */}
                    {selectedLead && leads && leads.length > 1 && (
                      <View style={styles.propertyDetailNextButtonContainer}>
                        <TouchableOpacity
                          style={styles.propertyDetailNextButton}
                          onPress={handleNextLead}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.propertyDetailNextButtonText}>
                            Next Lead
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
    padding: responsiveSpacing(PADDING.screenLarge),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xl),
  },
  errorContainer: {
    padding: responsiveSpacing(SPACING.md),
    alignItems: "center",
  },
  leadsContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  leadCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  leadContent: {
    gap: responsiveSpacing(SPACING.sm),
  },
  leadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.sm),
  },
  leadInfo: {
    flex: 1,
  },
  leadStatusBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(12),
  },
  leadMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  emptyStateContainer: {
    padding: responsiveSpacing(SPACING.xl),
    alignItems: "center",
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

