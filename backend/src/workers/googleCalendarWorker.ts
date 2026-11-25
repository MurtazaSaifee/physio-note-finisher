import { parseCalendarJobId } from "../domain/google-calendar/googleCalendarQueue.js";
import {
  pushAppointmentToGoogle,
  runFullCalendarSync,
  runIncrementalCalendarSync,
} from "../domain/google-calendar/googleCalendarSyncService.js";

export async function processGoogleCalendarJob(
  jobType: string,
  jobId: string,
): Promise<void> {
  const { clinicId, userId, appointmentId } = parseCalendarJobId(jobId);

  switch (jobType) {
    case "push": {
      if (!appointmentId) {
        throw new Error("appointmentId is required for push jobs");
      }
      await pushAppointmentToGoogle(clinicId, userId, appointmentId);
      break;
    }
    case "incremental_sync": {
      await runIncrementalCalendarSync(clinicId, userId);
      break;
    }
    case "full_sync": {
      await runFullCalendarSync(clinicId, userId);
      break;
    }
    default: {
      throw new Error(`Unknown google-calendar-sync job type: ${jobType}`);
    }
  }
}
