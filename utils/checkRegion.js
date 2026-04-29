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
      // Malformed URL — fail open so the app still starts, but log the error
      console.error('checkRegion: invalid REGION_CHECK_API_URL, skipping check');
      return resolve(true);
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
          // Non-JSON response that isn't "blocked" — treat as allowed
        }
        resolve(true);
      });
    });

    reqOut.on('timeout', () => {
      reqOut.destroy();
      resolve(true); // fail open on timeout
    });
    reqOut.on('error', () => resolve(true));
    reqOut.end();
  });
}

module.exports = checkRegion;
