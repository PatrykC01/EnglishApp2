export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing Hugging Face API Key' });
  }

  try {
    // We use Stable Diffusion XL Base 1.0
    const model = "stabilityai/stable-diffusion-xl-base-1.0";
    
    // Updated Endpoint: The old api-inference.huggingface.co is deprecated.
    // The new standard format via router is: https://router.huggingface.co/hf-inference/models/<model_id>
    const apiUrl = `https://router.huggingface.co/hf-inference/models/${model}`;

    const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "x-use-cache": "false"
        },
        method: "POST",
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      try {
          const jsonError = JSON.parse(errorText);
          return res.status(response.status).json({ error: jsonError.error || errorText });
      } catch {
          return res.status(response.status).json({ error: `HF Error (${response.status}): ${errorText}` });
      }
    }

    // Convert the raw image blob to base64
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = blob.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return res.status(200).json({ image: dataUrl });

  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
