import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  const models = ['gemini-2.0-flash-exp', 'gemini-1.5-flash-002', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  for (const m of models) {
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
