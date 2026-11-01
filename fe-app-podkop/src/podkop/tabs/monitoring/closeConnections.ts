import { Podkop } from '../../types';

const PARALLEL_CLOSES = 4;

export async function closeConnections(
  ids: string[],
  close: (id: string) => Promise<Podkop.MethodResponse<unknown>>,
): Promise<{ closed: string[]; failed: string[] }> {
  const closed: string[] = [];
  const failed: string[] = [];

  for (let start = 0; start < ids.length; start += PARALLEL_CLOSES) {
    const batch = ids.slice(start, start + PARALLEL_CLOSES);
    const results = await Promise.all(
      batch.map((id) => close(id).catch(() => null)),
    );

    results.forEach((result, index) => {
      if (result?.success) {
        closed.push(batch[index]);
      } else {
        failed.push(batch[index]);
      }
    });
  }

  return { closed, failed };
}
