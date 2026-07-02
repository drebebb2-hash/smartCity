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

exports.getMyReports = async (req, res) => {
  try {
    const userSupabase = createRequestClient(req.session.access_token);
    const { status, search } = req.query;

    // Start building query
    let query = userSupabase
      .from('reports')
      .select(`
        id,
        title,
        status,
        created_at,
        profiles!reports_user_id_fkey (
          id,
          full_name
        ),
        categories (
          id,
          name,
          icon
        )
      `)
      .eq('assigned_to', req.session.user.id);

    // Apply status filter if present
    if (status) {
      query = query.eq('status', status);
    }

    // Apply search filter if present (ilike search)
    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    // Fetch reports
    const { data: reports, error: reportsError } = await query.order('created_at', { ascending: false });

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    // Fetch categories for filter dropdown
    const { data: categories, error: catError } = await userSupabase
      .from('categories')
      .select('id, name, icon')
      .order('name');

    if (catError) {
      throw new Error(catError.message);
    }

    return res.render('petugas/reports', {
      title: 'Tugas Laporan Petugas',
      reports: reports || [],
      categories: categories || [],
      filters: {
        status: status || '',
        search: search || ''
      },
      statusList: ['pending', 'diproses', 'selesai', 'ditolak'],
      getStatusMeta,
      formatDate,
      activeMenu: 'reports',
      error: null
    });
  } catch (error) {
    return res.render('petugas/reports', {
      title: 'Tugas Laporan Petugas',
      reports: [],
      categories: [],
      filters: { status: '', search: '' },
      statusList: ['pending', 'diproses', 'selesai', 'ditolak'],
      getStatusMeta,
      formatDate,
      activeMenu: 'reports',
      error: `Gagal memuat tugas laporan: ${error.message}`
    });
  }
};
