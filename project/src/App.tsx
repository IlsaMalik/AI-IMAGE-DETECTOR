import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Image as ImageIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface DetectionResult {
  isAiGenerated: boolean;
  confidence: number;
}

function App() {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageUrl(reader.result as string);
        setUrlInput('');
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1
  });

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput) {
      setImageUrl(urlInput);
      setResult(null);
      setError(null);
    }
  };

  const handleDetection = async () => {
    if (!imageUrl) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze image');
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze the image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">AI Image Detector</h1>
          <p className="text-lg text-gray-600">
            Upload an image or provide a URL to check if it's AI-generated
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 transition-all hover:shadow-xl">
          <div 
            {...getRootProps()} 
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600">Drag & drop an image here, or click to select one</p>
            <p className="text-sm text-gray-500 mt-2">Supports JPG, PNG, and WebP</p>
          </div>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">OR</span>
              </div>
            </div>

            <form onSubmit={handleUrlSubmit} className="mt-6 flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste an image URL"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Load URL
              </button>
            </form>
          </div>
        </div>

        {imageUrl && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <div className="mb-6">
              <img
                src={imageUrl}
                alt="Uploaded image"
                className="max-h-96 mx-auto rounded-lg object-contain"
              />
            </div>
            <button
              onClick={handleDetection}
              disabled={isLoading}
              className={`
                w-full py-3 rounded-lg text-white font-medium transition-all
                ${isLoading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600 transform hover:-translate-y-0.5'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Analyzing...
                </span>
              ) : (
                'Detect AI Generation'
              )}
            </button>
          </div>
        )}

        {result && (
          <div 
            className={`
              bg-white rounded-xl shadow-lg p-8 
              ${result.isAiGenerated ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}
              transform transition-all hover:scale-102
            `}
          >
            <div className="flex items-center gap-4">
              {result.isAiGenerated ? (
                <AlertCircle className="h-8 w-8 text-red-500" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              )}
              <div>
                <h3 className="text-xl font-semibold">
                  {result.isAiGenerated ? 'AI-Generated Image Detected' : 'Likely Not AI-Generated'}
                </h3>
                <p className="text-gray-600">
                  Confidence: {result.confidence.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;