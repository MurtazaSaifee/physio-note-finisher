import { z } from "zod";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginUserProfile {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  tokenVersion: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: LoginUserProfile;
  claims: JwtClaims;
}

export const CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION = "2026-07-17";

export interface EmailVerificationRequiredResponse {
  error: "email_verification_required";
  email: string;
  otpRequired: true;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  claims: JwtClaims;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  revoked: boolean;
}

export interface OtpSendRequest {
  email: string;
}

export interface OtpSendResponse {
  sent: boolean;
  remainingResends?: number;
  retryAfterSeconds?: number;
  error?: "otp_resend_too_soon" | "otp_resend_limit_reached" | "otp_delivery_failed";
}

export interface OtpVerifyRequest {
  email: string;
  code: string;
}

export interface SignupResponse {
  user: {
    email: string;
    emailVerified: boolean;
  };
  otpRequired: boolean;
  otpSent: boolean;
}

export interface ForgotPasswordResetRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface JwtClaims {
  sub: string;
  clinicId: string;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

const requiredName = z.string().trim().min(1).max(80);

export const SignupSchema = z.object({
  firstName: requiredName,
  lastName: requiredName,
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  acknowledgementVersion: z.literal(CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION),
});

export const ProfileUpdateSchema = z.object({
  firstName: requiredName,
  lastName: requiredName,
});

export type SignupRequest = z.infer<typeof SignupSchema>;
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateSchema>;
