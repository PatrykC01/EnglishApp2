import { GoogleGenAI, Type } from "@google/genai";
import { Client } from "@gradio/client";
import { Word, LanguageLevel, WordStatus, Settings } from "../types";
import { storageService } from "./storage";

const generateId = () => Math.random().toString(36).substr(2, 9);

// Internal Perplexity Service Implementation to avoid module resolution issues
const internalPerplexityService = {
  generateWords: async (
    category: string,
    level: LanguageLevel,
    count: number,
    existingWords: string[],
    apiKey: string
  ): Promise<Word[]> => {
    if (!apiKey) throw new Error("Missing Perplexity API Key");

    const topicPrompt = category === 'Losowe' ? 'random topics (general vocabulary)' : `"${category}"`;
    const prompt = `Generate exactly ${count} English vocabulary words related to ${topicPrompt} for CEFR level ${level}. 
    Exclude: ${existingWords.join(", ")}. 
    
    Requirements:
    1. Provide the English word and its Polish translation.
    2. Provide an example sentence that CLEARLY illustrates the specific meaning of the Polish translation provided (context consistency).
    
    Return ONLY a raw JSON array of objects with keys: "english", "polish", "exampleSentence". 
    Example: [{"english": "reliable", "polish": "niezawodny", "exampleSentence": "He is a reliable employee who never misses a deadline."}]`;

    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: "You are a specialized linguistic assistant that only outputs JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_schema", json_schema: { name: "vocab", schema: { type: "object", properties: { words: { type: "array", items: { type: "object", properties: { english: { type: "string" }, polish: { type: "string" }, exampleSentence: { type: "string" } }, required: ["english", "polish", "exampleSentence"] } } }, required: ["words"] } } }
        })
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const rawData = JSON.parse(jsonStr);
      
      const wordsToReturn = Array.isArray(rawData) ? rawData : rawData.words || [];

      return wordsToReturn.map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
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
    } catch (error) {
      console.error("Perplexity Error:", error);
      throw error;
    }
  },

  translateWord: async (word: string, from: 'pl' | 'en', apiKey: string) => {
    const target = from === 'pl' ? 'English' : 'Polish';
    // STRICT PROMPT: Ensure example sentence is ALWAYS in English
    const prompt = `Translate "${word}" to ${target}. Also provide one simple example sentence using the English word. 
    IMPORTANT: The 'exampleSentence' MUST be in English, even if translating to Polish.
    Return JSON: {"translation": "...", "exampleSentence": "..."}`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      const content = data.choices[0].message.content;
      return JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
  },

  generateExampleSentence: async (englishWord: string, apiKey: string, polishContext?: string) => {
      const prompt = `Generate one short, simple English example sentence using the word "${englishWord}". 
      ${polishContext ? `The sentence MUST reflect the specific meaning of this word as translated to Polish: "${polishContext}".` : ''}
      Return JSON: {"exampleSentence": "..."}`;

      try {
          const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "sonar",
              messages: [{ role: "user", content: prompt }]
            })
          });
          const data = await response.json();
          const content = data.choices[0].message.content;
          const res = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
          return res.exampleSentence;
      } catch (e) {
          console.error("Perplexity Sentence Error", e);
          return "";
      }
  }
};

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
    const settings: Settings = storageService.getSettings();
    
    // Route to Custom API if selected
    if (settings.aiProvider === 'custom') {
        const topicPrompt = category === 'Losowe' ? 'random topics (general vocabulary)' : `"${category}"`;
        const prompt = `Generate exactly ${count} English vocabulary words for category ${topicPrompt} level ${level}. 
        Exclude: ${existingWords.join(", ")}. 
        Requirement: The example sentence MUST strictly match the meaning of the Polish translation.
        Return ONLY a JSON array: [{"english": "...", "polish": "...", "exampleSentence": "..."}]`;
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
        return internalPerplexityService.generateWords(category, level, count, existingWords, settings.perplexityApiKey);
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("Brak klucza API (API_KEY). Upewnij się, że serwer został uruchomiony z poprawnymi zmiennymi środowiskowymi.");
    }

    const ai = new GoogleGenAI({ apiKey });
    // Use the model selected in settings
    const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    const topicPrompt = category === 'Losowe' ? 'random topics (general vocabulary)' : `"${category}"`;
    const prompt = `Generate ${count} English vocabulary words related to ${topicPrompt} for CEFR level ${level}. 
    Exclude: ${existingWords.join(", ")}. 
    Requirements:
    1. Provide the English word and its Polish translation.
    2. The example sentence MUST CLEARLY illustrate the specific meaning of the Polish translation provided.
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
    } catch (error: any) {
      console.error("Gemini Error Full:", error);
      throw new Error(`Gemini Error: ${error.message || error.statusText || 'Unknown'}`);
    }
  },

  translateWord: async (inputWord: string, inputLang: 'pl' | 'en'): Promise<{ translation: string; exampleSentence: string }> => {
      const settings: Settings = storageService.getSettings();
      // STRICT PROMPT: Force English example sentence
      const prompt = `Translate "${inputWord}" from ${inputLang === 'pl' ? 'Polish' : 'English'} to ${inputLang === 'pl' ? 'English' : 'Polish'}. 
      Provide one simple example sentence using the English version of the word.
      IMPORTANT: The 'exampleSentence' MUST be in ENGLISH.
      Return JSON: {"translation": "...", "exampleSentence": "..."}`;

      if (settings.aiProvider === 'custom') {
          const content = await geminiService.fetchCustomAI(prompt);
          return JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      }

      if (settings.aiProvider === 'perplexity') {
          return internalPerplexityService.translateWord(inputWord, inputLang, settings.perplexityApiKey);
      }

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("Brak klucza API w buildzie (API_KEY).");

      const ai = new GoogleGenAI({ apiKey });
      const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
      
      const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || '{}');
  },

  // NEW METHOD: Generate only example sentence with Context Anchoring
  generateExampleSentence: async (englishWord: string, polishContext?: string): Promise<string> => {
      const settings: Settings = storageService.getSettings();
      const prompt = `Generate one short, simple English example sentence using the word "${englishWord}". 
      ${polishContext ? `The sentence MUST reflect the specific meaning of this word as translated to Polish: "${polishContext}".` : ''}
      Return JSON: {"exampleSentence": "..."}`;

      if (settings.aiProvider === 'custom') {
          try {
            const content = await geminiService.fetchCustomAI(prompt);
            const res = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
            return res.exampleSentence;
          } catch { return ""; }
      }

      if (settings.aiProvider === 'perplexity') {
          return internalPerplexityService.generateExampleSentence(englishWord, settings.perplexityApiKey, polishContext);
      }

      // Fallback/Standard logic (Gemini)
      const apiKey = process.env.API_KEY;
      if (!apiKey) return "";

      const ai = new GoogleGenAI({ apiKey });
      const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

      try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const res = JSON.parse(response.text || '{}');
        return res.exampleSentence || "";
      } catch { return ""; }
  },

  generateImage: async (word: string, contextOrSentence?: string): Promise<string> => {
    const settings: Settings = storageService.getSettings();
    const style = settings.visualStyle || 'minimalist';

    // Style Definitions
    const styleMap: Record<string, string> = {
        minimalist: "minimalist vector illustration, flat design, white background, high quality",
        realistic: "highly detailed, photorealistic, 4k, cinematic lighting, sharp focus",
        cartoon: "vibrant cartoon style, disney pixar style, 3d render, smooth lighting",
        pixel: "pixel art, 8-bit, retro game style, clean lines",
        cyberpunk: "cyberpunk style, neon lights, futuristic, high contrast"
    };

    const stylePrompt = styleMap[style] || styleMap['minimalist'];
    
    // Construct Prompt
    const promptText = contextOrSentence 
        ? `${word}, context: ${contextOrSentence}, ${stylePrompt}`
        : `${word}, ${stylePrompt}`;

    // Helper to get Pollinations URL
    const getPollinationsUrl = () => {
        const seed = Math.floor(Math.random() * 10000);
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=800&height=600&nologo=true&seed=${seed}`;
    };

    // Determine strategy based on imageProvider setting
    let strategy = settings.imageProvider || 'hf_space'; 

    // 0. New Strategy: Hugging Face Space (SDXL Lightning via Gradio)
    if (strategy === 'hf_space') {
        try {
            console.log("Connecting to ByteDance/SDXL-Lightning...");
            const client = await Client.connect("ByteDance/SDXL-Lightning");
            const result = await client.predict("/generate_image", [
                promptText, // Text prompt
                "4-Step"    // Steps (Lightning is fast with 4)
            ]);
            
            // Gradio client returns { data: [url_or_blob, ...] }
            if (result && result.data && result.data[0] && result.data[0].url) {
                return result.data[0].url;
            }
            throw new Error("Invalid response from HF Space");

        } catch (e) {
            console.warn("HF Space failed, falling back to Pollinations", e);
            return getPollinationsUrl();
        }
    }

    // 1. Forced Strategy: Pollinations
    if (strategy === 'pollinations') {
        return getPollinationsUrl();
    }

    // 2. Forced Strategy: Custom (subnp/DALL-E)
    if (strategy === 'custom') {
        if (!settings.customApiKey) return getPollinationsUrl(); // Fallback
        try {
            const baseUrl = settings.customApiBase.endsWith('/') ? settings.customApiBase.slice(0, -1) : settings.customApiBase;
            const imageModel = (settings.customModelName && settings.customModelName.toLowerCase().includes('dall-e')) 
                ? settings.customModelName : 'dall-e-3';

            const response = await fetch(`${baseUrl}/images/generations`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${settings.customApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: promptText, model: imageModel, n: 1, size: "1024x1024" })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.data?.[0]?.url) return data.data[0].url;
                if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
            }
            throw new Error("Custom Image API Error");
        } catch (e) {
            console.warn("Custom Image failed, falling back to Pollinations", e);
            return getPollinationsUrl();
        }
    }

    // 3. Forced Strategy: Gemini
    if (strategy === 'gemini') {
        try {
            const apiKey = process.env.API_KEY;
            if (!apiKey) throw new Error("No API Key");

            const ai = new GoogleGenAI({ apiKey });
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
            throw new Error("No image data in Gemini response");
        } catch (e) {
            console.warn("Gemini Image failed, falling back to Pollinations", e);
            return getPollinationsUrl();
        }
    }
    
    // 4. Forced Strategy: DeepAI
    if (strategy === 'deepai') {
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
        return getPollinationsUrl();
    }
    
    // 5. Forced Strategy: Hugging Face (Direct Inference API - Paid/Limited)
    if (strategy === 'huggingface') {
        let apiKey = settings.huggingFaceApiKey?.trim();
        // Remove "Bearer " if user accidentally pasted it
        if (apiKey?.startsWith('Bearer ')) {
            apiKey = apiKey.replace('Bearer ', '').trim();
        }

        if (!apiKey) return getPollinationsUrl();
        
        try {
            const response = await fetch(
                "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
                {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "x-use-cache": "false" },
                    body: JSON.stringify({ inputs: promptText }),
                }
            );
            
            // Handle Payment Required (402) and Unauthorized (401) by falling back to Pollinations
            if (response.status === 402 || response.status === 401) {
                console.warn(`Hugging Face API: ${response.status} (Quota Exceeded/Unauthorized). Switching to Pollinations.`);
                return getPollinationsUrl();
            }

            if (response.ok) {
                const blob = await response.blob();
                return await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } else {
                console.warn("HF Error Status:", response.status);
            }
        } catch (e) { console.warn("HF failed", e); }
        
        // Final fallback if fetch itself failed
        return getPollinationsUrl();
    }

    // E. Fallback
    return getPollinationsUrl();
  },
  
  checkTranslation: async (polishWord: string, userEnglishInput: string): Promise<{ isCorrect: boolean; feedback: string }> => {
     const settings: Settings = storageService.getSettings();
     const prompt = `The user translates "${polishWord}" as "${userEnglishInput}". Is it correct? Return JSON: {"isCorrect": boolean, "feedback": "Short feedback in Polish"}`;
     
     if (settings.aiProvider === 'custom') {
         try {
            const content = await geminiService.fetchCustomAI(prompt);
            return JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
         } catch (e) { return { isCorrect: false, feedback: "Błąd Custom API" }; }
     }

     if (settings.aiProvider === 'perplexity' && settings.perplexityApiKey) {
         try {
             return await internalPerplexityService.translateWord(`${polishWord} -> ${userEnglishInput} check`, 'pl', settings.perplexityApiKey); 
         } catch(e) {
              const response = await fetch("https://api.perplexity.ai/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${settings.perplexityApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: prompt }] })
             });
             const data = await response.json();
             return JSON.parse(data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
         }
     }

     const apiKey = process.env.API_KEY;
     if (!apiKey) return { isCorrect: false, feedback: "AI_ERROR (No Key)" };

     const ai = new GoogleGenAI({ apiKey });
     const modelName = settings.aiModelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

     try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{}');
     } catch (e) { return { isCorrect: false, feedback: "AI_ERROR" }; }
  }
};
