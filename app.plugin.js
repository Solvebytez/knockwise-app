const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Custom Expo config plugin to automatically add Google Maps API key to AndroidManifest.xml
 * This ensures the API key is included every time you run prebuild or run:android
 */
const withGoogleMapsApiKey = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    // Get API key from app.json config - try multiple sources
    console.log("[GoogleMapsPlugin] Starting plugin execution...");
    const apiKey =
      config.android?.config?.googleMaps?.apiKey ||
      config.plugins?.find(
        (plugin) =>
          Array.isArray(plugin) &&
          plugin[0] === "react-native-maps" &&
          plugin[1]?.googleMapsApiKey
      )?.[1]?.googleMapsApiKey ||
      "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M"; // Fallback to hardcoded key

    console.log(
      `[GoogleMapsPlugin] API Key found: ${
        apiKey ? "Yes (" + apiKey.substring(0, 10) + "...)" : "No"
      }`
    );

    if (!apiKey) {
      console.warn("⚠️ Google Maps API key not found in app.json config");
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

    const metaNames = [
      "com.google.android.geo.API_KEY",
      "com.google.android.maps.v2.API_KEY",
    ];

    // Remove any existing API key entries for both names
    const beforeCount = application["meta-data"].length;
    application["meta-data"] = application["meta-data"].filter((meta) => {
      const name = meta.$?.["android:name"];
      return !metaNames.includes(name);
    });
    const removed = beforeCount - application["meta-data"].length;
    if (removed > 0) {
      console.log(
        `[GoogleMapsPlugin] Removed ${removed} existing Google Maps meta-data entries`
      );
    }

    metaNames.forEach((name) => {
      const apiKeyMetaData = {
        $: {
          "android:name": name,
          "android:value": apiKey,
        },
      };
      application["meta-data"].push(apiKeyMetaData);
      console.log(
        `✅ [GoogleMapsPlugin] Injected ${name} with key ${apiKey.substring(
          0,
          10
        )}...`
      );
    });

    console.log(
      `[GoogleMapsPlugin] Total meta-data entries: ${application["meta-data"].length}`
    );
    console.log(`[GoogleMapsPlugin] Plugin execution completed successfully.`);

    return config;
  });
};

module.exports = withGoogleMapsApiKey;
