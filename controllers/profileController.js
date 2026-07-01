const crypto = require('crypto');
const { createRequestClient } = require('../config/supabaseClient');

const getUserSupabase = (req) => createRequestClient(req.session.access_token);

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
};

exports.getProfile = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    if (!userSupabase) {
      req.flash('error', 'Koneksi ke Supabase gagal.');
      return res.redirect('/');
    }

    const { data: profile, error } = await userSupabase
      .from('profiles')
      .select('id, full_name, role, phone, avatar_url, created_at')
      .eq('id', req.session.user.id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    res.render('profile', {
      title: 'Profil Saya - Smart City Report',
      profile: profile || {},
      email: req.session.user.email,
      formatDate,
      error: req.flash('error')[0] || null,
      success: req.flash('success')[0] || null
    });
  } catch (error) {
    res.render('profile', {
      title: 'Profil Saya - Smart City Report',
      profile: {},
      email: req.session.user.email,
      formatDate,
      error: `Gagal memuat profil: ${error.message}`,
      success: null
    });
  }
};

exports.updateProfile = async (req, res) => {
  const { full_name, phone } = req.body;
  
  if (!full_name || !full_name.trim()) {
    req.flash('error', 'Nama lengkap wajib diisi.');
    return res.redirect('/profile');
  }

  try {
    const userSupabase = getUserSupabase(req);
    if (!userSupabase) {
      throw new Error('Koneksi ke Supabase gagal.');
    }

    let avatarUrl = null;

    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        req.flash('error', 'File avatar harus berupa gambar.');
        return res.redirect('/profile');
      }

      const extension = req.file.originalname.split('.').pop() || 'jpg';
      const filePath = `${req.session.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await userSupabase.storage
        .from('avatars')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Gagal mengunggah foto avatar: ${uploadError.message}`);
      }

      const { data: publicUrlData } = userSupabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      avatarUrl = publicUrlData.publicUrl;
    }

    const updateData = {
      full_name: full_name.trim(),
      phone: phone ? phone.trim() : null
    };

    if (avatarUrl) {
      updateData.avatar_url = avatarUrl;
    }

    const { error: updateError } = await userSupabase
      .from('profiles')
      .update(updateData)
      .eq('id', req.session.user.id);

    if (updateError) {
      throw new Error(`Gagal memperbarui profil di database: ${updateError.message}`);
    }

    // Perbarui data user di session
    req.session.user.full_name = updateData.full_name;
    if (updateData.avatar_url) {
      req.session.user.avatar_url = updateData.avatar_url;
    }

    req.session.save(() => {
      req.flash('success', 'Profil berhasil diperbarui.');
      res.redirect('/profile');
    });
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/profile');
  }
};

exports.updatePassword = async (req, res) => {
  const { password, confirm_password } = req.body;

  if (!password || !confirm_password) {
    req.flash('error', 'Semua kolom password wajib diisi.');
    return res.redirect('/profile');
  }

  if (password !== confirm_password) {
    req.flash('error', 'Konfirmasi password tidak cocok.');
    return res.redirect('/profile');
  }

  if (password.length < 6) {
    req.flash('error', 'Password minimal harus 6 karakter.');
    return res.redirect('/profile');
  }

  try {
    const userSupabase = getUserSupabase(req);
    if (!userSupabase) {
      throw new Error('Koneksi ke Supabase gagal.');
    }

    const { error } = await userSupabase.auth.updateUser({ password });

    if (error) {
      throw new Error(error.message);
    }

    req.flash('success', 'Password berhasil diperbarui.');
    res.redirect('/profile');
  } catch (error) {
    req.flash('error', `Gagal mengganti password: ${error.message}`);
    res.redirect('/profile');
  }
};
