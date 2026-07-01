const crypto = require('crypto');
const { createRequestClient } = require('../config/supabaseClient');
const { getPetugasList } = require('./adminController');

const renderNewReportForm = (res, data = {}) => {
  res.render('reports/new', {
    title: 'Buat Laporan - Smart City Report',
    categories: data.categories || [],
    formData: data.formData || {},
    error: data.error || null
  });
};

const getUserSupabase = (req) => createRequestClient(req.session.access_token);

const loadCategories = async (req) => {
  const userSupabase = getUserSupabase(req);
  if (!userSupabase) throw new Error('Konfigurasi Supabase belum lengkap.');
  const { data, error } = await userSupabase
    .from('categories')
    .select('id, name, icon')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
};

const validateReportInput = (body, file) => {
  const errors = [];
  if (!body.title || !body.title.trim()) errors.push('Judul laporan wajib diisi.');
  if (!body.description || !body.description.trim()) errors.push('Deskripsi masalah wajib diisi.');
  if (!body.category_id) errors.push('Kategori wajib dipilih.');
  if (!body.latitude) errors.push('Titik lokasi pada peta wajib dipilih.');
  if (!body.longitude) errors.push('Titik lokasi pada peta wajib dipilih.');
  if (!file) errors.push('Foto laporan wajib diupload.');
  if (file && !file.mimetype.startsWith('image/')) errors.push('File foto harus berupa gambar.');
  return errors;
};

const getStatusMeta = (status) => {
  const normalizedStatus = status || 'pending';
  const meta = {
    pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    diproses: { label: 'Diproses', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    selesai: { label: 'Selesai', className: 'bg-green-100 text-green-800 border-green-200' },
    ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 border-red-200' }
  };
  return meta[normalizedStatus] || { label: normalizedStatus, className: 'bg-slate-100 text-slate-800 border-slate-200' };
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
};

const getReportForAccessCheck = async (userSupabase, reportId) => {
  const { data, error } = await userSupabase
    .from('reports')
    .select('id, user_id')
    .eq('id', reportId)
    .single();
  if (error || !data) return null;
  return data;
};

// ===== HELPER: Kirim notif ke semua admin =====
const notifyAllAdmins = async (userSupabase, reportId, message) => {
  try {
    const { data: admins } = await userSupabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        try {
          await createNotification(admin.id, reportId, message, userSupabase);
        } catch (e) {
          console.warn('Gagal kirim notif ke admin:', e.message);
        }
      }
    }
  } catch (e) {
    console.warn('Gagal ambil daftar admin:', e.message);
  }
};

// ===== HELPER: Kirim notif ke semua petugas =====
const notifyAllPetugas = async (userSupabase, reportId, message) => {
  try {
    const { data: petugas } = await userSupabase
      .from('profiles')
      .select('id')
      .eq('role', 'petugas');

    if (petugas && petugas.length > 0) {
      for (const p of petugas) {
        try {
          await createNotification(p.id, reportId, message, userSupabase);
        } catch (e) {
          console.warn('Gagal kirim notif ke petugas:', e.message);
        }
      }
    }
  } catch (e) {
    console.warn('Gagal ambil daftar petugas:', e.message);
  }
};

exports.getNewReportForm = async (req, res) => {
  try {
    const categories = await loadCategories(req);
    return renderNewReportForm(res, { categories });
  } catch (error) {
    return renderNewReportForm(res, { error: `Gagal memuat kategori: ${error.message}` });
  }
};

exports.createReport = async (req, res) => {
  const formData = {
    title: req.body.title,
    description: req.body.description,
    category_id: req.body.category_id,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    address: req.body.address
  };

  try {
    const categories = await loadCategories(req);
    const validationErrors = validateReportInput(req.body, req.file);

    if (validationErrors.length) {
      return renderNewReportForm(res, { categories, formData, error: validationErrors[0] });
    }

    const userSupabase = getUserSupabase(req);
    const extension = req.file.originalname.split('.').pop() || 'jpg';
    const filePath = `${req.session.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await userSupabase.storage
      .from('report-photos')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) {
      return renderNewReportForm(res, { categories, formData, error: `Gagal upload foto: ${uploadError.message}` });
    }

    const { data: publicUrlData } = userSupabase.storage.from('report-photos').getPublicUrl(filePath);

    const { data: insertedReport, error: insertError } = await userSupabase
      .from('reports')
      .insert({
        user_id: req.session.user.id,
        category_id: formData.category_id,
        title: formData.title.trim(),
        description: formData.description.trim(),
        photo_url: publicUrlData.publicUrl,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        address: formData.address ? formData.address.trim() : null,
        status: 'pending'
      })
      .select('id')
      .single();

    if (insertError) {
      return renderNewReportForm(res, { categories, formData, error: `Gagal menyimpan laporan: ${insertError.message}` });
    }

    const reportId = insertedReport?.id || null;
    const judulLaporan = formData.title.trim();

    // ✅ NOTIF ke Admin: ada laporan baru masuk
    await notifyAllAdmins(
      userSupabase,
      reportId,
      `Laporan baru masuk: "${judulLaporan}" menunggu tindak lanjut.`
    );

    // ✅ NOTIF ke Petugas: ada laporan baru
    await notifyAllPetugas(
      userSupabase,
      reportId,
      `Ada laporan baru masuk: "${judulLaporan}".`
    );

    req.flash('success', 'Laporan berhasil dibuat dan menunggu tindak lanjut.');
    return res.redirect('/reports/my');
  } catch (error) {
    return renderNewReportForm(res, { formData, error: error.message });
  }
};

exports.getMyReports = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data, error } = await userSupabase
      .from('reports')
      .select(`id, title, photo_url, status, created_at, categories (id, name, icon)`)
      .eq('user_id', req.session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    res.render('reports/my-reports', {
      title: 'Laporan Saya',
      reports: data || [],
      getStatusMeta,
      formatDate,
      error: null
    });
  } catch (error) {
    res.render('reports/my-reports', {
      title: 'Laporan Saya',
      reports: [],
      getStatusMeta,
      formatDate,
      error: `Gagal memuat laporan: ${error.message}`
    });
  }
};

exports.getMapPage = (req, res) => {
  res.render('reports/map', { title: 'Peta Laporan' });
};

exports.getMapData = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data, error } = await userSupabase
      .from('reports')
      .select(`id, title, photo_url, latitude, longitude, status, categories (id, name, icon)`)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) throw new Error(error.message);

    const reports = (data || []).map((report) => ({
      id: report.id,
      title: report.title,
      photo_url: report.photo_url,
      latitude: Number(report.latitude),
      longitude: Number(report.longitude),
      status: report.status || 'pending',
      category_id: report.categories?.id || null,
      category_name: report.categories?.name || 'Tanpa kategori',
      category_icon: report.categories?.icon || ''
    }));

    return res.json(reports);
  } catch (error) {
    return res.status(500).json({ message: `Gagal memuat data peta: ${error.message}` });
  }
};

exports.getReportDetail = async (req, res) => {
  try {
    const userSupabase = getUserSupabase(req);
    const { data: report, error: reportError } = await userSupabase
      .from('reports')
      .select(`
        id, user_id, assigned_to, category_id, title, description,
        photo_url, latitude, longitude, address, status, created_at,
        categories (id, name, icon)
      `)
      .eq('id', req.params.id)
      .single();

    if (reportError || !report) {
      return res.status(404).render('errors/404', { title: 'Laporan Tidak Ditemukan' });
    }

    const { data: history, error: historyError } = await userSupabase
      .from('report_status_history')
      .select('*')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true });

    if (historyError) throw new Error(historyError.message);

    const { data: comments, error: commentsError } = await userSupabase
      .from('comments')
      .select(`id, content, created_at, profiles (full_name)`)
      .eq('report_id', report.id)
      .order('created_at', { ascending: false });

    if (commentsError) throw new Error(commentsError.message);

    const { count: upvoteCount, error: upvoteCountError } = await userSupabase
      .from('upvotes')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', report.id);

    if (upvoteCountError) throw new Error(upvoteCountError.message);

    const { data: userUpvote, error: userUpvoteError } = await userSupabase
      .from('upvotes')
      .select('id')
      .eq('report_id', report.id)
      .eq('user_id', req.session.user.id)
      .maybeSingle();

    if (userUpvoteError) throw new Error(userUpvoteError.message);

    let petugasList = [];
    let assignedPetugas = null;

    if (req.session.user.role === 'admin') {
      petugasList = await getPetugasList(userSupabase);
      assignedPetugas = petugasList.find((profile) => profile.id === report.assigned_to) || null;

      if (report.assigned_to && !assignedPetugas) {
        const { data: assignedProfile, error: assignedError } = await userSupabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url')
          .eq('id', report.assigned_to)
          .maybeSingle();
        if (!assignedError && assignedProfile) assignedPetugas = assignedProfile;
      }
    }

    return res.render('reports/detail', {
      title: report.title,
      report,
      history: history || [],
      comments: comments || [],
      upvoteCount: upvoteCount || 0,
      hasUpvoted: Boolean(userUpvote),
      petugasList,
      assignedPetugas,
      getStatusMeta,
      formatDate
    });
  } catch (error) {
    req.flash('error', `Gagal memuat detail laporan: ${error.message}`);
    return res.redirect('/reports/my');
  }
};

exports.addComment = async (req, res) => {
  const reportId = req.params.id;
  const content = req.body.content ? req.body.content.trim() : '';

  if (!content) {
    req.flash('error', 'Komentar tidak boleh kosong.');
    return res.redirect(`/reports/${reportId}`);
  }

  try {
    const userSupabase = getUserSupabase(req);
    const report = await getReportForAccessCheck(userSupabase, reportId);

    if (!report) {
      req.flash('error', 'Laporan tidak ditemukan.');
      return res.redirect('/reports/my');
    }

    const { error } = await userSupabase.from('comments').insert({
      report_id: reportId,
      user_id: req.session.user.id,
      content
    });

    if (error) throw new Error(error.message);

    // ✅ NOTIF ke pemilik laporan: ada komentar baru (kecuali komentar dari diri sendiri)
    if (report.user_id !== req.session.user.id) {
      try {
        await createNotification(
          report.user_id,
          reportId,
          `Laporan kamu mendapat komentar baru.`,
          userSupabase
        );
      } catch (e) {
        console.warn('Gagal kirim notif komentar:', e.message);
      }
    }

    // ✅ NOTIF ke Admin: ada komentar baru di laporan
    await notifyAllAdmins(
      userSupabase,
      reportId,
      `Ada komentar baru pada laporan ID: ${reportId}.`
    );

    req.flash('success', 'Komentar berhasil ditambahkan.');
    return res.redirect(`/reports/${reportId}`);
  } catch (error) {
    req.flash('error', `Gagal menambahkan komentar: ${error.message}`);
    return res.redirect(`/reports/${reportId}`);
  }
};

exports.toggleUpvote = async (req, res) => {
  const reportId = req.params.id;

  try {
    const userSupabase = getUserSupabase(req);
    const report = await getReportForAccessCheck(userSupabase, reportId);

    if (!report) {
      req.flash('error', 'Laporan tidak ditemukan.');
      return res.redirect('/reports/my');
    }

    const { data: existingUpvote, error: findError } = await userSupabase
      .from('upvotes')
      .select('id')
      .eq('report_id', reportId)
      .eq('user_id', req.session.user.id)
      .maybeSingle();

    if (findError) throw new Error(findError.message);

    if (existingUpvote) {
      const { error: deleteError } = await userSupabase
        .from('upvotes')
        .delete()
        .eq('id', existingUpvote.id);
      if (deleteError) throw new Error(deleteError.message);
      req.flash('success', 'Dukungan urgensi dibatalkan.');
      return res.redirect(`/reports/${reportId}`);
    }

    const { error: insertError } = await userSupabase.from('upvotes').insert({
      report_id: reportId,
      user_id: req.session.user.id
    });

    if (insertError) throw new Error(insertError.message);

    // ✅ NOTIF ke pemilik laporan: ada upvote baru (kecuali upvote dari diri sendiri)
    if (report.user_id !== req.session.user.id) {
      try {
        await createNotification(
          report.user_id,
          reportId,
          `Laporan kamu mendapat dukungan urgensi baru!`,
          userSupabase
        );
      } catch (e) {
        console.warn('Gagal kirim notif upvote:', e.message);
      }
    }

    req.flash('success', 'Dukungan urgensi berhasil ditambahkan.');
    return res.redirect(`/reports/${reportId}`);
  } catch (error) {
    req.flash('error', `Gagal memproses dukungan urgensi: ${error.message}`);
    return res.redirect(`/reports/${reportId}`);
  }
};
