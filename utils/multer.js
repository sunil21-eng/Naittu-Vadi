const multer = require('multer');
const path = require('path');

const filterFile = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only image files (JPEG, PNG, JPG, WebP) are allowed!"), false);
  }
};

// Memory storage is essential for Cloudinary – it provides the file buffer
const memoryStorage = multer.memoryStorage();

// Product upload configuration (multiple files)
const uploadProduct = multer({
  storage: memoryStorage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 
  },
  fileFilter: filterFile
});

// Profile upload configuration (single file)
const uploadProfile = multer({
  storage: memoryStorage,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB per file
  },
  fileFilter: filterFile
});

module.exports = { uploadProduct, uploadProfile };