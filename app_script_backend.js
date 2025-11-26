// ========================================================
// NEIGHBORTASK PRODUCTION BACKEND (REAL GEMINI AI)
// ========================================================

const STRIPE_API_KEY = "sk_test_51SXaIyJdqxYyOXHAXgIr5vUW9P4Kx539eFnoKtJnoQM30XDtWu4qR8ArwyxkVoOlBzjrZZBO3iIFYjLSbIO1xSMO00aOLotVTE"; // Add your Stripe Secret Key
// const CHECKR_API_KEY = "test_...";    // Checkr skipped for now

// Database IDs
// REPLACE THE ID BELOW WITH YOUR REAL GOOGLE SHEET ID
// Example: If URL is docs.google.com/spreadsheets/d/1aBcD.../edit, the ID is "1aBcD..."
const SS_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo"; 


 
const GEMINI_API_KEY = "AIzaSyBC3aVBOJT0LLGnjFBaHNAxQM7vAjecmRk"; // <--- PASTE YOUR REAL GEMINI KEY HERE



// --- SYSTEM INSTRUCTIONS (The Brain) ---
// This tells Gemini exactly how to behave based on your v3.1 Design Doc
const SYSTEM_PROMPT = `
You are NeighborTask Concierge, a friendly neighborhood helper AI.
Your goal is to book services (Snow, Lawn, Cleaning, Handyman, Tutoring) efficiently.

**CORE RULES:**
1.  **Address Intelligence:** If user gives an address, infer details (e.g., "2-car driveway" for snow, "0.25 acre" for lawn). CONFIRM these details.
2.  **Question Style:** Ask only 2-3 essential questions. Be brief.
3.  **Pricing:** Use market averages ($45-65 for snow, $200+ for cleaning).
4.  **Safety:** - Outdoor = Low Risk (No ID).
    - Indoor = Medium Risk (ID Check).
    - Kids/Tutoring = High Risk (Background Check).

**OUTPUT FORMAT:**
You act as a JSON API. You must **ALWAYS** return raw JSON. No markdown.
Format:
{
  "text": "Your friendly reply to the user...",
  "map": true/false, (Show map if location confirmed)
  "visual": "driveway" | "lawn" | "room" | null, (Show schematic if relevant)
  "link": "stripe_url" | "checkr_url" | null, (Only if confirming booking)
  "newContext": { "service": "...", "step": "...", "risk": "..." }
}
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
      // CALL REAL GEMINI AI
      const response = callGeminiAI(requestData);
      return createJSONOutput(response);
    }

    return createJSONOutput({ error: "Unknown action" });

  } catch (error) {
    return createJSONOutput({ 
      text: "I'm having a little brain freeze. Can you try again?",
      error: error.toString() 
    });
  }
}

/**
 * WEBHOOK RECEIVER (GET)
 */
function doGet(e) {
  return createJSONOutput({ status: "active", system: "Gemini Pro Connected" });
}

function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * CONNECT TO GEMINI API
 */
function callGeminiAI(data) {
  const userMsg = data.message;
  const mode = data.mode; // 'customer' or 'helper'
  const context = JSON.stringify(data.context || {});

  // Prepare the conversation history for Gemini
  const payload = {
    "contents": [
      {
        "role": "user",
        "parts": [{ 
          "text": `
            CURRENT MODE: ${mode}
            CURRENT CONTEXT: ${context}
            USER SAYS: "${userMsg}"
            
            Based on the system instructions, provide the next JSON response.
            If the user confirms a booking, generate a mock payment link.
            If the user is a Helper and needs verification, generate a mock checkr link.
          ` 
        }]
      }
    ],
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
    "payload": JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      options
    );
    
    const json = JSON.parse(response.getContentText());
    const aiContent = json.candidates[0].content.parts[0].text;
    
    return JSON.parse(aiContent); // Return the clean JSON from Gemini

  } catch (e) {
    Logger.log(e);
    // Fallback if API fails
    return {
      text: "I'm currently offline for maintenance. Please check back later! 🍌",
      newContext: {}
    };
  }
}
