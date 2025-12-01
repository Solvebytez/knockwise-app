import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput, CustomTextInputProps } from './TextInput';
import { COLORS, responsiveSpacing } from '@/constants';

interface SearchInputProps extends Omit<CustomTextInputProps, 'leftIcon'> {
  showClearButton?: boolean;
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  showClearButton = true,
  value,
  onClear,
  onChangeText,
  ...props
}) => {
  const leftIcon = (
    <Ionicons
      name="search-outline"
      size={responsiveSpacing(20)}
      color={COLORS.text.secondary}
    />
  );

  const handleClear = () => {
    onChangeText?.('');
    onClear?.();
  };

  const rightIcon =
    showClearButton && value && value.length > 0 ? (
      <Ionicons
        name="close-circle"
        size={responsiveSpacing(20)}
        color={COLORS.text.secondary}
        onPress={handleClear}
        style={styles.clearIcon}
      />
    ) : undefined;

  return (
    <TextInput
      {...props}
      value={value}
      onChangeText={onChangeText}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      placeholder={props.placeholder || 'Search...'}
    />
  );
};

const styles = StyleSheet.create({
  clearIcon: {
    padding: responsiveSpacing(4),
  },
});

























