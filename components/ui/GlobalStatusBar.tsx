import React from "react";

import { StatusBar as RNStatusBar } from "react-native";

export interface GlobalStatusBarProps {
  barStyle?: "default" | "light-content" | "dark-content";

  backgroundColor?: string;

  translucent?: boolean;
}

export const GlobalStatusBar: React.FC<GlobalStatusBarProps> = ({
  barStyle = "dark-content",

  backgroundColor = "transparent",

  translucent = false,
}) => {
  return (
    <RNStatusBar
      barStyle={barStyle}
      backgroundColor={backgroundColor}
      translucent={translucent}
    />
  );
};

export default GlobalStatusBar;
