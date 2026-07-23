export function formatClinicalDate(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  // A date-only clinical value is a calendar day, not a moment in time.
  // Construct it in local time so timezone conversion cannot move the day.
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
