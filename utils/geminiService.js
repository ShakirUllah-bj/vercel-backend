import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "FATAL ERROR: GEMINI_API_KEY is not set in environment variables.",
  );
  process.exit(1);
}

/**
 * Generate flashcards from text
 * @param {string} text - Document text
 * @param {number} count - Number of flashcards to generate
 * @return {Promise<Array<{ question: string, answer: string, difficulty: string }>>}
 */

export const generateFlashcards = async (text, count = 10) => {
  const prompt = `Generate exactly ${count} educational flashcards from the following text.
    Format each flashcard as follows:
    Q: [Clear, specific question]
    A: [Concise, accurate answer]
    D: [Difficulty level: Easy, Medium, Hard]
    
    Separate each flashcard with "---".

    Text:
    ${text.substring(0, 15000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const generatedText = response.text || "";

    // Parse the response into flashcards
    const flashcards = [];
    const cards = generatedText.split("---").filter((c) => c.trim());
    for (const card of cards) {
      const lines = card.trim().split("\n");
      let question = "",
        answer = "",
        difficulty = "medium";

      for (const line of lines) {
        if (line.startsWith("Q:")) {
          question = line.substring(2).trim();
        } else if (line.startsWith("A:")) {
          answer = line.substring(2).trim();
        } else if (line.startsWith("D:")) {
          const diff = line.substring(2).trim().toLowerCase();
          if (["easy", "medium", "hard"].includes(diff)) {
            difficulty = diff;
          }
        }
      }

      if (question && answer) {
        flashcards.push({ question, answer, difficulty });
      }
    }

    return flashcards.slice(0, count);
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to generate flashcards. Please try again later.");
  }
};

/**
 * Generate quiz questions from text
 * @param {string} text - Document text to generate quiz questions from
 * @param {number} numQuestions - Number of quiz questions to generate
 * @return {Promise<Array<{ question: string, options: Array, correctAnswer: string, explanation: string, difficulty: string }>>} - Generated quiz questions
 */
export const generateQuiz = async (text, numQuestions = 5) => {
  const prompt = `Generate exactly ${numQuestions} multiple-choice quiz questions from the following text.
    Format each question as follows:
    Q: [Question]
    01: [Option 1]
    02: [Option 2]
    03: [Option 3]
    04: [Option 4]
    C: [Correct option - exactly as written above]
    E: [Brief explanation of the correct answer]
    D: [Difficulty: Easy, Medium, or Hard]

    Separate each question with "---"

    Text:
    ${text.substring(0, 15000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const generatedText = response.text || "";

    const questions = [];
    const questionBlocks = generatedText.split("---").filter((q) => q.trim());

    for (const block of questionBlocks) {
      const lines = block.trim().split("\n");
      let question = "",
        options = [],
        correctAnswer = "",
        explanation = "",
        difficulty = "medium";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("Q:")) {
          question = trimmed.substring(2).trim();
        } else if (trimmed.match(/^0\d:/)) {
          options.push(trimmed.substring(3).trim());
        } else if (trimmed.startsWith("C:")) {
          correctAnswer = trimmed.substring(2).trim();
        } else if (trimmed.startsWith("E:")) {
          explanation = trimmed.substring(2).trim();
        } else if (trimmed.startsWith("D:")) {
          const diff = trimmed.substring(2).trim().toLowerCase();
          if (["easy", "medium", "hard"].includes(diff)) {
            difficulty = diff;
          }
        }
      }

      if (question && options.length === 4 && correctAnswer) {
        questions.push({
          question,
          options,
          correctAnswer,
          explanation,
          difficulty,
        });
      }
    }

    return questions.slice(0, numQuestions);
  } catch (error) {
    console.error("Gemini API error: ", error);
    throw new Error(
      "Failed to generate quiz questions. Please try again later.",
    );
  }
};

/**
 * Generate document summary
 * @param {string} text - Document text to summarize
 * @returns {Promise<string>} - Generated summary
 */
export const generateSummary = async (text) => {
  const prompt = `Provide a concise summary of the following text, highlighting the key concepts and main ideas. and important points. The summary should be clear, structured and informative, capturing the essence of the content without unnecessary details. 
    
    Text:
    ${text.substring(0, 20000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const generatedText = response.text || "";
    return generatedText.trim();
  } catch (error) {
    console.error("Gemini API error: ", error);
    throw new Error("Failed to generate summary. Please try again later.");
  }
};

/**
 * Chat with document content
 * @param {string} question - User's question about the document
 * @param {Array<Object>} chunks - Relevant document chunks to provide context for the answer
 * @returns {Promise<string>} - Generated answer
 */

export const chatWithContent = async (question, chunks) => {
  const context = chunks
    .map((c, i) => `[Chunk ${i + 1}]\n${c.content}`)
    .join("\n\n");

  console.log(`content________`, context);

  const prompt = `Based on the following context from a document, Analyse the context and answer the user's question. Provide a clear and concise answer, citing relevant chunks of information from the context to support your response. If the answer is not found in the provided context, indicate that the information is unavailable.

    Context:
    ${context}
    
    Question:
    ${question}
    
    Answer:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const generatedText = response.text || "";
    return generatedText.trim();
  } catch (error) {
    console.error("Gemini API error: ", error);
    throw new Error("Failed to process chat request. Please try again later.");
  }
};

/**
 * Explain a specific concept from the document
 * @param {string} concept - The concept to explain
 * @param {string} context - Relevant document context to provide background for the explanation
 * @returns {Promise<string>} - Generated explanation
 */
export const explainConcept = async (concept, context) => {
  const prompt = `Explain the concept of "${concept}" based on the following context. Provide a clear and concise explanation that is easy to understand, even for someone who may not be familiar with the topic. Use examples if relevant from the context to illustrate the concept where appropriate. 
    
    Context: 
    ${context.substring(0, 10000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const generatedText = response.text || "";
    return generatedText.trim();
  } catch (error) {
    console.error("Gemini API error in explainConcept: ", error);
    throw new Error("Failed to explain concept. Please try again later.");
  }
};
