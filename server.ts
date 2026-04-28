import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * AI Endpoint: Analyze Emergency
 * Input: { description: string }
 * Output: { emergencyType: "Fire" | "Medical" | "Security" | "Other", priority: "Low" | "Medium" | "High", confidence: number }
 */
app.post("/api/analyze-emergency", async (req, res) => {
  const { description } = req.body;

  if (!description) {
    return res.status(400).json({ error: "Description is required" });
  }

  try {
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are an emergency response AI. Classify the user's emergency description into Category (Fire, Medical, Security, Other), Priority (Low, Medium, High), and provide a confidence score (0-100).",
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `Analyze the following emergency report and classify it.
            Report: "${description}"
            
            Return the classification in exact JSON format.` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            emergencyType: {
              type: SchemaType.STRING,
              description: "The type of emergency.",
              enum: ["Fire", "Medical", "Security", "Other"]
            },
            priority: {
              type: SchemaType.STRING,
              description: "The priority level.",
              enum: ["Low", "Medium", "High"]
            },
            confidence: {
              type: SchemaType.NUMBER,
              description: "Confidence score from 0 to 100."
            }
          },
          required: ["emergencyType", "priority", "confidence"]
        }
      }
    });

    const result = JSON.parse(response.response.text());
    res.json(result);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze emergency" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
