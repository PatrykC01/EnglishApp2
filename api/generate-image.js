export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing Hugging Face API Key' });
  }

  try {
    // Call Hugging Face Inference API from the server side
    // Correct URL for router: https://router.huggingface.co/models/<model_id>
    const response = await fetch(
      "https://router.huggingface.co/models/stabilityai/stable-diffusion-2-1",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      // Try to parse clean JSON error
      try {
          const jsonError = JSON.parse(errorText);
          // Sometimes HF returns specific error objects
          return res.status(response.status).json({ error: jsonError.error || errorText });
      } catch {
          return res.status(response.status).json({ error: `HF Error: ${errorText}` });
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
