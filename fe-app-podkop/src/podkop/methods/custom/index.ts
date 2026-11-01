import { getConfigSections } from './getConfigSections';
import { getDashboardSections } from './getDashboardSections';
import { getClashApiSecret } from './getClashApiSecret';
import { getSingBoxFeatures } from './getSingBoxFeatures';
import {
  getClashApiConnections,
  closeClashApiConnection,
  closeAllClashApiConnections,
  resetClashApiTransport,
} from './clashApi';

export const CustomPodkopMethods = {
  getConfigSections,
  getDashboardSections,
  getClashApiSecret,
  getSingBoxFeatures,
  getClashApiConnections,
  closeClashApiConnection,
  closeAllClashApiConnections,
  resetClashApiTransport,
};
