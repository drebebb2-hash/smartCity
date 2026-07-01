const supabase = require('./supabaseClient');

const createNotification = async (userId, reportId, message, supabaseClient = supabase) => {
  if (!supabaseClient) {
    throw new Error('Konfigurasi Supabase belum lengkap.');
  }

  const { data, error } = await supabaseClient
    .from('notifications')
    .insert({
      user_id: userId,
      report_id: reportId,
      message,
      is_read: false
    })
    .select()
    .single();

  if (error) {
    const rlsHint = error.message.includes('row-level security')
      ? ' Pastikan policy insert notifications untuk admin sudah dijalankan di Supabase SQL Editor.'
      : '';

    throw new Error(`${error.message}${rlsHint}`);
  }

  return data;
};

module.exports = {
  createNotification
};
