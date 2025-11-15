import React from 'react';
import { TextInput, CustomTextInputProps } from './TextInput';

interface NumberInputProps extends Omit<CustomTextInputProps, 'keyboardType' | 'autoComplete'> {
  decimal?: boolean;
  integerOnly?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  decimal = false,
  integerOnly = false,
  onChangeText,
  ...props
}) => {
  const handleChangeText = (text: string) => {
    if (integerOnly) {
      // Only allow integers
      const numericText = text.replace(/[^0-9]/g, '');
      onChangeText?.(numericText);
    } else if (decimal) {
      // Allow decimals
      const numericText = text.replace(/[^0-9.]/g, '');
      // Ensure only one decimal point
      const parts = numericText.split('.');
      const filteredText = parts.length > 2
        ? parts[0] + '.' + parts.slice(1).join('')
        : numericText;
      onChangeText?.(filteredText);
    } else {
      // Allow any numeric input
      const numericText = text.replace(/[^0-9]/g, '');
      onChangeText?.(numericText);
    }
  };

  return (
    <TextInput
      {...props}
      keyboardType={decimal || integerOnly ? 'numeric' : 'number-pad'}
      onChangeText={handleChangeText}
    />
  );
};




















