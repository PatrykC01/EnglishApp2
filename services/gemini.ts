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
   * Priority: Gemini -> Hugging Face (via Proxy) -> Pollinations.ai (Fallback)
   */
  generateImage: async (word: string, context: string): Promise<string> => {
    const settings = storageService.getSettings();
    const apiKey = process.env.API_KEY;
    
    // 1. Attempt Gemini Image Gen (if API key exists)
    if (apiKey && settings.aiProvider === 'gemini') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const modelName = settings.aiModelType === 'pro'
            ? 'gemini-3-pro-image-preview'
            : 'gemini-2.5-flash-image';

        const response = await ai.models.generateContent({
          model: modelName,
          contents: `A simple, minimalist, vector-style illustration of "${word}". Context: ${context}. White background. No text.`,
          config: {}
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
      } catch (e: any) {
        console.warn("Gemini image generation failed (likely quota). Trying next provider.");
      }
    }

    // 2. Attempt Hugging Face (via Vercel Proxy)
    if (settings.huggingFaceApiKey) {
        try {
            console.log("Attempting Hugging Face (SDXL) via Proxy...");
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    // Optimized prompt for SDXL
                    prompt: `icon, vector art, flat design, minimal illustration of ${word}, ${context}, white background, high quality, simple shapes`,
                    apiKey: settings.huggingFaceApiKey
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.image) return data.image;
            } else {
                // If proxy returns 4xx/5xx, we log it but don't crash, allowing fallback
                const errText = await response.text();
                console.warn("HF Proxy returned error (Switching to Fallback):", errText);
            }
        } catch (e) {
            console.warn("HF Proxy failed (Are you running locally without 'vercel dev'?). Switching to Fallback.", e);
        }
    }

    // 3. Fallback: Pollinations.ai (Free, no key)
    console.log("Using Pollinations.ai fallback...");
    const encodedPrompt = encodeURIComponent(`minimalist vector illustration of ${word}, ${context}, white background, flat design, icon style, clear lines`);
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
         // This is a last resort fallback
         return {
             isCorrect: false, 
             feedback: "AI_ERROR" 
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
         return { isCorrect: false, feedback: "AI_ERROR" };
     }
     
     return { isCorrect: false, feedback: "Error validating." };
  }
};
