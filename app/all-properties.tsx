import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  Pressable,
  Linking,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H3, Body2, AppHeader } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";

interface Property {
  _id: string;
  address: string;
  houseNumber?: number;
  coordinates: [number, number];
  status:
    | "not-visited"
    | "interested"
    | "visited"
    | "callback"
    | "appointment"
    | "follow-up"
    | "not-interested"
    | "not-opened";
  lastVisited?: string;
  notes?: string;
  phone?: string;
  email?: string;
  dataSource?: "AUTO" | "MANUAL";
  zoneId?: {
    _id: string;
    name: string;
    zoneType?: string;
    areaId?: {
      _id: string;
      name: string;
    };
    municipalityId?: {
      _id: string;
      name: string;
    };
    communityId?: {
      _id: string;
      name: string;
    };
  };
  assignedAgentId?: {
    _id: string;
    name: string;
    email: string;
  };
  propertyDataId?: {
    ownerName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    ownerMailingAddress?: string;
  };
}

interface PropertyDetails {
  resident?: Property;
  propertyData?: {
    ownerName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    ownerMailingAddress?: string;
  };
}

// Status colors matching territory-map-view
const getMarkerColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    "not-visited": "#6B7280", // gray
    interested: "#22C55E", // green (success)
    visited: "#3B82F6", // blue (info)
    callback: "#F59E0B", // amber (warning)
    appointment: "#1447E6", // primary blue
    "follow-up": "#EC4899", // pink
    "not-interested": "#EF4444", // red (error)
    "not-opened": "#F97316", // orange
  };
  return statusColors[status] || "#6B7280";
};

// Status display names with emojis (matching territory-map-view)
const getStatusDisplayName = (status: string): string => {
  const statusLabels: Record<string, string> = {
    "not-visited": "⏳ Not Visited",
    interested: "✓ Interested",
    visited: "✓ Visited",
    callback: "📞 Callback",
    appointment: "📅 Appointment",
    "follow-up": "🔄 Follow-up",
    "not-interested": "❌ Not Interested",
    "not-opened": "🚪 Not Opened",
  };
  return statusLabels[status] || "⏳ Not Visited";
};

export default function AllPropertiesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null
  );
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const limit = 50;
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  // Fetch all properties
  const {
    data: propertiesData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["allProperties", page],
    queryFn: async () => {
      console.log("📡 [AllProperties] Fetching properties, page:", page);
      const response = await apiInstance.get("/residents/my-all", {
        params: {
          page,
          limit,
        },
      });
      console.log("✅ [AllProperties] Properties fetched:", {
        success: response.data?.success,
        residentsCount: response.data?.data?.residents?.length || 0,
        total: response.data?.data?.pagination?.total || 0,
      });
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  console.log("🔄 [AllProperties] Query state:", {
    isLoading,
    isFetching,
    hasData: !!propertiesData,
    dataResidentsCount: propertiesData?.data?.residents?.length || 0,
    allPropertiesLength: allProperties.length,
  });

  // Accumulate properties as pages load
  useEffect(() => {
    console.log("🔄 [AllProperties] useEffect triggered:", {
      hasPropertiesData: !!propertiesData,
      hasResidents: !!propertiesData?.data?.residents,
      residentsCount: propertiesData?.data?.residents?.length || 0,
      page,
      currentAllPropertiesLength: allProperties.length,
    });
    
    if (propertiesData?.data?.residents) {
      if (page === 1) {
        // First page - replace all
        console.log("✅ [AllProperties] Setting properties (page 1):", propertiesData.data.residents.length);
        setAllProperties(propertiesData.data.residents);
      } else {
        // Subsequent pages - append
        console.log("✅ [AllProperties] Appending properties (page > 1):", propertiesData.data.residents.length);
        setAllProperties((prev) => [
          ...prev,
          ...propertiesData.data.residents,
        ]);
      }
    } else if (propertiesData && !propertiesData?.data?.residents && page === 1) {
      // Clear properties if no data returned on first page
      console.log("⚠️ [AllProperties] No residents in response, clearing");
      setAllProperties([]);
    }
  }, [propertiesData, page]);

  const properties: Property[] = allProperties;
  const pagination = propertiesData?.data?.pagination || {
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  };

  // Fetch property details for modal
  const { data: detailedProperty, isLoading: isLoadingPropertyDetails } =
    useQuery({
      queryKey: ["propertyDetails", selectedProperty?._id],
      queryFn: async () => {
        if (!selectedProperty?._id) return null;
        const response = await apiInstance.get(
          `/residents/${selectedProperty._id}`
        );
        return response.data.data;
      },
      enabled: !!selectedProperty?._id && isDetailModalOpen,
      refetchOnWindowFocus: false,
    });

  const onRefresh = async () => {
    console.log("🔄 [AllProperties] onRefresh called");
    setRefreshing(true);
    setAllProperties([]); // Clear accumulated properties first
    setPage(1); // Reset to first page
    try {
      await queryClient.invalidateQueries({ queryKey: ["allProperties"] });
      const result = await refetch();
      console.log("✅ [AllProperties] Refresh refetch complete, data:", {
        hasData: !!result.data,
        residentsCount: result.data?.data?.residents?.length || 0,
      });
      
      // Manually populate allProperties if data exists (in case useEffect doesn't trigger)
      if (result.data?.data?.residents && result.data.data.residents.length > 0) {
        console.log("✅ [AllProperties] Manually setting properties after refresh");
        setAllProperties(result.data.data.residents);
      }
    } catch (error) {
      console.error("❌ [AllProperties] Refresh error:", error);
    } finally {
      // Small delay to ensure state updates are processed
      setTimeout(() => {
        setRefreshing(false);
        console.log("✅ [AllProperties] Refreshing state cleared");
      }, 100);
    }
  };

  const handlePropertyClick = (property: Property) => {
    setSelectedProperty(property);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
  };

  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const loadMore = () => {
    if (page < pagination.pages && !isLoading) {
      setPage((prev) => prev + 1);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.primary[500]}
        />
        <AppHeader
          title="All Properties"
          subtext="View all your properties"
          showBackButton={true}
          backgroundColor={COLORS.primary[500]}
          textColor={COLORS.white}
          density="compact"
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load properties</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
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
        title="All Properties"
        subtext={`View all your properties (${pagination.total || 0} total)`}
        showBackButton={true}
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
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
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const paddingToBottom = 20;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - paddingToBottom
          ) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {(() => {
          // Show skeleton if:
          // 1. Currently loading/fetching/refreshing AND no data yet, OR
          // 2. We have data but allProperties hasn't been populated yet (useEffect pending)
          const hasDataButNotPopulated = propertiesData?.data?.residents && propertiesData.data.residents.length > 0 && allProperties.length === 0;
          const showSkeleton = (isLoading || isFetching || refreshing) || hasDataButNotPopulated;
          const showEmpty = properties.length === 0 && !isLoading && !isFetching && !refreshing && !hasDataButNotPopulated;
          
          console.log("🎨 [AllProperties] Render decision:", {
            isLoading,
            isFetching,
            refreshing,
            hasPropertiesData: !!propertiesData,
            dataResidentsCount: propertiesData?.data?.residents?.length || 0,
            allPropertiesLength: allProperties.length,
            propertiesLength: properties.length,
            hasDataButNotPopulated,
            showSkeleton,
            showEmpty,
          });
          
          if (showSkeleton) {
            return (
              <View style={styles.propertiesList}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[styles.propertyCard, styles.propertyCardSkeleton]}
                  >
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, styles.skeletonLineLarge]} />
                    <View style={styles.skeletonLine} />
                  </View>
                ))}
              </View>
            );
          }
          
          if (showEmpty) {
            return (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🏠</Text>
                <H3 style={styles.emptyTitle}>No properties found</H3>
                <Body2 color={COLORS.text.secondary} style={styles.emptyText}>
                  You haven't created any properties yet
                </Body2>
              </View>
            );
          }
          
          return null;
        })()}
        
        {properties.length > 0 && (
          <View style={styles.propertiesList}>
            {properties.map((property) => (
              <TouchableOpacity
                key={property._id}
                style={styles.propertyCard}
                onPress={() => handlePropertyClick(property)}
                activeOpacity={0.7}
              >
                <View style={styles.propertyCardContent}>
                  {/* Header: Address with Status Badge */}
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
                      </View>
                    </View>
                  </View>

                  {/* Zone Name and Location */}
                  {property.zoneId && (
                    <View style={styles.zoneInfo}>
                      <Ionicons
                        name="location-outline"
                        size={responsiveScale(16)}
                        color={COLORS.text.secondary}
                      />
                      <Text style={styles.zoneInfoText}>
                        {property.zoneId.name}
                        {property.zoneId.communityId &&
                          ` - ${property.zoneId.communityId.name}`}
                        {property.zoneId.areaId &&
                          !property.zoneId.communityId &&
                          ` - ${property.zoneId.areaId.name}`}
                      </Text>
                    </View>
                  )}

                  {/* Notes */}
                  <Text style={styles.propertyNotes}>
                    {property.notes || "No note"}
                  </Text>

                  {/* Footer: House Number and Data Source Badge */}
                  <View style={styles.propertyCardFooter}>
                    {property.houseNumber && (
                      <View style={styles.houseNumberBadge}>
                        <Text style={styles.houseNumberBadgeText}>
                          #{property.houseNumber}
                        </Text>
                      </View>
                    )}
                    {property.dataSource && (
                      <View
                        style={[
                          styles.dataSourceBadge,
                          styles.dataSourceBadgeBottom,
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
                </View>
              </TouchableOpacity>
            ))}
            {isLoading && properties.length > 0 && (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color={COLORS.primary[500]} />
                <Text style={styles.loadMoreText}>Loading more...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Property Details Modal */}
      <Modal
        visible={isDetailModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseDetailModal}
      >
        <Pressable
          style={styles.propertyModalOverlay}
          onPress={handleCloseDetailModal}
        >
          <View style={styles.propertyModalContent} onStartShouldSetResponder={() => true}>
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
                                    selectedProperty?.status ||
                                    "not-visited"
                                ) + "20",
                            },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={responsiveScale(24)}
                            color={getMarkerColor(
                              detailedProperty.resident?.status ||
                                selectedProperty?.status ||
                                "not-visited"
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
                                        selectedProperty?.status ||
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
                                        selectedProperty?.status ||
                                        "not-visited"
                                    ),
                                  },
                                ]}
                              >
                                {getStatusDisplayName(
                                  (detailedProperty.resident?.status ||
                                    selectedProperty?.status ||
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: responsiveSpacing(PADDING.md),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xxl),
  },
  loadingText: {
    marginTop: responsiveSpacing(SPACING.md),
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.lg),
  },
  errorText: {
    fontSize: responsiveScale(16),
    color: COLORS.error[500],
    marginBottom: responsiveSpacing(SPACING.md),
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: responsiveScale(14),
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.xxl),
  },
  emptyIcon: {
    fontSize: responsiveScale(64),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  emptyTitle: {
    marginBottom: responsiveSpacing(SPACING.sm),
    color: COLORS.text.primary,
  },
  emptyText: {
    textAlign: "center",
  },
  propertiesList: {
    gap: responsiveSpacing(SPACING.md),
  },
  propertyCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(PADDING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  propertyCardSkeleton: {
    backgroundColor: COLORS.neutral[100],
    minHeight: responsiveScale(120),
  },
  skeletonLine: {
    height: responsiveScale(12),
    backgroundColor: COLORS.neutral[200],
    borderRadius: responsiveScale(4),
    marginBottom: responsiveSpacing(SPACING.xs),
    width: "100%",
  },
  skeletonLineLarge: {
    height: responsiveScale(16),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  propertyCardContent: {
    gap: responsiveSpacing(SPACING.sm),
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
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  propertyCardAddress: {
    fontSize: responsiveScale(16),
    fontWeight: "600",
    color: COLORS.text.primary,
    flex: 1,
  },
  dataSourceBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xxs),
    borderRadius: responsiveScale(4),
  },
  dataSourceBadgeManual: {
    backgroundColor: COLORS.primary[100],
  },
  dataSourceBadgeAuto: {
    backgroundColor: COLORS.neutral[100],
  },
  dataSourceBadgeText: {
    fontSize: responsiveScale(10),
    fontWeight: "600",
  },
  dataSourceBadgeTextManual: {
    color: COLORS.primary[700],
  },
  dataSourceBadgeTextAuto: {
    color: COLORS.neutral[700],
  },
  propertyCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  statusBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xxs),
    borderRadius: responsiveScale(6),
  },
  statusBadgeText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  zoneInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    marginTop: responsiveSpacing(SPACING.xs),
  },
  zoneInfoText: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
  },
  propertyNotes: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
    fontStyle: "italic",
    marginTop: responsiveSpacing(SPACING.xs),
  },
  propertyCardFooter: {
    marginTop: responsiveSpacing(SPACING.sm),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  dataSourceBadgeBottom: {
    alignSelf: "flex-start",
  },
  houseNumberBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.neutral[100],
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xxs),
    borderRadius: responsiveScale(6),
  },
  houseNumberBadgeText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
    color: COLORS.neutral[700],
  },
  loadMoreContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.sm),
  },
  loadMoreText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  // Property Details Modal Styles
  propertyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.md),
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
    padding: responsiveSpacing(PADDING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  propertyModalTitle: {
    fontSize: responsiveScale(20),
    fontWeight: "700",
    color: COLORS.text.primary,
  },
  propertyModalCloseButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  propertyModalLoading: {
    padding: responsiveSpacing(SPACING.xxl),
    alignItems: "center",
    justifyContent: "center",
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
    padding: responsiveSpacing(PADDING.md),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  propertyDetailHeader: {
    marginBottom: responsiveSpacing(SPACING.md),
  },
  propertyDetailHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.md),
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
    fontWeight: "700",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  propertyDetailStatusBadge: {
    alignSelf: "flex-start",
  },
  propertyDetailStatusBadgeInner: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xxs),
    borderRadius: responsiveScale(6),
  },
  propertyDetailStatusText: {
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  propertyDetailContentCard: {
    backgroundColor: COLORS.neutral[50],
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(PADDING.md),
  },
  propertyDetailSectionTitle: {
    fontSize: responsiveScale(16),
    fontWeight: "700",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  propertyDetailContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  propertyDetailContactText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    flex: 1,
  },
  propertyModalError: {
    padding: responsiveSpacing(SPACING.xxl),
    alignItems: "center",
    justifyContent: "center",
  },
  propertyModalErrorText: {
    fontSize: responsiveScale(16),
    color: COLORS.error[500],
    marginBottom: responsiveSpacing(SPACING.md),
    textAlign: "center",
  },
  propertyModalErrorButton: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingVertical: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(8),
  },
  propertyModalErrorButtonText: {
    color: COLORS.white,
    fontSize: responsiveScale(14),
    fontWeight: "600",
  },
});

