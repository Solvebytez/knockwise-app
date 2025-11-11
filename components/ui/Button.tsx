import React from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import {
  COLORS,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  PADDING,
  BORDER_RADIUS,
  LAYOUT,
  responsiveFontSize,
  responsiveSpacing,
  responsiveValue,
  responsiveScale,
} from "@/constants";
import { Text } from "./Text";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends Omit<TouchableOpacityProps, "style"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "medium",
  title,
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  containerStyle,
  textStyle,
  onPress,
  ...props
}) => {
  // Responsive button height
  const buttonHeight = responsiveValue(
    {
      small: LAYOUT.buttonHeightSmall,
      medium: LAYOUT.buttonHeight,
      large: LAYOUT.buttonHeightLarge,
    }[size],
    {
      small: LAYOUT.buttonHeightSmall + 4,
      medium: LAYOUT.buttonHeight + 4,
      large: LAYOUT.buttonHeightLarge + 4,
    }[size],
    {
      small: LAYOUT.buttonHeightSmall + 2,
      medium: LAYOUT.buttonHeight + 2,
      large: LAYOUT.buttonHeightLarge + 2,
    }[size]
  );

  // Responsive padding
  const horizontalPadding = responsiveSpacing(
    {
      small: PADDING.button,
      medium: PADDING.button * 2,
      large: PADDING.buttonLarge * 2,
    }[size]
  );

  // Responsive font size
  const fontSize = responsiveFontSize(
    size === "small" ? FONT_SIZE.buttonSmall : FONT_SIZE.button
  );

  // Responsive border radius
  const borderRadius = responsiveScale(
    size === "large" ? BORDER_RADIUS.buttonLarge : BORDER_RADIUS.button
  );

  const isDisabled = disabled || loading;

  // Get variant styles
  const getVariantStyles = (): {
    backgroundColor: string;
    borderColor?: string;
    borderWidth?: number;
  } => {
    if (isDisabled) {
      return {
        backgroundColor: COLORS.neutral[300],
      };
    }

    switch (variant) {
      case "primary":
        return {
          backgroundColor: COLORS.button.primary,
        };
      case "secondary":
        return {
          backgroundColor: COLORS.neutral[600],
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderColor: COLORS.primary[500],
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
        };
      case "danger":
        return {
          backgroundColor: COLORS.error[500],
        };
      case "success":
        return {
          backgroundColor: COLORS.success[500],
        };
      default:
        return {
          backgroundColor: COLORS.primary[500],
        };
    }
  };

  // Get text color based on variant
  const getTextColor = (): string => {
    if (isDisabled) {
      return COLORS.text.disabled;
    }

    switch (variant) {
      case "outline":
        return COLORS.primary[500];
      case "ghost":
        return COLORS.primary[500];
      default:
        return COLORS.white;
    }
  };

  const buttonStyles: ViewStyle[] = [
    styles.button,
    {
      height: buttonHeight,
      paddingHorizontal: horizontalPadding,
      borderRadius,
      ...getVariantStyles(),
    },
    fullWidth ? styles.fullWidth : undefined,
    isDisabled ? styles.disabled : undefined,
    containerStyle,
  ].filter((style): style is ViewStyle => style !== undefined);

  const buttonTextStyles: TextStyle[] = [
    {
      fontSize,
      fontWeight: FONT_WEIGHT.semiBold as TextStyle["fontWeight"],
      color: getTextColor(),
    },
    textStyle,
  ].filter((style): style is TextStyle => style !== undefined);

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      {...props}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={getTextColor()}
            style={styles.loader}
          />
        ) : (
          <>
            {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
            <Text
              variant={size === "small" ? "buttonSmall" : "button"}
              weight="semiBold"
              color={getTextColor()}
              style={buttonTextStyles}
            >
              {title}
            </Text>
            {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loader: {
    marginRight: 0,
  },
  leftIcon: {
    marginRight: SPACING.xs,
  },
  rightIcon: {
    marginLeft: SPACING.xs,
  },
});

// Preset Button components for convenience
export const PrimaryButton: React.FC<Omit<ButtonProps, "variant">> = (
  props
) => <Button variant="primary" {...props} />;

export const SecondaryButton: React.FC<Omit<ButtonProps, "variant">> = (
  props
) => <Button variant="secondary" {...props} />;

export const OutlineButton: React.FC<Omit<ButtonProps, "variant">> = (
  props
) => <Button variant="outline" {...props} />;

export const GhostButton: React.FC<Omit<ButtonProps, "variant">> = (props) => (
  <Button variant="ghost" {...props} />
);

export const DangerButton: React.FC<Omit<ButtonProps, "variant">> = (props) => (
  <Button variant="danger" {...props} />
);

export const SuccessButton: React.FC<Omit<ButtonProps, "variant">> = (
  props
) => <Button variant="success" {...props} />;
