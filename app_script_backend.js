// ========================================================
// NEIGHBORTASK PRODUCTION BACKEND (ROBUST FALLBACK)
// ========================================================

// ⚠️ SECURITY NOTICE: Replace these with your NEW keys. 
// The previous keys you shared are now compromised.
const STRIPE_API_KEY = "sk_test_..."; 
const GEMINI_API_KEY = "AIza..."; 

// REPLACE WITH YOUR GOOGLE SHEET ID
const SS_ID = "YOUR_SPREADSHEET_ID_HERE"; 

const SYSTEM_PROMPT = `
You are NeighborTask Concierge. 
Goal: Book services (Snow, Lawn, Cleaning, Handyman, Tutoring).
Rules:
1. Address given? Infer details (2-car driveway, 0.25 acre).
2. Ask 2-3 questions max.
3. Pricing: Snow($45-65), Lawn($40-60), Cleaning($200+).
4. Safety: Indoor=ID Check. Kids=Background Check.
OUTPUT JSON ONLY:
{ "text": "response", "map": true/false, "visual": "driveway|lawn|room", "link": "url", "newContext": {} }
`;

/**
 * WEBHOOK RECEIVER (POST)
 */
function doPost(e) {
  try {
    let requestData = {};
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (err) {
      requestData = e.parameter;
    }

    if (requestData.action === 'chat') {
      const response = handleChatLogic(requestData);
      return createJSONOutput(response);
    }
    return createJSONOutput({ error: "Unknown action" });

  } catch (error) {
    return createJSONOutput({ 
      text: "System Error: " + error.toString()
    });
  }
}

/**
 * WEBHOOK RECEIVER (GET)
 */
function doGet(e) {
  return createJSONOutput({ status: "active", system: "NeighborTask Online 🍌" });
}

function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * CORE LOGIC
 */
function handleChatLogic(data) {
  // Call Gemini with Fallback Logic
  return callGeminiWithFallback(data);
}

/**
 * SMART GEMINI CALLER (Flash -> Pro Fallback)
 */
function callGeminiWithFallback(data) {
  // List of models to try in order
  const models = ["gemini-pro"];
  
  let lastError = "";

  for (const model of models) {
    try {
      const result = callGeminiAPI(data, model);
      if (result) return result; // Success!
    } catch (e) {
      Logger.log(`Model ${model} failed: ${e}`);
      lastError = e.toString();
      // Continue to next model...
    }
  }

  // If all fail
  return {
    text: `I'm having trouble connecting to the AI models. Error: ${lastError}`,
    newContext: data.context || {}
  };
}

function callGeminiAPI(data, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  
  const contextStr = JSON.stringify(data.context || {});
  const userMsg = data.message;
  const mode = data.mode;

  const payload = {
    "contents": [{ 
      "parts": [{ 
        "text": `MODE: ${mode}. CONTEXT: ${contextStr}. USER: "${userMsg}".\nBased on system instructions, return JSON.` 
      }] 
    }],
    // Note: older gemini-pro on v1beta sometimes prefers prompt in user message, 
    // but systemInstruction is supported in newer versions. 
    // If this fails, move system prompt to user message.
    "systemInstruction": {
      "parts": [{ "text": SYSTEM_PROMPT }]
    },
    "generationConfig": {
      "response_mime_type": "application/json"
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`API ${responseCode}: ${responseText}`);
  }

  const json = JSON.parse(responseText);
  let aiRawText = json.candidates[0].content.parts[0].text;

  // Clean Markdown if present
  const jsonMatch = aiRawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) aiRawText = jsonMatch[0];

  return JSON.parse(aiRawText);
}
