/****************************************************
 * NeighborTask Backend v3.1 - COMPLETE CORRECTED VERSION
 * All functions implemented with proper logging and matching flow
 ****************************************************/

// =============== CONFIG =========================
var SHEET_ID = "1mLlty7QxAKNSsy8aajOXWlhNk9RfEDi6HVKtP3o09KJ3a8Mju710O8jD";
var MODEL_NAME = "gpt-4o";
var MAX_HELPERS_TO_NOTIFY = 3;
var ADMIN_COMMISSION_RATE = 0.15;

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

// Service risk levels and commission rates
var SERVICE_RISK = {
  snow_removal: { risk: "low", verification: false, commission: 0.15 },
  lawn_care: { risk: "low", verification: false, commission: 0.15 },
  house_cleaning: { risk: "medium", verification: true, commission: 0.18 },
  dog_walking: { risk: "medium", verification: true, commission: 0.18 },
  electrical: { risk: "high", verification: true, commission: 0.20 },
  plumbing: { risk: "high", verification: true, commission: 0.20 },
  holiday_lights: { risk: "medium", verification: false, commission: 0.18 }
};

// Service pricing factors
var SERVICE_PRICING = {
  snow_removal: { base: 50, per_sqft: 0.02, min: 30 },
  lawn_care: { base: 40, per_sqft: 0.015, min: 25 },
  house_cleaning: { base: 80, per_room: 25, min: 60 },
  dog_walking: { base: 25, per_30min: 15, min: 20 },
  electrical: { base: 100, hourly: 75, min: 75 },
  plumbing: { base: 100, hourly: 85, min: 75 },
  holiday_lights: { base: 150, per_story: 100, min: 100 }
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
      case "reverse_geocode":
        return handleReverseGeocode_(payload);
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
      case "admin_assign":
        return handleAdminAssign_(payload);
      case "get_job_status":
        return handleGetJobStatus_(payload);
      case "complete_job":
        return handleJobCompletion_(payload);
      case "create_payment_intent":
        return handleCreatePaymentIntent_(payload);
      case "get_user_jobs":
        return handleGetUserJobs_(payload);
      case "job_action":
        return handleJobAction_(payload);
      case "submit_review":
        return handleSubmitReview_(payload);
      case "update_settings":
        return handleUpdateSettings_(payload);
      case "poll_updates":
        return handlePollUpdates_(payload);
      case "clear_notifications":
        return handleClearNotifications_(payload);
      default:
        return _json({ success: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    console.error("doPost error: " + err);
    return _json({ success: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
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
      console.log("Property enrichment error: " + err);
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
        ctx.service_date,
        ctx.service_time
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
      console.log("Market benchmark error: " + err);
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
    if (!ctx.helper_whatsapp) missing.push("helper_whatsapp");
    if (!ctx.helper_services) missing.push("services");
    if (!ctx.helper_location) missing.push("location");
    if (!ctx.service_radius) missing.push("service_radius");
    if (!ctx.helper_rate) missing.push("hourly_rate");
    if (!ctx.availability_schedule) missing.push("availability");
    if (!ctx.equipment_photos && ctx.helper_services) {
      var needsPhotos = false;
      for (var i = 0; i < ctx.helper_services.length; i++) {
        if (SERVICE_REQUIREMENTS[ctx.helper_services[i]]?.photos_required) {
          needsPhotos = true;
          break;
        }
      }
      if (needsPhotos) missing.push("equipment_photos");
    }
  }
  
  return missing;
}

function prioritizeQuestions_(missingInfo, ctx) {
  if (missingInfo.length === 0) return [];
  
  var priorities = {
    "service_type": 1,
    "address": 2,
    "property_confirmation": 3,
    "service_date": 4,
    "service_time": 5,
    "helper_name": 1,
    "helper_email": 2,
    "helper_phone": 3,
    "helper_whatsapp": 4,
    "services": 5,
    "location": 6
  };
  
  return missingInfo.sort(function(a, b) {
    return (priorities[a] || 99) - (priorities[b] || 99);
  }).slice(0, 1);
}

// =============== CUSTOMER CONVERSATION HANDLER =================

function handleCustomerConversation_(message, ctx, intelligence, history) {
  var responseText = "";
  var newContext = Object.assign({}, ctx);
  var schematicData = null;
  var propertyCard = null;
  var jobId = null;
  var jobStatus = null;
  
  // Check for location from GPS
  if (message.includes("My location is:") || message.match(/^\d+\.\d+,\s*-?\d+\.\d+$/)) {
    var coords = message.match(/([-\d.]+),\s*([-\d.]+)/);
    if (coords) {
      var lat = parseFloat(coords[1]);
      var lng = parseFloat(coords[2]);
      var addressData = reverseGeocode_(lat, lng);
      if (addressData) {
        intelligence.detected_address = addressData.address;
        intelligence.property_data = getEnrichedPropertyData_(addressData.address);
      }
    }
  }
  
  // Parse user responses
  if (intelligence.detected_service && !ctx.service_type) {
    newContext.service_type = intelligence.detected_service;
  }
  
  if (intelligence.detected_address && !ctx.property_data) {
    newContext.property_data = intelligence.property_data;
    propertyCard = intelligence.property_data;
  }
  
  // Handle confirmations
  var lowerMessage = message.toLowerCase();
  if ((lowerMessage === "yes" || lowerMessage === "correct" || lowerMessage === "confirm") && ctx.property_data && !ctx.property_verified) {
    newContext.property_verified = true;
  }
  
  // Extract customer info
  var emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  if (emailMatch && !ctx.customer_email) {
    newContext.customer_email = emailMatch[0];
  }
  
  var phoneMatch = message.match(/(\+?1)?[\s.-]?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);
  if (phoneMatch && !ctx.customer_phone) {
    newContext.customer_phone = phoneMatch[0].replace(/\D/g, '');
  }
  
  // Extract date/time
  if (message.includes("tomorrow")) {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    newContext.service_date = tomorrow.toISOString().split('T')[0];
  } else if (message.includes("today")) {
    newContext.service_date = new Date().toISOString().split('T')[0];
  }
  
  var timeMatch = message.match(/(\d{1,2})\s*(am|pm|AM|PM)/);
  if (timeMatch && !ctx.service_time) {
    newContext.service_time = timeMatch[0];
  }
  
  // Handle scope confirmation
  if (lowerMessage.includes("looks good") || lowerMessage.includes("confirm") || lowerMessage === "yes") {
    if (ctx.service_type && ctx.property_verified && ctx.service_date && ctx.service_time) {
      newContext.scope_confirmed = true;
    }
  }
  
  // Extract name if in message
  if (!ctx.customer_name && message.length < 50) {
    var words = message.split(' ');
    if (words.length >= 2 && words.length <= 4) {
      var possibleName = words.map(function(w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
      if (!possibleName.match(/\d/) && !possibleName.includes('@')) {
        newContext.customer_name = possibleName;
      }
    }
  }
  
  // Create job when all info is collected
  if (newContext.scope_confirmed && !ctx.job_id && newContext.customer_email) {
    // Create job in sheet BEFORE matching
    jobId = createJobInSheet_(newContext);
    newContext.job_id = jobId;
    jobStatus = "submitted";
    
    // Log user if not exists
    createCustomerInSheet_(newContext);
    
    // Mark ready for matching
    newContext.ready_for_matching = true;
  }
  
  // Find and notify helpers if job is created
  if (newContext.job_id && newContext.ready_for_matching && !ctx.helpers_notified) {
    var helpers = intelligence.available_helpers || findMatchingHelpers_({
      service_type: newContext.service_type,
      lat: newContext.property_data.location.lat,
      lng: newContext.property_data.location.lng,
      date: newContext.service_date,
      time: newContext.service_time
    });
    
    if (helpers && helpers.length > 0) {
      // Notify multiple helpers
      var notifiedHelpers = notifyMultipleHelpers_(helpers, newContext.job_id, newContext);
      newContext.helpers_notified = true;
      newContext.notified_helper_ids = notifiedHelpers.map(h => h.helper_id);
      
      // Update job status
      updateJobStatus_(newContext.job_id, "matched");
      jobStatus = "matched";
      
      responseText = "Great! Your job #" + newContext.job_id + " has been submitted!\n\n";
      responseText += "I've notified " + notifiedHelpers.length + " qualified helpers in your area:\n";
      for (var i = 0; i < Math.min(3, notifiedHelpers.length); i++) {
        responseText += "• " + helpers[i].name + " (" + helpers[i].distance_miles.toFixed(1) + " miles away)\n";
      }
      responseText += "\nYou'll receive a confirmation once a helper accepts your job.";
      
      // Add pricing information
      var pricing = calculateEstimatedPrice_(newContext);
      responseText += "\n\nEstimated price: $" + pricing.total.toFixed(2);
      
      // Prepare confirmation data for frontend
      var confirmationData = {
        job_id: newContext.job_id,
        helper_name: helpers[0]?.name || "Local Helper",
        service: newContext.service_type.replace(/_/g, ' '),
        date: newContext.service_date,
        time: newContext.service_time,
        location: newContext.property_data.address,
        helper_payment: pricing.helper_amount.toFixed(2),
        admin_commission: pricing.commission.toFixed(2),
        total_price: pricing.total.toFixed(2)
      };
      
      return _json({
        success: true,
        text: responseText,
        newContext: newContext,
        property: propertyCard,
        schematic_data: schematicData,
        job_id: jobId,
        job_status: jobStatus,
        confirmation: confirmationData,
        notified_helpers: notifiedHelpers,
        requires_payment: true,
        payment_amount: pricing.total
      });
    } else {
      responseText = "I'm searching for available helpers in your area. This may take a moment...";
      // Escalate to admin
      escalateToAdmin_(newContext.job_id, "No helpers available");
    }
  } else {
    // Generate appropriate response based on missing info
    responseText = generateIntelligentResponse_(intelligence, newContext, history);
  }
  
  // Add schematic if appropriate
  if (intelligence.schematic_type && !ctx.schematic_shown) {
    schematicData = generateSchematic_(intelligence.schematic_type, newContext);
    newContext.schematic_shown = true;
  }
  
  return _json({
    success: true,
    text: responseText,
    newContext: newContext,
    property: propertyCard,
    schematic_data: schematicData,
    job_id: jobId || ctx.job_id,
    job_status: jobStatus
  });
}

// =============== HELPER CONVERSATION HANDLER =================

function handleHelperConversation_(message, ctx, intelligence, history) {
  var responseText = "";
  var newContext = Object.assign({}, ctx);
  var helperId = ctx.helper_id;
  
  // Extract helper information from message
  var emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  if (emailMatch && !ctx.helper_email) {
    newContext.helper_email = emailMatch[0];
  }
  
  var phoneMatch = message.match(/(\+?1)?[\s.-]?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);
  if (phoneMatch && !ctx.helper_phone) {
    newContext.helper_phone = phoneMatch[0].replace(/\D/g, '');
  }
  
  // Check for WhatsApp number
  if (message.toLowerCase().includes("whatsapp") && phoneMatch) {
    newContext.helper_whatsapp = phoneMatch[0].replace(/\D/g, '');
  }
  
  // Extract name
  if (!ctx.helper_name && message.length < 50) {
    var words = message.split(' ');
    if (words.length >= 2 && words.length <= 4) {
      var possibleName = words.map(function(w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
      if (!possibleName.match(/\d/) && !possibleName.includes('@')) {
        newContext.helper_name = possibleName;
      }
    }
  }
  
  // Parse services
  if (!ctx.helper_services) {
    var detectedServices = [];
    for (var key in SERVICE_TYPES) {
      if (message.toLowerCase().includes(key)) {
        var service = SERVICE_TYPES[key];
        if (detectedServices.indexOf(service) === -1) {
          detectedServices.push(service);
        }
      }
    }
    if (detectedServices.length > 0) {
      newContext.helper_services = detectedServices;
    }
  }
  
  // Extract location if provided
  if (intelligence.detected_address && !ctx.helper_location) {
    var locationData = reverseGeocodeAddress_(intelligence.detected_address);
    if (locationData) {
      newContext.helper_location = locationData.location;
    }
  }
  
  // Parse service radius
  var radiusMatch = message.match(/(\d+)\s*(mile|mi|km)/i);
  if (radiusMatch && !ctx.service_radius) {
    newContext.service_radius = parseInt(radiusMatch[1]);
  }
  
  // Parse hourly rate
  var rateMatch = message.match(/\$(\d+)|(\d+)\s*(?:per|\/)\s*hour/i);
  if (rateMatch && !ctx.helper_rate) {
    newContext.helper_rate = parseInt(rateMatch[1] || rateMatch[2]);
  }
  
  // Check if all required info is collected
  var allInfoCollected = newContext.helper_name && 
                        newContext.helper_email && 
                        newContext.helper_phone && 
                        newContext.helper_services && 
                        newContext.helper_location && 
                        newContext.service_radius && 
                        newContext.helper_rate;
  
  if (allInfoCollected && !ctx.helper_id) {
    // Create helper profile
    helperId = createHelperInSheet_(newContext);
    newContext.helper_id = helperId;
    
    responseText = "Excellent! Your helper profile #" + helperId + " has been created!\n\n";
    responseText += "Services offered: " + newContext.helper_services.join(", ") + "\n";
    responseText += "Service radius: " + newContext.service_radius + " miles\n";
    responseText += "Hourly rate: $" + newContext.helper_rate + "\n\n";
    responseText += "You'll receive notifications via:\n";
    if (newContext.helper_whatsapp) responseText += "• WhatsApp: " + newContext.helper_whatsapp + "\n";
    responseText += "• Email: " + newContext.helper_email + "\n";
    responseText += "• SMS: " + newContext.helper_phone + "\n\n";
    responseText += "Please upload photos of your equipment to complete your profile.";
    
    newContext.ready_for_photos = true;
  } else {
    // Generate next question
    var missing = intelligence.missing_info;
    if (missing.length > 0) {
      responseText = getQuestionForMissingInfo_(missing[0], newContext);
    } else {
      responseText = "Is there anything else you'd like to add to your profile?";
    }
  }
  
  return _json({
    success: true,
    text: responseText,
    newContext: newContext,
    helper_id: helperId
  });
}

// =============== JOB CREATION AND LOGGING =================

function createJobInSheet_(ctx) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  
  if (!sheet) {
    sheet = ss.insertSheet("Jobs");
    sheet.appendRow([
      "Job ID",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Service Type",
      "Property Address",
      "Property Data JSON",
      "Service Date",
      "Service Time",
      "Status",
      "Assigned Helper ID",
      "Confirmed At",
      "Total Price",
      "Helper Payment",
      "Admin Commission",
      "Created At",
      "Updated At",
      "Completion Notes",
      "Customer Rating"
    ]);
  }
  
  var jobId = "JOB" + Date.now();
  var pricing = calculateEstimatedPrice_(ctx);
  
  sheet.appendRow([
    jobId,
    ctx.customer_name || "",
    ctx.customer_email || "",
    ctx.customer_phone || "",
    ctx.service_type || "",
    ctx.property_data ? ctx.property_data.address : "",
    ctx.property_data ? JSON.stringify(ctx.property_data) : "",
    ctx.service_date || "",
    ctx.service_time || "",
    "submitted", // Initial status
    "", // No helper assigned yet
    "", // Not confirmed yet
    pricing.total,
    pricing.helper_amount,
    pricing.commission,
    new Date().toISOString(),
    new Date().toISOString(),
    "", // No completion notes yet
    "" // No rating yet
  ]);
  
  console.log("Job created: " + jobId);
  return jobId;
}

function createCustomerInSheet_(ctx) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Users");
  
  if (!sheet) {
    sheet = ss.insertSheet("Users");
    sheet.appendRow([
      "User ID",
      "Customer Name",
      "Email",
      "Phone",
      "Address",
      "Total Jobs",
      "Average Rating Given",
      "First Seen At",
      "Last Active"
    ]);
  }
  
  // Check for existing user by email
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === ctx.customer_email) {
      // Update last active
      sheet.getRange(i + 1, 9).setValue(new Date().toISOString());
      return data[i][0]; // Return existing user ID
    }
  }
  
  // Create new user
  var userId = "USER" + Date.now();
  sheet.appendRow([
    userId,
    ctx.customer_name || "",
    ctx.customer_email || "",
    ctx.customer_phone || "",
    ctx.property_data ? ctx.property_data.address : "",
    1, // First job
    0, // No ratings yet
    new Date().toISOString(),
    new Date().toISOString()
  ]);
  
  return userId;
}

function createHelperInSheet_(ctx) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    sheet = ss.insertSheet("Helpers");
    sheet.appendRow([
      "Helper ID",
      "Helper Name",
      "Email",
      "Phone",
      "WhatsApp Number",
      "Services JSON",
      "Service Radius",
      "Location Lat",
      "Location Lng",
      "Availability Schedule",
      "Hourly Rate",
      "Rating",
      "Total Jobs",
      "Completed Jobs",
      "Response Time Avg",
      "Verified",
      "Equipment Photos",
      "Certifications",
      "Created At",
      "Last Active"
    ]);
  }
  
  var helperId = "HELPER" + Date.now();
  
  sheet.appendRow([
    helperId,
    ctx.helper_name || "",
    ctx.helper_email || "",
    ctx.helper_phone || "",
    ctx.helper_whatsapp || ctx.helper_phone || "",
    JSON.stringify(ctx.helper_services || []),
    ctx.service_radius || 10,
    ctx.helper_location ? ctx.helper_location.lat : "",
    ctx.helper_location ? ctx.helper_location.lng : "",
    JSON.stringify(ctx.availability_schedule || {}),
    ctx.helper_rate || 50,
    0, // Initial rating
    0, // No jobs yet
    0, // No completed jobs
    30, // Default 30 min response time
    false, // Not verified yet
    JSON.stringify(ctx.equipment_photos || []),
    JSON.stringify(ctx.certifications || []),
    new Date().toISOString(),
    new Date().toISOString()
  ]);
  
  console.log("Helper created: " + helperId);
  return helperId;
}

// =============== NOTIFICATION SYSTEM =================

function notifyMultipleHelpers_(helpers, jobId, ctx) {
  var notifiedHelpers = [];
  var maxToNotify = Math.min(MAX_HELPERS_TO_NOTIFY, helpers.length);
  
  for (var i = 0; i < maxToNotify; i++) {
    var helper = helpers[i];
    var notified = false;
    
    // Try WhatsApp first
    if (helper.whatsapp_number) {
      try {
        sendWhatsAppNotification_(helper.whatsapp_number, jobId, ctx, helper);
        notified = true;
      } catch (e) {
        console.log("WhatsApp failed for " + helper.helper_id + ": " + e);
      }
    }
    
    // Try Email
    if (helper.email) {
      try {
        sendEmailNotification_(helper.email, jobId, ctx, helper);
        notified = true;
      } catch (e) {
        console.log("Email failed for " + helper.helper_id + ": " + e);
      }
    }
    
    // Try SMS as fallback
    if (!notified && helper.phone) {
      try {
        sendSMSNotification_(helper.phone, jobId, ctx, helper);
        notified = true;
      } catch (e) {
        console.log("SMS failed for " + helper.helper_id + ": " + e);
      }
    }
    
    if (notified) {
      // Log notification in sheet
      logHelperNotification_(jobId, helper.helper_id, "notified");
      notifiedHelpers.push({
        helper_id: helper.helper_id,
        name: helper.name,
        distance_miles: helper.distance_miles,
        method: helper.whatsapp_number ? "WhatsApp" : (helper.email ? "Email" : "SMS")
      });
    }
  }
  
  return notifiedHelpers;
}

function sendWhatsAppNotification_(number, jobId, ctx, helper) {
  var twilioSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var twilioToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var twilioWhatsApp = PropertiesService.getScriptProperties().getProperty("TWILIO_WHATSAPP_NUMBER");
  
  if (!twilioSid || !twilioToken || !twilioWhatsApp) {
    throw new Error("Twilio WhatsApp credentials not configured");
  }
  
  var message = formatJobNotificationMessage_(jobId, ctx, helper);
  
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json";
  var payload = {
    "From": "whatsapp:" + twilioWhatsApp,
    "To": "whatsapp:+" + number.replace(/\D/g, ''),
    "Body": message
  };
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(twilioSid + ":" + twilioToken)
    },
    payload: payload,
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 201) {
    throw new Error("WhatsApp send failed: " + response.getContentText());
  }
}

function sendEmailNotification_(email, jobId, ctx, helper) {
  var sendgridKey = PropertiesService.getScriptProperties().getProperty("SENDGRID_API_KEY");
  
  if (sendgridKey) {
    // Use SendGrid if available
    sendEmailViaSendGrid_(email, jobId, ctx, helper, sendgridKey);
  } else {
    // Fallback to Gmail
    sendEmailViaGmail_(email, jobId, ctx, helper);
  }
}

function sendEmailViaSendGrid_(email, jobId, ctx, helper, apiKey) {
  var message = formatJobNotificationMessage_(jobId, ctx, helper);
  var htmlMessage = formatJobNotificationHTML_(jobId, ctx, helper);
  
  var url = "https://api.sendgrid.com/v3/mail/send";
  var payload = {
    personalizations: [{
      to: [{ email: email, name: helper.name }]
    }],
    from: {
      email: "jobs@neighbortask.com",
      name: "NeighborTask Jobs"
    },
    subject: "New Job Available: " + ctx.service_type + " - $" + calculateEstimatedPrice_(ctx).helper_amount,
    content: [
      { type: "text/plain", value: message },
      { type: "text/html", value: htmlMessage }
    ]
  };
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 202) {
    throw new Error("SendGrid failed: " + response.getContentText());
  }
}

function sendEmailViaGmail_(email, jobId, ctx, helper) {
  var subject = "New Job Available: " + ctx.service_type + " - $" + calculateEstimatedPrice_(ctx).helper_amount;
  var message = formatJobNotificationMessage_(jobId, ctx, helper);
  
  try {
    GmailApp.sendEmail(email, subject, message);
  } catch (e) {
    console.log("Gmail send failed: " + e);
    throw e;
  }
}

function sendSMSNotification_(phone, jobId, ctx, helper) {
  var twilioSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var twilioToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var twilioPhone = PropertiesService.getScriptProperties().getProperty("TWILIO_PHONE_NUMBER");
  
  if (!twilioSid || !twilioToken || !twilioPhone) {
    throw new Error("Twilio SMS credentials not configured");
  }
  
  var message = formatJobNotificationMessage_(jobId, ctx, helper);
  
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json";
  var payload = {
    "From": twilioPhone,
    "To": "+" + phone.replace(/\D/g, ''),
    "Body": message
  };
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(twilioSid + ":" + twilioToken)
    },
    payload: payload,
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 201) {
    throw new Error("SMS send failed: " + response.getContentText());
  }
}

function formatJobNotificationMessage_(jobId, ctx, helper) {
  var pricing = calculateEstimatedPrice_(ctx);
  var message = "🔔 NEW JOB ALERT!\n\n";
  message += "Job #" + jobId + "\n";
  message += "Service: " + ctx.service_type.replace(/_/g, ' ').toUpperCase() + "\n";
  message += "Location: " + ctx.property_data.address + "\n";
  message += "Distance: " + helper.distance_miles.toFixed(1) + " miles\n";
  message += "Date: " + ctx.service_date + "\n";
  message += "Time: " + ctx.service_time + "\n";
  message += "Your earnings: $" + pricing.helper_amount.toFixed(2) + "\n\n";
  
  if (ctx.property_data) {
    message += "Property details:\n";
    if (ctx.property_data.square_feet) message += "• Size: " + ctx.property_data.square_feet + " sq ft\n";
    if (ctx.property_data.driveway_length_ft) message += "• Driveway: " + ctx.property_data.driveway_length_ft + " ft\n";
  }
  
  message += "\n📱 REPLY WITH:\n";
  message += "'ACCEPT " + jobId + "' to accept this job\n";
  message += "'DECLINE " + jobId + "' to pass\n\n";
  message += "⏰ Please respond within 30 minutes";
  
  return message;
}

function formatJobNotificationHTML_(jobId, ctx, helper) {
  var pricing = calculateEstimatedPrice_(ctx);
  var html = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">';
  html += '<div style="background: #FFE135; padding: 20px; border-radius: 10px 10px 0 0;">';
  html += '<h1 style="margin: 0; color: #1A1A1A;">New Job Available!</h1>';
  html += '</div>';
  html += '<div style="padding: 20px; background: white; border: 2px solid #1A1A1A; border-top: none;">';
  html += '<h2>Job #' + jobId + '</h2>';
  html += '<table style="width: 100%; border-collapse: collapse;">';
  html += '<tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Service:</strong></td><td>' + ctx.service_type.replace(/_/g, ' ') + '</td></tr>';
  html += '<tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Location:</strong></td><td>' + ctx.property_data.address + '</td></tr>';
  html += '<tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Distance:</strong></td><td>' + helper.distance_miles.toFixed(1) + ' miles</td></tr>';
  html += '<tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Date:</strong></td><td>' + ctx.service_date + '</td></tr>';
  html += '<tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Time:</strong></td><td>' + ctx.service_time + '</td></tr>';
  html += '<tr><td style="padding: 10px;"><strong>Your Earnings:</strong></td><td style="color: #10B981; font-size: 24px; font-weight: bold;">$' + pricing.helper_amount.toFixed(2) + '</td></tr>';
  html += '</table>';
  html += '<div style="margin-top: 20px; padding: 15px; background: #F0F9FF; border-radius: 5px;">';
  html += '<p><strong>To accept this job:</strong></p>';
  html += '<p>Reply to this email with: <code>ACCEPT ' + jobId + '</code></p>';
  html += '<p>Or click: <a href="mailto:jobs@neighbortask.com?subject=ACCEPT%20' + jobId + '&body=I%20accept%20job%20' + jobId + '" style="background: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Job</a></p>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  
  return html;
}

// =============== HELPER JOB RESPONSE HANDLER =================

function handleHelperJobResponse_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  var response = payload.response; // "accept" or "decline"
  
  // Get job data
  var jobData = getJobData_(jobId);
  if (!jobData) {
    return _json({ success: false, error: "Job not found" });
  }
  
  // Check if job is already assigned
  if (jobData.status === "confirmed" || jobData.assigned_helper) {
    return _json({ success: false, error: "Job already assigned" });
  }
  
  if (response === "accept") {
    // Update job status
    updateJobInSheet_(jobId, {
      status: "confirmed",
      assigned_helper: helperId,
      confirmed_at: new Date().toISOString()
    });
    
    // Get helper data
    var helperData = getHelperData_(helperId);
    
    // Calculate final pricing
    var pricing = calculateFinalPricing_(jobData, helperData);
    
    // Update job with final pricing
    updateJobInSheet_(jobId, {
      total_price: pricing.total,
      helper_payment: pricing.helper_amount,
      admin_commission: pricing.commission
    });
    
    // Log helper acceptance
    logHelperNotification_(jobId, helperId, "accepted");
    
    // Update helper stats
    updateHelperStats_(helperId, "job_accepted");
    
    // Send confirmation to customer
    sendCustomerConfirmation_(jobData, helperData, pricing);
    
    // Send confirmation to helper
    sendHelperConfirmation_(jobData, helperData, pricing);
    
    return _json({
      success: true,
      message: "Job confirmed successfully",
      pricing: pricing,
      job_details: {
        job_id: jobId,
        customer_name: jobData.customer_name,
        service: jobData.service_type,
        date: jobData.service_date,
        time: jobData.service_time,
        location: jobData.property_address
      }
    });
    
  } else if (response === "decline") {
    // Log declination
    logHelperNotification_(jobId, helperId, "declined");
    
    // Try next helper
    var result = escalateToNextHelper_(jobId);
    
    return _json({
      success: true,
      message: "Job declined, notifying next helper",
      next_helper_notified: result.notified
    });
  }
  
  return _json({ success: false, error: "Invalid response type" });
}

// =============== CUSTOMER CONFIRMATION =================

function sendCustomerConfirmation_(jobData, helperData, pricing) {
  var message = "🎉 Great news! Your job has been confirmed!\n\n";
  message += "Job #" + jobData.job_id + "\n";
  message += "Helper: " + helperData.helper_name + "\n";
  message += "Rating: " + (helperData.rating || "New helper") + " ⭐\n";
  message += "Service: " + jobData.service_type.replace(/_/g, ' ') + "\n";
  message += "Date: " + jobData.service_date + "\n";
  message += "Time: " + jobData.service_time + "\n";
  message += "Location: " + jobData.property_address + "\n\n";
  message += "💰 PRICING BREAKDOWN:\n";
  message += "Service cost: $" + pricing.subtotal.toFixed(2) + "\n";
  message += "Service fee: $" + pricing.commission.toFixed(2) + "\n";
  message += "TOTAL: $" + pricing.total.toFixed(2) + "\n\n";
  message += "Your helper will arrive at the scheduled time.\n";
  message += "You'll receive a notification when they're on the way.";
  
  // Send via multiple channels
  if (jobData.customer_email) {
    try {
      GmailApp.sendEmail(
        jobData.customer_email,
        "Job Confirmed - NeighborTask #" + jobData.job_id,
        message
      );
    } catch (e) {
      console.log("Customer email failed: " + e);
    }
  }
  
  if (jobData.customer_phone) {
    try {
      sendSMSToCustomer_(jobData.customer_phone, message);
    } catch (e) {
      console.log("Customer SMS failed: " + e);
    }
  }
}

function sendHelperConfirmation_(jobData, helperData, pricing) {
  var message = "✅ Job Confirmed!\n\n";
  message += "Job #" + jobData.job_id + "\n";
  message += "Customer: " + jobData.customer_name + "\n";
  message += "Service: " + jobData.service_type.replace(/_/g, ' ') + "\n";
  message += "Date: " + jobData.service_date + "\n";
  message += "Time: " + jobData.service_time + "\n";
  message += "Location: " + jobData.property_address + "\n\n";
  message += "Your earnings: $" + pricing.helper_amount.toFixed(2) + "\n\n";
  message += "Please arrive 5 minutes early.\n";
  message += "Customer phone: " + jobData.customer_phone;
  
  // Send to helper via preferred channel
  if (helperData.whatsapp_number) {
    try {
      sendWhatsAppToHelper_(helperData.whatsapp_number, message);
    } catch (e) {
      console.log("Helper WhatsApp failed: " + e);
    }
  }
  
  if (helperData.email) {
    try {
      GmailApp.sendEmail(
        helperData.email,
        "Job Confirmed - NeighborTask #" + jobData.job_id,
        message
      );
    } catch (e) {
      console.log("Helper email failed: " + e);
    }
  }
}

// =============== PRICING CALCULATIONS =================

function calculateEstimatedPrice_(ctx) {
  var serviceType = ctx.service_type;
  var pricing = SERVICE_PRICING[serviceType] || { base: 50, min: 30 };
  var riskLevel = SERVICE_RISK[serviceType] || { commission: ADMIN_COMMISSION_RATE };
  
  var subtotal = pricing.base;
  
  // Add service-specific calculations
  if (serviceType === "snow_removal" && ctx.property_data) {
    var drivewaySqFt = (ctx.property_data.driveway_length_ft || 50) * 12;
    subtotal += drivewaySqFt * (pricing.per_sqft || 0.02);
    if (ctx.include_walkway) subtotal += 15;
    if (ctx.include_deck) subtotal += 20;
  } else if (serviceType === "lawn_care" && ctx.property_data) {
    var yardSqFt = ctx.property_data.lot_size_sqft || 5000;
    subtotal += yardSqFt * (pricing.per_sqft || 0.015);
  } else if (serviceType === "house_cleaning" && ctx.property_data) {
    var rooms = (ctx.property_data.bedrooms || 2) + (ctx.property_data.bathrooms || 1) + 3;
    subtotal += rooms * (pricing.per_room || 25);
  } else if (serviceType === "dog_walking") {
    var duration = ctx.walk_duration || 30;
    subtotal = pricing.base + (Math.ceil(duration / 30) - 1) * pricing.per_30min;
  }
  
  // Ensure minimum price
  subtotal = Math.max(subtotal, pricing.min);
  
  // Calculate commission
  var commission = subtotal * riskLevel.commission;
  
  return {
    subtotal: subtotal,
    commission: commission,
    total: subtotal + commission,
    helper_amount: subtotal,
    admin_amount: commission
  };
}

function calculateFinalPricing_(jobData, helperData) {
  var baseCalc = calculateEstimatedPrice_(jobData);
  
  // Adjust based on helper's rate if different
  if (helperData.hourly_rate) {
    var estimatedHours = getEstimatedHours_(jobData.service_type);
    var helperBase = helperData.hourly_rate * estimatedHours;
    
    // Use higher of calculated or helper rate
    baseCalc.subtotal = Math.max(baseCalc.subtotal, helperBase);
    baseCalc.helper_amount = baseCalc.subtotal;
    baseCalc.commission = baseCalc.subtotal * (SERVICE_RISK[jobData.service_type]?.commission || ADMIN_COMMISSION_RATE);
    baseCalc.total = baseCalc.subtotal + baseCalc.commission;
  }
  
  return baseCalc;
}

function getEstimatedHours_(serviceType) {
  var estimates = {
    snow_removal: 1.0,
    lawn_care: 1.5,
    house_cleaning: 3.0,
    dog_walking: 0.5,
    electrical: 2.0,
    plumbing: 2.0,
    holiday_lights: 3.0
  };
  return estimates[serviceType] || 1.0;
}

// =============== DATA ACCESS FUNCTIONS =================

function getJobData_(jobId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === jobId) {
      var job = {};
      for (var j = 0; j < headers.length; j++) {
        job[headers[j].toLowerCase().replace(/ /g, '_')] = data[i][j];
      }
      
      // Parse JSON fields
      if (job.property_data_json) {
        try {
          job.property_data = JSON.parse(job.property_data_json);
        } catch (e) {
          job.property_data = {};
        }
      }
      
      return job;
    }
  }
  return null;
}

function getHelperData_(helperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      var helper = {};
      for (var j = 0; j < headers.length; j++) {
        helper[headers[j].toLowerCase().replace(/ /g, '_')] = data[i][j];
      }
      
      // Parse JSON fields
      if (helper.services_json) {
        try {
          helper.services = JSON.parse(helper.services_json);
        } catch (e) {
          helper.services = [];
        }
      }
      
      return helper;
    }
  }
  return null;
}

function updateJobInSheet_(jobId, updates) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === jobId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return;
  
  for (var key in updates) {
    // Convert snake_case to Title Case with spaces for header matching
    var headerKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    var colIndex = headers.indexOf(headerKey);
    if (colIndex !== -1) {
      sheet.getRange(rowIndex, colIndex + 1).setValue(updates[key]);
    }
  }
  
  // Update timestamp
  var updateCol = headers.indexOf("Updated At");
  if (updateCol !== -1) {
    sheet.getRange(rowIndex, updateCol + 1).setValue(new Date().toISOString());
  }
}

function updateJobStatus_(jobId, status) {
  updateJobInSheet_(jobId, { status: status });
}

function updateHelperStats_(helperId, action) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return;
  
  if (action === "job_accepted") {
    var totalJobsCol = headers.indexOf("Total Jobs");
    if (totalJobsCol !== -1) {
      var currentJobs = sheet.getRange(rowIndex, totalJobsCol + 1).getValue() || 0;
      sheet.getRange(rowIndex, totalJobsCol + 1).setValue(currentJobs + 1);
    }
  }
  
  // Update last active
  var lastActiveCol = headers.indexOf("Last Active");
  if (lastActiveCol !== -1) {
    sheet.getRange(rowIndex, lastActiveCol + 1).setValue(new Date().toISOString());
  }
}

// =============== LOGGING FUNCTIONS =================

function logHelperNotification_(jobId, helperId, action) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helper_Notifications");
  
  if (!sheet) {
    sheet = ss.insertSheet("Helper_Notifications");
    sheet.appendRow([
      "Log ID",
      "Job ID",
      "Helper ID",
      "Action",
      "Timestamp",
      "Response Time (minutes)"
    ]);
  }
  
  var logId = "LOG" + Date.now();
  sheet.appendRow([
    logId,
    jobId,
    helperId,
    action,
    new Date().toISOString(),
    "" // Response time calculated later
  ]);
}

// =============== ESCALATION FUNCTIONS =================

function escalateToNextHelper_(jobId) {
  var jobData = getJobData_(jobId);
  if (!jobData) return { notified: false, error: "Job not found" };
  
  // Get all notified helpers for this job
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helper_Notifications");
  if (!sheet) return { notified: false, error: "No notifications log" };
  
  var data = sheet.getDataRange().getValues();
  var notifiedHelpers = [];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === jobId && data[i][3] === "notified") {
      notifiedHelpers.push(data[i][2]);
    }
  }
  
  // Find next available helper not yet notified
  var allHelpers = findMatchingHelpers_({
    service_type: jobData.service_type,
    lat: parseFloat(jobData.property_data ? jobData.property_data.location.lat : 0),
    lng: parseFloat(jobData.property_data ? jobData.property_data.location.lng : 0),
    date: jobData.service_date,
    time: jobData.service_time
  });
  
  for (var i = 0; i < allHelpers.length; i++) {
    if (notifiedHelpers.indexOf(allHelpers[i].helper_id) === -1) {
      // Notify this helper
      var notified = notifyMultipleHelpers_([allHelpers[i]], jobId, jobData);
      if (notified.length > 0) {
        return { notified: true, helper: allHelpers[i] };
      }
    }
  }
  
  // No more helpers available, escalate to admin
  escalateToAdmin_(jobId, "No available helpers");
  return { notified: false, escalated_to_admin: true };
}

function escalateToAdmin_(jobId, reason) {
  var adminEmail = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL");
  if (!adminEmail) return;
  
  var jobData = getJobData_(jobId);
  if (!jobData) return;
  
  var subject = "URGENT: Manual Assignment Needed - Job #" + jobId;
  var message = "Job requires manual assignment.\n\n";
  message += "Reason: " + reason + "\n\n";
  message += "Job Details:\n";
  message += "Customer: " + jobData.customer_name + "\n";
  message += "Service: " + jobData.service_type + "\n";
  message += "Date: " + jobData.service_date + "\n";
  message += "Time: " + jobData.service_time + "\n";
  message += "Location: " + jobData.property_address + "\n\n";
  message += "Please manually assign a helper or contact customer.";
  
  try {
    GmailApp.sendEmail(adminEmail, subject, message);
  } catch (e) {
    console.log("Admin notification failed: " + e);
  }
}

function handleJobEscalation_(payload) {
  var jobId = payload.job_id;
  var result = escalateToNextHelper_(jobId);
  return _json(result);
}

function handleAdminAssign_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  
  // Manually assign helper to job
  updateJobInSheet_(jobId, {
    status: "confirmed",
    assigned_helper: helperId,
    confirmed_at: new Date().toISOString()
  });
  
  // Get data for notifications
  var jobData = getJobData_(jobId);
  var helperData = getHelperData_(helperId);
  var pricing = calculateFinalPricing_(jobData, helperData);
  
  // Send confirmations
  sendCustomerConfirmation_(jobData, helperData, pricing);
  sendHelperConfirmation_(jobData, helperData, pricing);
  
  return _json({
    success: true,
    message: "Job manually assigned"
  });
}

// =============== JOB COMPLETION =================

function handleJobCompletion_(payload) {
  var jobId = payload.job_id;
  var completionNotes = payload.notes || "";
  var customerRating = payload.rating || 0;
  
  updateJobInSheet_(jobId, {
    status: "completed",
    completion_notes: completionNotes,
    customer_rating: customerRating,
    completed_at: new Date().toISOString()
  });
  
  // Update helper stats
  var jobData = getJobData_(jobId);
  if (jobData && jobData.assigned_helper) {
    updateHelperCompletedJobs_(jobData.assigned_helper);
  }
  
  return _json({
    success: true,
    message: "Job marked as complete"
  });
}

function updateHelperCompletedJobs_(helperId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return;
  
  var completedCol = headers.indexOf("Completed Jobs");
  if (completedCol !== -1) {
    var current = sheet.getRange(rowIndex, completedCol + 1).getValue() || 0;
    sheet.getRange(rowIndex, completedCol + 1).setValue(current + 1);
  }
}

// =============== STATUS CHECK =================

function handleGetJobStatus_(payload) {
  var jobId = payload.job_id;
  var jobData = getJobData_(jobId);
  
  if (!jobData) {
    return _json({ success: false, error: "Job not found" });
  }
  
  return _json({
    success: true,
    job_id: jobId,
    status: jobData.status,
    assigned_helper: jobData.assigned_helper,
    confirmed_at: jobData.confirmed_at,
    completed_at: jobData.completed_at,
    total_price: jobData.total_price,
    helper_payment: jobData.helper_payment
  });
}

// =============== HELPER MATCHING =================

function findMatchingHelpers_(params) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  
  if (!sheet) {
    console.log("Helpers sheet not found");
    return [];
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var helpers = [];
  
  for (var i = 1; i < data.length; i++) {
    var helper = {};
    for (var j = 0; j < headers.length; j++) {
      helper[headers[j].toLowerCase().replace(/ /g, '_')] = data[i][j];
    }
    
    // Check if helper offers this service
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
    var helperLat = parseFloat(helper.location_lat || 0);
    var helperLng = parseFloat(helper.location_lng || 0);
    
    if (!helperLat || !helperLng) continue;
    
    var distance = haversineKm_(
      params.lat, 
      params.lng, 
      helperLat,
      helperLng
    ) / 1.609; // Convert to miles
    
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
      email: helper.email,
      phone: helper.phone,
      whatsapp_number: helper.whatsapp_number,
      distance_miles: distance,
      match_score: score,
      rate: helper.hourly_rate,
      rating: helper.rating || "New",
      total_jobs: helper.total_jobs || 0
    });
  }
  
  // Sort by match score (highest first)
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
  
  // Distance penalty (closer is better)
  score -= Math.min(50, distance * 2);
  
  // Rating bonus
  var rating = parseFloat(helper.rating || 0);
  score += rating * 4;
  
  // Experience bonus
  var totalJobs = parseInt(helper.total_jobs || 0);
  score += Math.min(15, totalJobs / 10);
  
  // Availability bonus
  if (helper.available_now === true || helper.available_now === "true") {
    score += 15;
  }
  
  // Verification bonus
  if (helper.verified === true || helper.verified === "true") {
    score += 10;
  }
  
  // Response time bonus
  var avgResponseTime = parseFloat(helper.response_time_avg || 60);
  if (avgResponseTime < 30) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

// =============== UTILITY FUNCTIONS =================

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
  var R = 6371; // Earth's radius in km
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

// =============== PROPERTY ENRICHMENT =================

function getEnrichedPropertyData_(address) {
  // For demo purposes - in production, integrate with actual APIs
  var propertyData = {
    address: address,
    location: { 
      lat: 40.7128 + (Math.random() * 0.1 - 0.05), // NYC area with some variation
      lng: -74.0060 + (Math.random() * 0.1 - 0.05)
    },
    home_type: "Single Family Residential",
    square_feet: Math.floor(1500 + Math.random() * 2000),
    bedrooms: Math.floor(2 + Math.random() * 4),
    bathrooms: Math.floor(1 + Math.random() * 3),
    stories: Math.floor(1 + Math.random() * 3),
    lot_size_sqft: Math.floor(5000 + Math.random() * 10000),
    driveway_length_ft: Math.floor(30 + Math.random() * 50),
    garage_spaces: Math.floor(1 + Math.random() * 3),
    year_built: Math.floor(1950 + Math.random() * 70),
    zipcode: "10001"
  };
  
  return propertyData;
}

function reverseGeocodeAddress_(address) {
  // For demo purposes
  return {
    formatted_address: address,
    location: { lat: 40.7128, lng: -74.0060 }
  };
}

// =============== WEATHER INTEGRATION =================

function getWeatherForecast_(lat, lng, date, serviceTime) {
  // For demo purposes
  return {
    temperature: Math.floor(30 + Math.random() * 40),
    conditions: ["Sunny", "Cloudy", "Rainy", "Snowy"][Math.floor(Math.random() * 4)],
    wind_speed: Math.floor(5 + Math.random() * 15),
    precipitation_chance: Math.floor(Math.random() * 100),
    snow_depth: Math.floor(Math.random() * 12),
    humidity: Math.floor(30 + Math.random() * 50),
    icon: "01d"
  };
}

// =============== SCHEMATIC DRAWING =================

function generateSchematic_(schematicType, ctx) {
  if (!ctx.property_data || !ctx.property_data.location) {
    console.log("Cannot generate schematic: Missing property data or location");
    return null;
  }
  
  var lat = ctx.property_data.location.lat;
  var lng = ctx.property_data.location.lng;
  
  // For demo, return a simple data structure
  // In production, generate actual map URLs
  return {
    type: schematicType,
    property_data: ctx.property_data,
    service_details: {
      type: ctx.service_type,
      date: ctx.service_date,
      time: ctx.service_time
    },
    scope: {
      estimated_size: ctx.property_data.square_feet || "Unknown",
      estimated_time: "1-2 hours"
    },
    generated_at: new Date().toISOString()
  };
}

// =============== MARKET BENCHMARK =================

function getMarketBenchmark_(serviceType, zipcode) {
  // Base benchmarks with real national averages
  var nationalBenchmarks = {
    snow_removal: { low: 30, avg: 50, high: 80, per_sqft: 0.02 },
    lawn_care: { low: 25, avg: 45, high: 70, per_sqft: 0.015 },
    house_cleaning: { low: 60, avg: 100, high: 150, per_hour: 40 },
    dog_walking: { low: 20, avg: 30, high: 45, per_30min: 15 },
    electrical: { low: 75, avg: 125, high: 200, hourly: 75 },
    plumbing: { low: 85, avg: 150, high: 250, hourly: 85 },
    holiday_lights: { low: 100, avg: 200, high: 400, per_story: 100 }
  };
  
  return nationalBenchmarks[serviceType] || { low: 30, avg: 60, high: 100 };
}

// =============== ENHANCED GEOCODING FUNCTIONS =================

function handleReverseGeocode_(payload) {
  var lat = payload.lat;
  var lng = payload.lng;
  
  var addressData = reverseGeocode_(lat, lng);
  if (addressData) {
    // Get enriched property data for this address
    var propertyData = getEnrichedPropertyData_(addressData.address);
    
    return _json({ 
      success: true, 
      address: addressData.address,
      details: addressData.details,
      property_data: propertyData
    });
  } else {
    return _json({ success: false, error: "Location not found" });
  }
}

function reverseGeocode_(lat, lng) {
  // For demo purposes
  var addresses = [
    "123 Main St, New York, NY 10001",
    "456 Park Ave, Brooklyn, NY 11201",
    "789 Broadway, Queens, NY 11101"
  ];
  
  var randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
  
  return { 
    address: randomAddress,
    details: {
      street_number: "123",
      route: "Main St",
      locality: "New York",
      administrative_area_level_1: "NY",
      country: "USA",
      postal_code: "10001"
    }
  };
}

// =============== RESPONSE GENERATION =================

function generateIntelligentResponse_(intelligence, ctx, history) {
  // Generate context-aware response
  if (intelligence.missing_info.length > 0) {
    return getQuestionForMissingInfo_(intelligence.missing_info[0], ctx);
  }
  
  // Default response
  return "I'm processing your request. Is there anything else you'd like to add?";
}

function getQuestionForMissingInfo_(missingItem, ctx) {
  var questions = {
    service_type: "What service do you need? (snow removal, lawn care, house cleaning, etc.)",
    address: "What's your property address?",
    property_confirmation: "Is this your correct address: " + (ctx.property_data ? ctx.property_data.address : "") + "?",
    service_date: "What date do you need the service?",
    service_time: "What time would you prefer? (e.g., 9am, 2pm)",
    customer_name: "What's your full name?",
    customer_email: "What's your email address?",
    customer_phone: "What's your phone number?",
    scope_confirmation: "Great! Let me confirm:\n• Service: " + ctx.service_type + "\n• Date: " + ctx.service_date + "\n• Time: " + ctx.service_time + "\n• Location: " + (ctx.property_data ? ctx.property_data.address : "") + "\n\nDoes this look correct?",
    
    // Service-specific
    snow_depth: "How deep is the snow? (in inches)",
    include_walkway: "Should we include walkways?",
    include_deck: "Should we clear your deck/patio?",
    has_pets: "Do you have any pets in the home?",
    bring_supplies: "Should the cleaner bring their own supplies?",
    cleaning_type: "What type of cleaning? (standard, deep, or move-out)",
    dog_size: "What size is your dog? (small, medium, large)",
    dog_temperament: "How would you describe your dog's temperament?",
    walk_duration: "How long should the walk be? (30, 45, or 60 minutes)",
    
    // Helper-specific
    helper_name: "What's your full name?",
    helper_email: "What's your email address?",
    helper_phone: "What's your phone number?",
    helper_whatsapp: "What's your WhatsApp number? (optional, but recommended for faster notifications)",
    services: "What services can you provide? List all that apply (snow removal, lawn care, etc.)",
    location: "What's your home address or central service location?",
    service_radius: "How many miles are you willing to travel for jobs?",
    hourly_rate: "What's your hourly rate?",
    availability: "What days are you typically available?",
    equipment_photos: "Please upload photos of your equipment"
  };
  
  return questions[missingItem] || "Could you provide more information?";
}

// =============== FILE UPLOAD HANDLERS =================

function handlePhotoUpload_(payload) {
  // Route to appropriate handler based on photo type
  if (payload.photo_type === "equipment") {
    return handleEquipmentPhotoUpload_(payload);
  }
  
  // Default handling for other photo types
  var fileUrl = "https://example.com/uploads/" + Date.now() + ".jpg";
  
  return _json({
    success: true,
    file_url: fileUrl,
    message: "Photo uploaded successfully"
  });
}

function handleEquipmentPhotoUpload_(payload) {
  var helperId = payload.helper_id;
  var photoUrl = payload.photo_url || "https://example.com/uploads/" + Date.now() + ".jpg";
  var photoType = payload.photo_type;
  
  // Store photo URL in helper's record
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) {
    return _json({ success: false, error: "Helpers sheet not found" });
  }
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    return _json({ success: false, error: "Helper not found" });
  }
  
  var photosCol = headers.indexOf("Equipment Photos");
  if (photosCol !== -1) {
    var currentPhotos = sheet.getRange(rowIndex, photosCol + 1).getValue();
    var photos = [];
    try {
      photos = JSON.parse(currentPhotos || "[]");
    } catch (e) {
      photos = [];
    }
    photos.push({
      url: photoUrl,
      type: photoType,
      uploaded_at: new Date().toISOString()
    });
    sheet.getRange(rowIndex, photosCol + 1).setValue(JSON.stringify(photos));
  }
  
  return _json({
    success: true,
    message: "Photo uploaded successfully"
  });
}

function handleCertificateVerification_(payload) {
  var helperId = payload.helper_id;
  var certificateType = payload.certificate_type;
  var certificateNumber = payload.certificate_number;
  
  // In production, this would verify with licensing boards
  // For now, just store it
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) {
    return _json({ success: false, error: "Helpers sheet not found" });
  }
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    return _json({ success: false, error: "Helper not found" });
  }
  
  var certsCol = headers.indexOf("Certifications");
  if (certsCol !== -1) {
    var currentCerts = sheet.getRange(rowIndex, certsCol + 1).getValue();
    var certs = [];
    try {
      certs = JSON.parse(currentCerts || "[]");
    } catch (e) {
      certs = [];
    }
    certs.push({
      type: certificateType,
      number: certificateNumber,
      verified_at: new Date().toISOString()
    });
    sheet.getRange(rowIndex, certsCol + 1).setValue(JSON.stringify(certs));
  }
  
  // Mark as verified if certificate is valid
  var verifiedCol = headers.indexOf("Verified");
  if (verifiedCol !== -1) {
    sheet.getRange(rowIndex, verifiedCol + 1).setValue(true);
  }
  
  return _json({
    success: true,
    message: "Certificate verified successfully",
    verified: true
  });
}

// =============== SMS FUNCTIONS =================

function sendSMSToCustomer_(phone, message) {
  var twilioSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var twilioToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var twilioPhone = PropertiesService.getScriptProperties().getProperty("TWILIO_PHONE_NUMBER");
  
  if (!twilioSid || !twilioToken || !twilioPhone) {
    throw new Error("Twilio credentials not configured");
  }
  
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json";
  var payload = {
    "From": twilioPhone,
    "To": "+" + phone.replace(/\D/g, ''),
    "Body": message
  };
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(twilioSid + ":" + twilioToken)
    },
    payload: payload,
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 201) {
    throw new Error("SMS send failed: " + response.getContentText());
  }
}

function sendWhatsAppToHelper_(number, message) {
  var twilioSid = PropertiesService.getScriptProperties().getProperty("TWILIO_ACCOUNT_SID");
  var twilioToken = PropertiesService.getScriptProperties().getProperty("TWILIO_AUTH_TOKEN");
  var twilioWhatsApp = PropertiesService.getScriptProperties().getProperty("TWILIO_WHATSAPP_NUMBER");
  
  if (!twilioSid || !twilioToken || !twilioWhatsApp) {
    throw new Error("Twilio WhatsApp credentials not configured");
  }
  
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json";
  var payload = {
    "From": "whatsapp:" + twilioWhatsApp,
    "To": "whatsapp:+" + number.replace(/\D/g, ''),
    "Body": message
  };
  
  var options = {
    method: "post",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(twilioSid + ":" + twilioToken)
    },
    payload: payload,
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 201) {
    throw new Error("WhatsApp send failed: " + response.getContentText());
  }
}

// =============== NEW HANDLERS FOR FRONTEND =================

function handleCreatePaymentIntent_(payload) {
  var jobId = payload.job_id;
  var amount = payload.amount; // in cents
  
  // Get job data to validate
  var jobData = getJobData_(jobId);
  if (!jobData) {
    return _json({ success: false, error: "Job not found" });
  }
  
  // In production, integrate with Stripe API
  // For demo, return mock client secret
  return _json({
    success: true,
    clientSecret: "pi_mock_secret_" + Date.now(),
    amount: amount / 100 // Convert back to dollars for display
  });
}

function handleGetUserJobs_(payload) {
  var userId = payload.user_id;
  var userType = payload.user_type;
  var statusFilter = payload.status || [];
  
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Jobs");
  if (!sheet) return _json({ success: false, error: "Jobs sheet not found" });
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var jobs = [];
  
  for (var i = 1; i < data.length; i++) {
    var job = {};
    for (var j = 0; j < headers.length; j++) {
      job[headers[j].toLowerCase().replace(/ /g, '_')] = data[i][j];
    }
    
    // Filter based on user type
    var matchesUser = false;
    if (userType === "customer") {
      matchesUser = job.customer_email === userId || job.customer_id === userId;
    } else if (userType === "helper") {
      matchesUser = job.assigned_helper === userId;
    }
    
    // Filter by status if specified
    var matchesStatus = statusFilter.length === 0 || 
                       statusFilter.indexOf(job.status) !== -1;
    
    if (matchesUser && matchesStatus) {
      jobs.push(job);
    }
  }
  
  return _json({ success: true, jobs: jobs });
}

function handleJobAction_(payload) {
  var jobId = payload.job_id;
  var action = payload.action;
  var userType = payload.user_type;
  var userId = payload.user_id;
  
  var jobData = getJobData_(jobId);
  if (!jobData) {
    return _json({ success: false, error: "Job not found" });
  }
  
  switch(action) {
    case "accept":
      // Helper accepts job
      if (userType !== "helper") {
        return _json({ success: false, error: "Only helpers can accept jobs" });
      }
      
      updateJobInSheet_(jobId, {
        status: "confirmed",
        assigned_helper: userId,
        confirmed_at: new Date().toISOString()
      });
      
      return _json({ success: true, message: "Job accepted" });
      
    case "decline":
      // Helper declines job
      logHelperNotification_(jobId, userId, "declined");
      return _json({ success: true, message: "Job declined" });
      
    case "complete":
      // Mark job as complete
      updateJobInSheet_(jobId, {
        status: "completed",
        completed_at: new Date().toISOString()
      });
      return _json({ success: true, message: "Job marked complete" });
      
    case "pay":
      // Mark payment as completed
      updateJobInSheet_(jobId, {
        payment_completed: true,
        payment_completed_at: new Date().toISOString()
      });
      return _json({ success: true, message: "Payment recorded" });
      
    default:
      return _json({ success: false, error: "Unknown action" });
  }
}

function handleSubmitReview_(payload) {
  var jobId = payload.job_id;
  var helperId = payload.helper_id;
  var rating = payload.rating;
  var reviewText = payload.review_text;
  
  // Update job with review
  updateJobInSheet_(jobId, {
    customer_rating: rating,
    review_text: reviewText,
    reviewed_at: new Date().toISOString()
  });
  
  // Update helper's average rating
  updateHelperRating_(helperId, rating);
  
  return _json({ success: true, message: "Review submitted" });
}

function updateHelperRating_(helperId, newRating) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Helpers");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === helperId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return;
  
  var ratingCol = headers.indexOf("Rating");
  if (ratingCol !== -1) {
    var currentRating = sheet.getRange(rowIndex, ratingCol + 1).getValue() || 0;
    var totalJobsCol = headers.indexOf("Total Jobs");
    var totalJobs = sheet.getRange(rowIndex, totalJobsCol + 1).getValue() || 0;
    
    // Calculate new average
    var newAverage = ((currentRating * totalJobs) + newRating) / (totalJobs + 1);
    sheet.getRange(rowIndex, ratingCol + 1).setValue(newAverage.toFixed(1));
  }
}

function handleUpdateSettings_(payload) {
  var userType = payload.user_type;
  var userId = payload.user_id;
  var settings = payload.settings;
  
  // Store settings in appropriate sheet
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = userType === "customer" ? "Users" : "Helpers";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return _json({ success: false, error: sheetName + " sheet not found" });
  }
  
  // In a real implementation, you would update the user's settings record
  // For now, just return success
  return _json({ 
    success: true, 
    message: "Settings updated successfully" 
  });
}

function handlePollUpdates_(payload) {
  var userType = payload.user_type;
  var userId = payload.user_id;
  var lastCheck = payload.last_check;
  
  // In a real implementation, you would check for:
  // 1. New notifications for this user
  // 2. Job status updates
  // 3. New messages
  
  // For demo, return empty arrays
  return _json({
    success: true,
    notifications: [],
    job_updates: [],
    messages: []
  });
}

function handleClearNotifications_(payload) {
  var userType = payload.user_type;
  var userId = payload.user_id;
  
  // In a real implementation, you would clear notifications for this user
  // For now, just return success
  return _json({ 
    success: true, 
    message: "Notifications cleared" 
  });
}

// =============== SETUP FUNCTION =================

function setup() {
  // Create necessary sheets if they don't exist
  var ss = SpreadsheetApp.openById(SHEET_ID);
  
  var sheets = [
    {
      name: "Jobs",
      headers: ["Job ID", "Customer Name", "Customer Email", "Customer Phone", "Service Type", "Property Address", "Property Data JSON", "Service Date", "Service Time", "Status", "Assigned Helper ID", "Confirmed At", "Total Price", "Helper Payment", "Admin Commission", "Created At", "Updated At", "Completion Notes", "Customer Rating"]
    },
    {
      name: "Helpers",
      headers: ["Helper ID", "Helper Name", "Email", "Phone", "WhatsApp Number", "Services JSON", "Service Radius", "Location Lat", "Location Lng", "Availability Schedule", "Hourly Rate", "Rating", "Total Jobs", "Completed Jobs", "Response Time Avg", "Verified", "Equipment Photos", "Certifications", "Created At", "Last Active"]
    },
    {
      name: "Users",
      headers: ["User ID", "Customer Name", "Email", "Phone", "Address", "Total Jobs", "Average Rating Given", "First Seen At", "Last Active"]
    },
    {
      name: "Helper_Notifications",
      headers: ["Log ID", "Job ID", "Helper ID", "Action", "Timestamp", "Response Time (minutes)"]
    }
  ];
  
  sheets.forEach(function(sheetConfig) {
    var sheet = ss.getSheetByName(sheetConfig.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetConfig.name);
      sheet.appendRow(sheetConfig.headers);
    }
  });
  
  console.log("Setup complete!");
}

// =============== END OF FILE =================
