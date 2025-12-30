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
   * Translates a single word and provides context.
   * Used for the "Add Word" modal when one field is missing.
   */
  translateWord: async (
      inputWord: string, 
      inputLang: 'pl' | 'en'
  ): Promise<{ translation: string; exampleSentence: string }> => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing for translation");

      const ai = new GoogleGenAI({ apiKey });
      const targetLang = inputLang === 'pl' ? 'English' : 'Polish';
      const sourceLang = inputLang === 'pl' ? 'Polish' : 'English';

      const prompt = `
          Translate the ${sourceLang} word "${inputWord}" to ${targetLang}.
          Also provide a simple example English sentence using the English word.
          Return JSON only.
      `;

      try {
          const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          translation: { type: Type.STRING },
                          exampleSentence: { type: Type.STRING }
                      },
                      required: ["translation", "exampleSentence"]
                  }
              }
          });
          
          if (response.text) {
              return JSON.parse(response.text);
          }
          throw new Error("Empty response");
      } catch (e) {
          console.error("Translation error", e);
          throw e;
      }
  },

  /**
   * Generates an image for a word based on its context/sentence.
   * Priority: Gemini -> Hugging Face (via Proxy) -> Pollinations.ai (Fallback)
   */
  generateImage: async (word: string, contextOrSentence?: string): Promise<string> => {
    const settings = storageService.getSettings();
    const apiKey = process.env.API_KEY;
    
    // Construct the prompt. If a sentence is provided, use it to create a scene.
    // If only the word is provided, fallback to a simple icon.
    const promptText = contextOrSentence 
        ? `A clean, minimalist, vector-style illustration depicting the following scene: "${contextOrSentence}". Focus on the concept of "${word}". White background, flat design, no text.`
        : `A simple, minimalist, vector-style illustration of "${word}". White background. No text.`;

    // 1. Attempt Gemini Image Gen (if API key exists)
    if (apiKey && settings.aiProvider === 'gemini') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const modelName = settings.aiModelType === 'pro'
            ? 'gemini-3-pro-image-preview'
            : 'gemini-2.5-flash-image';

        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
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
                    prompt: promptText + ", high quality, 4k, vector art",
                    apiKey: settings.huggingFaceApiKey
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.image) return data.image;
            } else {
                const errText = await response.text();
                console.warn("HF Proxy returned error (Switching to Fallback):", errText);
            }
        } catch (e) {
            console.warn("HF Proxy failed. Switching to Fallback.", e);
        }
    }

    // 3. Fallback: Pollinations.ai (Free, no key)
    console.log("Using Pollinations.ai fallback...");
    // Simplify prompt for URL length safety and style consistency
    const simplePrompt = contextOrSentence 
        ? `illustration of ${word} scene ${contextOrSentence} vector flat white background`
        : `vector illustration of ${word} white background flat design`;
        
    const encodedPrompt = encodeURIComponent(simplePrompt.slice(0, 300)); // Safety limit
    const seed = Math.floor(Math.random() * 1000); 
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;
  },
  
  /**
   * Validates a translation using Gemini (AI Self-Check).
   */
  checkTranslation: async (polishWord: string, userEnglishInput: string): Promise<{ isCorrect: boolean; feedback: string }> => {
     const apiKey = process.env.API_KEY;
     
     const basicCheck = () => ({ isCorrect: false, feedback: "AI_ERROR" });

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
