const multer = require('multer');

const storage = multer.memoryStorage(); // store in memory, upload to Supabase

// For Bhakto photo uploads
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// For Excel (.xlsx) imports
const uploadExcel = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // Flutter web sometimes sends this
    ];
    const isExcelExt =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.xls');
    if (allowedMimes.includes(file.mimetype) || isExcelExt) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx) are allowed'), false);
    }
  },
});

module.exports = { upload, uploadExcel };