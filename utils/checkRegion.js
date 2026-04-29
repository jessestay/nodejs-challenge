const https = require('https');

const REGION_CHECK_URL = process.env.REGION_CHECK_API_URL || '';
const REGION_CHECK_SECRET = process.env.REGION_CHECK_SECRET_HEADER || 'secret';

/**
 * Checks whether the incoming request originates from an allowed region.
 * Returns true (allowed) when the region-check service is not configured,
 * or when the service responds with a non-blocked status.
 *
 * SECURITY NOTE: The previous implementation contained an `eval(data)` call
 * that executed arbitrary code returned by the remote region-check service.
 * This was a critical remote-code-execution vulnerability and has been removed.
 *
 * FAIL-CLOSED POLICY: When the region-check service is configured but
 * unreachable (network error, timeout, malformed response), we block the
 * request rather than allowing it through.  This prevents a misconfigured
 * or downed service from silently disabling region enforcement.
 */
function checkRegion(req) {
  // Skip check entirely when no API URL is configured
  if (!REGION_CHECK_URL) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(REGION_CHECK_URL);
    } catch {
      // Malformed URL — fail closed and log so ops can fix the config
      console.error('checkRegion: invalid REGION_CHECK_API_URL, blocking request');
      return resolve(false);
    }

    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'x-secret-header': REGION_CHECK_SECRET },
      timeout: 5000,
    };

    const reqOut = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (data === 'blocked') return resolve(false);
        try {
          const parsed = JSON.parse(data);
          if (parsed?.blocked) return resolve(false);
        } catch {
          // Non-JSON, non-"blocked" response is ambiguous — fail closed
          console.error('checkRegion: unparseable response, blocking request');
          return resolve(false);
        }
        resolve(true);
      });
    });

    reqOut.on('timeout', () => {
      reqOut.destroy();
      console.error('checkRegion: request timed out, blocking request');
      resolve(false);
    });
    reqOut.on('error', (err) => {
      console.error('checkRegion: network error (%s), blocking request', err.message);
      resolve(false);
    });
    reqOut.end();
  });
}

module.exports = checkRegion;
