import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

/**
 * Extract text content from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{text: string, numPages: number}>}
 */
export const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);

    // // Use pdf-parse directly on the Buffer
    // const parser = PDFParse(new Uint8Array(dataBuffer))
    // const data = await parser.getText()

    const parser = new PDFParse({ data: dataBuffer, verbosity: 0 });
    await parser.load();
    const result = await parser.getText();
    const infoData = await parser.getInfo();

    return {
      // text: data.text,
      // numPages: data.numpages,
      // info: data.info,
      text: result.text,
      numPages: result.total,
      info: infoData.info,
    };
  } catch (error) {
    console.error("PDF parsing error: ", error);
    throw new Error("Failed to extract text from PDF");
  }
};
