import React from "react";
import { View, StyleSheet, ViewStyle, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COLORS,
  MARGIN,
  PADDING,
  BORDER_RADIUS,
  LAYOUT,
  responsiveSpacing,
  responsiveValue,
} from "@/constants";
import { Text } from "./Text";
import { BackButton } from "./BackButton";

export interface AppHeaderProps {
  /** Function to call when back button is pressed */
  onBackPress?: () => void;
  /** Title to display in the header */
  title?: string;
  /** Subtitle text to display below the title */
  subtext?: string;
  /** Show back button (default: true) */
  showBackButton?: boolean;
  /** Custom back button icon name */
  backIconName?: keyof typeof Ionicons.glyphMap;
  /** Header background color */
  backgroundColor?: string;
  /** Header text color */
  textColor?: string;
  /** Right side component (optional) */
  rightComponent?: React.ReactNode;
  /** Right action button configuration */
  rightActionButton?: {
    iconName: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    backgroundColor?: string;
    iconColor?: string;
  };
  /** Additional styles for the header container */
  style?: ViewStyle;
  /** Additional styles for the navigation container */
  navigationStyle?: ViewStyle;
  /** Controls vertical padding density */
  density?: "default" | "compact";
}

/**
 * Flexible App Header Component
 *
 * A reusable header component that can be used across the entire app.
 * Supports customizable colors, back button, title, and right components.
 *
 * @example
 * // Basic header with back button
 * <AppHeader
 *   onBackPress={() => router.back()}
 *   title="Edit Profile"
 * />
 *
 * // Header without back button
 * <AppHeader
 *   title="Dashboard"
 *   showBackButton={false}
 * />
 *
 * // Custom colored header
 * <AppHeader
 *   title="Settings"
 *   backgroundColor={COLORS.primary[600]}
 *   textColor={COLORS.white}
 * />
 *
 * // Header with right component
 * <AppHeader
 *   title="Profile"
 *   rightComponent={<UserProfileButton />}
 * />
 *
 * // Header with right action button
 * <AppHeader
 *   title="My Listings"
 *   rightActionButton={{
 *     iconName: "add",
 *     onPress: () => router.push("/add-listing"),
 *     backgroundColor: COLORS.primary[300],
 *     iconColor: COLORS.white
 *   }}
 * />
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  onBackPress,
  title,
  subtext,
  showBackButton = true,
  backIconName = "arrow-back",
  backgroundColor = COLORS.primary[200],
  textColor = COLORS.white,
  rightComponent,
  rightActionButton,
  style,
  navigationStyle,
  density = "default",
}) => {
  const insets = useSafeAreaInsets();

  // Responsive padding
  const paddingTop = responsiveValue(
    insets.top + responsiveSpacing(MARGIN.sm),
    insets.top + responsiveSpacing(MARGIN.md),
    insets.top + responsiveSpacing(MARGIN.sm + 2)
  );

  const paddingBottom = responsiveValue(
    responsiveSpacing(MARGIN.md - 4),
    responsiveSpacing(MARGIN.md),
    responsiveSpacing(MARGIN.md - 2)
  );

  const horizontalPadding = responsiveSpacing(PADDING.screen);

  const compactTopReduction = responsiveSpacing(MARGIN.sm);
  const compactBottomReduction = responsiveSpacing(MARGIN.sm);

  const resolvedPaddingTop =
    density === "compact"
      ? Math.max(
          insets.top + responsiveSpacing(MARGIN.xs / 2),
          paddingTop - compactTopReduction
        )
      : paddingTop;
  const resolvedPaddingBottom =
    density === "compact"
      ? Math.max(
          responsiveSpacing(MARGIN.xs / 2),
          paddingBottom - compactBottomReduction
        )
      : paddingBottom;

  // Calculate border color based on background color
  const borderColor = getBorderColor(backgroundColor);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor,
          paddingTop: resolvedPaddingTop,
          paddingBottom: resolvedPaddingBottom,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        },
        style,
      ]}
    >
      {/* Top Navigation */}
      <View
        style={[
          styles.topNavigation,
          { paddingHorizontal: horizontalPadding },
          navigationStyle,
        ]}
      >
        {/* Left side - Back button or placeholder */}
        {showBackButton && onBackPress ? (
          <BackButton
            onPress={onBackPress}
            variant="ghost"
            size="medium"
            showText={false}
            showIcon={true}
            iconName={backIconName}
            iconColor={COLORS.white}
          />
        ) : (
          <View style={styles.placeholder} />
        )}

        {/* Center - Title and Subtext */}
        {(title || subtext) && (
          <View style={styles.titleContainer}>
            {title && (
              <Text
                variant="h5"
                weight="bold"
                color={textColor}
                align="center"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </Text>
            )}
            {subtext && (
              <Text
                variant="body2"
                color={textColor}
                align="center"
                style={styles.subtext}
              >
                {subtext}
              </Text>
            )}
          </View>
        )}

        {/* Right side - Custom component, action button, or placeholder */}
        {rightComponent ? (
          rightComponent
        ) : rightActionButton ? (
          <TouchableOpacity
            style={[
              styles.rightActionButton,
              {
                backgroundColor:
                  rightActionButton.backgroundColor || COLORS.primary[300],
                width: responsiveValue(
                  LAYOUT.buttonHeightSmall,
                  LAYOUT.buttonHeightSmall + 4,
                  LAYOUT.buttonHeightSmall + 2
                ),
                height: responsiveValue(
                  LAYOUT.buttonHeightSmall,
                  LAYOUT.buttonHeightSmall + 4,
                  LAYOUT.buttonHeightSmall + 2
                ),
              },
            ]}
            onPress={rightActionButton.onPress}
            activeOpacity={0.7}
          >
            <Ionicons
              name={rightActionButton.iconName}
              size={responsiveValue(
                LAYOUT.iconMedium,
                LAYOUT.iconMedium + 2,
                LAYOUT.iconMedium + 1
              )}
              color={rightActionButton.iconColor || COLORS.white}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
};

/**
 * Calculate border color based on background color
 * Returns a contrasting border color:
 * - For dark/colored backgrounds: white border with opacity
 * - For light backgrounds: dark border
 */
const getBorderColor = (bgColor: string): string => {
  // If it's a standard light background (white or very light), use default border
  if (
    bgColor === COLORS.white ||
    bgColor === "#FFFFFF" ||
    bgColor === COLORS.background.secondary
  ) {
    return COLORS.border.light;
  }

  // If background is already transparent, use transparent border
  if (
    bgColor === "transparent" ||
    (bgColor.includes("rgba") && bgColor.endsWith(", 0)"))
  ) {
    return "transparent";
  }

  // Helper function to check if a color is dark
  const isDarkColor = (r: number, g: number, b: number): boolean => {
    // Calculate luminance using relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5; // Dark if luminance < 50%
  };

  // For colored backgrounds, create a subtle variant of the same color
  if (bgColor.startsWith("#")) {
    const hex = bgColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Create a lighter variant of the background color with 30% opacity
    // For dark colors, lighten by adding white tint
    // For light colors, darken slightly
    if (isDarkColor(r, g, b)) {
      // Lighten the color slightly by blending with white (15% white + 85% original)
      const lightenFactor = 0.15;
      const newR = Math.min(255, Math.round(r + (255 - r) * lightenFactor));
      const newG = Math.min(255, Math.round(g + (255 - g) * lightenFactor));
      const newB = Math.min(255, Math.round(b + (255 - b) * lightenFactor));
      return `rgba(${newR}, ${newG}, ${newB}, 0.4)`; // Slightly lighter variant with 40% opacity
    } else {
      // For light colors, use slightly darker variant
      return `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(
        0,
        b - 20
      )}, 0.3)`;
    }
  }

  // For rgba colors, extract RGB and create subtle variant
  if (bgColor.startsWith("rgba")) {
    const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);

      // Create a lighter variant of the background color
      if (isDarkColor(r, g, b)) {
        // Lighten the color slightly by blending with white (15% white + 85% original)
        const lightenFactor = 0.15;
        const newR = Math.min(255, Math.round(r + (255 - r) * lightenFactor));
        const newG = Math.min(255, Math.round(g + (255 - g) * lightenFactor));
        const newB = Math.min(255, Math.round(b + (255 - b) * lightenFactor));
        return `rgba(${newR}, ${newG}, ${newB}, 0.4)`; // Slightly lighter variant with 40% opacity
      } else {
        // For light colors, use slightly darker variant
        return `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(
          0,
          b - 20
        )}, 0.3)`;
      }
    }
  }

  // Fallback to transparent
  return "transparent";
};

const styles = StyleSheet.create({
  header: {
    // Border styles are applied dynamically
  },
  topNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: responsiveSpacing(MARGIN.sm),
  },
  placeholder: {
    width: responsiveValue(40, 44, 42),
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: responsiveSpacing(MARGIN.sm),
  },
  subtext: {
    marginTop: responsiveSpacing(MARGIN.xs),
    opacity: 0.9,
  },
  rightActionButton: {
    borderRadius: BORDER_RADIUS.xl,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default AppHeader;
