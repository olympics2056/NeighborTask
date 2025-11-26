// ========================================================
// NEIGHBORTASK PRODUCTION BACKEND (ROBUST FALLBACK)
// ========================================================

// ⚠️ SECURITY NOTICE: Replace these with your NEW keys. 
// The previous keys you shared are now compromised.
const STRIPE_API_KEY = "sk_test_51SXaIyJdqxYyOXHAXgIr5vUW9P4Kx539eFnoKtJnoQM30XDtWu4qR8ArwyxkVoOlBzjrZZBO3iIFYjLSbIO1xSMO00aOLotVTE"; 
const GEMINI_API_KEY = "AIzaSyAkXJqfhdlFQVK8m7Y4DM0nGA6WsqSQPn4"; 

// REPLACE WITH YOUR GOOGLE SHEET ID
const SS_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo"; 

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
 * ✅ Helper: Normalize incoming data
 * Accepts:
 *  - string → treated as message
 *  - object → tries message / text / prompt, plus optional context / mode
 */
function normalizeChatData(input) {
  // No input at all
  if (!input) {
    return {
      message: "",
      context: {},
      mode: "default"
    };
  }

  // String input → treat as plain user message
  if (typeof input === "string") {
    return {
      message: input,
      context: {},
      mode: "default"
    };
  }

  // Object input → normalize keys but keep everything else
  var data = Object.assign({}, input);

  data.message = input.message || input.text || input.prompt || "";
  data.context = input.context || {};
  data.mode    = input.mode || "default";

  return data;
}
// =======================
// CONFIG
// =======================

// Make sure GEMINI_API_KEY and SYSTEM_PROMPT are defined somewhere above this.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Default and fallback models
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro"
];

/**
 * ✅ Helper: Normalize incoming data
 * Accepts:
 *  - string → treated as message
 *  - object → tries message / text / prompt, plus optional context / mode
 */
function normalizeChatData(input) {
  if (!input) {
    return {
      message: "",
      context: {},
      mode: "default"
    };
  }

  if (typeof input === "string") {
    return {
      message: input,
      context: {},
      mode: "default"
    };
  }

  var data = Object.assign({}, input);
  data.message = input.message || input.text || input.prompt || "";
  data.context = input.context || {};
  data.mode    = input.mode || "default";

  return data;
}

/**
 * CORE LOGIC
 */
function handleChatLogic(rawData) {
  var data = normalizeChatData(rawData);
  return callGeminiWithFallback(data);
}

/**
 * SMART GEMINI CALLER (Flash -> Pro Fallback)
 */
function callGeminiWithFallback(rawData) {
  var data = normalizeChatData(rawData);

  let lastError = "";

  for (const model of GEMINI_MODELS) {
    try {
      Logger.log("Trying model: " + model);
      const result = callGeminiAPI(data, model);
      if (result) return result; // Success
    } catch (e) {
      Logger.log("Model " + model + " failed: " + e);
      lastError = e.toString();
    }
  }

  return {
    text: "I'm having trouble connecting to the AI models. Error: " + lastError,
    newContext: data.context || {}
  };
}

/**
 * LOW-LEVEL GEMINI CALLER
 * - modelName is OPTIONAL; falls back to DEFAULT_GEMINI_MODEL if missing
 */
function callGeminiAPI(rawData, modelName) {
  var data = normalizeChatData(rawData);

  // 🔴 THIS IS THE KEY FIX:
  var model = modelName || DEFAULT_GEMINI_MODEL;

  const url =
    GEMINI_API_BASE +
    "/models/" +
    model +
    ":generateContent?key=" +
    GEMINI_API_KEY;

  Logger.log("Calling Gemini URL: " + url);

  const contextStr = JSON.stringify(data.context || {});
  const userMsg    = data.message || "";
  const mode       = data.mode || "default";

  const payload = {
    contents: [{
      parts: [{
        text:
          "MODE: " + mode +
          ". CONTEXT: " + contextStr +
          ". USER: \"" + userMsg + "\".\nBased on system instructions, return JSON."
      }]
    }],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      response_mime_type: "application/json"
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log("Gemini response code: " + responseCode);
  Logger.log("Gemini raw response: " + responseText);

  if (responseCode !== 200) {
    throw new Error("API " + responseCode + ": " + responseText);
  }

  const json = JSON.parse(responseText);

  if (!json.candidates ||
      !json.candidates[0] ||
      !json.candidates[0].content ||
      !json.candidates[0].content.parts ||
      !json.candidates[0].content.parts[0] ||
      typeof json.candidates[0].content.parts[0].text !== "string") {
    throw new Error("Unexpected Gemini response structure: " + responseText);
  }

  let aiRawText = json.candidates[0].content.parts[0].text;

  const jsonMatch = aiRawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    aiRawText = jsonMatch[0];
  }

  return JSON.parse(aiRawText);
}


