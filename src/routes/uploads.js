const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadFiles = require('../controllers/uploadController');

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const urls = await uploadFiles(req.files);
    res.status(200).json({ success: true, urls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
