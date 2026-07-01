const { createRequestClient } = require('../config/supabaseClient');

const formatDate = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const getUserSupabase = (req) => createRequestClient(req.session.access_token);

exports.getNotifications = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data, error } = await userSupabase
      .from('notifications')
      .select(`
        id,
        user_id,
        report_id,
        message,
        is_read,
        created_at,
        reports (
          id,
          title,
          status
        )
      `)
      .eq('user_id', req.session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    res.render('notifications/index', {
      title: 'Notifikasi',
      notifications: data || [],
      formatDate,
      error: null
    });
  } catch (error) {
    res.render('notifications/index', {
      title: 'Notifikasi',
      notifications: [],
      formatDate,
      error: `Gagal memuat notifikasi: ${error.message}`
    });
  }
};

exports.markAsRead = async (req, res) => {
  const redirectTo = req.body.redirect_to || '/notifications';

  try {
    const userSupabase = getUserSupabase(req);
    const { error } = await userSupabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.session.user.id);

    if (error) {
      throw new Error(error.message);
    }

    return res.redirect(redirectTo);
  } catch (error) {
    req.flash('error', `Gagal menandai notifikasi: ${error.message}`);
    return res.redirect('/notifications');
  }
};
