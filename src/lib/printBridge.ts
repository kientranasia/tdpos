type PrintBridgePayload = {
  text: string;
  documentNo?: string;
  copies?: number;
};

const configuredBridgeUrl = (import.meta.env.VITE_PRINT_BRIDGE_URL as string | undefined)?.trim();
const bridgeToken = (import.meta.env.VITE_PRINT_BRIDGE_TOKEN as string | undefined)?.trim();

const bridgeUrl = (path: string) => {
  if (!configuredBridgeUrl) return null;
  return `${configuredBridgeUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
};

/**
 * Tries the local bridge first. Returning false deliberately keeps browser
 * printing as a safe fallback for online deployments or an offline install
 * where the bridge is not running yet.
 */
export async function printViaBridge(payload: PrintBridgePayload): Promise<boolean> {
  const url = bridgeUrl('/print');
  if (!url || !payload.text.trim()) return false;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bridgeToken) headers['X-Print-Bridge-Token'] = bridgeToken;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
