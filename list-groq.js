import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY });
async function test() {
  const res = await ai.models.list();
  console.log(res.data.map(m => m.id));
}
test();
