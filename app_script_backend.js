// ========================================================
// NEIGHBORTASK PRODUCTION BACKEND (Google Apps Script)
// ========================================================

const STRIPE_API_KEY = "sk_test_51SXaIyJdqxYyOXHAXgIr5vUW9P4Kx539eFnoKtJnoQM30XDtWu4qR8ArwyxkVoOlBzjrZZBO3iIFYjLSbIO1xSMO00aOLotVTE"; // Add your Stripe Secret Key
// const CHECKR_API_KEY = "test_...";    // Checkr skipped for now

// Database IDs
// REPLACE THE ID BELOW WITH YOUR REAL GOOGLE SHEET ID
// Example: If URL is docs.google.com/spreadsheets/d/1aBcD.../edit, the ID is "1aBcD..."
const SS_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo"; 

/**
 * WEBHOOK RECEIVER (POST)
 * Handles calls from index.html (Chat), Stripe, and Checkr
 */
function doPost(e) {
  try {
    // 1. Handle Frontend Chat Request (text/plain payload)
    // Note: Apps Script sometimes sees text/plain as e.postData.contents directly
    let requestData = {};
    
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      // If parsing fails, it might be form-data from Twilio
      requestData = e.parameter;
    }

    if (requestData.action === 'chat') {
      const response = handleChatLogic(requestData);
      return createJSONOutput(response);
    }

    // 2. Handle Stripe/Checkr Webhooks (if setup)
    if (requestData.type) {
      // Add stripe/checkr logic here
      return createJSONOutput({ status: "received" });
    }

    return createJSONOutput({ error: "Unknown action" });

  } catch (error) {
    return createJSONOutput({ error: error.toString() });
  }
}

/**
 * WEBHOOK RECEIVER (GET) - THE FIX
 * Handles browser tests and simple pings
 */
function doGet(e) {
  return createJSONOutput({ 
    status: "active", 
    message: "NeighborTask Backend is Online! 🍌",
    timestamp: new Date().toISOString()
  });
}

// Helper to format JSON response properly for CORS
function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * CORE CONVERSATION LOGIC
 * Determines what to say, what visual to show, and what map to render.
 */
function handleChatLogic(data) {
  const msg = data.message ? data.message.toLowerCase() : "";
  const mode = data.mode;
  const ctx = data.context || {};
  
  let response = { 
    text: "", 
    link: null, 
    map: false, 
    visual: null, 
    newContext: ctx 
  };

  // --- HELPER MODE LOGIC ---
  if (mode === 'helper') {
    if (!ctx.step) {
      response.text = "Welcome to NeighborTask! 🍌 Let's get you earning. What is your First Name and Neighborhood?";
      response.newContext.step = "name_loc";
    } else if (ctx.step === "name_loc") {
      response.text = "Awesome! I've pinned your location. What services do you offer? (Snow, Lawn, Cleaning, Tutoring)";
      response.map = true;
      response.newContext.step = "skills";
    } else if (ctx.step === "skills") {
      if (msg.includes("clean") || msg.includes("tutor") || msg.includes("care")) {
        response.text = "Those are High/Medium risk tasks. We need to verify you. Ready for the secure check?";
        response.newContext.step = "verify";
      } else {
        response.text = "Great! Outdoor tasks are Low Risk. What is your availability?";
        response.newContext.step = "avail";
      }
    } else if (ctx.step === "verify") {
      // MOCK BYPASS: Simulating the Checkr flow
      response.text = "SIMULATION MODE: Asking for background check... (Imagine a secure form here). Type 'Done' when finished.";
      response.link = "#mock-checkr-bypass"; 
      response.newContext.step = "avail";
    } else {
      response.text = "Profile Complete! Watch for job texts. 🍌";
    }
    return response;
  }

  // --- CUSTOMER MODE LOGIC ---
  if (!ctx.service) {
    if (msg.includes("snow") || msg.includes("driveway")) {
      response.text = "I found your address. I see a 2-car driveway (~500 sq ft). When do you need it cleared?";
      response.visual = "driveway";
      response.newContext = { service: "Snow Removal", step: "time" };
    } else if (msg.includes("clean")) {
      response.text = "I see your home info (~2000 sq ft). Standard cleaning scope applied. When do you need this?";
      response.visual = "room";
      response.newContext = { service: "House Cleaning", step: "time" };
    } else if (msg.includes("lawn")) {
      response.text = "I see a 0.25 acre lot. Standard mow estimated. What day works best?";
      response.visual = "lawn";
      response.newContext = { service: "Lawn Care", step: "time" };
    } else {
      response.text = "I can help with Snow, Lawn, Cleaning, or Handyman services. What do you need?";
    }
  } else if (ctx.step === "time") {
    response.text = `Got it. Estimated price for ${ctx.service} is market standard. Ready to book?`;
    response.newContext.step = "confirm";
  } else if (ctx.step === "confirm") {
    response.text = "Finding a verified neighbor now. Please authorize the hold:";
    response.link = "https://buy.stripe.com/mock_link"; // Replace with real stripe link generation
    response.map = true;
    response.newContext.step = "complete";
  } else {
    response.text = "I didn't catch that. Ready to book?";
  }

  return response;
}

