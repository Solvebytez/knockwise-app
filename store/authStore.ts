import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { isTokenExpired } from "@/lib/tokenUtils";
import { apiInstance, persistCsrfToken } from "@/lib/apiInstance";
import Constants from "expo-constants";
import { Platform } from "react-native";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "AGENT" | "ADMIN" | "SUBADMIN";
  [key: string]: any;
}

// Get API base URL (same logic as apiInstance)
const getBaseURL = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const expoUrl = Constants.expoConfig?.extra?.expoUrl;
  if (expoUrl) {
    if (Platform.OS === "android" && __DEV__ && expoUrl.includes("localhost")) {
      return expoUrl.replace("localhost", "10.0.2.2");
    }
    return expoUrl;
  }
  throw new Error("API URL not configured");
};

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggingOut: boolean;
  setUser: (user: User | null) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isLoggingOut: false,

  setUser: async (user: User | null) => {
    if (user) {
      try {
        await SecureStore.setItemAsync("user", JSON.stringify(user));
        set({ user, isAuthenticated: true });
      } catch (error) {
        console.error("Error saving user to secure storage:", error);
        set({ user, isAuthenticated: true });
      }
    } else {
      set({ user: null, isAuthenticated: false });
    }
  },

  logout: async () => {
    // Set logging out state to show loading indicator
    set({ isLoggingOut: true });

    try {
      // Get refresh token before clearing storage (needed for API call)
      const refreshToken = await SecureStore.getItemAsync("refreshToken");

      // Call backend logout API to revoke refresh token using apiInstance
      if (refreshToken) {
        try {
          console.log("🚪 Calling backend logout API...");
          // Use apiInstance with _skipTokenCheck to avoid token refresh logic
          // The logout endpoint doesn't require authentication
          await apiInstance.post(
            "/auth/logout",
            { refreshToken },
            {
              _skipTokenCheck: true,
            } as any
          );
          console.log("✅ Backend logout API called successfully");
        } catch (apiError: any) {
          // Log error but continue with local cleanup
          console.error("⚠️ Backend logout API error (continuing with local cleanup):", apiError.message);
        }
      }

      // Clear secure storage (always do this, even if API call failed)
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      await SecureStore.deleteItemAsync("user");
      console.log("✅ Secure storage cleared");

      // Small delay to ensure state updates are processed
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error("❌ Error during logout:", error);
    } finally {
      // Always update state, even if there were errors
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false,
        isLoggingOut: false 
      });
    }
  },

  refreshTokens: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync("refreshToken");
      if (!refreshToken) {
        console.log("❌ No refresh token available");
        return false;
      }

      // Check if refresh token is expired
      const refreshTokenValidation = isTokenExpired(refreshToken, 0);
      if (refreshTokenValidation.isExpired) {
        console.log("❌ Refresh token is expired");
        // Clear auth data
        await SecureStore.deleteItemAsync("accessToken");
        await SecureStore.deleteItemAsync("refreshToken");
        await SecureStore.deleteItemAsync("user");
        set({ user: null, isAuthenticated: false });
        return false;
      }

      // Call refresh endpoint using apiInstance
      const response = await apiInstance.post(
        "/auth/refresh",
        { refreshToken },
        {
          _skipTokenCheck: true,
        } as any
      );

      const responseData = response.data.data || response.data;
      const {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: userData,
      } = responseData;

      if (!newAccessToken) {
        console.error("❌ No access token in refresh response");
        return false;
      }

      // Update tokens in secure storage
      await SecureStore.setItemAsync("accessToken", newAccessToken);
      if (newRefreshToken) {
        await SecureStore.setItemAsync("refreshToken", newRefreshToken);
      }
      
      // Extract and save CSRF token from response headers (Set-Cookie)
      const setCookieHeaders = response.headers["set-cookie"] || response.headers["Set-Cookie"];
      if (setCookieHeaders) {
        const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        const csrfCookie = cookies.find((cookie: string) => cookie.includes("csrf-token="));
        if (csrfCookie) {
          const csrfTokenMatch = csrfCookie.match(/csrf-token=([^;]+)/);
          if (csrfTokenMatch && csrfTokenMatch[1]) {
            const csrfToken = csrfTokenMatch[1].trim();
            await persistCsrfToken(csrfToken);
            console.log("🛡️ CSRF: Token saved from refresh response");
          }
        }
      }

      // Update user data if provided
      if (userData) {
        await SecureStore.setItemAsync("user", JSON.stringify(userData));
        set({ user: userData, isAuthenticated: true });
      }

      console.log("✅ Tokens refreshed successfully");
      return true;
    } catch (error: any) {
      console.error("❌ Token refresh failed:", error);

      // Clear auth data on refresh failure
      try {
        await SecureStore.deleteItemAsync("accessToken");
        await SecureStore.deleteItemAsync("refreshToken");
        await SecureStore.deleteItemAsync("user");
      } catch (clearError) {
        console.error("Error clearing secure storage:", clearError);
      }

      set({ user: null, isAuthenticated: false });
      return false;
    }
  },

  initializeAuth: async () => {
    try {
      set({ isLoading: true });

      const userStr = await SecureStore.getItemAsync("user");
      const accessToken = await SecureStore.getItemAsync("accessToken");
      const refreshToken = await SecureStore.getItemAsync("refreshToken");

      // If no tokens at all, user is not authenticated
      if (!accessToken && !refreshToken) {
        console.log("🔍 No tokens found, user not authenticated");
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // If we have user data, validate it
      if (userStr) {
        const user = JSON.parse(userStr);

        // Only allow AGENT role to stay logged in
        if (user.role !== "AGENT") {
          console.log("❌ Non-AGENT user, clearing auth");
          await SecureStore.deleteItemAsync("accessToken");
          await SecureStore.deleteItemAsync("refreshToken");
          await SecureStore.deleteItemAsync("user");
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        // Validate access token
        if (accessToken) {
          const tokenValidation = isTokenExpired(accessToken, 2); // 2 minute buffer

          if (tokenValidation.isValid && !tokenValidation.expiresSoon) {
            // Token is valid and not expiring soon, user is authenticated
            console.log("✅ Access token is valid");
            set({ user, isAuthenticated: true, isLoading: false });
            return;
          } else if (
            tokenValidation.expiresSoon &&
            !tokenValidation.isExpired
          ) {
            // Token expires soon but not expired yet - refresh proactively
            console.log("⚠️ Access token expires soon, refreshing...");
            const refreshSuccess = await get().refreshTokens();
            if (refreshSuccess) {
              // Get updated user data
              const updatedUserStr = await SecureStore.getItemAsync("user");
              if (updatedUserStr) {
                const updatedUser = JSON.parse(updatedUserStr);
                set({
                  user: updatedUser,
                  isAuthenticated: true,
                  isLoading: false,
                });
                return;
              }
            }
          } else if (tokenValidation.isExpired) {
            // Access token expired, try refresh token
            console.log("⚠️ Access token expired, attempting refresh...");
            if (refreshToken) {
              const refreshSuccess = await get().refreshTokens();
              if (refreshSuccess) {
                const updatedUserStr = await SecureStore.getItemAsync("user");
                if (updatedUserStr) {
                  const updatedUser = JSON.parse(updatedUserStr);
                  set({
                    user: updatedUser,
                    isAuthenticated: true,
                    isLoading: false,
                  });
                  return;
                }
              }
            }
          }
        } else if (refreshToken) {
          // No access token but have refresh token - try to refresh
          console.log("⚠️ No access token, attempting refresh...");
          const refreshSuccess = await get().refreshTokens();
          if (refreshSuccess) {
            const updatedUserStr = await SecureStore.getItemAsync("user");
            if (updatedUserStr) {
              const updatedUser = JSON.parse(updatedUserStr);
              set({
                user: updatedUser,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            }
          }
        }
      }

      // If we reach here, auth initialization failed
      console.log("❌ Auth initialization failed, clearing data");
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      await SecureStore.deleteItemAsync("user");
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      console.error("Error initializing auth:", error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
