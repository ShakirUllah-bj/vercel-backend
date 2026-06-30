import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { extractTextFromPDF } from "../utils/pdfParser.js";
import { ChunkText } from "../utils/textChunker.js";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../config/multer.js";
import { Readable } from "stream";

const createSignedCloudinaryUrl = (publicId) => {
  if (!publicId) return null;

  return cloudinary.url(publicId, {
    resource_type: "raw",
    type: "upload",
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
};

// @desc    Upload PDF document
// @route   POST /api/documents/upload
// @access  Private
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Please upload a PDF file",
        statusCode: 400,
      });
    }

    const { title } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Please provide a title for the document",
        statusCode: 400,
      });
    }

    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname,
    );

    const signedUrl = createSignedCloudinaryUrl(uploadResult.public_id);

    // Create document record in the database
    const document = await Document.create({
      userId: req.user._id,
      title,
      fileUrl: signedUrl,
      fileName: req.file.originalname,
      filePath: uploadResult.secure_url,
      fileSize: req.file.size,
      cloudinaryPublicId: uploadResult.public_id,
      status: "processing",
    });

    // Process the PDF in the background {in production, use a queue like Bull}
    processPDF(
      document._id,
      req.file.buffer,
      signedUrl,
      uploadResult.public_id,
    ).catch((err) => {
      console.error("PDF processing error: ", err);
    });

    res.status(201).json({
      success: true,
      data: document,
      message: "Document uploaded successfully. Processing in background.",
      statusCode: 201,
    });
    console.log("Document uploaded: ", document._id);
  } catch (error) {
    next(error);
  }
};

// Helper function to process PDF
const processPDF = async (documentId, fileBuffer, fileUrl, publicId) => {
  try {
    const tempFilePath = path.join(
      process.cwd(),
      "uploads",
      `${documentId}.pdf`,
    );
    await fs.writeFile(tempFilePath, Buffer.from(fileBuffer));

    const { text } = await extractTextFromPDF(tempFilePath);
    // Create text chunks
    const chunks = ChunkText(text, 500, 50); // Adjust chunk size as needed

    // Update document with extracted text, chunks, and Cloudinary info
    await Document.findByIdAndUpdate(documentId, {
      extractedText: text,
      chunks: chunks,
      fileUrl: fileUrl,
      cloudinaryPublicId: publicId,
      status: "ready",
    });

    console.log(`Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}: `, error);
    await Document.findByIdAndUpdate(documentId, {
      status: "failed",
    });
  } finally {
    // Delete the temporary local file
    const tempFilePath = path.join(
      process.cwd(),
      "uploads",
      `${documentId}.pdf`,
    );
    await fs.unlink(tempFilePath).catch((err) => {
      console.error(
        `Failed to delete temporary file ${tempFilePath}:`,
        err.message,
      );
    });
  }
};

// @desc    Get all user documents
// @route   GET /api/documents
// @access  Private
export const getDocuments = async (req, res, next) => {
  try {
    const documents = await Document.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      {
        $lookup: {
          from: "flashcards",
          localField: "_id",
          foreignField: "documentId",
          as: "flashcardSet",
        },
      },
      {
        $lookup: {
          from: "quizzes",
          localField: "_id",
          foreignField: "documentId",
          as: "quizzes",
        },
      },
      {
        $addFields: {
          flashcardCount: { $size: "$flashcardSet" },
          quizCount: { $size: "$quizzes" },
        },
      },
      {
        $project: {
          extractedText: 0,
          chunks: 0,
          flashcardSet: 0,
          quizzes: 0,
        },
      },

      {
        $sort: { uploadDate: -1 },
      },
    ]);

    const documentsWithSignedUrls = documents.map((document) => {
      const signedUrl = createSignedCloudinaryUrl(document.cloudinaryPublicId);
      return {
        ...document,
        fileUrl: signedUrl || document.fileUrl || document.filePath,
        filePath: signedUrl || document.filePath || document.fileUrl,
      };
    });

    res.status(200).json({
      success: true,
      data: documentsWithSignedUrls,
      count: documentsWithSignedUrls.length,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single document with chunks
// @route   GET /api/documents/:id
// @access  Private
export const getDocument = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid document ID format",
        statusCode: 400,
      });
    }

    const document = await Document.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: req.user._id,
    });

    console.log("User ID from Request:", req.user?._id);
    console.log("Document ID from Request:", req.params?.id);
    console.log("Document found:", !!document);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
        statusCode: 404,
      });
    }

    // Get counts of associated flashcards and quizzes
    const flashcardCount = await Flashcard.countDocuments({
      documentId: document._id,
      userId: req.user._id,
    });
    const quizCount = await Quiz.countDocuments({
      documentId: document._id,
      userId: req.user._id,
    });

    // Update last accessed date
    document.lastAccessed = new Date();
    await document.save();

    // Combine document data with counts
    const documentData = document.toObject();
    const signedUrl = createSignedCloudinaryUrl(
      documentData.cloudinaryPublicId,
    );
    documentData.flashcardCount = flashcardCount;
    documentData.quizCount = quizCount;
    documentData.fileUrl =
      signedUrl || documentData.fileUrl || documentData.filePath;
    documentData.filePath =
      signedUrl || documentData.filePath || documentData.fileUrl;

    res.status(200).json({
      success: true,
      data: documentData,
    });
  } catch (error) {
    console.error("Error in getDocument:", error.message);
    next(error);
  }
};

// @desc    delete document
// @route   DELETE /api/documents/:id
// @access  Private
export const streamDocument = async (req, res, next) => {
  try {
    const documentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid document ID format",
        statusCode: 400,
      });
    }

    const document = await Document.findOne({
      _id: new mongoose.Types.ObjectId(documentId),
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
        statusCode: 404,
      });
    }

    if (!document.cloudinaryPublicId) {
      return res.status(404).json({
        success: false,
        error: "Document file not found",
        statusCode: 404,
      });
    }

    const downloadUrl = cloudinary.utils.private_download_url(
      document.cloudinaryPublicId,
      "pdf",
      {
        resource_type: "raw",
        type: "upload",
      },
    );

    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Cloudinary download failed: ${response.status}`);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${document.fileName || "document.pdf"}"`,
    );

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Error streaming document:", error.message);
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid document ID format",
        statusCode: 400,
      });
    }

    const document = await Document.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
        statusCode: 404,
      });
    }

    // Delete file from Cloudinary if it exists
    if (document.cloudinaryPublicId) {
      await cloudinary.uploader
        .destroy(document.cloudinaryPublicId, {
          resource_type: "image", // PDFs are uploaded as 'image' resource_type in Cloudinary
        })
        .catch((err) => {
          console.error(
            `Failed to delete Cloudinary asset ${document.cloudinaryPublicId}:`,
            err.message,
          );
        });
    }

    // Delete document record
    await Document.deleteOne({ _id: document._id });

    // Delete document's flashcards and quizzes
    await Flashcard.deleteMany({ documentId: document._id });
    await Quiz.deleteMany({ documentId: document._id });

    return res.status(200).json({
      success: true,
      message:
        "Document and associated flashcards/quizzes deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteDocument:", error.message);
    next(error);
  }
};
