import React from "react";
import {
  TextInput as RNTextInput,
  TextInputProps,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Text } from "@/components/ui";
import {
  COLORS,
  FONT_SIZE,
  LINE_HEIGHT,
  FONT_WEIGHT,
  SPACING,
  PADDING,
  BORDER_RADIUS,
  responsiveFontSize,
  responsiveSpacing,
  responsiveValue,
} from "@/constants";

export interface CustomTextInputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  size?: "small" | "medium" | "large";
  variant?: "outlined" | "underline" | "filled";
}

export const TextInput: React.FC<CustomTextInputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  size = "medium",
  variant = "underline",
  placeholderTextColor = COLORS.text.light,
  editable = true,
  ...props
}) => {
  // Responsive sizing
  const inputHeight = responsiveValue(
    { small: 40, medium: 48, large: 56 }[size],
    { small: 44, medium: 52, large: 60 }[size],
    { small: 42, medium: 50, large: 58 }[size]
  );

  const fontSize = responsiveFontSize(
    { small: FONT_SIZE.body2, medium: FONT_SIZE.input, large: FONT_SIZE.body1 }[
      size
    ]
  );

  const paddingHorizontal = responsiveSpacing(
    { small: PADDING.input, medium: PADDING.input, large: PADDING.inputLarge }[
      size
    ]
  );

  const getVariantStyles = () => {
    switch (variant) {
      case "outlined":
        return {
          borderWidth: 1,
          borderColor: error ? COLORS.error[500] : COLORS.border.medium,
          borderRadius: BORDER_RADIUS.input,
          backgroundColor: editable
            ? COLORS.background.primary
            : COLORS.neutral[50],
        };
      case "filled":
        return {
          borderWidth: 0,
          borderRadius: BORDER_RADIUS.input,
          backgroundColor: editable ? COLORS.neutral[50] : COLORS.neutral[100],
        };
      case "underline":
      default:
        return {
          borderWidth: 0,
          borderBottomWidth: 2,
          borderBottomColor: error ? COLORS.error[500] : COLORS.border.light,
          borderRadius: 0,
          backgroundColor: "transparent",
        };
    }
  };

  const containerStyles: ViewStyle[] = [
    styles.container,
    containerStyle,
  ].filter((style): style is ViewStyle => style !== undefined);

  const variantStyles = getVariantStyles();
  const inputStyles: TextStyle[] = [
    styles.input,
    variantStyles,
    {
      height: inputHeight,
      fontSize,
      paddingHorizontal,
      color: editable ? COLORS.text.primary : COLORS.text.disabled,
    },
    leftIcon
      ? { paddingLeft: responsiveSpacing(PADDING.input + 32) }
      : undefined,
    rightIcon
      ? { paddingRight: responsiveSpacing(PADDING.input + 32) }
      : undefined,
    error && variant === "underline" ? styles.inputError : undefined,
    error && (variant === "outlined" || variant === "filled")
      ? {
          borderColor: COLORS.error[500],
          borderBottomColor: COLORS.error[500],
        }
      : undefined,
    !editable ? styles.inputDisabled : undefined,
    inputStyle,
  ].filter((style): style is TextStyle => style !== undefined);

  return (
    <View style={containerStyles}>
      {label && (
        <Text
          variant="inputLabel"
          style={{ fontSize: responsiveFontSize(FONT_SIZE.inputLabel) }}
        >
          {label}
        </Text>
      )}
      <View style={styles.inputWrapper}>
        {leftIcon && (
          <View style={[styles.icon, styles.leftIcon]}>{leftIcon}</View>
        )}
        <RNTextInput
          style={inputStyles}
          placeholderTextColor={placeholderTextColor}
          editable={editable}
          {...props}
        />
        {rightIcon && (
          <View style={[styles.icon, styles.rightIcon]}>{rightIcon}</View>
        )}
      </View>
      {error && (
        <Text
          variant="inputHelper"
          color={COLORS.error[500]}
          style={{ fontSize: responsiveFontSize(FONT_SIZE.inputHelper) }}
        >
          {error}
        </Text>
      )}
      {helperText && !error && (
        <Text
          variant="inputHelper"
          color={COLORS.text.secondary}
          style={{ fontSize: responsiveFontSize(FONT_SIZE.inputHelper) }}
        >
          {helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    fontFamily: "System",
    fontWeight: FONT_WEIGHT.regular as TextStyle["fontWeight"],
    lineHeight: LINE_HEIGHT.input,
  },
  inputError: {
    borderBottomColor: COLORS.error[500],
  },
  inputDisabled: {
    opacity: 0.6,
  },
  icon: {
    position: "absolute",
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  leftIcon: {
    left: SPACING.sm,
  },
  rightIcon: {
    right: SPACING.sm,
  },
  errorText: {
    marginTop: SPACING.xs,
  },
  helperText: {
    marginTop: SPACING.xs,
  },
});
