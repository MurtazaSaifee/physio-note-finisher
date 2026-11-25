import type { PrismaClient } from "@prisma/client";

import prisma from "../prismaClient.js";

export type CreateUserData = {
  clinicId: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
};

export class AuthRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  createUser(data: CreateUserData) {
    return this.client.user.create({
      data: {
        clinicId: data.clinicId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: data.passwordHash,
      },
    });
  }

  findUserByEmail(email: string) {
    return this.client.user.findUnique({
      where: { email },
    });
  }

  upsertOtp(
    userId: string,
    clinicId: string,
    codeHash: string,
    expiresAt: Date,
  ) {
    return this.client.otpState.upsert({
      where: {
        userId_clinicId: {
          userId,
          clinicId,
        },
      },
      create: {
        userId,
        clinicId,
        email: "",
        codeHash,
        expiresAt,
        lastSentAt: new Date(),
      },
      update: {
        codeHash,
        expiresAt,
        attempts: 0,
        resends: {
          increment: 1,
        },
        lastSentAt: new Date(),
      },
    });
  }

  getOtpState(userId: string) {
    return this.client.otpState.findFirst({
      where: { userId },
    });
  }

  incrementOtpAttempts(otpId: string) {
    return this.client.otpState.update({
      where: { id: otpId },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  }

  markEmailVerified(userId: string) {
    return this.client.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }
}
