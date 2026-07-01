const supabase = require('../config/supabaseClient');

const getStatusMeta = (status) => {
  const meta = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    diproses: { label: 'Diproses', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    selesai: { label: 'Selesai', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
    ditolak: { label: 'Ditolak', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' }
  };

  return meta[status || 'pending'] || { label: status || 'Pending', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
};

exports.showHome = async (req, res) => {
  const stats = { total: 0, selesai: 0, categories: 0, warga: 0 };
  let latestReports = [];

  if (supabase) {
    try {
      const [totalResult, doneResult, categoryResult, wargaResult, latestResult] = await Promise.all([
        supabase.from('reports').select('id', { count: 'exact', head: true }),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'selesai'),
        supabase.from('categories').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'warga'),
        supabase
          .from('reports')
          .select(`
            id,
            title,
            description,
            photo_url,
            status,
            created_at,
            categories (name, icon),
            profiles!reports_user_id_fkey (full_name)
          `)
          .order('created_at', { ascending: false })
          .limit(6)
      ]);

      stats.total = totalResult.count || 0;
      stats.selesai = doneResult.count || 0;
      stats.categories = categoryResult.count || 0;
      stats.warga = wargaResult.count || 0;
      latestReports = latestResult.data || [];
    } catch (error) {
      console.warn('Gagal memuat data home:', error.message);
    }
  }

  res.render('home', {
    title: 'Smart City Report',
    stats,
    latestReports,
    getStatusMeta,
    formatDate
  });
};
