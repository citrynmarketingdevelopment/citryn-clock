function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatDayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatUtcDayKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDayKey(dayKey) {
  const text = String(dayKey || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return new Date(year, month - 1, day);
}
