import { env } from '../../config/env.js';
import { httpError } from '../../utils/httpError.js';

export function metaConfig() {
  const config = env.meta;
  if (!config.publicOrigin) throw httpError(503, 'Meta public origin is not configured');
  const origin = new URL(config.publicOrigin);
  if (origin.origin !== config.publicOrigin || origin.protocol !== 'https:') throw httpError(503, 'Meta public origin must be an HTTPS origin');
  const frontendOrigin = new URL(env.clientUrl).origin;
  return { ...config, frontendOrigin, callbackUrl: origin.origin + '/auth/meta/callback', settingsUrl: frontendOrigin + '/whatsapp/settings' };
}

export function requireMetaConfig() {
  const config = metaConfig();
  if (!/^\d+$/.test(config.appId) || !config.appSecret || !/^\d+$/.test(config.configId) || !/^v\d+\.\d+$/.test(config.graphVersion) ||
      !/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) throw httpError(503, 'WhatsApp connection is not configured. Please contact support.');
  return config;
}
