const { createRequestClient } = require('../config/supabaseClient');

exports.requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }

  return next();
};

exports.requireRole = (...roles) => async (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }

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
