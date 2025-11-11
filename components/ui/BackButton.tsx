import React from "react";
import { TouchableOpacity, StyleSheet, ViewStyle, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  COLORS,
  LAYOUT,
  BORDER_RADIUS,
  responsiveScale,
  responsiveSpacing,
  responsiveValue,
} from "@/constants";
import { Text } from "./Text";

export type BackButtonVariant = "default" | "ghost" | "text";
export type BackButtonSize = "small" | "medium" | "large";

export interface BackButtonProps {
  /** Function to call when pressed */
  onPress?: () => void;
  /** Button variant style */
  variant?: BackButtonVariant;
  /** Button size */
  size?: BackButtonSize;
  /** Show text label */
  showText?: boolean;
  /** Text label to display */
  text?: string;
  /** Show icon */
  showIcon?: boolean;
  /** Icon name */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Icon color */
  iconColor?: string;
  /** Text color */
  textColor?: string;
  /** Additional styles */
  style?: ViewStyle;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onPress,
  variant = "default",
  size = "medium",
  showText = false,
  text = "Back",
  showIcon = true,
  iconName = "arrow-back",
  iconColor,
  textColor,
  style,
}) => {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  // Responsive sizes
  const buttonSize = responsiveValue(
    {
      small: LAYOUT.buttonHeightSmall - 8,
      medium: LAYOUT.buttonHeightSmall,
      large: LAYOUT.buttonHeight,
    }[size],
    {
      small: LAYOUT.buttonHeightSmall - 4,
      medium: LAYOUT.buttonHeightSmall + 4,
      large: LAYOUT.buttonHeight + 4,
    }[size]
  );

  const iconSize = responsiveScale(
    {
      small: LAYOUT.iconSmall,
      medium: LAYOUT.iconMedium,
      large: LAYOUT.iconLarge,
    }[size]
  );

  // Get variant styles
  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case "ghost":
        return {
          backgroundColor: "rgba(0, 0, 0, 0.3)", // More transparent black
          borderRadius: BORDER_RADIUS.round,
        };
      case "text":
        return {
          backgroundColor: "transparent",
        };
      case "default":
      default:
        return {
          backgroundColor: COLORS.neutral[100],
          borderRadius: BORDER_RADIUS.round,
        };
    }
  };

  // Get icon color
  const getIconColor = (): string => {
    if (iconColor) return iconColor;
    if (variant === "ghost") return COLORS.white; // White icon for ghost variant with black transparent bg
    if (variant === "text") return COLORS.primary[500];
    return COLORS.text.primary;
  };

  // Get text color
  const getTextColor = (): string => {
    if (textColor) return textColor;
    if (variant === "text" || variant === "ghost") return COLORS.primary[500];
    return COLORS.text.primary;
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          height: buttonSize,
          minWidth: buttonSize,
          ...getVariantStyles(),
        },
        showText && styles.withText,
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {showIcon && (
          <Ionicons
            name={iconName}
            size={iconSize}
            color={getIconColor()}
            style={showText ? styles.iconWithText : styles.icon}
          />
        )}
        {showText && (
          <Text
            variant="body2"
            weight="medium"
            color={getTextColor()}
            style={styles.text}
          >
            {text}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: responsiveSpacing(8),
  },
  withText: {
    paddingHorizontal: responsiveSpacing(12),
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    // Icon only, no margin needed
  },
  iconWithText: {
    marginRight: responsiveSpacing(4),
  },
  text: {
    // Text styling handled by Text component
  },
});
