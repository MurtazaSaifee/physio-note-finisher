type LocalGoogleCalendarConnection = {
  clinicId: string;
  userId: string;
  accountEmail: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

const localConnections = new Map<string, LocalGoogleCalendarConnection>();

function connectionKey(clinicId: string, userId: string): string {
  return `${clinicId}:${userId}`;
}

export function upsertLocalGoogleCalendarConnection(input: {
  clinicId: string;
  userId: string;
  accountEmail: string;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}): void {
  localConnections.set(connectionKey(input.clinicId, input.userId), {
    clinicId: input.clinicId,
    userId: input.userId,
    accountEmail: input.accountEmail,
    lastSyncedAt: input.lastSyncedAt ?? null,
    lastSyncError: input.lastSyncError ?? null,
  });
}

export function getLocalGoogleCalendarConnection(
  clinicId: string,
  userId: string,
): LocalGoogleCalendarConnection | null {
  return localConnections.get(connectionKey(clinicId, userId)) ?? null;
}

export function deleteLocalGoogleCalendarConnection(
  clinicId: string,
  userId: string,
): void {
  localConnections.delete(connectionKey(clinicId, userId));
}

export function resetLocalGoogleCalendarConnections(): void {
  localConnections.clear();
}
