import { GoogleGenAI, Type } from "@google/genai";
import { Word, LanguageLevel, WordStatus } from "../types";
import { storageService } from "./storage";

// Helper to generate a unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export const geminiService = {
  /**
   * Generates a list of vocabulary words using Gemini.
   */
  generateWords: async (
    category: string,
    level: LanguageLevel,
    count: number,
    existingWords: string[] // List of English words to avoid duplicates
  ): Promise<Word[]> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing");

    const settings = storageService.getSettings();
    const ai = new GoogleGenAI({ apiKey });

    // Select model based on settings
    // Basic Text Tasks: 'gemini-3-flash-preview'
    // Complex Text Tasks: 'gemini-3-pro-preview'
    const modelName = settings.aiModelType === 'pro' 
        ? 'gemini-3-pro-preview' 
        : 'gemini-3-flash-preview';

    const prompt = `
      Generate ${count} distinct English vocabulary words related to the category "${category}" suitable for CEFR level ${level}.
      Do not include these words: ${existingWords.join(", ")}.
      For each word, provide the Polish translation and a simple example sentence.
    `;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                english: { type: Type.STRING },
                polish: { type: Type.STRING },
                exampleSentence: { type: Type.STRING },
              },
              required: ["english", "polish", "exampleSentence"],
            },
          },
        },
      });

      if (response.text) {
        const rawData = JSON.parse(response.text);
        
        // Map to our Word interface
        return rawData.map((item: any) => ({
          id: generateId(),
          english: item.english,
          polish: item.polish,
          category: category,
          level: level,
          exampleSentence: item.exampleSentence,
          status: WordStatus.New,
          nextReview: Date.now(),
          lastReview: null,
          attempts: 0,
          correct: 0,
          aiGenerated: true,
          imageUrl: undefined, // Generated on demand or fallback
        }));
      }
      return [];
    } catch (error) {
      console.error("Gemini Generation Error:", error);
      throw error;
    }
  },

  /**
   * Generates an image for a word.
   * Tries Gemini first, then falls back to Pollinations.ai (Free, unlimited).
   */
  generateImage: async (word: string, context: string): Promise<string> => {
    const settings = storageService.getSettings();
    const apiKey = process.env.API_KEY;
    
    // 1. Attempt Gemini Image Gen
    // Only if API key exists.
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        // Select model based on settings
        // General Image: 'gemini-2.5-flash-image'
        // High-Quality Image: 'gemini-3-pro-image-preview'
        const modelName = settings.aiModelType === 'pro'
            ? 'gemini-3-pro-image-preview'
            : 'gemini-2.5-flash-image';

        const response = await ai.models.generateContent({
          model: modelName,
          contents: `A simple, minimalist, vector-style illustration of "${word}". Context: ${context}. White background. No text.`,
          config: {
            // responseMimeType is not supported for nano banana series models
          }
        });

        // Parse parts for image
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
      } catch (e: any) {
        console.warn("Gemini image generation failed (Quota or Error). Switching to fallback.", e.message);
        // We continue to fallback if Gemini fails (e.g., 429 Quota Exceeded)
      }
    }

    // 2. Fallback: Pollinations.ai
    // Great free alternative that works via URL, no API key needed, no CORS issues for images.
    console.log("Using Pollinations.ai fallback...");
    const encodedPrompt = encodeURIComponent(`minimalist vector illustration of ${word}, ${context}, white background, flat design, icon style, clear lines`);
    // Random seed to prevent browser caching if generated multiple times
    const seed = Math.floor(Math.random() * 1000); 
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
  },
  
  /**
   * Validates a translation using Gemini (AI Self-Check).
   */
  checkTranslation: async (polishWord: string, userEnglishInput: string): Promise<{ isCorrect: boolean; feedback: string }> => {
     const apiKey = process.env.API_KEY;
     
     // Fallback function for basic string check
     const basicCheck = () => {
         const cleanInput = userEnglishInput.trim().toLowerCase();
         // Usually we would need the original English word here, but checkTranslation assumes 
         // we are checking against logic. 
         // Ideally, the caller should probably handle strict check if AI fails, 
         // but here we will try our best or return a neutral "offline" state.
         
         // Since we don't pass the "Correct English" word to this function (only Polish and User Input),
         // we can't do a perfect fallback unless we change the signature.
         // However, in TypingMode, we know the correct english word.
         // Let's modify this to be robust even if AI fails.
         return {
             isCorrect: false, // We can't know for sure without the target word
             feedback: "AI niedostępne (Limit). Sprawdź dokładnie pisownię."
         };
     };

     if (!apiKey) return basicCheck();

     const ai = new GoogleGenAI({ apiKey });
     
     try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `
                The user is translating the Polish word "${polishWord}" into English.
                They wrote: "${userEnglishInput}".
                Is this correct? Even if it's a synonym, count it as correct.
                Return JSON.
            `,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isCorrect: { type: Type.BOOLEAN },
                        feedback: { type: Type.STRING }
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
     } catch (e) {
         console.warn("AI Self-Check failed (likely 429).", e);
         // Return a specific flag so the UI can do a simple string match instead
         // We return 'true' here but with a special feedback to let the UI know to fallback
         return { isCorrect: false, feedback: "AI_ERROR" };
     }
     
     return { isCorrect: false, feedback: "Error validating." };
  }
};
