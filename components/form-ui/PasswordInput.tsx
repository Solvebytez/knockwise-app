import React, { useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput, CustomTextInputProps } from './TextInput';
import { COLORS, responsiveSpacing } from '@/constants';

interface PasswordInputProps extends Omit<CustomTextInputProps, 'secureTextEntry' | 'rightIcon'> {
  showToggle?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  showToggle = true,
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const rightIcon = showToggle ? (
    <TouchableOpacity
      onPress={toggleVisibility}
      style={styles.toggleButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name={isVisible ? 'eye-off-outline' : 'eye-outline'}
        size={responsiveSpacing(20)}
        color={COLORS.text.secondary}
      />
    </TouchableOpacity>
  ) : undefined;

  return (
    <TextInput
      {...props}
      secureTextEntry={!isVisible}
      rightIcon={rightIcon}
      autoComplete="password"
      textContentType="password"
    />
  );
};

const styles = StyleSheet.create({
  toggleButton: {
    padding: responsiveSpacing(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
});




















