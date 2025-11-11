import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface AgentTerritory {
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

function MyTerritoryScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch agent's territories
  const {
    data: territoriesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["myTerritories"],
    queryFn: async () => {
      const response = await apiInstance.get("/users/my-territories");
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Ensure territories is always an array
  const territories: AgentTerritory[] = Array.isArray(
    territoriesData?.data?.territories
  )
    ? territoriesData.data.territories
    : [];

  const summary = territoriesData?.data?.summary || {
    totalTerritories: territories.length,
    activeTerritories: territories.filter((t) => t.status === "ACTIVE").length,
    scheduledTerritories: territories.filter((t) => t.isScheduled).length,
    totalHouses: territories.reduce(
      (sum, t) => sum + (t.statistics?.totalHouses || 0),
      0
    ),
    visitedHouses: territories.reduce(
      (sum, t) => sum + (t.statistics?.visitedCount || 0),
      0
    ),
    notVisitedHouses: territories.reduce(
      (sum, t) => sum + (t.statistics?.notVisitedCount || 0),
      0
    ),
    completionPercentage:
      territories.length > 0
      ? Math.round(
            territories.reduce(
              (sum, t) => sum + (t.statistics?.completionPercentage || 0),
              0
            ) / territories.length
        )
      : 0,
  };

  // Helper function to check if current agent is the creator
  // Handles both id and _id fields (backend might return either)
  const isTerritoryCreatedByAgent = (territory: AgentTerritory): boolean => {
    if (!user) return false;
    const userId = user.id || (user as any)._id;
    return territory.createdBy === userId;
  };

  // Filter territories based on search term
  const filteredTerritories = territories.filter(
    (territory) =>
      territory.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      territory.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Loading territories...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load territories</Text>
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
        title="My Territory"
        subtext={`Manage your assigned territories (${territories.length} total)`}
        showBackButton={false}
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
        density="compact"
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.statCard1]}>
            <View style={styles.statCardHeader}>
              <Text style={styles.statLabel}>Assigned</Text>
              <Text style={styles.statIcon}>📍</Text>
            </View>
            <Text style={styles.statValue}>{summary.totalTerritories}</Text>
            <Body2 color={COLORS.text.secondary} style={styles.statSubtext}>
              {summary.activeTerritories} active
              {summary.scheduledTerritories > 0 &&
                `, ${summary.scheduledTerritories} scheduled`}
            </Body2>
          </View>

          <View style={[styles.statCard, styles.statCard2]}>
            <View style={styles.statCardHeader}>
              <Text style={styles.statLabel}>Total Houses</Text>
              <Text style={styles.statIcon}>🏠</Text>
            </View>
            <Text style={styles.statValue}>{summary.totalHouses}</Text>
            <Body2 color={COLORS.text.secondary} style={styles.statSubtext}>
              Across all territories
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
              placeholder="Search territories..."
              placeholderTextColor={COLORS.text.light}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>
        </View>

        {/* Territories List */}
        {filteredTerritories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📍</Text>
            <H3 style={styles.emptyTitle}>
              {searchTerm
                ? "No territories found"
                : "No territories assigned yet"}
            </H3>
            <Body2 color={COLORS.text.secondary} style={styles.emptyText}>
              {searchTerm
                ? "Try adjusting your search terms"
                : "You'll see your assigned territories here"}
            </Body2>
          </View>
        ) : (
          <View style={styles.territoriesList}>
            {filteredTerritories.map((territory) => (
              <TerritoryCard
                key={territory._id}
                territory={territory}
                isCreatedByAgent={isTerritoryCreatedByAgent(territory)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface TerritoryCardProps {
  territory: AgentTerritory;
  isCreatedByAgent: boolean;
}

function TerritoryCard({ territory, isCreatedByAgent }: TerritoryCardProps) {
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
      params: { territory_id: territory._id },
    });
  };

  const formatLocationHierarchy = () => {
    const parts = [];
    if (territory.areaId?.name) parts.push(territory.areaId.name);
    if (territory.municipalityId?.name)
      parts.push(territory.municipalityId.name);
    if (territory.communityId?.name) parts.push(territory.communityId.name);
    return parts.length > 0 ? parts.join(" > ") : "No location assigned";
  };

  return (
    <View style={styles.territoryCard}>
      <View style={styles.territoryHeader}>
        <View style={styles.territoryHeaderLeft}>
          <View
            style={[
              styles.territoryIconContainer,
              territory.statistics.completionPercentage >= 70
                ? styles.territoryIconGreen
                : territory.statistics.completionPercentage >= 40
                ? styles.territoryIconBlue
                : styles.territoryIconOrange,
            ]}
          >
            <Text style={styles.territoryIcon}>📍</Text>
          </View>
          <View style={styles.territoryInfo}>
            <View style={styles.territoryTitleRow}>
              <Text weight="semiBold" style={styles.territoryTitle}>
                {territory.name}
              </Text>
              {territory.isPrimary && (
                <View style={styles.primaryBadge}>
                  <Body2 color={COLORS.primary[600]}>Primary</Body2>
                </View>
              )}
            </View>
            <Body2
              color={COLORS.text.secondary}
              style={styles.territoryDescription}
            >
              {territory.description || "No description"}
            </Body2>
            <View style={styles.territoryStats}>
              <Body2 color={COLORS.text.secondary}>
                {territory.statistics.totalHouses} houses •{" "}
                {territory.statistics.visitedCount} visited
              </Body2>
            </View>
          </View>
        </View>
        <View style={styles.statusBadges}>
          <View
            style={[
              styles.statusBadge,
              territory.status === "ACTIVE"
                ? styles.statusBadgeActive
                : styles.statusBadgeInactive,
            ]}
          >
            <Body2
              color={
                territory.status === "ACTIVE"
                  ? COLORS.success[700]
                  : COLORS.text.secondary
              }
              weight="medium"
            >
              {territory.status}
            </Body2>
          </View>
          {territory.isScheduled && (
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
          {territory.assignmentType === "team" && territory.teamName ? (
            <Body2 color={COLORS.text.secondary}>
              Team: {territory.teamName}
            </Body2>
          ) : (
            <Body2 color={COLORS.text.secondary}>Individual</Body2>
          )}
          {territory.scheduledDate && (
            <Body2 color={COLORS.text.secondary}>
              Scheduled: {formatDate(territory.scheduledDate)}
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
      {!territory.isScheduled && territory.statistics.totalHouses > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Body2 color={COLORS.text.secondary}>Progress</Body2>
            <Body2 color={COLORS.text.primary} weight="medium">
              {territory.statistics.completionPercentage}%
            </Body2>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${territory.statistics.completionPercentage}%`,
                  backgroundColor:
                    territory.statistics.completionPercentage >= 70
                      ? COLORS.success[500]
                      : territory.statistics.completionPercentage >= 40
                      ? COLORS.primary[500]
                      : COLORS.warning[500],
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <Button
          variant="outline"
          size="small"
          title="Map View"
          onPress={handleMapView}
          containerStyle={styles.actionButton}
        />
        {isCreatedByAgent && (
          <Button
            variant="outline"
            size="small"
            title="Edit"
            onPress={() =>
              router.push({
                pathname: "/edit-zone/[territory_id]",
                params: { territory_id: territory._id },
              })
            }
            containerStyle={styles.actionButton}
          />
        )}
      </View>
    </View>
  );
}

export default MyTerritoryScreen;

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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  statLabel: {
    fontSize: responsiveScale(12),
    color: COLORS.text.secondary,
    fontWeight: "500",
    flex: 1,
  },
  statIcon: {
    fontSize: responsiveScale(16),
  },
  statValue: {
    fontSize: responsiveScale(20),
    fontWeight: "bold",
    color: COLORS.text.primary,
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  statSubtext: {
    fontSize: responsiveScale(10),
  },
  searchContainer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md),
    paddingBottom: responsiveSpacing(SPACING.sm),
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
  territoriesList: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md),
    gap: responsiveSpacing(SPACING.md),
  },
  territoryCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  territoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: responsiveSpacing(SPACING.md),
  },
  territoryHeaderLeft: {
    flexDirection: "row",
    flex: 1,
    gap: responsiveSpacing(SPACING.sm),
  },
  territoryIconContainer: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    borderRadius: responsiveScale(20),
    justifyContent: "center",
    alignItems: "center",
  },
  territoryIconGreen: {
    backgroundColor: COLORS.success[100],
  },
  territoryIconBlue: {
    backgroundColor: COLORS.primary[100],
  },
  territoryIconOrange: {
    backgroundColor: COLORS.warning[100],
  },
  territoryIcon: {
    fontSize: responsiveScale(20),
  },
  territoryInfo: {
    flex: 1,
  },
  territoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  territoryTitle: {
    fontSize: responsiveScale(16),
    color: COLORS.text.primary,
  },
  primaryBadge: {
    backgroundColor: COLORS.primary[50],
    paddingHorizontal: responsiveSpacing(SPACING.xs),
    paddingVertical: responsiveSpacing(SPACING.xs / 2),
    borderRadius: responsiveScale(8),
  },
  territoryDescription: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  territoryStats: {
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
