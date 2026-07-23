import type { ConditionTemplate, TemplateCategory } from "../../../../shared/contracts/notes.js";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Neurological",
  "Sports",
  "Orthopedic",
  "General",
];

function createTemplate(
  key: ConditionTemplate["key"],
  label: string,
  category: TemplateCategory,
  description: string,
  conditionTags: string[],
  sections: ConditionTemplate["sections"],
): ConditionTemplate {
  return { key, label, category, description, conditionTags, sections, source: "built_in", categories: [category] };
}

export const CONDITION_TEMPLATES: ConditionTemplate[] = [
  // --- Neurological ---
  createTemplate("neuro_stroke_rehab", "Stroke Rehabilitation", "Neurological", "Standard progression for post-CVA mobility and ADL recovery.", ["Neurological", "Stroke", "CVA", "Mobility", "ADL"], {
    subjective: "Patient reports current fatigue levels, recent changes in spasticity or tone, and any falls or near-falls at home. Caregiver input regarding assist levels for transfers.",
    objective: "Assessment of bed mobility, sit-to-stand transfers, and gait pattern (with/without AD). Evaluation of upper/lower extremity tone (Modified Ashworth) and functional reach.",
    assessment: "Continued deficits in dynamic balance and hemiparetic limb control affecting safe independent mobility. Good potential for functional gains with task-specific training.",
    plan: "Progress gait training over varied surfaces. Emphasize weight shifting to the affected side. Continue caregiver education for safe assist during ADLs."
  }),
  createTemplate("neuro_parkinsons", "Parkinson's Disease Mgmt", "Neurological", "Focus on freezing of gait, rigidity, and large amplitude movements.", ["Neurological", "Parkinsons", "PD", "Gait", "Rigidity"], {
    subjective: "Fluctuations in medication efficacy ('on/off' times). Reports of freezing of gait episodes, especially in narrow spaces or turning. General stiffness and fatigue.",
    objective: "TUG test, 10-Meter Walk Test assessing step length and cadence. Observation of resting/action tremor, bradykinesia, and postural instability during dual-tasking.",
    assessment: "Impaired gait mechanics characterized by shuffling and reduced arm swing, increasing fall risk. Responds well to external auditory and visual cueing.",
    plan: "Implement LSVT BIG principles focusing on large amplitude movements. Practice turning strategies and dual-task activities. Educate on fall recovery techniques."
  }),
  createTemplate("neuro_ms", "Multiple Sclerosis Eval", "Neurological", "Energy conservation, heat sensitivity, and balance assessment for MS.", ["Neurological", "MS", "Fatigue", "Balance"], {
    subjective: "Current exacerbation status. Impact of heat or stress on symptoms. Daily fatigue patterns (e.g., worsening in afternoon) and current mobility baseline.",
    objective: "Fatigue Severity Scale (FSS). Dynamic Gait Index (DGI). Assessment of cerebellar signs (ataxia, intention tremor) and sensory deficits affecting proprioception.",
    assessment: "Mobility limited primarily by central fatigue and diminished proprioceptive feedback. Safety is compromised during prolonged ambulation without an assistive device.",
    plan: "Introduce energy conservation techniques and pacing. Progressive resistance training at sub-maximal levels to avoid overheating. Prescribe appropriate ankle-foot orthosis (AFO) if indicated."
  }),

  // --- Sports ---
  createTemplate("sports_acl_return", "ACL Return to Sport", "Sports", "Late-stage rehab focusing on plyometrics, agility, and cutting.", ["Sports", "ACL", "Post-op", "Agility", "Return to Play"], {
    subjective: "Confidence levels with jumping/cutting maneuvers. Any apprehension or giving-way sensations during practice. Reports of post-activity swelling or stiffness.",
    objective: "Single Leg Hop for Distance, Triple Hop, and Crossover Hop tests (aiming for >90% LSI). Y-Balance test. Observation of dynamic valgus during drop jumps.",
    assessment: "Demonstrating adequate quad strength but lacks deceleration control during unplanned cutting tasks. Ready to progress to non-contact sport-specific drills.",
    plan: "Advance plyometric load focusing on landing mechanics. Initiate reactive agility drills. Re-evaluate hop symmetry in 2 weeks prior to full clearance."
  }),
  createTemplate("sports_rotator_cuff", "Overhead Athlete RC", "Sports", "Rotator cuff tendinopathy protocol for throwers/swimmers.", ["Sports", "Shoulder", "Rotator Cuff", "Throwing"], {
    subjective: "Pain during specific phases of the throwing/swimming motion (e.g., late cocking, deceleration). Warm-up time required. Resting/night pain levels.",
    objective: "Scapular dyskinesis assessment. Glenohumeral internal rotation deficit (GIRD) measurement. Resisted ER/IR strength testing in 90/90 position. Empty Can test.",
    assessment: "Primary impingement secondary to posterior capsule tightness and poor scapular upward rotation. Weakness in eccentric external rotators.",
    plan: "Sleeper stretches for posterior capsule. Scapular stabilization exercises (Y, T, Ws). Eccentric ER strengthening. Graduated interval throwing program."
  }),
  createTemplate("sports_ankle_sprain", "Acute Lateral Ankle Sprain", "Sports", "Early management of inversion ankle sprain in athletes.", ["Sports", "Ankle", "Sprain", "Acute"], {
    subjective: "Mechanism of injury (plantarflexion/inversion). Ability to bear weight immediately post-injury. Current pain and throbbing at rest.",
    objective: "Figure-of-8 swelling measurement. Anterior Drawer and Talar Tilt tests for laxity. Active/Passive ROM deficits in dorsiflexion and eversion.",
    assessment: "Grade II ATFL sprain. Significant effusion and restricted dorsiflexion currently limiting normal gait mechanics. Low suspicion for fracture (Ottawa rules negative).",
    plan: "PRICE protocol. Isometrics in pain-free range. Grade I/II joint mobilizations for pain relief. Initiate early weight-bearing as tolerated in a walking boot."
  }),

  // --- Orthopedic ---
  createTemplate("ortho_tka", "Total Knee Arthroplasty", "Orthopedic", "Standard post-op TKA progression focusing on ROM and quad activation.", ["Orthopedic", "Knee", "TKA", "Post-op"], {
    subjective: "Pain management and compliance with medication. Sleep quality. Tolerance to continuous passive motion (CPM) or home exercise program (HEP).",
    objective: "Incision healing status. Knee active and passive ROM (extension lag, maximum flexion). Straight leg raise (SLR) for quad lag. Timed Up and Go (TUG).",
    assessment: "Progressing as expected. Achieving 0-90 degrees ROM. Mild quad inhibition present, requiring cueing for terminal knee extension during gait.",
    plan: "Aggressive passive extension stretching. NMES for quad facilitation during SLR. Progress from walker to cane for indoor mobility. Emphasize heel strike."
  }),
  createTemplate("ortho_cervical_radic", "Cervical Radiculopathy", "Orthopedic", "Assessment and treatment of radiating neck and arm pain.", ["Orthopedic", "Spine", "Cervical", "Nerve", "Radiculopathy"], {
    subjective: "Description of radiating pain (dermatomal pattern). Aggravating factors (looking up, driving). Presence of numbness, tingling, or weakness in the hand/arm.",
    objective: "Cervical ROM (extension and ipsilateral rotation often restricted). Spurling's test. Upper limb tension test (ULTT). Dermatome/myotome/reflex screen.",
    assessment: "Consistent with C6 radiculopathy. Symptoms centralize with cervical retraction and extension. Demonstrates poor deep neck flexor endurance.",
    plan: "Mechanical diagnosis and therapy (MDT) extension principles. Manual cervical traction. Deep neck flexor training. Postural re-education for workstation."
  }),
  createTemplate("ortho_plantar_fasciitis", "Plantar Fasciopathy", "Orthopedic", "Heel pain management focusing on tissue loading and biomechanics.", ["Orthopedic", "Foot", "Heel", "Fasciitis"], {
    subjective: "Severity of first-step pain in the morning. Pain behavior after periods of rest vs. prolonged standing. Recent changes in footwear or training volume.",
    objective: "Palpation of the medial calcaneal tubercle. Windlass test. Assessment of ankle dorsiflexion ROM (gastrocnemius/soleus flexibility). Foot posture index.",
    assessment: "Chronic plantar fasciopathy likely driven by restricted ankle dorsiflexion and rapid increase in training load. Windlass mechanism is symptomatic.",
    plan: "Heavy slow resistance (HSR) training for the plantar fascia. Calf stretching program. Recommend temporary use of orthotics or taping for load reduction."
  }),
  createTemplate("ortho_hip_oa", "Hip Osteoarthritis", "Orthopedic", "Conservative management of hip OA to improve function and delay surgery.", ["Orthopedic", "Hip", "OA", "Arthritis"], {
    subjective: "Groin or anterior thigh pain. Morning stiffness lasting less than 60 minutes. Difficulty with putting on socks/shoes or getting out of a low chair.",
    objective: "Hip ROM (FABER, internal rotation usually most limited). Trendelenburg sign. 30-Second Chair Stand test. Hip abductor and extensor strength.",
    assessment: "Moderate hip OA limiting functional mobility. Gluteal weakness contributing to compensated Trendelenburg gait and increased joint loading.",
    plan: "Hip mobility exercises (stationary bike, gentle stretching). Strengthen gluteus medius and maximus. Aquatic therapy if available. Discuss weight management."
  }),

  // --- General ---
  createTemplate("gen_pelvic_floor", "Pelvic Floor Dysfunction", "General", "Initial assessment for incontinence or pelvic pain.", ["General", "Pelvic", "Incontinence", "Pain"], {
    subjective: "Type and frequency of incontinence (stress vs. urge). Fluid intake habits. Presence of pelvic pain during intercourse or sitting. Obstetric history.",
    objective: "External observation of perineum. Internal assessment (if consented and appropriate) for pelvic floor muscle resting tone, strength (PERFECT scheme), and endurance.",
    assessment: "Stress urinary incontinence secondary to pelvic floor muscle underactivity and poor timing of contractions during intra-abdominal pressure increases.",
    plan: "Pelvic floor muscle training (Kegels) focusing on the 'Knack' before coughing/sneezing. Bladder diary completion for next visit. Core stabilization integration."
  }),
  createTemplate("gen_cardiac_rehab", "Cardiac Rehab Phase II", "General", "Outpatient exercise progression following a cardiac event.", ["General", "Cardiovascular", "Cardiac", "Endurance"], {
    subjective: "Reports of angina, palpitations, or excessive shortness of breath during daily activities. Compliance with cardiac medications. Current perceived exertion (RPE).",
    objective: "Pre/post vitals (BP, HR, SpO2). 6-Minute Walk Test distance. Telemetry monitoring during treadmill or ergometer exercise. RPE tracking.",
    assessment: "Demonstrating appropriate hemodynamic response to low-intensity aerobic exercise. Functional capacity is currently ~4 METs. No ST changes on telemetry.",
    plan: "Progress aerobic duration from 15 to 20 minutes. Maintain RPE between 11-13 (Borg scale). Introduce light resistance band training for upper body."
  }),
  createTemplate("gen_chronic_pain", "Chronic Pain Management", "General", "Biopsychosocial approach to long-standing widespread pain.", ["General", "Pain", "Chronic", "Fibromyalgia"], {
    subjective: "Pain mapping (widespread vs. localized). Sleep quality and duration. Fear-avoidance behaviors and impact on daily functioning. Current stress levels.",
    objective: "Brief Pain Inventory. Tampa Scale of Kinesiophobia. Assessment of general mobility and tolerance to light touch (allodynia).",
    assessment: "Central sensitization features present. High fear-avoidance is the primary barrier to increasing physical activity. Mechanical dysfunction is secondary.",
    plan: "Pain neuroscience education (PNE). Graded exposure to feared movements. Establish a quota-based, rather than pain-based, walking program. Relaxation techniques."
  })
];