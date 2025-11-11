import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/store/authStore";
import QueryProvider from "@/providers/queryProvider";
import { GlobalStatusBar } from "@/components/ui";

export const unstable_settings = {
  anchor: "(tabs)",
};

function useProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentSegment = segments[0];
    const inProtectedGroup =
      currentSegment === "(tabs)" || currentSegment === "modal";

    if (!isAuthenticated && inProtectedGroup) {
      // Redirect to login if not authenticated and trying to access protected route
      router.replace("/login");
    } else if (isAuthenticated && currentSegment === "login") {
      // Redirect to tabs if authenticated and on login screen
      router.replace("/(tabs)");
    } else if (!isAuthenticated && currentSegment === "(tabs)") {
      // Redirect to login if trying to access tabs without auth
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, segments, router]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useProtectedRoute();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <GlobalStatusBar />
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="territory-map-view/[territory_id]"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="modal"
              options={{
                presentation: "modal",
                headerShown: true,
                title: "Modal",
              }}
            />
          </Stack>
        </ThemeProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}
