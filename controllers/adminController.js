const ExcelJS = require('exceljs');
const { createRequestClient } = require('../config/supabaseClient');
const { createNotification } = require('../config/notificationHelper');

const getUserSupabase = (req) => createRequestClient(req.session.access_token);

const statusList = ['pending', 'diproses', 'selesai', 'ditolak'];

const getStatusMeta = (status) => {
  const normalizedStatus = status || 'pending';
  const meta = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      icon: '⏳'
    },
    diproses: {
      label: 'Diproses',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: '🔧'
    },
    selesai: {
      label: 'Selesai',
      className: 'bg-green-100 text-green-800 border-green-200',
      icon: '✓'
    },
    ditolak: {
      label: 'Ditolak',
      className: 'bg-red-100 text-red-800 border-red-200',
      icon: '!'
    }
  };

  return meta[normalizedStatus] || {
    label: normalizedStatus,
    className: 'bg-slate-100 text-slate-800 border-slate-200',
    icon: '•'
  };
};

const formatDate = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const getWeekStart = (date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  return weekStart;
};

const formatWeekLabel = (date) => new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short'
}).format(date);

const loadCategories = async (userSupabase) => {
  const { data, error } = await userSupabase
    .from('categories')
    .select('id, name, icon')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

const getReportFilters = (query) => ({
  status: query.status || '',
  category: query.category || '',
  search: query.search || ''
});

const buildReportExportQueryString = (filters) => {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);

  return params.toString();
};

const buildAdminReportsQuery = (userSupabase, filters) => {
  let query = userSupabase
    .from('reports')
    .select(`
      id,
      user_id,
      assigned_to,
      title,
      photo_url,
      status,
      created_at,
      categories (
        id,
        name,
        icon
      ),
      profiles!reports_user_id_fkey (
        full_name
      )
    `)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.category) {
    query = query.eq('category_id', filters.category);
  }

  if (filters.search) {
    query = query.ilike('title', `%${filters.search}%`);
  }

  return query;
};

const loadAdminReports = async (userSupabase, filters) => {
  const { data, error } = await buildAdminReportsQuery(userSupabase, filters);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

const getExportDateStamp = () => new Date().toISOString().slice(0, 10);

const getReportExportRows = (reports) => reports.map((report, index) => ({
  no: index + 1,
  title: report.title || '-',
  category: report.categories?.name || 'Tanpa kategori',
  reporter: report.profiles?.full_name || 'Tidak diketahui',
  status: getStatusMeta(report.status).label,
  createdAt: formatDate(report.created_at)
}));

const exportColumns = [
  { header: 'No', key: 'no', width: 8 },
  { header: 'Judul', key: 'title', width: 35 },
  { header: 'Kategori', key: 'category', width: 20 },
  { header: 'Pelapor', key: 'reporter', width: 24 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Tanggal', key: 'createdAt', width: 24 }
];

const writeReportsExcel = async (res, rows) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Laporan');

  worksheet.columns = exportColumns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2F3E8' }
  };

  rows.forEach((row) => worksheet.addRow(row));

  worksheet.columns.forEach((column) => {
    let maxLength = String(column.header || '').length;

    column.eachCell({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value || '').length);
    });

    column.width = Math.min(Math.max(maxLength + 2, column.width || 10), 50);
  });

  await workbook.xlsx.write(res);
};

const getPetugasList = async (userSupabase) => {
  const { data, error } = await userSupabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url')
    .eq('role', 'petugas')
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

exports.getPetugasList = getPetugasList;

const getStatusNotificationMessage = (status) => {
  const messages = {
    pending: 'Status laporan Anda dikembalikan menjadi pending.',
    diproses: 'Laporan Anda sedang diproses oleh petugas.',
    selesai: 'Laporan Anda telah selesai ditangani.',
    ditolak: 'Laporan Anda ditolak. Silakan lihat catatan petugas.'
  };

  return messages[status] || 'Status laporan Anda telah diperbarui.';
};

exports.getDashboard = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data, error } = await userSupabase
      .from('reports')
      .select('id, status');

    if (error) {
      throw new Error(error.message);
    }

    const reports = data || [];
    const stats = {
      total: reports.length,
      pending: 0,
      diproses: 0,
      selesai: 0,
      ditolak: 0
    };

    reports.forEach((report) => {
      if (Object.prototype.hasOwnProperty.call(stats, report.status)) {
        stats[report.status] += 1;
      }
    });

    return res.render('admin/dashboard', {
      title: 'Dashboard Admin',
      stats,
      getStatusMeta,
      error: null
    });
  } catch (error) {
    return res.render('admin/dashboard', {
      title: 'Dashboard Admin',
      stats: {
        total: 0,
        pending: 0,
        diproses: 0,
        selesai: 0,
        ditolak: 0
      },
      getStatusMeta,
      error: `Gagal memuat dashboard: ${error.message}`
    });
  }
};

exports.getAllReports = async (req, res) => {
  const filters = getReportFilters(req.query);

  try {
    const userSupabase = getUserSupabase(req);
    const categories = await loadCategories(userSupabase);
    const reports = await loadAdminReports(userSupabase, filters);
    const assignedIds = [...new Set(reports.map((report) => report.assigned_to).filter(Boolean))];
    const assignedMap = new Map();

    if (assignedIds.length) {
      const { data: assignedProfiles, error: assignedError } = await userSupabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assignedIds);

      if (assignedError) {
        throw new Error(assignedError.message);
      }

      (assignedProfiles || []).forEach((profile) => {
        assignedMap.set(profile.id, profile);
      });
    }

    return res.render('admin/reports', {
      title: 'Semua Laporan',
      reports: reports.map((report) => ({
        ...report,
        assignedProfile: assignedMap.get(report.assigned_to) || null
      })),
      categories,
      filters,
      statusList,
      exportQuery: buildReportExportQueryString(filters),
      getStatusMeta,
      formatDate,
      error: null
    });
  } catch (error) {
    return res.render('admin/reports', {
      title: 'Semua Laporan',
      reports: [],
      categories: [],
      filters,
      statusList,
      exportQuery: buildReportExportQueryString(filters),
      getStatusMeta,
      formatDate,
      error: `Gagal memuat laporan: ${error.message}`
    });
  }
};

exports.getStatisticsPage = (req, res) => {
  res.render('admin/statistics', {
    title: 'Statistik Laporan'
  });
};

exports.exportReportsExcel = async (req, res) => {
  try {
    const filters = getReportFilters(req.query);
    const userSupabase = getUserSupabase(req);
    const reports = await loadAdminReports(userSupabase, filters);
    const rows = getReportExportRows(reports);
    const dateStamp = getExportDateStamp();
    const filename = `laporan-smart-city-${dateStamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await writeReportsExcel(res, rows);
    return res.end();
  } catch (error) {
    req.flash('error', `Gagal export Excel: ${error.message}`);
    return res.redirect(`/admin/reports?${buildReportExportQueryString(getReportFilters(req.query))}`);
  }
};

exports.getStatsData = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data: reports, error: reportsError } = await userSupabase
      .from('reports')
      .select(`
        id,
        status,
        created_at,
        categories (
          id,
          name,
          icon
        )
      `);

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    const { data: ratings, error: ratingsError } = await userSupabase
      .from('ratings')
      .select('score');

    if (ratingsError) {
      throw new Error(ratingsError.message);
    }

    const categoryMap = new Map();
    const statusCounts = {
      pending: 0,
      diproses: 0,
      selesai: 0,
      ditolak: 0
    };
    const now = new Date();
    const currentWeekStart = getWeekStart(now);
    const weeklyBuckets = [];

    for (let i = 7; i >= 0; i -= 1) {
      const weekDate = new Date(currentWeekStart);
      weekDate.setDate(currentWeekStart.getDate() - (i * 7));

      weeklyBuckets.push({
        key: weekDate.toISOString().slice(0, 10),
        label: formatWeekLabel(weekDate),
        count: 0
      });
    }

    const weeklyMap = new Map(weeklyBuckets.map((bucket) => [bucket.key, bucket]));

    (reports || []).forEach((report) => {
      const categoryId = report.categories?.id || 'uncategorized';
      const categoryLabel = report.categories
        ? `${report.categories.icon ? `${report.categories.icon} ` : ''}${report.categories.name}`
        : 'Tanpa kategori';

      categoryMap.set(categoryId, {
        label: categoryLabel,
        count: (categoryMap.get(categoryId)?.count || 0) + 1
      });

      if (Object.prototype.hasOwnProperty.call(statusCounts, report.status)) {
        statusCounts[report.status] += 1;
      }

      if (report.created_at) {
        const reportWeekStart = getWeekStart(new Date(report.created_at));
        const weekKey = reportWeekStart.toISOString().slice(0, 10);
        const bucket = weeklyMap.get(weekKey);

        if (bucket) {
          bucket.count += 1;
        }
      }
    });

    const validRatings = (ratings || [])
      .map((rating) => Number(rating.score))
      .filter((score) => Number.isFinite(score));
    const averageRating = validRatings.length
      ? validRatings.reduce((total, score) => total + score, 0) / validRatings.length
      : null;

    return res.json({
      reportsByCategory: [...categoryMap.values()],
      reportsByStatus: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        label: getStatusMeta(status).label,
        count
      })),
      reportsByWeek: weeklyBuckets,
      averageRating: averageRating === null ? null : Number(averageRating.toFixed(2))
    });
  } catch (error) {
    return res.status(500).json({
      message: `Gagal memuat statistik: ${error.message}`
    });
  }
};

exports.getCategoriesPage = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const categories = await loadCategories(userSupabase);
    const { data: reports, error: reportsError } = await userSupabase
      .from('reports')
      .select('category_id');

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    const usageCounts = new Map();
    (reports || []).forEach((report) => {
      usageCounts.set(report.category_id, (usageCounts.get(report.category_id) || 0) + 1);
    });

    return res.render('admin/categories/index', {
      title: 'Kelola Kategori',
      categories: categories.map((category) => ({
        ...category,
        report_count: usageCounts.get(category.id) || 0
      })),
      error: null
    });
  } catch (error) {
    return res.render('admin/categories/index', {
      title: 'Kelola Kategori',
      categories: [],
      error: `Gagal memuat kategori: ${error.message}`
    });
  }
};

exports.getNewCategoryForm = (req, res) => {
  res.render('admin/categories/form', {
    title: 'Tambah Kategori',
    mode: 'create',
    category: {
      name: '',
      icon: ''
    },
    error: null
  });
};

exports.createCategory = async (req, res) => {
  const category = {
    name: req.body.name ? req.body.name.trim() : '',
    icon: req.body.icon ? req.body.icon.trim() : ''
  };

  if (!category.name) {
    return res.render('admin/categories/form', {
      title: 'Tambah Kategori',
      mode: 'create',
      category,
      error: 'Nama kategori wajib diisi.'
    });
  }

  try {
    const userSupabase = getUserSupabase(req);
    const { error } = await userSupabase
      .from('categories')
      .insert(category);

    if (error) {
      throw new Error(error.message);
    }

    req.flash('success', 'Kategori berhasil ditambahkan.');
    return res.redirect('/admin/categories');
  } catch (error) {
    return res.render('admin/categories/form', {
      title: 'Tambah Kategori',
      mode: 'create',
      category,
      error: `Gagal menambah kategori: ${error.message}`
    });
  }
};

exports.getEditCategoryForm = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data: category, error } = await userSupabase
      .from('categories')
      .select('id, name, icon')
      .eq('id', req.params.id)
      .single();

    if (error || !category) {
      req.flash('error', 'Kategori tidak ditemukan.');
      return res.redirect('/admin/categories');
    }

    return res.render('admin/categories/form', {
      title: 'Edit Kategori',
      mode: 'edit',
      category,
      error: null
    });
  } catch (error) {
    req.flash('error', `Gagal memuat kategori: ${error.message}`);
    return res.redirect('/admin/categories');
  }
};

exports.updateCategory = async (req, res) => {
  const category = {
    id: req.params.id,
    name: req.body.name ? req.body.name.trim() : '',
    icon: req.body.icon ? req.body.icon.trim() : ''
  };

  if (!category.name) {
    return res.render('admin/categories/form', {
      title: 'Edit Kategori',
      mode: 'edit',
      category,
      error: 'Nama kategori wajib diisi.'
    });
  }

  try {
    const userSupabase = getUserSupabase(req);
    const { error } = await userSupabase
      .from('categories')
      .update({
        name: category.name,
        icon: category.icon
      })
      .eq('id', category.id);

    if (error) {
      throw new Error(error.message);
    }

    req.flash('success', 'Kategori berhasil diperbarui.');
    return res.redirect('/admin/categories');
  } catch (error) {
    return res.render('admin/categories/form', {
      title: 'Edit Kategori',
      mode: 'edit',
      category,
      error: `Gagal memperbarui kategori: ${error.message}`
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { count, error: countError } = await userSupabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', req.params.id);

    if (countError) {
      throw new Error(countError.message);
    }

    if (count > 0) {
      req.flash('error', `Kategori tidak bisa dihapus karena masih dipakai oleh ${count} laporan.`);
      return res.redirect('/admin/categories');
    }

    const { error } = await userSupabase
      .from('categories')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      throw new Error(error.message);
    }

    req.flash('success', 'Kategori berhasil dihapus.');
    return res.redirect('/admin/categories');
  } catch (error) {
    req.flash('error', `Gagal menghapus kategori: ${error.message}`);
    return res.redirect('/admin/categories');
  }
};

exports.assignReport = async (req, res) => {
  const reportId = req.params.id;
  const petugasId = req.body.petugas_id;

  if (!petugasId) {
    req.flash('error', 'Pilih petugas terlebih dahulu.');
    return res.redirect(`/reports/${reportId}`);
  }

  try {
    const userSupabase = getUserSupabase(req);
    const { data: report, error: reportError } = await userSupabase
      .from('reports')
      .select('id, title')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      req.flash('error', 'Laporan tidak ditemukan.');
      return res.redirect('/admin/reports');
    }

    const { data: petugas, error: petugasError } = await userSupabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', petugasId)
      .eq('role', 'petugas')
      .single();

    if (petugasError || !petugas) {
      req.flash('error', 'Petugas tidak ditemukan atau role bukan petugas.');
      return res.redirect(`/reports/${reportId}`);
    }

    const { data: assignedReport, error: updateError } = await userSupabase
      .from('reports')
      .update({ assigned_to: petugasId })
      .eq('id', reportId)
      .select('id, assigned_to')
      .single();

    if (updateError || !assignedReport || assignedReport.assigned_to !== petugasId) {
      throw new Error(
        updateError?.message
        || 'Assign petugas tidak tersimpan. Pastikan policy update reports untuk admin sudah dijalankan di Supabase SQL Editor.'
      );
    }

    try {
      await createNotification(
        petugasId,
        reportId,
        `Anda ditugaskan menangani laporan: ${report.title}`,
        userSupabase
      );

      req.flash('success', `Laporan berhasil ditugaskan ke ${petugas.full_name || 'petugas'} dan notifikasi dikirim.`);
    } catch (notificationError) {
      console.warn(`Notifikasi assignment gagal dikirim untuk laporan ${reportId}: ${notificationError.message}`);
      req.flash('success', `Laporan berhasil ditugaskan ke ${petugas.full_name || 'petugas'}.`);
    }

    return res.redirect(`/reports/${reportId}`);
  } catch (error) {
    req.flash('error', `Gagal assign petugas: ${error.message}`);
    return res.redirect(`/reports/${reportId}`);
  }
};

exports.updateReportStatus = async (req, res) => {
  const reportId = req.params.id;
  const { status, note } = req.body;

  if (!statusList.includes(status)) {
    req.flash('error', 'Status laporan tidak valid.');
    return res.redirect(`/reports/${reportId}`);
  }

  try {
    const userSupabase = getUserSupabase(req);
    const notificationMessage = getStatusNotificationMessage(status);
    const { data: report, error: reportError } = await userSupabase
      .from('reports')
      .select('id, assigned_to')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      req.flash('error', 'Laporan tidak ditemukan.');
      return res.redirect('/admin/reports');
    }

    if (req.session.user.role === 'petugas' && report.assigned_to !== req.session.user.id) {
      req.flash('error', 'Anda hanya bisa memperbarui status laporan yang ditugaskan kepada Anda.');
      return res.redirect('/petugas/dashboard');
    }

    const { error: updateError } = await userSupabase
      .rpc('update_report_status_with_history', {
        p_report_id: reportId,
        p_status: status,
        p_note: note || '',
        p_notification_message: notificationMessage
      });

    if (updateError) {
      throw new Error(updateError.message);
    }

    req.flash('success', 'Status laporan berhasil diperbarui dan notifikasi dikirim ke pelapor.');
    return res.redirect(`/reports/${reportId}`);
  } catch (error) {
    req.flash('error', `Gagal update status laporan: ${error.message}`);
    return res.redirect(`/reports/${reportId}`);
  }
};
