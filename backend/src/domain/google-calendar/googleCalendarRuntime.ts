let localGoogleCalendarMode = false;

export function setLocalGoogleCalendarMode(enabled: boolean): void {
  localGoogleCalendarMode = enabled;
}

export function isLocalGoogleCalendarMode(): boolean {
  return localGoogleCalendarMode;
}
