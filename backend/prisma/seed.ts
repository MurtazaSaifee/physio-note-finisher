/**
 * Local demo seed. Creates the demo clinic and clinician login, then loads
 * prisma/demo-data.sql: six synthetic patients with sessions, finalized SOAP
 * notes and appointments dated relative to today, so the dashboard and
 * calendar are never empty.
 *
 * Every name, phone number and clinical detail is invented.
 * Refuses to run against a non-local database.
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";

import bcrypt from "bcryptjs";
import pg from "pg";

import { CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION } from "../../shared/contracts/auth.js";

const DEMO_CLINIC_ID = "clinic_demo_01";
const DEMO_USER_ID = "user_demo_01";
const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "clinician@example.com";
const DEMO_PASSWORD = process.env.DEV_CLINICIAN_PASSWORD?.trim() || "password123";

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://physio_dev:physio_dev_pass@localhost:5432/physio_note_finisher";

function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "db"].includes(host)) {
    throw new Error(`Refusing to seed non-local database host "${host}".`);
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main(): Promise<void> {
  assertLocalDatabase(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    await client.query(
      `insert into "Clinic"(id, name, "createdAt", "updatedAt")
       values ($1, $2, now(), now())
       on conflict (id) do update set name = excluded.name, "updatedAt" = now()`,
      [DEMO_CLINIC_ID, "Physio Note Finisher Demo Clinic"],
    );

    await client.query(
      `insert into "User"(id, "clinicId", email, "emailVerified", "passwordHash", "firstName", "lastName",
                          "dataHandlingAcknowledgementVersion", "dataHandlingAcknowledgedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4, 'Demo', 'Clinician', $5, now(), now(), now())
       on conflict (email) do update set
         "passwordHash" = excluded."passwordHash",
         "emailVerified" = true,
         "dataHandlingAcknowledgementVersion" = excluded."dataHandlingAcknowledgementVersion",
         "dataHandlingAcknowledgedAt" = now(),
         "updatedAt" = now()`,
      [DEMO_USER_ID, DEMO_CLINIC_ID, DEMO_EMAIL, passwordHash, CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION],
    );

    // demo-data.sql is also runnable through psql (scripts/seed-demo-data.sh),
    // which supplies :'demo_email' as a psql variable.
    const sql = (await readFile(new URL("./demo-data.sql", import.meta.url), "utf8"))
      .replaceAll(":'demo_email'", quoteLiteral(DEMO_EMAIL));
    await client.query(sql);

    const { rows } = await client.query(
      `select
         (select count(*) from "Patient" where "clinicId" = u."clinicId")::int as patients,
         (select count(*) from "Session" where "clinicId" = u."clinicId")::int as sessions,
         (select count(*) from "Appointment" where "clinicId" = u."clinicId")::int as appointments
       from "User" u where u.email = $1`,
      [DEMO_EMAIL],
    );
    const counts = rows[0] as { patients: number; sessions: number; appointments: number };
    console.log(
      `Seeded ${counts.patients} patients, ${counts.sessions} sessions, ${counts.appointments} appointments.\n` +
        `Sign in as ${DEMO_EMAIL} / ${process.env.DEV_CLINICIAN_PASSWORD?.trim() ? "<DEV_CLINICIAN_PASSWORD>" : DEMO_PASSWORD}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
