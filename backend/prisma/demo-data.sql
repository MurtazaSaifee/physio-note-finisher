-- Demo seed for Physio Note Finisher (local tier only).
-- Replaces ALL patient data (patients, sessions, notes, appointments, exports,
-- consents, voice jobs) for the clinic of :demo_email, using dates relative to today.
-- Usage: npm run db:setup (fresh Docker DB) or scripts/seed-demo-data.sh (existing local DB; takes a pg_dump backup first)
begin;
set local session_replication_role = replica;
create temp table demo_clinic as select "clinicId" id from "User" where email = :'demo_email';
do $$ begin if (select count(*) from demo_clinic) <> 1 then raise exception 'demo user not found'; end if; end $$;

delete from "ProgressNote" where "clinicId" in (select id from demo_clinic);
delete from "ExportRecord" where "clinicId" in (select id from demo_clinic);
delete from "VoiceJob" where "clinicId" in (select id from demo_clinic);
delete from "VoiceUpload" where "clinicId" in (select id from demo_clinic);
delete from "PatientConsent" where "clinicId" in (select id from demo_clinic);
delete from "Appointment" where "clinicId" in (select id from demo_clinic);
delete from "Session" where "clinicId" in (select id from demo_clinic);
delete from "Patient" where "clinicId" in (select id from demo_clinic);

insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-rohan', id, $q$Rohan Mehta$q$, '1991-04-12', 'male', $q$+91 90000 10001$q$, $q$rohan.mehta@example.com$q$, $q$Pune, Maharashtra$q$, $q$Recreational footballer. Right ankle inversion injury during a weekend match.$q$, ARRAY['ankle sprain','sports injury']::text[], now(), now() from demo_clinic;
insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-ananya', id, $q$Ananya Iyer$q$, '1974-09-03', 'female', $q$+91 90000 10002$q$, $q$ananya.iyer@example.com$q$, $q$Chennai, Tamil Nadu$q$, $q$Software lead. Recurrent lower back pain with right-leg radiation, worse with prolonged sitting.$q$, ARRAY['lower back pain','sciatica']::text[], now(), now() from demo_clinic;
insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-karthik', id, $q$Karthik Reddy$q$, '1998-01-21', 'male', $q$+91 90000 10003$q$, $q$karthik.reddy@example.com$q$, $q$Hyderabad, Telangana$q$, $q$Left ACL reconstruction (hamstring graft), post-op week 8. Cleared by surgeon for progressive loading.$q$, ARRAY['ACL reconstruction','post-op rehab']::text[], now(), now() from demo_clinic;
insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-sunita', id, $q$Sunita Patel$q$, '1965-06-17', 'female', $q$+91 90000 10004$q$, $q$sunita.patel@example.com$q$, $q$Ahmedabad, Gujarat$q$, $q$Retired teacher. Gradual onset left shoulder stiffness, diabetic.$q$, ARRAY['frozen shoulder','adhesive capsulitis']::text[], now(), now() from demo_clinic;
insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-imran', id, $q$Imran Qureshi$q$, '1981-11-30', 'male', $q$+91 90000 10005$q$, $q$imran.qureshi@example.com$q$, $q$Mumbai, Maharashtra$q$, $q$Recreational runner (25 km/week). Heel pain on first steps in the morning.$q$, ARRAY['plantar fasciitis','running injury']::text[], now(), now() from demo_clinic;
insert into "Patient"(id,"clinicId","fullName","dateOfBirth",sex,phone,email,"addressLine","clinicalNotes","conditionTags","createdAt","updatedAt")
select 'demo-pt-priya', id, $q$Priya Nair$q$, '1987-02-08', 'female', $q$+91 90000 10006$q$, $q$priya.nair@example.com$q$, $q$Bengaluru, Karnataka$q$, $q$Desk-based designer. Neck and upper-trapezius tension with headaches by evening.$q$, ARRAY['neck pain','postural']::text[], now(), now() from demo_clinic;

insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-1', id, 'demo-pt-rohan', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -12, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Initial Evaluation$q$, 'finalized', $q$Subjective:
Twisted right ankle 3 days ago playing football. Pain 7/10 on weight bearing, lateral swelling, difficulty with stairs. No prior ankle injuries.

Objective:
Lateral ankle swelling and ecchymosis. Tender over ATFL. Anterior drawer mildly positive. DF 5 deg, PF 30 deg. Antalgic gait with crutch.

Assessment:
Grade II lateral ankle sprain (ATFL). No signs of fracture (Ottawa rules negative).

Plan:
PRICE protocol, ankle brace, protected weight bearing. Gentle ROM and isometrics. Review in 4 days.$q$, $q$You have a moderate ankle sprain. Rest, ice and elevate it, wear the brace, and do the gentle movement exercises we showed you. We will review in 4 days.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -12, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-1', id, 'demo-pt-rohan', 'demo-s-1', $q$Twisted right ankle 3 days ago playing football. Pain 7/10 on weight bearing, lateral swelling, difficulty with stairs. No prior ankle injuries.$q$, $q$Lateral ankle swelling and ecchymosis. Tender over ATFL. Anterior drawer mildly positive. DF 5 deg, PF 30 deg. Antalgic gait with crutch.$q$, $q$Grade II lateral ankle sprain (ATFL). No signs of fracture (Ottawa rules negative).$q$, $q$PRICE protocol, ankle brace, protected weight bearing. Gentle ROM and isometrics. Review in 4 days.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -12, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s1', id, 'demo-pt-rohan', (select "fullName" from "Patient" where id='demo-pt-rohan'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -12, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 60, 'completed', 'demo-s-1', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-2', id, 'demo-pt-rohan', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -8, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Pain down to 4/10. Walking without crutch indoors. Swelling reducing.

Objective:
Swelling mild. DF 10 deg, PF 40 deg. Single-leg stance 8 s. Tenderness over ATFL reduced.

Assessment:
Good early recovery. Proprioception deficit remains.

Plan:
Add resistance-band eversion, calf raises (double leg), balance board. Wean brace outdoors only.$q$, $q$Healing well. Start the band and balance exercises daily and keep the brace for outdoor walking.$q$, $q$PRICE protocol, ankle brace, protected weight bearing. Gentle ROM and isometrics. Review in 4 days.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -8, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-2', id, 'demo-pt-rohan', 'demo-s-2', $q$Pain down to 4/10. Walking without crutch indoors. Swelling reducing.$q$, $q$Swelling mild. DF 10 deg, PF 40 deg. Single-leg stance 8 s. Tenderness over ATFL reduced.$q$, $q$Good early recovery. Proprioception deficit remains.$q$, $q$Add resistance-band eversion, calf raises (double leg), balance board. Wean brace outdoors only.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -8, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s2', id, 'demo-pt-rohan', (select "fullName" from "Patient" where id='demo-pt-rohan'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -8, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-2', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-3', id, 'demo-pt-rohan', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -3, hours => 15, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Pain 2/10, only after long walks. Jogging not yet attempted. Confident on stairs.

Objective:
No swelling. DF 15 deg, PF 48 deg. Single-leg stance 25 s, hop test pain-free x5. Strength 4+/5 evertors.

Assessment:
Near-full recovery. Ready for graded return to running.

Plan:
Walk-jog progression 3x/week, single-leg calf raises, agility ladder. Football return in 2-3 weeks if pain-free.$q$, $q$Great progress. Start light jogging this week, keep strengthening, and we will plan your return to football at the next visit.$q$, $q$Add resistance-band eversion, calf raises (double leg), balance board. Wean brace outdoors only.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -3, hours => 15, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-3', id, 'demo-pt-rohan', 'demo-s-3', $q$Pain 2/10, only after long walks. Jogging not yet attempted. Confident on stairs.$q$, $q$No swelling. DF 15 deg, PF 48 deg. Single-leg stance 25 s, hop test pain-free x5. Strength 4+/5 evertors.$q$, $q$Near-full recovery. Ready for graded return to running.$q$, $q$Walk-jog progression 3x/week, single-leg calf raises, agility ladder. Football return in 2-3 weeks if pain-free.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -3, hours => 15, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s3', id, 'demo-pt-rohan', (select "fullName" from "Patient" where id='demo-pt-rohan'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -3, hours => 15, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-3', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-4', id, 'demo-pt-ananya', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -10, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Initial Evaluation$q$, 'finalized', $q$Subjective:
3 months of lower back pain radiating to right buttock and posterior thigh. 6/10, worse after sitting over 30 min and in the morning. No bladder or bowel changes, no night pain.

Objective:
Lumbar flexion limited to 50%, extension painful. Right SLR positive at 55 deg. Reflexes and power intact. Tight hamstrings and hip flexors. Poor core endurance (plank 20 s).

Assessment:
Mechanical low back pain with right L5-S1 radicular features. No red flags.

Plan:
McKenzie extension exercises, neural glides, core activation. Ergonomic advice and hourly movement breaks. Review in 5 days.$q$, $q$Your back pain is mechanical and nerve-related, and no serious signs were found. Do the extension and nerve glide exercises, take a movement break every hour, and come back in 5 days.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -10, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-4', id, 'demo-pt-ananya', 'demo-s-4', $q$3 months of lower back pain radiating to right buttock and posterior thigh. 6/10, worse after sitting over 30 min and in the morning. No bladder or bowel changes, no night pain.$q$, $q$Lumbar flexion limited to 50%, extension painful. Right SLR positive at 55 deg. Reflexes and power intact. Tight hamstrings and hip flexors. Poor core endurance (plank 20 s).$q$, $q$Mechanical low back pain with right L5-S1 radicular features. No red flags.$q$, $q$McKenzie extension exercises, neural glides, core activation. Ergonomic advice and hourly movement breaks. Review in 5 days.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -10, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s4', id, 'demo-pt-ananya', (select "fullName" from "Patient" where id='demo-pt-ananya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -10, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 60, 'completed', 'demo-s-4', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-5', id, 'demo-pt-ananya', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -5, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Pain 4/10. Leg symptoms less frequent. Doing exercises twice daily. Sat through a 2-hour meeting with mild discomfort.

Objective:
Lumbar flexion 70%. Right SLR 70 deg. Plank 35 s. Improved neural mobility.

Assessment:
Responding well. Centralisation of symptoms.

Plan:
Progress to bird-dog, dead bug, glute bridges. Continue neural glides. Add walking 20 min daily.$q$, $q$Good improvement. Add the new core exercises and a daily 20-minute walk.$q$, $q$McKenzie extension exercises, neural glides, core activation. Ergonomic advice and hourly movement breaks. Review in 5 days.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -5, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-5', id, 'demo-pt-ananya', 'demo-s-5', $q$Pain 4/10. Leg symptoms less frequent. Doing exercises twice daily. Sat through a 2-hour meeting with mild discomfort.$q$, $q$Lumbar flexion 70%. Right SLR 70 deg. Plank 35 s. Improved neural mobility.$q$, $q$Responding well. Centralisation of symptoms.$q$, $q$Progress to bird-dog, dead bug, glute bridges. Continue neural glides. Add walking 20 min daily.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -5, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s5', id, 'demo-pt-ananya', (select "fullName" from "Patient" where id='demo-pt-ananya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -5, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-5', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-6', id, 'demo-pt-ananya', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Pain 2/10, no leg symptoms this week. Back stiffness in the morning resolves in minutes.

Objective:
Lumbar flexion near full. SLR negative bilaterally. Plank 55 s. Good hip hinge pattern.

Assessment:
Radicular symptoms resolved. Residual core endurance deficit.

Plan:
Strengthening block 2x/week, hip hinge loading, maintenance mobility. Review in 2 weeks, then discharge to self-management.$q$, $q$Leg symptoms have settled. Continue strengthening twice a week and we will review in 2 weeks.$q$, $q$Progress to bird-dog, dead bug, glute bridges. Continue neural glides. Add walking 20 min daily.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-6', id, 'demo-pt-ananya', 'demo-s-6', $q$Pain 2/10, no leg symptoms this week. Back stiffness in the morning resolves in minutes.$q$, $q$Lumbar flexion near full. SLR negative bilaterally. Plank 55 s. Good hip hinge pattern.$q$, $q$Radicular symptoms resolved. Residual core endurance deficit.$q$, $q$Strengthening block 2x/week, hip hinge loading, maintenance mobility. Review in 2 weeks, then discharge to self-management.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s6', id, 'demo-pt-ananya', (select "fullName" from "Patient" where id='demo-pt-ananya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-6', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-7', id, 'demo-pt-karthik', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -9, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Post-op week 7. No giving way. Mild anterior knee ache after cycling. Wants to start gym work.

Objective:
Effusion trace. ROM 0-130 deg. Quad lag nil. Single-leg squat to 45 deg with valgus tendency. Quad LSI 62%.

Assessment:
Progressing as expected. Quadriceps strength and dynamic valgus control are the priorities.

Plan:
Leg press, step-downs with mirror feedback, hamstring curls within graft protocol. No pivoting sports yet.$q$, $q$Knee is progressing on schedule. Focus on quad strength and keeping your knee in line over your toes during step-downs.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -9, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-7', id, 'demo-pt-karthik', 'demo-s-7', $q$Post-op week 7. No giving way. Mild anterior knee ache after cycling. Wants to start gym work.$q$, $q$Effusion trace. ROM 0-130 deg. Quad lag nil. Single-leg squat to 45 deg with valgus tendency. Quad LSI 62%.$q$, $q$Progressing as expected. Quadriceps strength and dynamic valgus control are the priorities.$q$, $q$Leg press, step-downs with mirror feedback, hamstring curls within graft protocol. No pivoting sports yet.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -9, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s7', id, 'demo-pt-karthik', (select "fullName" from "Patient" where id='demo-pt-karthik'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -9, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-7', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-8', id, 'demo-pt-karthik', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -2, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Post-op week 8. Pain-free in daily activities. Gym sessions twice a week, no swelling after.

Objective:
No effusion. ROM 0-135 deg. Quad LSI 70%. Single-leg squat improved, mild valgus at depth. Hop testing deferred.

Assessment:
Good strength gains. Still below criteria for running progression.

Plan:
Increase leg press load, add Bulgarian split squats, begin straight-line treadmill walking incline. Recheck LSI in 2 weeks.$q$, $q$Strength is improving. Continue the gym program and treadmill incline walking. No running yet.$q$, $q$Leg press, step-downs with mirror feedback, hamstring curls within graft protocol. No pivoting sports yet.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -2, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-8', id, 'demo-pt-karthik', 'demo-s-8', $q$Post-op week 8. Pain-free in daily activities. Gym sessions twice a week, no swelling after.$q$, $q$No effusion. ROM 0-135 deg. Quad LSI 70%. Single-leg squat improved, mild valgus at depth. Hop testing deferred.$q$, $q$Good strength gains. Still below criteria for running progression.$q$, $q$Increase leg press load, add Bulgarian split squats, begin straight-line treadmill walking incline. Recheck LSI in 2 weeks.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -2, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s8', id, 'demo-pt-karthik', (select "fullName" from "Patient" where id='demo-pt-karthik'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -2, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-8', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-9', id, 'demo-pt-karthik', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 9, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
No new complaints. Completed all home exercises. Mild fatigue in quads after leg day.

Objective:
ROM full. Quad LSI 74% on handheld dynamometry. Controlled step-down x10 without valgus.

Assessment:
On track at week 8-9. Neuromuscular control now good.

Plan:
Continue progressive loading, add Nordic hamstring negatives (low volume). Plan isokinetic test at week 12.$q$, $q$Everything is on track. We will add a hamstring exercise and test your strength again at week 12.$q$, $q$Increase leg press load, add Bulgarian split squats, begin straight-line treadmill walking incline. Recheck LSI in 2 weeks.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 9, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-9', id, 'demo-pt-karthik', 'demo-s-9', $q$No new complaints. Completed all home exercises. Mild fatigue in quads after leg day.$q$, $q$ROM full. Quad LSI 74% on handheld dynamometry. Controlled step-down x10 without valgus.$q$, $q$On track at week 8-9. Neuromuscular control now good.$q$, $q$Continue progressive loading, add Nordic hamstring negatives (low volume). Plan isokinetic test at week 12.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 9, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s9', id, 'demo-pt-karthik', (select "fullName" from "Patient" where id='demo-pt-karthik'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 9, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-9', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-10', id, 'demo-pt-sunita', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -11, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Initial Evaluation$q$, 'finalized', $q$Subjective:
Left shoulder stiffness for 4 months, worse at night. Cannot reach behind back or comb hair. Type 2 diabetes for 12 years.

Objective:
Active/passive flexion 95/110 deg, abduction 80 deg, ER 15 deg (capsular pattern). End-feel firm. Neurovascular intact.

Assessment:
Adhesive capsulitis, freezing-to-frozen stage, diabetes-associated.

Plan:
Heat before exercise, pendulums, table slides, gentle capsular stretching in pain-free range. Sleep positioning advice. Review in 1 week.$q$, $q$You have a frozen shoulder. Use heat first, then do the gentle pendulum and sliding exercises twice a day. Do not force the stretch.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -11, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-10', id, 'demo-pt-sunita', 'demo-s-10', $q$Left shoulder stiffness for 4 months, worse at night. Cannot reach behind back or comb hair. Type 2 diabetes for 12 years.$q$, $q$Active/passive flexion 95/110 deg, abduction 80 deg, ER 15 deg (capsular pattern). End-feel firm. Neurovascular intact.$q$, $q$Adhesive capsulitis, freezing-to-frozen stage, diabetes-associated.$q$, $q$Heat before exercise, pendulums, table slides, gentle capsular stretching in pain-free range. Sleep positioning advice. Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -11, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s10', id, 'demo-pt-sunita', (select "fullName" from "Patient" where id='demo-pt-sunita'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -11, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 60, 'completed', 'demo-s-10', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-11', id, 'demo-pt-sunita', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -4, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'finalized', $q$Subjective:
Night pain improved, now 4/10. Able to comb hair with help. Doing exercises twice daily.

Objective:
Flexion 110 deg, abduction 95 deg, ER 25 deg. Mobilisation tolerated well grade II-III.

Assessment:
Early improvement in mobility. Still in the stiff phase.

Plan:
Continue home program, add pulley and wand ER stretches. Grade III glenohumeral mobilisations. Review in 1 week.$q$, $q$Your shoulder is moving a little better. Keep going with the daily exercises and add the pulley and stick stretches.$q$, $q$Heat before exercise, pendulums, table slides, gentle capsular stretching in pain-free range. Sleep positioning advice. Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -4, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-11', id, 'demo-pt-sunita', 'demo-s-11', $q$Night pain improved, now 4/10. Able to comb hair with help. Doing exercises twice daily.$q$, $q$Flexion 110 deg, abduction 95 deg, ER 25 deg. Mobilisation tolerated well grade II-III.$q$, $q$Early improvement in mobility. Still in the stiff phase.$q$, $q$Continue home program, add pulley and wand ER stretches. Grade III glenohumeral mobilisations. Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -4, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s11', id, 'demo-pt-sunita', (select "fullName" from "Patient" where id='demo-pt-sunita'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -4, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-11', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-12', id, 'demo-pt-imran', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -7, hours => 8, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Initial Evaluation$q$, 'finalized', $q$Subjective:
Right heel pain for 6 weeks, sharpest with first steps in the morning, eases then returns after running. Increased weekly mileage by 40% recently.

Objective:
Tender over medial calcaneal tubercle. Windlass test positive. Tight gastrocnemius (DF 5 deg with knee extended). Mild pes planus.

Assessment:
Plantar fasciitis (right), associated with training load error and calf tightness.

Plan:
Reduce running 50%, plantar fascia and calf stretching, heel cups, rolling. Add single-leg calf raises with towel toe extension (high-load). Review in 1 week.$q$, $q$This is plantar fasciitis from a quick mileage increase. Cut running by half, stretch your calf and foot every day, and use the heel cups.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -7, hours => 8, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-12', id, 'demo-pt-imran', 'demo-s-12', $q$Right heel pain for 6 weeks, sharpest with first steps in the morning, eases then returns after running. Increased weekly mileage by 40% recently.$q$, $q$Tender over medial calcaneal tubercle. Windlass test positive. Tight gastrocnemius (DF 5 deg with knee extended). Mild pes planus.$q$, $q$Plantar fasciitis (right), associated with training load error and calf tightness.$q$, $q$Reduce running 50%, plantar fascia and calf stretching, heel cups, rolling. Add single-leg calf raises with towel toe extension (high-load). Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -7, hours => 8, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s12', id, 'demo-pt-imran', (select "fullName" from "Patient" where id='demo-pt-imran'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -7, hours => 8, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 60, 'completed', 'demo-s-12', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-13', id, 'demo-pt-imran', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 11, mins => 15)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Follow-up$q$, 'draft', NULL, NULL, $q$Reduce running 50%, plantar fascia and calf stretching, heel cups, rolling. Add single-leg calf raises with towel toe extension (high-load). Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 11, mins => 15)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-13', id, 'demo-pt-imran', 'demo-s-13', $q$Morning heel pain down from 7/10 to 3/10. Running 3 times a week at reduced distance. Compliant with stretches.$q$, NULL, NULL, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 11, mins => 15)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s13', id, 'demo-pt-imran', (select "fullName" from "Patient" where id='demo-pt-imran'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 11, mins => 15)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'completed', 'demo-s-13', 'manual', now(), now() from demo_clinic;
insert into "Session"(id,"clinicId","patientId","startedAt","visitType","noteStatus","finalNote","patientSummary","priorPlan","createdAt","updatedAt")
select 'demo-s-14', id, 'demo-pt-priya', (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), $q$Initial Evaluation$q$, 'finalized', $q$Subjective:
Neck pain and tightness for 2 months, worse by evening, with tension headaches 3 times a week. Works 9-10 hours at a laptop.

Objective:
Forward head posture, rounded shoulders. Cervical rotation 60 deg bilaterally, painful end-range right. Upper trapezius trigger points. Neurological screen normal.

Assessment:
Postural neck pain with upper trapezius myofascial trigger points and cervicogenic-type headaches.

Plan:
Deep neck flexor activation, scapular retraction, thoracic extension mobilisation, trigger point release. Workstation changes (monitor height, 30-30 breaks). Review in 1 week.$q$, $q$Your neck pain comes from long hours at the laptop. Raise your screen, take a short break every 30 minutes, and do the chin-tuck and shoulder blade exercises.$q$, NULL, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "ProgressNote"(id,"clinicId","patientId","sessionId",subjective,objective,assessment,plan,"createdAt","updatedAt")
select 'demo-n-14', id, 'demo-pt-priya', 'demo-s-14', $q$Neck pain and tightness for 2 months, worse by evening, with tension headaches 3 times a week. Works 9-10 hours at a laptop.$q$, $q$Forward head posture, rounded shoulders. Cervical rotation 60 deg bilaterally, painful end-range right. Upper trapezius trigger points. Neurological screen normal.$q$, $q$Postural neck pain with upper trapezius myofascial trigger points and cervicogenic-type headaches.$q$, $q$Deep neck flexor activation, scapular retraction, thoracic extension mobilisation, trigger point release. Workstation changes (monitor height, 30-30 breaks). Review in 1 week.$q$, (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"linkedSessionId","syncStatus","createdAt","updatedAt")
select 'demo-a-s14', id, 'demo-pt-priya', (select "fullName" from "Patient" where id='demo-pt-priya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -1, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 60, 'completed', 'demo-s-14', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x1', id, 'demo-pt-sunita', (select "fullName" from "Patient" where id='demo-pt-sunita'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x2', id, 'demo-pt-priya', (select "fullName" from "Patient" where id='demo-pt-priya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 0, hours => 17, mins => 15)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x3', id, 'demo-pt-karthik', (select "fullName" from "Patient" where id='demo-pt-karthik'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 2, hours => 9, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x4', id, 'demo-pt-imran', (select "fullName" from "Patient" where id='demo-pt-imran'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 2, hours => 14, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x5', id, 'demo-pt-rohan', (select "fullName" from "Patient" where id='demo-pt-rohan'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 3, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x6', id, 'demo-pt-ananya', (select "fullName" from "Patient" where id='demo-pt-ananya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 4, hours => 11, mins => 30)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x7', id, 'demo-pt-sunita', (select "fullName" from "Patient" where id='demo-pt-sunita'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 5, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x8', id, 'demo-pt-priya', (select "fullName" from "Patient" where id='demo-pt-priya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => 7, hours => 10, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'upcoming', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x9', id, 'demo-pt-priya', (select "fullName" from "Patient" where id='demo-pt-priya'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -4, hours => 14, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'missed', 'manual', now(), now() from demo_clinic;
insert into "Appointment"(id,"clinicId","patientId","patientNameSnapshot","scheduledAt","durationMinutes",status,"syncStatus","createdAt","updatedAt")
select 'demo-a-x10', id, 'demo-pt-sunita', (select "fullName" from "Patient" where id='demo-pt-sunita'), (((date_trunc('day', now() at time zone 'Asia/Kolkata') + make_interval(days => -5, hours => 16, mins => 0)) at time zone 'Asia/Kolkata') at time zone 'UTC'), 45, 'cancelled', 'manual', now(), now() from demo_clinic;

select (select count(*) from "Patient" where "clinicId" in (select id from demo_clinic)) patients,
       (select count(*) from "Session" where "clinicId" in (select id from demo_clinic)) sessions,
       (select count(*) from "Appointment" where "clinicId" in (select id from demo_clinic)) appointments;
commit;
