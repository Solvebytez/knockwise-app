// Simple constants without runtime calculations to avoid import issues

export const COLORS = {
  // Primary Brand Colors
  primary: {
    50: "#E8F0FE", // Lightest blue
    100: "#C4DDFD", // Light blue
    200: "#9CC5FB", // Medium light blue
    300: "#6BA4F8", // Medium blue
    500: "#1447E6", // Default blue
    600: "#0F38B8", // Darker blue
  },

  // Basic Colors
  black: "#000000",
  white: "#ffffff",

  background: {
    primary: "#ffffff",
    secondary: "#f8fafc",
    light: "#f1f5f9",
    dark: "#0f172a",
  },

  text: {
    primary: "#1e293b",
    secondary: "#64748b",
    light: "#94a3b8",
    disabled: "#9ca3af",
    inverse: "#ffffff",
  },

  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  border: {
    light: "#e5e7eb",
    medium: "#d1d5db",
    dark: "#9ca3af",
  },

  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },

  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },

  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  info: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
  },

  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7c3aed",
    800: "#6b21a8",
    900: "#581c87",
  },

  // Button Colors
  button: {
    primary: "#e7000b", // Default button background color
  },
};

export const FONT_SIZE = {
  // Display sizes
  display1: 48,
  display2: 40,
  display3: 32,

  // Heading sizes
  h1: 28,
  h2: 24,
  h3: 20,
  h4: 18,
  h5: 16,
  h6: 14,

  // Body text sizes
  body1: 16,
  body2: 14,
  body3: 12,

  // Caption sizes
  caption1: 12,
  caption2: 10,
  caption3: 9,

  // Button text sizes
  button: 16,
  buttonSmall: 14,

  // Input text sizes
  input: 16,
  inputLabel: 14,
  inputHelper: 12,

  // Navigation sizes
  navTitle: 18,
  navItem: 16,

  // Card sizes
  cardTitle: 18,
  cardSubtitle: 14,
  cardBody: 16,
};

export const LINE_HEIGHT = {
  // Display line heights
  display1: 58,
  display2: 48,
  display3: 38,

  // Heading line heights
  h1: 34,
  h2: 29,
  h3: 24,
  h4: 22,
  h5: 19,
  h6: 17,

  // Body line heights
  body1: 22,
  body2: 20,
  body3: 18,

  // Caption line heights
  caption1: 18,
  caption2: 15,
  caption3: 13,

  // Button line heights
  button: 19,
  buttonSmall: 17,

  // Input line heights
  input: 22,
  inputLabel: 20,
  inputHelper: 18,

  // Navigation line heights
  navTitle: 24,
  navItem: 20,

  // Card line heights
  cardTitle: 24,
  cardSubtitle: 20,
  cardBody: 24,
};

export const FONT_FAMILY = {
  regular: "System",
  medium: "System",
  semiBold: "System",
  bold: "System",
  light: "System",
  thin: "System",
};

export const FONT_WEIGHT = {
  thin: "100",
  light: "300",
  regular: "400",
  medium: "500",
  semiBold: "600",
  bold: "700",
  extraBold: "800",
  black: "900",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  xxs: 2,
  micro: 1,
};

export const PADDING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  screen: 16,
  screenLarge: 24,
  card: 16,
  cardLarge: 24,
  cardCompact: 8,
  button: 8,
  buttonLarge: 16,
  buttonSmall: 4,
  input: 8,
  inputLarge: 16,
  modal: 24,
  modalHeader: 16,
  modalBody: 24,
  modalFooter: 16,
  bottomSheet: 24,
  bottomSheetHandle: 8,
};

export const MARGIN = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  screen: 16,
  screenLarge: 24,
  card: 8,
  cardLarge: 16,
  button: 8,
  buttonGroup: 4,
  formField: 16,
  formSection: 24,
  listItem: 8,
  listSection: 16,
  navItem: 8,
  navSection: 16,
};

export const BORDER_RADIUS = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  round: 50,
  pill: 999,
  full: 999,
  card: 8,
  cardLarge: 16,
  button: 8,
  buttonLarge: 16,
  input: 8,
  inputLarge: 16,
  modal: 16,
  bottomSheet: 16,
};

export const LAYOUT = {
  screenPadding: 16,
  screenPaddingLarge: 24,
  headerHeight: 56,
  headerPadding: 16,
  tabBarHeight: 80,
  tabBarPadding: 8,
  cardMinHeight: 80,
  cardMaxWidth: 400,
  buttonHeight: 48,
  buttonHeightSmall: 40,
  buttonHeightLarge: 56,
  inputHeight: 48,
  inputHeightSmall: 40,
  inputHeightLarge: 56,
  avatarSmall: 32,
  avatarMedium: 48,
  avatarLarge: 64,
  avatarXLarge: 96,
  iconSmall: 16,
  iconMedium: 24,
  iconLarge: 32,
  iconXLarge: 48,
};


