import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  Easing,
  Dimensions,
} from "react-native";
import { COLORS, responsiveScale, SPACING } from "@/constants";

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  widthPercentage?: number;
  children: React.ReactNode;
}

const ANIMATION_DURATION = 200;

export function SideDrawer({
  visible,
  onClose,
  widthPercentage = 0.75,
  children,
}: SideDrawerProps): React.JSX.Element {
  const translateX = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [renderDrawer, setRenderDrawer] = useState(visible);
  const drawerWidth = useMemo(
    () => Dimensions.get("window").width * widthPercentage,
    [widthPercentage]
  );

  useEffect(() => {
    if (visible) {
      setRenderDrawer(true);
      translateX.setValue(1);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRenderDrawer(false);
        }
      });
    }
  }, [visible, opacity, translateX]);

  if (!renderDrawer) {
    return <></>;
  }

  return (
    <Modal
      transparent
      animationType="none"
      visible={renderDrawer}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.backdropOverlay,
            {
              opacity,
            },
          ]}
        />
      </Pressable>
      <Animated.View
        style={[
          styles.drawerContainer,
          {
            width: drawerWidth,
            transform: [
              {
                translateX: translateX.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, drawerWidth],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.drawerContent}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdropOverlay: {
    flex: 1,
    backgroundColor: "#00000066",
  },
  drawerContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingVertical: responsiveScale(24),
    paddingHorizontal: responsiveScale(20),
    borderTopLeftRadius: responsiveScale(24),
    borderBottomLeftRadius: responsiveScale(24),
    shadowColor: COLORS.black,
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  drawerContent: {
    flex: 1,
    gap: responsiveScale(SPACING.lg),
  },
});

export default SideDrawer;

