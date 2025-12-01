import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosHeaders,
} from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { shouldRefreshToken } from "./tokenUtils";
import { useAuthStore } from "@/store/authStore";

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _skipTokenCheck?: boolean;
}

// Get API URL from app.json extra config or environment variable
const getBaseURL = () => {
  // Priority 1: Environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log(
      "📱 Using EXPO_PUBLIC_API_URL:",
      process.env.EXPO_PUBLIC_API_URL
    );
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Priority 2: From app.json extra.expoUrl
  const expoUrl = Constants.expoConfig?.extra?.expoUrl;
  if (expoUrl) {
    console.log("📱 Using app.json expoUrl:", expoUrl);
    // For Android emulator, replace localhost with 10.0.2.2
    if (Platform.OS === "android" && __DEV__ && expoUrl.includes("localhost")) {
      const androidUrl = expoUrl.replace("localhost", "10.0.2.2");
      console.log("📱 Android emulator detected, using:", androidUrl);
      return androidUrl;
    }
    return expoUrl;
  }

  // No hardcoded fallback - must be set in app.json or environment variable
  console.error("❌ API URL not configured!");
  console.error("   EXPO_PUBLIC_API_URL:", process.env.EXPO_PUBLIC_API_URL);
  console.error(
    "   Constants.expoConfig?.extra?.expoUrl:",
    Constants.expoConfig?.extra?.expoUrl
  );
  throw new Error(
    "API URL not configured. Please set EXPO_PUBLIC_API_URL environment variable or expoUrl in app.json extra section."
  );
};

const baseURL = getBaseURL();

// Log the base URL being used (helpful for debugging)
console.log("🔗 API Base URL:", baseURL);
console.log("🔗 Platform:", Platform.OS);
console.log("🔗 __DEV__:", __DEV__);

// Refresh queue to prevent multiple simultaneous refresh calls
let refreshPromise: Promise<boolean> | null = null;

const persistCsrfToken = async (csrfToken: string) => {
  try {
    await SecureStore.setItemAsync("csrfToken", csrfToken);
  } catch (err) {
    console.error("Error saving CSRF token:", err);
  }
  try {
    await SecureStore.setItemAsync("csrfCookie", `csrf-token=${csrfToken}`);
  } catch (err) {
    console.error("Error saving CSRF cookie:", err);
  }
};
export { persistCsrfToken };

const loadCsrfToken = async () => {
  const storedToken = await SecureStore.getItemAsync("csrfToken");
  if (!storedToken) {
    return null;
  }
  const storedCookie = await SecureStore.getItemAsync("csrfCookie");
  const refreshEndpointCookie = await SecureStore.getItemAsync(
    "csrfCookieSkippingRefresh"
  );
  if (refreshEndpointCookie) {
    await SecureStore.deleteItemAsync("csrfCookieSkippingRefresh");
    return {
      token: storedToken,
      cookie: refreshEndpointCookie,
    };
  }
  return {
    token: storedToken,
    cookie: storedCookie || `csrf-token=${storedToken}`,
  };
};

export const apiInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  withCredentials: true,
});

// Request interceptor - proactive token refresh and add token to headers
apiInstance.interceptors.request.use(
  async (config) => {
    // Skip token check for auth endpoints and if explicitly disabled
    if (
      (config as CustomAxiosRequestConfig)._skipTokenCheck ||
      config.url?.includes("/auth/") ||
      config.url?.includes("/login") ||
      config.url?.includes("/refresh")
    ) {
      return config;
    }

    try {
      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }

      if (config.method && config.method.toLowerCase() !== "get") {
        const csrf = await loadCsrfToken();
        if (csrf?.token) {
          config.headers["X-CSRF-Token"] = csrf.token;
          console.log(
            "🛡️ CSRF: Token added to request",
            csrf.token.substring(0, 8),
            "..."
          );
        } else {
          console.warn("⚠️ CSRF: No token available for request");
        }
      } else if (config.method && config.method.toLowerCase() !== "get") {
        console.warn("⚠️ CSRF: No token available for request");
      }

      // Attach CSRF cookie manually (matching web version) for non-GET requests
      if (config.method && config.method.toLowerCase() !== "get") {
        const csrf = await loadCsrfToken();
        if (csrf?.cookie) {
          const existingCookieHeader =
            config.headers.Cookie || (config.headers as any).cookie;
          const combinedCookie = existingCookieHeader
            ? `${existingCookieHeader}; ${csrf.cookie}`
            : csrf.cookie;
          config.headers.Cookie = combinedCookie;
          (config.headers as any).cookie = combinedCookie;
          console.log(
            "🍪 CSRF: Cookie attached to request",
            csrf.cookie.split("=")[1]?.substring(0, 8),
            "..."
          );
        }
      }

      // Get access token from secure storage
      const accessToken = await SecureStore.getItemAsync("accessToken");

      if (!accessToken) {
        // No token, proceed without authorization header
        return config;
      }

      // Check if token should be refreshed proactively (expires within 5 minutes)
      if (shouldRefreshToken(accessToken, 5)) {
        console.log("🔄 Access token expires soon, refreshing proactively...");

        // Use refresh queue to prevent multiple simultaneous refresh calls
        // If refresh is already in progress, wait for that promise
        if (!refreshPromise) {
          refreshPromise = useAuthStore.getState().refreshTokens();

          // Reset promise on completion (success or failure)
          refreshPromise.finally(() => {
            refreshPromise = null;
          });
        }

        // Wait for refresh to complete (or use existing refresh promise)
        try {
          const refreshSuccess = await refreshPromise;
          if (refreshSuccess) {
            // Get the newly refreshed token
            const newAccessToken = await SecureStore.getItemAsync(
              "accessToken"
            );
            if (newAccessToken) {
              config.headers.Authorization = `Bearer ${newAccessToken}`;
              console.log("✅ Token refreshed proactively, using new token");
              
              // Reload CSRF token after refresh (backend generates new CSRF token on refresh)
              if (config.method && config.method.toLowerCase() !== "get") {
                const updatedCsrf = await loadCsrfToken();
                if (updatedCsrf?.token) {
                  config.headers["X-CSRF-Token"] = updatedCsrf.token;
                  console.log(
                    "🛡️ CSRF: Token reloaded after refresh",
                    updatedCsrf.token.substring(0, 8),
                    "..."
                  );
                }
                if (updatedCsrf?.cookie) {
                  const existingCookieHeader =
                    config.headers.Cookie || (config.headers as any).cookie;
                  const combinedCookie = existingCookieHeader
                    ? `${existingCookieHeader}; ${updatedCsrf.cookie}`
                    : updatedCsrf.cookie;
                  config.headers.Cookie = combinedCookie;
                  (config.headers as any).cookie = combinedCookie;
                  console.log(
                    "🍪 CSRF: Cookie reloaded after refresh",
                    updatedCsrf.cookie.split("=")[1]?.substring(0, 8),
                    "..."
                  );
                }
              }
            } else {
              // Fallback to original token if refresh succeeded but no new token found
              console.warn(
                "⚠️ Refresh succeeded but no new token found, using original"
              );
              config.headers.Authorization = `Bearer ${accessToken}`;
            }
          } else {
            // Refresh failed, use original token (request will likely fail with 401)
            console.warn("⚠️ Proactive refresh failed, using original token");
            config.headers.Authorization = `Bearer ${accessToken}`;
          }
        } catch (error) {
          console.error("Error refreshing token:", error);
          // If refresh fails, use original token (request will likely fail with 401)
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      }

      // Add Authorization header if access token is available
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }

      return config;
    } catch (error) {
      console.error("Error in request interceptor:", error);
      return Promise.reject(error);
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 errors and refresh tokens
apiInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Check if the error is a 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      originalRequest._skipTokenCheck = true; // Skip token check for this request

      console.log("🔄 Received 401 Unauthorized, attempting to refresh token...");

      // Use refresh queue to prevent multiple simultaneous refresh calls
      if (!refreshPromise) {
        refreshPromise = useAuthStore.getState().refreshTokens();

        // Reset promise on completion (success or failure)
        refreshPromise.finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const refreshSuccess = await refreshPromise;
        if (refreshSuccess) {
          // Get the newly refreshed token
          const newAccessToken = await SecureStore.getItemAsync(
            "accessToken"
          );
          if (newAccessToken) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            
            // Reload CSRF token after refresh (backend generates new CSRF token on refresh)
            if (originalRequest.method && originalRequest.method.toLowerCase() !== "get") {
              const updatedCsrf = await loadCsrfToken();
              if (updatedCsrf?.token) {
                originalRequest.headers["X-CSRF-Token"] = updatedCsrf.token;
                console.log(
                  "🛡️ CSRF: Token reloaded after refresh (401 retry)",
                  updatedCsrf.token.substring(0, 8),
                  "..."
                );
              }
              if (updatedCsrf?.cookie) {
                const existingCookieHeader =
                  originalRequest.headers.Cookie || (originalRequest.headers as any).cookie;
                const combinedCookie = existingCookieHeader
                  ? `${existingCookieHeader}; ${updatedCsrf.cookie}`
                  : updatedCsrf.cookie;
                originalRequest.headers.Cookie = combinedCookie;
                (originalRequest.headers as any).cookie = combinedCookie;
                console.log(
                  "🍪 CSRF: Cookie reloaded after refresh (401 retry)",
                  updatedCsrf.cookie.split("=")[1]?.substring(0, 8),
                  "..."
                );
              }
            }
            
            console.log("✅ Token refreshed, retrying original request");
            return apiInstance(originalRequest); // Retry the original request
          } else {
            // Fallback: refresh succeeded but no new token found
            console.warn(
              "⚠️ Refresh succeeded but no new token found"
            );
            return Promise.reject(error);
          }
        } else {
          // Refresh failed, reject the original request
          console.warn("⚠️ Token refresh failed, rejecting original request");
          return Promise.reject(error);
        }
      } catch (error) {
        console.error("Error refreshing token:", error);
        // If refresh fails, reject the original request
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);