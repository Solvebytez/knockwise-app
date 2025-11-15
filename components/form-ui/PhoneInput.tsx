import React from 'react';
import { TextInput, CustomTextInputProps } from './TextInput';

interface PhoneInputProps extends Omit<CustomTextInputProps, 'keyboardType' | 'autoComplete' | 'textContentType'> {}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  onChangeText,
  ...props
}) => {
  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
  };

  const handleChangeText = (text: string) => {
    const formatted = formatPhoneNumber(text);
    onChangeText?.(formatted);
  };

  return (
    <TextInput
      {...props}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      onChangeText={handleChangeText}
      maxLength={14} // (XXX) XXX-XXXX format
    />
  );
};




















