const express = require('express');

const router = express.Router();

router.get('/info/events', (req, res) => {
  res.render('info/events', {
    title: 'Kalender Event Kota - Smart City Report',
    extraHead: "<script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js'></script>"
  });
});

router.get('/info/emergency', (req, res) => {
  res.render('info/emergency', {
    title: 'Nomor Darurat Kota - Smart City Report'
  });
});

module.exports = router;
