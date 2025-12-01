export const getGoogleMapsApiKey = (): string | undefined => {
  if (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default;
    const expoConfig = Constants?.expoConfig as any;
    return (
      expoConfig?.android?.config?.googleMaps?.apiKey ||
      expoConfig?.ios?.config?.googleMapsApiKey
    );
  } catch (error) {
    return undefined;
  }
};










