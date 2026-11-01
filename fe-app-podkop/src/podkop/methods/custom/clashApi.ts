import {
  canUseDirectClashApi,
  getClashApiUrl,
} from '../../../helpers/getClashApiUrl';
import { getClashApiSecret } from './getClashApiSecret';
import { PodkopShellMethods } from '../shell';
import { Podkop } from '../../types';

let directSuspended = false;

export function resetClashApiTransport() {
  directSuspended = false;
}

export async function getClashApiConnections(): Promise<
  Podkop.MethodResponse<unknown>
> {
  if (canUseDirectClashApi() && !directSuspended) {
    try {
      const secret = await getClashApiSecret().catch(() => '');
      const headers: Record<string, string> = {};
      if (secret) headers.Authorization = `Bearer ${secret}`;
      const res = await fetch(`${getClashApiUrl()}/connections`, { headers });
      if (res.ok) {
        const data = await res.json();
        return { success: true, data };
      }
    } catch {
      directSuspended = true;
    }
  }
  return PodkopShellMethods.getClashApiConnections();
}

export async function closeClashApiConnection(
  id: string,
): Promise<Podkop.MethodResponse<unknown>> {
  if (canUseDirectClashApi() && !directSuspended) {
    try {
      const secret = await getClashApiSecret().catch(() => '');
      const headers: Record<string, string> = {};
      if (secret) headers.Authorization = `Bearer ${secret}`;
      const res = await fetch(
        `${getClashApiUrl()}/connections/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
      if (res.ok || res.status === 204) {
        return { success: true, data: null };
      }
    } catch {
      directSuspended = true;
    }
  }
  return PodkopShellMethods.closeClashApiConnection(id);
}

export async function closeAllClashApiConnections(): Promise<
  Podkop.MethodResponse<unknown>
> {
  if (canUseDirectClashApi() && !directSuspended) {
    try {
      const secret = await getClashApiSecret().catch(() => '');
      const headers: Record<string, string> = {};
      if (secret) headers.Authorization = `Bearer ${secret}`;
      const res = await fetch(`${getClashApiUrl()}/connections`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok || res.status === 204) {
        return { success: true, data: null };
      }
    } catch {
      directSuspended = true;
    }
  }
  return PodkopShellMethods.closeClashApiConnections();
}
