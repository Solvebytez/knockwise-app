/**
 * Token Utilities
 * Functions for decoding and validating JWT tokens
 */

interface JWTPayload {
  sub?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

/**
 * Base64URL decode - Pure JavaScript implementation for React Native compatibility
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);

  // Pure JS base64 decode (works in React Native)
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let i = 0;

  base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, "");

  while (i < base64.length) {
    const enc1 = chars.indexOf(base64.charAt(i++));
    const enc2 = chars.indexOf(base64.charAt(i++));
    const enc3 = chars.indexOf(base64.charAt(i++));
    const enc4 = chars.indexOf(base64.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output += String.fromCharCode(chr1);
    if (enc3 !== 64) output += String.fromCharCode(chr2);
    if (enc4 !== 64) output += String.fromCharCode(chr3);
  }

  return output;
}

/**
 * Decode JWT token without verification (client-side only for reading payload)
 * Note: This doesn't verify the signature, just decodes the payload
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT format");
      return null;
    }

    // Decode payload (second part)
    const payload = parts[1];
    const decoded = base64UrlDecode(payload);

    return JSON.parse(decoded) as JWTPayload;
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
}

/**
 * Get token expiration date/time
 */
export function getTokenExpiration(token: string): Date | null {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return null;
  }

  // exp is Unix timestamp in seconds
  return new Date(payload.exp * 1000);
}

/**
 * Check if token is expired or will expire soon
 * @param token - JWT token to check
 * @param bufferMinutes - Minutes before expiration to consider as "expired soon" (default: 2)
 * @returns Object with validation results
 */
export function isTokenExpired(
  token: string | null | undefined,
  bufferMinutes: number = 2
): {
  isValid: boolean;
  isExpired: boolean;
  expiresSoon: boolean;
  expiresAt: Date | null;
  expiresIn: number | null; // milliseconds until expiration
} {
  if (!token) {
    return {
      isValid: false,
      isExpired: true,
      expiresSoon: true,
      expiresAt: null,
      expiresIn: null,
    };
  }

  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return {
      isValid: false,
      isExpired: true,
      expiresSoon: true,
      expiresAt: null,
      expiresIn: null,
    };
  }

  const expiresAt = new Date(payload.exp * 1000);
  const now = new Date();
  const expiresIn = expiresAt.getTime() - now.getTime();
  const bufferMs = bufferMinutes * 60 * 1000;

  const isExpired = expiresAt <= now;
  const expiresSoon = expiresIn <= bufferMs;

  return {
    isValid: !isExpired,
    isExpired,
    expiresSoon,
    expiresAt,
    expiresIn: expiresIn > 0 ? expiresIn : 0,
  };
}

/**
 * Check if token should be refreshed (expires soon but not yet expired)
 */
export function shouldRefreshToken(
  token: string | null | undefined,
  bufferMinutes: number = 5
): boolean {
  if (!token) return false;

  const validation = isTokenExpired(token, bufferMinutes);
  // Refresh if not expired but expires soon
  return !validation.isExpired && validation.expiresSoon;
}
