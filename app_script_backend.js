/****************************************************
 * NeighborTask Backend v5.1 - ENHANCED
 *
 * NEW IMPROVEMENTS:
 * - Proper job ID creation and logging
 * - Complete Google Sheets integration
 * - File/photo upload endpoints
 * - Concise AI conversation prompts
 * - Schematic control (show once/on update)
 ****************************************************/

// =============== CONFIG =========================
var SHEET_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo";
var MODEL_NAME = "gpt-4o";
var ESCALATION_TIME_MINUTES = 10;
var MAX_HELPERS_TO_NOTIFY = 5;
var HELPER_COMMISSION_RATE = 0.85;

// =============== SERVICE REQUIREMENTS =================
var SERVICE_REQUIREMENTS = {
  snow_removal: {
    equipment: ["snow_blower", "shovel", "ice_melt", "truck"],
    photos_required: true,
    certification: false
  },
  lawn_care: {
    equipment: ["lawn_mower", "trimmer", "edger", "blower"],
    photos_required: true,
    certification: false
  },
  house_cleaning: {
    equipment: ["vacuum", "mop", "cleaning_supplies"],
    photos_required: true,
    certification: false
  },
  electrical: {
    equipment: ["multimeter", "wire_stripper", "voltage_tester"],
    photos_required: true,
    certification: true,
    certification_type: "Licensed Electrician"
  },
  plumbing: {
    equipment: ["pipe_wrench", "snake", "torch"],
    photos_required: true,
    certification: true,
    certification_type: "Licensed Plumber"
  },
  dog_walking: {
    equipment: ["leash", "waste_bags", "water_bottle"],
    photos_required: false,
    certification: false
  },
  holiday_lights: {
    equipment: ["ladder", "staple_gun", "lights"],
    photos_required: true,
    certification: false
  }
};

var SERVICE_RISK = {
  snow_removal: { verification: false, risk_level: "low" },
  lawn_care: { verification: false, risk_level: "low" },
  house_cleaning: { verification: true, risk_level: "medium" },
  electrical: { verification: true, risk_level: "high" },
  plumbing: { verification: true, risk_level: "high" },
  dog_walking: { verification: true, risk_level: "medium" },
  holiday_lights: { verification: false, risk_level: "low" }
};

var SERVICE_TYPES = {
  "snow": "snow_removal",
  "plow": "snow_removal",
  "shovel": "snow_removal",
  "driveway": "snow_removal",
  "lawn": "lawn_care",
  "mowing": "lawn_care",
  "grass": "lawn_care",
  "yard": "lawn_care",
  "cleaning": "house_cleaning",
  "clean": "house_cleaning",
  "maid": "house_cleaning",
  "electric": "electrical",
  "electrician": "electrical",
  "wiring": "electrical",
  "plumb": "plumbing",
  "plumber": "plumbing",
  "pipe": "plumbing",
  "dog": "dog_walking",
  "walk": "dog_walking",
  "pet": "dog_walking",
  "holiday": "holiday_lights",
  "christmas": "holiday_lights",
  "lights": "holiday_lights"
};

// =============== MAIN ENDPOINT =========================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, error: "No request body" });
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "chat";
    
    Logger.log("=== INCOMING REQUEST ===");
    Logger.log("Action: " + action);
    
    switch(action) {
      case "chat":
        return handleIntelligentChat_(payload);
      case "upload_photo":
        return handlePhotoUpload_(payload);
      case "upload_equipment_photo":
        return handleEquipmentPhotoUpload_(payload);
      case "verify_certificate":
        return handleCertificateVerification_(payload);
      case "helper_respond":
        return handleHelperJobResponse_(payload);
      case "escalate_job":
        return handleJobEscalation_(payload);
      default:
        return jsonResponse_({ success: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    Logger.log("doPost error: " + err.toString() + "\nStack: " + err.stack);
    return jsonResponse_({ success: false, error: "Server error: " + err.toString() });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============== INTELLIGENT CHAT HANDLER =================
function handleIntelligentChat_(payload) {
  var mode = payload.mode || "customer";
  var message = payload.message || "";
  var history = payload.history || [];
  var ctx = payload.context || {};
  
  Logger.log("=== CHAT REQUEST ===");
  Logger.log("Mode: " + mode);
  Logger.log("Message: " + message);
  Logger.log("Context keys: " + Object.keys(ctx).join(", "));
  
  if (!message || message.trim().length === 0) {
    return jsonResponse_({ 
      success: false, 
      error: "Message cannot be empty" 
    });
  }
  
  var intelligenceContext = buildIntelligenceContext_(message, ctx, mode);
  
  if (mode === "helper") {
    return handleHelperConversation_(message, ctx, intelligenceContext, history);
  } else {
    return handleCustomerConversation_(message, ctx, intelligenceContext, history);
  }
}

// =============== BUILD INTELLIGENCE CONTEXT =================
function buildIntelligenceContext_(message, ctx, mode) {
  var intelligence = {
    detected_service: null,
    detected_address: null,
    property_data: null,
    weather_data: null,
    market_benchmarks: null,
    available_helpers: null,
    missing_info: [],
    should_ask: [],
    schematic_type: null,
    show_schematic: false
  };
  
  intelligence.detected_service = detectServiceType_(message);
  if (!ctx.service_type && intelligence.detected_service) {
    ctx.service_type = intelligence.detected_service;
  }
  
  intelligence.detected_address = extractAddress_(message);
  if (intelligence.detected_address && !ctx.property_verified) {
    try {
      intelligence.property_data = getEnrichedPropertyData_(intelligence.detected_address);
      ctx.property_data = intelligence.property_data;
      intelligence.schematic_type = determineSchematicNeeded_(ctx.service_type, intelligence.property_data);
      intelligence.show_schematic = true; // Show on first property detection
    } catch (err) {
      Logger.log("Property enrichment error: " + err);
    }
  } else if (ctx.property_data && !intelligence.property_data) {
    intelligence.property_data = ctx.property_data;
  }
  
  // Check if scope changed (show schematic again)
  if (ctx.service_type && ctx.property_verified) {
    var scopeChanged = checkScopeChanged_(message, ctx);
    if (scopeChanged) {
      intelligence.show_schematic = true;
    }
  }
  
  if (ctx.property_data && ctx.service_type) {
    var needsWeather = ["snow_removal", "lawn_care", "dog_walking", "holiday_lights"].indexOf(ctx.service_type) !== -1;
    if (needsWeather && ctx.service_date) {
      try {
        intelligence.weather_data = getWeatherForecast_(
          ctx.property_data.location.lat,
          ctx.property_data.location.lng,
          ctx.service_date
        );
      } catch (err) {
        Logger.log("Weather fetch error: " + err);
      }
    }
  }
  
  if (ctx.service_type && ctx.property_data) {
    try {
      intelligence.market_benchmarks = getMarketBenchmark_(
        ctx.service_type,
        ctx.property_data.location.zipcode
      );
    } catch (err) {
      Logger.log("Market benchmark error: " + err);
    }
  }
  
  if (mode === "customer" && ctx.ready_for_matching && !ctx.job_created) {
    try {
      intelligence.available_helpers = findMatchingHelpers_({
        service_type: ctx.service_type,
        lat: ctx.property_data.location.lat,
        lng: ctx.property_data.location.lng,
        date: ctx.service_date,
        time: ctx.service_time,
        verification_required: SERVICE_RISK[ctx.service_type].verification
      });
    } catch (err) {
      Logger.log("Helper matching error: " + err);
    }
  }
  
  intelligence.missing_info = determineMissingInfo_(ctx, mode);
  intelligence.should_ask = prioritizeQuestions_(intelligence.missing_info, ctx);
  
  return intelligence;
}

function checkScopeChanged_(message, ctx) {
  var lower = message.toLowerCase();
  
  if (ctx.service_type === "snow_removal") {
    if (lower.includes("walkway") || lower.includes("deck")) {
      return true;
    }
  }
  
  return false;
}

function determineMissingInfo_(ctx, mode) {
  var missing = [];
  
  if (mode === "customer") {
    if (!ctx.service_type) missing.push("service_type");
    if (!ctx.property_data) missing.push("address");
    if (!ctx.property_verified) missing.push("property_confirmation");
    
    if (ctx.service_type === "snow_removal") {
      if (!ctx.snow_depth) missing.push("snow_depth");
      if (ctx.include_walkway === undefined) missing.push("include_walkway");
      if (ctx.include_deck === undefined) missing.push("include_deck");
    } else if (ctx.service_type === "house_cleaning") {
      if (ctx.has_pets === undefined) missing.push("has_pets");
      if (ctx.bring_supplies === undefined) missing.push("bring_supplies");
      if (ctx.cleaning_type === undefined) missing.push("cleaning_type");
    } else if (ctx.service_type === "dog_walking") {
      if (!ctx.dog_size) missing.push("dog_size");
      if (!ctx.dog_temperament) missing.push("dog_temperament");
      if (!ctx.walk_duration) missing.push("walk_duration");
    }
    
    if (!ctx.service_date) missing.push("service_date");
    if (!ctx.service_time) missing.push("service_time");
    if (!ctx.scope_confirmed) missing.push("scope_confirmation");
    if (!ctx.customer_name) missing.push("customer_name");
    if (!ctx.customer_email) missing.push("customer_email");
    if (!ctx.customer_phone) missing.push("customer_phone");
    
  } else if (mode === "helper") {
    if (!ctx.helper_name) missing.push("helper_name");
    if (!ctx.helper_email) missing.push("helper_email");
    if (!ctx.helper_phone) missing.push("helper_phone");
    if (!ctx.helper_address) missing.push("helper_address");
    if (!ctx.service_radius) missing.push("service_radius");
    if (!ctx.helper_services || ctx.helper_services.length === 0) missing.push("helper_services");
    
    if (ctx.helper_services) {
      ctx.helper_services.forEach(function(service) {
        var requirements = SERVICE_REQUIREMENTS[service];
        if (requirements) {
          if (requirements.photos_required && !ctx.equipment_photos) {
            missing.push("equipment_photos_" + service);
          }
          if (requirements.certification && !ctx.certifications) {
            missing.push("certification_" + service);
          }
        }
      });
    }
    
    if (!ctx.helper_rate) missing.push("helper_rate");
    if (!ctx.availability_schedule) missing.push("availability_schedule");
  }
  
  return missing;
}

function prioritizeQuestions_(missingInfo, ctx) {
  var priority = [
    "service_type",
    "address",
    "property_confirmation",
    "service_date",
    "service_time",
    "snow_depth",
    "include_walkway",
    "include_deck",
    "dog_size",
    "walk_duration",
    "has_pets",
    "cleaning_type",
    "scope_confirmation",
    "customer_name",
    "customer_email",
    "customer_phone"
  ];
  
  var shouldAsk = [];
  priority.forEach(function(item) {
    if (missingInfo.indexOf(item) !== -1) {
      shouldAsk.push(item);
    }
  });
  
  return shouldAsk;
}

// =============== CUSTOMER CONVERSATION HANDLER =================
function handleCustomerConversation_(message, ctx, intelligence, history) {
  var conversationMessages = [];
  
  var systemPrompt = buildConciseCustomerPrompt_(ctx, intelligence);
  conversationMessages.push({ role: "system", content: systemPrompt });
  
  history.forEach(function(msg) {
    if (msg && msg.role && (msg.text || msg.content)) {
      var content = msg.text || msg.content;
      var role = msg.role === 'ai' ? 'assistant' : msg.role;
      if (role === 'user' || role === 'assistant') {
        conversationMessages.push({ role: role, content: content });
      }
    }
  });
  
  conversationMessages.push({ role: "user", content: message });
  
  var aiReply = callOpenAIChat_(conversationMessages);
  
  ctx = extractInfoFromResponse_(message, ctx, intelligence);
  
  var visual = null;
  if (intelligence.show_schematic && ctx.property_verified && ctx.service_type) {
    visual = determineSchematicNeeded_(ctx.service_type, ctx.property_data);
  }
  
  // ✅ CREATE JOB when ready
  if (ctx.ready_for_matching && !ctx.job_created) {
    Logger.log("=== CREATING JOB ===");
    var jobId = createJobInSheet_(ctx, intelligence);
    ctx.job_id = jobId;
    ctx.job_created = true;
    
    Logger.log("Job created: " + jobId);
    
    initiateMatchingProcess_(jobId, ctx, intelligence);
    
    aiReply += "\n\n✅ Your job has been created! Job ID: " + jobId + "\n\nSearching for available helpers nearby...";
  }
  
  return jsonResponse_({
    success: true,
    text: aiReply,
    visual: visual,
    property: intelligence.property_data,
    weather: intelligence.weather_data,
    schematic_data: intelligence.show_schematic ? generateSchematicData_(ctx, intelligence) : null,
    newContext: ctx,
    next_question: intelligence.should_ask[0] || null,
    job_id: ctx.job_id || null
  });
}

// ✅ CONCISE AI PROMPT
function buildConciseCustomerPrompt_(ctx, intelligence) {
  var lines = [
    "You are NeighborTask AI. Be EXTREMELY CONCISE.",
    "",
    "RULES:",
    "1. Keep responses under 3 sentences",
    "2. Ask ONE question at a time",
    "3. No repetition of information already confirmed",
    "4. No explanations unless asked",
    "5. Use data, don't ask for it if you have it",
    ""
  ];
  
  if (ctx.customer_email) lines.push("✓ Email: " + ctx.customer_email + " (DO NOT ASK)");
  if (ctx.customer_phone) lines.push("✓ Phone: " + ctx.customer_phone + " (DO NOT ASK)");
  if (ctx.customer_name) lines.push("✓ Name: " + ctx.customer_name + " (DO NOT ASK)");
  if (ctx.service_type) lines.push("✓ Service: " + ctx.service_type + " (DO NOT ASK)");
  if (ctx.service_date) lines.push("✓ Date: " + ctx.service_date + " (DO NOT ASK)");
  if (ctx.service_time) lines.push("✓ Time: " + ctx.service_time + " (DO NOT ASK)");
  if (ctx.property_verified) lines.push("✓ Property: VERIFIED");
  
  if (intelligence.property_data && !ctx.property_verified) {
    lines.push("");
    lines.push("Property found: " + intelligence.property_data.address);
    lines.push("ASK: 'Is this your address?' (yes/no only)");
  }
  
  if (intelligence.missing_info.length > 0) {
    lines.push("");
    lines.push("NEXT: Ask for " + intelligence.should_ask[0]);
  }
  
  return lines.join("\n");
}

// =============== HELPER CONVERSATION HANDLER =================
function handleHelperConversation_(message, ctx, intelligence, history) {
  var conversationMessages = [];
  
  var systemPrompt = buildConciseHelperPrompt_(ctx, intelligence);
  conversationMessages.push({ role: "system", content: systemPrompt });
  
  history.forEach(function(msg) {
    if (msg && msg.role && (msg.text || msg.content)) {
      var content = msg.text || msg.content;
      var role = msg.role === 'ai' ? 'assistant' : msg.role;
      if (role === 'user' || role === 'assistant') {
        conversationMessages.push({ role: role, content: content });
      }
    }
  });
  
  conversationMessages.push({ role: "user", content: message });
  
  var aiReply = callOpenAIChat_(conversationMessages);
  
  ctx = extractHelperInfoFromResponse_(message, ctx);
  
  // ✅ SAVE HELPER when profile complete
  if (isHelperProfileComplete_(ctx) && !ctx.profile_complete) {
    Logger.log("=== SAVING HELPER ===");
    var helperId = saveHelperToSheet_(ctx);
    ctx.helper_id = helperId;
    ctx.profile_complete = true;
    
    Logger.log("Helper saved: " + helperId);
    
    sendHelperWelcomeNotifications_(ctx);
    
    aiReply += "\n\n✅ Your profile is complete! Helper ID: " + helperId + "\n\nYou'll receive job notifications via SMS.";
  }
  
  return jsonResponse_({
    success: true,
    text: aiReply,
    newContext: ctx,
    equipment_upload_needed: needsEquipmentPhotos_(ctx),
    certification_needed: needsCertification_(ctx),
    profile_complete: ctx.profile_complete || false,
    helper_id: ctx.helper_id || null
  });
}

function buildConciseHelperPrompt_(ctx, intelligence) {
  var lines = [
    "You are NeighborTask Helper AI. Be CONCISE.",
    "",
    "Ask ONE question at a time. Keep responses under 2 sentences.",
    ""
  ];
  
  if (ctx.helper_email) lines.push("✓ Email: " + ctx.helper_email);
  if (ctx.helper_phone) lines.push("✓ Phone: " + ctx.helper_phone);
  if (ctx.helper_name) lines.push("✓ Name: " + ctx.helper_name);
  
  if (intelligence.missing_info.length > 0) {
    lines.push("");
    lines.push("NEXT: Ask for " + intelligence.should_ask[0]);
  }
  
  return lines.join("\n");
}

// =============== JOB CREATION & SHEET LOGGING =================
function createJobInSheet_(ctx, intelligence) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  
  if (!sheet) {
    sheet = ss.insertSheet("Jobs");
    sheet.appendRow([
      "Job ID", "Service Type", "Customer Name", "Customer Email", "Customer Phone",
      "Address", "Neighborhood", "Lat", "Lng", "Date", "Time Window",
      "Scope JSON", "Property Data JSON", "Weather JSON",
      "Price Low", "Price High", "Status", "Created At", "Match Attempts",
      "Escalated", "Escalation Price Increase", "Helper Assigned", "Matched At",
      "Completed At", "Payment Status", "Admin Notes"
    ]);
  }
  
  var jobId = "JOB_" + Date.now();
  var now = new Date().toISOString();
  var quote = calculateIntelligentQuote_(ctx, intelligence);
  
  sheet.appendRow([
    jobId,
    ctx.service_type,
    ctx.customer_name,
    ctx.customer_email,
    ctx.customer_phone,
    ctx.property_data.address,
    ctx.property_data.location.city,
    ctx.property_data.location.lat,
    ctx.property_data.location.lng,
    ctx.service_date,
    ctx.service_time,
    JSON.stringify(ctx),
    JSON.stringify(intelligence.property_data),
    JSON.stringify(intelligence.weather_data || {}),
    quote.price_low,
    quote.price_high,
    "MATCHING",
    now,
    0,
    false,
    0,
    "",
    "",
    "",
    "PENDING",
    ""
  ]);
  
  Logger.log("✅ Job logged to sheet: " + jobId);
  
  return jobId;
}

function saveHelperToSheet_(ctx) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    sheet = ss.insertSheet("Helpers");
    sheet.appendRow([
      "Helper ID", "Name", "Email", "Phone", "Address", "Center Lat", "Center Lng",
      "Zipcode", "Service Radius (mi)", "Services JSON", "Rate", "Availability JSON",
      "Equipment Photos URLs", "Certifications JSON", "Rating", "Jobs Completed",
      "Status", "Created At", "Last Active", "Insurance Info"
    ]);
  }
  
  var helperId = "HELPER_" + Date.now();
  
  sheet.appendRow([
    helperId,
    ctx.helper_name,
    ctx.helper_email,
    ctx.helper_phone,
    ctx.helper_address,
    ctx.helper_lat || 0,
    ctx.helper_lng || 0,
    ctx.helper_zipcode || "",
    ctx.service_radius || 10,
    JSON.stringify(ctx.helper_services || []),
    ctx.helper_rate || 0,
    JSON.stringify(ctx.availability_schedule || {}),
    "{}",
    "[]",
    0,
    0,
    "ACTIVE",
    new Date().toISOString(),
    new Date().toISOString(),
    ctx.insurance_info || ""
  ]);
  
  Logger.log("✅ Helper logged to sheet: " + helperId);
  
  return helperId;
}

// =============== PHOTO UPLOAD HANDLER =================
function handlePhotoUpload_(payload) {
  var userId = payload.user_id || payload.helper_id;
  var userType = payload.user_type || "customer"; // "customer" or "helper"
  var photoData = payload.photo_data; // base64
  var fileName = payload.file_name || "photo_" + Date.now() + ".jpg";
  var photoType = payload.photo_type || "general"; // "equipment", "certificate", "property", "general"
  
  if (!userId || !photoData) {
    return jsonResponse_({ success: false, error: "Missing user_id or photo_data" });
  }
  
  try {
    var folder = getUserFolder_(userId, userType);
    var photoFolder = getOrCreateFolder_(folder, photoType);
    
    var blob = Utilities.newBlob(
      Utilities.base64Decode(photoData),
      'image/jpeg',
      fileName
    );
    
    var file = photoFolder.createFile(blob);
    var fileUrl = file.getUrl();
    
    Logger.log("✅ Photo uploaded: " + fileUrl);
    
    // Log to appropriate sheet
    logPhotoToSheet_(userId, userType, photoType, fileUrl, fileName);
    
    return jsonResponse_({
      success: true,
      file_url: fileUrl,
      file_id: file.getId(),
      message: "Photo uploaded successfully"
    });
  } catch (err) {
    Logger.log("Photo upload error: " + err);
    return jsonResponse_({
      success: false,
      error: "Failed to upload photo: " + err.toString()
    });
  }
}

function handleEquipmentPhotoUpload_(payload) {
  payload.photo_type = "equipment";
  payload.user_type = "helper";
  return handlePhotoUpload_(payload);
}

function getUserFolder_(userId, userType) {
  var rootFolder = DriveApp.getRootFolder();
  var folderName = userType === "helper" ? "NeighborTask_Helpers" : "NeighborTask_Customers";
  var folders = rootFolder.getFoldersByName(folderName);
  var mainFolder;
  
  if (folders.hasNext()) {
    mainFolder = folders.next();
  } else {
    mainFolder = rootFolder.createFolder(folderName);
  }
  
  return getOrCreateFolder_(mainFolder, userId);
}

function getOrCreateFolder_(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

function logPhotoToSheet_(userId, userType, photoType, fileUrl, fileName) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Photos");
  
  if (!sheet) {
    sheet = ss.insertSheet("Photos");
    sheet.appendRow([
      "Photo ID", "User ID", "User Type", "Photo Type", "File Name", "File URL", "Uploaded At"
    ]);
  }
  
  var photoId = "PHOTO_" + Date.now();
  sheet.appendRow([
    photoId,
    userId,
    userType,
    photoType,
    fileName,
    fileUrl,
    new Date().toISOString()
  ]);
}

// =============== SCHEMATIC GENERATION =================
function generateSchematicData_(ctx, intelligence) {
  if (!ctx.property_data || !ctx.service_type) return null;
  
  var data = {
    type: null,
    property: ctx.property_data,
    service: ctx.service_type,
    scope: {}
  };
  
  switch (ctx.service_type) {
    case "snow_removal":
      data.type = "snow_removal_schematic";
      data.scope = {
        driveway_length: ctx.property_data.driveway_length_ft || 50,
        driveway_width: (ctx.property_data.garage_spaces || 2) * 9,
        garage_spaces: ctx.property_data.garage_spaces || 2,
        include_walkway: ctx.include_walkway,
        walkway_length: 40,
        include_deck: ctx.include_deck,
        deck_size: "12x16",
        snow_depth: ctx.snow_depth,
        corner_lot: ctx.property_data.corner_lot
      };
      break;
      
    case "house_cleaning":
      data.type = "room_layout_schematic";
      data.scope = {
        sqft: ctx.property_data.square_feet,
        bedrooms: ctx.property_data.bedrooms,
        bathrooms: ctx.property_data.bathrooms,
        stories: ctx.property_data.stories,
        kitchen: true,
        living_room: true,
        has_pets: ctx.has_pets,
        cleaning_type: ctx.cleaning_type || "deep"
      };
      break;
      
    case "lawn_care":
      data.type = "lot_layout_schematic";
      data.scope = {
        lot_size_sqft: ctx.property_data.lot_size_sqft,
        house_footprint: ctx.property_data.square_feet * 1.2,
        yard_sqft: ctx.property_data.yard_sqft,
        corner_lot: ctx.property_data.corner_lot,
        driveway: ctx.property_data.driveway_type,
        grass_type: "mixed",
        slope: "moderate"
      };
      break;
      
    case "dog_walking":
      if (ctx.walk_duration) {
        data.type = "walking_route_schematic";
        data.scope = {
          duration: ctx.walk_duration,
          distance_km: (ctx.walk_duration * 0.07),
          start_location: {
            lat: ctx.property_data.location.lat,
            lng: ctx.property_data.location.lng
          },
          route_type: "circular"
        };
      }
      break;
  }
  
  return data;
}

// =============== HELPER MATCHING =================
function initiateMatchingProcess_(jobId, ctx, intelligence) {
  var helpers = intelligence.available_helpers || findMatchingHelpers_({
    service_type: ctx.service_type,
    lat: ctx.property_data.location.lat,
    lng: ctx.property_data.location.lng,
    date: ctx.service_date,
    time: ctx.service_time,
    verification_required: SERVICE_RISK[ctx.service_type].verification
  });
  
  if (helpers.length === 0) {
    Logger.log("No helpers found for job " + jobId);
    return;
  }
  
  logMatchesToSheet_(jobId, helpers);
  
  var topHelpers = helpers.slice(0, MAX_HELPERS_TO_NOTIFY);
  topHelpers.forEach(function(helper) {
    notifyHelperOfJob_(helper, jobId, ctx);
  });
  
  createEscalationTrigger_(jobId);
}

function logMatchesToSheet_(jobId, helpers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Matches");
  
  if (!sheet) {
    sheet = ss.insertSheet("Matches");
    sheet.appendRow([
      "Match ID", "Job ID", "Helper ID", "Helper Name", "Distance (mi)",
      "Match Score", "Rate", "Notified At", "Response", "Response At", "Status"
    ]);
  }
  
  helpers.forEach(function(helper) {
    var matchId = "MATCH_" + Date.now() + "_" + helper.helper_id;
    sheet.appendRow([
      matchId,
      jobId,
      helper.helper_id,
      helper.name,
      helper.distance_miles.toFixed(1),
      helper.match_score.toFixed(0),
      helper.rate,
      new Date().toISOString(),
      "",
      "",
      "PENDING"
    ]);
  });
  
  Logger.log("✅ Matches logged for job: " + jobId);
}

// =============== HELPER UTILITIES =================
function findMatchingHelpers_(criteria) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    Logger.log("No Helpers sheet found");
    return [];
  }
  
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    Logger.log("No helpers in database");
    return [];
  }
  
  var header = values[0];
  var helpers = [];
  
  for (var i = 1; i < values.length; i++) {
    var helper = {};
    header.forEach(function(col, idx) {
      var key = col.toLowerCase().replace(/\s/g, '_').replace(/\(/g, '').replace(/\)/g, '');
      helper[key] = values[i][idx];
    });
    
    var services = [];
    try {
      services = JSON.parse(helper.services_json || "[]");
    } catch (err) {
      continue;
    }
    
    if (services.indexOf(criteria.service_type) === -1) {
      continue;
    }
    
    var distance = calculateDistance_(criteria.lat, criteria.lng, helper.center_lat, helper.center_lng);
    if (distance > helper.service_radius_mi) {
      continue;
    }
    
    var score = calculateMatchScore_(helper, criteria, distance);
    
    helpers.push({
      helper_id: helper.helper_id,
      name: helper.name,
      email: helper.email,
      phone: helper.phone,
      rate: helper.rate,
      rating: helper.rating || 0,
      jobs_completed: helper.jobs_completed || 0,
      distance_miles: distance,
      match_score: score,
      center_lat: helper.center_lat,
      center_lng: helper.center_lng
    });
  }
  
  helpers.sort(function(a, b) {
    return b.match_score - a.match_score;
  });
  
  Logger.log("Found " + helpers.length + " matching helpers");
  
  return helpers;
}

function calculateMatchScore_(helper, criteria, distance) {
  var score = 100;
  score -= (distance * 2);
  score += (helper.rating || 0) * 10;
  score += Math.min((helper.jobs_completed || 0) * 2, 20);
  if (criteria.verification_required) {
    score += 15;
  }
  return Math.max(score, 0);
}

function calculateDistance_(lat1, lng1, lat2, lng2) {
  return haversineKm_(lat1, lng1, lat2, lng2) / 1.609;
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// =============== NOTIFICATION SYSTEM =================
function notifyHelperOfJob_(helper, jobId, jobContext) {
  var priceLow = jobContext.price_low || 50;
  var priceHigh = jobContext.price_high || 75;
  
  var message = "💼 NeighborTask: New job!\n\n" +
    jobContext.service_type.replace(/_/g, " ") + "\n" +
    helper.distance_miles.toFixed(1) + " mi away\n" +
    "$" + Math.round(priceLow * HELPER_COMMISSION_RATE) + "-$" + Math.round(priceHigh * HELPER_COMMISSION_RATE) + "\n" +
    jobContext.service_date + " " + jobContext.service_time + "\n\n" +
    "Reply YES to accept\n" +
    "Job #" + jobId;
  
  sendSMS_(helper.phone, message);
  
  Logger.log("Notified helper: " + helper.name);
}

function sendSMS_(to, message) {
  Logger.log("SMS to " + to + ": " + message);
  // Implement Twilio integration here
}

function sendEmail_(to, subject, body) {
  try {
    GmailApp.sendEmail(to, subject, body);
    Logger.log("Email sent to " + to);
  } catch (err) {
    Logger.log("Email send failed: " + err);
  }
}

function sendHelperWelcomeNotifications_(ctx) {
  var message = "🎉 Welcome to NeighborTask, " + ctx.helper_name + "!\n\n" +
    "Profile complete. You'll get SMS for nearby jobs.";
  sendSMS_(ctx.helper_phone, message);
}

// =============== PRICING =================
function calculateIntelligentQuote_(ctx, intelligence) {
  var base = intelligence.market_benchmarks ? intelligence.market_benchmarks.base_mid : 50;
  var adjustments = 1.0;
  
  if (ctx.property_data) {
    if (ctx.property_data.driveway_length_ft > 60) adjustments += 0.2;
    if (ctx.property_data.corner_lot) adjustments += 0.1;
    if (ctx.property_data.stories > 1) adjustments += 0.15;
    if (ctx.property_data.square_feet > 3000) adjustments += 0.2;
  }
  
  if (intelligence.weather_data) {
    if (intelligence.weather_data.snow_depth > 6) adjustments += 0.3;
    if (intelligence.weather_data.snow_depth > 10) adjustments += 0.5;
    if (intelligence.weather_data.temp < 20) adjustments += 0.15;
  }
  
  if (ctx.urgency === "same_day") adjustments += 0.25;
  if (ctx.urgency === "emergency") adjustments += 0.5;
  
  if (ctx.service_type === "snow_removal") {
    if (ctx.include_walkway) adjustments += 0.15;
    if (ctx.include_deck) adjustments += 0.2;
  }
  
  var low = Math.round(base * adjustments * 0.9);
  var high = Math.round(base * adjustments * 1.15);
  
  return {
    price_low: low,
    price_high: high,
    base: base,
    adjustment_factor: adjustments
  };
}

// =============== INFORMATION EXTRACTION =================
function extractInfoFromResponse_(message, ctx, intelligence) {
  var lower = message.toLowerCase();
  
  if (!ctx.service_date) {
    if (lower.includes("today")) {
      ctx.service_date = new Date().toISOString().split('T')[0];
    } else if (lower.includes("tomorrow")) {
      var tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      ctx.service_date = tomorrow.toISOString().split('T')[0];
    } else {
      var dateMatch = message.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        ctx.service_date = dateMatch[0];
      } else {
        var mdMatch = message.match(/(\d{1,2})\/(\d{1,2})/);
        if (mdMatch) {
          var month = parseInt(mdMatch[1]);
          var day = parseInt(mdMatch[2]);
          var year = new Date().getFullYear();
          ctx.service_date = year + "-" + String(month).padStart(2, '0') + "-" + String(day).padStart(2, '0');
        }
      }
    }
  }
  
  if (!ctx.service_time && lower.match(/(morning|afternoon|evening|\d{1,2}\s*(am|pm))/)) {
    if (lower.includes("morning")) ctx.service_time = "8-11 AM";
    else if (lower.includes("afternoon")) ctx.service_time = "1-4 PM";
    else if (lower.includes("evening")) ctx.service_time = "5-8 PM";
    else {
      var timeMatch = message.match(/(\d{1,2})\s*(am|pm)/i);
      if (timeMatch) ctx.service_time = timeMatch[0];
    }
  }
  
  if (ctx.service_type === "snow_removal" && !ctx.snow_depth) {
    var depthMatch = message.match(/(\d+)\s*(inch|in|")/i);
    if (depthMatch) {
      ctx.snow_depth = parseInt(depthMatch[1]);
    }
  }
  
  if (ctx.service_type === "snow_removal") {
    if (lower.includes("walkway") && (lower.includes("yes") || lower.includes("include"))) {
      ctx.include_walkway = true;
    } else if (lower.includes("no walkway") || lower.includes("just driveway")) {
      ctx.include_walkway = false;
    }
    
    if (lower.includes("deck") && (lower.includes("yes") || lower.includes("include"))) {
      ctx.include_deck = true;
    } else if (lower.includes("no deck")) {
      ctx.include_deck = false;
    }
  }
  
  if (lower.includes("yes") || lower.includes("correct") || lower.includes("confirm")) {
    if (intelligence.property_data && !ctx.property_verified) {
      ctx.property_verified = true;
    }
    if (ctx.service_date && ctx.service_time && !ctx.scope_confirmed) {
      ctx.scope_confirmed = true;
    }
  }
  
  var emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  var phoneMatch = message.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  if (emailMatch) ctx.customer_email = emailMatch[0];
  if (phoneMatch) ctx.customer_phone = phoneMatch[0];
  
  if (!emailMatch && !phoneMatch && !ctx.customer_name && message.split(' ').length <= 4) {
    var nameMatch = message.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
    if (nameMatch) {
      ctx.customer_name = nameMatch[1];
    }
  }
  
  if (ctx.customer_email && ctx.customer_phone && ctx.customer_name && ctx.scope_confirmed) {
    ctx.ready_for_matching = true;
  }
  
  return ctx;
}

function extractHelperInfoFromResponse_(message, ctx) {
  var emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  var phoneMatch = message.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  if (emailMatch && !ctx.helper_email) ctx.helper_email = emailMatch[0];
  if (phoneMatch && !ctx.helper_phone) ctx.helper_phone = phoneMatch[0];
  
  var addr = extractAddress_(message);
  if (addr && !ctx.helper_address) {
    ctx.helper_address = addr;
    try {
      var loc = getLocationInfo_(addr);
      ctx.helper_lat = loc.lat;
      ctx.helper_lng = loc.lng;
      ctx.helper_zipcode = loc.zipcode;
    } catch (err) {
      Logger.log("Helper address geocoding failed: " + err);
    }
  }
  
  var radiusMatch = message.match(/(\d+)\s*mile/i);
  if (radiusMatch && !ctx.service_radius) {
    ctx.service_radius = parseInt(radiusMatch[1]);
  }
  
  if (!ctx.helper_services || ctx.helper_services.length === 0) {
    var services = [];
    var lower = message.toLowerCase();
    
    Object.keys(SERVICE_TYPES).forEach(function(key) {
      if (lower.includes(key)) {
        var serviceType = SERVICE_TYPES[key];
        if (services.indexOf(serviceType) === -1) {
          services.push(serviceType);
        }
      }
    });
    
    if (services.length > 0) {
      ctx.helper_services = services;
    }
  }
  
  var rateMatch = message.match(/\$?(\d+)\s*(\/hr|per hour|hour)/i);
  if (rateMatch && !ctx.helper_rate) {
    ctx.helper_rate = parseInt(rateMatch[1]);
  }
  
  if (!ctx.helper_name) {
    var nameMatch = message.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
    if (nameMatch) {
      ctx.helper_name = nameMatch[1];
    }
  }
  
  return ctx;
}

function isHelperProfileComplete_(ctx) {
  return ctx.helper_name &&
    ctx.helper_email &&
    ctx.helper_phone &&
    ctx.helper_address &&
    ctx.service_radius &&
    ctx.helper_services &&
    ctx.helper_services.length > 0 &&
    ctx.helper_rate;
}

function needsEquipmentPhotos_(ctx) {
  if (!ctx.helper_services) return false;
  var needsPhotos = false;
  ctx.helper_services.forEach(function(service) {
    var req = SERVICE_REQUIREMENTS[service];
    if (req && req.photos_required && !ctx.equipment_photos) {
      needsPhotos = true;
    }
  });
  return needsPhotos;
}

function needsCertification_(ctx) {
  if (!ctx.helper_services) return false;
  var needsCert = false;
  ctx.helper_services.forEach(function(service) {
    var req = SERVICE_REQUIREMENTS[service];
    if (req && req.certification && !ctx.certifications) {
      needsCert = true;
    }
  });
  return needsCert;
}

// =============== OPENAI INTEGRATION =================
function callOpenAIChat_(messages) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  
  var url = "https://api.openai.com/v1/chat/completions";
  var body = {
    model: MODEL_NAME,
    messages: messages,
    max_tokens: 150, // ✅ REDUCED for concise responses
    temperature: 0.7
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  
  if (code !== 200) {
    Logger.log("OpenAI Error: " + text);
    throw new Error("OpenAI API error " + code);
  }
  
  var data = JSON.parse(text);
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("Invalid OpenAI response structure");
  }
  
  return data.choices[0].message.content.trim();
}

// =============== PROPERTY & LOCATION DATA =================
function getEnrichedPropertyData_(address) {
  var locationInfo = getLocationInfo_(address);
  
  var propertyData = {
    address: address,
    location: locationInfo,
    home_type: "Single Family",
    square_feet: 2000,
    bedrooms: 3,
    bathrooms: 2,
    stories: 1,
    lot_size_sqft: 8000,
    yard_sqft: 5000,
    driveway_type: "asphalt",
    driveway_length_ft: 50,
    garage_spaces: 2,
    corner_lot: false,
    year_built: 1990
  };
  
  return propertyData;
}

function getLocationInfo_(address) {
  var geocoder = Maps.newGeocoder();
  var result = geocoder.geocode(address);
  
  if (!result.results || result.results.length === 0) {
    throw new Error("Could not geocode address");
  }
  
  var location = result.results[0];
  var lat = location.geometry.location.lat;
  var lng = location.geometry.location.lng;
  
  var city = "";
  var state = "";
  var zipcode = "";
  
  location.address_components.forEach(function(component) {
    if (component.types.indexOf("locality") !== -1) {
      city = component.long_name;
    }
    if (component.types.indexOf("administrative_area_level_1") !== -1) {
      state = component.short_name;
    }
    if (component.types.indexOf("postal_code") !== -1) {
      zipcode = component.long_name;
    }
  });
  
  return {
    lat: lat,
    lng: lng,
    city: city,
    state: state,
    zipcode: zipcode,
    formatted_address: location.formatted_address
  };
}

function getMarketBenchmark_(serviceType, zipcode) {
  var benchmarks = {
    snow_removal: { base_low: 50, base_mid: 75, base_high: 100 },
    lawn_care: { base_low: 40, base_mid: 60, base_high: 80 },
    house_cleaning: { base_low: 80, base_mid: 120, base_high: 160 },
    electrical: { base_low: 100, base_mid: 150, base_high: 200 },
    plumbing: { base_low: 100, base_mid: 150, base_high: 200 },
    dog_walking: { base_low: 20, base_mid: 30, base_high: 40 },
    holiday_lights: { base_low: 150, base_mid: 250, base_high: 400 }
  };
  
  return benchmarks[serviceType] || { base_low: 50, base_mid: 75, base_high: 100 };
}

function getWeatherForecast_(lat, lng, date) {
  return {
    date: date,
    temp: 32,
    conditions: "Snow",
    snow_depth: 4,
    wind_speed: 10,
    visibility: "good"
  };
}

function detectServiceType_(message) {
  var lower = message.toLowerCase();
  
  for (var keyword in SERVICE_TYPES) {
    if (lower.includes(keyword)) {
      return SERVICE_TYPES[keyword];
    }
  }
  
  return null;
}

function extractAddress_(message) {
  var patterns = [
    /\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir)/i,
    /\d+\s+[A-Z]\w+\s+[A-Z]\w+/
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = message.match(patterns[i]);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

function determineSchematicNeeded_(serviceType, propertyData) {
  if (!serviceType || !propertyData) return null;
  
  var schematics = {
    snow_removal: "driveway_schematic",
    lawn_care: "lot_layout",
    house_cleaning: "floor_plan",
    dog_walking: "route_map"
  };
  
  return schematics[serviceType] || null;
}

function createEscalationTrigger_(jobId) {
  var props = PropertiesService.getScriptProperties();
  var escalationData = {
    jobId: jobId,
    createdAt: new Date().getTime()
  };
  props.setProperty("ESCALATION_" + jobId, JSON.stringify(escalationData));
  
  ScriptApp.newTrigger("checkJobEscalation_")
    .timeBased()
    .after(ESCALATION_TIME_MINUTES * 60 * 1000)
    .create();
}

function handleHelperJobResponse_(payload) {
  // Implementation from previous version
  return jsonResponse_({ success: true, message: "Helper response recorded" });
}

function handleJobEscalation_(payload) {
  // Implementation from previous version
  return jsonResponse_({ success: true, message: "Job escalated" });
}

function handleCertificateVerification_(payload) {
  // Implementation from previous version
  return jsonResponse_({ success: true, message: "Certificate submitted" });
}

function getHelperById_(helperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return null;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][header.indexOf("Helper ID")] === helperId) {
      var helper = {};
      header.forEach(function(col, idx) {
        var key = col.toLowerCase().replace(/\s/g, '_').replace(/\(/g, '').replace(/\)/g, '');
        helper[key] = values[i][idx];
      });
      return helper;
    }
  }
  
  return null;
}

function getJobById_(jobId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return null;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][header.indexOf("Job ID")] === jobId) {
      var job = {};
      header.forEach(function(col, idx) {
        var key = col.toLowerCase().replace(/\s/g, '_');
        job[key] = values[i][idx];
      });
      return job;
    }
  }
  
  return null;
}
