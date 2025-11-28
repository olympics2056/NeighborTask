/****************************************************
 * NeighborTask Backend (OpenAI GPT + Mock Background Check)
 * FIXED VERSION - Corrected API endpoints and request format
 ****************************************************/

// =============== CONFIG =========================
var SHEET_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo";
// Use actual OpenAI model names: gpt-4o, gpt-4-turbo, or gpt-3.5-turbo
var MODEL_NAME = "gpt-4o-mini"; // Cost-effective option
// var MODEL_NAME = "gpt-4o"; // More capable but expensive
// =================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ success: false, error: "No request body received" });
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "chat";
    var mode = payload.mode || "customer";
    var messages = payload.messages || [];
    var history = payload.history || [];
    var ctx = payload.context || {};
    
    // 1) Background check action
    if (action === "request_bg_check") {
      if (!payload.helper_id) {
        return _json({ success: false, error: "helper_id is required" });
      }
      var bgResult = startMockBackgroundCheck_(payload.helper_id);
      return _json({ success: true, background_check: bgResult });
    }
    
    // 2) Chat action - Build conversation history
    var conversationMessages = [];
    
    // Add system prompt first
    conversationMessages.push({
      role: "system",
      content: getSystemPromptForMode(mode)
    });
    
    // Add conversation history
    if (history && history.length > 0) {
      history.forEach(function(msg) {
        if (msg && msg.role && (msg.text || msg.content)) {
          var content = msg.text || msg.content;
          var role = msg.role === 'ai' ? 'assistant' : msg.role;
          if (role === 'user' || role === 'assistant') {
            conversationMessages.push({ role: role, content: content });
          }
        }
      });
    }
    
    // Add context as system message if available
    if (ctx.service_type && ctx.address) {
      var propertyProfile = ctx.property_profile || null;
      var jobDetails = ctx.job_details || {};
      var smart = buildSmartContext_(
        ctx.service_type,
        ctx.address,
        ctx.urgency || "normal",
        propertyProfile,
        0.1,
        jobDetails
      );
      
      conversationMessages.push({
        role: "system",
        content: "CONTEXT_JSON (for your reasoning only):\n" + JSON.stringify(smart, null, 2)
      });
    }
    
    // Add current user message
    if (payload.message) {
      conversationMessages.push({
        role: "user",
        content: payload.message
      });
    }
    
    // Call OpenAI
    var aiReply = callOpenAIChat(conversationMessages);
    
    return _json({
      success: true,
      text: aiReply,
      reply: aiReply
    });
    
  } catch (err) {
    Logger.log("doPost error: " + err);
    return _json({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * FIXED: Call OpenAI Chat Completions API (correct endpoint and format)
 */
function callOpenAIChat(messages) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in Script Properties");
  
  // CORRECT OpenAI endpoint
  var url = "https://api.openai.com/v1/chat/completions";
  
  // CORRECT request body format
  var body = {
    model: MODEL_NAME,
    messages: messages,
    max_tokens: 500,
    temperature: 0.7
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + apiKey
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  
  if (code !== 200) {
    Logger.log("OpenAI Error Response: " + text);
    throw new Error("OpenAI API error " + code + ": " + text);
  }
  
  var data = JSON.parse(text);
  
  // CORRECT response parsing
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("Invalid OpenAI response structure");
  }
  
  var reply = data.choices[0].message.content;
  if (!reply) throw new Error("Empty reply from OpenAI");
  
  return String(reply).trim();
}

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
    "- Sometimes the system will send you a message with CONTEXT_JSON.",
    "- That JSON contains structured fields like location, property, quote, helpers, risk levels.",
    "- You MUST prefer using this structured information over guessing.",
    "- For prices: Use quote.price_low, quote.price_mid, and quote.price_high as the fair range.",
    "- For helpers: Describe only the helpers given in the helpers list.",
    "- Never show the raw JSON to the user. Convert it into natural language.",
    "",
    "=== TALKING TO A " + (isHelper ? "HELPER (SERVICE PROVIDER)" : "CUSTOMER (REQUESTING HELP)") + " ===",
    ""
  ];
  
  if (isHelper) {
    lines.push(
      "- Goal: help them present their skills, service area, and availability clearly.",
      "- Collect: services offered, service area, schedule, special tools/constraints.",
      "- Help them craft short, polite responses to customers."
    );
  } else {
    lines.push(
      "- Goal: help them clearly describe what they need, where, and when.",
      "- Collect: service type, address, time window, urgency, key property details.",
      "- Present price ranges and nearby helpers when available in CONTEXT_JSON.",
      "- Emphasize that matching and payment are handled securely by NeighborTask."
    );
  }
  
  lines.push(
    "",
    "=== SAFETY ===",
    "- Highlight safety for childcare, entering homes, ladder/roof work, or power tools.",
    "- Use risk_level and security_risk_level from CONTEXT_JSON to adjust recommendations.",
    "- Do NOT claim to charge cards or finalize payments yourself.",
    "- Say that payments are handled securely by the NeighborTask platform."
  );
  
  return lines.join("\n");
}

// =================================================
// All other functions remain the same...
// (getLocationInfo_, getMarketBenchmark_, computeQuote_, 
//  findHelpers_, computeRiskLevel_, etc.)
// =================================================

function getLocationInfo_(address) {
  if (!address) throw new Error("getLocationInfo_: address is required");
  var resp = Maps.newGeocoder().geocode(address);
  if (!resp || !resp.results || resp.results.length === 0) {
    throw new Error("Unable to geocode address: " + address);
  }
  var result = resp.results[0];
  var loc = result.geometry.location;
  var formatted = result.formatted_address;
  var components = result.address_components || [];
  var zipcode = "";
  components.forEach(function(c) {
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

function getMarketBenchmark_(serviceType, geoBucket) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("MarketBenchmarks");
  if (!sheet) throw new Error("Sheet 'MarketBenchmarks' not found");
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error("MarketBenchmarks has no data");
  var header = values[0];
  var rows = values.slice(1);
  var idxService = header.indexOf("service_type");
  var idxGeo = header.indexOf("geo_bucket");
  var idxLow = header.indexOf("base_low");
  var idxMid = header.indexOf("base_mid");
  var idxHigh = header.indexOf("base_high");
  var idxUnit = header.indexOf("unit");
  var idxRisk = header.indexOf("base_risk");
  var match = null;
  rows.forEach(function(r) {
    if (String(r[idxService]) === String(serviceType) && String(r[idxGeo]) === String(geoBucket)) {
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
  if (!match) throw new Error("No MarketBenchmark for service=" + serviceType + " geo=" + geoBucket);
  return match;
}

function computeQuote_(serviceType, geoBucket, propertyProfile, urgency, weatherClass, demandFactor) {
  var bench = getMarketBenchmark_(serviceType, geoBucket);
  var base = bench.base_mid;
  propertyProfile = propertyProfile || {};
  var p = 0.0;
  var driveway = propertyProfile.driveway_type || "short";
  var stories = propertyProfile.stories ? Number(propertyProfile.stories) : 1;
  var corner = propertyProfile.corner_lot ? true : false;
  if (driveway === "medium") p += 0.15;
  if (driveway === "long") p += 0.30;
  if (stories >= 2) p += 0.10;
  if (corner) p += 0.10;
  var u = 0.0;
  if (urgency === "same_day") u = 0.20;
  if (urgency === "emergency") u = 0.40;
  var w = 0.0;
  if (weatherClass === "medium") w = 0.15;
  if (weatherClass === "heavy") w = 0.30;
  var d = demandFactor || 0.0;
  var low = base * (1 + p + u * 0.5);
  var high = base * (1 + p + u + w + d);
  var mid = (low + high) / 2;
  return {
    currency: "USD",
    unit: bench.unit || "per_job",
    price_low: Math.round(low),
    price_mid: Math.round(mid),
    price_high: Math.round(high)
  };
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  function toRad(deg) { return deg * Math.PI / 180; }
  var R = 6371;
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function findHelpers_(serviceType, lat, lng) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) throw new Error("Sheet 'Helpers' not found");
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  var header = values[0];
  var rows = values.slice(1);
  var idxId = header.indexOf("helper_id");
  var idxName = header.indexOf("name");
  var idxServices = header.indexOf("services");
  var idxLat = header.indexOf("center_lat");
  var idxLng = header.indexOf("center_lng");
  var idxRadius = header.indexOf("radius_km");
  var idxVerif = header.indexOf("verification_level");
  var idxRating = header.indexOf("rating");
  var matches = [];
  rows.forEach(function(r) {
    var id = r[idxId];
    var name = r[idxName];
    var services = String(r[idxServices] || "").toLowerCase();
    if (!services) return;
    var parts = services.split(",").map(function(s) { return s.trim(); });
    if (parts.indexOf(serviceType) === -1) return;
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
  matches.sort(function(a, b) {
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
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
  return helpers.filter(function(h) {
    var lvl = h.verification_level || "none";
    return levelIndex(lvl) >= minIdx;
  });
}

function computeRiskLevel_(serviceType, baseRisk, propertyProfile, jobDetails) {
  propertyProfile = propertyProfile || {};
  jobDetails = jobDetails || {};
  var levelScore = 0;
  function bump(n) { levelScore += n; }
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

function computeSecurityRiskLevel_(serviceType, jobDetails) {
  jobDetails = jobDetails || {};
  var score = 0;
  if (jobDetails.indoors) score += 1;
  if (jobDetails.children_present) {
    score += 2;
    if (jobDetails.kids_age_min && jobDetails.kids_age_min < 6) score += 1;
  }
  if (jobDetails.indoors && jobDetails.customer_present === false) score += 1;
  if (jobDetails.access_to_valuables) score += 1;
  if (serviceType === "kids_care") score += 2;
  if (serviceType === "cleaning") score += 1;
  if (score <= 1) return "low";
  if (score <= 3) return "medium";
  return "high";
}

function computeRequiredVerificationLevel_(serviceType, securityRiskLevel) {
  if (securityRiskLevel === "low") return "none";
  if (securityRiskLevel === "medium") {
    if (serviceType === "cleaning" || serviceType === "kids_care") return "id_verified";
    return "id_verified";
  }
  if (serviceType === "kids_care" || serviceType === "cleaning") return "background_checked";
  return "background_checked";
}

function buildSmartContext_(serviceType, address, urgency, propertyProfile, demandFactor, jobDetails) {
  var loc = getLocationInfo_(address);
  var weatherClass = "medium";
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

function startMockBackgroundCheck_(helperId) {
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var rand = Math.random();
  var status = rand < 0.85 ? "clear" : "consider";
  var verificationLevel = "background_checked";
  var idVerified = true;
  var backgroundChecked = (status === "clear");
  var notes = "";
  if (status === "consider") {
    notes = "Mock: potential issue flagged, review manually.";
  }
  updateHelperVerification_(helperId, verificationLevel, idVerified, backgroundChecked, todayStr);
  var mockCheckId = "mock_check_" + helperId + "_" + new Date().getTime();
  var result = {
    check_id: mockCheckId,
    helper_id: helperId,
    status: status,
    completed_at: todayStr,
    provider: "mock_checkr",
    notes: notes
  };
  logBackgroundCheckResult_(result);
  return result;
}

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
        rowIndex: i + 2,
        rowValues: rows[i],
        header: header,
        sheet: sheet
      };
    }
  }
  return null;
}

function updateHelperVerification_(helperId, verificationLevel, idVerified, backgroundChecked, bgCheckDate) {
  var info = getHelperRowById_(helperId);
  if (!info) throw new Error("Helper not found: " + helperId);
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

function logBackgroundCheckResult_(bgResult) {
  if (!SHEET_ID || SHEET_ID === "") return;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = "BackgroundChecks";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Timestamp", "check_id", "helper_id", "status", "completed_at", "provider", "notes"]);
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
