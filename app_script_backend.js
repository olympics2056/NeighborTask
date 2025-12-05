/****************************************************
 * NeighborTask Backend v6.0 - COMPLETE PRODUCTION VERSION
 * All functions included, all APIs integrated, ready for deployment
 * 
 * Required Script Properties:
 * - SHEET_ID: Your Google Sheet ID
 * - OPENAI_API_KEY: OpenAI API key
 * - Maps_API_KEY: Google Maps API key
 * - WEATHER_API_KEY: OpenWeatherMap API key
 * - RapidAPI-Key: RapidAPI key for property data
 * - TWILIO_ACCOUNT_SID: Twilio account SID
 * - TWILIO_AUTH_TOKEN: Twilio auth token
 * - TWILIO_PHONE_NUMBER: Twilio phone number
 * - ADMIN_EMAIL: Admin email for notifications
 * - STRIPE_SECRET_KEY: Stripe key for payments (optional)
 ****************************************************/

// =============== CONFIG =========================
var SHEET_ID = "1yyD9xQD4_CAYiqW954nl8yinqRwQf82pTcA56vwefjo";
var MODEL_NAME = "gpt-4o";

// Service type mappings
var SERVICE_TYPES = {
  "snow": "snow_removal",
  "shovel": "snow_removal",
  "plow": "snow_removal",
  "lawn": "lawn_care",
  "mow": "lawn_care",
  "grass": "lawn_care",
  "clean": "house_cleaning",
  "house cleaning": "house_cleaning",
  "vacuum": "house_cleaning",
  "electrical": "electrical",
  "electrician": "electrical",
  "plumbing": "plumbing",
  "plumber": "plumbing",
  "dog": "dog_walking",
  "walk": "dog_walking",
  "pet": "dog_walking",
  "holiday": "holiday_lights",
  "lights": "holiday_lights",
  "christmas": "holiday_lights"
};

// Service risk levels
var SERVICE_RISK = {
  snow_removal: { risk: "low", verification: false },
  lawn_care: { risk: "low", verification: false },
  house_cleaning: { risk: "medium", verification: true },
  dog_walking: { risk: "medium", verification: true },
  electrical: { risk: "high", verification: true },
  plumbing: { risk: "high", verification: true },
  holiday_lights: { risk: "medium", verification: false }
};

// Service requirements for equipment/certification
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
    equipment: ["leash", "waste_bags"],
    photos_required: false,
    certification: false
  },
  holiday_lights: {
    equipment: ["ladder", "lights", "extension_cords"],
    photos_required: true,
    certification: false
  }
};

// =============== MAIN ENDPOINT =================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return _json({ success: false, error: "No request body" });
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "chat";
    
    switch(action) {
      case "chat":
        return handleIntelligentChat_(payload);
      case "reverse_geocode": // <--- ADD THIS CASE
        return handleReverseGeocode_(payload);
      case "upload_equipment_photo":
        return handleEquipmentPhotoUpload_(payload);
      case "verify_certificate":
        return handleCertificateVerification_(payload);
      case "helper_respond":
        return handleHelperJobResponse_(payload);
      case "escalate_job":
        return handleJobEscalation_(payload);
      case "admin_assign":
        return handleAdminAssign_(payload);
      default:
        return _json({ success: false, error: "Unknown action" });
    }
  } catch (err) {
    Logger.log("doPost error: " + err);
    return _json({ success: false, error: String(err) });
  }
}

function _json(obj) {
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
      intelligence.schematic_type = determineSchematicNeeded_(ctx.service_type, intelligence.property_data);
    } catch (err) {
      Logger.log("Property enrichment error: " + err);
    }
  } else if (ctx.property_verified && ctx.property_data) {
    intelligence.property_data = ctx.property_data;
  }
  
  // 3. Get weather if we have location and service type
  if (ctx.property_data && ctx.service_type) {
    var needsWeather = ["snow_removal", "lawn_care", "dog_walking", "holiday_lights"].indexOf(ctx.service_type) !== -1;
    if (needsWeather && ctx.service_date) {
      intelligence.weather_data = getWeatherForecast_(
        ctx.property_data.location.lat,
        ctx.property_data.location.lng,
        ctx.service_date
      );
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
  if (mode === "customer" && ctx.ready_for_matching) {
    intelligence.available_helpers = findMatchingHelpers_({
      service_type: ctx.service_type,
      lat: ctx.property_data.location.lat,
      lng: ctx.property_data.location.lng,
      date: ctx.service_date,
      time: ctx.service_time
    });
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
    if (!ctx.service_history) missing.push("service_history");
    if (!ctx.insurance_info) missing.push("insurance_info");
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
  var aiReply = callOpenAIChat(conversationMessages);
  
  // Extract information from user's response
  ctx = extractInfoFromResponse_(message, ctx, intelligence);
  
  // Handle property verification
  if (intelligence.property_data && !ctx.property_verified) {
    // Wait for user confirmation before setting property data
    if (ctx.property_verified) {
      ctx.property_data = intelligence.property_data;
    }
  }
  
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
  
  return _json({
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
      lines.push("⚠️ IMPORTANT: User has NOT confirmed this property data yet!");
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
  
  var aiReply = callOpenAIChat(conversationMessages);
  
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
  
  return _json({
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
    "9. Experience: Past service history, references",
    "10. Insurance: Liability insurance (if applicable)",
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
          lines.push("⚠️ Must upload equipment photos");
        }
        if (req.certification) {
          lines.push("⚠️ Must provide " + req.certification_type + " license");
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

// =============== REAL API IMPLEMENTATIONS =================

// 1. REAL GOOGLE MAPS GEOCODING
function getLocationInfo_(address) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("Maps_API_KEY");
  
  // FIX: Do not return fake data if key is missing.
  if (!apiKey) {
    throw new Error("Maps_API_KEY is missing in Script Properties.");
  }

  var url = "https://maps.googleapis.com/maps/api/geocode/json?address=" + 
            encodeURIComponent(address) + "&key=" + apiKey;
            
  try {
    var response = UrlFetchApp.fetch(url);
    var json = JSON.parse(response.getContentText());

    if (json.status !== "OK" || json.results.length === 0) {
       // Return the input address if Google can't find it, rather than a fake one
       return { formatted_address: address, lat: null, lng: null, zipcode: null }; 
    }

    var result = json.results[0];
    var loc = result.geometry.location;
    var zip = "", city = "", state = "", neighborhood = "";
    
    result.address_components.forEach(function(comp) {
      if (comp.types.includes("postal_code")) zip = comp.short_name;
      if (comp.types.includes("locality")) city = comp.short_name;
      if (comp.types.includes("administrative_area_level_1")) state = comp.short_name;
      if (comp.types.includes("neighborhood")) neighborhood = comp.short_name;
    });

    return {
      lat: loc.lat,
      lng: loc.lng,
      zipcode: zip,
      city: city,
      state: state,
      neighborhood: neighborhood || city,
      formatted_address: result.formatted_address
    };
  } catch (err) {
    Logger.log("Geocoding error: " + err);
    // Return raw input on error so the AI knows what the user typed
    return { formatted_address: address, lat: null, lng: null }; 
  }
}

// 2. REAL PROPERTY ENRICHMENT
function getEnrichedPropertyData_(address) {
  // 1. Get accurate location first
  var location = getLocationInfo_(address);
  
  // If Geocoding failed, we cannot get property data. Return basic info.
  if (!location.lat) {
     return {
       address: address,
       location: location,
       error: "Could not locate address"
     };
  }

  var rapidApiKey = PropertiesService.getScriptProperties().getProperty("RapidAPI-Key");
  
  // 2. Initialize with NULL values (No more fake 2000 sqft defaults)
  var propertyData = {
    address: location.formatted_address,
    location: location,
    home_type: null,
    square_feet: null,
    bedrooms: null,
    bathrooms: null,
    stories: null,
    lot_size_sqft: null,
    yard_sqft: null,
    driveway_type: "paved", // Safe assumption
    driveway_length_ft: null,
    garage_spaces: null,
    corner_lot: false
  };
  
  if (rapidApiKey) {
    try {
      var url = "https://realty-mole-property-api.p.rapidapi.com/properties";
      var options = {
        method: "get",
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host": "realty-mole-property-api.p.rapidapi.com"
        },
        muteHttpExceptions: true
      };
      
      var searchUrl = url + "?address=" + encodeURIComponent(location.formatted_address);
      var response = UrlFetchApp.fetch(searchUrl, options);
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        if (data && data[0]) {
          var prop = data[0];
          // Only overwrite if data exists
          if (prop.squareFootage) propertyData.square_feet = prop.squareFootage;
          if (prop.bedrooms) propertyData.bedrooms = prop.bedrooms;
          if (prop.bathrooms) propertyData.bathrooms = prop.bathrooms;
          if (prop.lotSize) propertyData.lot_size_sqft = prop.lotSize;
          if (prop.propertyType) propertyData.home_type = prop.propertyType;
          propertyData.stories = prop.stories || 1; 
          
          if (prop.lotSize && prop.squareFootage) {
            propertyData.yard_sqft = prop.lotSize - (prop.squareFootage * 1.2);
          }
        }
      }
    } catch (err) {
      Logger.log("RapidAPI property lookup error: " + err);
    }
  }
  
  // Estimate driveway only if we have square footage, otherwise leave null
  if (propertyData.square_feet) {
      propertyData.driveway_length_ft = Math.floor(40 + (propertyData.square_feet / 100));
      propertyData.garage_spaces = propertyData.square_feet > 2500 ? 3 : 2;
  }
  
  return propertyData;
}

// 3. REAL WEATHER API
function getWeatherForecast_(lat, lng, date) {
  var weatherApiKey = PropertiesService.getScriptProperties().getProperty("WEATHER_API_KEY");
  
  // FIX: Return null if no key, don't fake the weather
  if (!weatherApiKey) return null;
  
  try {
    var targetDate = new Date(date);
    var today = new Date();
    var daysFromNow = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
    
    var weatherData = {
      date: date,
      temp: null,
      condition: null,
      snow_depth: 0,
      wind_speed: null,
      precipitation_chance: 0
    };
    
    if (daysFromNow <= 0) {
      // Current weather
      var currentUrl = "https://api.openweathermap.org/data/2.5/weather?lat=" + lat + 
                      "&lon=" + lng + "&appid=" + weatherApiKey + "&units=imperial";
      var response = UrlFetchApp.fetch(currentUrl);
      var data = JSON.parse(response.getContentText());
      
      weatherData.temp = Math.round(data.main.temp);
      weatherData.condition = data.weather[0].main.toLowerCase();
      weatherData.wind_speed = Math.round(data.wind.speed);
      
      if (data.snow && data.snow["1h"]) {
        weatherData.snow_depth = Math.round(data.snow["1h"] * 0.39);
      }
      
      if (data.rain || data.snow) {
        weatherData.precipitation_chance = 100;
      }
      
    } else if (daysFromNow <= 5) {
      // 5-day forecast
      var forecastUrl = "https://api.openweathermap.org/data/2.5/forecast?lat=" + lat + 
                       "&lon=" + lng + "&appid=" + weatherApiKey + "&units=imperial";
      var response = UrlFetchApp.fetch(forecastUrl);
      var data = JSON.parse(response.getContentText());
      
      var targetTimestamp = targetDate.getTime() / 1000;
      var closestForecast = null;
      var minDiff = Infinity;
      
      data.list.forEach(function(forecast) {
        var diff = Math.abs(forecast.dt - targetTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestForecast = forecast;
        }
      });
      
      if (closestForecast) {
        weatherData.temp = Math.round(closestForecast.main.temp);
        weatherData.condition = closestForecast.weather[0].main.toLowerCase();
        weatherData.wind_speed = Math.round(closestForecast.wind.speed);
        weatherData.precipitation_chance = closestForecast.pop * 100;
        
        if (closestForecast.snow && closestForecast.snow["3h"]) {
          weatherData.snow_depth = Math.round(closestForecast.snow["3h"] * 0.39 / 3);
        }
      }
    } else {
        // Too far in future
        return null;
    }
    
    return weatherData;
    
  } catch (err) {
    Logger.log("Weather API error: " + err);
    return null; // Return null on error so AI doesn't hallucinate
  }
}
// 4. MARKET BENCHMARKS WITH ZIP CODE ADJUSTMENTS
function getMarketBenchmark_(serviceType, zipcode) {
  var basePricing = {
    snow_removal: { base_low: 40, base_high: 80 },
    lawn_care: { base_low: 30, base_high: 60 },
    house_cleaning: { base_low: 80, base_high: 150 },
    dog_walking: { base_low: 20, base_high: 40 },
    electrical: { base_low: 75, base_high: 150 },
    plumbing: { base_low: 85, base_high: 175 },
    holiday_lights: { base_low: 100, base_high: 250 }
  };
  
  var pricing = basePricing[serviceType] || { base_low: 50, base_high: 100 };
  
  var costAdjustment = getZipCodeCostAdjustment_(zipcode);
  
  return {
    base_low: Math.round(pricing.base_low * costAdjustment),
    base_high: Math.round(pricing.base_high * costAdjustment),
    base_mid: Math.round((pricing.base_low + pricing.base_high) / 2 * costAdjustment),
    adjustment_factor: costAdjustment
  };
}

function getZipCodeCostAdjustment_(zipcode) {
  if (!zipcode) return 1.0;
  
  var highCostZips = ["94", "10", "11", "02", "90", "92"];
  var medHighCostZips = ["60", "20", "22", "98", "80"];
  var lowCostZips = ["35", "36", "37", "38", "39", "71", "72", "73"];
  
  var prefix = zipcode.substring(0, 2);
  
  if (highCostZips.indexOf(prefix) !== -1) {
    return 1.4;
  } else if (medHighCostZips.indexOf(prefix) !== -1) {
    return 1.2;
  } else if (lowCostZips.indexOf(prefix) !== -1) {
    return 0.85;
  }
  
  return 1.0;
}

// =============== SCHEMATIC GENERATION =================

function generateSchematicData_(ctx, intelligence) {
  // strictly require property data and location to generate a schematic
  if (!ctx.property_data || !ctx.service_type || !ctx.property_data.location) return null;
  
  var apiKey = PropertiesService.getScriptProperties().getProperty("Maps_API_KEY");
  if (!apiKey) return null;

  var lat = ctx.property_data.location.lat;
  var lng = ctx.property_data.location.lng;
  
  var data = {
    type: null,
    map_image: null, // New field for the visual component
    property: ctx.property_data,
    service: ctx.service_type,
    scope: {}
  };
  
  // Base Map URL construction helpers
  var baseStaticMap = "https://maps.googleapis.com/maps/api/staticmap?center=" + lat + "," + lng + "&size=600x300&key=" + apiKey;
  var baseStreetView = "https://maps.googleapis.com/maps/api/streetview?size=600x300&location=" + lat + "," + lng + "&key=" + apiKey;

  switch (ctx.service_type) {
    case "snow_removal":
      data.type = "snow_removal_schematic";
      // Hybrid view, Zoom 20 (very close) to see driveway details clearly
      data.map_image = baseStaticMap + "&zoom=20&maptype=hybrid";
      
      data.scope = {
        // Use RapidAPI data if available, fall back to calculation based on House SqFt, fall back to default
        driveway_length: ctx.property_data.driveway_length_ft || 
                        (ctx.property_data.square_feet ? Math.floor(40 + (ctx.property_data.square_feet/100)) : 50),
        
        // Estimate width based on garage spaces (9ft per car standard)
        garage_spaces: ctx.property_data.garage_spaces || (ctx.property_data.square_feet > 2500 ? 3 : 2),
        driveway_width: (ctx.property_data.garage_spaces || 2) * 10, // 10ft clearance per car
        
        include_walkway: ctx.include_walkway,
        walkway_length: ctx.include_walkway ? 30 : 0, // Standard avg
        include_deck: ctx.include_deck,
        snow_depth: ctx.snow_depth,
        corner_lot: ctx.property_data.corner_lot
      };
      break;
      
    case "lawn_care":
      data.type = "lot_layout_schematic";
      // Hybrid view, Zoom 19 to see property lines/fences
      data.map_image = baseStaticMap + "&zoom=19&maptype=hybrid";
      
      data.scope = {
        lot_size_sqft: ctx.property_data.lot_size_sqft,
        // Estimate footprint: Sqft / stories * buffer
        house_footprint: Math.floor((ctx.property_data.square_feet / (ctx.property_data.stories || 1)) * 1.2),
        // Yard is Lot - Footprint - Driveway
        yard_sqft: ctx.property_data.yard_sqft || (ctx.property_data.lot_size_sqft - (ctx.property_data.square_feet/ctx.property_data.stories)),
        corner_lot: ctx.property_data.corner_lot,
        driveway: ctx.property_data.driveway_type,
        slope: "moderate"
      };
      break;
      
    case "house_cleaning":
      data.type = "room_layout_schematic";
      // Roadmap view, Zoom 20 to show building outline/access
      data.map_image = baseStaticMap + "&zoom=20&maptype=roadmap";
      
      data.scope = {
        sqft: ctx.property_data.square_feet,
        bedrooms: ctx.property_data.bedrooms,
        bathrooms: ctx.property_data.bathrooms,
        stories: ctx.property_data.stories,
        kitchen: true, // All houses have kitchens
        living_room: true,
        has_pets: ctx.has_pets,
        cleaning_type: ctx.cleaning_type || "standard"
      };
      break;
      
    case "dog_walking":
      data.type = "walking_route_schematic";
      // Roadmap view, Zoom 15 (Neighborhood level)
      data.map_image = baseStaticMap + "&zoom=15&maptype=roadmap";
      
      if (ctx.walk_duration) {
        data.scope = {
          duration: ctx.walk_duration,
          // Avg walking speed 3mph (approx 0.05 miles per min)
          distance_est_miles: (parseInt(ctx.walk_duration) * 0.05).toFixed(1),
          start_location: {
            lat: ctx.property_data.location.lat,
            lng: ctx.property_data.location.lng
          },
          route_type: "neighborhood_loop"
        };
      }
      break;
      
    case "holiday_lights":
      data.type = "house_exterior_schematic";
      // USE STREET VIEW for lights to see roofline/height
      data.map_image = baseStreetView;
      
      var stories = ctx.property_data.stories || 1;
      var sqft = ctx.property_data.square_feet || 2000;
      
      data.scope = {
        stories: stories,
        // Estimation logic: sqrt of footprint * 4 sides * complexity factor
        roofline_ft: Math.floor(Math.sqrt(sqft/stories) * 4 * 1.2),
        gutter_ft: Math.floor(Math.sqrt(sqft/stories) * 2), // Front and back usually
        trees: 2, // Default placeholder
        bushes: 4
      };
      break;
  }
  
  return data;
}
// =============== HELPER PROFILE MANAGEMENT =================

function saveHelperToSheet_(ctx) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    sheet = ss.insertSheet("Helpers");
    sheet.appendRow([
      "Helper ID", "Helper Name", "Helper Email", "Helper Phone",
      "Helper Address", "Helper Lat", "Helper Lng", "Zipcode",
      "Service Radius", "Services JSON", "Helper Rate", "Rating",
      "Verified", "Available Now", "Equipment Photos URLs", "Certifications JSON",
      "Insurance Info", "Service History", "Availability Schedule",
      "Created At", "Last Active", "Total Jobs", "Average Response Time"
    ]);
  }
  
  var helperId = "HELPER_" + Date.now();
  var now = new Date().toISOString();
  
  sheet.appendRow([
    helperId,
    ctx.helper_name,
    ctx.helper_email,
    ctx.helper_phone,
    ctx.helper_address,
    ctx.helper_lat || "",
    ctx.helper_lng || "",
    ctx.helper_zipcode || "",
    ctx.service_radius,
    JSON.stringify(ctx.helper_services || []),
    ctx.helper_rate,
    0,
    false,
    true,
    JSON.stringify(ctx.equipment_photos || {}),
    JSON.stringify(ctx.certifications || []),
    ctx.insurance_info || "",
    ctx.service_history || "",
    JSON.stringify(ctx.availability_schedule || {}),
    now,
    now,
    0,
    0
  ]);
  
  return helperId;
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
    JSON.stringify(intelligence.weather_data),
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
  
  logMatchesToSheet_(jobId, helpers);
  
  var topHelpers = helpers.slice(0, 5);
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
}

// =============== NOTIFICATION SYSTEM =================

function notifyHelperOfJob_(helper, jobId, jobContext) {
  var priceLow = jobContext.price_low || 50;
  var priceHigh = jobContext.price_high || 75;
  
  var message = "🍌 NeighborTask: New job opportunity!\n\n" +
    jobContext.service_type.replace(/_/g, " ") + " - " + 
    helper.distance_miles.toFixed(1) + " mi from you\n" +
    "Est. $" + priceLow + "-$" + priceHigh + "\n" +
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
    "Estimated Pay: $" + (priceLow * 0.85).toFixed(2) + "-$" + (priceHigh * 0.85).toFixed(2) + "\n\n" +
    "Log in to accept or decline: https://app.neighbortask.com/jobs/" + jobId;
  
  sendEmail_(helper.email, "New Job Match - " + jobId, emailBody);
  
  logCommunication_(jobId, helper.helper_id, null, "SMS", "Outbound", message);
  logCommunication_(jobId, helper.helper_id, null, "Email", "Outbound", emailBody);
}

function sendSMS_(to, message) {
  var accountSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var authToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var fromNumber = PropertiesService.getScriptProperties().getProperty("TWILIO_PHONE_NUMBER");
  
  if (!accountSid || !authToken) {
    Logger.log("Twilio not configured, skipping SMS to: " + to);
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
  var response = payload.response;
  
  updateMatchResponse_(jobId, helperId, response);
  
  if (response === "accept") {
    assignJobToHelper_(jobId, helperId);
    notifyCustomerHelperAssigned_(jobId, helperId);
    notifyOtherHelpersFilled_(jobId, helperId);
    
    return _json({ success: true, message: "Job assigned successfully", job_id: jobId });
  } else {
    return _json({ success: true, message: "Response recorded" });
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
  
  var message = "🎉 Great news! " + helper.name + " accepted your job!\n\n" +
    "Rating: " + (helper.rating || "New") + "⭐\n" +
    "Distance: " + calculateDistance_(job.lat, job.lng, helper.center_lat, helper.center_lng).toFixed(1) + " miles\n" +
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
  var props = PropertiesService.getScriptProperties();
  var escalationData = props.getProperty("ESCALATION_JOBS") || "{}";
  var escalations = JSON.parse(escalationData);
  
  escalations[jobId] = new Date().getTime() + (10 * 60 * 1000);
  
  props.setProperty("ESCALATION_JOBS", JSON.stringify(escalations));
  
  var triggers = ScriptApp.getProjectTriggers();
  var hasEscalationTrigger = false;
  
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "checkAllJobsForEscalation_") {
      hasEscalationTrigger = true;
    }
  });
  
  if (!hasEscalationTrigger) {
    ScriptApp.newTrigger("checkAllJobsForEscalation_")
      .timeBased()
      .everyMinutes(1)
      .create();
  }
}

function checkAllJobsForEscalation_() {
  var props = PropertiesService.getScriptProperties();
  var escalationData = props.getProperty("ESCALATION_JOBS") || "{}";
  var escalations = JSON.parse(escalationData);
  
  var now = new Date().getTime();
  var jobsToEscalate = [];
  var updatedEscalations = {};
  
  for (var jobId in escalations) {
    if (escalations[jobId] <= now) {
      jobsToEscalate.push(jobId);
    } else {
      updatedEscalations[jobId] = escalations[jobId];
    }
  }
  
  props.setProperty("ESCALATION_JOBS", JSON.stringify(updatedEscalations));
  
  jobsToEscalate.forEach(function(jobId) {
    var job = getJobById_(jobId);
    if (job && job.status === "MATCHING" && !job.escalated) {
      escalateJob_(jobId);
    }
  });
}

function escalateJob_(jobId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return;
  
  var job = getJobById_(jobId);
  if (!job) return;
  
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var rowIndex = -1;
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][header.indexOf("Job ID")] === jobId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return;
  
  var priceLow = parseFloat(job.price_low) * 1.15;
  var priceHigh = parseFloat(job.price_high) * 1.15;
  var increase = Math.round((priceLow + priceHigh) / 2 - (parseFloat(job.price_low) + parseFloat(job.price_high)) / 2);
  
  sheet.getRange(rowIndex, header.indexOf("Price Low") + 1).setValue(Math.round(priceLow));
  sheet.getRange(rowIndex, header.indexOf("Price High") + 1).setValue(Math.round(priceHigh));
  sheet.getRange(rowIndex, header.indexOf("Escalated") + 1).setValue(true);
  sheet.getRange(rowIndex, header.indexOf("Escalation Price Increase") + 1).setValue(increase);
  sheet.getRange(rowIndex, header.indexOf("Match Attempts") + 1).setValue(2);
  
  var allHelpers = findMatchingHelpers_({
    service_type: job.service_type,
    lat: parseFloat(job.lat),
    lng: parseFloat(job.lng),
    date: job.date,
    time: job.time_window
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
  
  var message = "We're expanding your search with premium pricing (+$" + increase + ") to find the perfect helper. " +
    "You'll only be charged the new rate if accepted.";
  sendSMS_(job.customer_phone, message);
  
  logCommunication_(jobId, null, job.customer_email, "SMS", "Outbound", message);
}

function handleJobEscalation_(payload) {
  var jobId = payload.job_id;
  escalateJob_(jobId);
  return _json({ success: true, message: "Job escalated" });
}

// =============== EQUIPMENT & CERTIFICATION =================

function handleEquipmentPhotoUpload_(payload) {
  var helperId = payload.helper_id || payload.user_id;
  var serviceType = payload.service_type || payload.photo_type;
  var photoData = payload.photo_data;
  var fileName = payload.file_name;
  
  var folder = getHelperFolder_(helperId);
  var equipmentFolder = getOrCreateFolder_(folder, "equipment");
  
  var blob = Utilities.newBlob(
    Utilities.base64Decode(photoData),
    'image/jpeg',
    fileName
  );
  
  var file = equipmentFolder.createFile(blob);
  var fileUrl = file.getUrl();
  
  updateHelperEquipment_(helperId, serviceType, fileUrl);
  
  return _json({
    success: true,
    file_url: fileUrl,
    message: "Equipment photo uploaded successfully"
  });
}

function handleCertificateVerification_(payload) {
  var helperId = payload.helper_id;
  var certificateType = payload.certificate_type;
  var licenseNumber = payload.license_number;
  var expirationDate = payload.expiration_date;
  var photoData = payload.photo_data;
  
  var folder = getHelperFolder_(helperId);
  var certFolder = getOrCreateFolder_(folder, "certificates");
  
  var blob = Utilities.newBlob(
    Utilities.base64Decode(photoData),
    'image/jpeg',
    certificateType + "_" + licenseNumber + ".jpg"
  );
  
  var file = certFolder.createFile(blob);
  var fileUrl = file.getUrl();
  
  updateHelperCertification_(helperId, {
    type: certificateType,
    license_number: licenseNumber,
    expiration_date: expirationDate,
    photo_url: fileUrl,
    verified: false,
    verified_date: null
  });
  
  notifyAdminCertificateReview_(helperId, certificateType, licenseNumber);
  
  return _json({
    success: true,
    message: "Certificate submitted for verification. You'll be notified within 1-2 business days."
  });
}

// =============== UTILITY FUNCTIONS =================

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
      var photosObj = {};
      try {
        photosObj = JSON.parse(currentPhotos);
      } catch (e) {
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
      var certsArray = [];
      try {
        certsArray = JSON.parse(currentCerts);
      } catch (e) {
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

// =============== DATA RETRIEVAL FUNCTIONS =================

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
        helper[col.toLowerCase().replace(/\s/g, '_').replace(/\(/g, '').replace(/\)/g, '')] = values[i][idx];
      });
      
      try {
        if (helper.services_json) helper.services = JSON.parse(helper.services_json);
        if (helper.certifications_json) helper.certifications = JSON.parse(helper.certifications_json);
        if (helper.equipment_photos_urls) helper.equipment_photos = JSON.parse(helper.equipment_photos_urls);
      } catch (e) {
        Logger.log("Error parsing helper JSON: " + e);
      }
      
      helper.name = helper.helper_name;
      helper.email = helper.helper_email;
      helper.phone = helper.helper_phone;
      helper.center_lat = helper.helper_lat;
      helper.center_lng = helper.helper_lng;
      
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
        job[col.toLowerCase().replace(/\s/g, '_')] = values[i][idx];
      });
      
      try {
        if (job.scope_json) job.scope = JSON.parse(job.scope_json);
        if (job.property_data_json) job.property_data = JSON.parse(job.property_data_json);
        if (job.weather_json) job.weather = JSON.parse(job.weather_json);
      } catch (e) {
        Logger.log("Error parsing job JSON: " + e);
      }
      
      return job;
    }
  }
  return null;
}

function calculateDistance_(lat1, lng1, lat2, lng2) {
  return haversineKm_(lat1, lng1, lat2, lng2) / 1.609;
}

function calculateIntelligentQuote_(ctx, intelligence) {
  var benchmarks = intelligence.market_benchmarks || { base_low: 50, base_high: 100 };
  var base = (benchmarks.base_low + benchmarks.base_high) / 2;
  var adjustments = 1.0;
  
  // Property factors
  if (ctx.property_data) {
    if (ctx.property_data.driveway_length_ft > 60) adjustments += 0.2;
    if (ctx.property_data.corner_lot) adjustments += 0.1;
    if (ctx.property_data.stories > 1) adjustments += 0.15;
    if (ctx.property_data.square_feet > 2500) adjustments += 0.2;
  }
  
  // Weather factors (REAL weather data now!)
  if (intelligence.weather_data) {
    if (intelligence.weather_data.snow_depth > 6) adjustments += 0.3;
    if (intelligence.weather_data.temp < 20) adjustments += 0.15;
    if (intelligence.weather_data.wind_speed > 20) adjustments += 0.1;
    if (intelligence.weather_data.precipitation_chance > 70) adjustments += 0.1;
  }
  
  // Urgency factors
  var daysUntilService = 0;
  if (ctx.service_date) {
    daysUntilService = Math.floor((new Date(ctx.service_date) - new Date()) / (1000 * 60 * 60 * 24));
  }
  if (daysUntilService <= 0) adjustments += 0.5;
  else if (daysUntilService <= 1) adjustments += 0.25;
  else if (daysUntilService <= 2) adjustments += 0.1;
  
  // Service-specific adjustments
  if (ctx.service_type === "snow_removal") {
    if (ctx.include_walkway) adjustments += 0.15;
    if (ctx.include_deck) adjustments += 0.2;
    if (ctx.snow_depth > 4) adjustments += 0.1 * (ctx.snow_depth - 4);
  } else if (ctx.service_type === "house_cleaning") {
    if (ctx.has_pets) adjustments += 0.1;
    if (ctx.cleaning_type === "deep") adjustments += 0.3;
    if (ctx.bring_supplies === false) adjustments -= 0.15;
  }
  
  var low = Math.round(base * adjustments * 0.9);
  var high = Math.round(base * adjustments * 1.15);
  
  return {
    price_low: Math.max(20, low),
    price_high: Math.max(30, high),
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
      if (dateMatch) ctx.service_date = dateMatch[0];
      else {
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
  if (lower.includes("yes") || lower.includes("correct") || lower.includes("confirm") || lower.includes("that's right")) {
    if (intelligence.property_data && !ctx.property_verified) {
      ctx.property_verified = true;
      ctx.property_data = intelligence.property_data;
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
  
  // Extract name
  if (!emailMatch && !phoneMatch && !ctx.customer_name) {
    var words = message.trim().split(' ');
    if (words.length <= 4 && words.length >= 2) {
      var possibleName = true;
      words.forEach(function(word) {
        if (word.length < 2 || !/^[A-Za-z]+$/.test(word)) {
          possibleName = false;
        }
      });
      if (possibleName) {
        ctx.customer_name = message.trim();
      }
    }
  }
  
  // Check if ready for matching
  if (ctx.customer_email && ctx.customer_phone && ctx.customer_name && 
      ctx.scope_confirmed && ctx.property_verified) {
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
  if (!ctx.helper_name && !emailMatch && !phoneMatch) {
    var words = message.trim().split(' ');
    if (words.length <= 4 && words.length >= 2) {
      var possibleName = true;
      words.forEach(function(word) {
        if (word.length < 2 || !/^[A-Za-z]+$/.test(word)) {
          possibleName = false;
        }
      });
      if (possibleName) {
        ctx.helper_name = message.trim();
      }
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
// =============== GET REQUEST HANDLER (Browser Check) =================

function doGet(e) {
  // This function runs when you visit the script URL in a browser
  return ContentService.createTextOutput("✅ NeighborTask Backend v6.0 is ONLINE.\n\nSend POST requests to interact with the AI.");
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

// =============== ADMIN FUNCTIONS =================

function handleAdminAssign_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  var reason = payload.override_reason || "Manual assignment";
  
  assignJobToHelper_(jobId, helperId);
  
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
  
  var helper = getHelperById_(helperId);
  var job = getJobById_(jobId);
  if (helper && job) {
    var message = "You've been assigned to job #" + jobId + "!\n\n" +
      "Service: " + job.service_type + "\n" +
      "Date: " + job.date + "\n" +
      "Time: " + job.time_window + "\n" +
      "Payment: $" + (parseFloat(job.price_low) * 0.85).toFixed(2) + "-$" + (parseFloat(job.price_high) * 0.85).toFixed(2);
    
    sendSMS_(helper.phone, message);
  }
  
  return _json({
    success: true,
    message: "Job manually assigned to helper"
  });
}

// =============== HELPER MATCHING FUNCTIONS =================

function findMatchingHelpers_(params) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return [];
  
  var helpers = [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  var header = values[0];
  
  for (var i = 1; i < values.length; i++) {
    var helper = {};
    header.forEach(function(col, idx) {
      var key = col.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
      helper[key] = values[i][idx];
    });
    
    // Check if helper provides this service
    var services = [];
    try {
      if (helper.services_json) {
        services = JSON.parse(helper.services_json);
      }
    } catch (e) {
      continue;
    }
    
    if (services.indexOf(params.service_type) === -1) continue;
    
    // Calculate distance
    var helperLat = parseFloat(helper.helper_lat || 0);
    var helperLng = parseFloat(helper.helper_lng || 0);
    
    if (!helperLat || !helperLng) continue;
    
    var distance = haversineKm_(
      params.lat, 
      params.lng, 
      helperLat,
      helperLng
    ) / 1.609;
    
    // Check if within service radius
    var radius = parseFloat(helper.service_radius || 10);
    if (distance > radius) continue;
    
    // Check availability
    if (!isHelperAvailable_(helper, params.date, params.time)) continue;
    
    // Calculate match score
    var score = calculateMatchScore_(helper, params, distance);
    
    helpers.push({
      helper_id: helper.helper_id,
      name: helper.helper_name,
      email: helper.helper_email,
      phone: helper.helper_phone,
      distance_miles: distance,
      match_score: score,
      rate: helper.helper_rate,
      rating: helper.rating || "New",
      total_jobs: helper.total_jobs || 0,
      center_lat: helperLat,
      center_lng: helperLng
    });
  }
  
  // Sort by match score
  helpers.sort(function(a, b) {
    return b.match_score - a.match_score;
  });
  
  return helpers;
}

function isHelperAvailable_(helper, date, timeWindow) {
  if (!helper.availability_schedule) return true;
  
  try {
    var schedule = JSON.parse(helper.availability_schedule);
    var requestDate = new Date(date);
    var dayOfWeek = requestDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    if (schedule[dayOfWeek] === false) return false;
    
    if (schedule.blackout_dates && schedule.blackout_dates.indexOf(date) !== -1) {
      return false;
    }
    
    return true;
  } catch (e) {
    return true;
  }
}

function calculateMatchScore_(helper, params, distance) {
  var score = 100;
  
  score -= Math.min(50, distance * 2);
  
  var rating = parseFloat(helper.rating || 0);
  score += rating * 4;
  
  var totalJobs = parseInt(helper.total_jobs || 0);
  score += Math.min(15, totalJobs / 10);
  
  if (helper.available_now === true || helper.available_now === "true") {
    score += 15;
  }
  
  if (helper.verified === true || helper.verified === "true") {
    score += 10;
  }
  
  var avgResponseTime = parseFloat(helper.average_response_time || 60);
  if (avgResponseTime < 30) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

// =============== UTILITY HELPER FUNCTIONS =================

function detectServiceType_(message) {
  var lower = message.toLowerCase();
  for (var key in SERVICE_TYPES) {
    if (lower.includes(key)) {
      return SERVICE_TYPES[key];
    }
  }
  return null;
}

function extractAddress_(message) {
  var patterns = [
    /\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Boulevard|Blvd)/i,
    /\d+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Boulevard|Blvd)/i,
    /\d+\s+\w+\s+\w+,\s*\w+,\s*\w{2}\s+\d{5}/
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = message.match(patterns[i]);
    if (match) {
      return match[0];
    }
  }
  return null;
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

function determineSchematicNeeded_(serviceType, propertyData) {
  if (!serviceType || !propertyData) return null;
  
  var schematicTypes = {
    snow_removal: "driveway_layout",
    lawn_care: "yard_layout",
    house_cleaning: "room_layout",
    dog_walking: "route_map",
    holiday_lights: "house_exterior"
  };
  
  return schematicTypes[serviceType] || null;
}

// =============== OPENAI INTEGRATION =================

function callOpenAIChat(messages) {
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

// =============== REVERSE GEOCODING =================

function handleReverseGeocode_(payload) {
  var lat = payload.lat;
  var lng = payload.lng;
  var apiKey = PropertiesService.getScriptProperties().getProperty("Maps_API_KEY");

  if (!apiKey) {
    return _json({ success: false, error: "API Key Missing" });
  }

  // Google Maps Reverse Geocoding Endpoint
  var url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + 
            lat + "," + lng + "&key=" + apiKey;

  try {
    var response = UrlFetchApp.fetch(url);
    var json = JSON.parse(response.getContentText());

    if (json.status === "OK" && json.results.length > 0) {
      // Get the best formatted address
      var result = json.results[0];
      return _json({ 
        success: true, 
        address: result.formatted_address,
        details: result // Return full details if needed
      });
    } else {
      return _json({ success: false, error: "Location not found" });
    }
  } catch (e) {
    return _json({ success: false, error: e.toString() });
  }
}
// =============== END OF FILE =================
// Version 6.0 - COMPLETE Production Backend with Real APIs
// Ready for deployment to Google Apps Script
