const calendarDateFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "2-digit",
});

export const formatCalendarDate = (value: string | null | undefined) => {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : calendarDateFormatter.format(date);
};

export const isCalendarDatePastDue = (value: string | null | undefined) => {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  const dateValue = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayValue = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return dateValue < todayValue;
};