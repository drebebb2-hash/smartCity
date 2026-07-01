const supabase = require('../config/supabaseClient');
const { createRequestClient } = require('../config/supabaseClient');

const getDashboardPath = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'petugas') return '/petugas/dashboard';
  return '/dashboard';
};

const renderAuthPage = (res, view, data = {}) => {
  res.render(view, {
    title: data.title,
    formData: data.formData || {},
    error: data.error || null
  });
};

const getAuthErrorMessage = (message = '') => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Silakan cek inbox email Anda, atau nonaktifkan email confirmation di Supabase untuk mode development.';
  }

  if (lowerMessage.includes('invalid login credentials')) {
    return 'Email atau password salah.';
  }

  if (lowerMessage.includes('user already registered') || lowerMessage.includes('already registered')) {
    return 'Email sudah terdaftar. Silakan login atau gunakan email lain.';
  }

  return message || 'Terjadi kesalahan. Silakan coba lagi.';
};

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new Error('Konfigurasi Supabase belum lengkap. Periksa SUPABASE_URL dan SUPABASE_ANON_KEY di file .env.');
  }
};

exports.showRegister = (req, res) => {
  renderAuthPage(res, 'auth/register', {
    title: 'Register - Smart City Report'
  });
};

exports.register = async (req, res) => {
  const { full_name, email, password, confirm_password } = req.body;
  const formData = { full_name, email };

  if (password !== confirm_password) {
    return renderAuthPage(res, 'auth/register', {
      title: 'Register - Smart City Report',
      formData,
      error: 'Konfirmasi password tidak cocok.'
    });
  }

  try {
    ensureSupabaseReady();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name
        }
      }
    });

    if (error) {
      return renderAuthPage(res, 'auth/register', {
        title: 'Register - Smart City Report',
        formData,
        error: getAuthErrorMessage(error.message)
      });
    }

    if (!data.session) {
      req.flash('success', 'Registrasi berhasil. Jika Supabase meminta konfirmasi email, cek inbox Anda sebelum login.');
      return res.redirect('/login');
    }

    req.flash('success', 'Registrasi berhasil. Silakan login dengan email dan password Anda.');
    return res.redirect('/login');
  } catch (error) {
    return renderAuthPage(res, 'auth/register', {
      title: 'Register - Smart City Report',
      formData,
      error: getAuthErrorMessage(error.message)
    });
  }
};

exports.showLogin = (req, res) => {
  renderAuthPage(res, 'auth/login', {
    title: 'Login - Smart City Report'
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const formData = { email };

  try {
    ensureSupabaseReady();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return renderAuthPage(res, 'auth/login', {
        title: 'Login - Smart City Report',
        formData,
        error: getAuthErrorMessage(error.message)
      });
    }

    const user = data.user;
    const session = data.session;

    const userSupabase = createRequestClient(session.access_token);
    let { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('id, full_name, role, phone, avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      const fallbackProfile = {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email,
        role: 'warga'
      };

      const { data: createdProfile, error: createProfileError } = await userSupabase
        .from('profiles')
        .upsert(fallbackProfile, { onConflict: 'id' })
        .select('id, full_name, role, phone, avatar_url')
        .single();

      if (createProfileError || !createdProfile) {
        return renderAuthPage(res, 'auth/login', {
          title: 'Login - Smart City Report',
          formData,
          error: `Login berhasil, tetapi profil tidak bisa dibaca/dibuat. Detail Supabase: ${(createProfileError || profileError).message}`
        });
      }

      profile = createdProfile;
    }

    req.session.access_token = session.access_token;
    req.session.user = {
      id: user.id,
      email: user.email,
      full_name: profile.full_name,
      role: profile.role
    };

    return req.session.save(() => {
      res.redirect(getDashboardPath(profile.role));
    });
  } catch (error) {
    return renderAuthPage(res, 'auth/login', {
      title: 'Login - Smart City Report',
      formData,
      error: getAuthErrorMessage(error.message)
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};
