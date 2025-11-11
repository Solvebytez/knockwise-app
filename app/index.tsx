import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) return;

    // Small delay to ensure router is fully ready
    const timer = setTimeout(() => {
      try {
      if (isAuthenticated) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
      } catch (error) {
        // Router not ready yet, will retry on next render
        console.log('Router not ready:', error);
    }
    }, 200);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth or during redirect
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

