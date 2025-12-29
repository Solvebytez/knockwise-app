import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { getMyRoutes } from "@/lib/routeApi";
import { useMyActivities, Activity } from "@/lib/activityApi";
import { useAgentDashboardStats } from "@/lib/agentDashboardApi";
import { getActivityColors } from "@/lib/activityColors";
import { getMyNotVisitedResidents, Resident } from "@/lib/residentsApi";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H2, H3, Body2 } from "@/components/ui";
import { Button } from "@/components/ui";
import { SideDrawer } from "@/components/ui/SideDrawer";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function HomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isStartKnockingModalOpen, setIsStartKnockingModalOpen] = useState(false);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const todayDate = getTodayDate();

  // SECTION 1: Stats Cards - Independent Loading
  // Use new agent-specific dashboard stats endpoint
  const {
    data: dashboardData,
    isLoading: isLoadingStats,
    isError: isErrorStats,
    error: statsError,
    refetch: refetchStats,
  } = useAgentDashboardStats();

  // Fetch manual zones count
  const {
    data: territoriesData,
    isLoading: isLoadingManualZones,
  } = useQuery({
    queryKey: ["myTerritories"],
    queryFn: async () => {
      const response = await apiInstance.get("/users/my-territories");
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Calculate manual zones count
  const manualZonesCount = useMemo(() => {
    const allTerritories = Array.isArray(territoriesData?.data?.territories)
      ? territoriesData.data.territories
      : [];
    return allTerritories.filter((zone: any) => zone.zoneType === "MANUAL").length;
  }, [territoriesData]);

  // Log error details for debugging
  if (isErrorStats && statsError) {
    console.error("❌ Dashboard stats error:", statsError);
  }

  const agentStats = useMemo(() => {
    return (
      dashboardData?.data?.stats || {
        todayTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        performance: 0,
        territories: 0,
        routes: 0,
        totalVisitsToday: 0,
        totalVisitsYesterday: 0,
        leadsCreatedToday: 0,
        completedVisitsToday: 0,
        pendingVisitsToday: 0,
        totalPropertiesInCreatedZones: 0,
        totalZonesCreatedByUser: 0,
      }
    );
  }, [dashboardData?.data?.stats]);

  // Calculate performance percentage change
  const performanceChange = useMemo(() => {
    const yesterday = agentStats.totalVisitsYesterday || 0;
    const today = agentStats.totalVisitsToday || 0;
    
    // Check if values are equal
    if (yesterday === today) {
      return { percentage: 0, isPositive: false, isEqual: true };
    }
    
    if (yesterday === 0) {
      return today > 0 ? { percentage: 100, isPositive: true, isEqual: false } : { percentage: 0, isPositive: false, isEqual: true };
    }
    
    const change = ((today - yesterday) / yesterday) * 100;
    return {
      percentage: Math.abs(Math.round(change)),
      isPositive: change > 0,
      isEqual: false,
    };
  }, [agentStats.totalVisitsYesterday, agentStats.totalVisitsToday]);

  // SECTION 2: Today's Schedule - Independent Loading
  // Use schedule from dashboard stats, but also allow fallback to separate query
  const {
    data: scheduleData,
    isLoading: isLoadingScheduleFallback,
    isError: isErrorSchedule,
    refetch: refetchSchedule,
  } = useQuery({
    queryKey: ["todaySchedule", todayDate],
    queryFn: () =>
      getMyRoutes({
        date: todayDate,
        limit: 20,
      }),
    refetchOnWindowFocus: false,
    retry: 2,
    enabled: !dashboardData?.data?.todaySchedule, // Only fetch if dashboard doesn't have it
  });

  // Schedule loading: true if dashboard is loading OR fallback is loading
  const isLoadingSchedule =
    isLoadingStats ||
    (isLoadingScheduleFallback && !dashboardData?.data?.todaySchedule);

  // Transform routes to schedule format
  const upcomingTasks = useMemo(() => {
    // Use dashboard schedule if available, otherwise use separate query
    const scheduleRoutes =
      dashboardData?.data?.todaySchedule || scheduleData?.routes || [];

    if (!scheduleRoutes || scheduleRoutes.length === 0) return [];
    // Filter routes by status (PLANNED or IN_PROGRESS) and limit to 10
    const filteredRoutes = scheduleRoutes
      .filter(
        (route: any) =>
          route.status === "PLANNED" || route.status === "IN_PROGRESS"
      )
      .slice(0, 10);

    return filteredRoutes.map((route: any) => {
      // Calculate time window from route duration or use default
      const durationHours = Math.ceil(route.totalDuration / 60);
      // Try to use route's optimization settings for start time, otherwise default to 9 AM
      const startHour = route.optimizationSettings?.preferredTimeWindow?.start
        ? parseInt(
            route.optimizationSettings.preferredTimeWindow.start.split(":")[0]
          )
        : 9;
      const endHour = startHour + durationHours;

      // Format time
      const formatTime = (hour: number) => {
        const period = hour >= 12 ? "PM" : "AM";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${displayHour}:00 ${period}`;
      };

      // Map priority
      const priorityMap: Record<string, string> = {
        URGENT: "high",
        HIGH: "high",
        MEDIUM: "medium",
        LOW: "low",
      };

      return {
        id: route._id,
        title: route.zoneId?.name || route.name,
        time: `${formatTime(startHour)} - ${formatTime(endHour)}`,
        houses: route.stops?.length || route.analytics?.totalStops || 0,
        priority: priorityMap[route.priority] || "medium",
      };
    });
  }, [dashboardData?.data?.todaySchedule, scheduleData?.routes]);

  // SECTION 2.5: Not-Visited Properties - Independent Loading
  const {
    data: notVisitedResidents,
    isLoading: isLoadingNotVisited,
    isError: isErrorNotVisited,
    refetch: refetchNotVisited,
  } = useQuery({
    queryKey: ["myNotVisitedResidents"],
    queryFn: () => getMyNotVisitedResidents(3),
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Debug logging
  useEffect(() => {
    if (notVisitedResidents) {
    }
    if (isErrorNotVisited) {
      console.error("❌ [HomeScreen] Not-visited residents error:", isErrorNotVisited);
    }
  }, [notVisitedResidents, isErrorNotVisited]);

  // SECTION 3: Recent Activities - Independent Loading
  // Use activities from dashboard stats, but also allow fallback to separate query
  const {
    data: activitiesData,
    isLoading: isLoadingActivities,
    isError: isErrorActivities,
    refetch: refetchActivities,
  } = useMyActivities({
    limit: 10,
    page: 1,
  });

  // Transform activities to display format
  const recentActivities = useMemo(() => {
    // Use dashboard activities if available, otherwise use separate query
    const activitiesList =
      dashboardData?.data?.recentActivities || activitiesData?.data || [];

    if (!activitiesList || activitiesList.length === 0) return [];

    const formatTimeAgo = (dateString: string) => {
      const now = new Date();
      const activityDate = new Date(dateString);
      const diffMs = now.getTime() - activityDate.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffHours > 0) {
        return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
      } else if (diffMinutes > 0) {
        return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
      }
      return "Just now";
    };

    const getActivityType = (response?: string) => {
      if (!response) return "task_completed";
      const typeMap: Record<string, string> = {
        LEAD_CREATED: "task_completed",
        APPOINTMENT_SET: "task_completed",
        CALL_BACK: "task_completed",
        FOLLOW_UP: "task_completed",
        NOT_INTERESTED: "task_completed",
        NO_ANSWER: "task_completed",
      };
      return typeMap[response] || "task_completed";
    };

    const getActivityTitle = (activity: Activity) => {
      // Handle different activity types FIRST (before checking response)
      if (activity.activityType === "ZONE_OPERATION") {
        const operation = activity.operationType?.toLowerCase() || "updated";
        return `Zone ${operation}`;
      }
      if (activity.activityType === "PROPERTY_OPERATION") {
        const operation = activity.operationType?.toLowerCase() || "updated";
        return `Property ${operation}`;
      }
      if (activity.activityType === "ROUTE_OPERATION") {
        const operation = activity.operationType?.toLowerCase() || "updated";
        return `Route ${operation}`;
      }

      // Handle VISIT activities (only if activityType is VISIT or undefined/legacy)
      if (!activity.response) return "Visit completed";
      const titleMap: Record<string, string> = {
        LEAD_CREATED: "Lead created",
        APPOINTMENT_SET: "Appointment set",
        CALL_BACK: "Callback scheduled",
        FOLLOW_UP: "Follow-up completed",
        NOT_INTERESTED: "Visit completed",
        NO_ANSWER: "Visit completed",
      };
      return titleMap[activity.response] || "Visit completed";
    };

    const getActivityDescription = (activity: Activity) => {
      if (activity.activityType === "ZONE_OPERATION") {
        const zoneName = activity.zoneId?.name || "territory";
        return (
          activity.notes ||
          `Zone ${activity.operationType?.toLowerCase()} in ${zoneName}`
        );
      }
      if (activity.activityType === "ROUTE_OPERATION") {
        const zoneName = activity.zoneId?.name || "territory";
        return (
          activity.notes ||
          `Route ${activity.operationType?.toLowerCase()} in ${zoneName}`
        );
      }
      if (activity.activityType === "PROPERTY_OPERATION") {
        const zoneName = activity.zoneId?.name || "territory";
        const address = activity.propertyId?.addressLine1 || "";

        // Parse notes to extract status changes
        if (activity.notes) {
          // Check if notes contain status change pattern: "status: "old" → "new""
          const statusMatch = activity.notes.match(
            /status:\s*"([^"]+)"\s*→\s*"([^"]+)"/
          );
          if (statusMatch) {
            const [, , newStatus] = statusMatch;
            // Format status for display (capitalize first letter, replace hyphens)
            const formattedStatus = newStatus
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
            return `Property status changed to '${formattedStatus}' in ${zoneName}`;
          }
        }

        // Fallback to default message
        return (
          activity.notes ||
          (address
            ? `Property ${activity.operationType?.toLowerCase()} at ${address} in ${zoneName}`
            : `Property ${activity.operationType?.toLowerCase()} in ${zoneName}`)
        );
      }

      // Handle VISIT activities
      const zoneName = activity.zoneId?.name || "territory";
      const address = activity.propertyId?.addressLine1 || "";
      return address
        ? `${getActivityTitle(activity)} at ${address} in ${zoneName}`
        : `${getActivityTitle(activity)} in ${zoneName}`;
    };

    return activitiesList
      .slice(0, 4) // Limit to latest 4 activities
      .map((activity) => {
        const status =
          activity.activityType === "ZONE_OPERATION" ||
          activity.activityType === "PROPERTY_OPERATION" ||
          activity.activityType === "ROUTE_OPERATION"
            ? "completed"
            : activity.response === "LEAD_CREATED" ||
              activity.response === "APPOINTMENT_SET"
            ? "completed"
            : "pending";

        return {
          id: activity._id,
          type: getActivityType(activity.response),
          title: getActivityTitle(activity),
          description: getActivityDescription(activity),
          time: formatTimeAgo(activity.startedAt || activity.createdAt), // Use startedAt (when activity happened) instead of createdAt
          status,
        };
      });
  }, [dashboardData?.data?.recentActivities, activitiesData?.data]);

  // Format date
  const formatDate = () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const handleOpenDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchStats(),
        refetchSchedule(),
        refetchNotVisited(),
        refetchActivities(),
      ]);
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchStats, refetchSchedule, refetchNotVisited, refetchActivities]);

  // Navigation handlers
  const handleViewAllRoutes = useCallback(() => {
    router.push("/(tabs)/my-routes");
  }, [router]);

  const handleSeeAllActivities = useCallback(() => {
    router.push("/(tabs)/activities");
  }, [router]);

  const handleViewAllLeads = useCallback(() => {
    router.push("/my-leads");
  }, [router]);

  const handleStartKnocking = useCallback(() => {
    setIsStartKnockingModalOpen(true);
  }, []);

  const handleCloseStartKnockingModal = useCallback(() => {
    setIsStartKnockingModalOpen(false);
  }, []);

  const handleCreateManualZone = useCallback(() => {
    setIsStartKnockingModalOpen(false);
    router.push("/manual-zone-form");
  }, [router]);

  const handleCreateAutoZone = useCallback(() => {
    setIsStartKnockingModalOpen(false);
    router.push("/create-zone?type=auto");
  }, [router]);

  const menuItems = useMemo(
    () => [
      {
        id: "activities",
        label: "Activities",
        onPress: () => {
          setIsDrawerOpen(false);
          router.push("/(tabs)/activities");
        },
      },
      {
        id: "create-zone",
        label: "Create Zone",
        onPress: () => {
          setIsDrawerOpen(false);
          router.push("/create-zone");
        },
      },
      {
        id: "profile",
        label: "Profile",
        onPress: () => {
          setIsDrawerOpen(false);
          router.push("/profile");
        },
      },
    ],
    [router]
  );

  // No global loading - each section loads independently

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={COLORS.white} />
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
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require("@/assets/images/knockwise-logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleOpenDrawer}
            >
              <Text style={styles.iconText}>☰</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton}>
              <View style={styles.bellContainer}>
                <Text style={styles.iconText}>🔔</Text>
                {/* TODO: Add notification count from API when available */}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeLeftContent}>
              <View style={styles.profileImageContainer}>
                {user?.profilePicture || user?.avatar ? (
                  <Image
                    source={{ uri: user.profilePicture || user.avatar }}
                    style={styles.profileImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profileInitials}>
                      {user?.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "A"}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.welcomeTextContainer}>
                <Body2 color={COLORS.text.secondary}>Welcome back,</Body2>
                <H2 style={styles.welcomeName}>{user?.name || "Agent"}</H2>
              </View>
            </View>
            <View style={styles.activeStatus}>
              <View style={styles.activeDot} />
              <Body2 color={COLORS.success[600]}>Active</Body2>
            </View>
          </View>
          <View style={styles.welcomeDateContainer}>
            <Body2 color={COLORS.text.secondary} style={styles.welcomeDate}>
              {formatDate()}
            </Body2>
          </View>
        </View>

        {/* Start Knocking Button */}
        <View style={styles.startKnockingContainer}>
          <Button
            title="Start Knocking"
            variant="primary"
            size="large"
            fullWidth
            leftIcon={
              <MaterialIcons
                name="door-front"
                size={responsiveScale(20)}
                color={COLORS.white}
              />
            }
            onPress={handleStartKnocking}
          />
        </View>

        {/* Stats Cards - Independent Loading */}
        <View style={styles.statsContainer}>
          {isErrorStats ? (
            <View style={styles.errorContainer}>
              <Body2 color={COLORS.error[500]}>
                Failed to load stats. Pull down to refresh.
              </Body2>
            </View>
          ) : isLoadingStats ? (
            <View style={styles.statsLoadingContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.statsScrollContent}
              >
                {[1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[styles.statCard, styles.statCardSkeleton]}
                  >
                    <View style={styles.skeletonLine} />
                    <View
                      style={[styles.skeletonLine, styles.skeletonLineLarge]}
                    />
                    <View style={styles.skeletonLine} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsScrollContent}
              style={styles.statsScrollView}
            >
              {/* Performance Card - Position 1 */}
              <View style={[styles.statCard, styles.statCard0, styles.performanceCard]}>
                <View style={styles.statHeader}>
                  <MaterialIcons
                    name={
                      performanceChange.isEqual
                        ? "trending-flat"
                        : performanceChange.isPositive
                        ? "trending-up"
                        : "trending-down"
                    }
                    size={responsiveScale(20)}
                    color={
                      performanceChange.isEqual
                        ? COLORS.warning[600]
                        : performanceChange.isPositive
                        ? COLORS.success[600]
                        : COLORS.error[500]
                    }
                  />
                  <Text
                    variant="body2"
                    color={COLORS.text.secondary}
                    style={styles.statLabel}
                  >
                    Performance
                  </Text>
                </View>
                <View style={styles.performanceContent}>
                  <View style={styles.performanceNumbers}>
                    <View style={styles.performanceRow}>
                      <Body2 color={COLORS.text.secondary} style={styles.performanceLabel}>
                        Yesterday:
                      </Body2>
                      <Body2 color={COLORS.text.primary} weight="semiBold">
                        {agentStats.totalVisitsYesterday || 0}
                      </Body2>
                    </View>
                    <View style={styles.performanceRow}>
                      <Body2 color={COLORS.text.secondary} style={styles.performanceLabel}>
                        Today:
                      </Body2>
                      <Body2 color={COLORS.text.primary} weight="semiBold">
                        {agentStats.totalVisitsToday || 0}
                      </Body2>
                    </View>
                  </View>
                  <View style={styles.performanceChange}>
                    <MaterialIcons
                      name={
                        performanceChange.isEqual
                          ? "remove"
                          : performanceChange.isPositive
                          ? "arrow-upward"
                          : "arrow-downward"
                      }
                      size={responsiveScale(16)}
                      color={
                        performanceChange.isEqual
                          ? COLORS.warning[600]
                          : performanceChange.isPositive
                          ? COLORS.success[600]
                          : COLORS.error[500]
                      }
                    />
                    <Text
                      variant="body2"
                      color={
                        performanceChange.isEqual
                          ? COLORS.warning[600]
                          : performanceChange.isPositive
                          ? COLORS.success[600]
                          : COLORS.error[500]
                      }
                      weight="semiBold"
                    >
                      {performanceChange.isEqual
                        ? "0%"
                        : performanceChange.isPositive
                        ? `+${performanceChange.percentage}%`
                        : `-${performanceChange.percentage}%`}
                    </Text>
                  </View>
                </View>
                <View style={styles.performanceGraphIcon}>
                  <MaterialIcons
                    name="show-chart"
                    size={responsiveScale(24)}
                    color={
                      performanceChange.isEqual
                        ? COLORS.warning[400]
                        : performanceChange.isPositive
                        ? COLORS.success[400]
                        : COLORS.error[400]
                    }
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.statCard, styles.statCard2]}
                onPress={() => router.push("/all-properties")}
                activeOpacity={0.7}
              >
                <View>
                  <View style={styles.statHeader}>
                    <MaterialIcons
                      name="domain"
                      size={responsiveScale(20)}
                      color={COLORS.success[600]}
                    />
                    <Text
                      variant="body2"
                      color={COLORS.text.secondary}
                      style={styles.statLabel}
                    >
                      Total Properties
                    </Text>
                  </View>
                  <Text
                    variant="h1"
                    color={COLORS.text.primary}
                    weight="bold"
                    style={styles.statValue}
                  >
                    {agentStats.totalPropertiesInCreatedZones || 0}
                  </Text>
                </View>
                <View style={styles.statFooter}>
                  <Body2 color={COLORS.text.secondary}>
                    {agentStats.totalZonesCreatedByUser || 0} zones
                  </Body2>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, styles.statCard5]}
                onPress={() => router.push("/(tabs)/manual-zone")}
                activeOpacity={0.7}
              >
                <View>
                  <View style={styles.statHeader}>
                    <MaterialIcons
                      name="edit-location"
                      size={responsiveScale(20)}
                      color={COLORS.primary[600]}
                    />
                    <Text
                      variant="body2"
                      color={COLORS.text.secondary}
                      style={styles.statLabel}
                    >
                      Manual Zones
                    </Text>
                  </View>
                  <Text
                    variant="h1"
                    color={COLORS.text.primary}
                    weight="bold"
                    style={styles.statValue}
                  >
                    {isLoadingManualZones ? "..." : manualZonesCount || 0}
                  </Text>
                </View>
                <View style={styles.statFooter}>
                  <Body2 color={COLORS.text.secondary}>
                    {isLoadingManualZones ? "loading" : "zones"}
                  </Body2>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, styles.statCard3]}
                onPress={() => router.push("/(tabs)/my-territory")}
                activeOpacity={0.7}
              >
                <View style={styles.statHeader}>
                  <MaterialIcons
                    name="map"
                    size={responsiveScale(20)}
                    color={COLORS.warning[600]}
                  />
                  <Text
                    variant="body2"
                    color={COLORS.text.secondary}
                    style={styles.statLabel}
                  >
                    Territories
                  </Text>
                </View>
                <Text
                  variant="h1"
                  color={COLORS.text.primary}
                  weight="bold"
                  style={styles.statValue}
                >
                  {agentStats.territories}
                </Text>
                <View style={styles.statFooter}>
                  <Body2 color={COLORS.text.secondary}>
                    {agentStats.routes} routes
                  </Body2>
                </View>
              </TouchableOpacity>

              <View style={[styles.statCard, styles.statCard4]}>
                <View>
                  <View style={styles.statHeader}>
                    <MaterialIcons
                      name="home"
                      size={responsiveScale(20)}
                      color={COLORS.purple[600]}
                    />
                    <Text
                      variant="body2"
                      color={COLORS.text.secondary}
                      style={styles.statLabel}
                    >
                      Visits Today
                    </Text>
                  </View>
                  <Text
                    variant="h1"
                    color={COLORS.text.primary}
                    weight="bold"
                    style={styles.statValue}
                  >
                    {agentStats.totalVisitsToday || 0}
                  </Text>
                </View>
                <View style={styles.statFooter}>
                  <Body2 color={COLORS.success[600]}>
                    {agentStats.completedVisitsToday || 0} completed
                  </Body2>
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Leads Section - Independent Loading */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <H3>Latest Leads</H3>
            <TouchableOpacity onPress={handleViewAllLeads}>
              <Body2 color={COLORS.primary[500]}>View All</Body2>
            </TouchableOpacity>
          </View>
          {isErrorNotVisited ? (
            <View style={styles.errorContainer}>
              <Body2 color={COLORS.error[500]}>
                Failed to load leads. Pull down to refresh.
              </Body2>
            </View>
          ) : isLoadingNotVisited ? (
            <View style={styles.sectionLoadingContainer}>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.leadCard, styles.leadCardSkeleton]}
                >
                  <View style={styles.skeletonLine} />
                  <View style={styles.skeletonLine} />
                  <View style={styles.skeletonLine} />
                </View>
              ))}
            </View>
          ) : notVisitedResidents && notVisitedResidents.length > 0 ? (
            <View style={styles.leadsContainer}>
              {notVisitedResidents.map((resident) => {
                const zoneName = typeof resident.zoneId === 'object' 
                  ? resident.zoneId?.name || 'Unknown Zone'
                  : 'Unknown Zone';
                
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
                
                const statusColor = statusColors[resident.status] || statusColors["visited"];
                const statusDisplayName = getStatusDisplayName(resident.status);
                
                return (
                  <TouchableOpacity 
                    key={resident._id} 
                    style={styles.leadCard}
                    onPress={() => {
                      // Navigate to property details or zone
                      const zoneId = typeof resident.zoneId === 'object' 
                        ? resident.zoneId._id 
                        : resident.zoneId;
                      router.push({
                        pathname: "/manual-zone-form",
                        params: { zoneId },
                      });
                    }}
                  >
                    <View style={styles.leadContent}>
                      <View style={styles.leadHeader}>
                        <View style={styles.leadInfo}>
                          <Text
                            variant="body1"
                            weight="semiBold"
                            color={COLORS.text.primary}
                            style={{ marginBottom: responsiveSpacing(SPACING.xs / 2) }}
                          >
                            {resident.ownerName || resident.address || 'Unknown Property'}
                          </Text>
                          <Body2 color={COLORS.text.secondary} numberOfLines={1}>
                            {resident.address}
                          </Body2>
                          <Body2 color={COLORS.text.secondary} style={{ fontSize: responsiveScale(11), marginTop: responsiveSpacing(SPACING.xs / 2) }}>
                            {zoneName}
                          </Body2>
                        </View>
                        <View style={[styles.leadStatusBadge, { backgroundColor: `${statusColor}15` }]}>
                          <Body2 color={statusColor} weight="medium" style={{ fontSize: responsiveScale(11) }}>
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
                          <Body2 color={COLORS.text.secondary} style={{ marginLeft: responsiveSpacing(SPACING.xs / 2) }}>
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
              <Body2 color={COLORS.text.secondary}>
                No leads available
              </Body2>
            </View>
          )}
        </View>

        {/* Recent Activities Section - Independent Loading */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <H3>Recent Activities</H3>
            <TouchableOpacity onPress={handleSeeAllActivities}>
              <Body2 color={COLORS.primary[500]}>See All</Body2>
            </TouchableOpacity>
          </View>
          {isErrorActivities ? (
            <View style={styles.errorContainer}>
              <Body2 color={COLORS.error[500]}>
                Failed to load activities. Pull down to refresh.
              </Body2>
            </View>
          ) : isLoadingActivities ? (
            <View style={styles.sectionLoadingContainer}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.activityItem}>
                  <View
                    style={[styles.activityDot, styles.activityDotSkeleton]}
                  />
                  <View
                    style={[
                      styles.activityContent,
                      styles.activityContentSkeleton,
                    ]}
                  >
                    <View style={styles.skeletonLine} />
                    <View style={styles.skeletonLine} />
                    <View
                      style={[styles.skeletonLine, styles.skeletonLineSmall]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : recentActivities.length > 0 ? (
            <View style={styles.activitiesContainer}>
              {recentActivities.map((activity) => {
                // Get activity from the original data to access activityType and response
                const originalActivity =
                  dashboardData?.data?.recentActivities?.find(
                    (a) => a._id === activity.id
                  ) || activitiesData?.data?.find((a) => a._id === activity.id);

                const colors = originalActivity
                  ? getActivityColors(originalActivity)
                  : {
                      dotColor: COLORS.neutral[500],
                      backgroundColor: COLORS.neutral[50],
                    };

                return (
                  <View key={activity.id} style={styles.activityItem}>
                    <View
                      style={[
                        styles.activityDot,
                        { backgroundColor: colors.dotColor },
                      ]}
                    />
                    <View
                      style={[
                        styles.activityContent,
                        { backgroundColor: colors.backgroundColor },
                      ]}
                    >
                      <Text
                        variant="body1"
                        weight="medium"
                        color={COLORS.text.primary}
                        style={styles.activityTitle}
                      >
                        {activity.title}
                      </Text>
                      <Body2
                        color={COLORS.text.secondary}
                        style={styles.activityDesc}
                      >
                        {activity.description}
                      </Body2>
                      <Body2
                        color={COLORS.text.light}
                        style={styles.activityTime}
                      >
                        {activity.time}
                      </Body2>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <Body2 color={COLORS.text.secondary}>No recent activities</Body2>
            </View>
          )}
        </View>
      </ScrollView>
      <SideDrawer visible={isDrawerOpen} onClose={handleCloseDrawer}>
        <View style={styles.drawerHeader}>
          <H3>Quick Actions</H3>
          <Body2 color={COLORS.text.secondary}>
            Jump to frequently used tools
          </Body2>
        </View>
        <View style={styles.drawerMenu}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.drawerItem}
              onPress={item.onPress}
            >
              <Text variant="body1" weight="medium" color={COLORS.text.primary}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SideDrawer>

      {/* Start Knocking Modal */}
      <Modal
        visible={isStartKnockingModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseStartKnockingModal}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCloseStartKnockingModal}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <H3>Start Knocking</H3>
              <TouchableOpacity
                onPress={handleCloseStartKnockingModal}
                style={styles.modalCloseButton}
              >
                <MaterialIcons
                  name="close"
                  size={responsiveScale(24)}
                  color={COLORS.text.primary}
                />
              </TouchableOpacity>
            </View>
            <Body2
              color={COLORS.text.secondary}
              style={styles.modalDescription}
            >
              Choose how you want to create your zone
            </Body2>
            <View style={styles.modalButtonsContainer}>
              <Button
                title="Create Manual Zone"
                variant="primary"
                size="large"
                fullWidth
                leftIcon={
                  <MaterialIcons
                    name="edit"
                    size={responsiveScale(20)}
                    color={COLORS.white}
                  />
                }
                onPress={handleCreateManualZone}
                containerStyle={styles.modalButton}
              />
              <Button
                title="Create Auto Zone"
                variant="outline"
                size="large"
                fullWidth
                leftIcon={
                  <MaterialIcons
                    name="auto-awesome"
                    size={responsiveScale(20)}
                    color={COLORS.primary[500]}
                  />
                }
                onPress={handleCreateAutoZone}
                containerStyle={styles.modalButton}
              />
            </View>
          </Pressable>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.md + SPACING.xs),
    paddingBottom: responsiveSpacing(SPACING.sm),
    backgroundColor: COLORS.white,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.sm),
  },
  logo: {
    width: responsiveScale(140),
    height: responsiveScale(45),
  },
  iconButton: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: responsiveScale(20),
    color: COLORS.text.primary,
  },
  bellContainer: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -responsiveScale(4),
    right: -responsiveScale(4),
    backgroundColor: COLORS.error[500],
    borderRadius: responsiveScale(8),
    minWidth: responsiveScale(16),
    height: responsiveScale(16),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(SPACING.xs / 2),
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: responsiveScale(9),
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: responsiveScale(9),
  },
  welcomeCard: {
    backgroundColor: COLORS.warning[50],
    marginHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginTop: responsiveSpacing(SPACING.md),
    marginBottom: responsiveSpacing(SPACING.md),
    padding: responsiveSpacing(SPACING.lg),
    borderRadius: responsiveScale(16),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  welcomeLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.md),
    flex: 1,
  },
  profileImageContainer: {
    width: responsiveScale(56),
    height: responsiveScale(56),
    borderRadius: responsiveScale(28),
    overflow: "hidden",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profilePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitials: {
    color: COLORS.white,
    fontSize: responsiveScale(20),
    fontWeight: "bold",
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeName: {
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  welcomeDateContainer: {
    marginTop: responsiveSpacing(SPACING.xs),
    paddingLeft: responsiveScale(72), // Align with text (56px profile + 16px gap)
  },
  welcomeDate: {
    marginTop: 0,
  },
  activeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    paddingHorizontal: responsiveSpacing(SPACING.sm),
    paddingVertical: responsiveSpacing(SPACING.xs),
    backgroundColor: COLORS.success[50],
    borderRadius: responsiveScale(20),
  },
  activeDot: {
    width: responsiveScale(8),
    height: responsiveScale(8),
    borderRadius: responsiveScale(4),
    backgroundColor: COLORS.success[500],
  },
  statsContainer: {
    marginBottom: responsiveSpacing(SPACING.md),
  },
  statsScrollView: {
    flexGrow: 0,
  },
  statsScrollContent: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingVertical: responsiveSpacing(SPACING.sm),
    paddingBottom: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  statCard: {
    paddingTop: responsiveSpacing(SPACING.lg),
    paddingLeft: responsiveSpacing(SPACING.sm),
    paddingRight: responsiveSpacing(SPACING.lg),
    paddingBottom: responsiveSpacing(SPACING.lg + SPACING.xs),
    borderRadius: responsiveScale(16),
    width: responsiveScale(140),
    minHeight: responsiveScale(140), // Ensure consistent card height
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: "center", // Center content vertically
    alignItems: "center", // Center content horizontally
  },
  statCard0: {
    backgroundColor: COLORS.neutral[50],
  },
  performanceCard: {
    position: "relative",
  },
  statCard2: {
    backgroundColor: COLORS.success[100],
  },
  statCard3: {
    backgroundColor: COLORS.warning[100],
  },
  statCard4: {
    backgroundColor: COLORS.purple[100],
  },
  statCard5: {
    backgroundColor: COLORS.primary[100],
  },
  statHeader: {
    flexDirection: "column",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    marginBottom: responsiveSpacing(SPACING.xs),
    width: "100%",
  },
  statLabel: {
    marginBottom: 0,
    textAlign: "center",
  },
  statValue: {
    marginBottom: responsiveSpacing(SPACING.xs),
    textAlign: "center",
  },
  statFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    width: "100%",
  },
  statFooterSpacer: {
    height: responsiveScale(20), // Match footer height for consistent spacing
  },
  statFooterFirst: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  performanceContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  performanceNumbers: {
    gap: responsiveSpacing(SPACING.xs / 2),
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  performanceRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  performanceLabel: {
    fontSize: responsiveScale(11),
    textAlign: "center",
  },
  performanceChange: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    marginTop: responsiveSpacing(SPACING.xs),
  },
  performanceGraphIcon: {
    position: "absolute",
    bottom: responsiveSpacing(SPACING.sm),
    right: responsiveSpacing(SPACING.sm),
    opacity: 0.3,
  },
  section: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginBottom: responsiveSpacing(SPACING.lg),
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.md),
  },
  tasksContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  taskCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    overflow: "hidden",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    minHeight: responsiveScale(80),
  },
  taskContent: {
    flexDirection: "row",
  },
  priorityBar: {
    width: responsiveScale(4),
    alignSelf: "stretch",
  },
  priorityHigh: {
    backgroundColor: COLORS.error[500],
  },
  priorityMedium: {
    backgroundColor: COLORS.warning[500],
  },
  taskInfo: {
    flex: 1,
    padding: responsiveSpacing(SPACING.md),
  },
  taskMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  activitiesContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  activityItem: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.md),
  },
  activityDot: {
    width: responsiveScale(10),
    height: responsiveScale(10),
    borderRadius: responsiveScale(5),
    marginTop: responsiveSpacing(SPACING.sm),
  },
  activityContent: {
    flex: 1,
    padding: responsiveSpacing(SPACING.md),
    borderRadius: responsiveScale(12),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  activityTitle: {
    fontSize: responsiveScale(14),
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  activityDesc: {
    marginBottom: responsiveSpacing(SPACING.xs / 2),
  },
  activityTime: {
    fontSize: responsiveScale(11),
  },
  drawerHeader: {
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  drawerMenu: {
    gap: responsiveSpacing(SPACING.md),
    marginTop: responsiveSpacing(SPACING.lg),
  },
  drawerItem: {
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.neutral[200],
  },
  // Loading skeleton styles
  statsLoadingContainer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
  },
  statCardSkeleton: {
    backgroundColor: COLORS.neutral[100],
  },
  skeletonLine: {
    height: responsiveScale(12),
    backgroundColor: COLORS.neutral[200],
    borderRadius: responsiveScale(4),
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  skeletonLineLarge: {
    height: responsiveScale(24),
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  skeletonLineSmall: {
    height: responsiveScale(10),
    width: "60%",
  },
  sectionLoadingContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  taskCardSkeleton: {
    backgroundColor: COLORS.neutral[100],
    minHeight: responsiveScale(80),
  },
  leadsContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  leadCard: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(12),
    padding: responsiveSpacing(SPACING.md),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  leadCardSkeleton: {
    backgroundColor: COLORS.neutral[100],
    minHeight: responsiveScale(100),
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
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  activityDotSkeleton: {
    backgroundColor: COLORS.neutral[200],
  },
  activityContentSkeleton: {
    backgroundColor: COLORS.neutral[100],
  },
  emptyStateContainer: {
    paddingVertical: responsiveSpacing(SPACING.lg),
    alignItems: "center",
  },
  priorityLow: {
    backgroundColor: COLORS.primary[300],
  },
  errorContainer: {
    paddingVertical: responsiveSpacing(SPACING.lg),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    alignItems: "center",
    backgroundColor: COLORS.error[50],
    borderRadius: responsiveScale(12),
    marginVertical: responsiveSpacing(SPACING.sm),
  },
  startKnockingContainer: {
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    marginBottom: responsiveSpacing(SPACING.md),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: responsiveSpacing(PADDING.screenLarge),
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: responsiveScale(16),
    width: "100%",
    maxWidth: responsiveScale(400),
    padding: responsiveSpacing(SPACING.lg),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  modalCloseButton: {
    padding: responsiveSpacing(SPACING.xs),
  },
  modalDescription: {
    marginBottom: responsiveSpacing(SPACING.lg),
  },
  modalButtonsContainer: {
    gap: responsiveSpacing(SPACING.md),
  },
  modalButton: {
    marginBottom: 0,
  },
});
