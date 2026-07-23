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

export interface RefreshRequest {
  refreshToken: string;
}

export type RefreshTokenRequest = RefreshRequest;

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

export interface ChangePasswordRequest {
  currentPassword: string;
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

export const ProfileUpdateSchema = z.object({
  firstName: requiredName,
  lastName: requiredName,
});

export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateSchema>;
