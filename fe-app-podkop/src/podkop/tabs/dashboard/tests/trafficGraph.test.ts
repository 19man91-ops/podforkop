import { describe, expect, it } from 'vitest';
import { buildTrafficBars, TRAFFIC_GRAPH_MAX_BARS } from '../trafficGraph';

describe('trafficGraph', () => {
  it('returns no bars for an empty history', () => {
    expect(buildTrafficBars([])).toEqual([]);
  });

  it('scales upload and download against a shared maximum', () => {
    const bars = buildTrafficBars([
      { up: 10, down: 100 },
      { up: 50, down: 25 },
    ]);

    expect(bars).toEqual([
      { upPercent: 10, downPercent: 100 },
      { upPercent: 50, downPercent: 25 },
    ]);
  });

  it('keeps only the newest samples', () => {
    const history = Array.from(
      { length: TRAFFIC_GRAPH_MAX_BARS + 5 },
      (_, i) => ({
        up: i,
        down: i,
      }),
    );
    const bars = buildTrafficBars(history, TRAFFIC_GRAPH_MAX_BARS);

    expect(bars).toHaveLength(TRAFFIC_GRAPH_MAX_BARS);
    expect(bars[bars.length - 1].downPercent).toBe(100);
  });

  it('handles zero and invalid values without dividing by zero', () => {
    const bars = buildTrafficBars([
      { up: 0, down: 0 },
      { up: Number.NaN, down: 10 },
    ]);

    expect(bars[0]).toEqual({ upPercent: 0, downPercent: 0 });
    expect(bars[1]).toEqual({ upPercent: 0, downPercent: 100 });
  });
});
