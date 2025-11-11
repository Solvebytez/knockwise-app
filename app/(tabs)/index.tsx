import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { apiInstance } from "@/lib/apiInstance";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H2, H3, Body2 } from "@/components/ui";
import { SideDrawer } from "@/components/ui/SideDrawer";

export default function HomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Fetch territories data
  const { data: territoriesData, isLoading } = useQuery({
    queryKey: ["myTerritories"],
    queryFn: async () => {
      const response = await apiInstance.get("/users/my-territories", {
        headers: {
          Cookie: await SecureStore.getItemAsync("csrfCookie"),
        },
      });
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  const territories = territoriesData?.data?.territories || [];
  const summary = territoriesData?.data?.summary || {};

  // Calculate stats from real data
  const agentStats = {
    todayTasks: 12,
    completedTasks: 8,
    pendingTasks: 4,
    performance: summary.completionPercentage || 85,
    territories: territories.length,
    teamMembers: 5,
    routes: 2,
  };

  // Mock data for schedule and activities
  const upcomingTasks = [
    {
      id: 1,
      title: "Downtown District Visit",
      time: "9:00 AM - 12:00 PM",
      houses: 30,
      priority: "high",
    },
    {
      id: 2,
      title: "Westside Residential Area",
      time: "2:00 PM - 5:00 PM",
      houses: 25,
      priority: "medium",
    },
  ];

  const recentActivities = [
    {
      id: 1,
      type: "task_completed",
      title: "Completed territory visit",
      description: "Finished knocking on 25 houses in Downtown District",
      time: "2 hours ago",
      status: "completed",
    },
    {
      id: 2,
      type: "new_assignment",
      title: "New territory assigned",
      description: "Assigned to Westside Residential Area",
      time: "4 hours ago",
      status: "pending",
    },
    {
      id: 3,
      type: "route_optimized",
      title: "Route optimized",
      description: "New optimized route available for tomorrow",
      time: "6 hours ago",
      status: "completed",
    },
  ];

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

  const menuItems = useMemo(
    () => [
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
            <TouchableOpacity style={styles.iconButton} onPress={handleOpenDrawer}>
              <Text style={styles.iconText}>☰</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton}>
              <View style={styles.bellContainer}>
                <Text style={styles.iconText}>🔔</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>1</Text>
                </View>
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

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsScrollContent}
            style={styles.statsScrollView}
          >
            <View style={[styles.statCard, styles.statCard1]}>
              <Text
                variant="body2"
                color={COLORS.text.secondary}
                style={styles.statLabel}
              >
                Today&apos;s Tasks
              </Text>
              <Text
                variant="h1"
                color={COLORS.text.primary}
                weight="bold"
                style={styles.statValue}
              >
                {agentStats.todayTasks}
              </Text>
              <View style={styles.statFooterFirst}>
                <Body2 color={COLORS.success[600]}>
                  {agentStats.completedTasks} done
                </Body2>
                <Body2 color={COLORS.text.secondary}>
                  {agentStats.pendingTasks} pending
                </Body2>
              </View>
            </View>

            <View style={[styles.statCard, styles.statCard2]}>
              <Text
                variant="body2"
                color={COLORS.text.secondary}
                style={styles.statLabel}
              >
                Performance
              </Text>
              <Text
                variant="h1"
                color={COLORS.text.primary}
                weight="bold"
                style={styles.statValue}
              >
                {agentStats.performance}%
              </Text>
              <View style={styles.statFooter}>
                <Body2 color={COLORS.success[600]}>+2.1% this week</Body2>
              </View>
            </View>

            <View style={[styles.statCard, styles.statCard3]}>
              <Text
                variant="body2"
                color={COLORS.text.secondary}
                style={styles.statLabel}
              >
                Territories
              </Text>
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
            </View>

            <View style={[styles.statCard, styles.statCard4]}>
              <Text
                variant="body2"
                color={COLORS.text.secondary}
                style={styles.statLabel}
              >
                Team
              </Text>
              <Text
                variant="h1"
                color={COLORS.text.primary}
                weight="bold"
                style={styles.statValue}
              >
                {agentStats.teamMembers}
              </Text>
              <View style={styles.statFooter}>
                <Body2 color={COLORS.text.secondary}>Members</Body2>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Today's Schedule Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <H3>Today&apos;s Schedule</H3>
            <TouchableOpacity>
              <Body2 color={COLORS.primary[500]}>View All</Body2>
            </TouchableOpacity>
          </View>
          <View style={styles.tasksContainer}>
            {upcomingTasks.map((task) => (
              <View key={task.id} style={styles.taskCard}>
                <View style={styles.taskContent}>
                  <View
                    style={[
                      styles.priorityBar,
                      task.priority === "high"
                        ? styles.priorityHigh
                        : styles.priorityMedium,
                    ]}
                  />
                  <View style={styles.taskInfo}>
                    <Text
                      variant="body1"
                      weight="semiBold"
                      color={COLORS.text.primary}
                      style={{ marginBottom: responsiveSpacing(SPACING.xs) }}
                    >
                      {task.title}
                    </Text>
                    <View style={styles.taskMeta}>
                      <Body2 color={COLORS.text.secondary}>{task.time}</Body2>
                      <Body2 color={COLORS.text.secondary}> • </Body2>
                      <Body2 color={COLORS.text.secondary}>
                        {task.houses} houses
                      </Body2>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Activities Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <H3>Recent Activities</H3>
            <TouchableOpacity>
              <Body2 color={COLORS.primary[500]}>See All</Body2>
            </TouchableOpacity>
          </View>
          <View style={styles.activitiesContainer}>
            {recentActivities.map((activity) => (
              <View key={activity.id} style={styles.activityItem}>
                <View
                  style={[
                    styles.activityDot,
                    activity.status === "completed"
                      ? styles.dotCompleted
                      : styles.dotPending,
                  ]}
                />
                <View
                  style={[
                    styles.activityContent,
                    activity.status === "completed"
                      ? styles.activityContentCompleted
                      : styles.activityContentPending,
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
                  <Body2 color={COLORS.text.light} style={styles.activityTime}>
                    {activity.time}
                  </Body2>
                </View>
              </View>
            ))}
          </View>
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
              <Text
                variant="body1"
                weight="medium"
                color={COLORS.text.primary}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SideDrawer>
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
    width: responsiveScale(100),
    height: responsiveScale(32),
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
    paddingHorizontal: responsiveSpacing(SPACING.lg),
    paddingBottom: responsiveSpacing(SPACING.lg + SPACING.xs),
    borderRadius: responsiveScale(16),
    width: responsiveScale(140),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  statCard4: {
    backgroundColor: COLORS.purple[100],
  },
  statLabel: {
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  statValue: {
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  statFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
  },
  statFooterFirst: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: responsiveSpacing(SPACING.xs / 2),
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
  dotCompleted: {
    backgroundColor: COLORS.success[500],
  },
  dotPending: {
    backgroundColor: COLORS.primary[500],
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
  activityContentCompleted: {
    backgroundColor: COLORS.success[50],
  },
  activityContentPending: {
    backgroundColor: COLORS.primary[50],
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
});
