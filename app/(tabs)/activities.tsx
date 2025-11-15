import React, { useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useMyActivitiesInfinite, Activity } from "@/lib/activityApi";
import { getActivityColors } from "@/lib/activityColors";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";
import { Text, H2, Body2, AppHeader } from "@/components/ui";

export default function ActivitiesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMyActivitiesInfinite({
    limit: 20,
  });

  // Flatten all pages into a single array
  const activities = useMemo(() => {
    return data?.pages.flatMap((page) => page.data) || [];
  }, [data]);

  const formatTimeAgo = useCallback((dateString?: string) => {
    if (!dateString) return "Unknown time";
    const now = new Date();
    const activityDate = new Date(dateString);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    }
    return "Just now";
  }, []);

  const getActivityTitle = useCallback((activity: Activity) => {
    // Handle different activity types
    if (activity.activityType === "ZONE_OPERATION") {
      const operation = activity.operationType?.toLowerCase() || "updated";
      return `Zone ${operation}`;
    }
    if (activity.activityType === "PROPERTY_OPERATION") {
      const operation = activity.operationType?.toLowerCase() || "updated";
      return `Property ${operation}`;
    }

    // Handle VISIT activities
    const titleMap: Record<string, string> = {
      LEAD_CREATED: "Lead created",
      APPOINTMENT_SET: "Appointment set",
      CALL_BACK: "Callback scheduled",
      FOLLOW_UP: "Follow-up completed",
      NOT_INTERESTED: "Visit completed",
      NO_ANSWER: "Visit completed",
    };
    return titleMap[activity.response || ""] || "Activity completed";
  }, []);

  const getActivityDescription = useCallback((activity: Activity) => {
    if (activity.activityType === "ZONE_OPERATION") {
      const zoneName = activity.zoneId?.name || "territory";
      return activity.notes || `Zone ${activity.operationType?.toLowerCase()} in ${zoneName}`;
    }
    if (activity.activityType === "PROPERTY_OPERATION") {
      const zoneName = activity.zoneId?.name || "territory";
      const address = activity.propertyId?.addressLine1 || "";
      
      // Parse notes to extract status changes
      if (activity.notes) {
        // Check if notes contain status change pattern: "status: "old" → "new""
        const statusMatch = activity.notes.match(/status:\s*"([^"]+)"\s*→\s*"([^"]+)"/);
        if (statusMatch) {
          const [, , newStatus] = statusMatch;
          // Format status for display (capitalize first letter, replace hyphens)
          const formattedStatus = newStatus
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          return `Property status changed to '${formattedStatus}' in ${zoneName}`;
        }
      }
      
      // Fallback to default message
      return activity.notes || (address ? `Property ${activity.operationType?.toLowerCase()} at ${address} in ${zoneName}` : `Property ${activity.operationType?.toLowerCase()} in ${zoneName}`);
    }

    // Handle VISIT activities
    const zoneName = activity.zoneId?.name || "territory";
    const address = activity.propertyId?.addressLine1 || "";
    return address
      ? `${getActivityTitle(activity)} at ${address} in ${zoneName}`
      : `${getActivityTitle(activity)} in ${zoneName}`;
  }, [getActivityTitle]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error("Error refreshing activities:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderActivityItem = useCallback(
    ({ item: activity }: { item: Activity }) => {
      const time = formatTimeAgo(activity.startedAt || activity.createdAt);
      
      console.log("📋 Activities Screen - Activity:", {
        activityId: activity._id,
        activityType: activity.activityType,
        operationType: activity.operationType,
        response: activity.response,
        notes: activity.notes?.substring(0, 50) + "...",
      });
      
      const colors = getActivityColors(activity);
      
      console.log("📋 Activities Screen - Colors assigned:", colors);

      return (
        <View style={styles.activityItem}>
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
              {getActivityTitle(activity)}
            </Text>
            <Body2 color={COLORS.text.secondary} style={styles.activityDesc}>
              {getActivityDescription(activity)}
            </Body2>
            <Body2 color={COLORS.text.light} style={styles.activityTime}>
              {time}
            </Body2>
          </View>
        </View>
      );
    },
    [formatTimeAgo, getActivityTitle, getActivityDescription]
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={COLORS.primary[500]} />
      </View>
    );
  }, [isFetchingNextPage]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Body2 color={COLORS.text.secondary}>No activities found</Body2>
      </View>
    );
  }, [isLoading]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const activityCount = activities.length;
  const subtext = activityCount > 0 ? `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}` : undefined;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primary[500]}
      />
      <AppHeader
        title="My Activities"
        subtext={subtext}
        showBackButton={true}
        onBackPress={handleBack}
        backgroundColor={COLORS.primary[500]}
        textColor={COLORS.white}
        density="compact"
      />
      {isError ? (
        <View style={styles.errorContainer}>
          <Body2 color={COLORS.error[500]}>
            Failed to load activities. Pull down to refresh.
          </Body2>
        </View>
      ) : (
        <FlatList
          data={activities}
          renderItem={renderActivityItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary[500]]}
              tintColor={COLORS.primary[500]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      {isLoading && activities.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  listContent: {
    padding: responsiveSpacing(PADDING.md),
    paddingBottom: responsiveSpacing(SPACING.xl),
  },
  activityItem: {
    flexDirection: "row",
    marginBottom: responsiveSpacing(SPACING.md),
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
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  activityDesc: {
    marginBottom: responsiveSpacing(SPACING.xs),
  },
  activityTime: {
    fontSize: responsiveScale(12),
  },
  footerLoader: {
    paddingVertical: responsiveSpacing(SPACING.md),
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: responsiveSpacing(SPACING.xl),
    alignItems: "center",
  },
  errorContainer: {
    paddingVertical: responsiveSpacing(SPACING.lg),
    paddingHorizontal: responsiveSpacing(SPACING.md),
    alignItems: "center",
    backgroundColor: COLORS.error[50],
    borderRadius: responsiveScale(12),
    margin: responsiveSpacing(SPACING.md),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

