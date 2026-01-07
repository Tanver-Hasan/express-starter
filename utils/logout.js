// logout.js (or routes/auth.js)

function createLogoutRoute(options = {}) {
  const {
    appDomain,        
    teamName,         
    redirectAfter = '/', 
  } = options;

  if (!appDomain && !teamName) {
    throw new Error('Either appDomain or teamName is required for Cloudflare Access logout');
  }

  // Prefer application-domain logout for instant cookie removal
  const logoutBaseUrl = appDomain
    ? `${appDomain}/cdn-cgi/access/logout`
    : `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/logout`;

  return function logoutHandler(req, res) {
    // Optional: clear any app-side state (non-CF cookies, sessions, etc.)
    if (req.session) {
      req.session.destroy?.(() => {});
    }

    res.clearCookie?.('CF_Authorization'); // harmless if already gone

    const logoutUrl = new URL(logoutBaseUrl);
    logoutUrl.searchParams.set('redirect_url', redirectAfter);

    return res.redirect(logoutUrl.toString());
  };
}

module.exports = { createLogoutRoute };
