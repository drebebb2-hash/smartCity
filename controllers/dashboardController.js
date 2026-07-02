const { createRequestClient } = require('../config/supabaseClient');

const getStatusMeta = (status) => {
  const normalizedStatus = status || 'pending';
  const meta = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
    },
    diproses: {
      label: 'Diproses',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    },
    selesai: {
      label: 'Selesai',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
    },
    ditolak: {
      label: 'Ditolak',
      className: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
    }
  };

  return meta[normalizedStatus] || {
    label: normalizedStatus,
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
    
    // Fetch reports assigned to this officer
    const { data: reports, error } = await userSupabase
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

    // Calculate statistics
    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      diproses: reports.filter(r => r.status === 'diproses').length,
      selesai: reports.filter(r => r.status === 'selesai').length,
      ditolak: reports.filter(r => r.status === 'ditolak').length
    };

    // We only display the 5 most recent tasks on the dashboard main page
    const recentReports = reports.slice(0, 5);

    return res.render('petugas/dashboard', {
      title: 'Dashboard Petugas',
      reports: recentReports,
      stats,
      getStatusMeta,
      formatDate,
      activeMenu: 'dashboard',
      error: null
    });
  } catch (error) {
    return res.render('petugas/dashboard', {
      title: 'Dashboard Petugas',
      reports: [],
      stats: { total: 0, pending: 0, diproses: 0, selesai: 0, ditolak: 0 },
      getStatusMeta,
      formatDate,
      activeMenu: 'dashboard',
      error: `Gagal memuat tugas petugas: ${error.message}`
    });
  }
};

exports.showAdminDashboard = (req, res) => {
  res.render('dashboards/admin', {
    title: 'Dashboard Admin'
  });
};
