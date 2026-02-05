export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, apiKey, provider } = req.body;

  try {
    // --- DEEPAI HANDLER ---
    if (provider === 'deepai') {
       if (!apiKey) return res.status(400).json({ error: 'Missing DeepAI API Key' });
       
       const params = new URLSearchParams();
       params.append('text', prompt);
       
       const deepAiResponse = await fetch('https://api.deepai.org/api/text2img', {
           method: 'POST',
           headers: { 'api-key': apiKey },
           body: params
       });

       if (!deepAiResponse.ok) {
           const errText = await deepAiResponse.text();
           return res.status(deepAiResponse.status).json({ error: `DeepAI Error: ${errText}` });
       }

       const data = await deepAiResponse.json();
       return res.status(200).json({ image: data.output_url });
    }

    // --- HUGGING FACE HANDLER (Flux 1.0 Dev) ---
    if (provider === 'huggingface') {
        // Priority: Key sent from frontend -> Key in Env (HUGGING_FACE_TOKEN) -> Key in Env (HUGGING_FACE_API_KEY)
        const token = apiKey || process.env.HUGGING_FACE_TOKEN || process.env.HUGGING_FACE_API_KEY;

        if (!token) {
            return res.status(401).json({ error: 'Missing Hugging Face API Token. Add HUGGING_FACE_TOKEN to Vercel Environment Variables.' });
        }

        console.log(`Generating Flux image for: ${prompt.substring(0, 50)}...`);

        // Use direct fetch to the new Router endpoint to avoid "api-inference is no longer supported" error
        const response = await fetch(
            "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "x-use-cache": "false"
                },
                body: JSON.stringify({ 
                    inputs: prompt,
                    parameters: {
                        guidance_scale: 3.5,
                        num_inference_steps: 25
                    }
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("HF Error:", errorText);
            
            if (response.status === 503) {
                 return res.status(503).json({ error: 'Model is loading (Cold Boot). Please try again in 10 seconds.' });
            }
            if (response.status === 429) {
                 return res.status(429).json({ error: 'Rate limit exceeded.' });
            }
            return res.status(response.status).json({ error: `HF API Error: ${errorText}` });
        }

        // Convert Blob to Base64
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        return res.status(200).json({ image: dataUrl });
    }

        // --- POLLINATIONS HANDLER (proxy -> base64) ---
    if (provider === 'pollinations') {
      // Pollinations URL (taki jak w frontendzie, tylko tu pobieramy binarkę)
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&seed=1&model=flux`;
    
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          // czasem pomaga na serwisach blokujących nietypowe UA
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/*,*/*;q=0.8',
        }
      });
    
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        return res.status(r.status).json({ error: `Pollinations Error: ${errText}` });
      }
    
      const arrayBuffer = await r.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
    
      // Pollinations zwykle zwraca jpeg/png; jak nie mamy pewności, użyj jpeg
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      return res.status(200).json({ image: dataUrl });
    }

    return res.status(400).json({ error: 'Unknown provider' });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
