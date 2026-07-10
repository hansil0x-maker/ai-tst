import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY });
async function test() {
  try {
    const res = await ai.chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
      messages: [{ role: 'user', content: 'Generate a JSON object with a key "test" and value "ok"' }],
      response_format: { type: 'json_object' }
    });
    console.log(res.choices[0].message.content);
  } catch (e) {
    console.error(e.message);
  }
}
test();
