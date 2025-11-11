import React from "react";
import { TextInput, CustomTextInputProps } from "./TextInput";

interface EmailInputProps
  extends Omit<
    CustomTextInputProps,
    "keyboardType" | "autoComplete" | "textContentType" | "autoCapitalize"
  > {}

export const EmailInput: React.FC<EmailInputProps> = ({ ...props }) => {
  return (
    <TextInput
      {...props}
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      autoCapitalize="none"
    />
  );
};
