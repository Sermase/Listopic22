import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface GeneratedCriteria {
  title: string;
  emoji: string;
  criteria: { label: string; weight: number }[];
}

export const generateListTemplate = async (topic: string): Promise<GeneratedCriteria | null> => {
  if (!apiKey) {
    console.warn("No API Key provided for Gemini");
    return {
        title: `Best ${topic}`,
        emoji: "✨",
        criteria: [
            { label: "Quality", weight: 1 },
            { label: "Value", weight: 0.8 },
            { label: "Vibe", weight: 0.6 }
        ]
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `I want to create a ranking/comparison list about: "${topic}". 
      Generate a catchy title for this list, a relevant emoji, and 3-5 criteria I should use to judge the items in this list (with a suggested weight from 0.1 to 1.0 based on importance).
      Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            emoji: { type: Type.STRING },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  weight: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    
    return JSON.parse(text) as GeneratedCriteria;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};