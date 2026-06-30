import express from "express";

import {
  getFlashCards,
  getAllFlashCardSets,
  reviewFlashcard,
  toggleStarFlashcard,
  deleteFlashcardSet,
} from "../controllers/flashcardController.js";

import protect from "../middleware/auth.js";

const router = express.Router();
// All routes are protected
router.use(protect);

router.get("/", getAllFlashCardSets);
router.get("/:documentId", getFlashCards);
router.post("/:cardId/review", reviewFlashcard);
router.put("/:cardId/star", toggleStarFlashcard);
router.delete("/:id", deleteFlashcardSet);

export default router;
