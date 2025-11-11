const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Custom Expo config plugin to automatically add Google Maps API key to AndroidManifest.xml
 * This ensures the API key is included every time you run prebuild or run:android
 */
const withGoogleMapsApiKey = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    // Get API key from app.json config
    const apiKey =
      config.android?.config?.googleMaps?.apiKey ||
      config.plugins?.find(
        (plugin) =>
          Array.isArray(plugin) &&
          plugin[0] === "react-native-maps" &&
          plugin[1]?.googleMapsApiKey
      )?.[1]?.googleMapsApiKey;

    if (!apiKey) {
      console.warn(
        "⚠️ Google Maps API key not found in app.json config"
      );
      return config;
    }

    // Find or create the application element
    if (!manifest.application) {
      manifest.application = [{}];
    }

    const application = manifest.application[0];

    // Ensure meta-data array exists
    if (!application["meta-data"]) {
      application["meta-data"] = [];
    }

    // Check if API key meta-data already exists
    const existingApiKeyIndex = application["meta-data"].findIndex(
      (meta) =>
        meta.$?.["android:name"] === "com.google.android.geo.API_KEY"
    );

    const apiKeyMetaData = {
      $: {
        "android:name": "com.google.android.geo.API_KEY",
        "android:value": apiKey,
      },
    };

    if (existingApiKeyIndex >= 0) {
      // Update existing meta-data
      application["meta-data"][existingApiKeyIndex] = apiKeyMetaData;
      console.log("✅ Updated Google Maps API key in AndroidManifest.xml");
    } else {
      // Add new meta-data
      application["meta-data"].push(apiKeyMetaData);
      console.log("✅ Added Google Maps API key to AndroidManifest.xml");
    }

    return config;
  });
};

module.exports = withGoogleMapsApiKey;









