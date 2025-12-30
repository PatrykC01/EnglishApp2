
import { GoogleGenAI, Type } from "@google/genai";
import { Word, LanguageLevel, WordStatus } from "../types";
import { storageService } from "./storage";
import { perplexityService } from "./perplexity";

const generateId = () => Math.random().toString(36).substr(2, 9);

export const geminiService = {
  /**
   * Helper for OpenAI-compatible Chat APIs (Custom, Kie-API, subnp.com)
   */
  fetchCustomAI: async (prompt: string, isJson: boolean = true) => {
    const s = storageService.getSettings();
    if (!s.customApiKey || !s.customApiBase) throw new Error("Missing Custom API Config");

    const baseUrl = s.customApiBase.endsWith('/') ? s.customApiBase.slice(0, -1) : s.customApiBase;
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${s.customApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: s.customModelName || "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: isJson ? { type: "json_object" } : undefined
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "Custom API Error");
    return data.choices[0].message.content;
  },

  generateWords: async (
    category: string,
    level: LanguageLevel,
    count: number,
    existingWords: string[]
  ): Promise<Word[]> => {
    const settings = storageService.getSettings();
    
    // Route to Custom API if selected
    if (settings.aiProvider === 'custom') {
        const prompt = `Generate exactly ${count} English vocabulary words for category "${category}" level ${level}. Exclude: ${existingWords.join(", ")}. Return ONLY a JSON array: [{"english": "...", "polish": "...", "exampleSentence": "..."}]`;
        const content = await geminiService.fetchCustomAI(prompt);
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const rawData = JSON.parse(cleanContent);
        return rawData.map((item: any) => ({
            id: generateId(),
            ...item,
            category, level, status: WordStatus.New, nextReview: Date.now(), lastReview: null, attempts: 0, correct: 0, aiGenerated: true
        }));
    }

    if (settings.aiProvider === 'perplexity') {
        return perplexityService.generateWords(category, level, count, existingWords, settings.perplexityApiKey);
    }

    // Fix: Using process.env.API_KEY directly in GoogleGenAI constructor
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    const prompt = `Generate ${count} English vocabulary words related to "${category}" for CEFR level ${level}. 
    Exclude: ${existingWords.join(", ")}. 
    Return JSON only: [{"english": "...", "polish": "...", "exampleSentence": "..."}]`;

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
          aiGenerated: true
        }));
      }
      return [];
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  },

  translateWord: async (inputWord: string, inputLang: 'pl' | 'en'): Promise<{ translation: string; exampleSentence: string }> => {
      const settings = storageService.getSettings();
      const prompt = `Translate "${inputWord}" from ${inputLang === 'pl' ? 'Polish' : 'English'} to ${inputLang === 'pl' ? 'English' : 'Polish'}. Provide one example sentence. Return JSON: {"translation": "...", "exampleSentence": "..."}`;

      if (settings.aiProvider === 'custom') {
          const content = await geminiService.fetchCustomAI(prompt);
          return JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      }

      if (settings.aiProvider === 'perplexity') {
          return perplexityService.translateWord(inputWord, inputLang, settings.perplexityApiKey);
      }

      // Fix: Using process.env.API_KEY directly in GoogleGenAI constructor
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || '{}');
  },

  generateImage: async (word: string, contextOrSentence?: string): Promise<string> => {
    const settings = storageService.getSettings();
    const promptText = contextOrSentence 
        ? `minimalist illustration of ${word}, scene: ${contextOrSentence}, white background, flat vector design`
        : `minimalist vector illustration of ${word}, white background, flat design`;

    // 0. Attempt Custom Image Gen if URL seems to support it
    if (settings.aiProvider === 'custom' && settings.customApiBase.includes('images')) {
        try {
            const baseUrl = settings.customApiBase.endsWith('/') ? settings.customApiBase.slice(0, -1) : settings.customApiBase;
            const response = await fetch(`${baseUrl}/images/generations`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${settings.customApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: promptText, model: settings.customModelName || "dall-e-3" })
            });
            const data = await response.json();
            if (data.data?.[0]?.url) return data.data[0].url;
            if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
        } catch (e) { console.warn("Custom Image API failed", e); }
    }

    // 1. DeepAI
    if (settings.aiProvider === 'deepai' && settings.deepAiApiKey) {
        try {
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptText, apiKey: settings.deepAiApiKey, provider: 'deepai' })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.image) return data.image;
            }
        } catch (e) { console.warn("DeepAI failed", e); }
    }

    // 2. Pollinations (Standard free fallback)
    if (settings.aiProvider === 'pollinations' || settings.aiProvider === 'free' || settings.aiProvider === 'perplexity' || settings.aiProvider === 'custom') {
        const seed = Math.floor(Math.random() * 10000);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=800&height=600&nologo=true&seed=${seed}`;
    }

    // 3. Gemini Image
    if (settings.aiProvider === 'gemini') {
      try {
        // Fix: Using process.env.API_KEY directly in GoogleGenAI constructor
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
        });
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
      } catch (e) { console.warn("Gemini Image failed", e); }
    }

    return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=800&height=600&nologo=true&seed=${Math.random()}`;
  },
  
  checkTranslation: async (polishWord: string, userEnglishInput: string): Promise<{ isCorrect: boolean; feedback: string }> => {
     const settings = storageService.getSettings();
     const prompt = `The user translates "${polishWord}" as "${userEnglishInput}". Is it correct? Return JSON: {"isCorrect": boolean, "feedback": "Short feedback in Polish"}`;
     
     if (settings.aiProvider === 'custom') {
         try {
            const content = await geminiService.fetchCustomAI(prompt);
            return JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
         } catch (e) { return { isCorrect: false, feedback: "Błąd Custom API" }; }
     }

     if (settings.aiProvider === 'perplexity' && settings.perplexityApiKey) {
         try {
             const response = await fetch("https://api.perplexity.ai/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${settings.perplexityApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: prompt }] })
             });
             const data = await response.json();
             return JSON.parse(data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
         } catch (e) { return { isCorrect: false, feedback: "Błąd Perplexity" }; }
     }

     // Fix: Using process.env.API_KEY directly in GoogleGenAI constructor
     const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
     try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{}');
     } catch (e) { return { isCorrect: false, feedback: "AI_ERROR" }; }
  }
};
