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

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      Generate ${count} distinct English vocabulary words related to the category "${category}" suitable for CEFR level ${level}.
      Do not include these words: ${existingWords.join(", ")}.
      For each word, provide the Polish translation and a simple example sentence.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
   * Tries Gemini first, then Hugging Face if key is available.
   */
  generateImage: async (word: string, context: string): Promise<string> => {
    const settings = storageService.getSettings();
    const apiKey = process.env.API_KEY || settings.aiApiKey;
    const hfKey = settings.huggingFaceApiKey;
    
    // 1. Attempt Gemini Image Gen
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: `A simple, minimalist, vector-style illustration of "${word}". Context: ${context}. White background. No text.`,
          config: {
            responseMimeType: 'image/png' // Requesting image output implicitly via model capability
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
      } catch (e) {
        console.warn("Gemini image generation failed.", e);
      }
    }

    // 2. Attempt Hugging Face (Stable Diffusion)
    if (hfKey) {
        try {
            console.log("Attempting Hugging Face generation...");
            // Use stable-diffusion-2-1 as it is often faster and less prone to timeout/cors masking
            const response = await fetch(
                "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1",
                {
                    headers: { 
                        Authorization: `Bearer ${hfKey}`,
                        "Content-Type": "application/json"
                    },
                    method: "POST",
                    body: JSON.stringify({ 
                        inputs: `minimalist vector illustration of ${word}, ${context}, white background, flat design, icon style`,
                        options: {
                            wait_for_model: true,
                            use_cache: true
                        }
                    }),
                }
            );

            if (response.ok) {
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } else {
                console.warn("Hugging Face API error:", await response.text());
            }
        } catch (e) {
            console.warn("Hugging Face image generation failed (likely CORS or Timeout).", e);
        }
    }

    // 3. Fallback placeholder
    return `https://placehold.co/512x512/f1f5f9/475569?text=${encodeURIComponent(word)}`;
  },
  
  /**
   * Validates a translation using Gemini (AI Self-Check).
   */
  checkTranslation: async (polishWord: string, userEnglishInput: string): Promise<{ isCorrect: boolean; feedback: string }> => {
     const settings = storageService.getSettings();
     const apiKey = process.env.API_KEY || settings.aiApiKey;
     
     if (!apiKey) {
        // Simple string comparison fallback
        return { 
            isCorrect: false, 
            feedback: "AI Self-check unavailable. Please check API key." 
        }; 
     }

     const ai = new GoogleGenAI({ apiKey });
     const prompt = `
        The user is translating the Polish word "${polishWord}" into English.
        They wrote: "${userEnglishInput}".
        Is this correct? Even if it's a synonym, count it as correct.
        Return JSON.
     `;

     const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    isCorrect: { type: Type.BOOLEAN },
                    feedback: { type: Type.STRING, description: "Short explanation or correction." }
                }
            }
        }
     });

     if (response.text) {
         return JSON.parse(response.text);
     }
     return { isCorrect: false, feedback: "Error validating." };
  }
};