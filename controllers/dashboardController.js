const { createRequestClient } = require('../config/supabaseClient');

const getStatusMeta = (status) => {
  const normalizedStatus = status || 'pending';
  const meta = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    },
    diproses: {
      label: 'Diproses',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    selesai: {
      label: 'Selesai',
      className: 'bg-green-100 text-green-800 border-green-200'
    },
    ditolak: {
      label: 'Ditolak',
      className: 'bg-red-100 text-red-800 border-red-200'
    }
  };

  return meta[normalizedStatus] || {
    label: normalizedStatus,
    className: 'bg-slate-100 text-slate-800 border-slate-200'
  };
};

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

exports.showWargaDashboard = (req, res) => {
  res.render('dashboards/warga', {
    title: 'Dashboard Warga'
  });
};

exports.showPetugasDashboard = async (req, res) => {
  try {
    const userSupabase = createRequestClient(req.session.access_token);
    const { data, error } = await userSupabase
      .from('reports')
      .select(`
        id,
        title,
        photo_url,
        status,
        created_at,
        categories (
          id,
          name,
          icon
        )
      `)
      .eq('assigned_to', req.session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return res.render('petugas/dashboard', {
      title: 'Dashboard Petugas',
      reports: data || [],
      getStatusMeta,
      formatDate,
      error: null
    });
  } catch (error) {
    return res.render('petugas/dashboard', {
      title: 'Dashboard Petugas',
      reports: [],
      getStatusMeta,
      formatDate,
      error: `Gagal memuat tugas petugas: ${error.message}`
    });
  }
};

exports.showAdminDashboard = (req, res) => {
  res.render('dashboards/admin', {
    title: 'Dashboard Admin'
  });
};
