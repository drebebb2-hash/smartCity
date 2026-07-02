const { createClient } = require('@supabase/supabase-js');
const { createRequestClient } = require('../config/supabaseClient');

// Helper refresh token
const refreshSupabaseSession = async (req) => {
  try {
    if (!req.session.refresh_token) return false;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = req.session.expires_at || 0;

    // Refresh jika token expired atau akan expired dalam 10 menit
    if (expiresAt - now > 600) return true;

    console.log('[Auth] Token akan expired, mencoba refresh...');

    const tempClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await tempClient.auth.refreshSession({
      refresh_token: req.session.refresh_token
    });

    if (error || !data?.session) {
      console.log('[Auth] Refresh gagal:', error?.message);
      return false;
    }

    // Update session dengan token baru
    req.session.access_token = data.session.access_token;
    req.session.refresh_token = data.session.refresh_token;
    req.session.expires_at = data.session.expires_at;
    console.log('[Auth] Token berhasil direfresh');
    return true;
  } catch (err) {
    console.error('[Auth] Error refresh:', err.message);
    return false;
  }
};

exports.refreshSessionIfNeeded = async (req, res, next) => {
  try {
    if (!req.session?.user || !req.session?.access_token) return next();
    await refreshSupabaseSession(req);
    next();
  } catch (err) {
    next();
  }
};

exports.requireAuth = async (req, res, next) => {
  if (!req.session?.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }

  const refreshed = await refreshSupabaseSession(req);
  if (!refreshed && req.session.refresh_token) {
    req.flash('error', 'Sesi Anda telah berakhir. Silakan login kembali.');
    req.session.destroy();
    return res.redirect('/login');
  }

  return next();
};

exports.requireRole = (...roles) => async (req, res, next) => {
  if (!req.session?.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }

  await refreshSupabaseSession(req);

  try {
    let role = req.session.user.role;

    const userSupabase = createRequestClient(req.session.access_token);
    if (userSupabase) {
      const { data: profile, error } = await userSupabase
        .from('profiles')
        .select('role')
        .eq('id', req.session.user.id)
        .single();

      if (!error && profile) {
        role = profile.role;
        req.session.user.role = profile.role;
      }
    }

    if (!roles.includes(role)) {
      return res.status(403).render('errors/403', {
        title: '403 Forbidden'
      });
    }

    return next();
  } catch (error) {
    return res.status(403).render('errors/403', {
      title: '403 Forbidden'
    });
  }
};
