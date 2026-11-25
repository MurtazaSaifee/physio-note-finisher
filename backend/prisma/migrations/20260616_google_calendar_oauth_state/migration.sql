CREATE TABLE "GoogleCalendarOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarOAuthState_state_key" ON "GoogleCalendarOAuthState"("state");
CREATE INDEX "GoogleCalendarOAuthState_clinicId_userId_idx" ON "GoogleCalendarOAuthState"("clinicId", "userId");
CREATE INDEX "GoogleCalendarOAuthState_expiresAt_idx" ON "GoogleCalendarOAuthState"("expiresAt");
