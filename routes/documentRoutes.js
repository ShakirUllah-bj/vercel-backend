import express from "express";
import {
  uploadDocument,
  getDocuments,
  getDocument,
  streamDocument,
  deleteDocument,
} from "../controllers/documentController.js";
import protect from "../middleware/auth.js";
import upload from "../config/multer.js";

const router = express.Router();

// All routes are protected
router.use(protect);

router.post("/upload", upload.single("file"), uploadDocument);
router.get("/", getDocuments);
router.get("/:id/stream", streamDocument);
router.get("/:id", getDocument);
router.delete("/:id", deleteDocument);

export default router;
