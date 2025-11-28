/****************************************************
 * NeighborTask Backend v5.0 - CORRECTED & COMPLETE
 * 
 * Intelligent Context-Aware AI for Neighborhood Services
 * 
 * FIXES APPLIED:
 * - Added all missing functions
 * - Defined missing constants (SERVICE_RISK, SERVICE_TYPES)
 * - Removed duplicate functions
 * - Fixed escalation trigger logic
 * - Added input validation
 * - Improved error handling
 * - Optimized sheet operations
 * - Added helper utility functions
 ****************************************************/

// =============== CONFIGURATION =========================
var SHEET_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo";
var MODEL_NAME = "gpt-4o";
var ESCALATION_TIME_MINUTES = 10;
var MAX_HELPERS_TO_NOTIFY = 5;
var HELPER_COMMISSION_RATE = 0.85; // 85% to helper, 15% platform fee

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

// =============== SERVICE RISK LEVELS =================
var SERVICE_RISK = {
  snow_removal: { verification: false, risk_level: "low" },
  lawn_care: { verification: false, risk_level: "low" },
  house_cleaning: { verification: true, risk_level: "medium" },
  electrical: { verification: true, risk_level: "high" },
  plumbing: { verification: true, risk_level: "high" },
  dog_walking: { verification: true, risk_level: "medium" },
  holiday_lights: { verification: false, risk_level: "low" }
};

// =============== SERVICE TYPE MAPPING =================
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
    
    switch(action) {
      case "chat":
        return handleIntelligentChat_(payload);
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
  
  // Validate message
  if (!message || message.trim().length === 0) {
    return jsonResponse_({ 
      success: false, 
      error: "Message cannot be empty" 
    });
  }
  
  // Build comprehensive context FIRST
  var intelligenceContext = buildIntelligenceContext_(message, ctx, mode);
  
  // Route to appropriate handler
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
    schematic_type: null
  };
  
  // 1. Detect service type
  intelligence.detected_service = detectServiceType_(message);
  if (!ctx.service_type && intelligence.detected_service) {
    ctx.service_type = intelligence.detected_service;
  }
  
  // 2. Detect and enrich address
  intelligence.detected_address = extractAddress_(message);
  if (intelligence.detected_address && !ctx.property_verified) {
    try {
      intelligence.property_data = getEnrichedPropertyData_(intelligence.detected_address);
      ctx.property_data = intelligence.property_data;
      intelligence.schematic_type = determineSchematicNeeded_(ctx.service_type, intelligence.property_data);
    } catch (err) {
      Logger.log("Property enrichment error: " + err);
    }
  } else if (ctx.property_data && !intelligence.property_data) {
    intelligence.property_data = ctx.property_data;
  }
  
  // 3. Get weather if we have location and service type
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
  
  // 4. Get market benchmarks
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
  
  // 5. Find available helpers if ready for matching
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
  
  // 6. Determine what info is still needed
  intelligence.missing_info = determineMissingInfo_(ctx, mode);
  intelligence.should_ask = prioritizeQuestions_(intelligence.missing_info, ctx);
  
  return intelligence;
}

function determineMissingInfo_(ctx, mode) {
  var missing = [];
  
  if (mode === "customer") {
    if (!ctx.service_type) missing.push("service_type");
    if (!ctx.property_data) missing.push("address");
    if (!ctx.property_verified) missing.push("property_confirmation");
    
    // Service-specific requirements
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
    
    // Equipment verification for each service
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
  
  // Build intelligent system prompt
  var systemPrompt = buildIntelligentCustomerPrompt_(ctx, intelligence);
  conversationMessages.push({ role: "system", content: systemPrompt });
  
  // Add conversation history
  history.forEach(function(msg) {
    if (msg && msg.role && (msg.text || msg.content)) {
      var content = msg.text || msg.content;
      var role = msg.role === 'ai' ? 'assistant' : msg.role;
      if (role === 'user' || role === 'assistant') {
        conversationMessages.push({ role: role, content: content });
      }
    }
  });
  
  // Add current user message
  conversationMessages.push({ role: "user", content: message });
  
  // Call GPT
  var aiReply = callOpenAIChat_(conversationMessages);
  
  // Extract information from user's response
  ctx = extractInfoFromResponse_(message, ctx, intelligence);
  
  // Generate visuals if appropriate
  var visual = null;
  if (ctx.property_verified && ctx.service_type) {
    visual = determineSchematicNeeded_(ctx.service_type, ctx.property_data);
  }
  
  // Log to sheets if ready
  if (ctx.ready_for_matching && !ctx.job_created) {
    var jobId = createJobInSheet_(ctx, intelligence);
    ctx.job_id = jobId;
    ctx.job_created = true;
    
    // Start matching process
    initiateMatchingProcess_(jobId, ctx, intelligence);
  }
  
  return jsonResponse_({
    success: true,
    text: aiReply,
    visual: visual,
    property: intelligence.property_data,
    weather: intelligence.weather_data,
    schematic_data: generateSchematicData_(ctx, intelligence),
    newContext: ctx,
    next_question: intelligence.should_ask[0] || null
  });
}

function buildIntelligentCustomerPrompt_(ctx, intelligence) {
  var lines = [
    "You are NeighborTask Concierge v5.0 - The most intelligent neighborhood service AI.",
    "",
    "=== YOUR INTELLIGENCE ===",
    "You have access to:",
    "• Property data (from Zillow, Attom, Google Maps)",
    "• Real-time weather forecasts",
    "• Market pricing benchmarks",
    "• Available verified helpers nearby",
    "• Service-specific requirements",
    "",
    "=== CRITICAL BEHAVIOR ===",
    "1. ALWAYS use available data BEFORE asking questions",
    "2. ALWAYS confirm property data with user before proceeding",
    "3. ALWAYS ask for date AND time (never skip)",
    "4. ALWAYS show schematics when property data is available",
    "5. ALWAYS verify scope before pricing",
    "",
    "=== CURRENT CONTEXT ==="
  ];
  
  if (intelligence.detected_service) {
    lines.push("Detected Service: " + intelligence.detected_service);
  }
  
  if (intelligence.property_data) {
    lines.push("");
    lines.push("PROPERTY DATA AVAILABLE:");
    lines.push(JSON.stringify({
      address: intelligence.property_data.address,
      type: intelligence.property_data.home_type,
      sqft: intelligence.property_data.square_feet,
      bedrooms: intelligence.property_data.bedrooms,
      bathrooms: intelligence.property_data.bathrooms,
      stories: intelligence.property_data.stories,
      lot_size: intelligence.property_data.lot_size_sqft,
      driveway: intelligence.property_data.driveway_type,
      driveway_length: intelligence.property_data.driveway_length_ft,
      garage: intelligence.property_data.garage_spaces,
      corner_lot: intelligence.property_data.corner_lot
    }, null, 2));
    
    if (!ctx.property_verified) {
      lines.push("");
      lines.push("⚠ IMPORTANT: User has NOT confirmed this property data yet!");
      lines.push("YOU MUST ask: 'I found your property at [address]. Is this correct?'");
      lines.push("Show key details and wait for confirmation before proceeding.");
    }
  }
  
  if (intelligence.weather_data) {
    lines.push("");
    lines.push("WEATHER FORECAST:");
    lines.push(JSON.stringify(intelligence.weather_data, null, 2));
  }
  
  if (intelligence.market_benchmarks) {
    lines.push("");
    lines.push("MARKET PRICING:");
    lines.push("Base: $" + intelligence.market_benchmarks.base_low + "-$" + intelligence.market_benchmarks.base_high);
  }
  
  if (intelligence.missing_info.length > 0) {
    lines.push("");
    lines.push("STILL NEED TO ASK:");
    lines.push("Next question: " + intelligence.should_ask[0]);
    lines.push("Priority order: " + intelligence.should_ask.slice(0, 3).join(", "));
  }
  
  lines.push("");
  lines.push("=== CONVERSATION RULES ===");
  lines.push("• Be warm, friendly, and conversational");
  lines.push("• Ask ONE question at a time (unless collecting name/email/phone together)");
  lines.push("• Show property schematics when discussing scope");
  lines.push("• Include weather warnings for outdoor jobs");
  lines.push("• Confirm ALL details before asking for payment info");
  lines.push("• Use emojis sparingly (1-2 per message max)");
  
  return lines.join("\n");
}

// =============== HELPER CONVERSATION HANDLER =================
function handleHelperConversation_(message, ctx, intelligence, history) {
  var conversationMessages = [];
  
  // Build helper-specific system prompt
  var systemPrompt = buildIntelligentHelperPrompt_(ctx, intelligence);
  conversationMessages.push({ role: "system", content: systemPrompt });
  
  // Add history
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
  
  // Extract helper info
  ctx = extractHelperInfoFromResponse_(message, ctx);
  
  // Check if profile is complete
  if (isHelperProfileComplete_(ctx) && !ctx.profile_complete) {
    var helperId = saveHelperToSheet_(ctx);
    ctx.helper_id = helperId;
    ctx.profile_complete = true;
    
    // Send welcome communications
    sendHelperWelcomeNotifications_(ctx);
  }
  
  return jsonResponse_({
    success: true,
    text: aiReply,
    newContext: ctx,
    equipment_upload_needed: needsEquipmentPhotos_(ctx),
    certification_needed: needsCertification_(ctx),
    profile_complete: ctx.profile_complete || false
  });
}

function buildIntelligentHelperPrompt_(ctx, intelligence) {
  var lines = [
    "You are NeighborTask Helper Onboarding Assistant v5.0.",
    "",
    "=== YOUR ROLE ===",
    "Help service providers create professional profiles to earn money helping neighbors.",
    "",
    "=== INFORMATION TO COLLECT ===",
    "1. Personal: Name, Email, Phone",
    "2. Location: Home address (for job proximity)",
    "3. Service area: How far willing to travel (5-15 miles typical)",
    "4. Services: Which services can they provide",
    "5. Equipment: What tools/equipment they own (with photos)",
    "6. Certifications: Any licenses (electrician, plumber, etc.)",
    "7. Rate: Desired hourly or per-job rate",
    "8. Availability: Days/times available",
    "",
    "=== SERVICE REQUIREMENTS ==="
  ];
  
  Object.keys(SERVICE_REQUIREMENTS).forEach(function(service) {
    var req = SERVICE_REQUIREMENTS[service];
    lines.push(service + ":");
    lines.push("  Equipment: " + req.equipment.join(", "));
    lines.push("  Photos required: " + req.photos_required);
    if (req.certification) {
      lines.push("  Certification: " + req.certification_type);
    }
  });
  
  if (ctx.helper_services && ctx.helper_services.length > 0) {
    lines.push("");
    lines.push("=== HELPER'S SELECTED SERVICES ===");
    ctx.helper_services.forEach(function(service) {
      var req = SERVICE_REQUIREMENTS[service];
      if (req) {
        lines.push("");
        lines.push(service + " requires:");
        lines.push("Equipment needed: " + req.equipment.join(", "));
        if (req.photos_required) {
          lines.push("⚠ Must upload equipment photos");
        }
        if (req.certification) {
          lines.push("⚠ Must provide " + req.certification_type + " license");
        }
      }
    });
  }
  
  lines.push("");
  lines.push("=== CONVERSATION STYLE ===");
  lines.push("• Professional but friendly");
  lines.push("• Explain WHY we need each piece of information");
  lines.push("• Set realistic expectations for earnings");
  lines.push("• Emphasize safety and professionalism");
  lines.push("• Ask ONE clear question at a time");
  lines.push("");
  lines.push("=== CURRENT PROGRESS ===");
  lines.push("Information collected: " + Object.keys(ctx).length + " fields");
  lines.push("Missing: " + intelligence.missing_info.join(", "));
  
  return lines.join("\n");
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

// =============== JOB CREATION & MATCHING =================
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
  
  return jobId;
}

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
  
  // Log matches to sheet
  logMatchesToSheet_(jobId, helpers);
  
  // Notify top helpers
  var topHelpers = helpers.slice(0, MAX_HELPERS_TO_NOTIFY);
  topHelpers.forEach(function(helper) {
    notifyHelperOfJob_(helper, jobId, ctx);
  });
  
  // Set up escalation trigger
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
}

// =============== NOTIFICATION SYSTEM =================
function notifyHelperOfJob_(helper, jobId, jobContext) {
  var priceLow = jobContext.price_low || 50;
  var priceHigh = jobContext.price_high || 75;
  
  var message = "💼 NeighborTask: New job opportunity!\n\n" +
    jobContext.service_type.replace(/_/g, " ") + " - " +
    helper.distance_miles.toFixed(1) + " mi from you\n" +
    "Est. $" + Math.round(priceLow * HELPER_COMMISSION_RATE) + "-$" + Math.round(priceHigh * HELPER_COMMISSION_RATE) + "\n" +
    jobContext.service_date + " at " + jobContext.service_time + "\n\n" +
    "Reply YES to accept or NO to decline\n" +
    "Job #" + jobId;
  
  sendSMS_(helper.phone, message);
  
  var emailBody = "You have a new job match!\n\n" +
    "Job ID: " + jobId + "\n" +
    "Service: " + jobContext.service_type + "\n" +
    "Distance: " + helper.distance_miles.toFixed(1) + " miles\n" +
    "Date: " + jobContext.service_date + "\n" +
    "Time: " + jobContext.service_time + "\n" +
    "Estimated Pay: $" + Math.round(priceLow * HELPER_COMMISSION_RATE) + "-$" + Math.round(priceHigh * HELPER_COMMISSION_RATE) + "\n\n" +
    "Log in to accept or decline: https://app.neighbortask.com/jobs/" + jobId;
  
  sendEmail_(helper.email, "New Job Match - " + jobId, emailBody);
  
  logCommunication_(jobId, helper.helper_id, null, "SMS", "Outbound", message);
  logCommunication_(jobId, helper.helper_id, null, "Email", "Outbound", emailBody);
}

function sendSMS_(to, message) {
  var accountSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var authToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var fromNumber = PropertiesService.getScriptProperties().getProperty("TWILIO_PHONE_NUMBER");
  
  if (!accountSid || !authToken || !fromNumber) {
    Logger.log("Twilio not configured, skipping SMS to: " + to);
    return;
  }
  
  // Validate phone number
  if (!isValidPhone_(to)) {
    Logger.log("Invalid phone number: " + to);
    return;
  }
  
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + accountSid + "/Messages.json";
  var payload = {
    To: to,
    From: fromNumber,
    Body: message
  };
  
  var formData = Object.keys(payload).map(function(key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(payload[key]);
  }).join("&");
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(accountSid + ":" + authToken)
    },
    payload: formData,
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("SMS sent to " + to + ": " + response.getContentText());
  } catch (err) {
    Logger.log("SMS error: " + err);
  }
}

function sendEmail_(to, subject, body) {
  // Validate email
  if (!isValidEmail_(to)) {
    Logger.log("Invalid email address: " + to);
    return;
  }
  
  try {
    GmailApp.sendEmail(to, subject, body);
    Logger.log("Email sent to " + to);
  } catch (err) {
    Logger.log("Email send failed: " + err);
  }
}

function logCommunication_(jobId, helperId, customerId, type, direction, content) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Communications");
  
  if (!sheet) {
    sheet = ss.insertSheet("Communications");
    sheet.appendRow([
      "Comm ID", "Job ID", "Helper ID", "Customer ID", "Type",
      "Direction", "Content", "Sent At", "Delivered", "Read At", "Response"
    ]);
  }
  
  var commId = "COMM_" + Date.now();
  sheet.appendRow([
    commId,
    jobId || "",
    helperId || "",
    customerId || "",
    type,
    direction,
    content,
    new Date().toISOString(),
    true,
    "",
    ""
  ]);
}

// =============== HELPER JOB RESPONSE =================
function handleHelperJobResponse_(payload) {
  var helperId = payload.helper_id;
  var jobId = payload.job_id;
  var response = payload.response; // "accept" or "decline"
  
  if (!helperId || !jobId || !response) {
    return jsonResponse_({ success: false, error: "Missing required fields" });
  }
  
  // Update Matches sheet
  updateMatchResponse_(jobId, helperId, response);
  
  if (response === "accept") {
    // Assign job to helper
    assignJobToHelper_(jobId, helperId);
    
    // Notify customer
    notifyCustomerHelperAssigned_(jobId, helperId);
    
    // Notify other helpers job is filled
    notifyOtherHelpersFilled_(jobId, helperId);
    
    return jsonResponse_({ 
      success: true, 
      message: "Job assigned successfully", 
      job_id: jobId 
    });
  } else {
    return jsonResponse_({ 
      success: true, 
      message: "Response recorded" 
    });
  }
}

function updateMatchResponse_(jobId, helperId, response) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Matches");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idxJobId = header.indexOf("Job ID");
  var idxHelperId = header.indexOf("Helper ID");
  var idxResponse = header.indexOf("Response");
  var idxResponseAt = header.indexOf("Response At");
  var idxStatus = header.indexOf("Status");
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxJobId] === jobId && values[i][idxHelperId] === helperId) {
      sheet.getRange(i + 1, idxResponse + 1).setValue(response);
      sheet.getRange(i + 1, idxResponseAt + 1).setValue(new Date().toISOString());
      sheet.getRange(i + 1, idxStatus + 1).setValue(response === "accept" ? "ACCEPTED" : "DECLINED");
      break;
    }
  }
}

function assignJobToHelper_(jobId, helperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idxJobId = header.indexOf("Job ID");
  var idxStatus = header.indexOf("Status");
  var idxHelperAssigned = header.indexOf("Helper Assigned");
  var idxMatchedAt = header.indexOf("Matched At");
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxJobId] === jobId) {
      sheet.getRange(i + 1, idxStatus + 1).setValue("MATCHED");
      sheet.getRange(i + 1, idxHelperAssigned + 1).setValue(helperId);
      sheet.getRange(i + 1, idxMatchedAt + 1).setValue(new Date().toISOString());
      break;
    }
  }
}

function notifyCustomerHelperAssigned_(jobId, helperId) {
  var helper = getHelperById_(helperId);
  var job = getJobById_(jobId);
  
  if (!helper || !job) return;
  
  var distance = calculateDistance_(job.lat, job.lng, helper.center_lat, helper.center_lng);
  
  var message = "🎉 Great news! " + helper.name + " accepted your job!\n\n" +
    "Rating: " + (helper.rating || "New") + "⭐\n" +
    "Distance: " + distance.toFixed(1) + " miles\n" +
    "Arriving: " + job.date + " at " + job.time_window + "\n\n" +
    "Track: https://app.neighbortask.com/track/" + jobId;
  
  sendSMS_(job.customer_phone, message);
  
  var emailBody = "Good news! Your NeighborTask booking has been confirmed.\n\n" +
    "Helper: " + helper.name + "\n" +
    "Service: " + job.service_type + "\n" +
    "Date: " + job.date + "\n" +
    "Time: " + job.time_window + "\n\n" +
    "Track your job: https://app.neighbortask.com/track/" + jobId;
  
  sendEmail_(job.customer_email, "Helper Assigned - Job #" + jobId, emailBody);
  
  logCommunication_(jobId, null, job.customer_email, "SMS", "Outbound", message);
  logCommunication_(jobId, null, job.customer_email, "Email", "Outbound", emailBody);
}

function notifyOtherHelpersFilled_(jobId, assignedHelperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Matches");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idxJobId = header.indexOf("Job ID");
  var idxHelperId = header.indexOf("Helper ID");
  var idxStatus = header.indexOf("Status");
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxJobId] === jobId &&
        values[i][idxHelperId] !== assignedHelperId &&
        values[i][idxStatus] === "PENDING") {
      
      sheet.getRange(i + 1, idxStatus + 1).setValue("FILLED");
      
      var helper = getHelperById_(values[i][idxHelperId]);
      if (helper) {
        var message = "Job #" + jobId + " has been filled by another helper. Thanks for your interest!";
        sendSMS_(helper.phone, message);
      }
    }
  }
}

// =============== JOB ESCALATION =================
function createEscalationTrigger_(jobId) {
  // Store job ID with timestamp for escalation check
  var props = PropertiesService.getScriptProperties();
  var escalationData = {
    jobId: jobId,
    createdAt: new Date().getTime()
  };
  props.setProperty("ESCALATION_" + jobId, JSON.stringify(escalationData));
  
  // Create time-based trigger (10 minutes from now)
  ScriptApp.newTrigger("checkJobEscalation_")
    .timeBased()
    .after(ESCALATION_TIME_MINUTES * 60 * 1000)
    .create();
}

function checkJobEscalation_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var now = new Date();
  
  for (var i = 1; i < values.length; i++) {
    var status = values[i][header.indexOf("Status")];
    var createdAt = new Date(values[i][header.indexOf("Created At")]);
    var escalated = values[i][header.indexOf("Escalated")];
    var jobId = values[i][header.indexOf("Job ID")];
    
    if (status === "MATCHING" && !escalated) {
      var minutesElapsed = (now - createdAt) / (1000 * 60);
      if (minutesElapsed >= ESCALATION_TIME_MINUTES) {
        escalateJob_(jobId, i + 1);
      }
    }
  }
}

function escalateJob_(jobId, rowIndex) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var job = getJobById_(jobId);
  if (!job) return;
  
  // Increase price by 15%
  var priceLow = job.price_low * 1.15;
  var priceHigh = job.price_high * 1.15;
  var increase = Math.round((priceLow + priceHigh) / 2 - (job.price_low + job.price_high) / 2);
  
  if (rowIndex) {
    sheet.getRange(rowIndex, header.indexOf("Price Low") + 1).setValue(Math.round(priceLow));
    sheet.getRange(rowIndex, header.indexOf("Price High") + 1).setValue(Math.round(priceHigh));
    sheet.getRange(rowIndex, header.indexOf("Escalated") + 1).setValue(true);
    sheet.getRange(rowIndex, header.indexOf("Escalation Price Increase") + 1).setValue(increase);
    sheet.getRange(rowIndex, header.indexOf("Match Attempts") + 1).setValue(2);
  }
  
  // Find next tier of helpers (6-10)
  var allHelpers = findMatchingHelpers_({
    service_type: job.service_type,
    lat: job.lat,
    lng: job.lng,
    date: job.date,
    time: job.time_window,
    verification_required: SERVICE_RISK[job.service_type].verification
  });
  
  var nextTier = allHelpers.slice(5, 10);
  nextTier.forEach(function(helper) {
    notifyHelperOfJob_(helper, jobId, {
      service_type: job.service_type,
      price_low: priceLow,
      price_high: priceHigh,
      service_date: job.date,
      service_time: job.time_window
    });
  });
  
  // Notify customer
  var message = "We're expanding your search with premium pricing (+$" + increase + 
    ") to find the perfect helper. You'll only be charged the new rate if accepted.";
  sendSMS_(job.customer_phone, message);
  logCommunication_(jobId, null, job.customer_email, "SMS", "Outbound", message);
}

function handleJobEscalation_(payload) {
  var jobId = payload.job_id;
  if (!jobId) {
    return jsonResponse_({ success: false, error: "Missing job_id" });
  }
  
  escalateJob_(jobId, null);
  return jsonResponse_({ success: true, message: "Job escalated" });
}

// =============== EQUIPMENT PHOTO UPLOAD =================
function handleEquipmentPhotoUpload_(payload) {
  var helperId = payload.helper_id;
  var serviceType = payload.service_type;
  var photoData = payload.photo_data;
  var fileName = payload.file_name;
  
  if (!helperId || !serviceType || !photoData) {
    return jsonResponse_({ success: false, error: "Missing required fields" });
  }
  
  try {
    // Save to Google Drive
    var folder = getHelperFolder_(helperId);
    var equipmentFolder = getOrCreateFolder_(folder, "equipment");
    
    var blob = Utilities.newBlob(
      Utilities.base64Decode(photoData),
      'image/jpeg',
      fileName || 'equipment_' + serviceType + '_' + Date.now() + '.jpg'
    );
    
    var file = equipmentFolder.createFile(blob);
    var fileUrl = file.getUrl();
    
    // Update helper record
    updateHelperEquipment_(helperId, serviceType, fileUrl);
    
    return jsonResponse_({
      success: true,
      file_url: fileUrl,
      message: "Equipment photo uploaded successfully"
    });
  } catch (err) {
    Logger.log("Equipment photo upload error: " + err);
    return jsonResponse_({
      success: false,
      error: "Failed to upload photo: " + err.toString()
    });
  }
}

function getHelperFolder_(helperId) {
  var rootFolder = DriveApp.getRootFolder();
  var helpersFolderName = "NeighborTask_Helpers";
  var folders = rootFolder.getFoldersByName(helpersFolderName);
  var helpersFolder;
  
  if (folders.hasNext()) {
    helpersFolder = folders.next();
  } else {
    helpersFolder = rootFolder.createFolder(helpersFolderName);
  }
  
  return getOrCreateFolder_(helpersFolder, helperId);
}

function getOrCreateFolder_(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

function updateHelperEquipment_(helperId, serviceType, photoUrl) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idxHelperId = header.indexOf("Helper ID");
  var idxEquipmentPhotos = header.indexOf("Equipment Photos URLs");
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxHelperId] === helperId) {
      var currentPhotos = values[i][idxEquipmentPhotos] || "{}";
      var photosObj;
      
      try {
        photosObj = JSON.parse(currentPhotos);
      } catch (err) {
        photosObj = {};
      }
      
      if (!photosObj[serviceType]) {
        photosObj[serviceType] = [];
      }
      photosObj[serviceType].push(photoUrl);
      
      sheet.getRange(i + 1, idxEquipmentPhotos + 1).setValue(JSON.stringify(photosObj));
      break;
    }
  }
}

// =============== CERTIFICATE VERIFICATION =================
function handleCertificateVerification_(payload) {
  var helperId = payload.helper_id;
  var certificateType = payload.certificate_type;
  var licenseNumber = payload.license_number;
  var expirationDate = payload.expiration_date;
  var photoData = payload.photo_data;
  
  if (!helperId || !certificateType || !licenseNumber || !photoData) {
    return jsonResponse_({ success: false, error: "Missing required fields" });
  }
  
  try {
    // Save certificate photo
    var folder = getHelperFolder_(helperId);
    var certFolder = getOrCreateFolder_(folder, "certificates");
    
    var blob = Utilities.newBlob(
      Utilities.base64Decode(photoData),
      'image/jpeg',
      certificateType + "_" + licenseNumber + ".jpg"
    );
    
    var file = certFolder.createFile(blob);
    var fileUrl = file.getUrl();
    
    // Update helper record
    updateHelperCertification_(helperId, {
      type: certificateType,
      license_number: licenseNumber,
      expiration_date: expirationDate,
      photo_url: fileUrl,
      verified: false,
      verified_date: null
    });
    
    // Notify admin for manual verification
    notifyAdminCertificateReview_(helperId, certificateType, licenseNumber);
    
    return jsonResponse_({
      success: true,
      message: "Certificate submitted for verification. You'll be notified within 1-2 business days."
    });
  } catch (err) {
    Logger.log("Certificate verification error: " + err);
    return jsonResponse_({
      success: false,
      error: "Failed to submit certificate: " + err.toString()
    });
  }
}

function updateHelperCertification_(helperId, certData) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idxHelperId = header.indexOf("Helper ID");
  var idxCertifications = header.indexOf("Certifications JSON");
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxHelperId] === helperId) {
      var currentCerts = values[i][idxCertifications] || "[]";
      var certsArray;
      
      try {
        certsArray = JSON.parse(currentCerts);
      } catch (err) {
        certsArray = [];
      }
      
      certsArray.push(certData);
      sheet.getRange(i + 1, idxCertifications + 1).setValue(JSON.stringify(certsArray));
      break;
    }
  }
}

function notifyAdminCertificateReview_(helperId, certType, licenseNumber) {
  var adminEmail = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL") || "admin@neighbortask.com";
  
  var subject = "New Certificate Requires Verification";
  var body = "A helper has submitted a certificate for verification:\n\n" +
    "Helper ID: " + helperId + "\n" +
    "Certificate Type: " + certType + "\n" +
    "License Number: " + licenseNumber + "\n\n" +
    "Please review at: https://drive.google.com/drive/folders/helpers/" + helperId + "/certificates";
  
  sendEmail_(adminEmail, subject, body);
}

// =============== HELPER UTILITIES =================
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
  
  return helperId;
}

// =============== PRICING & QUOTE CALCULATION =================
function calculateIntelligentQuote_(ctx, intelligence) {
  var base = intelligence.market_benchmarks ? intelligence.market_benchmarks.base_mid : 50;
  var adjustments = 1.0;
  
  // Property factors
  if (ctx.property_data) {
    if (ctx.property_data.driveway_length_ft > 60) adjustments += 0.2;
    if (ctx.property_data.corner_lot) adjustments += 0.1;
    if (ctx.property_data.stories > 1) adjustments += 0.15;
    if (ctx.property_data.square_feet > 3000) adjustments += 0.2;
  }
  
  // Weather factors
  if (intelligence.weather_data) {
    if (intelligence.weather_data.snow_depth > 6) adjustments += 0.3;
    if (intelligence.weather_data.snow_depth > 10) adjustments += 0.5;
    if (intelligence.weather_data.temp < 20) adjustments += 0.15;
  }
  
  // Urgency factors
  if (ctx.urgency === "same_day") adjustments += 0.25;
  if (ctx.urgency === "emergency") adjustments += 0.5;
  
  // Service-specific adjustments
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
  
  // Extract date
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
  
  // Extract time
  if (!ctx.service_time && lower.match(/(morning|afternoon|evening|\d{1,2}\s*(am|pm))/)) {
    if (lower.includes("morning")) ctx.service_time = "8-11 AM";
    else if (lower.includes("afternoon")) ctx.service_time = "1-4 PM";
    else if (lower.includes("evening")) ctx.service_time = "5-8 PM";
    else {
      var timeMatch = message.match(/(\d{1,2})\s*(am|pm)/i);
      if (timeMatch) ctx.service_time = timeMatch[0];
    }
  }
  
  // Extract snow depth
  if (ctx.service_type === "snow_removal" && !ctx.snow_depth) {
    var depthMatch = message.match(/(\d+)\s*(inch|in|")/i);
    if (depthMatch) {
      ctx.snow_depth = parseInt(depthMatch[1]);
    }
  }
  
  // Extract walkway/deck preferences
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
  
  // Extract confirmation
  if (lower.includes("yes") || lower.includes("correct") || lower.includes("confirm")) {
    if (intelligence.property_data && !ctx.property_verified) {
      ctx.property_verified = true;
    }
    if (ctx.service_date && ctx.service_time && !ctx.scope_confirmed) {
      ctx.scope_confirmed = true;
    }
  }
  
  // Extract contact info
  var emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  var phoneMatch = message.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  if (emailMatch) ctx.customer_email = emailMatch[0];
  if (phoneMatch) ctx.customer_phone = phoneMatch[0];
  
  // Extract name (simple heuristic)
  if (!emailMatch && !phoneMatch && !ctx.customer_name && message.split(' ').length <= 4) {
    var nameMatch = message.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)$/);
    if (nameMatch) {
      ctx.customer_name = nameMatch[1];
    }
  }
  
  // Set ready for matching
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
  
  // Extract address
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
  
  // Extract service radius
  var radiusMatch = message.match(/(\d+)\s*mile/i);
  if (radiusMatch && !ctx.service_radius) {
    ctx.service_radius = parseInt(radiusMatch[1]);
  }
  
  // Extract services
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
  
  // Extract rate
  var rateMatch = message.match(/\$?(\d+)\s*(\/hr|per hour|hour)/i);
  if (rateMatch && !ctx.helper_rate) {
    ctx.helper_rate = parseInt(rateMatch[1]);
  }
  
  // Extract name
  if (!ctx.helper_name) {
    var nameMatch = message.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)$/);
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

function sendHelperWelcomeNotifications_(ctx) {
  var message = "🎉 Welcome to NeighborTask, " + ctx.helper_name + "!\n\n" +
    "Your profile is now active. You'll receive SMS when jobs match your services.\n\n" +
    "Services: " + (ctx.helper_services || []).join(", ") + "\n" +
    "Area: " + ctx.service_radius + " miles\n" +
    "Rate: $" + ctx.helper_rate + "/hr";
  
  sendSMS_(ctx.helper_phone, message);
  
  var emailBody = "Welcome to NeighborTask!\n\n" +
    "Your helper profile is complete and active.\n\n" +
    "Profile Details:\n" +
    "Name: " + ctx.helper_name + "\n" +
    "Services: " + (ctx.helper_services || []).join(", ") + "\n" +
    "Service Area: " + ctx.service_radius + " miles from " + ctx.helper_address + "\n" +
    "Rate: $" + ctx.helper_rate + "/hr\n\n" +
    "You'll receive notifications when jobs match your profile.";
  
  sendEmail_(ctx.helper_email, "Welcome to NeighborTask!", emailBody);
  
  logCommunication_(null, ctx.helper_id, null, "SMS", "Outbound", message);
  logCommunication_(null, ctx.helper_id, null, "Email", "Outbound", emailBody);
}

// =============== OPENAI INTEGRATION =================
function callOpenAIChat_(messages) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  
  var url = "https://api.openai.com/v1/chat/completions";
  var body = {
    model: MODEL_NAME,
    messages: messages,
    max_tokens: 800,
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
  // Get basic location info
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
  
  // Try to get Zillow data (would require API key)
  try {
    var zillowData = getZillowPropertyData_(address);
    if (zillowData) {
      Object.keys(zillowData).forEach(function(key) {
        if (zillowData[key]) propertyData[key] = zillowData[key];
      });
    }
  } catch (err) {
    Logger.log("Zillow API not available: " + err);
  }
  
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

function getZillowPropertyData_(address) {
  // Placeholder - would require Zillow API credentials
  // In production, you'd call the Zillow API here
  return null;
}

function getMarketBenchmark_(serviceType, zipcode) {
  // Simplified market benchmarks - in production, query a database
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
  // Placeholder for weather API integration
  // In production, integrate with OpenWeather, Weather.com, etc.
  return {
    date: date,
    temp: 32,
    conditions: "Snow",
    snow_depth: 4,
    wind_speed: 10,
    visibility: "good"
  };
}

// =============== HELPER MATCHING =================
function findMatchingHelpers_(criteria) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    return [];
  }
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var helpers = [];
  
  for (var i = 1; i < values.length; i++) {
    var helper = {};
    header.forEach(function(col, idx) {
      var key = col.toLowerCase().replace(/\s/g, '_').replace(/\(/g, '').replace(/\)/g, '');
      helper[key] = values[i][idx];
    });
    
    // Check if helper offers this service
    var services = [];
    try {
      services = JSON.parse(helper.services_json || "[]");
    } catch (err) {
      continue;
    }
    
    if (services.indexOf(criteria.service_type) === -1) {
      continue;
    }
    
    // Check distance
    var distance = calculateDistance_(criteria.lat, criteria.lng, helper.center_lat, helper.center_lng);
    if (distance > helper.service_radius_mi) {
      continue;
    }
    
    // Calculate match score
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
  
  // Sort by match score descending
  helpers.sort(function(a, b) {
    return b.match_score - a.match_score;
  });
  
  return helpers;
}

function calculateMatchScore_(helper, criteria, distance) {
  var score = 100;
  
  // Distance penalty (closer is better)
  score -= (distance * 2);
  
  // Rating bonus
  score += (helper.rating || 0) * 10;
  
  // Experience bonus
  score += Math.min((helper.jobs_completed || 0) * 2, 20);
  
  // Verification bonus
  if (criteria.verification_required) {
    // Check if helper has verification
    score += 15;
  }
  
  return Math.max(score, 0);
}

function calculateDistance_(lat1, lng1, lat2, lng2) {
  return haversineKm_(lat1, lng1, lat2, lng2) / 1.609; // Convert to miles
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  var R = 6371; // Earth's radius in km
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// =============== SERVICE TYPE DETECTION =================
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
  // Simple address extraction - looks for street patterns
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

// =============== VALIDATION UTILITIES =================
function isValidEmail_(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone_(phone) {
  var phoneRegex = /^\+?1?\d{10,14}$/;
  var cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  return phoneRegex.test(cleaned);
}

// =============== ADMIN ASSIGNMENT =================
function handleAdminAssign_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  var reason = payload.override_reason || "Manual assignment";
  
  if (!jobId || !helperId) {
    return jsonResponse_({ success: false, error: "Missing job_id or helper_id" });
  }
  
  assignJobToHelper_(jobId, helperId);
  
  // Log admin override
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var jobsSheet = ss.getSheetByName("Jobs");
  var values = jobsSheet.getDataRange().getValues();
  var header = values[0];
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][header.indexOf("Job ID")] === jobId) {
      var notes = "Admin override: " + reason + " at " + new Date().toISOString();
      jobsSheet.getRange(i + 1, header.indexOf("Admin Notes") + 1).setValue(notes);
      break;
    }
  }
  
  notifyCustomerHelperAssigned_(jobId, helperId);
  
  // Notify the assigned helper
  var helper = getHelperById_(helperId);
  var job = getJobById_(jobId);
  
  if (helper && job) {
    var message = "You've been assigned to job #" + jobId + "!\n\n" +
      "Service: " + job.service_type + "\n" +
      "Date: " + job.date + "\n" +
      "Time: " + job.time_window + "\n" +
      "Payment: $" + Math.round(job.price_low * HELPER_COMMISSION_RATE) + "-$" + Math.round(job.price_high * HELPER_COMMISSION_RATE);
    
    sendSMS_(helper.phone, message);
  }
  
  return jsonResponse_({
    success: true,
    message: "Job manually assigned to helper"
  });
}

/****************************************************
 * END OF NEIGHBORTASK BACKEND v5.0 - CORRECTED
 ****************************************************/
function calculateMatchScore_(helper, criteria, distance) {
  var score = 100;
  
  // Distance penalty (closer is better)
  score -= (distance * 2);
  
  // Rating bonus
  score += (helper.rating || 0) * 10;
  
  // Experience bonus
  score += Math.min((helper.jobs_completed || 0) * 2, 20);
  
  // Verification bonus
  if (criteria.verification_required) {
    // Check if helper has verification
    score += 15;
  }
  
  return Math.max(score, 0);
}

function calculateDistance_(lat1, lng1, lat2, lng2) {
  return haversineKm_(lat1, lng1, lat2, lng2) / 1.609; // Convert to miles
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  var R = 6371; // Earth's radius in km
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// =============== SERVICE TYPE DETECTION =================
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
  // Simple address extraction - looks for street patterns
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

// =============== VALIDATION UTILITIES =================
function isValidEmail_(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone_(phone) {
  var phoneRegex = /^\+?1?\d{10,14}$/;
  var cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  return phoneRegex.test(cleaned);
}

// =============== ADMIN ASSIGNMENT =================
function handleAdminAssign_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  var reason = payload.override_reason || "Manual assignment";
  
  if (!jobId || !helperId) {
    return jsonResponse_({ success: false, error: "Missing job_id or helper_id" });
  }
  
  assignJobToHelper_(jobId, helperId);
  
  // Log admin override
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var jobsSheet = ss.getSheetByName("Jobs");
  var values = jobsSheet.getDataRange().getValues();
  var header = values[0];
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][header.indexOf("Job ID")] === jobId) {
      var notes = "Admin override: " + reason + " at " + new Date().toISOString();
      jobsSheet.getRange(i + 1, header.indexOf("Admin Notes") + 1).setValue(notes);
      break;
    }
  }
  
  notifyCustomerHelperAssigned_(jobId, helperId);
  
  // Notify the assigned helper
  var helper = getHelperById_(helperId);
  var job = getJobById_(jobId);
  
  if (helper && job) {
    var message = "You've been assigned to job #" + jobId + "!\n\n" +
      "Service: " + job.service_type + "\n" +
      "Date: " + job.date + "\n" +
      "Time: " + job.time_window + "\n" +
      "Payment: $" + Math.round(job.price_low * HELPER_COMMISSION_RATE) + "-$" + Math.round(job.price_high * HELPER_COMMISSION_RATE);
    
    sendSMS_(helper.phone, message);
  }
  
  return jsonResponse_({
    success: true,
    message: "Job manually assigned to helper"
  });
}

/****************************************************
 * END OF NEIGHBORTASK BACKEND v5.0 - CORRECTED
 ****************************************************/
