export default {
  expo: {
    name: "myknockpro",
    slug: "knockwise-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "knockwiseapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.sahin05.knockwiseapp",
      buildNumber: "1",
      config: {
        googleMapsApiKey: "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M",
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "This app needs access to your location to show properties on the map and help you navigate to them.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "This app needs access to your location to show properties on the map and help you navigate to them.",
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M",
        },
      },
      package: "com.sahin05.knockwiseapp",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      [
        "react-native-maps",
        {
          googleMapsApiKey: "AIzaSyCe1aICpk2SmN3ArHwp-79FnsOk38k072M",
        },
      ],
      "./app.plugin.js",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      expoUrl: "https://api.myknockpro.com/api",
      router: {},
      eas: {
        projectId: "5ab6ed59-8640-42a9-89ea-7702d8bac225",
      },
    },
  },
};
