require('dotenv').config();

const path = require('path');
const express = require('express');
const methodOverride = require('method-override');
const session = require('express-session');
const flash = require('connect-flash');
const { createRequestClient, supabasePublicConfig } = require('./config/supabaseClient');
const { refreshSessionIfNeeded } = require('./middleware/authMiddleware'); // <-- DITAMBAHKAN

const indexRoutes = require('./routes/indexRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const infoRouter = require('./routes/infoRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
  if (req.query && '_method' in req.query) {
    return req.query._method;
  }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'smart-city-report-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // <-- DIUBAH dari 1 hari jadi 7 hari
  }
}));
app.use(flash());
app.use(refreshSessionIfNeeded); // <-- DITAMBAHKAN (harus setelah flash dan session)

app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error')
  };
  res.locals.supabasePublicConfig = supabasePublicConfig;
  res.locals.unreadNotificationCount = 0;

  if (req.session.user && req.session.access_token) {
    const userSupabase = createRequestClient(req.session.access_token);

    if (userSupabase) {
      // 1. Ambil data profil terbaru dari database agar res.locals.currentUser selalu sinkron
      const { data: dbProfile } = await userSupabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', req.session.user.id)
        .single();

      if (dbProfile) {
        res.locals.currentUser = {
          ...req.session.user,
          full_name: dbProfile.full_name,
          role: dbProfile.role,
          avatar_url: dbProfile.avatar_url
        };
        // Sinkronkan juga ke session
        req.session.user.full_name = dbProfile.full_name;
        req.session.user.role = dbProfile.role;
        req.session.user.avatar_url = dbProfile.avatar_url;
      }

      // 2. Ambil jumlah notifikasi yang belum dibaca
      const { count, error } = await userSupabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.session.user.id)
        .eq('is_read', false);

      if (!error) {
        res.locals.unreadNotificationCount = count || 0;
      }
    }
  }

  next();
});

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/', dashboardRoutes);
app.use('/', reportRoutes);
app.use('/', notificationRoutes);
app.use('/', infoRouter);
app.use('/', profileRoutes);

app.use((req, res) => {
  res.status(404).render('errors/404', {
    title: '404 Not Found - Smart City Report'
  });
});

app.listen(PORT, () => {
  console.log(`Smart City Report berjalan di http://localhost:${PORT}`);
});
