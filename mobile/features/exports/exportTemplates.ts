type FullNoteTemplateInput = {
  patientName: string;
  patientDateOfBirth: string;
  patientRecordId?: string;
  visitDate: string;
  visitType: string;
  clinicianName: string;
  clinicianLicense: string;
  sections: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  finalNote?: string;
};

type SummaryTemplateInput = {
  patientName: string;
  visitDate: string;
  patientSummary: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraphize(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function objectiveItems(value: string): string {
  return value
    .split("\n")
    .flatMap((item) => {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    })
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

export function buildFullNoteExportHtml(input: FullNoteTemplateInput): string {
  const hasSections =
    input.sections.subjective.trim().length > 0 ||
    input.sections.objective.trim().length > 0 ||
    input.sections.assessment.trim().length > 0 ||
    input.sections.plan.trim().length > 0;

  const patientMeta = [
    input.patientDateOfBirth ? `DOB: ${escapeHtml(input.patientDateOfBirth)}` : null,
    input.patientRecordId ? `Record: ${escapeHtml(input.patientRecordId)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const bodyContent = hasSections
    ? `
      <div class="section">
        <h2 class="section-label">Subjective</h2>
        <p>${paragraphize(input.sections.subjective)}</p>
      </div>
      <div class="section">
        <h2 class="section-label">Objective</h2>
        <ul>${objectiveItems(input.sections.objective)}</ul>
      </div>
      <div class="section">
        <h2 class="section-label">Assessment</h2>
        <p>${paragraphize(input.sections.assessment)}</p>
      </div>
      <div class="section">
        <h2 class="section-label">Plan</h2>
        <p>${paragraphize(input.sections.plan)}</p>
      </div>
    `
    : `
      <div class="section">
        <h2 class="section-label">Clinical Note</h2>
        <p>${paragraphize(input.finalNote ?? "")}</p>
      </div>
    `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 32px; color: #1d2734; background: #f6f4ef; }
          .paper { background: #fbfaf7; border-radius: 12px; padding: 32px; }
          .header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
          .title { font-size: 28px; font-weight: 700; margin: 0 0 8px; }
          .meta { color: #657080; font-size: 12px; }
          .visit-chip { color: #3f527a; font-size: 12px; font-weight: 700; }
          .section { border-top: 1px solid #d9dcd8; padding-top: 16px; margin-bottom: 24px; }
          .section-label { color: #1d2734; font-size: 14px; font-weight: 700; margin: 0 0 8px; }
          p, li { font-size: 14px; line-height: 1.6; }
          ul { padding-left: 20px; margin: 0; }
          .signoff { border-top: 1px solid #d9dcd8; margin-top: 36px; padding-top: 20px; }
          .signoff-name { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
          .signoff-license { color: #657080; font-size: 12px; margin: 0; }
        </style>
      </head>
      <body>
        <div class="paper">
          <div class="header">
            <div>
              <h1 class="title">${escapeHtml(input.patientName)}</h1>
              ${patientMeta ? `<div class="meta">${patientMeta}</div>` : ""}
            </div>
            <div>
              <div class="visit-chip">${escapeHtml(input.visitDate)}</div>
              <div class="meta">${escapeHtml(input.visitType)}</div>
            </div>
          </div>
          ${bodyContent}
          <div class="signoff">
            <p class="signoff-name">${escapeHtml(input.clinicianName)}</p>
            <p class="signoff-license">Lic: ${escapeHtml(input.clinicianLicense)}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function buildPatientSummaryExportHtml(input: SummaryTemplateInput): string {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; padding: 28px; color: #1d2734; background: #f6f4ef; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          .meta { margin-bottom: 20px; color: #657080; font-size: 12px; }
          .summary { font-size: 14px; line-height: 1.6; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(input.patientName)}</h1>
        <div class="meta">Patient Summary · ${escapeHtml(input.visitDate)}</div>
        <div class="summary">${paragraphize(input.patientSummary)}</div>
      </body>
    </html>
  `;
}
