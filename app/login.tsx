import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/store/authStore";
import { apiInstance } from "@/lib/apiInstance";
import * as SecureStore from "expo-secure-store";
import { Image } from "expo-image";
import { EmailInput, PasswordInput } from "@/components/form-ui";
import { Text, H2, Body1, Button } from "@/components/ui";
import {
  COLORS,
  SPACING,
  PADDING,
  responsiveSpacing,
  responsiveScale,
} from "@/constants";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "agent@knockwise.io",
      password: "Admin@12345",
    },
  });

  useEffect(() => {
    // Redirect if already authenticated (wait for auth to finish loading)
    if (!authLoading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, authLoading, router]);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiInstance.post("/auth/login", {
        email: data.email,
        password: data.password,
      });

      const responseData = response.data;
      const userData = responseData.data?.user || responseData.user;

      if (!userData || !userData.name) {
        setError("Invalid response from server - missing user data");
        setIsLoading(false);
        return;
      }

      // Check role - only AGENT allowed (check before storing tokens)
      if (userData.role !== "AGENT") {
        setError("Access denied. Only agents can login to this app.");
        setIsLoading(false);
        return;
      }

      // Store tokens in secure storage
      const accessToken =
        responseData.data?.accessToken || responseData.accessToken;
      const refreshToken =
        responseData.data?.refreshToken || responseData.refreshToken;

      if (accessToken) {
        await SecureStore.setItemAsync("accessToken", accessToken);
      }
      if (refreshToken) {
        await SecureStore.setItemAsync("refreshToken", refreshToken);
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
            await SecureStore.setItemAsync("csrfToken", csrfToken);
            console.log("🛡️ CSRF: Token saved from login response");
          }
        }
      }

      // Set user in store
      await setUser(userData);

      // Navigate to tabs
      router.replace("/(tabs)");
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please try again.";
      setError(errorMessage);
      Alert.alert("Login Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require("@/assets/images/knockwise-logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          {/* SVG Image */}
          <View style={styles.animationContainer}>
            <Image
              source={require("@/assets/images/policy-rafiki.svg")}
              style={styles.animation}
              contentFit="contain"
            />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <H2 color={COLORS.primary[500]}>Login</H2>
            <Body1 color={COLORS.text.secondary} style={styles.subtitle}>
              Enter your credentials to access your account
            </Body1>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email Field */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <EmailInput
                  label="Email"
                  placeholder="Enter your email address"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  editable={!isLoading}
                  size="medium"
                  variant="underline"
                />
              )}
            />

            {/* Password Field */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  editable={!isLoading}
                  size="medium"
                  variant="underline"
                />
              )}
            />

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Text variant="inputHelper" color={COLORS.error[500]}>
                  {error}
                </Text>
              </View>
            )}

            {/* Forgot Password & Login Button */}
            <View style={styles.footer}>
              <Button
                variant="ghost"
                size="small"
                title="Forgot Password"
                onPress={() =>
                  Alert.alert("Forgot Password", "Feature coming soon")
                }
                disabled={isLoading}
                textStyle={styles.forgotPasswordText}
              />

              <Button
                variant="primary"
                size="medium"
                title="Login"
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                disabled={isLoading}
                fullWidth
                containerStyle={styles.loginButton}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: responsiveSpacing(PADDING.screenLarge),
    paddingTop: responsiveSpacing(SPACING.sm),
    justifyContent: "flex-start",
  },
  logoContainer: {
    alignItems: "center",
    marginTop: 0,
    marginBottom: -48,
  },
  animationContainer: {
    alignItems: "center",
    marginTop: -48,
    marginBottom: responsiveSpacing(SPACING.sm),
    height: responsiveScale(300),
  },
  animation: {
    width: responsiveScale(300),
    height: responsiveScale(300),
  },
  logo: {
    width: responsiveScale(180),
    height: responsiveScale(180),
  },
  header: {
    alignItems: "center",
    marginBottom: responsiveSpacing(SPACING.sm),
  },
  subtitle: {
    marginTop: responsiveSpacing(SPACING.xs),
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  errorContainer: {
    padding: responsiveSpacing(PADDING.sm),
    backgroundColor: COLORS.error[50],
    borderWidth: 1,
    borderColor: COLORS.error[200],
    borderRadius: 8,
    marginBottom: responsiveSpacing(SPACING.md),
  },
  footer: {
    flexDirection: "column",
    alignItems: "stretch",
    marginTop: responsiveSpacing(SPACING.lg),
    gap: responsiveSpacing(SPACING.md),
  },
  forgotPasswordText: {
    color: COLORS.primary[500],
  },
  loginButton: {
    backgroundColor: COLORS.warning[500],
  },
});
