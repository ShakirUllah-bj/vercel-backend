import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cloudinary from "./cloudinary.js";
import { Readable } from "stream";

// ES6 module __dirname alternative
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../uploads/documents");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

// File filter to only accept PDFs
const fileFilter = (req, file, cb) => {
  console.log("file:  ", file);
  if (file.mimetype === "application/pdf") {
    cb(null, true); // Allow PDFs
  } else {
    cb(new Error("Only PDF files are allowed"), false); // Reject non-PDFs
  }
};

// Configure multer middleware
const upload = multer({
  storage,
  fileFilter,
  limits: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB limit
});

export const uploadToCloudinary = (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ai_learning_assistant",
        resource_type: "raw",
        access_mode: "public",
        type: "upload",
        format: "pdf",
        overwrite: true,
        public_id: `${Date.now()}-${originalname.replace(/\s+/g, "-")}`,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    const readable = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      },
    });

    readable.pipe(uploadStream);
  });
};

export default upload;
