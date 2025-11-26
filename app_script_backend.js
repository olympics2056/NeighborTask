// ========================================================
// NEIGHBORTASK PRODUCTION BACKEND (ROBUST FALLBACK)
// ========================================================

// ⚠️ SECURITY NOTICE: Replace these with your NEW keys. 
// The previous keys you shared are now compromised.
const STRIPE_API_KEY = "sk_test_51SXaIyJdqxYyOXHAXgIr5vUW9P4Kx539eFnoKtJnoQM30XDtWu4qR8ArwyxkVoOlBzjrZZBO3iIFYjLSbIO1xSMO00aOLotVTE"; 
const GEMINI_API_KEY = "AIzaSyC7jo161v5SEp_OaowgLTJjtBe2SQDFfCs"; 

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

/**
 * CORE LOGIC
 */
function handleChatLogic(rawData) {
  // Always normalize before using
  var data = normalizeChatData(rawData);
  return callGeminiWithFallback(data);
}

/**
 * SMART GEMINI CALLER (Flash -> Pro Fallback)
 */
function callGeminiWithFallback(rawData) {
  // Make sure data is normalized (in case someone calls this directly)
  var data = normalizeChatData(rawData);

  // List of models to try in order
  const models = ["gemini-pro"];
  
  let lastError = "";

  for (const model of models) {
    try {
      const result = callGeminiAPI(data, model);
      if (result) return result; // Success!
    } catch (e) {
      Logger.log("Model " + model + " failed: " + e);
      lastError = e.toString();
      // Continue to next model...
    }
  }

  // If all fail
  return {
    text: "I'm having trouble connecting to the AI models. Error: " + lastError,
    newContext: data.context || {}
  };
}

/**
 * LOW-LEVEL GEMINI CALLER
 */
function callGeminiAPI(rawData, modelName) {
  var data = normalizeChatData(rawData); // extra safety

  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + modelName
    + ":generateContent?key="
    + GEMINI_API_KEY;
  
  const contextStr = JSON.stringify(data.context || {});
  const userMsg    = data.message || "";
  const mode       = data.mode || "default";

  const payload = {
    contents: [{
      parts: [{
        text: "MODE: " + mode + ". CONTEXT: " + contextStr + ". USER: \"" + userMsg + "\".\nBased on system instructions, return JSON."
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

  if (responseCode !== 200) {
    throw new Error("API " + responseCode + ": " + responseText);
  }

  const json = JSON.parse(responseText);

  // Defensive checks around candidates
  if (!json.candidates ||
      !json.candidates[0] ||
      !json.candidates[0].content ||
      !json.candidates[0].content.parts ||
      !json.candidates[0].content.parts[0] ||
      typeof json.candidates[0].content.parts[0].text !== "string") {
    throw new Error("Unexpected Gemini response structure: " + responseText);
  }

  let aiRawText = json.candidates[0].content.parts[0].text;

  // Clean Markdown wrapper if present – extract the first {...} block
  const jsonMatch = aiRawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    aiRawText = jsonMatch[0];
  }

  // This is expected to be JSON per SYSTEM_PROMPT + response_mime_type
  return JSON.parse(aiRawText);
}
