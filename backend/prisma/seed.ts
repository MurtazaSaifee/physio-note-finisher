import { PrismaClient, PatientSex, NoteStatus, AppointmentStatus, SyncStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://physio_dev:physio_dev_pass@localhost:5432/physio_note_finisher";

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // 1. Clinic
  const clinicId = "clinic_demo_01";
  const clinic = await prisma.clinic.upsert({
    where: { id: clinicId },
    update: {
      name: "Physio Note Finisher Demo Clinic",
    },
    create: {
      id: clinicId,
      name: "Physio Note Finisher Demo Clinic",
    },
  });

  // 2. User
  const userId = "user_demo_01";
  const rawPassword = process.env.DEV_CLINICIAN_PASSWORD || "password123";
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: "clinician@example.com" },
    update: {
      clinicId,
      passwordHash,
      firstName: "Demo",
      lastName: "Clinician",
      emailVerified: true,
    },
    create: {
      id: userId,
      clinicId,
      email: "clinician@example.com",
      passwordHash,
      firstName: "Demo",
      lastName: "Clinician",
      emailVerified: true,
    },
  });

  // 3. Patients (3 synthetic patients)
  const patient1 = await prisma.patient.upsert({
    where: { id_clinicId: { id: "patient_demo_01", clinicId } },
    update: {
      fullName: "Rajesh Sharma",
      dateOfBirth: new Date("1985-04-12T00:00:00.000Z"),
      sex: PatientSex.male,
      phone: "+919876543210",
      email: "rajesh.sharma@example.com",
      conditionTags: ["L4-L5 Lumbar Strain", "Post-Op Rehab"],
      clinicalNotes: "Patient presenting with chronic lower back pain following L4-L5 disc protrusion.",
    },
    create: {
      id: "patient_demo_01",
      clinicId,
      fullName: "Rajesh Sharma",
      dateOfBirth: new Date("1985-04-12T00:00:00.000Z"),
      sex: PatientSex.male,
      phone: "+919876543210",
      email: "rajesh.sharma@example.com",
      conditionTags: ["L4-L5 Lumbar Strain", "Post-Op Rehab"],
      clinicalNotes: "Patient presenting with chronic lower back pain following L4-L5 disc protrusion.",
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { id_clinicId: { id: "patient_demo_02", clinicId } },
    update: {
      fullName: "Priya Patel",
      dateOfBirth: new Date("1992-08-25T00:00:00.000Z"),
      sex: PatientSex.female,
      phone: "+919876543211",
      email: "priya.patel@example.com",
      conditionTags: ["Rotator Cuff Tendinopathy"],
      clinicalNotes: "Right shoulder impingement during overhead movement.",
    },
    create: {
      id: "patient_demo_02",
      clinicId,
      fullName: "Priya Patel",
      dateOfBirth: new Date("1992-08-25T00:00:00.000Z"),
      sex: PatientSex.female,
      phone: "+919876543211",
      email: "priya.patel@example.com",
      conditionTags: ["Rotator Cuff Tendinopathy"],
      clinicalNotes: "Right shoulder impingement during overhead movement.",
    },
  });

  const patient3 = await prisma.patient.upsert({
    where: { id_clinicId: { id: "patient_demo_03", clinicId } },
    update: {
      fullName: "Amit Kumar",
      dateOfBirth: new Date("1978-11-03T00:00:00.000Z"),
      sex: PatientSex.male,
      phone: "+919876543212",
      email: "amit.kumar@example.com",
      conditionTags: ["ACL Reconstruction Rehab"],
      clinicalNotes: "6 weeks post ACL reconstruction, right knee.",
    },
    create: {
      id: "patient_demo_03",
      clinicId,
      fullName: "Amit Kumar",
      dateOfBirth: new Date("1978-11-03T00:00:00.000Z"),
      sex: PatientSex.male,
      phone: "+919876543212",
      email: "amit.kumar@example.com",
      conditionTags: ["ACL Reconstruction Rehab"],
      clinicalNotes: "6 weeks post ACL reconstruction, right knee.",
    },
  });

  // 4. Sessions & Progress Notes (3 sessions, 2 finalized SOAP notes)
  const session1 = await prisma.session.upsert({
    where: { id_clinicId: { id: "session_demo_01", clinicId } },
    update: {
      patientId: patient1.id,
      startedAt: new Date("2026-07-20T09:00:00.000Z"),
      visitType: "Initial Assessment",
      noteStatus: NoteStatus.finalized,
      finalNote:
        "SUBJECTIVE:\nPatient reports localized L4-L5 lumbar pain rating 6/10 aggravated by prolonged sitting.\n\nOBJECTIVE:\nLumbar flexion restricted to 45 deg with mild spasm. SLR positive at 60 degrees on right side.\n\nASSESSMENT:\nAcute L4-L5 lumbar strain with secondary paraspinal muscle guarding.\n\nPLAN:\nCore stabilization exercises, gentle pelvic tilts, thermotherapy, and ergonomic advice.",
      patientSummary:
        "Start gentle cat-cow stretches daily (3 sets of 10). Avoid heavy lifting over 5kg for the next 48 hours.",
      priorPlan: null,
    },
    create: {
      id: "session_demo_01",
      clinicId,
      patientId: patient1.id,
      startedAt: new Date("2026-07-20T09:00:00.000Z"),
      visitType: "Initial Assessment",
      noteStatus: NoteStatus.finalized,
      finalNote:
        "SUBJECTIVE:\nPatient reports localized L4-L5 lumbar pain rating 6/10 aggravated by prolonged sitting.\n\nOBJECTIVE:\nLumbar flexion restricted to 45 deg with mild spasm. SLR positive at 60 degrees on right side.\n\nASSESSMENT:\nAcute L4-L5 lumbar strain with secondary paraspinal muscle guarding.\n\nPLAN:\nCore stabilization exercises, gentle pelvic tilts, thermotherapy, and ergonomic advice.",
      patientSummary:
        "Start gentle cat-cow stretches daily (3 sets of 10). Avoid heavy lifting over 5kg for the next 48 hours.",
      priorPlan: null,
    },
  });

  await prisma.progressNote.upsert({
    where: { sessionId_clinicId: { sessionId: session1.id, clinicId } },
    update: {
      patientId: patient1.id,
      subjective:
        "Patient reports localized L4-L5 lumbar pain rating 6/10 aggravated by prolonged sitting.",
      objective:
        "Lumbar flexion restricted to 45 deg with mild spasm. SLR positive at 60 degrees on right side.",
      assessment:
        "Acute L4-L5 lumbar strain with secondary paraspinal muscle guarding.",
      plan:
        "Core stabilization exercises, gentle pelvic tilts, thermotherapy, and ergonomic advice.",
    },
    create: {
      id: "note_demo_01",
      clinicId,
      patientId: patient1.id,
      sessionId: session1.id,
      subjective:
        "Patient reports localized L4-L5 lumbar pain rating 6/10 aggravated by prolonged sitting.",
      objective:
        "Lumbar flexion restricted to 45 deg with mild spasm. SLR positive at 60 degrees on right side.",
      assessment:
        "Acute L4-L5 lumbar strain with secondary paraspinal muscle guarding.",
      plan:
        "Core stabilization exercises, gentle pelvic tilts, thermotherapy, and ergonomic advice.",
    },
  });

  const session2 = await prisma.session.upsert({
    where: { id_clinicId: { id: "session_demo_02", clinicId } },
    update: {
      patientId: patient1.id,
      startedAt: new Date("2026-07-22T10:00:00.000Z"),
      visitType: "Follow-up",
      noteStatus: NoteStatus.finalized,
      finalNote:
        "SUBJECTIVE:\nPain reduced to 3/10. Able to sit comfortably for 45 minutes without sharp pain.\n\nOBJECTIVE:\nLumbar flexion improved to 70 deg. Palpation shows reduced spasm in lumbar erectores. SLR negative bilaterally.\n\nASSESSMENT:\nSubacute lumbar strain showing positive recovery trajectory with physical therapy.\n\nPLAN:\nProgress to bird-dog exercises, seated lumbar extensions, and return-to-work mobility guidance.",
      patientSummary:
        "Continue core stabilization regime. Add bird-dog exercise (2 sets of 8 per side). Next checkup scheduled in 1 week.",
      priorPlan: "Core stabilization exercises, gentle pelvic tilts",
    },
    create: {
      id: "session_demo_02",
      clinicId,
      patientId: patient1.id,
      startedAt: new Date("2026-07-22T10:00:00.000Z"),
      visitType: "Follow-up",
      noteStatus: NoteStatus.finalized,
      finalNote:
        "SUBJECTIVE:\nPain reduced to 3/10. Able to sit comfortably for 45 minutes without sharp pain.\n\nOBJECTIVE:\nLumbar flexion improved to 70 deg. Palpation shows reduced spasm in lumbar erectores. SLR negative bilaterally.\n\nASSESSMENT:\nSubacute lumbar strain showing positive recovery trajectory with physical therapy.\n\nPLAN:\nProgress to bird-dog exercises, seated lumbar extensions, and return-to-work mobility guidance.",
      patientSummary:
        "Continue core stabilization regime. Add bird-dog exercise (2 sets of 8 per side). Next checkup scheduled in 1 week.",
      priorPlan: "Core stabilization exercises, gentle pelvic tilts",
    },
  });

  await prisma.progressNote.upsert({
    where: { sessionId_clinicId: { sessionId: session2.id, clinicId } },
    update: {
      patientId: patient1.id,
      subjective:
        "Pain reduced to 3/10. Able to sit comfortably for 45 minutes without sharp pain.",
      objective:
        "Lumbar flexion improved to 70 deg. Palpation shows reduced spasm in lumbar erectores. SLR negative bilaterally.",
      assessment:
        "Subacute lumbar strain showing positive recovery trajectory with physical therapy.",
      plan:
        "Progress to bird-dog exercises, seated lumbar extensions, and return-to-work mobility guidance.",
    },
    create: {
      id: "note_demo_02",
      clinicId,
      patientId: patient1.id,
      sessionId: session2.id,
      subjective:
        "Pain reduced to 3/10. Able to sit comfortably for 45 minutes without sharp pain.",
      objective:
        "Lumbar flexion improved to 70 deg. Palpation shows reduced spasm in lumbar erectores. SLR negative bilaterally.",
      assessment:
        "Subacute lumbar strain showing positive recovery trajectory with physical therapy.",
      plan:
        "Progress to bird-dog exercises, seated lumbar extensions, and return-to-work mobility guidance.",
    },
  });

  const session3 = await prisma.session.upsert({
    where: { id_clinicId: { id: "session_demo_03", clinicId } },
    update: {
      patientId: patient2.id,
      startedAt: new Date("2026-07-22T11:30:00.000Z"),
      visitType: "Follow-up",
      noteStatus: NoteStatus.draft,
      finalNote: null,
      patientSummary: null,
      priorPlan: "Shoulder abduction mobilization and posture correction",
    },
    create: {
      id: "session_demo_03",
      clinicId,
      patientId: patient2.id,
      startedAt: new Date("2026-07-22T11:30:00.000Z"),
      visitType: "Follow-up",
      noteStatus: NoteStatus.draft,
      finalNote: null,
      patientSummary: null,
      priorPlan: "Shoulder abduction mobilization and posture correction",
    },
  });

  // 5. Appointments (4 appointments)
  await prisma.appointment.upsert({
    where: { id_clinicId: { id: "apptn_demo_01", clinicId } },
    update: {
      patientId: patient1.id,
      patientNameSnapshot: "Rajesh Sharma",
      scheduledAt: new Date("2026-07-20T09:00:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session1.id,
      notes: "Initial consultation and baseline range of motion assessment.",
      syncStatus: SyncStatus.manual,
    },
    create: {
      id: "apptn_demo_01",
      clinicId,
      patientId: patient1.id,
      patientNameSnapshot: "Rajesh Sharma",
      scheduledAt: new Date("2026-07-20T09:00:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session1.id,
      notes: "Initial consultation and baseline range of motion assessment.",
      syncStatus: SyncStatus.manual,
    },
  });

  await prisma.appointment.upsert({
    where: { id_clinicId: { id: "apptn_demo_02", clinicId } },
    update: {
      patientId: patient1.id,
      patientNameSnapshot: "Rajesh Sharma",
      scheduledAt: new Date("2026-07-22T10:00:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session2.id,
      notes: "Follow-up session focusing on core stability exercises.",
      syncStatus: SyncStatus.manual,
    },
    create: {
      id: "apptn_demo_02",
      clinicId,
      patientId: patient1.id,
      patientNameSnapshot: "Rajesh Sharma",
      scheduledAt: new Date("2026-07-22T10:00:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session2.id,
      notes: "Follow-up session focusing on core stability exercises.",
      syncStatus: SyncStatus.manual,
    },
  });

  await prisma.appointment.upsert({
    where: { id_clinicId: { id: "apptn_demo_03", clinicId } },
    update: {
      patientId: patient2.id,
      patientNameSnapshot: "Priya Patel",
      scheduledAt: new Date("2026-07-22T11:30:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session3.id,
      notes: "Shoulder mobilities and eccentric rotator cuff strengthening.",
      syncStatus: SyncStatus.manual,
    },
    create: {
      id: "apptn_demo_03",
      clinicId,
      patientId: patient2.id,
      patientNameSnapshot: "Priya Patel",
      scheduledAt: new Date("2026-07-22T11:30:00.000Z"),
      durationMinutes: 45,
      status: AppointmentStatus.completed,
      linkedSessionId: session3.id,
      notes: "Shoulder mobilities and eccentric rotator cuff strengthening.",
      syncStatus: SyncStatus.manual,
    },
  });

  await prisma.appointment.upsert({
    where: { id_clinicId: { id: "apptn_demo_04", clinicId } },
    update: {
      patientId: patient3.id,
      patientNameSnapshot: "Amit Kumar",
      scheduledAt: new Date("2026-07-23T14:00:00.000Z"),
      durationMinutes: 60,
      status: AppointmentStatus.upcoming,
      linkedSessionId: null,
      notes: "Progressive resistance training for knee stability.",
      syncStatus: SyncStatus.manual,
    },
    create: {
      id: "apptn_demo_04",
      clinicId,
      patientId: patient3.id,
      patientNameSnapshot: "Amit Kumar",
      scheduledAt: new Date("2026-07-23T14:00:00.000Z"),
      durationMinutes: 60,
      status: AppointmentStatus.upcoming,
      linkedSessionId: null,
      notes: "Progressive resistance training for knee stability.",
      syncStatus: SyncStatus.manual,
    },
  });

  console.log("Database seeded successfully.");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
