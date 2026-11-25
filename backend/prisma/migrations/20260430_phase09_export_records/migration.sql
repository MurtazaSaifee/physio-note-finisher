-- Baseline cloud migration.
--
-- The repository reached staging bootstrapping without earlier Prisma migrations
-- checked in, so the first deployable migration must create the full schema
-- from an empty database instead of assuming older tables already exist.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PatientSex" AS ENUM ('female', 'male', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('draft', 'finalized', 'reopened');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('upcoming', 'completed', 'cancelled', 'missed');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('manual', 'synced', 'pending', 'failed');

-- CreateEnum
CREATE TYPE "ExportRecordAction" AS ENUM ('saved', 'shared', 'copied');

-- CreateEnum
CREATE TYPE "ExportRecordType" AS ENUM ('fullNote', 'patientSummary');

-- CreateEnum
CREATE TYPE "ExportRecordFormat" AS ENUM ('pdf', 'text');

-- CreateEnum
CREATE TYPE "VoiceJobStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "VoiceUploadStatus" AS ENUM ('created', 'uploading', 'uploaded', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "sex" "PatientSex",
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "clinicalNotes" TEXT,
    "conditionTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "visitType" TEXT NOT NULL,
    "noteStatus" "NoteStatus" NOT NULL,
    "finalNote" TEXT,
    "patientSummary" TEXT,
    "priorPlan" TEXT,
    "carryForwardContext" TEXT,
    "activeTemplateSnapshotLabel" TEXT,
    "activeTemplateSnapshotCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeTemplateSnapshotSource" TEXT,
    "activeTemplateApplyMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressNote" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "templateKey" TEXT,
    "templateSnapshotLabel" TEXT,
    "templateSnapshotCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateSnapshotSource" TEXT,
    "templateApplyMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomTemplateCategory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTemplateCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'custom',
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomTemplateCategoryLink" (
    "templateId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CustomTemplateCategoryLink_pkey" PRIMARY KEY ("templateId","categoryId")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "patientNameSnapshot" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "linkedSessionId" TEXT,
    "notes" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'manual',
    "syncedAt" TIMESTAMP(3),
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicianNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "defaultReminderTiming" TEXT NOT NULL DEFAULT '30m',
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicianNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "channelId" TEXT,
    "channelToken" TEXT,
    "channelExpiration" TIMESTAMP(3),
    "nextSyncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "audioRetentionPeriod" TEXT NOT NULL DEFAULT '30d',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exportedByUserId" TEXT NOT NULL,
    "action" "ExportRecordAction" NOT NULL,
    "type" "ExportRecordType" NOT NULL,
    "format" "ExportRecordFormat" NOT NULL,
    "fileStorageKey" TEXT,
    "fileSizeBytes" INTEGER,
    "fileStatus" TEXT DEFAULT 'pending',
    "fileError" TEXT,
    "fileExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resends" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceJob" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "uploadId" TEXT NOT NULL,
    "status" "VoiceJobStatus" NOT NULL DEFAULT 'queued',
    "stageState" TEXT NOT NULL DEFAULT 'queued_transcription',
    "audioUrl" TEXT,
    "storageKey" TEXT,
    "transcriptText" TEXT,
    "soapDraft" TEXT,
    "patientSummary" TEXT,
    "sttProviderRequestId" TEXT,
    "llmProviderRequestId" TEXT,
    "summaryProviderRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resends" INTEGER NOT NULL DEFAULT 0,
    "stageRetries" JSONB,

    CONSTRAINT "VoiceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceUpload" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "VoiceUploadStatus" NOT NULL DEFAULT 'created',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "providerRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "dispatchAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "devicePushTokenId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'expo',
    "ticketId" TEXT,
    "errorMessage" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");

-- CreateIndex
CREATE INDEX "Patient_clinicId_archivedAt_idx" ON "Patient"("clinicId", "archivedAt");

-- CreateIndex
CREATE INDEX "Patient_clinicId_fullName_idx" ON "Patient"("clinicId", "fullName");

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone_idx" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "Patient_clinicId_email_idx" ON "Patient"("clinicId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_id_clinicId_key" ON "Patient"("id", "clinicId");

-- CreateIndex
CREATE INDEX "Session_clinicId_idx" ON "Session"("clinicId");

-- CreateIndex
CREATE INDEX "Session_clinicId_patientId_startedAt_idx" ON "Session"("clinicId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Session_clinicId_startedAt_idx" ON "Session"("clinicId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_clinicId_key" ON "Session"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressNote_sessionId_key" ON "ProgressNote"("sessionId");

-- CreateIndex
CREATE INDEX "ProgressNote_clinicId_patientId_idx" ON "ProgressNote"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ProgressNote_clinicId_sessionId_idx" ON "ProgressNote"("clinicId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressNote_id_clinicId_key" ON "ProgressNote"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressNote_sessionId_clinicId_key" ON "ProgressNote"("sessionId", "clinicId");

-- CreateIndex
CREATE INDEX "CustomTemplateCategory_clinicId_ownerUserId_idx" ON "CustomTemplateCategory"("clinicId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTemplateCategory_id_clinicId_key" ON "CustomTemplateCategory"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTemplateCategory_clinicId_ownerUserId_label_key" ON "CustomTemplateCategory"("clinicId", "ownerUserId", "label");

-- CreateIndex
CREATE INDEX "CustomTemplate_clinicId_ownerUserId_updatedAt_idx" ON "CustomTemplate"("clinicId", "ownerUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTemplate_id_clinicId_key" ON "CustomTemplate"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTemplate_clinicId_ownerUserId_name_key" ON "CustomTemplate"("clinicId", "ownerUserId", "name");

-- CreateIndex
CREATE INDEX "CustomTemplateCategoryLink_categoryId_idx" ON "CustomTemplateCategoryLink"("categoryId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_idx" ON "Appointment"("clinicId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_scheduledAt_idx" ON "Appointment"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_status_idx" ON "Appointment"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_patientId_idx" ON "Appointment"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_clinicId_key" ON "Appointment"("id", "clinicId");

-- CreateIndex
CREATE INDEX "ClinicianNotificationPreference_clinicId_userId_idx" ON "ClinicianNotificationPreference"("clinicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicianNotificationPreference_userId_clinicId_key" ON "ClinicianNotificationPreference"("userId", "clinicId");

-- CreateIndex
CREATE INDEX "DevicePushToken_clinicId_userId_idx" ON "DevicePushToken"("clinicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushToken_userId_clinicId_deviceId_key" ON "DevicePushToken"("userId", "clinicId", "deviceId");

-- CreateIndex
CREATE INDEX "GoogleCalendarConnection_clinicId_userId_idx" ON "GoogleCalendarConnection"("clinicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_clinicId_key" ON "GoogleCalendarConnection"("userId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE INDEX "User_clinicId_phone_idx" ON "User"("clinicId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_clinicId_key" ON "User"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_sessionId_key" ON "RefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "RefreshToken_clinicId_userId_idx" ON "RefreshToken"("clinicId", "userId");

-- CreateIndex
CREATE INDEX "ExportRecord_clinicId_idx" ON "ExportRecord"("clinicId");

-- CreateIndex
CREATE INDEX "ExportRecord_clinicId_patientId_createdAt_idx" ON "ExportRecord"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportRecord_clinicId_sessionId_idx" ON "ExportRecord"("clinicId", "sessionId");

-- CreateIndex
CREATE INDEX "ExportRecord_clinicId_exportedByUserId_idx" ON "ExportRecord"("clinicId", "exportedByUserId");

-- CreateIndex
CREATE INDEX "ExportRecord_clinicId_fileStatus_idx" ON "ExportRecord"("clinicId", "fileStatus");

-- CreateIndex
CREATE INDEX "AuditEvent_clinicId_sessionId_timestamp_idx" ON "AuditEvent"("clinicId", "sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_clinicId_userId_idx" ON "AuditEvent"("clinicId", "userId");

-- CreateIndex
CREATE INDEX "OtpState_clinicId_userId_idx" ON "OtpState"("clinicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OtpState_userId_clinicId_key" ON "OtpState"("userId", "clinicId");

-- CreateIndex
CREATE INDEX "VoiceJob_clinicId_idx" ON "VoiceJob"("clinicId");

-- CreateIndex
CREATE INDEX "VoiceJob_clinicId_status_idx" ON "VoiceJob"("clinicId", "status");

-- CreateIndex
CREATE INDEX "VoiceJob_clinicId_stageState_idx" ON "VoiceJob"("clinicId", "stageState");

-- CreateIndex
CREATE INDEX "VoiceJob_clinicId_createdAt_idx" ON "VoiceJob"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceUpload_uploadId_key" ON "VoiceUpload"("uploadId");

-- CreateIndex
CREATE INDEX "VoiceUpload_clinicId_uploadId_idx" ON "VoiceUpload"("clinicId", "uploadId");

-- CreateIndex
CREATE INDEX "VoiceUpload_clinicId_status_idx" ON "VoiceUpload"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PatientConsent_clinicId_patientId_type_status_idx" ON "PatientConsent"("clinicId", "patientId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientConsent_clinicId_patientId_type_status_key" ON "PatientConsent"("clinicId", "patientId", "type", "status");

-- CreateIndex
CREATE INDEX "ReminderDispatch_clinicId_dispatchAt_idx" ON "ReminderDispatch"("clinicId", "dispatchAt");

-- CreateIndex
CREATE INDEX "ReminderDispatch_clinicId_status_idx" ON "ReminderDispatch"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ReminderDispatch_clinicId_appointmentId_idx" ON "ReminderDispatch"("clinicId", "appointmentId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "Patient"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "Patient"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_sessionId_clinicId_fkey" FOREIGN KEY ("sessionId", "clinicId") REFERENCES "Session"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplateCategory" ADD CONSTRAINT "CustomTemplateCategory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplateCategory" ADD CONSTRAINT "CustomTemplateCategory_ownerUserId_clinicId_fkey" FOREIGN KEY ("ownerUserId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplate" ADD CONSTRAINT "CustomTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplate" ADD CONSTRAINT "CustomTemplate_ownerUserId_clinicId_fkey" FOREIGN KEY ("ownerUserId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplateCategoryLink" ADD CONSTRAINT "CustomTemplateCategoryLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CustomTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomTemplateCategoryLink" ADD CONSTRAINT "CustomTemplateCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CustomTemplateCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "Patient"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianNotificationPreference" ADD CONSTRAINT "ClinicianNotificationPreference_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "Patient"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_sessionId_clinicId_fkey" FOREIGN KEY ("sessionId", "clinicId") REFERENCES "Session"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_exportedByUserId_clinicId_fkey" FOREIGN KEY ("exportedByUserId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpState" ADD CONSTRAINT "OtpState_userId_clinicId_fkey" FOREIGN KEY ("userId", "clinicId") REFERENCES "User"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpState" ADD CONSTRAINT "OtpState_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "Patient"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDispatch" ADD CONSTRAINT "ReminderDispatch_devicePushTokenId_fkey" FOREIGN KEY ("devicePushTokenId") REFERENCES "DevicePushToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

