const m = 60;
const h = 3600;
const d = 86400;
const mo = 2620800;
const y = 31449600;

export function automaticRelativeTimeFormat(
  date: Date | string | number,
): [number, Intl.RelativeTimeFormatUnit] {
  const oldTs = new Date(date).getTime();
  const now = Date.now();
  const diff = (oldTs - now) / 1000;

  if (diff < m && diff > -m) {
    return [diff, 'seconds'];
  }
  if (diff < h && diff > -h) {
    // Less than an hour has passed:
    return [Math.floor(diff / m), 'minutes'];
  }
  if (diff < d && diff > -d) {
    // Less than a day has passed:
    return [Math.floor(diff / h), 'hours'];
  }
  if (diff < mo && diff > -mo) {
    // Less than a month has passed:
    return [Math.floor(diff / d), 'days'];
  }
  if (diff < y && diff > -y) {
    // Less than a year has passed:
    return [Math.floor(diff / mo), 'months'];
  }
  // More than a year has passed:
  return [Math.floor(diff / y), 'years'];
}
