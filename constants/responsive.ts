import { Dimensions, PixelRatio, Platform, ScaledSize } from 'react-native';

// Lazy functions to avoid import-time execution
const getScreenDimensionsInternal = () => {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  return { SCREEN_WIDTH, SCREEN_HEIGHT };
};

// Base dimensions for design (using iPhone 14 Pro as reference)
const baseWidth = 393;
const baseHeight = 852;

// Responsive scaling function
export const responsiveScale = (size: number): number => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  const widthScale = SCREEN_WIDTH / baseWidth;
  const heightScale = SCREEN_HEIGHT / baseHeight;
  const newSize = size * Math.min(widthScale, heightScale);

  // Ensure minimum sizes for usability
  if (size >= 48) {
    return Math.max(newSize, 40); // Large elements
  } else if (size >= 32) {
    return Math.max(newSize, 28); // Medium elements
  } else if (size >= 16) {
    return Math.max(newSize, 16); // Small elements
  } else if (size >= 8) {
    return Math.max(newSize, 8); // Tiny elements
  } else {
    return Math.max(newSize, 4); // Micro elements
  }
};

// Responsive font size function
export const responsiveFontSize = (size: number): number => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  const widthScale = SCREEN_WIDTH / baseWidth;
  const heightScale = SCREEN_HEIGHT / baseHeight;
  const newSize = size * Math.min(widthScale, heightScale);

  // Ensure minimum readable size
  if (Platform.OS === 'ios') {
    return Math.max(newSize, 12); // iOS minimum
  } else {
    return Math.max(newSize, 14); // Android minimum
  }
};

// Responsive spacing function
export const responsiveSpacing = (size: number): number => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  const widthScale = SCREEN_WIDTH / baseWidth;
  const heightScale = SCREEN_HEIGHT / baseHeight;
  const newSize = size * Math.min(widthScale, heightScale);

  // Ensure minimum spacing for touch targets
  if (size >= 16) {
    return Math.max(newSize, 12); // Large spacing
  } else if (size >= 8) {
    return Math.max(newSize, 8); // Medium spacing
  } else {
    return Math.max(newSize, 4); // Small spacing
  }
};

// Get current device type
export const getDeviceType = (): 'phone' | 'tablet' => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = SCREEN_WIDTH * pixelDensity;
  const adjustedHeight = SCREEN_HEIGHT * pixelDensity;

  // Consider device as tablet if width or height is large enough
  if (adjustedWidth >= 1200 || adjustedHeight >= 1200) {
    return 'tablet';
  }
  return 'phone';
};

// Get current accessibility setting
export const getAccessibilityScale = (): number => {
  return PixelRatio.getFontScale();
};

// Check if device is in landscape mode
export const isLandscape = (): boolean => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  return SCREEN_WIDTH > SCREEN_HEIGHT;
};

// Check if device is in portrait mode
export const isPortrait = (): boolean => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  return SCREEN_HEIGHT > SCREEN_WIDTH;
};

// Get device orientation
export const getDeviceOrientation = (): 'portrait' | 'landscape' => {
  return isLandscape() ? 'landscape' : 'portrait';
};

// Check if device is a small phone
export const isSmallPhone = (): boolean => {
  const { SCREEN_WIDTH } = getScreenDimensionsInternal();
  return SCREEN_WIDTH < 375; // iPhone SE, small Android phones
};

// Check if device is a large phone
export const isLargePhone = (): boolean => {
  const { SCREEN_WIDTH } = getScreenDimensionsInternal();
  return SCREEN_WIDTH >= 414; // iPhone Pro Max, large Android phones
};

// Check if device is a medium phone
export const isMediumPhone = (): boolean => {
  const { SCREEN_WIDTH } = getScreenDimensionsInternal();
  return SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414; // Standard iPhones, medium Android
};

// Check if device is an iPad
export const isIPad = (): boolean => {
  return Platform.OS === 'ios' && getDeviceType() === 'tablet';
};

// Check if device is an Android tablet
export const isAndroidTablet = (): boolean => {
  return Platform.OS === 'android' && getDeviceType() === 'tablet';
};

// Get device-specific adjustments
export const getDeviceAdjustment = (): number => {
  const deviceType = getDeviceType();
  const platform = Platform.OS;

  if (deviceType === 'tablet') {
    return 1.15; // 15% larger for tablets
  } else if (platform === 'ios') {
    return 1.0; // No adjustment for iOS phones
  } else {
    return 1.05; // 5% larger for Android phones
  }
};

// Responsive value function that applies device adjustments
export const responsiveValue = <T>(
  phone: T,
  tablet: T,
  largePhone?: T
): T => {
  const deviceType = getDeviceType();

  if (deviceType === 'tablet') {
    return tablet;
  } else if (isLargePhone() && largePhone !== undefined) {
    return largePhone;
  } else {
    return phone;
  }
};

// Responsive object function
export const responsiveObject = <T extends Record<string, any>>(
  phone: T,
  tablet: T,
  largePhone?: T
): T => {
  const deviceType = getDeviceType();

  if (deviceType === 'tablet') {
    return { ...phone, ...tablet };
  } else if (isLargePhone() && largePhone !== undefined) {
    return largePhone;
  } else {
    return phone;
  }
};

// Get screen dimensions
export const getScreenDimensions = () => {
  const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
  const widthScale = SCREEN_WIDTH / baseWidth;
  const heightScale = SCREEN_HEIGHT / baseHeight;
  return {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    scale: Math.min(widthScale, heightScale),
    isLandscape: isLandscape(),
    isPortrait: isPortrait(),
  };
};

// Listen for dimension changes (useful for rotation)
export const addDimensionListener = (
  callback: (dimensions: { window: ScaledSize; screen: ScaledSize }) => void
) => {
  return Dimensions.addEventListener('change', callback);
};

// Remove dimension listener
export const removeDimensionListener = (subscription: any) => {
  if (subscription?.remove) {
    subscription.remove();
  }
};

// Device information object
export const DEVICE_INFO = {
  // Screen dimensions
  get screenWidth() {
    return getScreenDimensionsInternal().SCREEN_WIDTH;
  },
  get screenHeight() {
    return getScreenDimensionsInternal().SCREEN_HEIGHT;
  },

  // Device type
  get deviceType() {
    return getDeviceType();
  },
  get isPhone() {
    return getDeviceType() === 'phone';
  },
  get isTablet() {
    return getDeviceType() === 'tablet';
  },

  // Platform
  platform: Platform.OS,
  isIOS: Platform.OS === 'ios',
  isAndroid: Platform.OS === 'android',

  // Phone sizes
  get isSmallPhone() {
    return isSmallPhone();
  },
  get isMediumPhone() {
    return isMediumPhone();
  },
  get isLargePhone() {
    return isLargePhone();
  },

  // Tablet types
  get isIPad() {
    return isIPad();
  },
  get isAndroidTablet() {
    return isAndroidTablet();
  },

  // Orientation
  get orientation() {
    return getDeviceOrientation();
  },
  get isLandscape() {
    return isLandscape();
  },
  get isPortrait() {
    return isPortrait();
  },

  // Scaling
  get scale() {
    const { SCREEN_WIDTH, SCREEN_HEIGHT } = getScreenDimensionsInternal();
    const widthScale = SCREEN_WIDTH / baseWidth;
    const heightScale = SCREEN_HEIGHT / baseHeight;
    return Math.min(widthScale, heightScale);
  },
  get widthScale() {
    const { SCREEN_WIDTH } = getScreenDimensionsInternal();
    return SCREEN_WIDTH / baseWidth;
  },
  get heightScale() {
    const { SCREEN_HEIGHT } = getScreenDimensionsInternal();
    return SCREEN_HEIGHT / baseHeight;
  },

  // Accessibility
  get accessibilityScale() {
    return getAccessibilityScale();
  },

  // Device adjustments
  get deviceAdjustment() {
    return getDeviceAdjustment();
  },

  // Pixel density
  get pixelRatio() {
    return PixelRatio.get();
  },
} as const;















