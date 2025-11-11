import React from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "expo-router";
import { apiInstance } from "@/lib/apiInstance";
import { COLORS, SPACING, PADDING, responsiveSpacing, responsiveScale } from "@/constants";
import { Text, H2, H3, Body1, Body2 } from "@/components/ui";
import { AppHeader } from "@/components/ui";

export default function ProfileScreen() {
  const { user: authUser, logout, isLoggingOut } = useAuthStore();
  const router = useRouter();

  // Fetch detailed user profile data
  const { data: profileData, isLoading } = useQuery({
    queryKey: ["userProfile"],
    queryFn: async () => {
      const response = await apiInstance.get("/users/my-profile");
      console.log("📥 Profile API Response:", JSON.stringify(response.data, null, 2));
      console.log("📥 Profile Data:", response.data?.data);
      return response.data;
    },
    refetchOnWindowFocus: false,
  });

  // Extract user data from nested structure: profileData.data.user or use authUser
  const userData = profileData?.data?.user || authUser;
  const userStatus = userData?.status || "ACTIVE";

  // Log user data for debugging
  console.log("👤 Profile Screen - User Data:", {
    profileData,
    userData,
    authUser,
    userStatus,
  });

  const handleLogout = async () => {
    try {
    await logout();
      // Small delay to ensure state updates are processed before redirect
      await new Promise((resolve) => setTimeout(resolve, 200));
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      // Still redirect even if there's an error
    router.replace("/login");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7684FF" />
      <AppHeader
        title="My Profile"
        showBackButton={false}
        backgroundColor="#7684FF"
        textColor={COLORS.white}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Section - Purple Background */}
        <View style={styles.profileHeader}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.white} />
            </View>
          ) : (
            <>
              <View style={styles.profileImageContainer}>
                {userData?.profilePicture || userData?.avatar ? (
                  <Image
                    source={{ uri: userData.profilePicture || userData.avatar }}
                    style={styles.profileImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profileInitials}>
                      {(userData?.name || "Agent")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.profileInfo}>
                <Text weight="bold" style={styles.profileName}>
                  {userData?.name || "Agent"}
                </Text>
                <Body2 color={COLORS.white} style={styles.userEmail}>
                  {userData?.email || ""}
                </Body2>
                <View style={styles.badgesContainer}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.badgeText}>{userData?.role || "AGENT"}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.badgeText}>{userStatus}</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Menu List Section - White Background */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, styles.menuIconBlue]}>
              <Text style={styles.menuIconText}>✏️</Text>
            </View>
            <Text weight="medium" style={styles.menuText}>
              Edit Profile
            </Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, styles.menuIconYellow]}>
              <Text style={styles.menuIconText}>🔒</Text>
            </View>
            <Text weight="medium" style={styles.menuText}>
              Change Password
            </Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, styles.menuIconGreen]}>
              <Text style={styles.menuIconText}>❓</Text>
            </View>
            <Text weight="medium" style={styles.menuText}>
              FAQ
            </Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, styles.menuIconPurple]}>
              <Text style={styles.menuIconText}>ℹ️</Text>
            </View>
            <Text weight="medium" style={styles.menuText}>
              About App
            </Text>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            <View style={[styles.menuIcon, styles.menuIconRed]}>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color={COLORS.error[500]} />
              ) : (
              <Text style={styles.menuIconText}>🚪</Text>
              )}
            </View>
            <Text weight="medium" style={[styles.menuText, isLoggingOut && styles.disabledText]}>
              {isLoggingOut ? "Logging out..." : "Logout"}
            </Text>
            {!isLoggingOut && <Text style={styles.arrowIcon}>›</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    flexGrow: 1,
  },
  profileHeader: {
    backgroundColor: "#7684FF",
    paddingTop: responsiveSpacing(SPACING.xl),
    paddingBottom: responsiveSpacing(SPACING.lg),
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    alignItems: "center",
    borderBottomLeftRadius: responsiveScale(30),
    borderBottomRightRadius: responsiveScale(30),
  },
  profileImageContainer: {
    width: responsiveScale(120),
    height: responsiveScale(120),
    borderRadius: responsiveScale(20),
    overflow: "hidden",
    marginBottom: responsiveSpacing(SPACING.md),
    backgroundColor: COLORS.white,
    padding: responsiveScale(4),
  },
  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: responsiveScale(16),
  },
  profilePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.primary[500],
    justifyContent: "center",
    alignItems: "center",
    borderRadius: responsiveScale(16),
  },
  profileInitials: {
    color: COLORS.white,
    fontSize: responsiveScale(36),
    fontWeight: "bold",
    lineHeight: responsiveScale(36),
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  profileInfo: {
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs),
  },
  profileName: {
    fontSize: responsiveScale(24),
    color: COLORS.white,
    lineHeight: responsiveScale(32),
    includeFontPadding: false,
    paddingBottom: responsiveSpacing(SPACING.xs / 2),
  },
  userEmail: {
    opacity: 0.9,
    marginTop: responsiveSpacing(SPACING.xs / 2),
  },
  badgesContainer: {
    flexDirection: "row",
    gap: responsiveSpacing(SPACING.sm),
    marginTop: responsiveSpacing(SPACING.md),
  },
  roleBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(20),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  statusBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: responsiveSpacing(SPACING.md),
    paddingVertical: responsiveSpacing(SPACING.sm),
    borderRadius: responsiveScale(20),
    flexDirection: "row",
    alignItems: "center",
    gap: responsiveSpacing(SPACING.xs / 2),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  statusDot: {
    width: responsiveScale(8),
    height: responsiveScale(8),
    borderRadius: responsiveScale(4),
    backgroundColor: COLORS.success[400],
  },
  badgeText: {
    color: COLORS.white,
    fontSize: responsiveScale(12),
    fontWeight: "600",
  },
  menuSection: {
    backgroundColor: COLORS.white,
    marginTop: responsiveSpacing(SPACING.xs),
    paddingTop: responsiveSpacing(SPACING.md),
    paddingBottom: responsiveSpacing(SPACING.xl),
    borderTopLeftRadius: responsiveScale(20),
    borderTopRightRadius: responsiveScale(20),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: responsiveSpacing(PADDING.screenLarge),
    paddingVertical: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  menuIcon: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    borderRadius: responsiveScale(10),
    justifyContent: "center",
    alignItems: "center",
  },
  menuIconYellow: {
    backgroundColor: COLORS.warning[100],
  },
  menuIconGreen: {
    backgroundColor: COLORS.success[100],
  },
  menuIconRed: {
    backgroundColor: COLORS.error[100],
  },
  menuIconBlue: {
    backgroundColor: COLORS.info[100],
  },
  menuIconPurple: {
    backgroundColor: COLORS.purple[100],
  },
  menuIconGray: {
    backgroundColor: COLORS.neutral[100],
  },
  menuIconText: {
    fontSize: responsiveScale(20),
  },
  menuText: {
    flex: 1,
    fontSize: responsiveScale(16),
    color: COLORS.text.primary,
  },
  arrowIcon: {
    fontSize: responsiveScale(24),
    color: COLORS.text.light,
    fontWeight: "300",
  },
  disabledText: {
    opacity: 0.6,
  },
});
