export interface TrafficSample {
  up: number;
  down: number;
}

export interface TrafficBarSample {
  upPercent: number;
  downPercent: number;
}

export const TRAFFIC_GRAPH_MAX_BARS = 40;

function toNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Converts a traffic history into percentage heights for a compact bar graph.
 * The scale is shared by upload and download so both are visually comparable.
 */
export function buildTrafficBars(
  history: TrafficSample[],
  maxBars: number = TRAFFIC_GRAPH_MAX_BARS,
): TrafficBarSample[] {
  const slice = history.slice(-maxBars);

  if (slice.length === 0) {
    return [];
  }

  let max = 1;
  slice.forEach((sample) => {
    max = Math.max(max, toNonNegative(sample.up), toNonNegative(sample.down));
  });

  return slice.map((sample) => ({
    upPercent: Math.round((toNonNegative(sample.up) / max) * 100),
    downPercent: Math.round((toNonNegative(sample.down) / max) * 100),
  }));
}
