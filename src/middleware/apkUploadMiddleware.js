import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directory exists
const uploadDir = "uploads/apk";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage for APK files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `app-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// File filter (APK and IPA files only)
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/vnd.android.package-archive", // .apk
    "application/octet-stream", // sometimes .apk
  ];

  const allowedExtensions = [".apk", ".ipa"];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (
    allowedMimes.includes(file.mimetype) ||
    allowedExtensions.includes(fileExt) ||
    file.originalname.endsWith(".apk") ||
    file.originalname.endsWith(".ipa")
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only APK and IPA files are allowed! File must be .apk or .ipa"
      ),
      false
    );
  }
};

// Export middleware
export const apkUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for APK files
});
