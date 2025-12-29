import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StatusBar,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H2, H3, Body1, Body2 } from "@/components/ui";
import { Button } from "@/components/ui";
import { AppHeader } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";

interface ManualZone {
  _id: string;
  name: string;
  description: string;
  status: string;
  createdBy: string;
  assignmentType: string;
  isScheduled: boolean;
  isPrimary: boolean;
  teamName?: string;
  teamId?: string;
  scheduledDate?: string;
  zoneType?: "MANUAL" | "MAP";
  statistics: {
    totalHouses: number;
    visitedCount: number;
    notVisitedCount: number;
    interestedCount: number;
    notInterestedCount: number;
    completionPercentage: number;
  };
  areaId?: {
    _id: string;
    name: string;
    type: string;
  };
  municipalityId?: {
    _id: string;
    name: string;
    type: string;
  };
  communityId?: {
    _id: string;
    name: string;
    type: string;
  };
  createdAt: string;
  updatedAt: string;
}

function ManualZoneScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch agent's territories
  const {
    data: territoriesData,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["myTerritories"],
    queryFn: async () => {
      console.log("📱 [ManualZoneTab] Fetching territories...");
      const response = await apiInstance.get("/users/my-territories");
      console.log(
        "📱 [ManualZoneTab] Raw API response:",
        JSON.stringify(response.data, null, 2)
      );
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  const handleRefresh = async () => {
    console.log("📱 [ManualZoneTab] Refreshing...");
    await refetch();
  };

  // Filter to only manual zones and sort by latest first
  const allTerritories = Array.isArray(territoriesData?.data?.territories)
    ? territoriesData.data.territories
    : [];

  console.log(
    "📱 [ManualZoneTab] Total territories received:",
    allTerritories.length
  );
  console.log(
    "📱 [ManualZoneTab] Territories with zoneType:",
    allTerritories.map((z: any) => ({
      name: z.name,
      zoneType: z.zoneType,
      _id: z._id,
    }))
  );

  const manualZones: ManualZone[] = allTerritories
    .filter((zone: any) => {
      const isManual = zone.zoneType === "MANUAL";
      if (!isManual) {
        console.log(
          `📱 [ManualZoneTab] Filtered out zone "${zone.name}" - zoneType: ${zone.zoneType}`
        );
      }
      return isManual;
    })
    .sort((a: ManualZone, b: ManualZone) => {
      const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : null;
      const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : null;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : null;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : null;

      const timeA = updatedA || createdA;
      const timeB = updatedB || createdB;

      if (!timeA && !timeB) {
        if (createdA && createdB) {
          return createdB - createdA;
        }
        return 0;
      }
      if (!timeA) return 1;
      if (!timeB) return -1;
      if (isNaN(timeA) || isNaN(timeB)) return 0;

      const dateDiff = timeB - timeA;
      if (dateDiff !== 0) return dateDiff;

      if (createdA && createdB) {
        return createdB - createdA;
      }

      return 0;
    });

  console.log(
    "📱 [ManualZoneTab] Filtered manual zones count:",
    manualZones.length
  );
  console.log(
    "📱 [ManualZoneTab] Manual zones:",
    manualZones.map((z) => ({
      name: z.name,
      zoneType: z.zoneType,
      _id: z._id,
    }))
  );

  const summary = {
    totalZones: manualZones.length,
    activeZones: manualZones.filter((z) => z.status === "ACTIVE").length,
    scheduledZones: manualZones.filter((z) => z.isScheduled).length,
    totalHouses: manualZones.reduce(
      (sum, z) => sum + (z.statistics?.totalHouses || 0),
      0
    ),
    visitedHouses: manualZones.reduce(
      (sum, z) => sum + (z.statistics?.visitedCount || 0),
      0
    ),
    notVisitedHouses: manualZones.reduce(
      (sum, z) => sum + (z.statistics?.notVisitedCount || 0),
      0
    ),
    completionPercentage:
      manualZones.length > 0
        ? Math.round(
            manualZones.reduce(
              (sum, z) => sum + (z.statistics?.completionPercentage || 0),
              0
            ) / manualZones.length
          )
        : 0,
  };

  // Helper function to check if current agent is the creator
  const isZoneCreatedByAgent = (zone: ManualZone): boolean => {
    if (!user) return false;
    const userId = user.id || (user as any)._id;
    return zone.createdBy === userId;
  };

  // Filter zones (already sorted by latest first)
  const filteredZones = manualZones.filter(
    (zone) =>
      zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      zone.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Loading manual zones...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load manual zones</Text>
          <Button
            variant="outline"
            size="medium"
            title="Try Again"
            onPress={() =>
              queryClient.invalidateQueries({ queryKey: ["myTerritories"] })
            }
          />
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
        title="Manual Zone"
        subtext={`Manage your manual zones (${manualZones.length} total)`}
        showBackButton={false}
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
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary[500]}
            colors={[COLORS.primary[500]]}
          />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.statCard1]}>
            <View style={styles.statCardHeader}>
              <Text style={styles.statLabel}>Manual Zones</Text>
              <Text style={styles.statIcon}>📝</Text>
            </View>
            <Text style={styles.statValue}>{summary.totalZones}</Text>
            <Body2 color={COLORS.text.secondary} style={styles.statSubtext}>
              {summary.activeZones} active
              {summary.scheduledZones > 0 &&
                `, ${summary.scheduledZones} scheduled`}
            </Body2>
          </View>

          <View style={[styles.statCard, styles.statCard2]}>
            <View style={styles.statCardHeader}>
              <Text style={styles.statLabel}>Total Houses</Text>
              <Text style={styles.statIcon}>🏠</Text>
            </View>
            <Text style={styles.statValue}>{summary.totalHouses}</Text>
            <Body2 color={COLORS.text.secondary} style={styles.statSubtext}>
              Across all zones
            </Body2>
          </View>

          <View style={[styles.statCard, styles.statCard3]}>
            <View style={styles.statCardHeader}>
              <Text style={styles.statLabel}>Progress</Text>
              <Text style={styles.statIcon}>🎯</Text>
            </View>
            <Text style={styles.statValue}>
              {summary.completionPercentage}%
            </Text>
            <Body2 color={COLORS.text.secondary} style={styles.statSubtext}>
              {summary.visitedHouses} visited, {summary.notVisitedHouses}{" "}
              remaining
            </Body2>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search manual zones..."
              placeholderTextColor={COLORS.text.light}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>
        </View>

        {/* Create Manual Zone Button */}
        <View style={styles.createZoneContainer}>
          <Button
            variant="primary"
            size="medium"
            title="Create Manual Zone"
            onPress={() => router.push("/manual-zone-form")}
            containerStyle={styles.createZoneButton}
            leftIcon={
              <Ionicons
                name="add"
                size={responsiveScale(20)}
                color={COLORS.white}
              />
            }
          />
        </View>

        {/* Zones List */}
        {filteredZones.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📝</Text>
            <H3 style={styles.emptyTitle}>
              {searchTerm
                ? "No manual zones found"
                : "No manual zones created yet"}
            </H3>
            <Body2 color={COLORS.text.secondary} style={styles.emptyText}>
              {searchTerm
                ? "Try adjusting your search terms"
                : "Create your first manual zone to get started"}
            </Body2>
          </View>
        ) : (
          <View style={styles.zonesList}>
            {filteredZones.map((zone) => (
              <ManualZoneCard
                key={zone._id}
                zone={zone}
                isCreatedByAgent={isZoneCreatedByAgent(zone)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface ManualZoneCardProps {
  zone: ManualZone;
  isCreatedByAgent: boolean;
}

function ManualZoneCard({ zone, isCreatedByAgent }: ManualZoneCardProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleMapView = () => {
    router.push({
      pathname: "/territory-map-view/[territory_id]",
      params: { territory_id: zone._id },
    });
  };

  const formatLocationHierarchy = () => {
    const parts = [];
    if (zone.areaId?.name) parts.push(zone.areaId.name);
    if (zone.municipalityId?.name) parts.push(zone.municipalityId.name);
    if (zone.communityId?.name) parts.push(zone.communityId.name);
    return parts.length > 0 ? parts.join(" > ") : "No location assigned";
  };

  const handleCardPress = () => {
    router.push(`/manual-zone-form?zoneId=${zone._id}`);
  };

  return (
    <TouchableOpacity
      style={styles.zoneCard}
      onPress={handleCardPress}
      activeOpacity={0.7}
    >
      <View style={styles.zoneHeader}>
        <View style={styles.zoneHeaderLeft}>
          <View
            style={[
              styles.zoneIconContainer,
              zone.statistics.completionPercentage >= 70
                ? styles.zoneIconGreen
                : zone.statistics.completionPercentage >= 40
                ? styles.zoneIconBlue
                : styles.zoneIconOrange,
            ]}
          >
            <Text style={styles.zoneIcon}>📝</Text>
          </View>
          <View style={styles.zoneInfo}>
            <View style={styles.zoneTitleRow}>
              <Text weight="semiBold" style={styles.zoneTitle}>
                {zone.name}
              </Text>
              {zone.isPrimary && (
                <View style={styles.primaryBadge}>
                  <Body2 color={COLORS.primary[600]}>Primary</Body2>
                </View>
              )}
            </View>
            <Body2 color={COLORS.text.secondary} style={styles.zoneDescription}>
              {zone.description || "No description"}
            </Body2>
            <View style={styles.zoneStats}>
              <Body2 color={COLORS.text.secondary}>
                {zone.statistics.totalHouses} houses •{" "}
                {zone.statistics.visitedCount} visited
              </Body2>
            </View>
          </View>
        </View>
        <View style={styles.statusBadges}>
          <View
            style={[
              styles.statusBadge,
              zone.status === "ACTIVE"
                ? styles.statusBadgeActive
                : styles.statusBadgeInactive,
            ]}
          >
            <Body2
              color={
                zone.status === "ACTIVE"
                  ? COLORS.success[700]
                  : COLORS.text.secondary
              }
              weight="medium"
            >
              {zone.status}
            </Body2>
          </View>
          {zone.isScheduled && (
            <View style={styles.scheduledBadge}>
              <Body2 color={COLORS.white} weight="medium">
                Scheduled
              </Body2>
            </View>
          )}
          {isCreatedByAgent && (
            <View style={styles.createdByBadge}>
              <Body2 color={COLORS.purple[700]}>Created by You</Body2>
            </View>
          )}
        </View>
      </View>

      {/* Assignment Info */}
      <View style={styles.assignmentInfo}>
        <Body2 color={COLORS.text.secondary} weight="medium">
          Assignment:
        </Body2>
        <View style={styles.assignmentDetails}>
          {zone.assignmentType === "team" && zone.teamName ? (
            <Body2 color={COLORS.text.secondary}>Team: {zone.teamName}</Body2>
          ) : (
            <Body2 color={COLORS.text.secondary}>Individual</Body2>
          )}
          {zone.scheduledDate && (
            <Body2 color={COLORS.text.secondary}>
              Scheduled: {formatDate(zone.scheduledDate)}
            </Body2>
          )}
        </View>
      </View>

      {/* Location */}
      <View style={styles.locationInfo}>
        <Body2 color={COLORS.text.secondary} weight="medium">
          Location:
        </Body2>
        <Body2 color={COLORS.text.light}>{formatLocationHierarchy()}</Body2>
      </View>

      {/* Progress Bar */}
      {!zone.isScheduled && zone.statistics.totalHouses > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Body2 color={COLORS.text.secondary}>Progress</Body2>
            <Body2 color={COLORS.text.primary} weight="medium">
              {zone.statistics.completionPercentage}%
            </Body2>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${zone.statistics.completionPercentage}%`,
                  backgroundColor:
                    zone.statistics.completionPercentage >= 70
                      ? COLORS.success[500]
                      : zone.statistics.completionPercentage >= 40
                      ? COLORS.primary[500]
                      : COLORS.warning[500],
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Action Buttons */}
      {isCreatedByAgent && (
        <View style={styles.actionButtons}>
          <Button
            variant="outline"
            size="small"
            title="Edit"
            onPress={(e) => {
              e?.stopPropagation?.();
              console.log("📝 Edit button pressed for zone:", zone._id);
              console.log("📝 Navigating to:", `/manual-zone-form?zoneId=${zone._id}&mode=edit`);
              router.push(`/manual-zone-form?zoneId=${zone._id}&mode=edit`);
            }}
            containerStyle={styles.actionButton}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default ManualZoneScreen;

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
  },
  loadingText: {
    fontSize: responsiveScale(14),
    color: COLORS.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    padding: responsiveSpacing(PADDING.screenLarge),
  },
  errorText: {
    fontSize: responsiveScale(16),
    color: COLORS.error[500],
    textAlign: "center",
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
  },
  statCard: {
    flex: 1,
    padding: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(12),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statCard1: {
    backgroundColor: COLORS.primary[100],
  },
  statCard2: {
    backgroundColor: COLORS.success[100],
  },
  statCard3: {
    backgroundColor: COLORS.warning[100],
  },
  statCardHeader: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.xs),
    width: "100%",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  statLabel: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    fontWeight: "500",
    textAlign: "center",
  },
  statIcon: {
    fontSize: responsiveScale(16),
  },
  statValue: {
    fontSize: responsiveScale(20),
    fontWeight: "bold",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
    textAlign: "center",
  },
  statSubtext: {
    fontSize: responsiveScale(10),
    textAlign: "center",
  },
  searchContainer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md),
    paddingBottom: responsiveSpacing(SPACING.sm),
  },
  createZoneContainer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingBottom: responsiveSpacing(SPACING.md),
  },
  createZoneButton: {
    width: "100%",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  searchIcon: {
    fontSize: responsiveScale(16),
    marginRight: responsiveSpacing(SPACING.sm),
  },
  searchInput: {
    flex: 1,
    fontSize: responsiveScale(14),
    color: COLORS.text.primary,
    paddingVertical: responsiveSpacing(SPACING.md),
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: responsiveSpacing(SPACING.xl * 2),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
  },
  emptyIcon: {
    fontSize: responsiveScale(64),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  emptyTitle: {
    marginBottom: responsiveSpacing(SPACING.xs),
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
  },
  zonesList: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
  },
  zoneCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  zoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: responsiveSpacing(SPACING.md),
  },
  zoneHeaderLeft: {
    flexDirection: "row",
    flex: 1,
    gap: responsiveSpacing(SPACING.sm),
  },
  zoneIconContainer: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    borderRadius: responsiveScale(20),
    justifyContent: "center",
    alignItems: "center",
  },
  zoneIconGreen: {
    backgroundColor: COLORS.success[100],
  },
  zoneIconBlue: {
    backgroundColor: COLORS.primary[100],
  },
  zoneIconOrange: {
    backgroundColor: COLORS.warning[100],
  },
  zoneIcon: {
    fontSize: responsiveScale(20),
  },
  zoneInfo: {
    flex: 1,
  },
  zoneTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  zoneTitle: {
    fontSize: responsiveScale(16),
    color: COLORS.text.primary,
  },
  primaryBadge: {
    backgroundColor: COLORS.primary[50],
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(8),
  },
  zoneDescription: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  zoneStats: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  statusBadges: {
    alignItems: "flex-end",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  statusBadge: {
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(8),
  },
  statusBadgeActive: {
    backgroundColor: COLORS.success[50],
  },
  statusBadgeInactive: {
    backgroundColor: COLORS.neutral[100],
  },
  scheduledBadge: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(8),
    borderWidth: 0,
  },
  createdByBadge: {
    backgroundColor: COLORS.purple[50],
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(8),
  },
  assignmentInfo: {
    marginBottom: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  assignmentDetails: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  locationInfo: {
    marginBottom: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  progressContainer: {
    marginBottom: responsiveSpacing(SPACING.md),
    paddingTop: responsiveSpacing(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  progressBar: {
    height: responsiveScale(8),
    backgroundColor: COLORS.neutral[200],
    borderRadius: responsiveScale(4),
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: responsiveScale(4),
  },
  actionButtons: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    paddingTop: responsiveSpacing(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  actionButton: {
    flex: 1,
  },
});
