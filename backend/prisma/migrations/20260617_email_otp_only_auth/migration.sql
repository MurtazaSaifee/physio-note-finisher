DROP INDEX IF EXISTS "User_clinicId_phone_idx";

ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "phone",
DROP COLUMN "phoneVerified";

DELETE FROM "OtpState";

ALTER TABLE "OtpState"
RENAME COLUMN "phone" TO "email";
