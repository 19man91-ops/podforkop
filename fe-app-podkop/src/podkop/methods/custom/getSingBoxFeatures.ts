import { PodkopShellMethods } from '../shell';

// Features of the installed sing-box; none when it does not report them
export async function getSingBoxFeatures(): Promise<string[]> {
  const response = await PodkopShellMethods.getSingBoxFeatures();

  return response.success && Array.isArray(response.data) ? response.data : [];
}
