import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  for (const m of ['gemini-3.0-flash', 'gemini-3.1-pro-preview', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      await ai.models.generateContent({ model: m, contents: 'Hi' });
      console.log(`${m} ok`);
      break;
    } catch(e) {
      console.log(`${m} error:`, e.message);
    }
  }
}
test();
