import { HfInference } from 'npm:@huggingface/inference@2.6.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

async function retry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  backoff = INITIAL_BACKOFF
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) throw error;
    
    console.log(`Retrying operation after ${backoff}ms. Retries left: ${retries}`);
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    return retry(operation, retries - 1, backoff * 2);
  }
}

let hf: HfInference | null = null;
try {
  const apiKey = Deno.env.get('HUGGING_FACE_API_KEY');
  if (!apiKey) {
    console.error('HUGGING_FACE_API_KEY is not set in environment variables');
    throw new Error('HUGGING_FACE_API_KEY environment variable is not set');
  }
  
  console.log('Initializing Hugging Face client...');
  hf = new HfInference(apiKey);
  console.log('Successfully initialized Hugging Face client');
} catch (error) {
  console.error('Failed to initialize Hugging Face client:', error);
}

async function fetchImageAsBlob(url: string): Promise<Blob> {
  try {
    console.log('Fetching image from URL:', url.substring(0, 100) + '...');
    
    new URL(url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      throw new Error('URL does not point to a valid image');
    }
    
    const blob = await response.blob();
    console.log('Successfully fetched image, size:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('Error fetching image:', error);
    throw new Error(`Invalid image URL: ${error.message}`);
  }
}

async function dataURLtoBlob(dataUrl: string): Promise<Blob> {
  try {
    console.log('Converting data URL to blob...');
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('Invalid data URL format - must be an image');
    }

    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1];
    const b64Data = parts[1];

    if (!mime || !b64Data) {
      throw new Error('Invalid data URL format');
    }

    const byteString = atob(b64Data);
    const byteArrays = [];

    for (let i = 0; i < byteString.length; i++) {
      byteArrays.push(byteString.charCodeAt(i));
    }

    const uint8Array = new Uint8Array(byteArrays);

    const blob = new Blob([uint8Array], { type: mime });
    console.log('Successfully converted data URL to blob, size:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('Error processing data URL:', error);
    throw new Error(`Invalid data URL: ${error.message}`);
  }
}

async function analyzeImage(imageBlob: Blob) {
  if (!hf) {
    throw new Error('Hugging Face client is not initialized');
  }

  console.log('Starting image analysis...');
  return retry(async () => {
    try {
      console.log('Sending request to Hugging Face API...');
      const result = await hf.imageClassification({
        model: 'microsoft/resnet-50',
        data: imageBlob,
      });
      console.log('Received response from Hugging Face:', result);
      
      // Find AI-related classifications
      const aiLabels = ['artificial', 'synthetic', 'digital art', 'computer generated'];
      const aiScores = result
        .filter(r => aiLabels.some(label => r.label.toLowerCase().includes(label)))
        .map(r => r.score);
      
      // Calculate overall AI probability
      const aiProbability = aiScores.length > 0 
        ? Math.max(...aiScores) * 100
        : result[0].score * 100;
      
      const isAiGenerated = aiProbability > 60; // Threshold at 60%
      
      return {
        isAiGenerated,
        confidence: aiProbability,
        classifications: result.slice(0, 3).map(r => ({
          label: r.label,
          score: (r.score * 100).toFixed(2) + '%'
        }))
      };
    } catch (error) {
      console.error('Error during image analysis:', error);
      throw error;
    }
  });
}

Deno.serve(async (req) => {
  console.log('Received request:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  if (!hf) {
    console.error('Hugging Face client is not initialized');
    return new Response(
      JSON.stringify({ 
        error: 'Service configuration error',
        details: 'The AI detection service is not properly configured. Please check if HUGGING_FACE_API_KEY is set correctly.'
      }),
      { 
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const { imageUrl } = await req.json();
    console.log('Processing request with image URL length:', imageUrl?.length);

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const imageBlob = imageUrl.startsWith('data:') 
      ? await dataURLtoBlob(imageUrl)
      : await fetchImageAsBlob(imageUrl);

    console.log('Successfully obtained image blob');

    const result = await analyzeImage(imageBlob);
    console.log('Final result:', result);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);

    let errorMessage = 'Failed to analyze image';
    let statusCode = 500;

    if (error.message.includes('Invalid image URL')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('not initialized') || error.message.includes('AI detection service')) {
      errorMessage = 'AI detection service configuration error';
      statusCode = 503;
    }

    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error.message,
        stack: error.stack
      }),
      { 
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});