export function usageChartPoints(rows: { date: string; scheduledHours: number }[], width = 760, height = 210) {
  const max = Math.max(1, Math.ceil(Math.max(0, ...rows.map(row => row.scheduledHours))));
  const left = 40, right = width - 18, top = 16, bottom = height - 34;
  const points = rows.map((row, index) => ({ ...row, x: left + (rows.length > 1 ? index / (rows.length - 1) * (right - left) : 0), y: bottom - row.scheduledHours / max * (bottom - top) }));
  return { max, left, right, top, bottom, points };
}
export function distributionStops(rows: { total: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  let previous = 0;
  return rows.map(row => { const start = previous; previous += total ? row.total / total * 100 : 0; return { start, end: previous }; });
}
