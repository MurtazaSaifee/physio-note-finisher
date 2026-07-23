import React, { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { appointmentsApi } from "../../appointments/api/appointmentsApi";
import { noteDetailQueryKey } from "../../notes/hooks/useNotes";
import { notesApi } from "../../notes/api/notesApi";
import { patientTimelineQueryKey } from "../../patients/hooks/usePatients";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { SyncOverlay } from "./SyncOverlay";

export function AppSyncOverlay(): React.JSX.Element {
  const queryClient = useQueryClient();
  const syncApis = useMemo(
    () => ({
      createManualNote: async (
        accessToken: string,
        patientId: string,
        input: Parameters<typeof notesApi.createManualNote>[2],
      ) => {
        const created = await notesApi.createManualNote(accessToken, patientId, input);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: patientTimelineQueryKey(patientId) }),
        ]);
        return created;
      },
      saveManualNote: async (
        accessToken: string,
        patientId: string,
        sessionId: string,
        input: Parameters<typeof notesApi.saveManualNote>[3],
      ) => {
        const saved = await notesApi.saveManualNote(accessToken, patientId, sessionId, input);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: noteDetailQueryKey(patientId, sessionId) }),
          queryClient.invalidateQueries({ queryKey: patientTimelineQueryKey(patientId) }),
        ]);
        return saved;
      },
      updateAppointment: async (
        accessToken: string,
        appointmentId: string,
        input: Parameters<typeof appointmentsApi.updateAppointment>[2],
      ) => {
        const updated = await appointmentsApi.updateAppointment(accessToken, appointmentId, input);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        ]);
        return updated;
      },
    }),
    [queryClient],
  );
  const { state: syncState } = useSyncStatus(syncApis);

  return <SyncOverlay syncState={syncState} />;
}
