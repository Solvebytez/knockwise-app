import React from "react";
import { Text as RNText, TextProps, TextStyle } from "react-native";
import {
  COLORS,
  FONT_SIZE,
  LINE_HEIGHT,
  FONT_WEIGHT,
  FONT_FAMILY,
  responsiveFontSize,
  responsiveValue,
} from "@/constants";

export type TextVariant =
  | "display1"
  | "display2"
  | "display3"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "body1"
  | "body2"
  | "body3"
  | "caption1"
  | "caption2"
  | "caption3"
  | "button"
  | "buttonSmall"
  | "input"
  | "inputLabel"
  | "inputHelper"
  | "navTitle"
  | "navItem"
  | "cardTitle"
  | "cardSubtitle"
  | "cardBody";

export type TextWeight =
  | "thin"
  | "light"
  | "regular"
  | "medium"
  | "semiBold"
  | "bold"
  | "extraBold"
  | "black";

export interface CustomTextProps extends Omit<TextProps, "style"> {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  size?: number; // Custom size (will be made responsive)
  lineHeight?: number; // Custom line height
  style?: TextStyle | TextStyle[];
}

export const Text: React.FC<CustomTextProps> = ({
  variant = "body1",
  weight = "regular",
  color,
  align = "left",
  size,
  lineHeight,
  style,
  children,
  ...props
}) => {
  // Get base font size from variant or use custom size
  const baseFontSize =
    size || FONT_SIZE[variant as keyof typeof FONT_SIZE] || FONT_SIZE.body1;

  // Apply responsive font size - maintains same visual size across devices
  const fontSize = responsiveFontSize(baseFontSize);

  // Get line height - use custom, variant-based, or calculated
  const baseLineHeight =
    lineHeight ||
    LINE_HEIGHT[variant as keyof typeof LINE_HEIGHT] ||
    fontSize * 1.5;
  const calculatedLineHeight = responsiveValue(
    baseLineHeight,
    baseLineHeight * 1.1, // Slightly larger for tablets
    baseLineHeight * 1.05 // Slightly larger for large phones
  );

  // Get font weight
  const fontWeight = FONT_WEIGHT[weight];

  // Determine text color
  const textColor = color || getDefaultColor(variant);

  const textStyles: TextStyle[] = [
    {
      fontSize,
      lineHeight: calculatedLineHeight,
      fontWeight,
      fontFamily: FONT_FAMILY.regular,
      color: textColor,
      textAlign: align,
    },
    style && (Array.isArray(style) ? style : [style]),
  ]
    .flat()
    .filter(Boolean) as TextStyle[];

  return (
    <RNText style={textStyles} {...props}>
      {children}
    </RNText>
  );
};

// Helper function to get default color based on variant
const getDefaultColor = (variant: TextVariant): string => {
  switch (variant) {
    case "display1":
    case "display2":
    case "display3":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
    case "cardTitle":
    case "navTitle":
      return COLORS.text.primary;
    case "body1":
    case "body2":
    case "body3":
    case "cardBody":
      return COLORS.text.primary;
    case "caption1":
    case "caption2":
    case "caption3":
    case "inputHelper":
      return COLORS.text.secondary;
    case "button":
    case "buttonSmall":
      return COLORS.white;
    default:
      return COLORS.text.primary;
  }
};

// Preset Text components for convenience
export const Display1: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="display1" {...props} />
);

export const Display2: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="display2" {...props} />
);

export const Display3: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="display3" {...props} />
);

export const H1: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h1" weight="bold" {...props} />
);

export const H2: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h2" weight="bold" {...props} />
);

export const H3: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h3" weight="semiBold" {...props} />
);

export const H4: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h4" weight="semiBold" {...props} />
);

export const H5: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h5" weight="medium" {...props} />
);

export const H6: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="h6" weight="medium" {...props} />
);

export const Body1: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="body1" {...props} />
);

export const Body2: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="body2" {...props} />
);

export const Body3: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="body3" {...props} />
);

export const Caption: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="caption1" {...props} />
);

export const Caption2: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="caption2" {...props} />
);

export const Caption3: React.FC<Omit<CustomTextProps, "variant">> = (props) => (
  <Text variant="caption3" {...props} />
);
