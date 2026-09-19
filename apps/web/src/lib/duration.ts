export const durationUnits = [
  { value: 'minutes', label: 'Minutes', minutes: 1 },
  { value: 'hours', label: 'Hours', minutes: 60 },
  { value: 'days', label: 'Days', minutes: 1440 },
  { value: 'weeks', label: 'Weeks', minutes: 10080 },
  { value: 'months', label: 'Months (30 days)', minutes: 43200 },
] as const;
export function toMinutes(amount: number, unit: string): number {
  const factor = durationUnits.find(item => item.value === unit)?.minutes;
  const total = amount * (factor || 0);
  if (!factor || !Number.isSafeInteger(amount) || amount < 1 || total > 525600) {
    throw new Error('Choose a whole-number duration between 1 minute and 365 days. One month means 30 days.');
  }
  return total;
}
export function durationParts(minutes: number) {
  if (minutes === 1440) return { duration_amount: 24, duration_unit: 'hours' };
  const unit = [...durationUnits].reverse().find(item => minutes % item.minutes === 0) || durationUnits[0];
  return { duration_amount: minutes / unit.minutes, duration_unit: unit.value };
}
export function formatDuration(minutes: number): string {
  const { duration_amount: amount, duration_unit: unit } = durationParts(minutes);
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}${unit === 'months' ? ` (${amount * 30} days)` : ''}`;
}
