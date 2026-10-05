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

export const isShipDateWithinWeeks = (
  value: string | null | undefined,
  weeks: number,
  today = new Date(),
) => {
  if (!value || !Number.isSafeInteger(weeks) || weeks < 1) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const shipDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return shipDay <= todayDay + weeks * 7 * 24 * 60 * 60 * 1000;
};