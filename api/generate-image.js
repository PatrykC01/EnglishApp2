import { HfInference } from '@huggingface/inference';

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

        const hf = new HfInference(token);

        console.log(`Generating Flux image for: ${prompt.substring(0, 50)}...`);

        // Use the FLUX.1-dev model as requested
        const imageBlob = await hf.textToImage({
            inputs: prompt,
            model: 'black-forest-labs/FLUX.1-dev',
            parameters: {
                guidance_scale: 3.5,
                num_inference_steps: 25, // 25 is usually enough for Flux Dev and faster
                width: 768, // Optimal size for speed/quality balance
                height: 768,
            }
        });

        // Convert Blob to Base64 Data URL for the frontend
        const arrayBuffer = await imageBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = imageBlob.type || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        return res.status(200).json({ image: dataUrl });
    }

    return res.status(400).json({ error: 'Unknown provider' });

  } catch (error) {
    console.error("Image Gen Error:", error);
    
    if (error.message?.includes('rate limit') || error.status === 429) {
        return res.status(429).json({ error: 'Hugging Face Rate Limit Reached. Spróbuj później lub użyj innego klucza.' });
    }

    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
