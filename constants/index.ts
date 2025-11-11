/**
 * Constants index file
 * This file exports all constants and responsive utilities for easy importing throughout the app
 */

// Export all simple constants (COLORS, FONT_SIZE, LINE_HEIGHT, FONT_FAMILY, FONT_WEIGHT, SPACING, PADDING, MARGIN, BORDER_RADIUS, LAYOUT)
export * from "./simple";

// Export responsive utility functions and helpers
export {
  responsiveScale,
  responsiveFontSize,
  responsiveSpacing,
  getDeviceType,
  getAccessibilityScale,
  isLandscape,
  isPortrait,
  getDeviceOrientation,
  isSmallPhone,
  isMediumPhone,
  isLargePhone,
  isIPad,
  isAndroidTablet,
  getDeviceAdjustment,
  responsiveValue,
  responsiveObject,
  getScreenDimensions,
  addDimensionListener,
  removeDimensionListener,
  DEVICE_INFO,
} from "./responsive";
