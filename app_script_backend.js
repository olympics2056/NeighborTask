/****************************************************
 * NeighborTask Backend (GPT-5.1 + Mock Background Check)
 * ------------------------------------------------------
 * HTTP POST from frontend:
 *
 * 1) Chat (default)
 * {
 *   "action": "chat",        // or omit (defaults to "chat")
 *   "mode": "customer" | "helper",
 *   "messages": [ { role, content/text }, ... ],
 *   "context": {
 *      "service_type": "snow" | "lawn" | "cleaning" | "kids_care" | "dog_walk" | "lights" | "tutoring" | ...,
 *      "address": "123 Main St...",
 *      "lat": 41.7,
 *      "lng": -88.1,
 *      "time_window": "2025-11-27T08:00-10:00",
 *      "urgency": "normal" | "same_day" | "emergency",
 *      "property_profile_id": "prop_0001",
 *      "property_profile": {
 *          "home_type": "house",
 *          "stories": 2,
 *          "driveway_type": "long",
 *          "corner_lot": true
 *      },
 *      "job_details": {
 *          "indoors": true,
 *          "children_present": false,
 *          "customer_present": false,
 *          "kids_age_min": 5,
 *          "access_to_valuables": true,
 *          "uses_ladder": false,
 *          "works_on_roof": false,
 *          "time_of_day": "evening",
 *          "aggressive_pet": false
 *      }
 *   },
 *   "meta": { ... } // optional
 * }
 *
 * 2) Mock background check
 * {
 *   "action": "request_bg_check",
 *   "helper_id": "helper_0003"
 * }
 *
 ****************************************************/

// =============== CONFIG =========================

// Put your Google Sheet ID here (the "NeighborTask_DB" spreadsheet)
var SHEET_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo";

// OpenAI model name
var MODEL_NAME = "gpt-5.1";

// =================================================
// Main HTTP entrypoint
// =================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ success: false, error: "No request body received" });
    }

    var payload = JSON.parse(e.postData.contents);

    var action = payload.action || "chat";   // "chat" | "request_bg_check"
    var mode = payload.mode || "customer";   // "customer" | "helper"
    var messages = payload.messages || [];
    var ctx = payload.context || {};
    var meta = payload.meta || {};

    // 1) Non-chat actions (e.g. background check)
    if (action === "request_bg_check") {
      if (!payload.helper_id) {
        return _json({ success: false, error: "helper_id is required for background check" });
      }

      var bgResult = startMockBackgroundCheck_(payload.helper_id);
      return _json({
        success: true,
        background_check: bgResult
      });
    }

    // 2) Chat action (default)
    if (ctx.service_type && ctx.address) {
      var propertyProfile = ctx.property_profile || null;
      var jobDetails = ctx.job_details || {};

      var smart = buildSmartContext_(
        ctx.service_type,
        ctx.address,
        ctx.urgency || "normal",
        propertyProfile,
        0.1,          // demandFactor placeholder
        jobDetails
      );

      // Attach structured context as system message for GPT to use
      messages.push({
        role: "system",
        content:
          "CONTEXT_JSON (for your reasoning only, DO NOT show raw JSON to the user):\n" +
          JSON.stringify(smart, null, 2)
      });
    }

    // Call GPT-5.1
    var aiReply = callOpenAIChat(messages, mode);

    // Append assistant reply
    var assistantMsg = buildAssistantMessage(aiReply, messages);
    messages.push(assistantMsg);

    // Optional logging
    try {
      logConversationToSheet(mode, messages);
    } catch (logErr) {
      Logger.log("Logging error: " + logErr);
    }

    return _json({
      success: true,
      reply: aiReply,
      messages: messages
    });

  } catch (err) {
    Logger.log("doPost error: " + err);
    return _json({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

// =================================================
// Helper: JSON response
// =================================================

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================
// OpenAI GPT-5.1 call
// =================================================

/**
 * Build assistant message compatible with your frontend
 * (supports either {role, content} or {role, text})
 */
function buildAssistantMessage(replyText, messages) {
  var msg = { role: "assistant", content: replyText };

  if (messages && messages.length > 0) {
    var sample = messages[0];
    if (sample && typeof sample.text === "string" && sample.text !== "") {
      msg = { role: "assistant", text: replyText };
    } else if (sample && typeof sample.content === "string") {
      msg = { role: "assistant", content: replyText };
    }
  }
  return msg;
}

/**
 * Call OpenAI Responses API with GPT-5.1
 */
function callOpenAIChat(messages, mode) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  var systemPrompt = getSystemPromptForMode(mode);

  // Build "messages" array for conversation object
  var conversationMessages = [];
  conversationMessages.push({ role: "system", content: systemPrompt });

  messages.forEach(function (m) {
    if (!m || !m.role) return;
    var content = m.content || m.text || "";
    if (!content) return;
    conversationMessages.push({ role: m.role, content: content });
  });

  var url = "https://api.openai.com/v1/responses";

  var body = {
    model: MODEL_NAME,             // e.g., "gpt-5.1" or "gpt-5.1-mini"
    max_output_tokens: 500,
    temperature: 0.4,

    // NEW Responses API format
    input: {
      conversation: {
        messages: conversationMessages
      }
    }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    throw new Error("OpenAI error " + code + ": " + text);
  }

  var data = JSON.parse(text);

  // Extract output text
  var reply =
    data?.output_text ??
    data?.output?.[0]?.content ??
    null;

  if (!reply) throw new Error("Empty reply from OpenAI");

  return reply.trim();
}

// =================================================
// System prompt: NeighborTask brain
// =================================================

function getSystemPromptForMode(mode) {
  var isHelper = (mode === "helper");

  var lines = [
    "You are NeighborTask Concierge, an AI assistant that helps neighbors book trusted local help",
    "for tasks like snow removal, lawn care, house cleaning, furniture assembly, holiday lights,",
    "pet visits, kids care, and tutoring.",
    "",
    "=== CORE BEHAVIOR ===",
    "- Your job is to: (1) understand what the user needs, (2) collect only the key details,",
    "  (3) use the structured CONTEXT_JSON from the system messages when present, and",
    "  (4) explain your suggestions clearly and briefly.",
    "- Ask at most 2–3 short, high-value questions before proposing a concrete next step.",
    "- Never hallucinate helpers, prices, or locations. If the needed information is missing,",
    "  say so and ask a focused follow-up question.",
    "- Keep answers concise, friendly, and practical. Think like a smart, efficient human dispatcher.",
    "",
    "=== CONTEXT_JSON USAGE ===",
    "- Sometimes the system will send you a system message starting with:",
    "  'CONTEXT_JSON (for your reasoning only...)'.",
    "- That JSON contains structured fields like:",
    "    - location (address, lat, lng, zipcode)",
    "    - property (stories, driveway_type, corner_lot, etc.)",
    "    - quote (price_low, price_mid, price_high, currency, unit)",
    "    - helpers (nearby helpers with distance_km, verification_level, rating)",
    "    - urgency and weather_class",
    "    - risk_level (overall physical risk: low/medium/high)",
    "    - security_risk_level (indoors/kids/home-access risk: low/medium/high)",
    "    - required_verification_level (none/id_verified/background_checked/pro)",
    "- You MUST prefer using this structured information over guessing.",
    "- For prices:",
    "    * Use quote.price_low, quote.price_mid, and quote.price_high as the fair range.",
    "    * Do NOT invent your own numbers when quote.* is available.",
    "- For helpers:",
    "    * Describe only the helpers given in the helpers list (e.g., distance, rating, verification).",
    "    * Do NOT invent new helper names or fake ratings.",
    "- Never show the raw JSON to the user. Convert it into natural language.",
    "",
    "=== TALKING TO A " + (isHelper ? "HELPER (SERVICE PROVIDER)" : "CUSTOMER (REQUESTING HELP)") + " ===",
    "",
    "If you are talking to a CUSTOMER:",
    "- Goal: help them clearly describe what they need, where, and when, then present a clear plan.",
    "- Collect only the minimal key details:",
    "    1) Service type (snow, lawn, cleaning, lights, kids care, dog walk, tutoring).",
    "    2) Address or approximate location.",
    "    3) Time window and urgency (normal, same-day, emergency).",
    "    4) 1–2 property details if important (e.g., driveway short/medium/long, corner lot, stairs).",
    "- Once you have these, stop asking more questions and move to recommendations.",
    "- When quote.* is available in CONTEXT_JSON:",
    "    * Tell the customer a short explanation: why the range is what it is",
    "      (driveway length, weather, urgency, etc.).",
    "    * Present the price range as something like: '$55–$85 per job', not a single fixed point.",
    "- When helpers[] is available in CONTEXT_JSON:",
    "    * Mention 1–3 nearby helpers (e.g., 'two verified helpers within 2–3 km').",
    "    * Emphasize that final matching and payment are handled securely by NeighborTask.",
    "",
    "If you are talking to a HELPER:",
    "- Goal: help them present their skills, service area, and availability clearly and professionally.",
    "- Encourage them to specify:",
    "    * Which services they offer (snow, lawn, cleaning, lights, kids care, dog walk, tutoring, etc.).",
    "    * Their typical service area (neighborhoods or radius).",
    "    * Their usual schedule (weekday evenings, weekends, etc.).",
    "    * Any special tools or constraints (e.g., has a truck, no heavy lifting, etc.).",
    "- Help them craft short, polite responses to customers that set realistic expectations and pricing.",
    "",
    "=== RISK & SECURITY ===",
    "- The CONTEXT_JSON may include:",
    "    * risk_level: 'low' | 'medium' | 'high' (physical risk: snow depth, ladders, roof, etc.)",
    "    * security_risk_level: 'low' | 'medium' | 'high' (indoors, kids, access to home/valuables)",
    "    * required_verification_level: 'none' | 'id_verified' | 'background_checked' | 'pro'",
    "- Use these to adjust your recommendations:",
    "  For LOW risk:",
    "    - Normal tone, simple suggestions.",
    "  For MEDIUM risk:",
    "    - Briefly highlight safety (slippery surfaces, tools, kids at home).",
    "    - Suggest verified helpers when available.",
    "  For HIGH risk:",
    "    - Strongly encourage verified and background-checked helpers.",
    "    - Emphasize safety and clear boundaries (especially for roof work and kids care).",
    "    - Recommend customers review helper profiles carefully.",
    "",
    "=== SAFETY & TONE ===",
    "- Always highlight safety for childcare, entering homes, ladder/roof work, or power tools.",
    "- If a job seems unsafe or unclear, recommend clarification or, if needed, declining.",
    "- Use a warm, respectful, non-judgmental tone.",
    "",
    "IMPORTANT:",
    "- Do NOT claim to charge the user's card or finalize payments yourself.",
    "- Instead, say that payments are handled securely by the NeighborTask platform.",
    "- If you truly lack enough info to suggest a price or helper, say so and ask one very specific follow-up question."
  ];

  return lines.join("\n");
}

// =================================================
// Logging
// =================================================

function logConversationToSheet(mode, messages) {
  if (!SHEET_ID || SHEET_ID === "") return;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = "Logs";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Timestamp", "Mode", "Last user message", "Last assistant reply"]);
  }

  var lastUser = findLastMessageByRole(messages, "user");
  var lastAssistant = findLastMessageByRole(messages, "assistant");

  var lastUserText = lastUser ? (lastUser.content || lastUser.text || "") : "";
  var lastAssistantText = lastAssistant ? (lastAssistant.content || lastAssistant.text || "") : "";

  sheet.appendRow([
    new Date(),
    mode,
    lastUserText,
    lastAssistantText
  ]);
}

function findLastMessageByRole(messages, role) {
  for (var i = messages.length - 1; i >= 0; i--) {
    var m = messages[i];
    if (m && m.role === role) return m;
  }
  return null;
}

// =================================================
// Location (Maps)
// =================================================

/**
 * Geocode address -> { formattedAddress, lat, lng, zipcode }
 */
function getLocationInfo_(address) {
  if (!address) {
    throw new Error("getLocationInfo_: address is required");
  }

  var resp = Maps.newGeocoder().geocode(address);
  if (!resp || !resp.results || resp.results.length === 0) {
    throw new Error("Unable to geocode address: " + address);
  }

  var result = resp.results[0];
  var loc = result.geometry.location;

  var formatted = result.formatted_address;
  var components = result.address_components || [];
  var zipcode = "";

  components.forEach(function (c) {
    if (c.types && c.types.indexOf("postal_code") !== -1) {
      zipcode = c.long_name;
    }
  });

  return {
    formattedAddress: formatted,
    lat: loc.lat,
    lng: loc.lng,
    zipcode: zipcode
  };
}

// =================================================
// Market benchmarks & pricing
// =================================================

function getMarketBenchmark_(serviceType, geoBucket) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("MarketBenchmarks");
  if (!sheet) throw new Error("Sheet 'MarketBenchmarks' not found");

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    throw new Error("MarketBenchmarks has no data");
  }

  var header = values[0];
  var rows = values.slice(1);

  var idxService = header.indexOf("service_type");
  var idxGeo    = header.indexOf("geo_bucket");
  var idxLow    = header.indexOf("base_low");
  var idxMid    = header.indexOf("base_mid");
  var idxHigh   = header.indexOf("base_high");
  var idxUnit   = header.indexOf("unit");
  var idxRisk   = header.indexOf("base_risk");

  var match = null;
  rows.forEach(function (r) {
    if (String(r[idxService]) === String(serviceType) &&
        String(r[idxGeo]) === String(geoBucket)) {
      match = {
        service_type: r[idxService],
        geo_bucket: r[idxGeo],
        base_low: Number(r[idxLow]),
        base_mid: Number(r[idxMid]),
        base_high: Number(r[idxHigh]),
        unit: r[idxUnit],
        base_risk: r[idxRisk] || "medium"
      };
    }
  });

  if (!match) {
    throw new Error("No MarketBenchmark for service=" + serviceType + " geo=" + geoBucket);
  }
  return match;
}

/**
 * Compute price range using benchmark + property + urgency + weather + demand
 */
function computeQuote_(serviceType, geoBucket, propertyProfile, urgency, weatherClass, demandFactor) {
  var bench = getMarketBenchmark_(serviceType, geoBucket);
  var base = bench.base_mid;

  propertyProfile = propertyProfile || {};

  // Property factor
  var p = 0.0;
  var driveway = propertyProfile.driveway_type || "short";
  var stories = propertyProfile.stories ? Number(propertyProfile.stories) : 1;
  var corner = propertyProfile.corner_lot ? true : false;

  if (driveway === "medium") p += 0.15;
  if (driveway === "long") p += 0.30;
  if (stories >= 2) p += 0.10;
  if (corner) p += 0.10;

  // Urgency factor
  var u = 0.0;
  if (urgency === "same_day") u = 0.20;
  if (urgency === "emergency") u = 0.40;

  // Weather factor (simple for now)
  var w = 0.0;
  if (weatherClass === "medium") w = 0.15;
  if (weatherClass === "heavy") w = 0.30;

  // Demand factor
  var d = demandFactor || 0.0;

  var low  = base * (1 + p + u * 0.5);
  var high = base * (1 + p + u + w + d);
  var mid  = (low + high) / 2;

  return {
    currency: "USD",
    unit: bench.unit || "per_job",
    price_low: Math.round(low),
    price_mid: Math.round(mid),
    price_high: Math.round(high)
  };
}

// =================================================
// Helpers lookup (distance + verification)
// =================================================

function haversineKm_(lat1, lng1, lat2, lng2) {
  function toRad(deg) { return deg * Math.PI / 180; }
  var R = 6371; // km
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find helpers that can perform serviceType near (lat, lng).
 */
function findHelpers_(serviceType, lat, lng) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) throw new Error("Sheet 'Helpers' not found");

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  var header = values[0];
  var rows = values.slice(1);

  var idxId       = header.indexOf("helper_id");
  var idxName     = header.indexOf("name");
  var idxServices = header.indexOf("services");
  var idxLat      = header.indexOf("center_lat");
  var idxLng      = header.indexOf("center_lng");
  var idxRadius   = header.indexOf("radius_km");
  var idxVerif    = header.indexOf("verification_level");
  var idxRating   = header.indexOf("rating");

  var matches = [];

  rows.forEach(function (r) {
    var id = r[idxId];
    var name = r[idxName];
    var services = String(r[idxServices] || "").toLowerCase();
    if (!services) return;

    var parts = services.split(",").map(function (s) { return s.trim(); });
    if (parts.indexOf(serviceType) === -1) {
      return;
    }

    var hLat = Number(r[idxLat]);
    var hLng = Number(r[idxLng]);
    var radius = Number(r[idxRadius]) || 5;

    if (!hLat || !hLng) return;

    var dist = haversineKm_(lat, lng, hLat, hLng);
    if (dist <= radius) {
      matches.push({
        helper_id: id,
        name: name,
        distance_km: dist,
        verification_level: r[idxVerif] || "none",
        rating: Number(r[idxRating]) || null
      });
    }
  });

  // Sort by distance then verification then rating
  matches.sort(function (a, b) {
    if (a.distance_km !== b.distance_km) {
      return a.distance_km - b.distance_km;
    }
    var va = a.verification_level || "";
    var vb = b.verification_level || "";
    if (va !== vb) {
      if (va === "background_checked") return -1;
      if (vb === "background_checked") return 1;
      if (va === "id_verified") return -1;
      if (vb === "id_verified") return 1;
    }
    return (b.rating || 0) - (a.rating || 0);
  });

  return matches;
}

function filterHelpersByVerification_(helpers, requiredLevel) {
  var order = ["none", "id_verified", "background_checked", "pro"];

  function levelIndex(level) {
    var idx = order.indexOf(level);
    return idx === -1 ? 0 : idx;
  }

  var minIdx = levelIndex(requiredLevel);

  return helpers.filter(function (h) {
    var lvl = h.verification_level || "none";
    return levelIndex(lvl) >= minIdx;
  });
}

// =================================================
// Risk & Security
// =================================================

/**
 * Physical risk: ladders, roof, snow, driveway, etc.
 */
function computeRiskLevel_(serviceType, baseRisk, propertyProfile, jobDetails) {
  propertyProfile = propertyProfile || {};
  jobDetails = jobDetails || {};

  var levelScore = 0;

  function bump(n) { levelScore += n; }

  // Base from market benchmark
  if (baseRisk === "low") bump(1);
  else if (baseRisk === "medium") bump(2);
  else if (baseRisk === "high") bump(3);

  var drv = propertyProfile.driveway_type || "short";
  var roof = propertyProfile.roof_pitch || "normal";

  if (drv === "medium") bump(0.5);
  if (drv === "long") bump(1);
  if (roof === "steep") bump(1);
  if (propertyProfile.stairs) bump(0.5);
  if (propertyProfile.corner_lot) bump(0.5);

  if (jobDetails.uses_ladder) bump(1.5);
  if (jobDetails.works_on_roof) bump(2);

  if (levelScore <= 2) return "low";
  if (levelScore <= 4) return "medium";
  return "high";
}

/**
 * Security risk: indoors, kids, valuables, alone in home, etc.
 */
function computeSecurityRiskLevel_(serviceType, jobDetails) {
  jobDetails = jobDetails || {};
  var score = 0;

  if (jobDetails.indoors) score += 1;

  if (jobDetails.children_present) {
    score += 2;
    if (jobDetails.kids_age_min && jobDetails.kids_age_min < 6) {
      score += 1;
    }
  }

  if (jobDetails.indoors && jobDetails.customer_present === false) {
    score += 1;
  }

  if (jobDetails.access_to_valuables) {
    score += 1;
  }

  if (serviceType === "kids_care") score += 2;
  if (serviceType === "cleaning") score += 1;

  if (score <= 1) return "low";
  if (score <= 3) return "medium";
  return "high";
}

/**
 * Required verification level based on security risk & service type
 */
function computeRequiredVerificationLevel_(serviceType, securityRiskLevel) {
  if (securityRiskLevel === "low") {
    return "none";
  }

  if (securityRiskLevel === "medium") {
    if (serviceType === "cleaning" || serviceType === "kids_care") {
      return "id_verified";
    }
    return "id_verified";
  }

  // HIGH security risk
  if (serviceType === "kids_care" || serviceType === "cleaning") {
    return "background_checked";
  }

  return "background_checked";
}

// =================================================
// Smart context builder
// =================================================

/**
 * Build the structured context used to inform GPT:
 * - location
 * - property
 * - urgency
 * - weather (placeholder)
 * - quote
 * - helpers (filtered by verification)
 * - risk & security
 */
function buildSmartContext_(serviceType, address, urgency, propertyProfile, demandFactor, jobDetails) {
  var loc = getLocationInfo_(address);

  // Weather classification placeholder (can wire real API later)
  var weatherClass = "medium";

  // Property fallback if nothing provided
  propertyProfile = propertyProfile || {
    home_type: "house",
    stories: 1,
    driveway_type: "medium",
    corner_lot: false
  };

  var bench = getMarketBenchmark_(serviceType, loc.zipcode);

  var quote = computeQuote_(serviceType, loc.zipcode, propertyProfile, urgency, weatherClass, demandFactor || 0);

  var physicalRisk = computeRiskLevel_(serviceType, bench.base_risk, propertyProfile, jobDetails || {});
  var securityRisk = computeSecurityRiskLevel_(serviceType, jobDetails || {});
  var requiredVerification = computeRequiredVerificationLevel_(serviceType, securityRisk);

  var helpersRaw = findHelpers_(serviceType, loc.lat, loc.lng);
  var helpersFiltered = filterHelpersByVerification_(helpersRaw, requiredVerification);

  return {
    location: loc,
    property: propertyProfile,
    urgency: urgency,
    weather_class: weatherClass,
    quote: quote,
    helpers: helpersFiltered,
    risk_level: physicalRisk,
    security_risk_level: securityRisk,
    required_verification_level: requiredVerification
  };
}

// =================================================
// Helpers: Background check (MOCK)
// =================================================

/**
 * Find a helper row by helper_id in Helpers sheet.
 * Returns { rowIndex, rowValues, header, sheet } or null.
 */
function getHelperRowById_(helperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) throw new Error("Sheet 'Helpers' not found");

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return null;

  var header = values[0];
  var rows = values.slice(1);
  var idxId = header.indexOf("helper_id");

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idxId]) === String(helperId)) {
      return {
        rowIndex: i + 2, // 1-based index + header row
        rowValues: rows[i],
        header: header,
        sheet: sheet
      };
    }
  }
  return null;
}

/**
 * Update verification-related fields for a helper.
 */
function updateHelperVerification_(
  helperId,
  verificationLevel,
  idVerified,
  backgroundChecked,
  bgCheckDate
) {
  var info = getHelperRowById_(helperId);
  if (!info) {
    throw new Error("Helper not found: " + helperId);
  }

  var sheet = info.sheet;
  var header = info.header;
  var rowIndex = info.rowIndex;

  var row = sheet.getRange(rowIndex, 1, 1, header.length).getValues()[0];

  var idxVerif = header.indexOf("verification_level");
  var idxIdVer = header.indexOf("id_verified");
  var idxBgChk = header.indexOf("background_checked");
  var idxBgDate = header.indexOf("bg_check_date");

  if (idxVerif >= 0 && verificationLevel !== undefined) row[idxVerif] = verificationLevel;
  if (idxIdVer >= 0 && idVerified !== undefined) row[idxIdVer] = idVerified;
  if (idxBgChk >= 0 && backgroundChecked !== undefined) row[idxBgChk] = backgroundChecked;
  if (idxBgDate >= 0 && bgCheckDate !== undefined) row[idxBgDate] = bgCheckDate;

  sheet.getRange(rowIndex, 1, 1, header.length).setValues([row]);
}

/**
 * Append a background check result to BackgroundChecks sheet (for records).
 */
function logBackgroundCheckResult_(bgResult) {
  if (!SHEET_ID || SHEET_ID === "") return;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = "BackgroundChecks";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      "Timestamp",
      "check_id",
      "helper_id",
      "status",
      "completed_at",
      "provider",
      "notes"
    ]);
  }

  sheet.appendRow([
    new Date(),
    bgResult.check_id,
    bgResult.helper_id,
    bgResult.status,
    bgResult.completed_at || "",
    bgResult.provider || "",
    bgResult.notes || ""
  ]);
}

/**
 * MOCK background check:
 * - Sometimes returns status "clear", sometimes "consider"
 * - Immediately updates Helpers sheet (verification_level, id_verified, background_checked, bg_check_date)
 * - Logs to BackgroundChecks sheet
 *
 * Later, replace internals with real Checkr API calls.
 */
function startMockBackgroundCheck_(helperId) {
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  // Randomly decide result to simulate real-world outcomes
  var rand = Math.random();
  var status = rand < 0.85 ? "clear" : "consider"; // 85% clear, 15% consider

  var verificationLevel = "background_checked";
  var idVerified = true;
  var backgroundChecked = (status === "clear");

  // If "consider", you might still mark background_checked but with caution note
  var notes = "";
  if (status === "consider") {
    notes = "Mock: potential issue flagged, review manually.";
  }

  // Update helper row
  updateHelperVerification_(
    helperId,
    verificationLevel,
    idVerified,
    backgroundChecked,
    todayStr
  );

  var mockCheckId = "mock_check_" + helperId + "_" + new Date().getTime();

  var result = {
    check_id: mockCheckId,
    helper_id: helperId,
    status: status,      // "clear" or "consider"
    completed_at: todayStr,
    provider: "mock_checkr",
    notes: notes
  };

  // Log in BackgroundChecks sheet
  logBackgroundCheckResult_(result);

  return result;
}

