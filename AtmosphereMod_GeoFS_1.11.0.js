/*
 * AtmosphereMod GeoFS 4.0 native-cloud atmosphere and weather effects 1.11.0
 * GeoFS native cloud shaders, textures, and rendering preferences are preserved unchanged.
 * This module focuses on atmospheric optics, weather diagnostics, lightning, and tornado visuals.
 */
(() => {
  "use strict";

  const VERSION = "1.11.0-physical-sunset-and-native-geofs-ui";
  const GLOBAL_KEY = "__ATMOSPHEREMOD_GEOFS_1110__";
  const STORAGE_KEY = "atmospheremod.geofs.111.settings";
  const UI_ID = "amgfs111-root";
  const MENU_ITEM_ID = "amgfs111-menu-item";
  const MODIFIER_ID = "atmospheremod-geofs-1110";
  const MASTER_KEY = "atmospheremod.geofs.111.enabled";
  const finite = (v, fallback) => v === null || v === undefined || v === "" ? fallback
    : Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
  const fmt = (v, digits = 6) => Number(v).toFixed(digits);
  const lerp = (a, b, t) => a + (b - a) * t;

  const DEFAULTS = Object.freeze({
    T0: 1, C0: 1,
    T1: 1.5, T2: 0.15, T3: 4.0, T4: 0.6, T5: 2.5, T6: 0.05,
    T7: 0.1, T8: 1, T9: 0.7, T10: 1.3, T11: 1, T12: 1, T13: 1, T16: 1,
    C1: 0.96, C2: 0.32, C3: 0.30, C4: 0.38, C5: 0.06, C6: 0.34,
    C7: 180, C8: 0.35, C9: 0, C10: 10, C11: 0.08,
    C16: 0.85, C17: 0.82, C18: 0, C19: 1.15, C28: 0.82, C29: 360, C30: 0.030, C31: 82,
    C22: 1, LG: 1, LGI: 0.42, SS: 1, RW: 1,
    CG: 0, CC: 0.62, CB: 250, CT: 14500,
    CM: 0, CQ: 2, IR: 0.78, IF: 0.68,
    WX: 1, NWP: 1, WLR: 6.5, WENT: 0.12, WX_LIGHTNING: 1, WX_TORNADO: 1
  });

  // Limits retain the MSFS tunable ranges where the source defines them.
  const LIMITS = Object.freeze({
    T1: [0.3, 6], T2: [0.04, 1.5], T3: [0, 14], T4: [0, 3],
    T5: [0.5, 10], T6: [0, 1], T7: [0, 0.5], T9: [0, 0.99],
    T10: [0, 2.5], T11: [0, 1], T12: [0, 1], T16: [0, 2],
    C1: [0, 0.99], C2: [0, 0.5], C3: [0, 1], C4: [0, 0.9],
    C5: [0, 0.25], C6: [0, 1], C7: [0, 500], C8: [0, 8],
    C9: [0, 2], C10: [2, 25], C11: [0.02, 0.45], C16: [0, 4],
    C17: [0, 1], C18: [0, 12000], C19: [0, 3], C28: [0, 1], C29: [0, 1000], C30: [0, 0.05],
    C31: [60, 1500], LG: [0, 1], LGI: [0, 1],
    CC: [0, 1], CB: [0, 10000], CT: [500, 16000], CM: [0, 10], CQ: [1, 3], IR: [0, 1], IF: [0, 1],
    WLR: [4.0, 9.5], WENT: [0, 0.5], WX_LIGHTNING: [0, 1], WX_TORNADO: [0, 1], SS: [0, 1.5], RW: [0, 1.5]
  });

  const PRESETS = {
    default: { ...DEFAULTS },
    clear: {
      T1: 1.1, T2: 0.12, T3: 1.2, T4: 0.2, T5: 2.0, T6: 0.02,
      T7: 0.05, T8: 1, T9: 0.72, T10: 1.3, T11: 1, T12: 1, T13: 1, T16: 0.7,
      C1: 0.97, C2: 0.25, C3: 0.24, C4: 0.34, C5: 0.045, C6: 0.28,
      C7: 150, C8: 0.2, C9: 0, C10: 10, C11: 0.08,
      C16: 0.45, C17: 0.85, C18: 0, C19: 1.0, C28: 0.8, C29: 300, C30: 0.010, C31: 230, C22: 1
    },
    maritime: {
      T1: 1.8, T2: 0.28, T3: 3.2, T4: 0.8, T5: 3.4, T6: 0,
      T7: 0.06, T8: 1, T9: 0.76, T10: 0.3, T11: 1, T12: 1, T13: 1, T16: 1,
      C1: 0.95, C2: 0.32, C3: 0.34, C4: 0.36, C5: 0.06, C6: 0.36,
      C7: 190, C8: 0.3, C9: 0, C10: 10, C11: 0.08,
      C16: 0.65, C17: 0.78, C18: 0, C19: 1.1, C28: 0.9, C29: 320, C30: 0.012, C31: 250, C22: 1
    },
    dusty: {
      T1: 2.8, T2: 0.45, T3: 7.5, T4: 1.1, T5: 4.5, T6: 0.55,
      T7: 0.18, T8: 1, T9: 0.62, T10: 0.4, T11: 1, T12: 1, T13: 1, T16: 1.15,
      C1: 0.94, C2: 0.38, C3: 0.28, C4: 0.34, C5: 0.055, C6: 0.32,
      C7: 170, C8: 0.3, C9: 0, C10: 10, C11: 0.08,
      C16: 0.6, C17: 0.78, C18: 0, C19: 1.15, C28: 0.88, C29: 320, C30: 0.012, C31: 250, C22: 1
    }
  };

  const CLOUD_MODES = ["自動混合", "積雲", "積乱雲", "層積雲", "高積雲", "巻雲", "層雲", "乱層雲", "高層雲", "巻層雲", "巻積雲"];
  const CLOUD_PRESETS = {
    mixed: { CM: 0, CC: 0.62, CB: 250, CT: 14500, IR: 0.78, IF: 0.68, C10: 10, C11: 0.08, C30: 0.028, C31: 105 },
    cumulus: { CM: 1, CC: 0.48, CB: 700, CT: 7800, IR: 0.35, IF: 0.30, C10: 10, C11: 0.08, C30: 0.030, C31: 90 },
    storm: { CM: 2, CC: 0.86, CB: 250, CT: 15800, IR: 0.15, IF: 0.85, C10: 13, C11: 0.10, C16: 1.35, C3: 0.46, C6: 0.48, C30: 0.028, C31: 95 },
    stratocumulus: { CM: 3, CC: 0.72, CB: 250, CT: 6200, IR: 0.25, IF: 0.18, C10: 11, C11: 0.09, C30: 0.020, C31: 160 },
    altocumulus: { CM: 4, CC: 0.58, CB: 1800, CT: 10500, IR: 0.58, IF: 0.42, C10: 9, C11: 0.08, C30: 0.023, C31: 120 },
    cirrus: { CM: 5, CC: 0.55, CB: 6200, CT: 16000, IR: 0.42, IF: 0.95, C10: 6, C11: 0.06, C30: 0.015, C31: 220 },
    stratus: { CM: 6, CC: 0.78, CB: 150, CT: 1400, IR: 0.15, IF: 0.16, C10: 12, C11: 0.10 },
    nimbostratus: { CM: 7, CC: 0.92, CB: 450, CT: 7800, IR: 0.20, IF: 0.30, C10: 14, C11: 0.12 },
    altostratus: { CM: 8, CC: 0.75, CB: 2200, CT: 8500, IR: 0.52, IF: 0.55, C10: 9, C11: 0.08 },
    cirrostratus: { CM: 9, CC: 0.60, CB: 7500, CT: 12500, IR: 0.40, IF: 0.92, C10: 6, C11: 0.05 },
    cirrocumulus: { CM: 10, CC: 0.52, CB: 6500, CT: 10500, IR: 0.45, IF: 0.90, C10: 6, C11: 0.05 }
  };

  const IMPLEMENTED = ["T0", "C0"];
  const APPROXIMATED = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T16", "SS", "RW",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
    "C16", "C17", "C18", "C19", "C22", "C28", "C29", "C30", "C31", "CM", "CQ", "IR", "IF", "LG", "LGI"
  ];
  const UNSUPPORTED = [
    "T14", "T15", "C12", "C20", "C21",
    "C23", "C24", "C25", "C26", "C27", "C32", "C33", "C34", "C36", "C37"
  ];

  let old = window[GLOBAL_KEY];
  if (old && typeof old.destroy === "function") {
    try { old.destroy({ silent: true }); } catch (e) { console.warn(e); }
  }
  for (const legacyKey of ["__ATMOSPHEREMOD_GEOFS_190__", "__ATMOSPHEREMOD_GEOFS_180__", "__ATMOSPHEREMOD_GEOFS_170__", "__ATMOSPHEREMOD_GEOFS_168__", "__ATMOSPHEREMOD_GEOFS_167__", "__ATMOSPHEREMOD_GEOFS_166__", "__ATMOSPHEREMOD_GEOFS_165__", "__ATMOSPHEREMOD_GEOFS_160__", "__ATMOSPHEREMOD_GEOFS_152__", "__ATMOSPHEREMOD_GEOFS_150__", "__ATMOSPHEREMOD_GEOFS_140__", "__ATMOSPHEREMOD_GEOFS_130__", "__ATMOSPHEREMOD_GEOFS_120__", "__ATMOSPHEREMOD_GEOFS_110__", "__ATMOSPHEREMOD_GEOFS_100__", "__ATMOSPHEREMOD_GEOFS_093__", "__ATMOSPHEREMOD_GEOFS_092__", "__ATMOSPHEREMOD_GEOFS_091__", "__ATMOSPHEREMOD_GEOFS_090__", "__ATMOSPHEREMOD_GEOFS_081__", "__ATMOSPHEREMOD_GEOFS_080__"]) {
    try { if (window[legacyKey]?.destroy) window[legacyKey].destroy({ silent: true }); } catch (_) {}
  }
  document.getElementById("amgfs111-root")?.remove();
  document.getElementById("amgfs190-root")?.remove();
  document.getElementById("amgfs180-root")?.remove();
  document.getElementById("amgfs180-menu-item")?.remove();
  document.getElementById("amgfs170-root")?.remove();
  document.getElementById("amgfs190-menu-item")?.remove();
  document.getElementById("amgfs168-root")?.remove();
  document.getElementById("amgfs167-root")?.remove();
  document.getElementById("amgfs166-root")?.remove();
  document.getElementById("amgfs165-root")?.remove();
  document.getElementById("amgfs160-root")?.remove();
  document.getElementById("amgfs152-root")?.remove();
  document.getElementById("amgfs150-root")?.remove();
  document.getElementById("amgfs140-root")?.remove();
  document.getElementById("amgfs130-root")?.remove();
  document.getElementById("amgfs120-root")?.remove();
  document.getElementById("amgfs110-root")?.remove();
  document.getElementById("amgfs100-root")?.remove();
  document.getElementById("amgfs093-root")?.remove();
  document.getElementById("amgfs092-root")?.remove();
  document.getElementById("amgfs091-root")?.remove();
  document.getElementById("amgfs090-root")?.remove();
  document.getElementById("amgfs081-root")?.remove();
  document.getElementById("amgfs080-root")?.remove();

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) {}
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.190.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    }
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.180.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    }
    if (Number(saved.C30) === 0.034 && Number(saved.C31) === 170) {
      saved = { ...saved, C30: 0.028, C31: 105 };
    }
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.150.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    }
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.140.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      if (Object.keys(saved).length && Number(saved.C30) === 0.024 && Number(saved.C31) === 300) {
        saved = { ...saved, C30: 0.027, C31: 220 };
      };
    }
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.130.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.120.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.110.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      if (!Object.keys(saved).length) {
        try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.093.settings") || "{}"); } catch (_) {}
      }
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      if (!Object.keys(saved).length) {
        try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.091.settings") || "{}"); } catch (_) {}
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      }
      if (!Object.keys(saved).length) {
        try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.090.settings") || "{}"); } catch (_) {}
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
      }
      }
      }
    }
    const value = { ...DEFAULTS, ...saved };
    for (const [k, range] of Object.entries(LIMITS)) value[k] = clamp(finite(value[k], DEFAULTS[k]), range[0], range[1]);
    for (const k of ["T0", "C0", "T8", "T13", "C22", "CG", "WX", "NWP", "LG", "WX_LIGHTNING", "WX_TORNADO"]) value[k] = value[k] ? 1 : 0;
    value.CM = Math.round(clamp(value.CM, 0, 10));
    value.CQ = Math.round(clamp(value.CQ, 1, 3));
    return value;
  }

  function loadMasterEnabled() {
    try {
      const current = localStorage.getItem(MASTER_KEY);
      if (current !== null) return current !== "false" && current !== "0";
      const prior = localStorage.getItem("atmospheremod.geofs.190.enabled");
      return prior === null ? true : prior !== "false" && prior !== "0";
    } catch (_) { return true; }
  }

  const NWP_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
  const NWP_SURFACE_FIELDS = [
    "temperature_2m", "dew_point_2m", "relative_humidity_2m", "surface_pressure",
    "pressure_msl", "visibility", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "precipitation", "rain", "snowfall", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
    "cape", "lifted_index", "convective_inhibition", "freezing_level_height", "boundary_layer_height",
    "wet_bulb_temperature_2m", "vapour_pressure_deficit", "total_column_integrated_water_vapour",
    "lightning_potential", "lightning_density", "updraft", "snowfall_height", "weather_code",
    "shortwave_radiation", "direct_radiation", "diffuse_radiation", "convective_cloud_base", "convective_cloud_top"
  ];
  const NWP_HOURLY_FIELDS = [...NWP_SURFACE_FIELDS, ...NWP_LEVELS.flatMap(level => [
    `temperature_${level}hPa`, `dew_point_${level}hPa`, `relative_humidity_${level}hPa`,
    `wind_speed_${level}hPa`, `wind_direction_${level}hPa`, `vertical_velocity_${level}hPa`,
    `geopotential_height_${level}hPa`, `cloud_cover_${level}hPa`
  ])];

  const state = {
    settings: loadSettings(), masterEnabled: loadMasterEnabled(),
    geofs: null, Cesium: null, atmosphere: null, shaders: null, original: null, weather: null, physics: null,
    root: null, menuItem: null, compatible: false, applied: false, destroyed: false, lastPhysicsSignature: "", lastNativeWeatherDefinition: null,
    lensGhostStage: null, lensGhostScene: null, lensGhostFrameCache: null, lensGhostFrameCacheNumber: -1,
    timer: 0, waitTimer: 0, rebuildTimer: 0, lastWeatherSignature: "",
    lastColorSignature: "", lastStatus: "", keyHandler: null, weatherHandler: null,
    nwpProfile: null, nwpStatus: "未取得", nwpLastFetch: 0, nwpLastCoords: null, nwpInFlight: false, nwpTimer: 0,
    atmosphereShaderReady: false, weatherFxTimers: [],
    nativeLighting: { manager: null, globe: null, originalDayNightUpdate: null, originalGlobeSetColours: null, dayNightWrapper: null, globeWrapper: null, baseSunColor: null, baseSunSource: null, lastSunOutput: null, baseWaterColors: null, lastSunSignature: "", lastWaterSignature: "" },
    weatherFx: { lightningNextAt: 0, lightningCollections: [], flashOverlay: null, tornado: null, tornadoLines: null, tornadoPoints: null, tornadoLastBuild: 0, lastEventText: "待機中" }
  };
  const S = state.settings;

  function weatherObject() {
    return window.weather && window.weather.definition ? window.weather : null;
  }

  function weatherMetrics() {
    const w = weatherObject();
    const d = w?.definition || {};
    const nwp = activeNwpProfile();
    const surface = nwp?.surface;
    const visibility = clamp(finite(surface?.visibilityM, finite(d.visibility, 10000)), 500, 100000);
    const temp = finite(surface?.temperatureC, finite(d.airTemperatureSL, 15));
    const dew = finite(surface?.dewPointC, finite(d.dewPointSL, finite(d.dewPoint, temp - 7)));
    const humidity = clamp(finite(surface?.relativeHumidity, Math.exp(
      (17.625 * dew) / (243.04 + dew) - (17.625 * temp) / (243.04 + temp)
    )), 0, 1);
    const visFactor = clamp(Math.pow(10000 / visibility, 0.45), 0.62, 1.7);
    const humidityFactor = 0.76 + humidity * 0.38;
    const nwpFog = nwp ? clamp((1 - Math.max(0, temp - dew) / 5) * humidity, 0, 1) : 0;
    const fogFactor = 1 + Math.max(clamp(finite(d.fogDensity, 0), 0, 1) * 0.25, nwpFog * 0.18);
    const nwpPrecip = nwp ? clamp(Math.max(0, finite(surface?.precipitationMmH, 0)) / 12, 0, 1) : 0;
    const precipFactor = 1 + Math.max(clamp(finite(d.precipitationAmount, 0), 0, 1), nwpPrecip) * 0.12;
    const raw = visFactor * humidityFactor * fogFactor * precipFactor;
    const linked = S.T13 ? clamp(raw * S.T16, 0.45, 2.2) : 1;
    return { visibility, humidity, factor: linked, raw, temperature: temp, dewPoint: dew, definition: d, source: nwp ? "Open-Meteo NWP" : "GeoFS" };
  }

  // -----------------------------------------------------------------------
  // Reduced-order atmospheric physics core.
  // GeoFS exposes a surface/METAR summary, not a full vertical sounding.
  // CAPE/CIN are therefore diagnosed against a configurable synthetic
  // environmental lapse-rate profile and are labelled as estimates in the UI.
  // -----------------------------------------------------------------------
  const METEO = Object.freeze({
    g: 9.80665, Rd: 287.05, Rv: 461.5, Cp: 1004.0, Lv: 2.5e6,
    epsilon: 0.622, dryLapse: 9.80665 / 1004.0, maxProfileHeight: 18000
  });

  function saturationVaporPressureHpa(tempC) {
    const t = clamp(tempC, -90, 60);
    if (t >= 0) return 6.1121 * Math.exp((18.678 - t / 234.5) * (t / (257.14 + t)));
    return 6.1115 * Math.exp((23.036 - t / 333.7) * (t / (279.82 + t)));
  }

  function mixingRatioFromVaporPressure(eHpa, pHpa) {
    const e = clamp(eHpa, 0, Math.max(0, pHpa - 0.1));
    return METEO.epsilon * e / Math.max(pHpa - e, 0.1);
  }

  function saturationMixingRatio(tempC, pHpa) {
    return mixingRatioFromVaporPressure(saturationVaporPressureHpa(tempC), pHpa);
  }

  function wetBulbPsychrometric(tempC, dewC, pressureHpa) {
    const vapor = saturationVaporPressureHpa(dewC);
    let lo = Math.min(tempC, dewC), hi = Math.max(tempC, dewC);
    for (let i = 0; i < 36; i++) {
      const tw = (lo + hi) * 0.5;
      const psychro = (tw < 0 ? 0.00058 : 0.00066) * (1 + 0.00115 * tw);
      const residual = saturationVaporPressureHpa(tw) - psychro * pressureHpa * (tempC - tw) - vapor;
      if (residual > 0) hi = tw; else lo = tw;
    }
    return (lo + hi) * 0.5;
  }

  function wetBulbStull(tempC, rh, dewC, pressureHpa) {
    const t = clamp(tempC, -20, 50), h = clamp(rh * 100, 5, 99);
    if (tempC < -20 || tempC > 50 || rh < 0.05 || rh > 0.99) {
      return wetBulbPsychrometric(tempC, dewC, pressureHpa);
    }
    return t * Math.atan(0.151977 * Math.sqrt(h + 8.313659))
      + Math.atan(t + h) - Math.atan(h - 1.676331)
      + 0.00391838 * Math.pow(h, 1.5) * Math.atan(0.023101 * h) - 4.686035;
  }

  function windShearDiagnostics(weather) {
    const layers = Array.isArray(weather?.windLayers) ? weather.windLayers.slice() : [];
    if (layers.length < 2) return { shearMsPerKm: 0, east: 0, north: 0, depthM: 0 };
    layers.sort((a, b) => finite(a.floor, 0) - finite(b.floor, 0));
    const lo = layers[0], hi = layers[layers.length - 1];
    const vector = layer => {
      if (Array.isArray(layer?.vectorMs) && layer.vectorMs.length >= 2) return [finite(layer.vectorMs[0], 0), finite(layer.vectorMs[1], 0)];
      const direction = finite(layer?.mainDirection, finite(layer?.direction, 0)) * Math.PI / 180;
      const speed = finite(layer?.speedMs, finite(layer?.speed, 0));
      return [Math.sin(direction) * speed, Math.cos(direction) * speed];
    };
    const a = vector(lo), b = vector(hi);
    const dz = Math.max(500, finite(hi.floor, finite(hi.ceiling, 7000)) - finite(lo.floor, 0));
    const east = (b[0] - a[0]) / (dz / 1000);
    const north = (b[1] - a[1]) / (dz / 1000);
    return { shearMsPerKm: Math.hypot(east, north), east, north, depthM: dz };
  }

  function orographicLiftDiagnostic(weather, definition) {
    const G = state.geofs;
    const loc = G?.aircraft?.instance?.llaLocation || G?.camera?.lla;
    if (!loc || typeof G?.api?.getGroundAltitude !== "function") return 0;
    const lat = finite(loc[0], 0), lon = finite(loc[1], 0);
    const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    const dLat = 1000 / 111132, dLon = 1000 / (111320 * cosLat);
    try {
      const sample = (la, lo) => finite(G.api.getGroundAltitude([la, lo, 0]), NaN);
      const n = sample(lat + dLat, lon), s0 = sample(lat - dLat, lon);
      const e = sample(lat, lon + dLon), w = sample(lat, lon - dLon);
      if (![n, s0, e, w].every(Number.isFinite)) return 0;
      const gradNorth = (n - s0) / 2000, gradEast = (e - w) / 2000;
      const from = finite(definition?.windDirection, finite(weather?.currentWindDirection, 0));
      const to = (from + 180) * Math.PI / 180;
      const speed = finite(definition?.windSpeedMS, finite(weather?.currentWindSpeedMs, 0));
      return clamp(speed * (Math.sin(to) * gradEast + Math.cos(to) * gradNorth), -3, 3);
    } catch (_) { return 0; }
  }

  function precipitationProxy(definition) {
    return clamp(finite(definition?.precipitationAmount, 0), 0, 1);
  }

  function computeWeatherPhysicsNative(definitionOverride) {
    const weather = weatherObject();
    const d = definitionOverride || weather?.definition || {};
    const tempC = clamp(finite(d.airTemperatureSL, 15), -60, 55);
    const dewC = clamp(Math.min(tempC, finite(d.dewPointSL, finite(d.dewPoint, tempC - 7))), -80, tempC);
    const pressurePa = clamp(finite(d.airPressureSL, 101325), 50000, 110000);
    const p0 = pressurePa / 100;
    const esT = saturationVaporPressureHpa(tempC);
    const e = saturationVaporPressureHpa(dewC);
    const rh = clamp(e / Math.max(esT, 0.01), 0, 1);
    const q0 = mixingRatioFromVaporPressure(e, p0);
    const wetBulbC = wetBulbStull(tempC, rh, dewC, p0);

    // Bolton's LCL temperature relation, then a hydrostatic height estimate.
    const tK = tempC + 273.15, tdK = dewC + 273.15;
    const tlclK = 1 / (1 / Math.max(tdK - 56, 150) + Math.log(tK / tdK) / 800) + 56;
    const plcl = p0 * Math.pow(clamp(tlclK / tK, 0.2, 1), METEO.Cp / METEO.Rd);
    const lclM = clamp(-(METEO.Rd * (tK + tlclK) * 0.5 / METEO.g) * Math.log(plcl / p0), 0, 16000);
    const envLapse = clamp(finite(S.WLR, 6.5), 4.0, 9.5) / 1000;
    const entrainment = clamp(finite(S.WENT, 0.12), 0, 0.5);
    const dz = 100;
    let pressure = p0, previousEnvK = tK, parcelK = tK;
    let lfcM = NaN, elM = NaN, cape = 0, cin = 0;
    let previousBuoyancy = 0, afterLfc = false, endedPositive = false;
    let freezingLevelM = tempC <= 0 ? 0 : METEO.maxProfileHeight;
    let foundFreezing = tempC <= 0;

    for (let z = 0; z <= METEO.maxProfileHeight; z += dz) {
      const envC = tempC - Math.min(z, 11000) * envLapse;
      const envK = Math.max(170, envC + 273.15);
      if (z > 0) {
        pressure *= Math.exp(-METEO.g * dz / (METEO.Rd * Math.max(180, (previousEnvK + envK) * 0.5)));
      }
      const pHpa = Math.max(1, pressure);
      if (z <= lclM) {
        parcelK = tK * Math.pow(pressure / p0, METEO.Rd / METEO.Cp);
      } else {
        const parcelCprev = parcelK - 273.15;
        const rs = saturationMixingRatio(parcelCprev, pHpa);
        const temp = Math.max(180, parcelK);
        const gammaM = METEO.g * (1 + METEO.Lv * rs / (METEO.Rd * temp)) /
          (METEO.Cp + (METEO.Lv * METEO.Lv * METEO.epsilon * rs) / (METEO.Rd * temp * temp));
        parcelK -= gammaM * dz;
        const mix = 1 - Math.exp(-entrainment * dz / 1000);
        parcelK = parcelK * (1 - mix) + envK * mix;
      }
      const envDewC = dewC - z * 0.0018;
      const envQ = mixingRatioFromVaporPressure(saturationVaporPressureHpa(envDewC), pHpa);
      const parcelQ = z <= lclM ? q0 : saturationMixingRatio(parcelK - 273.15, pHpa);
      const envTv = envK * (1 + 0.61 * envQ);
      const parcelTv = parcelK * (1 + 0.61 * parcelQ);
      const buoyancy = METEO.g * (parcelTv - envTv) / Math.max(envTv, 150);

      if (!foundFreezing && envC <= 0) { freezingLevelM = z; foundFreezing = true; }
      if (z >= lclM && !afterLfc && buoyancy > 0) { lfcM = z; afterLfc = true; }
      if (!afterLfc) {
        if (z > 0) cin += (Math.max(0, -previousBuoyancy) + Math.max(0, -buoyancy)) * 0.5 * dz;
      } else if (!endedPositive) {
        if (buoyancy > 0 || previousBuoyancy > 0) {
          cape += Math.max(0, (Math.max(0, previousBuoyancy) + Math.max(0, buoyancy)) * 0.5 * dz);
        }
        if (z > lfcM + 200 && buoyancy <= 0 && previousBuoyancy > 0) { elM = z; endedPositive = true; }
      }
      previousBuoyancy = buoyancy;
      previousEnvK = envK;
    }

    if (!Number.isFinite(lfcM)) { cape = 0; lfcM = NaN; elM = NaN; }
    else if (!Number.isFinite(elM)) elM = 16000;
    const shear = windShearDiagnostics(weather);
    const upslope = orographicLiftDiagnostic(weather, d);
    const capeIndex = clamp(cape / 2200, 0, 1);
    const shearIndex = clamp(shear.shearMsPerKm / 20, 0, 1);
    const windSpeed = finite(d.windSpeedMS, finite(weather?.currentWindSpeedMs, 0));
    const gustSpeed = Math.max(windSpeed, finite(d.windGustMS, windSpeed));
    const gustSpread = Math.max(0, gustSpeed - windSpeed);
    const gustIndex = clamp(gustSpread / 18, 0, 1);
    const convectiveIndex = clamp(capeIndex * 0.82 + Math.max(0, upslope) * 0.06 + shearIndex * 0.12, 0, 1);
    const updraftVelocityMs = clamp(Math.sqrt(2 * Math.max(0, cape)) * 0.65, 0, 60);
    const turbulenceIndex = clamp(shearIndex * 0.58 + gustIndex * 0.24 + convectiveIndex * 0.18, 0, 1);
    const dewPointDepressionC = Math.max(0, tempC - dewC);
    const vaporPressureDeficitHpa = Math.max(0, esT - e);
    const downdraftPotential = clamp((precipitationProxy(d) * 0.45) + clamp((tempC - wetBulbC) / 12, 0, 1) * 0.35 + convectiveIndex * 0.20, 0, 1);
    const base = clamp(finite(d.cloudBase, lclM), 0, 15000);
    const nativeTop = clamp(finite(d.cloudTop, base + 3000), base + 500, 18000);
    const convectiveTop = clamp(Math.max(nativeTop, Number.isFinite(elM) ? elM : lclM + 1200), base + 500, 18000);
    // GeoFS weather.definition bounds precipitationAmount and thunderstorm to [0, 1].
    const precip01 = clamp(finite(d.precipitationAmount, 0), 0, 1);
    const thunderObs = clamp(finite(d.thunderstorm, 0), 0, 1);
    const mixedLayer = Math.max(0, Math.min(nativeTop, freezingLevelM + 6500) - Math.max(base, freezingLevelM - 1500));
    const mixedPhaseOverlap = clamp(mixedLayer / 4500, 0, 1);
    const lightningPotential = clamp(Math.max(thunderObs, convectiveIndex * 0.85) *
      smoothstepSafe(650, 1700, cape) * mixedPhaseOverlap, 0, 1);
    const fogSpread = dewPointDepressionC;
    const fogPotential = clamp((1 - fogSpread / 5) * rh * (1 - clamp(windSpeed / 12, 0, 1)), 0, 1);
    const iceFraction = clamp((nativeTop - freezingLevelM) / Math.max(500, nativeTop - base), 0, 1);
    const warmCloudDepth = clamp(freezingLevelM - base, 0, Math.max(500, nativeTop - base));
    const warmRainPotential = clamp((warmCloudDepth / 3000) * rh * (1 - iceFraction), 0, 1);
    const bergeronPotential = clamp(mixedPhaseOverlap * rh * (0.45 + 0.55 * iceFraction) * (0.35 + 0.65 * convectiveIndex), 0, 1);
    const rimingPotential = clamp(mixedPhaseOverlap * precip01 * (0.35 + 0.65 * convectiveIndex), 0, 1);
    const hailPotential = clamp(capeIndex * (updraftVelocityMs / 35) * mixedPhaseOverlap, 0, 1);
    const evaporativeCoolingPotential = clamp((tempC - wetBulbC) / 10, 0, 1) * precip01;
    let phase = "rain";
    if (wetBulbC <= -1.0) phase = "snow";
    else if (wetBulbC < 1.0) phase = "mixed / uncertain";
    return {
      tempC, dewC, rh, wetBulbC, pressurePa, q0, lclM, lclTempC: tlclK - 273.15,
      cape: Math.max(0, cape), cin: -Math.max(0, cin),
      lfcM: Number.isFinite(lfcM) ? lfcM : null,
      elM: Number.isFinite(elM) ? elM : null,
      freezingLevelM, iceFraction, shearMsPerKm: shear.shearMsPerKm,
      shearEast: shear.east, shearNorth: shear.north, upslopeMs: upslope,
      convectiveIndex, convectiveTopM: convectiveTop, fogPotential, precip01,
      thunderObs, lightningPotential, mixedPhaseOverlap, phase,
      mixingRatioGkg: q0 * 1000, vaporPressureDeficitHpa, dewPointDepressionC,
      updraftVelocityMs, turbulenceIndex, gustSpreadMs: gustSpread, downdraftPotential,
      warmRainPotential, bergeronPotential, rimingPotential, hailPotential, evaporativeCoolingPotential,
      source: d.METAR ? "METAR + simplified parcel profile" : "surface inputs + synthetic environmental profile"
    };
  }

  function hourlyAt(hourly, key, index) {
    const values = hourly?.[key];
    if (!Array.isArray(values)) return NaN;
    return finite(values[index], NaN);
  }

  function nearestHourlyIndex(times, now = Date.now()) {
    if (!Array.isArray(times) || !times.length) return -1;
    let best = -1, delta = Infinity;
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i]);
      if (!Number.isFinite(t)) continue;
      const d = Math.abs(t - now);
      if (d < delta) { best = i; delta = d; }
    }
    return best;
  }

  function parseNwpResponse(data, lat, lon, groundElevation = 0) {
    const hourly = data?.hourly;
    const index = nearestHourlyIndex(hourly?.time);
    if (!hourly || index < 0) throw new Error("NWP hourly forecast is empty");
    const surfacePressureRaw = hourlyAt(hourly, "surface_pressure", index);
    const surfacePressureHpa = clamp(Number.isFinite(surfacePressureRaw) ? surfacePressureRaw : hourlyAt(hourly, "pressure_msl", index), 350, 1100);
    const modelTime = String(hourly.time[index]);
    const levels = [];
    for (const pressureHpa of NWP_LEVELS) {
      const temperatureC = hourlyAt(hourly, `temperature_${pressureHpa}hPa`, index);
      let dewPointC = hourlyAt(hourly, `dew_point_${pressureHpa}hPa`, index);
      const relativeHumidity = hourlyAt(hourly, `relative_humidity_${pressureHpa}hPa`, index);
      const windSpeedMs = hourlyAt(hourly, `wind_speed_${pressureHpa}hPa`, index);
      const windDirectionDeg = hourlyAt(hourly, `wind_direction_${pressureHpa}hPa`, index);
      let heightM = hourlyAt(hourly, `geopotential_height_${pressureHpa}hPa`, index);
      const cloudCover = hourlyAt(hourly, `cloud_cover_${pressureHpa}hPa`, index);
      const verticalVelocityPaS = hourlyAt(hourly, `vertical_velocity_${pressureHpa}hPa`, index);
      if (!Number.isFinite(temperatureC) || pressureHpa >= surfacePressureHpa - 2) continue;
      if (!Number.isFinite(heightM)) {
        heightM = 44330 * (1 - Math.pow(pressureHpa / 1013.25, 0.1903));
      }
      if (!Number.isFinite(dewPointC) && Number.isFinite(relativeHumidity)) {
        const rh = clamp(relativeHumidity / 100, 0.01, 1);
        const e = rh * saturationVaporPressureHpa(temperatureC);
        const ln = Math.log(Math.max(e, 0.01) / 6.1121);
        dewPointC = 243.04 * ln / (17.625 - ln);
      }
      if (!Number.isFinite(dewPointC)) dewPointC = temperatureC - 10;
      levels.push({
        pressureHpa, heightM, temperatureC, dewPointC,
        relativeHumidity: Number.isFinite(relativeHumidity) ? clamp(relativeHumidity / 100, 0, 1) : null,
        windSpeedMs: Number.isFinite(windSpeedMs) ? Math.max(0, windSpeedMs) : null,
        windDirectionDeg: Number.isFinite(windDirectionDeg) ? ((windDirectionDeg % 360) + 360) % 360 : null,
        verticalVelocityPaS: Number.isFinite(verticalVelocityPaS) ? verticalVelocityPaS : null,
        cloudCover: Number.isFinite(cloudCover) ? clamp(cloudCover / 100, 0, 1) : null
      });
    }
    levels.sort((a, b) => a.heightM - b.heightM);
    if (levels.length < 4) throw new Error(`NWP profile has only ${levels.length} usable pressure levels`);

    // Approximate cloud layers from contiguous pressure surfaces with model cloud fraction.
    const cloudy = levels.filter(level => level.cloudCover !== null && level.cloudCover >= 0.22);
    const groups = [];
    for (const level of cloudy) {
      const last = groups[groups.length - 1];
      if (!last || level.heightM - last[last.length - 1].heightM > 3200) groups.push([level]);
      else last.push(level);
    }
    const cloudLayers = groups.slice(0, 5).map(group => {
      const first = group[0], last = group[group.length - 1];
      const below = levels.filter(l => l.heightM < first.heightM).at(-1);
      const above = levels.find(l => l.heightM > last.heightM);
      const base = Math.max(groundElevation, below ? (below.heightM + first.heightM) * 0.5 : first.heightM - 700);
      const top = Math.max(base + 350, above ? (above.heightM + last.heightM) * 0.5 : last.heightM + 900);
      return { baseM: base, topM: top, coverage: Math.max(...group.map(l => l.cloudCover || 0)), levels: group.map(l => l.pressureHpa) };
    });

    const surfaceTemp = hourlyAt(hourly, "temperature_2m", index);
    const surfaceDew = hourlyAt(hourly, "dew_point_2m", index);
    const surfaceCloud = hourlyAt(hourly, "cloud_cover", index);
    const profile = {
      provider: "Open-Meteo", model: data?.generationtime_ms !== undefined ? "Open-Meteo forecast model" : "Open-Meteo",
      fetchedAt: Date.now(), validTime: modelTime, latitude: lat, longitude: lon,
      groundElevationM: groundElevation, surfacePressureHpa,
      surface: {
        temperatureC: Number.isFinite(surfaceTemp) ? surfaceTemp : levels[0].temperatureC,
        dewPointC: Number.isFinite(surfaceDew) ? surfaceDew : levels[0].dewPointC,
        relativeHumidity: Number.isFinite(hourlyAt(hourly, "relative_humidity_2m", index)) ? clamp(hourlyAt(hourly, "relative_humidity_2m", index) / 100, 0, 1) : null,
        cloudCover: Number.isFinite(surfaceCloud) ? clamp(surfaceCloud / 100, 0, 1) : null,
        visibilityM: hourlyAt(hourly, "visibility", index),
        lowCloudCover: hourlyAt(hourly, "cloud_cover_low", index),
        midCloudCover: hourlyAt(hourly, "cloud_cover_mid", index),
        highCloudCover: hourlyAt(hourly, "cloud_cover_high", index),
        precipitationMmH: hourlyAt(hourly, "precipitation", index),
        rainMmH: hourlyAt(hourly, "rain", index),
        snowfallCmH: hourlyAt(hourly, "snowfall", index),
        windSpeedMs: hourlyAt(hourly, "wind_speed_10m", index),
        windDirectionDeg: hourlyAt(hourly, "wind_direction_10m", index),
        windGustMs: hourlyAt(hourly, "wind_gusts_10m", index),
        capeJkg: hourlyAt(hourly, "cape", index), liftedIndex: hourlyAt(hourly, "lifted_index", index),
        cinJkg: hourlyAt(hourly, "convective_inhibition", index),
        lightningPotentialJkg: hourlyAt(hourly, "lightning_potential", index),
        lightningDensity: hourlyAt(hourly, "lightning_density", index),
        modelUpdraftMs: hourlyAt(hourly, "updraft", index),
        snowfallHeightM: hourlyAt(hourly, "snowfall_height", index),
        weatherCode: hourlyAt(hourly, "weather_code", index),
        vapourPressureDeficitKpa: hourlyAt(hourly, "vapour_pressure_deficit", index),
        precipitableWaterMm: hourlyAt(hourly, "total_column_integrated_water_vapour", index),
        freezingLevelM: hourlyAt(hourly, "freezing_level_height", index),
        boundaryLayerHeightM: hourlyAt(hourly, "boundary_layer_height", index),
        wetBulbC: hourlyAt(hourly, "wet_bulb_temperature_2m", index),
        shortwaveWm2: hourlyAt(hourly, "shortwave_radiation", index),
        directWm2: hourlyAt(hourly, "direct_radiation", index),
        diffuseWm2: hourlyAt(hourly, "diffuse_radiation", index),
        convectiveCloudBaseM: hourlyAt(hourly, "convective_cloud_base", index),
        convectiveCloudTopM: hourlyAt(hourly, "convective_cloud_top", index)
      },
      levels, cloudLayers
    };
    if (!Number.isFinite(profile.surface.relativeHumidity)) {
      const t = profile.surface.temperatureC, td = profile.surface.dewPointC;
      profile.surface.relativeHumidity = clamp(saturationVaporPressureHpa(td) / saturationVaporPressureHpa(t), 0, 1);
    }
    return profile;
  }

  function activeNwpProfile() {
    const p = state.nwpProfile;
    return S.NWP && p && Date.now() - p.fetchedAt < 90 * 60 * 1000 ? p : null;
  }

  function nwpWindShear(profile) {
    const candidates = (profile?.levels || []).filter(l => Number.isFinite(l.windSpeedMs) && Number.isFinite(l.windDirectionDeg) && l.heightM <= profile.groundElevationM + 7500);
    if (candidates.length < 2) return null;
    const first = candidates[0], last = candidates[candidates.length - 1];
    const uv = l => {
      const d = l.windDirectionDeg * Math.PI / 180, sp = l.windSpeedMs;
      return [-sp * Math.sin(d), -sp * Math.cos(d)];
    };
    const a = uv(first), b = uv(last), depthKm = Math.max(0.5, (last.heightM - first.heightM) / 1000);
    const east = (b[0] - a[0]) / depthKm, north = (b[1] - a[1]) / depthKm;
    return { east, north, shearMsPerKm: Math.hypot(east, north), depthM: depthKm * 1000 };
  }

  function computeWeatherPhysicsNwp(definition, profile) {
    const s = profile.surface, ground = finite(profile.groundElevationM, 0);
    const tempC = clamp(finite(s.temperatureC, finite(definition?.airTemperatureSL, 15)), -90, 55);
    const dewC = clamp(Math.min(tempC, finite(s.dewPointC, finite(definition?.dewPointSL, tempC - 7))), -90, tempC);
    const p0 = clamp(profile.surfacePressureHpa, 350, 1100);
    const pressurePa = p0 * 100;
    const rh = clamp(finite(s.relativeHumidity, saturationVaporPressureHpa(dewC) / saturationVaporPressureHpa(tempC)), 0, 1);
    const q0 = mixingRatioFromVaporPressure(saturationVaporPressureHpa(dewC), p0);
    const wetBulbC = Number.isFinite(s.wetBulbC) ? clamp(s.wetBulbC, -90, tempC) : wetBulbStull(tempC, rh, dewC, p0);
    const points = [{ heightM: ground, temperatureC: tempC, dewPointC: dewC, pressureHpa: p0 }];
    for (const level of profile.levels) {
      if (level.heightM > ground + 150) points.push({ heightM: level.heightM, temperatureC: level.temperatureC, dewPointC: level.dewPointC, pressureHpa: level.pressureHpa });
    }
    points.sort((a, b) => a.heightM - b.heightM);
    const sample = (z, key) => {
      if (z <= points[0].heightM) return points[0][key];
      for (let i = 1; i < points.length; i++) {
        if (z <= points[i].heightM) {
          const a = points[i - 1], b = points[i], f = clamp((z - a.heightM) / Math.max(1, b.heightM - a.heightM), 0, 1);
          if (key === "pressureHpa") return Math.exp(lerp(Math.log(Math.max(1, a[key])), Math.log(Math.max(1, b[key])), f));
          return lerp(a[key], b[key], f);
        }
      }
      const last = points[points.length - 1];
      if (key === "pressureHpa") return last[key] * Math.exp(-(z - last.heightM) / 7500);
      if (key === "temperatureC") return last.temperatureC - (z - last.heightM) * 0.0065;
      return last.dewPointC - (z - last.heightM) * 0.0018;
    };
    const tK = tempC + 273.15, tdK = dewC + 273.15;
    const tlclK = 1 / (1 / Math.max(tdK - 56, 150) + Math.log(tK / tdK) / 800) + 56;
    const plcl = p0 * Math.pow(clamp(tlclK / tK, 0.2, 1), METEO.Cp / METEO.Rd);
    let lclAGL = 0;
    for (let z = ground; z <= ground + 12000; z += 50) {
      if (sample(z, "pressureHpa") <= plcl) { lclAGL = z - ground; break; }
      lclAGL = Math.min(12000, z - ground);
    }
    const lclM = ground + lclAGL;
    const dz = 100, maxZ = Math.min(22000, Math.max(12000, points[points.length - 1].heightM));
    let parcelK = tK, previousEnvK = tK, previousB = 0, cape = 0, cin = 0;
    let lfc = NaN, el = NaN, afterLfc = false, ended = false;
    let freezing = Number.isFinite(s.freezingLevelM) ? s.freezingLevelM : NaN;
    if (!Number.isFinite(freezing)) {
      for (let z = ground; z <= maxZ; z += dz) if (sample(z, "temperatureC") <= 0) { freezing = z; break; }
    }
    for (let z = ground; z <= maxZ; z += dz) {
      const envC = sample(z, "temperatureC"), envK = Math.max(170, envC + 273.15);
      const p = sample(z, "pressureHpa");
      if (z <= lclM) parcelK = tK * Math.pow(p / p0, METEO.Rd / METEO.Cp);
      else {
        const rs = saturationMixingRatio(parcelK - 273.15, p);
        const gamma = METEO.g * (1 + METEO.Lv * rs / (METEO.Rd * Math.max(180, parcelK))) /
          (METEO.Cp + METEO.Lv * METEO.Lv * METEO.epsilon * rs / (METEO.Rd * Math.max(180, parcelK) ** 2));
        parcelK -= gamma * dz;
        const mix = 1 - Math.exp(-clamp(S.WENT, 0, 0.5) * dz / 1000);
        parcelK = parcelK * (1 - mix) + envK * mix;
      }
      const envTd = sample(z, "dewPointC"), envQ = mixingRatioFromVaporPressure(saturationVaporPressureHpa(envTd), p);
      const parcelQ = z <= lclM ? q0 : saturationMixingRatio(parcelK - 273.15, p);
      const envTv = envK * (1 + 0.61 * envQ), parcelTv = parcelK * (1 + 0.61 * parcelQ);
      const buoyancy = METEO.g * (parcelTv - envTv) / Math.max(envTv, 150);
      if (!afterLfc) {
        if (z > ground) cin += (Math.max(0, -previousB) + Math.max(0, -buoyancy)) * 0.5 * dz;
        if (z >= lclM && buoyancy > 0) { lfc = z; afterLfc = true; }
      } else if (!ended) {
        cape += Math.max(0, (Math.max(0, previousB) + Math.max(0, buoyancy)) * 0.5 * dz);
        if (z > lfc + 200 && buoyancy <= 0 && previousB > 0) { el = z; ended = true; }
      }
      previousB = buoyancy; previousEnvK = envK;
    }
    if (!Number.isFinite(lfc)) { cape = 0; el = NaN; }
    else if (!Number.isFinite(el)) el = maxZ;
    const modelCape = Number.isFinite(s.capeJkg) ? Math.max(0, s.capeJkg) : NaN;
    const modelCin = Number.isFinite(s.cinJkg) ? Math.abs(s.cinJkg) : NaN;
    if (Number.isFinite(modelCape)) cape = 0.65 * modelCape + 0.35 * cape;
    if (Number.isFinite(modelCin)) cin = 0.65 * Math.abs(modelCin) + 0.35 * cin;
    const shear = nwpWindShear(profile) || windShearDiagnostics(weatherObject());
    const verticalMotion = profile.levels.map(level => {
      if (!Number.isFinite(level.verticalVelocityPaS)) return NaN;
      const kelvin = level.temperatureC + 273.15;
      const pressurePa = level.pressureHpa * 100;
      const density = pressurePa / (METEO.Rd * Math.max(170, kelvin));
      return -level.verticalVelocityPaS / Math.max(0.05, density * METEO.g);
    }).filter(Number.isFinite);
    const resolvedUpdraftMs = verticalMotion.length ? Math.max(0, ...verticalMotion) : 0;
    const windSpeed = finite(s.windSpeedMs, finite(definition?.windSpeedMS, 0));
    const gustSpeed = Math.max(windSpeed, finite(s.windGustMs, finite(definition?.windGustMS, windSpeed)));
    const gustSpread = Math.max(0, gustSpeed - windSpeed);
    const precip01 = clamp(Math.max(0, finite(s.precipitationMmH, 0)) / 12, 0, 1);
    const capeIndex = clamp(cape / 2500, 0, 1), shearIndex = clamp(shear.shearMsPerKm / 20, 0, 1);
    const upslope = orographicLiftDiagnostic(weatherObject(), { ...definition, windDirection: finite(s.windDirectionDeg, definition?.windDirection), windSpeedMS: windSpeed });
    const parcelUpdraftMs = clamp(Math.sqrt(2 * Math.max(0, cape)) * 0.65, 0, 65);
    const updraftVelocityMs = clamp(Math.max(parcelUpdraftMs, finite(s.modelUpdraftMs, 0), resolvedUpdraftMs), 0, 65);
    const updraftIndex = clamp(updraftVelocityMs / 35, 0, 1);
    const convectiveIndex = clamp(capeIndex * 0.68 + updraftIndex * 0.16 + Math.max(0, upslope) * 0.06 + shearIndex * 0.10, 0, 1);
    const turbulenceIndex = clamp(shearIndex * 0.58 + clamp(gustSpread / 18, 0, 1) * 0.24 + convectiveIndex * 0.18, 0, 1);
    const dewPointDepressionC = Math.max(0, tempC - dewC), esT = saturationVaporPressureHpa(tempC), e = saturationVaporPressureHpa(dewC);
    const cloudLayers = profile.cloudLayers || [];
    const nativeBase = finite(definition?.cloudBase, lclM), nativeTop = finite(definition?.cloudTop, nativeBase + 2500);
    const base = cloudLayers.length ? Math.min(...cloudLayers.map(l => l.baseM)) : nativeBase;
    const top = cloudLayers.length ? Math.max(...cloudLayers.map(l => l.topM)) : nativeTop;
    const freezingLevelM = Number.isFinite(freezing) ? freezing : (tempC <= 0 ? ground : ground + 10000);
    const mixedLayer = Math.max(0, Math.min(top, freezingLevelM + 6500) - Math.max(base, freezingLevelM - 1500));
    const mixedPhaseOverlap = clamp(mixedLayer / 4500, 0, 1);
    const iceFraction = clamp((top - freezingLevelM) / Math.max(500, top - base), 0, 1);
    const warmCloudDepth = clamp(freezingLevelM - base, 0, Math.max(500, top - base));
    const warmRainPotential = clamp((warmCloudDepth / 3000) * rh * (1 - iceFraction), 0, 1);
    const bergeronPotential = clamp(mixedPhaseOverlap * rh * (0.45 + 0.55 * iceFraction) * (0.35 + 0.65 * convectiveIndex), 0, 1);
    const rimingPotential = clamp(mixedPhaseOverlap * precip01 * (0.35 + 0.65 * convectiveIndex), 0, 1);
    const hailPotential = clamp(capeIndex * (updraftVelocityMs / 35) * mixedPhaseOverlap, 0, 1);
    const fogPotential = clamp((1 - dewPointDepressionC / 5) * rh * (1 - clamp(windSpeed / 12, 0, 1)), 0, 1);
    const downdraftPotential = clamp(precip01 * 0.5 + clamp((tempC - wetBulbC) / 12, 0, 1) * 0.3 + convectiveIndex * 0.2, 0, 1);
    let phase = wetBulbC <= -1 ? "snow" : wetBulbC < 1 ? "mixed / uncertain" : "rain";
    if (finite(s.snowfallCmH, 0) > finite(s.rainMmH, 0) && finite(s.snowfallCmH, 0) > 0.1) phase = "snow";
    return {
      tempC, dewC, rh, wetBulbC, pressurePa, q0, lclM, lclTempC: tlclK - 273.15,
      cape: Math.max(0, cape), modelCapeJkg: Number.isFinite(modelCape) ? modelCape : null,
      cin: -Math.max(0, cin), modelCinJkg: Number.isFinite(modelCin) ? -modelCin : null,
      lfcM: Number.isFinite(lfc) ? lfc : null, elM: Number.isFinite(el) ? el : null,
      freezingLevelM, iceFraction, shearMsPerKm: shear.shearMsPerKm, shearEast: shear.east, shearNorth: shear.north,
      upslopeMs: upslope, convectiveIndex, convectiveTopM: Number.isFinite(s.convectiveCloudTopM) ? s.convectiveCloudTopM : top,
      fogPotential, precip01, thunderObs: clamp(finite(definition?.thunderstorm, 0), 0, 1),
      lightningPotential: clamp(Math.max(
        Number.isFinite(s.lightningPotentialJkg) ? smoothstepSafe(0.1, 8.0, s.lightningPotentialJkg) : 0,
        convectiveIndex * mixedPhaseOverlap * smoothstepSafe(650, 1700, cape)
      ), 0, 1),
      lightningDensity: Number.isFinite(s.lightningDensity) ? s.lightningDensity : null,
      resolvedUpdraftMs, liftedIndex: Number.isFinite(s.liftedIndex) ? s.liftedIndex : null,
      precipitableWaterMm: Number.isFinite(s.precipitableWaterMm) ? s.precipitableWaterMm : null,
      vapourPressureDeficitKpa: Number.isFinite(s.vapourPressureDeficitKpa) ? s.vapourPressureDeficitKpa : null,
      solarRadiationWm2: finite(s.shortwaveWm2, 0), directRadiationWm2: finite(s.directWm2, 0), diffuseRadiationWm2: finite(s.diffuseWm2, 0),
      mixedPhaseOverlap, phase, mixingRatioGkg: q0 * 1000,
      vaporPressureDeficitHpa: Math.max(0, esT - e), dewPointDepressionC,
      updraftVelocityMs, turbulenceIndex, gustSpreadMs: gustSpread, downdraftPotential,
      warmRainPotential, bergeronPotential, rimingPotential, hailPotential,
      evaporativeCoolingPotential: clamp((tempC - wetBulbC) / 10, 0, 1) * precip01,
      cloudBaseM: base, cloudTopM: top,
      source: `Open-Meteo pressure-level profile (${profile.levels.length} levels)`,
      validTime: profile.validTime, cloudLayers
    };
  }

  function computeWeatherPhysics(definitionOverride) {
    const profile = activeNwpProfile();
    return profile ? computeWeatherPhysicsNwp(definitionOverride || weatherObject()?.definition || {}, profile)
      : computeWeatherPhysicsNative(definitionOverride);
  }

  function aircraftWeatherCoordinates() {
    const loc = state.geofs?.aircraft?.instance?.llaLocation || state.geofs?.camera?.lla;
    if (!loc || !Number.isFinite(Number(loc[0])) || !Number.isFinite(Number(loc[1]))) return null;
    return { lat: clamp(loc[0], -89.9, 89.9), lon: ((finite(loc[1], 0) + 180) % 360 + 360) % 360 - 180,
      altitude: finite(loc[2], 0) };
  }

  async function fetchNwpProfile(force = false) {
    if (!S.NWP || state.nwpInFlight || typeof window.fetch !== "function") return false;
    const coords = aircraftWeatherCoordinates();
    if (!coords) { state.nwpStatus = "航空機位置を取得できません"; refreshMetrics(); return false; }
    const now = Date.now();
    const moved = !state.nwpLastCoords || Math.hypot((coords.lat - state.nwpLastCoords.lat) * 111, (coords.lon - state.nwpLastCoords.lon) * 111 * Math.cos(coords.lat * Math.PI / 180)) > 25;
    if (!force && !moved && now - state.nwpLastFetch < 5 * 60 * 1000) return false;
    state.nwpInFlight = true;
    state.nwpLastFetch = now;
    state.nwpLastCoords = coords;
    state.nwpStatus = "数値予報データを取得中";
    refreshMetrics();
    const params = new URLSearchParams({
      latitude: coords.lat.toFixed(4), longitude: coords.lon.toFixed(4),
      hourly: NWP_HOURLY_FIELDS.join(","), timezone: "UTC", forecast_hours: "4", past_hours: "2",
      wind_speed_unit: "ms", temperature_unit: "celsius", precipitation_unit: "mm"
    });
    // Prefer JMA's seamless regional blend over Japan when the aircraft is in its regional domain.
    if (coords.lat >= 20 && coords.lat <= 55 && coords.lon >= 115 && coords.lon <= 160) params.set("models", "jma_seamless");
    try {
      const response = await window.fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (state.destroyed) return false;
      let ground = 0;
      try { ground = finite(state.geofs?.api?.getGroundAltitude?.([coords.lat, coords.lon, 0]), 0); } catch (_) {}
      const profile = parseNwpResponse(payload, coords.lat, coords.lon, ground);
      state.nwpProfile = profile; state.nwpLastFetch = Date.now(); state.nwpLastCoords = coords;
      state.nwpStatus = `取得済み · ${profile.validTime} UTC · ${profile.levels.length}層`;
      state.physics = computeWeatherPhysics();
      state.lastPhysicsSignature = physicsSignature(state.physics);
      scheduleRebuild(); refreshMetrics();
      return true;
    } catch (error) {
      state.nwpStatus = `取得失敗: ${error?.message || error}`;
      console.warn("[AtmosphereMod GeoFS] NWP fetch failed; using GeoFS weather", error);
      refreshMetrics();
      return false;
    } finally { state.nwpInFlight = false; }
  }

  function smoothstepSafe(a, b, x) {
    const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function physicsSignature(p) {
    if (!p) return "";
    return [Math.round(p.cape / 250), Math.round(p.lclM / 200), Math.round(p.freezingLevelM / 500),
      Math.round(p.shearEast / 1.5), Math.round(p.shearNorth / 1.5), Math.round(p.shearMsPerKm / 2),
      Math.round(p.upslopeMs / 0.25), Math.round(p.convectiveIndex * 10),
      Math.round(p.lightningPotential * 10), Math.round(p.fogPotential * 10),
      Math.round(p.turbulenceIndex * 10)].join("|");
  }

  function physicsCloudBaseTop(definition) {
    const d = definition || weatherObject()?.definition || {};
    const p = state.physics || computeWeatherPhysics(d);
    const hasMetar = typeof d.METAR === "string" && d.METAR.length > 0;
    const nativeBase = clamp(finite(d.cloudBase, 1000), 0, 15000);
    const nativeTop = clamp(finite(d.cloudTop, nativeBase + 3000), nativeBase + 500, 18000);
    const profile = activeNwpProfile();
    if (profile && !S.CG && p.cloudLayers?.length) return { base: clamp(p.cloudBaseM, 0, 18000), top: clamp(p.cloudTopM, p.cloudBaseM + 500, 22000) };
    if (!S.WX || S.CG || hasMetar || p.convectiveIndex < 0.38) return { base: nativeBase, top: nativeTop };
    const base = clamp(nativeBase * 0.72 + p.lclM * 0.28, 100, 12000);
    const top = clamp(Math.max(nativeTop, p.convectiveTopM), base + 500, 16000);
    return { base, top };
  }

  function weatherSignature() {
    const m = weatherMetrics(), d = m.definition;
    return [
      Math.round(m.visibility / 250) * 250,
      Math.round(m.humidity * 20) / 20,
      Math.round(finite(d.fogDensity, 0) * 20) / 20,
      Math.round(finite(d.precipitationAmount, 0) * 20) / 20,
      Math.round(finite(d.cloudBase, 0) / 100) * 100,
      Math.round(finite(d.cloudTop, 0) / 100) * 100,
      finite(d.airPressureSL, 0), Math.round(finite(d.airTemperatureSL, 0) * 2) / 2,
      Math.round(finite(d.dewPointSL, finite(d.dewPoint, 0)) * 2) / 2,
      Math.round(finite(d.windSpeedMS, 0)), Math.round(finite(d.windGustMS, 0)),
      Math.round(finite(d.windDirection, 0) / 5) * 5, Math.round(finite(d.thunderstorm, 0) * 100) / 100
    ].join("|");
  }

  // GeoFS localSeason is days-from-March-1 scaled by 0.27; its quarter points
  // represent the four northern-hemisphere seasons. Seasonal effects here are
  // small composition priors, not arbitrary season-colour presets.
  function seasonalClimateProfile(localSeason, latitudeOverride) {
    const raw = Number.isFinite(Number(localSeason)) ? Number(localSeason) : finite(window.weather?.localSeason, 37.5);
    const q = ((raw % 100) + 100) % 100;
    const latitude = finite(latitudeOverride, finite(state.geofs?.camera?.lla?.[0], finite(state.geofs?.aircraft?.instance?.llaLocation?.[0], 0)));
    const hemi = latitude < 0 ? -1 : 1;
    const localPosition = hemi < 0 ? (q + 50) % 100 : q;
    const thermalPhase = Math.sin((q / 100) * Math.PI * 2) * hemi;
    const name = localPosition < 25 ? "春" : localPosition < 50 ? "夏" : localPosition < 75 ? "秋" : "冬";
    return {
      localSeason: raw, seasonPosition: q, localSeasonPosition: localPosition, name, latitude,
      hemisphereSeason: thermalPhase,
      // Aerosol seasonal variation is intentionally weak; live visibility/RH dominate.
      aerosolScale: clamp(1 + 0.025 * thermalPhase, 0.94, 1.06),
      angstromOffset: -0.035 * thermalPhase,
      waterVaporScale: 1 + 0.025 * thermalPhase
    };
  }

  function solarGeometry() {
    const G = state.geofs, C = state.Cesium;
    const viewer = G?.api?.viewer, scene = viewer?.scene, camera = viewer?.camera;
    const localSeason = finite(window.weather?.localSeason, 37.5);
    const localTime = finite(window.weather?.localTime, 12);
    const cameraPosition = camera?.positionWC || G?.camera?.cam?.position;
    const sunCenter = scene?.sun?._boundingVolume?.center;
    const latitude = finite(G?.camera?.lla?.[0], finite(G?.aircraft?.instance?.llaLocation?.[0], 0));
    const longitude = finite(G?.camera?.lla?.[1], finite(G?.aircraft?.instance?.llaLocation?.[1], 0));
    if (C?.Cartesian3 && cameraPosition && sunCenter) {
      try {
        // GeoFS's own day/night code uses normalized Earth-centred sun and camera vectors.
        const up = C.Cartesian3.normalize(cameraPosition, new C.Cartesian3());
        const sun = C.Cartesian3.normalize(sunCenter, new C.Cartesian3());
        const dot = clamp(C.Cartesian3.dot(up, sun), -1, 1);
        let east = C.Cartesian3.cross(C.Cartesian3.UNIT_Z, up, new C.Cartesian3());
        if (C.Cartesian3.magnitude(east) < 1e-5) east = C.Cartesian3.cross(C.Cartesian3.UNIT_Y, up, east);
        C.Cartesian3.normalize(east, east);
        const north = C.Cartesian3.normalize(C.Cartesian3.cross(up, east, new C.Cartesian3()), new C.Cartesian3());
        const az = Math.atan2(C.Cartesian3.dot(sun, east), C.Cartesian3.dot(sun, north));
        const viewDir = camera?.directionWC;
        let viewAzimuthDeg = az * 180 / Math.PI;
        let viewElevationDeg = 0;
        let scatterCosine = null;
        if (viewDir) {
          viewAzimuthDeg = Math.atan2(C.Cartesian3.dot(viewDir, east), C.Cartesian3.dot(viewDir, north)) * 180 / Math.PI;
          viewElevationDeg = Math.asin(clamp(C.Cartesian3.dot(viewDir, up), -1, 1)) * 180 / Math.PI;
          // Full three-dimensional angle between incoming sunlight and the camera ray.
          scatterCosine = clamp(C.Cartesian3.dot(sun, C.Cartesian3.normalize(viewDir, new C.Cartesian3())), -1, 1);
        }
        const relativeAzimuthDeg = Math.atan2(Math.sin(az - viewAzimuthDeg * Math.PI / 180), Math.cos(az - viewAzimuthDeg * Math.PI / 180)) * 180 / Math.PI;
        return {
          elevationDeg: Math.asin(dot) * 180 / Math.PI,
          azimuthDeg: (az * 180 / Math.PI + 360) % 360,
          viewAzimuthDeg: (viewAzimuthDeg + 360) % 360, viewElevationDeg, scatterCosine,
          relativeAzimuthDeg,
          latitude, longitude, source: "GeoFS sun vector", localTime, localSeason
        };
      } catch (_) {}
    }
    // Astronomical fallback based on the actual day encoded by GeoFS localSeason.
    const lat = latitude * Math.PI / 180;
    const dayOfYear = ((60 + localSeason / 0.27 - 1) % 365.2422 + 365.2422) % 365.2422 + 1;
    const gamma = 2 * Math.PI / 365.2422 * (dayOfYear - 1);
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const hourAngle = (localTime - 12) * 15 * Math.PI / 180;
    const sinElevation = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
    const elevationDeg = Math.asin(clamp(sinElevation, -1, 1)) * 180 / Math.PI;
    const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) + Math.PI;
    return {
      elevationDeg, azimuthDeg: (azimuth * 180 / Math.PI + 360) % 360,
      viewAzimuthDeg: 0, viewElevationDeg: 0, scatterCosine: null,
      relativeAzimuthDeg: azimuth * 180 / Math.PI,
      latitude, longitude, source: "NOAA solar-position fallback", localTime, localSeason
    };
  }

  function sunsetOpticalState(override = {}) {
    const geometry = solarGeometry();
    const elevationDeg = finite(override.elevationDeg, geometry.elevationDeg);
    const optics = atmosphericOptics();
    const season = seasonalClimateProfile(finite(override.localSeason, geometry.localSeason), geometry.latitude);
    const elevationRad = Math.max(-90, Math.min(90, elevationDeg)) * Math.PI / 180;
    // Kasten-Young relative optical air mass, capped for twilight where curvature/refraction dominate.
    const kastenMass = 1 / Math.max(0.001,
      Math.sin(elevationRad) + 0.50572 * Math.pow(Math.max(elevationDeg + 6.07995, 0.1), -1.6364));
    const horizonMass = 1 / (0.50572 * Math.pow(6.07995, -1.6364));
    const airMass = elevationDeg >= 0 ? clamp(kastenMass, 1, 40)
      : clamp(lerp(40, horizonMass, smoothstepSafe(-18, 0, elevationDeg)), horizonMass, 40);
    const altitude = Math.max(0, finite(state.geofs?.aircraft?.instance?.llaLocation?.[2], 0));
    const rayColumn = Math.exp(-altitude / 8000);
    const mieColumn = Math.exp(-altitude / 1350);
    const wavelengths = [0.650, 0.550, 0.450];
    const rayleighTau = wavelengths.map(w => 0.008569 * Math.pow(1 / w, 4) * (1 + 0.0113 / (w*w) + 0.00013 / Math.pow(w,4)) * rayColumn);
    const angstrom = clamp(optics.effectiveAngstrom + season.angstromOffset, 0, 2.5);
    const mieTau = wavelengths.map(w => optics.aerosolTau550 * Math.pow(w / 0.55, -angstrom) * mieColumn);
    // Weak visible-band ozone absorption (Chappuis continuum) and water-vapour correction.
    const ozoneTau = [0.006, 0.014, 0.004];
    const waterTau = [0.0015, 0.0025, 0.0018].map(v => v * optics.precipitableWaterMm / 25 * season.waterVaporScale);
    const transmittance = wavelengths.map((_, i) => Math.exp(-Math.min(45,
      airMass * (rayleighTau[i] + mieTau[i] + ozoneTau[i] + waterTau[i]))));
    const meanT = Math.max(1e-6, transmittance.reduce((a,b)=>a+b,0)/3);
    const spectralDirect = transmittance.map(v => clamp(Math.pow(v / meanT, 0.28), 0.54, 1.46));
    const blueLoss = clamp(1 - transmittance[2] / Math.max(transmittance[0], 1e-6), 0, 0.995);
    const aerosolInfluence = clamp(optics.aerosolTau550 / 0.65, 0, 1);
    const humidity = clamp(optics.humidity, 0, 1);
    const cloudRaw = finite(activeNwpProfile()?.surface?.cloudCover,
      finite(weatherObject()?.definition?.cloudCover, 0));
    const cloudCover = clamp(cloudRaw > 1 ? cloudRaw / 100 : cloudRaw, 0, 1);
    const precipRaw = finite(activeNwpProfile()?.surface?.precipitationMm,
      finite(weatherObject()?.definition?.precipitationAmount, 0));
    const precipitation = clamp(precipRaw > 1 ? precipRaw / 10 : precipRaw, 0, 1);
    const fog = clamp(finite(weatherObject()?.definition?.fogDensity, 0), 0, 1);
    const visibilityKm = clamp(optics.visibilityKm || weatherMetrics().visibility / 1000, 0.5, 100);
    const weatherSoftening = clamp(1 - precipitation * 0.30 - fog * 0.22, 0.38, 1);
    // Golden hour and civil/nautical twilight are separate bands; no single orange overlay.
    const goldenBand = (1 - smoothstepSafe(1.5, 18, Math.max(elevationDeg, 0))) * smoothstepSafe(-1.5, 1.5, elevationDeg);
    const civilBand = smoothstepSafe(-12, -5.5, elevationDeg) * (1 - smoothstepSafe(-5.5, 0.5, elevationDeg));
    const nauticalBand = smoothstepSafe(-18, -12, elevationDeg) * (1 - smoothstepSafe(-12, -5.5, elevationDeg));
    const horizonBand = clamp(Math.max(goldenBand, civilBand * 0.78 + nauticalBand * 0.34), 0, 1);
    const sunToViewAz = (geometry.relativeAzimuthDeg || 0) * Math.PI / 180;
    const viewElevationRad = finite(geometry.viewElevationDeg, 0) * Math.PI / 180;
    const fallbackScatterCosine = Math.sin(elevationRad) * Math.sin(viewElevationRad)
      + Math.cos(elevationRad) * Math.cos(viewElevationRad) * Math.cos(sunToViewAz);
    const cosScatter = clamp(finite(geometry.scatterCosine, fallbackScatterCosine), -1, 1);
    const rayPhase = 3 / (16 * Math.PI) * (1 + cosScatter * cosScatter);
    const mieG = clamp(0.70 + 0.12 * (1 - humidity), 0.62, 0.84);
    const miePhase = (1 - mieG*mieG) / (4 * Math.PI * Math.pow(Math.max(0.015, 1 + mieG*mieG - 2*mieG*cosScatter), 1.5));
    const solarInput = transmittance.map((v,i) => v * (rayleighTau[i] * rayPhase + mieTau[i] * miePhase));
    const zenithInput = transmittance.map((v,i) => v * (rayleighTau[i] * 0.085 + mieTau[i] * 0.018));
    const normalizeSpectrum = arr => {
      const avg = Math.max(1e-8, arr.reduce((a,b)=>a+b,0)/arr.length);
      return arr.map(v => clamp(Math.pow(Math.max(v,1e-8)/avg,0.24),0.62,1.42));
    };
    const horizonSpectrum = normalizeSpectrum(solarInput);
    const zenithSpectrum = normalizeSpectrum(zenithInput);
    const warmIndex = clamp((spectralDirect[0] - spectralDirect[2]) / 0.85, 0, 1);
    const diffuseMix = clamp(0.20 + cloudCover * 0.28 + humidity * 0.10 + aerosolInfluence * 0.10, 0.12, 0.62);
    const horizonTint = [0,1,2].map(i => clamp(lerp(horizonSpectrum[i], spectralDirect[i], diffuseMix), 0.62, 1.42));
    const azimuthTint = [0,1,2].map(i => clamp(lerp(zenithSpectrum[i], horizonSpectrum[i], 0.28 + horizonBand * 0.25), 0.62, 1.42));
    const sunTint = spectralDirect.map(v => clamp(lerp(1, v, 0.92), 0.62, 1.42));
    const seasonalEnabled = state.masterEnabled ? clamp(S.SS, 0, 1.5) : 0;
    const reflectionEnabled = state.masterEnabled ? clamp(S.RW, 0, 1.5) : 0;
    const solarPower = clamp((1 - Math.exp(-airMass * (optics.aerosolTau550 + 0.08))) * 0.65 + warmIndex * 0.35, 0, 1);
    const strength = clamp((goldenBand * 0.95 + civilBand * 0.72 + nauticalBand * 0.30)
      * seasonalEnabled * (0.55 + solarPower * 0.55) * weatherSoftening, 0, 1.5);
    const reflectionStrength = clamp((goldenBand * 0.88 + civilBand * 0.62 + nauticalBand * 0.18)
      * reflectionEnabled * (0.16 + warmIndex * 0.42 + aerosolInfluence * 0.12)
      * (0.78 + cloudCover * 0.22) * weatherSoftening, 0, 0.82);
    return {
      elevationDeg, azimuthDeg: geometry.azimuthDeg, viewAzimuthDeg: geometry.viewAzimuthDeg,
      viewElevationDeg: geometry.viewElevationDeg, scatterCosine: cosScatter, relativeAzimuthDeg: geometry.relativeAzimuthDeg, latitude: geometry.latitude, longitude: geometry.longitude,
      localTime: geometry.localTime, localSeason: geometry.localSeason, source: geometry.source,
      airMass, transmittance, spectralDirect, horizonSpectrum, zenithSpectrum, blueLoss,
      warmIndex, humidity, cloudCover, precipitation, visibilityKm, weatherSoftening,
      strength, reflectionStrength, aerosolInfluence, goldenBand, civilBand, nauticalBand,
      season: { ...season, sunTint, horizonTint, azimuthTint }, optics
    };
  }

  function colorParts(color) {
    if (!color) return null;
    const r = finite(color.red, finite(color.r, NaN));
    const g = finite(color.green, finite(color.g, NaN));
    const b = finite(color.blue, finite(color.b, NaN));
    const a = finite(color.alpha, finite(color.a, 1));
    return [r, g, b, a].every(Number.isFinite) ? { r, g, b, a } : null;
  }

  function makeCesiumColor(parts) {
    const C = state.Cesium;
    return C?.Color ? new C.Color(clamp(parts.r, 0, 1.5), clamp(parts.g, 0, 1.5), clamp(parts.b, 0, 1.5), clamp(parts.a, 0, 1)) : null;
  }

  function mixSeasonalColor(baseColor, target, amount) {
    const base = colorParts(baseColor);
    if (!base || !state.Cesium?.Color) return baseColor;
    const t = clamp(amount, 0, 0.82);
    return makeCesiumColor({
      r: lerp(base.r, target[0], t), g: lerp(base.g, target[1], t),
      b: lerp(base.b, target[2], t), a: base.a
    });
  }

  function applySeasonalWaterReflection(model = sunsetOpticalState()) {
    const n = state.nativeLighting, globe = n.globe;
    if (!globe || typeof n.originalGlobeSetColours !== "function") return false;
    if (!n.baseWaterColors) {
      const uniforms = globe.material?.uniforms || {};
      const h = colorParts(uniforms.horizonColor) ? uniforms.horizonColor : globe.dayHorizonColors?.[1];
      const a = colorParts(uniforms.azimutColor) ? uniforms.azimutColor : globe.dayAzimutColors?.[1];
      if (h && a) n.baseWaterColors = { horizon: colorParts(h), azimuth: colorParts(a) };
    }
    const base = n.baseWaterColors;
    if (!base || !state.Cesium?.Color) return false;
    const sig = [model.elevationDeg.toFixed(2), model.azimuthDeg.toFixed(1), model.localSeason.toFixed(2),
      model.reflectionStrength.toFixed(4), model.warmIndex.toFixed(4), model.cloudCover.toFixed(2),
      model.humidity.toFixed(2), model.visibilityKm.toFixed(1)].join("|");
    if (sig === n.lastWaterSignature) return true;
    n.lastWaterSignature = sig;
    // Horizon reflection receives the warm single-scattering spectrum; azimuthal fill
    // remains cooler and is blended toward the sun-side only near the horizon.
    const horizonAmount = clamp(model.reflectionStrength * (0.70 + model.aerosolInfluence * 0.20), 0, 0.68);
    const azimuthAmount = clamp(horizonAmount * (0.20 + model.goldenBand * 0.28), 0, 0.34);
    const h = mixSeasonalColor(base.horizon, model.season.horizonTint, horizonAmount);
    const a = mixSeasonalColor(base.azimuth, model.season.azimuthTint, azimuthAmount);
    try { n.originalGlobeSetColours.call(globe, h, a); return true; }
    catch (error) { console.warn("[AtmosphereMod GeoFS] Seasonal water reflection update failed", error); return false; }
  }

  function applySeasonalSunlight(model = sunsetOpticalState()) {
    const n = state.nativeLighting, manager = n.manager, G = state.geofs, C = state.Cesium;
    if (!manager || !C?.Color || typeof G?.api?.setSceneLight !== "function") return false;
    const current = manager.sunColor;
    let force = false;
    if (current && current !== n.lastSunOutput) {
      n.baseSunColor = colorParts(current);
      n.baseSunSource = current;
      force = true;
    }
    if (!n.baseSunColor) return false;
    const sig = [model.elevationDeg.toFixed(1), model.localSeason.toFixed(1), model.strength.toFixed(3),
      model.blueLoss.toFixed(3), model.optics.aerosolTau550.toFixed(3), model.humidity.toFixed(2)].join("|");
    if (!force && sig === n.lastSunSignature && manager.sunColor === n.lastSunOutput) return true;
    n.lastSunSignature = sig;
    const base = n.baseSunColor;
    const amount = clamp(model.strength * 0.66, 0, 0.86);
    const sunTint = model.season.sunTint;
    // Preserve GeoFS exposure/intensity and only alter chromaticity; avoid a false HDR boost.
    const color = new C.Color(
      clamp(base.r * lerp(1, sunTint[0], amount), 0, 1.5),
      clamp(base.g * lerp(1, sunTint[1], amount), 0, 1.5),
      clamp(base.b * lerp(1, sunTint[2], amount), 0, 1.5), base.a
    );
    manager.sunColor = color;
    n.lastSunOutput = color;
    const belowClouds = clamp(finite(window.weather?.belowCloudsBrightness, 1), 0, 1);
    const intensity = clamp(finite(manager.sunIntensity, base.a), 0, 1.5) * belowClouds;
    try { G.api.setSceneLight(color, intensity); } catch (error) { console.warn("[AtmosphereMod GeoFS] Seasonal sunlight update failed", error); }
    try { G.fx?.cloudManager?.setCloudColors?.(null, null, null, 1, color); } catch (_) {}
    return true;
  }

  function installSeasonalLightingHooks() {
    const G = state.geofs, n = state.nativeLighting;
    n.manager = G?.fx?.dayNightManager || null;
    n.globe = G?.fx?.globe || null;
    if (n.manager && typeof n.manager.update === "function" && !n.dayNightWrapper) {
      n.originalDayNightUpdate = n.manager.update;
      n.dayNightWrapper = function (...args) {
        const result = n.originalDayNightUpdate.apply(this, args);
        try {
          const model = sunsetOpticalState();
          applySeasonalSunlight(model);
          applySeasonalWaterReflection(model);
        } catch (error) { console.warn("[AtmosphereMod GeoFS] Seasonal lighting model skipped", error); }
        return result;
      };
      n.manager.update = n.dayNightWrapper;
    }
    if (n.globe && typeof n.globe.setColours === "function" && !n.globeWrapper) {
      n.originalGlobeSetColours = n.globe.setColours;
      n.globeWrapper = function (horizon, azimuth) {
        const h = colorParts(horizon), a = colorParts(azimuth);
        if (h && a) n.baseWaterColors = { horizon: h, azimuth: a };
        const model = sunsetOpticalState();
        if (!h || !a || !state.Cesium?.Color) return n.originalGlobeSetColours.call(this, horizon, azimuth);
        const ha = clamp(model.reflectionStrength * (0.85 + model.aerosolInfluence * 0.25), 0, 0.72);
        const aa = ha * 0.38;
        const tintedH = mixSeasonalColor(horizon, model.season.horizonTint, ha);
        const tintedA = mixSeasonalColor(azimuth, model.season.azimuthTint, aa);
        return n.originalGlobeSetColours.call(this, tintedH, tintedA);
      };
      n.globe.setColours = n.globeWrapper;
    }
  }

  function restoreSeasonalLightingHooks() {
    const n = state.nativeLighting;
    if (n.manager && n.dayNightWrapper && n.manager.update === n.dayNightWrapper) n.manager.update = n.originalDayNightUpdate;
    if (n.globe && n.globeWrapper && n.globe.setColours === n.globeWrapper) n.globe.setColours = n.originalGlobeSetColours;
    if (n.baseWaterColors && n.originalGlobeSetColours && state.Cesium?.Color) {
      try {
        n.originalGlobeSetColours.call(n.globe,
          makeCesiumColor({ ...n.baseWaterColors.horizon }),
          makeCesiumColor({ ...n.baseWaterColors.azimuth }));
      } catch (_) {}
    }
    if (n.manager && n.lastSunOutput && n.manager.sunColor === n.lastSunOutput && n.baseSunColor && state.Cesium?.Color) {
      try {
        const base = makeCesiumColor(n.baseSunColor);
        n.manager.sunColor = base;
        state.geofs?.api?.setSceneLight?.(base, finite(n.manager.sunIntensity, base.alpha) * clamp(finite(window.weather?.belowCloudsBrightness, 1), 0, 1));
        state.geofs?.fx?.cloudManager?.setCloudColors?.(null, null, null, 1, base);
      } catch (_) {}
    }
    n.manager = null; n.globe = null; n.originalDayNightUpdate = null; n.originalGlobeSetColours = null;
    n.dayNightWrapper = null; n.globeWrapper = null; n.baseSunColor = null; n.baseSunSource = null;
    n.lastSunOutput = null; n.baseWaterColors = null; n.lastSunSignature = ""; n.lastWaterSignature = "";
  }

  function atmosphericOptics() {
    const met = weatherMetrics();
    const surface = activeNwpProfile()?.surface;
    const pw = clamp(finite(surface?.precipitableWaterMm, 18 + met.humidity * 16), 2, 75);
    const rh = clamp(met.humidity, 0, 1);
    const visibilityKm = clamp(met.visibility / 1000, 0.5, 100);
    // Effective kappa=0.18 is a mixed-background aerosol assumption, not a
    // retrieved composition. GF is capped before near-saturation fog activation.
    const aerosolKappa = 0.18;
    const rhSubSaturated = clamp(rh, 0.02, 0.96);
    const hygroscopicGrowth = Math.pow(1.0 + aerosolKappa * rhSubSaturated / (1.0 - rhSubSaturated), 1.0 / 3.0);
    // Larger wet particles generally flatten the visible-band spectral slope.
    const spectralFlattening = clamp(1.0 - 0.52 * (hygroscopicGrowth - 1.0), 0.60, 1.0);
    const season = seasonalClimateProfile();
    const effectiveAngstrom = clamp(S.T10 * spectralFlattening + season.angstromOffset * 0.35, 0, 2.5);
    const columnMoisture = 1.0 + 0.035 * clamp((pw - 10) / 45, 0, 1);
    const aerosolTau550 = clamp((1.2 * 3.912 / visibilityKm) * columnMoisture * season.aerosolScale, 0.015, 0.82);
    const rayleigh = wavelengthUm => {
      const inv2 = 1 / (wavelengthUm * wavelengthUm);
      return 0.008569 * inv2 * inv2 * (1 + 0.0113 * inv2 + 0.00013 * inv2 * inv2);
    };
    const mie = wavelengthUm => aerosolTau550 * Math.pow(wavelengthUm / 0.55, -effectiveAngstrom);
    return {
      tauRayR: rayleigh(0.650), tauRayG: rayleigh(0.550), tauRayB: rayleigh(0.450),
      tauMieR: mie(0.650), tauMieG: mie(0.550), tauMieB: mie(0.450),
      aerosolTau550, humidity: rh, precipitableWaterMm: pw, visibilityKm,
      moistureVeil: clamp(0.58 * aerosolTau550 + 0.25 * (hygroscopicGrowth - 1.0) + 0.055 * (pw / 75), 0, 1),
      hygroscopicGrowth, aerosolKappa, effectiveAngstrom, season
    };
  }


  function makeAerosolFunction() {
    const top = S.T1 * 1000;
    const edge = Math.max(40, S.T2 * 1000);
    const layerScale = Math.max(300, top * 0.58);
    const boundaryStrength = 0.65 * S.T3;
    const freeStrength = 0.35 * S.T4;
    const freeScale = Math.max(500, S.T5 * 1000);
    const weatherScale = S.T13 ? weatherMetrics().factor : 1;
    return `
float amBoundaryDensity(float altitude) {
  float h = max(altitude, 0.0);
  float layerMask = 1.0 - smoothstep(${fmt(top - edge, 2)}, ${fmt(top + edge, 2)}, h);
  return layerMask * exp(-h / ${fmt(layerScale, 2)}) * ${fmt(boundaryStrength * weatherScale, 6)};
}
float amFreeDensity(float altitude) {
  float h = max(altitude, 0.0);
  return exp(-h / ${fmt(freeScale, 2)}) * ${fmt(freeStrength * weatherScale, 6)};
}
float amAerosolDensity(float altitude) {
  return amBoundaryDensity(altitude) + amFreeDensity(altitude);
}
`;
  }

  function replaceExactly(source, needle, replacement, label) {
    const count = source.split(needle).length - 1;
    if (count !== 1) throw new Error(`GeoFS 4.0 atmosphere hook mismatch: ${label} (${count} matches)`);
    return source.replace(needle, replacement);
  }

  function mieRGB() {
    const alpha = atmosphericOptics().effectiveAngstrom;
    return [Math.pow(680 / 550, -alpha), 1, Math.pow(440 / 550, -alpha)];
  }

  function buildAtmosphereShader(enabled = !!(state.masterEnabled && S.T0)) {
    let shader = state.original.common;
    if (!enabled) return shader;
    const [r, g, b] = mieRGB();
    const mieScale = 21e-6;
    shader = replaceExactly(shader,
      "const vec3 beta_mie = vec3(21e-6);",
      `const vec3 beta_mie = vec3(${fmt(mieScale * r, 12)}, ${fmt(mieScale * g, 12)}, ${fmt(mieScale * b, 12)});`,
      "Angstrom aerosol wavelength tint");
    shader = replaceExactly(shader, "const float g = 0.9;",
      `const float g = ${fmt(S.T9 > 0 ? S.T9 : 0.8, 5)};`, "Mie asymmetry");
    const phaseNeedle = "float phase_mie = (allow_mie ? 3.0 : 0.5 ) / (25.1327412287 ) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));";
    const phaseReplacement = `float phase_mie = (allow_mie ? 3.0 : 0.5 ) / (25.1327412287 ) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
float amBackG = -max(0.05, g * 0.5);
float amBackGG = amBackG * amBackG;
float amBackPhase = (allow_mie ? 3.0 : 0.5) / 25.1327412287 * ((1.0 - amBackGG) * (mumu + 1.0)) / (pow(1.0 + amBackGG - 2.0 * mu * amBackG, 1.5) * (2.0 + amBackGG));
phase_mie = mix(phase_mie, amBackPhase, ${fmt(S.T7, 5)});`;
    shader = replaceExactly(shader, phaseNeedle, phaseReplacement, "aerosol backscatter lobe");
    shader = replaceExactly(shader, "#ifdef ADVANCED_ATMOSPHERE\nvec4 calculate_scattering(",
      `${makeAerosolFunction()}\n#ifdef ADVANCED_ATMOSPHERE\nvec4 calculate_scattering(`, "layered aerosol density");
    shader = replaceExactly(shader, "vec2 density = exp(-height_i / scale_height) * step_size_i;",
      `float amAltitude_i = max(height_i - (realPlanetRadius - planetRadius), 0.0);
float amBoundary_i = amBoundaryDensity(amAltitude_i);
vec2 density = vec2(exp(-height_i / scale_height.x), amAerosolDensity(amAltitude_i)) * step_size_i;
amBrownOpt_i += amBoundary_i * step_size_i;`, "primary-ray aerosol density");
    shader = replaceExactly(shader, "vec2 opt_i = vec2(0.0);",
      "vec2 opt_i = vec2(0.0);\nfloat amBrownOpt_i = 0.0;", "primary-ray absorption accumulator");
    shader = replaceExactly(shader, "vec2 opt_l = vec2(0.0);",
      "vec2 opt_l = vec2(0.0);\nfloat amBrownOpt_l = 0.0;", "sun-ray absorption accumulator");
    shader = replaceExactly(shader, "opt_l += exp(-height_l / scale_height) * step_size_l;",
      `float amAltitude_l = max(height_l - (realPlanetRadius - planetRadius), 0.0);
float amBoundary_l = amBoundaryDensity(amAltitude_l);
opt_l += vec2(exp(-height_l / scale_height.x), amAerosolDensity(amAltitude_l)) * step_size_l;
amBrownOpt_l += amBoundary_l * step_size_l;`, "sun-ray aerosol density");
    shader = replaceExactly(shader, "vec3 attn = exp(-((beta_mie * (opt_i.y + opt_l.y)) + (beta_ray * (opt_i.x + opt_l.x)))) * mask;",
      `vec3 amAttn = exp(-((beta_mie * (opt_i.y + opt_l.y)) + (beta_ray * (opt_i.x + opt_l.x))));
amAttn.b *= exp(-${fmt(S.T6, 5)} * (amBrownOpt_i + amBrownOpt_l) * 21e-6 * 0.8);
vec3 attn = amAttn * mask;`, "boundary-layer spectral absorption");
    shader = replaceExactly(shader, "float opacity = length(exp(-((beta_mie * opt_i.y) + (beta_ray * opt_i.x)) * density_multiplier));",
      `vec3 amOpacity = exp(-((beta_mie * opt_i.y) + (beta_ray * opt_i.x)) * density_multiplier);
amOpacity.b *= exp(-${fmt(S.T6, 5)} * amBrownOpt_i * 21e-6 * density_multiplier * 0.8);
float opacity = length(amOpacity);`, "atmosphere opacity absorption");
    return shader;
  }

    function restoreShaders() {
    if (!state.shaders || !state.original) return;
    if (typeof state.original.common === "string") state.shaders["atmosphereCommon.glsl"] = state.original.common;
    if (typeof state.original.clouds === "string") state.shaders["volumetricCloudsFS.glsl"] = state.original.clouds;
    state.atmosphereShaderReady = false;
  }

    function applyShaders() {
    if (!state.shaders || !state.original) return;
    // Cloud GLSL is deliberately kept byte-for-byte native. Only the atmosphere
    // scattering shader is extended, with strict single-anchor validation.
    state.shaders["volumetricCloudsFS.glsl"] = state.original.clouds;
    if (!state.masterEnabled || !S.T0) {
      state.shaders["atmosphereCommon.glsl"] = state.original.common;
      state.atmosphereShaderReady = false;
      return;
    }
    try {
      state.shaders["atmosphereCommon.glsl"] = buildAtmosphereShader(true);
      state.atmosphereShaderReady = true;
    } catch (error) {
      state.shaders["atmosphereCommon.glsl"] = state.original.common;
      state.atmosphereShaderReady = false;
      console.error("[AtmosphereMod GeoFS] Atmosphere scattering patch rejected; native shader restored", error);
    }
  }

  function updateColorModifiers() {
    const G = state.geofs;
    if (!G?.api?.setAtmosphereColorModifier) return;
    const atmosphereColorActive = !!(state.masterEnabled && S.T0 && S.T8);
    const daylightBalanceActive = !!(state.masterEnabled && S.C22);
    if (!atmosphereColorActive && !daylightBalanceActive) {
      G.api.removeAtmosphereColorModifier?.(MODIFIER_ID);
      state.lastColorSignature = "off";
      return;
    }
    const w = weatherObject();
    const model = sunsetOpticalState();
    // GeoFS exposes display-space modifiers, not a wavelength-resolved ground BRDF.
    // Keep the terrain correction subtle; the stronger directional response is sent
    // through GeoFS's own sun-light and water horizon/azimuth reflection uniforms.
    const twilight = model.strength;
    const warmBounce = clamp(model.warmIndex * twilight * (0.55 + model.aerosolInfluence * 0.25), 0, 1);
    const modifier = {
      brightnessShift: daylightBalanceActive ? 0.008 : 0,
      saturationShift: atmosphereColorActive ? 0.010 + warmBounce * 0.025 : 0,
      hueShift: atmosphereColorActive ? -warmBounce * 0.006 : 0,
      groundBrightnessShift: (daylightBalanceActive ? 0.008 : 0) + (atmosphereColorActive ? warmBounce * 0.018 : 0),
      groundSaturationShift: atmosphereColorActive ? 0.008 + warmBounce * 0.040 : 0,
      groundHueShift: atmosphereColorActive ? -warmBounce * 0.010 : 0,
      fogBrightness: 1 - warmBounce * 0.018,
      cloudsBrightness: 1
    };
    const signature = Object.values(modifier).map(v => Number(v).toFixed(5)).join("|");
    if (signature !== state.lastColorSignature) {
      G.api.setAtmosphereColorModifier(MODIFIER_ID, modifier);
      state.lastColorSignature = signature;
    }
  }

  // T16 scales only the add-on aerosol density above. Native GeoFS fog and
  // volumetric mist are deliberately left untouched, matching the MSFS tunable.

  const LENS_GHOST_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform vec2 amSunUv;
uniform float amSunEnergy;
uniform float amAspect;
uniform float amLensStrength;
uniform float amAtmosphereVeil;
uniform vec3 amSunTint;
float amLensDisc(vec2 p, vec2 c, float radius, float blades, float rotation, float roundness) {
  vec2 delta = p - c;
  float r = length(delta);
  float angle = atan(delta.y, delta.x);
  float polygonRadius = 1.0;
  if (blades >= 3.0) {
    float sector = 6.28318530718 / blades;
    float localAngle = mod(angle + rotation + 0.5 * sector, sector) - 0.5 * sector;
    polygonRadius = cos(3.14159265359 / blades) / max(cos(localAngle), 0.001);
  }
  float apertureRadius = radius * mix(polygonRadius, 1.0, clamp(roundness, 0.0, 1.0));
  float core = exp(-pow(r / max(radius * 0.48, 0.0005), 2.0));
  float ring = exp(-pow((r - apertureRadius * 0.82) / max(radius * 0.095, 0.00035), 2.0));
  float outer = exp(-pow((r - apertureRadius * 1.31) / max(radius * 0.105, 0.00035), 2.0));
  float bladeRipple = blades >= 3.0 ? 0.92 + 0.08 * cos(blades * angle + rotation) : 1.0;
  return (core * 0.085 + ring * 0.39 + outer * 0.095) * bladeRipple;
}
void main() {
  vec4 base = texture(colorTexture, v_textureCoordinates);
  if (amSunEnergy <= 0.001 || amLensStrength <= 0.001) {
    out_FragColor = base;
    return;
  }
  vec2 p = (v_textureCoordinates - vec2(0.5)) * vec2(amAspect, 1.0);
  vec2 sun = (amSunUv - vec2(0.5)) * vec2(amAspect, 1.0);
  vec2 opticalAxis = -sun;
  vec2 g1 = sun + opticalAxis * 0.44;
  vec2 g2 = sun + opticalAxis * 0.82;
  vec2 g3 = sun + opticalAxis * 1.28;
  vec2 g4 = sun + opticalAxis * 1.82;
  vec2 g5 = sun + opticalAxis * 2.24;
  vec2 g6 = sun + opticalAxis * 2.66;
  vec2 g7 = sun + opticalAxis * 3.02;
  float d1 = amLensDisc(p, g1, 0.027, 6.0, 0.18, 0.18);
  float d2 = amLensDisc(p, g2, 0.050, 8.0, 0.08, 0.28);
  float d3 = amLensDisc(p, g3, 0.078, 0.0, 0.00, 1.00);
  float d4 = amLensDisc(p, g4, 0.034, 5.0, 0.36, 0.12);
  float d5 = amLensDisc(p, g5, 0.020, 7.0, 0.17, 0.22);
  float d6 = amLensDisc(p, g6, 0.024, 4.0, 0.785, 0.06);
  float d7 = amLensDisc(p, g7, 0.018, 10.0, 0.12, 0.16);
  float d1R = amLensDisc(p, g1 + opticalAxis * 0.0014, 0.0275, 6.0, 0.18, 0.18);
  float d1B = amLensDisc(p, g1 - opticalAxis * 0.0014, 0.0265, 6.0, 0.18, 0.18);
  float d3R = amLensDisc(p, g3 + opticalAxis * 0.0020, 0.079, 0.0, 0.00, 1.00);
  float d3B = amLensDisc(p, g3 - opticalAxis * 0.0020, 0.077, 0.0, 0.00, 1.00);
  float r = length(p - sun);
  float sunHalo = exp(-pow(r / 0.105, 2.0));
  float sunCore = exp(-pow(r / 0.018, 2.0));
  vec2 flareAxis = length(opticalAxis) > 0.0001 ? normalize(opticalAxis) : vec2(1.0, 0.0);
  vec2 flareNormal = vec2(-flareAxis.y, flareAxis.x);
  vec2 streakDelta = p - sun;
  float horizontalStreak = exp(-pow(dot(streakDelta, flareNormal) / 0.0028, 2.0))
                         * exp(-abs(dot(streakDelta, flareAxis)) * 8.0);
  vec3 ghosts = vec3(0.0);
  ghosts += vec3(d1R * 0.70, d1 * 0.82, d1B * 1.08) * vec3(0.44, 0.80, 1.15);
  ghosts += d2 * vec3(1.08, 0.46, 0.30);
  ghosts += vec3(d3R * 0.78, d3 * 0.86, d3B * 1.06) * vec3(0.42, 0.66, 1.12);
  ghosts += d4 * vec3(0.92, 0.76, 0.46);
  ghosts += d5 * vec3(0.36, 0.72, 1.08);
  ghosts += d6 * vec3(0.72, 0.88, 1.04);
  ghosts += d7 * vec3(1.04, 0.78, 0.48);
  ghosts += sunHalo * (0.018 + amAtmosphereVeil * 0.055) * amSunTint;
  ghosts += sunCore * 0.13 * amSunTint;
  ghosts += horizontalStreak * vec3(0.045, 0.035, 0.026);
  float sourceLuma = dot(texture(colorTexture, clamp(amSunUv, 0.0, 1.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float sourceInFrame = step(0.0, amSunUv.x) * step(amSunUv.x, 1.0) * step(0.0, amSunUv.y) * step(amSunUv.y, 1.0);
  float sourceGate = mix(0.14, smoothstep(0.24, 0.95, sourceLuma), sourceInFrame);
  vec3 flare = ghosts * amSunEnergy * amLensStrength * sourceGate;
  out_FragColor = vec4(base.rgb + flare, base.a);
}
`;

  function lensGhostFrame() {
    const viewer = state.geofs?.api?.viewer;
    const scene = viewer?.scene;
    const camera = viewer?.camera;
    const C = state.Cesium;
    const noFlare = () => ({
      sunUv: C?.Cartesian2 ? new C.Cartesian2(0.5, 0.5) : { x: 0.5, y: 0.5 },
      energy: 0, aspect: 1, veil: 0,
      tint: C?.Cartesian3 ? new C.Cartesian3(1, 1, 1) : { x: 1, y: 1, z: 1 }
    });
    if (!scene || !camera || !C?.Cartesian3 || !C?.Cartesian2) return noFlare();
    const frameNumber = finite(scene.frameState?.frameNumber, -1);
    if (frameNumber >= 0 && state.lensGhostFrameCacheNumber === frameNumber && state.lensGhostFrameCache) return state.lensGhostFrameCache;
    const finish = value => {
      state.lensGhostFrameCache = value;
      state.lensGhostFrameCacheNumber = frameNumber;
      return value;
    };
    const uniformState = scene.context?.uniformState || scene.frameState?.context?.uniformState;
    const sunPosition = uniformState?.sunPositionWC;
    if (!sunPosition || !camera.positionWC || !camera.directionWC || !camera.rightWC || !camera.upWC) return finish(noFlare());
    const direction = C.Cartesian3.subtract(sunPosition, camera.positionWC, new C.Cartesian3());
    const directionLength = C.Cartesian3.magnitude(direction);
    if (!Number.isFinite(directionLength) || directionLength < 1) return finish(noFlare());
    C.Cartesian3.divideByScalar(direction, directionLength, direction);
    const forward = C.Cartesian3.dot(direction, camera.directionWC);
    const context = scene.context;
    const width = Math.max(1, finite(context?.drawingBufferWidth, 1));
    const height = Math.max(1, finite(context?.drawingBufferHeight, 1));
    const aspect = width / height;
    const frustum = camera.frustum || {};
    const rawFov = finite(frustum.fov, Math.PI / 3);
    const fovy = Number.isFinite(frustum.fovy) ? frustum.fovy : aspect > 1 ? 2 * Math.atan(Math.tan(rawFov * 0.5) / aspect) : rawFov;
    const tanY = Math.tan(fovy * 0.5);
    const tanX = tanY * aspect;
    if (forward <= 0.0005 || tanX <= 0 || tanY <= 0) return finish({ sunUv: new C.Cartesian2(0.5, 0.5), energy: 0, aspect, veil: 0, tint: new C.Cartesian3(1, 1, 1) });
    // Project the world-space solar vector into the camera's right/up basis.
    const x = C.Cartesian3.dot(direction, camera.rightWC) / (forward * tanX);
    const y = C.Cartesian3.dot(direction, camera.upWC) / (forward * tanY);
    const sunUv = new C.Cartesian2(0.5 + x * 0.5, 0.5 + y * 0.5);
    const outside = Math.max(0, -sunUv.x, sunUv.x - 1, -sunUv.y, sunUv.y - 1);
    const screenFade = clamp(1 - outside / 0.34, 0, 1);
    const localUp = C.Cartesian3.normalize(camera.positionWC, new C.Cartesian3());
    const sunElevationDeg = Math.asin(clamp(C.Cartesian3.dot(direction, localUp), -1, 1)) * 180 / Math.PI;
    const horizonFade = clamp((sunElevationDeg + 2.0) / 3.5, 0, 1);
    if (screenFade <= 0 || horizonFade <= 0) return finish({ sunUv, energy: 0, aspect, veil: 0, tint: new C.Cartesian3(1, 1, 1) });
    const optics = atmosphericOptics();
    const airMass = clamp(1 / Math.max(0.035,
      Math.sin(Math.max(sunElevationDeg, -4) * Math.PI / 180)
      + 0.50572 * Math.pow(Math.max(sunElevationDeg + 6.07995, 0.1), -1.6364)), 1, 32);
    const earthRadius = finite(state.atmosphere?.realPlanetRadius, finite(scene.globe?.ellipsoid?.maximumRadius, 6378137));
    const altitude = Math.max(0, C.Cartesian3.magnitude(camera.positionWC) - earthRadius);
    const rayCol = Math.exp(-altitude / 8000);
    const mieCol = Math.exp(-altitude / 1350);
    const tR = Math.exp(-airMass * (optics.tauRayR * rayCol + optics.tauMieR * mieCol));
    const tG = Math.exp(-airMass * (optics.tauRayG * rayCol + optics.tauMieG * mieCol));
    const tB = Math.exp(-airMass * (optics.tauRayB * rayCol + optics.tauMieB * mieCol));
    const meanT = (tR + tG + tB) / 3;
    const energy = clamp(Math.sqrt(meanT) * 1.08, 0, 1.05) * screenFade * horizonFade;
    const tint = new C.Cartesian3(clamp(tR / Math.max(tG, 0.012), 0.45, 2.3), 1, clamp(tB / Math.max(tG, 0.012), 0.12, 0.95));
    return finish({ sunUv, energy, aspect, veil: optics.moistureVeil, tint });
  }

  function updateLensGhostStage() {
    const scene = state.geofs?.api?.viewer?.scene;
    const C = state.Cesium;
    if (!scene?.postProcessStages || !C?.PostProcessStage) return null;
    if (state.lensGhostStage && state.lensGhostScene !== scene) {
      try { state.lensGhostScene?.postProcessStages?.remove(state.lensGhostStage); } catch (_) {}
      state.lensGhostStage = null;
      state.lensGhostFrameCache = null;
      state.lensGhostFrameCacheNumber = -1;
    }
    if (!state.lensGhostStage) {
      const unit = name => () => lensGhostFrame()[name];
      state.lensGhostStage = new C.PostProcessStage({
        name: "atmospheremod-geofs-lens-ghost-160",
        fragmentShader: LENS_GHOST_FRAGMENT_SHADER,
        uniforms: {
          amSunUv: unit("sunUv"),
          amSunEnergy: unit("energy"),
          amAspect: unit("aspect"),
          amAtmosphereVeil: unit("veil"),
          amSunTint: unit("tint"),
          amLensStrength: () => S.LGI
        }
      });
      scene.postProcessStages.add(state.lensGhostStage);
      state.lensGhostScene = scene;
    }
    state.lensGhostStage.enabled = !!(state.masterEnabled && S.LG && S.LGI > 0.001);
    return state.lensGhostStage;
  }

  function removeLensGhostStage() {
    if (!state.lensGhostStage) return;
    try {
      state.lensGhostScene?.postProcessStages?.remove(state.lensGhostStage);
      if (!state.lensGhostStage.isDestroyed?.()) state.lensGhostStage.destroy?.();
    } catch (error) { console.warn("[AtmosphereMod GeoFS] Lens stage cleanup warning", error); }
    state.lensGhostStage = null;
    state.lensGhostScene = null;
    state.lensGhostFrameCache = null;
    state.lensGhostFrameCacheNumber = -1;
  }

  // Read-only native cloud metadata. Rendering and texture generation remain GeoFS-owned.
  function nativeCloudStats() {
    const d = weatherObject()?.definition || {};
    const surface = activeNwpProfile()?.surface;
    const p = state.physics || computeWeatherPhysics(d);
    const coverNwp = Number.isFinite(surface?.cloudCover) ? surface.cloudCover : NaN;
    const coverNative = finite(d.cloudCover, finite(d.cloudCoverAmount, NaN));
    const api = state.geofs?.api?.renderingSettings || {};
    const a = state.atmosphere;
    return {
      cover: clamp(finite(coverNwp, coverNative), 0, 1),
      base: finite(d.cloudBase, finite(p.cloudBaseM, finite(p.lclM, NaN))),
      top: finite(d.cloudTop, finite(p.cloudTopM, finite(p.elM, NaN))),
      volumetric: typeof api.volumetricClouds === "boolean" ? api.volumetricClouds : !!a?.volumetricClouds,
      count: 0
    };
  }

  function shouldForceClouds() { return false; }

    function setCloudRuntimeFlags() {
    // Intentionally do not change GeoFS renderingSettings. Native clouds retain the user's settings.
    return;
  }

    function applyCloudWeatherOverride() {
    // Weather diagnostics are maintained, but native cloud cover/base/top are not overwritten.
    state.physics = computeWeatherPhysics();
  }

  function patchWeatherSet() {
    const w = window.weather;
    if (!w || typeof w.set !== "function" || state.original?.weatherSet) return;
    state.weather = w;
    state.original.weatherSet = w.set;
    state.weatherSetWrapper = function (definition, location) {
      let next = definition && typeof definition === "object" ? { ...definition } : definition;
      if (state.masterEnabled && S.WX && next && typeof next === "object" && finite(next.precipitationAmount, 0) > 0) {
        const physical = computeWeatherPhysics(next);
        // GeoFS precipitation currently exposes rain/snow only. Avoid phase
        // chatter around 0 °C by using a wet-bulb hysteresis band.
        const current = String(next.precipitationType || "rain").toLowerCase();
        if (physical.wetBulbC <= -1.0) next.precipitationType = "snow";
        else if (physical.wetBulbC >= 1.5 && current === "snow") next.precipitationType = "rain";
      }
      if (definition && typeof definition === "object") state.lastNativeWeatherDefinition = { ...definition };
      const result = state.original.weatherSet.call(this, next, location);
      state.physics = computeWeatherPhysics(this.definition || next);
      applyCloudWeatherOverride();
      return result;
    };
    w.set = state.weatherSetWrapper;
  }

  function restoreWeatherSet() {
    const w = state.weather;
    if (w && state.original?.weatherSet && w.set === state.weatherSetWrapper) {
      try {
        if (state.lastNativeWeatherDefinition && state.lastNativeWeatherDefinition.precipitationType) {
          state.original.weatherSet.call(w, { ...state.lastNativeWeatherDefinition }, state.geofs?.camera?.lla);
        }
      } catch (error) { console.warn("[AtmosphereMod GeoFS] Weather phase restore warning", error); }
      w.set = state.original.weatherSet;
    }
  }

  
  function addWeatherFxTimer(fn, delay) {
    const id = window.setTimeout(() => {
      state.weatherFxTimers = state.weatherFxTimers.filter(v => v !== id);
      if (!state.destroyed) { try { fn(); } catch (e) { console.warn("[AtmosphereMod] Weather effect timer", e); } }
    }, delay);
    state.weatherFxTimers.push(id); return id;
  }

  function removePrimitive(primitive) {
    if (!primitive) return;
    const scene = state.geofs?.api?.viewer?.scene;
    try { if (scene?.primitives?.contains?.(primitive)) scene.primitives.remove(primitive); else scene?.primitives?.remove?.(primitive); } catch (_) {}
    try { if (!primitive.isDestroyed?.()) primitive.destroy?.(); } catch (_) {}
  }

  function effectOrigin() {
    const G = state.geofs;
    const raw = G?.camera?.lla || G?.aircraft?.instance?.llaLocation;
    if (Array.isArray(raw) && raw.length >= 2) {
      const lat = Number(raw[0]), lon = Number(raw[1]), alt = finite(raw[2], 0);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, alt };
    }
    const pos = G?.aircraft?.instance?.llaLocation;
    if (Array.isArray(pos) && pos.length >= 2) return { lat: finite(pos[0], 0), lon: finite(pos[1], 0), alt: finite(pos[2], 0) };
    return null;
  }

  function offsetLatLon(lat, lon, eastM, northM) {
    const cosLat = Math.max(0.08, Math.cos(lat * Math.PI / 180));
    return { lat: clamp(lat + northM / 111320, -89.8, 89.8), lon: ((lon + eastM / (111320 * cosLat) + 540) % 360) - 180 };
  }

  function effectMaterial(color, glow = 0.18) {
    const C = state.Cesium;
    try { return C.Material.fromType(C.Material.PolylineGlowType || "PolylineGlow", { glowPower: glow, color }); }
    catch (_) { try { return C.Material.fromType(C.Material.ColorType || "Color", { color }); } catch (e) { return color; } }
  }

  function getFlashOverlay() {
    if (state.weatherFx.flashOverlay?.isConnected) return state.weatherFx.flashOverlay;
    const el = document.createElement("div");
    el.id = "amgfs190-lightning-flash";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;inset:0;z-index:999999;pointer-events:none;background:rgba(220,235,255,.92);opacity:0;transition:opacity 65ms linear;mix-blend-mode:screen;";
    document.body.appendChild(el); state.weatherFx.flashOverlay = el; return el;
  }

  function flashScreen(strength) {
    const el = getFlashOverlay(); if (!el) return;
    el.style.opacity = String(clamp(strength, 0, 0.32));
    addWeatherFxTimer(() => { if (el.isConnected) el.style.opacity = "0"; }, 70);
  }

  function lightningPath(lat, lon, startAlt, endAlt, azimuth, lengthM, segments, seedOffset = 0) {
    const C = state.Cesium; const result = [];
    let x = 0, y = 0;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      if (i > 0 && i < segments) {
        const scale = lengthM * (0.014 + 0.035 * (1 - t));
        x += (Math.random() - 0.5) * scale; y += (Math.random() - 0.5) * scale;
      }
      const drift = lengthM * 0.08 * t;
      const east = Math.sin(azimuth) * drift + x;
      const north = Math.cos(azimuth) * drift + y;
      const ll = offsetLatLon(lat, lon, east, north);
      const bend = Math.sin(t * Math.PI) * 18 + seedOffset;
      const alt = lerp(startAlt, endAlt, t) + bend;
      result.push(C.Cartesian3.fromDegrees(ll.lon, ll.lat, Math.max(0, alt)));
    }
    return result;
  }

  function removeLightningCollection(collection) {
    removePrimitive(collection);
    state.weatherFx.lightningCollections = state.weatherFx.lightningCollections.filter(v => v !== collection);
  }

  function triggerLightning(force = false) {
    const C = state.Cesium, scene = state.geofs?.api?.viewer?.scene, origin = effectOrigin();
    if (!C || !scene?.primitives || !origin) return false;
    const weather = weatherObject()?.definition || {};
    const p = state.physics || computeWeatherPhysics(weather);
    const intensity = force ? 1 : clamp(Math.max(p.lightningPotential || 0, p.thunderObs || 0), 0, 1);
    if (!force && intensity < 0.16) return false;
    const az = Math.random() * Math.PI * 2;
    const distance = force ? 5500 + Math.random() * 5000 : 10000 + Math.random() * 26000;
    const ll = offsetLatLon(origin.lat, origin.lon, Math.sin(az) * distance, Math.cos(az) * distance);
    const base = clamp(finite(weather.cloudBase, finite(p.lclM, 900)), 400, 6500);
    const top = clamp(finite(weather.cloudTop, finite(p.elM, base + 7000)), base + 1000, 17500);
    const start = Math.min(top, base + (top - base) * (0.48 + Math.random() * 0.4));
    const coll = new C.PolylineCollection();
    const main = lightningPath(ll.lat, ll.lon, start, 20 + Math.random() * 60, az + (Math.random() - .5) * .4, 700 + Math.random() * 650, 18);
    const cold = C.Color?.fromBytes ? C.Color.fromBytes(206, 230, 255, 255) : C.Color.WHITE;
    const white = C.Color?.WHITE || cold;
    coll.add({ positions: main, width: 2.4 + intensity * 1.6, material: effectMaterial(white, 0.24) });
    const branches = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branches; b++) {
      const idx = 4 + Math.floor(Math.random() * 11);
      const branchStart = main[Math.min(idx, main.length - 1)];
      const carto = C.Cartographic.fromCartesian(branchStart);
      const branchAz = az + (Math.random() - .5) * 2.1;
      const branchLength = 180 + Math.random() * 480;
      const branchEndAlt = Math.max(0, start * (0.45 + Math.random() * 0.25));
      const branchPts = lightningPath(C.Math.toDegrees(carto.latitude), C.Math.toDegrees(carto.longitude), carto.height, branchEndAlt, branchAz, branchLength, 7, Math.random() * 20);
      coll.add({ positions: branchPts, width: 1.0 + Math.random() * 0.8, material: effectMaterial(cold, 0.18) });
    }
    scene.primitives.add(coll); state.weatherFx.lightningCollections.push(coll);
    coll.show = true; flashScreen(0.12 + intensity * 0.16);
    addWeatherFxTimer(() => { try { coll.show = false; } catch (_) {} }, 95);
    addWeatherFxTimer(() => { try { coll.show = true; } catch (_) {} flashScreen(0.08 + intensity * 0.10); }, 185);
    addWeatherFxTimer(() => removeLightningCollection(coll), 760);
    state.weatherFx.lastEventText = `雷光発生 · 強度 ${Math.round(intensity * 100)}%`;
    return true;
  }

  function tornadoPotential(p) {
    const cape = smoothstepSafe(1100, 2800, finite(p?.cape, 0));
    const shear = smoothstepSafe(9, 24, finite(p?.shearMsPerKm, 0));
    const lowBase = 1 - smoothstepSafe(900, 2600, finite(p?.lclM, 2500));
    const storm = Math.max(finite(p?.lightningPotential, 0), finite(p?.thunderObs, 0), finite(p?.convectiveIndex, 0) * 0.55);
    return clamp(0.34 * cape + 0.30 * shear + 0.14 * lowBase + 0.22 * storm, 0, 1);
  }

  function tornadoGroundHeight(lat, lon) {
    const scene = state.geofs?.api?.viewer?.scene, C = state.Cesium;
    try {
      const c = C.Cartographic.fromDegrees(lon, lat);
      const h = scene?.globe?.getHeight?.(c);
      if (Number.isFinite(h)) return Math.max(0, h);
    } catch (_) {}
    return 0;
  }

  function removeTornadoVisual() {
    removePrimitive(state.weatherFx.tornadoLines);
    removePrimitive(state.weatherFx.tornadoPoints);
    state.weatherFx.tornadoLines = null; state.weatherFx.tornadoPoints = null;
  }

  function renderTornadoVisual(event) {
    const C = state.Cesium, scene = state.geofs?.api?.viewer?.scene;
    if (!C || !scene?.primitives || !event) return false;
    removeTornadoVisual();
    const lines = new C.PolylineCollection();
    const particles = new C.PointPrimitiveCollection();
    const strands = 14, samples = 52, turns = 3.8;
    const haze = new C.Color(0.44, 0.43, 0.40, 0.28);
    const darker = new C.Color(0.27, 0.27, 0.26, 0.34);
    for (let s = 0; s < strands; s++) {
      const positions = [];
      const phase = 2 * Math.PI * s / strands;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const taper = Math.pow(1 - t, 1.18);
        const radius = event.topRadius + (event.baseRadius - event.topRadius) * taper;
        const theta = phase + t * turns * Math.PI * 2 + 0.22 * Math.sin(t * 9 + phase);
        const r = radius * (0.88 + 0.12 * Math.sin(t * 19 + phase * 1.7));
        const ll = offsetLatLon(event.lat, event.lon, Math.cos(theta) * r, Math.sin(theta) * r);
        const alt = event.ground + 14 + t * event.height + 9 * Math.sin(theta * 2);
        positions.push(C.Cartesian3.fromDegrees(ll.lon, ll.lat, alt));
      }
      lines.add({ positions, width: s % 3 === 0 ? 3.2 : 2.0, material: effectMaterial(s % 4 === 0 ? darker : haze, 0.08) });
    }
    // Broad, broken near-ground dust rings and suspended debris points.
    for (let ring = 0; ring < 4; ring++) {
      const positions = []; const t = 0.025 + ring * 0.035; const radius = event.baseRadius * (0.85 + ring * 0.16);
      for (let j = 0; j <= 42; j++) {
        const ang = j / 42 * Math.PI * 2;
        const rr = radius * (1 + 0.09 * Math.sin(ang * 5 + ring));
        const ll = offsetLatLon(event.lat, event.lon, Math.cos(ang) * rr, Math.sin(ang) * rr);
        positions.push(C.Cartesian3.fromDegrees(ll.lon, ll.lat, event.ground + 12 + ring * 22 + 8 * Math.sin(ang * 3)));
      }
      lines.add({ positions, width: 2.0, material: effectMaterial(new C.Color(0.38, 0.35, 0.30, 0.24), 0.05) });
    }
    for (let i = 0; i < 68; i++) {
      const ang = Math.random() * Math.PI * 2, rr = 30 + Math.random() * event.baseRadius * 1.35;
      const ll = offsetLatLon(event.lat, event.lon, Math.cos(ang) * rr, Math.sin(ang) * rr);
      particles.add({ position: C.Cartesian3.fromDegrees(ll.lon, ll.lat, event.ground + 12 + Math.random() * 210),
        pixelSize: 2 + Math.random() * 4.5, color: new C.Color(0.42, 0.39, 0.33, 0.28 + Math.random() * 0.2),
        disableDepthTestDistance: 0 });
    }
    scene.primitives.add(lines); scene.primitives.add(particles);
    state.weatherFx.tornadoLines = lines; state.weatherFx.tornadoPoints = particles;
    state.weatherFx.tornadoLastBuild = Date.now();
    return true;
  }

  function spawnTornado(force = false) {
    const origin = effectOrigin(); if (!origin) return false;
    const p = state.physics || computeWeatherPhysics();
    const index = force ? 1 : tornadoPotential(p);
    if (!force && index < 0.72) return false;
    if (state.weatherFx.tornado) removeTornadoVisual();
    const heading = (finite(weatherObject()?.definition?.windDirection, 250) + 180) % 360;
    const az = Math.random() * Math.PI * 2;
    const distance = force ? 6500 + Math.random() * 1500 : 5500 + Math.random() * 9000;
    const ll = offsetLatLon(origin.lat, origin.lon, Math.sin(az) * distance, Math.cos(az) * distance);
    const event = { lat: ll.lat, lon: ll.lon, ground: tornadoGroundHeight(ll.lat, ll.lon),
      height: force ? 1450 : 850 + index * 1650, baseRadius: force ? 105 : 55 + index * 135,
      topRadius: force ? 14 : 10 + index * 20, heading, speed: force ? 15 : clamp(finite(weatherObject()?.definition?.windSpeedMS, 12) * 0.72 + 7, 10, 34),
      start: Date.now(), lastMove: Date.now(), duration: force ? 85000 : 90000 + index * 90000, strength: index };
    state.weatherFx.tornado = event;
    renderTornadoVisual(event);
    state.weatherFx.lastEventText = `竜巻発生 · 強度 ${Math.round(index * 100)}%`;
    return true;
  }

  function updateTornado() {
    const e = state.weatherFx.tornado; if (!e) return;
    const now = Date.now();
    if (now - e.start > e.duration) {
      removeTornadoVisual(); state.weatherFx.tornado = null;
      state.weatherFx.lastEventText = "竜巻イベント終了"; return;
    }
    const dt = clamp((now - e.lastMove) / 1000, 0, 10); e.lastMove = now;
    const rad = e.heading * Math.PI / 180;
    const ll = offsetLatLon(e.lat, e.lon, Math.sin(rad) * e.speed * dt, Math.cos(rad) * e.speed * dt);
    e.lat = ll.lat; e.lon = ll.lon;
    if (now - state.weatherFx.tornadoLastBuild > 2200) {
      e.ground = tornadoGroundHeight(e.lat, e.lon); renderTornadoVisual(e);
    }
  }

  function updateWeatherEffects(physics, force = false) {
    if (!state.masterEnabled || !state.compatible) return;
    const now = Date.now(); const p = physics || computeWeatherPhysics();
    const lp = clamp(Math.max(finite(p.lightningPotential, 0), finite(p.thunderObs, 0)), 0, 1);
    if (S.WX_LIGHTNING && (force || lp >= 0.17) && now >= state.weatherFx.lightningNextAt) {
      triggerLightning(force);
      const level = force ? 1 : lp;
      state.weatherFx.lightningNextAt = now + (force ? 12000 : (34000 - level * 26500) * (0.72 + Math.random() * 0.56));
    }
    updateTornado();
    const tp = tornadoPotential(p);
    if (S.WX_TORNADO && !state.weatherFx.tornado && tp >= 0.73 && now >= (state.weatherFx.tornadoNextAt || 0)) {
      spawnTornado(false);
      state.weatherFx.tornadoNextAt = now + (130000 + (1 - tp) * 100000) * (0.72 + Math.random() * 0.55);
    }
    if (state.root) {
      const el = state.root.querySelector("[data-weather-effects-status]");
      if (el) el.textContent = `${state.weatherFx.lastEventText} · 雷ポテンシャル ${Math.round(lp * 100)}% · 竜巻指標 ${Math.round(tp * 100)}%`;
    }
  }

  function clearWeatherEffects() {
    for (const id of state.weatherFxTimers) window.clearTimeout(id);
    state.weatherFxTimers.length = 0;
    for (const coll of [...state.weatherFx.lightningCollections]) removeLightningCollection(coll);
    removeTornadoVisual(); state.weatherFx.tornado = null;
    state.weatherFx.flashOverlay?.remove(); state.weatherFx.flashOverlay = null;
  }

  function createArgs() {
    const a = state.atmosphere, api = state.geofs?.api?.renderingSettings || {};
    const advanced = typeof api.advancedAtmosphere === "boolean" ? api.advancedAtmosphere : !!a.advancedAtmosphere;
    const quality = finite(api.scatteringQuality, finite(a.quality, 4));
    const volumetric = typeof api.volumetricClouds === "boolean" ? api.volumetricClouds :
      (typeof state.original?.renderPrefs?.volumetricClouds === "boolean" ? state.original.renderPrefs.volumetricClouds : !!a.volumetricClouds);
    const realtime = volumetric ? !!a.realTimeClouds : false;
    const retro = typeof a.retro === "boolean" ? a.retro : false;
    return [advanced, quality, volumetric, realtime, retro];
  }

    function rebuildAtmosphere() {
    const a = state.atmosphere;
    if (!a || typeof state.original?.create !== "function") return false;
    try {
      removeLensGhostStage();
      if (a.postProcessingStages && typeof state.original.destroy === "function") state.original.destroy.call(a);
      applyShaders();
      setCloudRuntimeFlags(false);
      state.original.create.apply(a, createArgs());
      applyCloudWeatherOverride();
      updateLensGhostStage();
      const loc = state.geofs?.camera?.lla || state.geofs?.aircraft?.instance?.llaLocation;
      if (loc && typeof a.update === "function") a.update(loc, true);
      if (typeof a.setFogColor === "function") a.setFogColor();
      updateColorModifiers();
      state.applied = true; updateStatus(); return true;
    } catch (error) {
      console.error("[AtmosphereMod GeoFS] Atmosphere rebuild failed", error);
      try {
        restoreShaders(); removeLensGhostStage();
        if (a.postProcessingStages && state.original.destroy) state.original.destroy.call(a);
        state.original.create.apply(a, createArgs());
        updateLensGhostStage();
      } catch (restoreError) { console.error("[AtmosphereMod GeoFS] Native atmosphere recovery failed", restoreError); }
      updateStatus("大気再構築エラー · GeoFS標準シェーダーへ復帰しました"); return false;
    }
  }

  function scheduleRebuild() {
    clearTimeout(state.rebuildTimer);
    state.rebuildTimer = setTimeout(() => {
      if (state.destroyed || !state.compatible) return;
      try {
        rebuildAtmosphere();
      } catch (error) {
        restoreShaders();
        console.error("[AtmosphereMod GeoFS] Apply failed", error);
        updateStatus("適用エラー · 標準描画へ戻しました");
      }
      saveSettings();
      refreshMetrics();
    }, 500);
  }



    function liveCloudStats() {
    const a = state.atmosphere;
    const native = nativeCloudStats();
    return { ...native, advanced: !!a?.advancedAtmosphere, stageReady: !!a?.cloudsPostProcessStage };
  }
    function statusText(extra) {
    if (extra) return extra;
    if (!state.geofs) return "GeoFSの読み込みを待っています";
    if (!state.compatible) return "GeoFS 4.0描画環境を初期化できません";
    if (!state.masterEnabled) return "停止中 · GeoFS標準の大気・雲描画を使用しています";
    const c = liveCloudStats();
    return `大気散乱 ${state.atmosphereShaderReady ? "ON" : "標準"} · GeoFS標準雲 ${c.volumetric ? "ON" : "OFF"} · レンズ光学 ${S.LG ? "ON" : "OFF"}`;
  }

  function updateStatus(extra) {
    const txt = statusText(extra);
    if (txt === state.lastStatus && !extra) return;
    state.lastStatus = txt;
    if (state.root) {
      const status = state.root.querySelector("[data-am-status]");
      const badge = state.root.querySelector("[data-am-badge]");
      if (status) status.textContent = txt;
      if (badge) {
        const active = state.compatible && state.masterEnabled;
        badge.textContent = !state.compatible ? "CHECK" : active ? "READY" : "OFF";
        badge.className = "am-badge " + (!state.compatible ? "warn" : active ? "on" : "off");
      }
    }
    if (extra) console.warn("[AtmosphereMod GeoFS] " + extra);
  }

  function heightText(v) { return v !== null && v !== undefined && Number.isFinite(Number(v)) ? `${Math.round(Number(v)).toLocaleString()} m` : "—"; }
  function distanceText(v) { if (!Number.isFinite(Number(v))) return "—"; const km = Number(v) / 1000; return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`; }

  function refreshMetrics() {
    if (!state.root) return;
    const w = weatherObject(), d = w?.definition || {};
    const loc = state.geofs?.aircraft?.instance?.llaLocation;
    const cloud = liveCloudStats();
    const wm = weatherMetrics();
    const metrics = {
      vis: distanceText(wm.visibility),
      altitude: Number.isFinite(Number(loc?.[2])) ? heightText(loc[2]) : "—",
      cover: Number.isFinite(cloud.cover) ? `${Math.round(clamp(cloud.cover, 0, 1) * 100)}%` : "—",
      base: Number.isFinite(cloud.base) ? heightText(cloud.base) : "—",
      top: Number.isFinite(cloud.top) ? heightText(cloud.top) : "—",
      temp: Number.isFinite(Number(wm.temperature)) ? `${Number(wm.temperature).toFixed(1)} °C` : "—",
      dew: Number.isFinite(Number(wm.dewPoint)) ? `${Number(wm.dewPoint).toFixed(1)} °C` : "—",
      volume: cloud.volumetric ? "ON" : "OFF"
    };
    const sunset = sunsetOpticalState();
    metrics.seasonSun = `${sunset.season.name} · 太陽 ${sunset.elevationDeg.toFixed(1)}° / ${Math.round(sunset.azimuthDeg)}° · 視線 ${finite(sunset.viewElevationDeg, 0).toFixed(1)}°`;
    metrics.sunsetStrength = `${Math.round(clamp(sunset.strength / 1.5, 0, 1) * 100)}% · 暖色 ${Math.round(sunset.warmIndex * 100)}%`;
    metrics.waterReflection = state.geofs?.fx?.globe?.material ? `${Math.round(sunset.reflectionStrength * 100)}% · ON` : "GeoFS Water FX OFF";
    metrics.airMass = `${sunset.airMass.toFixed(2)} · ${sunset.visibilityKm.toFixed(1)} km`;
    metrics.spectral = `R ${sunset.transmittance[0].toFixed(3)} / G ${sunset.transmittance[1].toFixed(3)} / B ${sunset.transmittance[2].toFixed(3)} · 散乱角 ${Math.acos(clamp(sunset.scatterCosine, -1, 1)) * 180 / Math.PI | 0}°`;
    metrics.twilight = `Golden ${Math.round(sunset.goldenBand*100)}% · Civil ${Math.round(sunset.civilBand*100)}% · Nautical ${Math.round(sunset.nauticalBand*100)}%`;
    const p = state.physics || computeWeatherPhysics(d);
    Object.assign(metrics, {
      cape: `${Math.round(p.cape).toLocaleString()} J/kg`,
      cin: `${Math.round(p.cin).toLocaleString()} J/kg`,
      lcl: heightText(p.lclM),
      lfc: heightText(p.lfcM),
      el: heightText(p.elM),
      freeze: heightText(p.freezingLevelM),
      wetbulb: `${p.wetBulbC.toFixed(1)} °C`,
      shear: `${p.shearMsPerKm.toFixed(1)} m/s/km`,
      rh: `${Math.round(p.rh * 100)}%`,
      phase: p.phase,
      mixratio: `${p.mixingRatioGkg.toFixed(2)} g/kg`,
      vpd: `${p.vaporPressureDeficitHpa.toFixed(2)} hPa`,
      updraft: `${p.updraftVelocityMs.toFixed(1)} m/s`,
      turbulence: `${Math.round(p.turbulenceIndex * 100)}%`,
      downdraft: `${Math.round(p.downdraftPotential * 100)}%`,
      warmrain: `${Math.round(p.warmRainPotential * 100)}%`,
      bergeron: `${Math.round(p.bergeronPotential * 100)}%`,
      riming: `${Math.round(p.rimingPotential * 100)}%`,
      hail: `${Math.round(p.hailPotential * 100)}%`,
      evaporative: `${Math.round(p.evaporativeCoolingPotential * 100)}%`,
      lpi: `${Math.round(p.lightningPotential * 100)}%`,
      water: Number.isFinite(p.precipitableWaterMm) ? `${p.precipitableWaterMm.toFixed(1)} kg/m²` : "—",
      radiation: Number.isFinite(p.solarRadiationWm2) ? `${Math.round(p.solarRadiationWm2)} W/m²` : "—",
      updraft: `${p.updraftVelocityMs.toFixed(1)} m/s`
    });
    for (const [key, value] of Object.entries(metrics)) {
      const el = state.root.querySelector(`[data-metric="${key}"]`);
      if (el) el.textContent = value;
    }
    const src = state.root.querySelector("[data-weather-source]");
    const nwp = activeNwpProfile();
    if (src) src.textContent = S.CG ? "GeoFS native cloud renderer" : nwp ? `Open-Meteo 鉛直予報 (${nwp.levels.length}層 · ${nwp.validTime} UTC)` : w ? "GeoFS weather.definition（集約値・NWP未接続）" : "未取得";
    const nwpEl = state.root.querySelector("[data-nwp-status]");
    if (nwpEl) nwpEl.textContent = state.nwpProfile && !nwp ? "予報データの有効期限切れ · 再取得待ち" : state.nwpStatus;
  }

  const CONTROL_GROUPS = [
    { id: "haze", title: "霞レイヤー / Haze layer", controls: [
      ["T1", "境界層の上端", 0.3, 6, 0.1, "km"],
      ["T2", "境界層上端の幅", 0.04, 1.5, 0.01, "km"],
      ["T3", "境界層の霞量", 0, 14, 0.1, "×"],
      ["T4", "自由対流圏の霞量", 0, 3, 0.05, "×"],
      ["T5", "自由対流圏のスケール高度", 0.5, 10, 0.1, "km"],
      ["T6", "褐色吸収・青成分抑制", 0, 1, 0.01, ""],
      ["T7", "後方散乱ローブ", 0, 0.5, 0.01, ""],
      ["T9", "エアロゾル異方性 g", 0, 0.99, 0.01, ""],
      ["T10", "粒子のAngström指数", 0, 2.5, 0.05, ""],
      ["T11", "遠景の雲の色付き霞", 0, 1, 0.01, ""],
      ["T12", "高高度の雲描画距離拡張", 0, 1, 0.01, ""]
    ]},
    { id: "clouds", title: "雲の照明 / Cloud lighting", controls: [
      ["C1", "前方散乱ローブ g", 0, 0.99, 0.005, ""],
      ["C2", "シルバーライニングの強さ", 0, 0.5, 0.01, ""],
      ["C3", "多重散乱・バウンス量", 0, 1, 0.01, ""],
      ["C4", "バウンス光の前方性", 0, 0.9, 0.01, ""],
      ["C5", "雲内部の日射", 0, 0.25, 0.005, ""],
      ["C6", "Powder効果", 0, 1, 0.01, ""],
      ["C7", "Powder蓄積深度", 0, 500, 5, "m"],
      ["C8", "雲縁のシャープさ", 0, 8, 0.1, ""],
      ["C9", "Glory強度", 0, 2, 0.05, ""],
      ["C10", "水滴半径（Mie散乱）", 2, 25, 0.5, "µm"],
      ["C11", "水滴サイズ分布", 0.02, 0.45, 0.005, ""],
      ["C16", "雲の光学密度", 0, 4, 0.05, "×"],
      ["C17", "雲底密度プロファイル", 0, 1, 0.01, ""],
      ["C18", "薄い高層雲へ戻す高度（0=6km）", 0, 12000, 100, "m"],
      ["C19", "高層雲の密度倍率（0=1）", 0, 3, 0.05, "×"],
      ["C28", "雲底の平滑化", 0, 1, 0.01, ""],
      ["C29", "雲底平滑化の高さ", 0, 1000, 10, "m"],
      ["C30", "細かいビローの強さ", 0, 0.05, 0.001, ""],
      ["C31", "最小ビロー形状スケール", 0, 1500, 10, "m"]
    ]},
    { id: "weather", title: "大気熱力学・対流診断 / Thermodynamics", controls: [
      ["WLR", "環境気温減率（推定）", 4.0, 9.5, 0.1, "K/km"],
      ["WENT", "上昇気塊の混合・エントレインメント", 0, 0.5, 0.01, "×"]
    ]}
  ];

  function renderControls(group) {
    return `<div class="am-group-title">${group.title}</div>` + group.controls.map(([key, label, min, max, step, unit]) =>
      `<label class="am-control"><span><b>${key}</b> ${label}<output data-value="${key}"></output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}"></label>`
    ).join("");
  }

  function fmtControl(key, value) {
    if (Number(value) === 0) {
      const zeroDefaults = {
        T9: "0.8 (GeoFS標準)", C1: "0.5 (GeoFS標準)", C5: "0.033 (GeoFS標準)",
        C7: "100 m (標準値)", C10: "10 µm (標準値)", C11: "0.15 (標準値)",
        C17: "1.00 (GeoFS標準)", C18: "6,000 m (標準値)", C19: "1.00 (GeoFS標準)",
        C29: "300 m (標準値)", C31: "82 m (標準値)"
      };
      if (zeroDefaults[key]) return zeroDefaults[key];
    }
    if (key === "WLR") return `${Number(value).toFixed(1)} K/km`;
    if (key === "WENT") return Number(value).toFixed(2);
    if (["T1", "T2", "T5"].includes(key)) return `${Number(value).toFixed(2)} km`;
    if (["C7", "C18", "C29", "C31", "CB", "CT"].includes(key)) return `${Math.round(value)} m`;
    if (key === "CC") return `${Math.round(value * 100)}%`;
    if (key === "CM") return CLOUD_MODES[Math.round(value)] || "Mixed sky";
    if (key === "IR" || key === "IF" || key === "LGI") return `${Math.round(value * 100)}%`;
    if (key === "C10") return `${Number(value).toFixed(1)} µm`;
    return Number(value).toFixed(2);
  }

  function syncUI() {
    if (!state.root) return;
    const master = state.root.querySelector("[data-master]");
    const t0 = state.root.querySelector("[data-T0]");
    const c0 = state.root.querySelector("[data-C0]");
    if (master) master.checked = state.masterEnabled;
    if (t0) t0.checked = !!S.T0;
    if (c0) c0.checked = !!S.C0;
    state.root.querySelectorAll("[data-bool]").forEach(input => { input.checked = !!S[input.dataset.bool]; });
    state.root.querySelectorAll("[data-setting]").forEach(input => {
      const key = input.dataset.setting;
      input.value = S[key];
      const out = state.root.querySelector(`[data-value="${key}"]`);
      if (out) out.textContent = fmtControl(key, S[key]);
    });
    updateStatus();
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
      localStorage.setItem(MASTER_KEY, String(state.masterEnabled));
    } catch (e) { console.warn("[AtmosphereMod GeoFS] Could not save settings", e); }
  }

  function applyPreset(name) {
    if (!PRESETS[name]) return;
    Object.assign(S, PRESETS[name]);
    syncUI();
    scheduleRebuild();
  }

  function exportProfile() {
    const data = {
      name: "AtmosphereMod GeoFS profile", version: VERSION,
      source: "AtmosphereMod GeoFS 1.11.0 physical sunset / reflections / native clouds",
      exportedAt: new Date().toISOString(), masterEnabled: state.masterEnabled,
      settings: { ...S }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "AtmosphereMod-GeoFS-1.11.0-profile.json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function importProfile(file) {
    if (!file) return;
    file.text().then(raw => {
      const parsed = JSON.parse(raw);
      const incoming = parsed.settings || parsed;
      for (const [key, range] of Object.entries(LIMITS)) {
        if (key in incoming) S[key] = clamp(incoming[key], range[0], range[1]);
      }
      for (const key of ["T0", "C0", "T8", "T13", "C22", "CG", "WX", "NWP", "LG", "WX_LIGHTNING", "WX_TORNADO"]) if (key in incoming) S[key] = incoming[key] ? 1 : 0;
      S.CM = Math.round(clamp(S.CM, 0, 10));
      S.CQ = Math.round(clamp(S.CQ, 1, 3));
      if (typeof parsed.masterEnabled === "boolean") state.masterEnabled = parsed.masterEnabled;
      syncUI(); scheduleRebuild(); saveSettings();
    }).catch(error => {
      console.error("[AtmosphereMod GeoFS] Profile import failed", error);
      updateStatus("設定JSONの読み込みに失敗しました");
    });
  }

  function createUI() {
    document.getElementById(UI_ID)?.remove();
    document.getElementById(MENU_ITEM_ID)?.remove();
    const preferenceList = document.querySelector(".geofs-preference-list");
    if (!preferenceList) throw new Error("GeoFS native Options list .geofs-preference-list was not found");
    const root = document.createElement("div");
    root.id = UI_ID;
    root.innerHTML = `
      <style>
        #${UI_ID}{width:100%;color:rgba(0,0,0,.87);font:14px/20px "Helvetica","Arial",sans-serif;pointer-events:auto;background:transparent;}
        #${UI_ID} *{box-sizing:border-box}#${UI_ID} button,#${UI_ID} input{font:inherit}#${UI_ID} button{cursor:pointer}
        #${UI_ID} .am-launch,#${UI_ID} .am-icon{display:none}
        #${UI_ID} .am-panel{pointer-events:auto;display:block;width:100%;max-height:min(72vh,820px);overflow:hidden;border:0;border-radius:0;background:transparent;box-shadow:none}
        #${UI_ID} .am-head{padding:9px 0 7px;background:transparent;border:0;border-bottom:1px solid #ddd}
        #${UI_ID} .am-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
        #${UI_ID} .am-title{font-size:16px;line-height:24px;font-weight:500;letter-spacing:0;color:rgba(0,0,0,.87);text-transform:none}
        #${UI_ID} .am-sub{font-size:11px;color:rgba(0,0,0,.54);letter-spacing:0;text-transform:none}
        #${UI_ID} .am-badge{padding:0;border:0;border-radius:0;font-size:11px;font-weight:500;color:#666;background:transparent}
        #${UI_ID} .am-badge.on{color:#2e7d32}#${UI_ID} .am-badge.warn{color:#9a6b00}#${UI_ID} .am-badge.off{color:#777}
        #${UI_ID} .am-status{margin-top:4px;color:rgba(0,0,0,.54);font-size:12px;min-height:18px}
        #${UI_ID} .am-close{border:0;background:transparent;color:#666;font-size:22px;line-height:24px;padding:2px 8px;min-width:32px}
        #${UI_ID} .am-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 0;border-bottom:1px solid #e0e0e0;font-size:13px}
        #${UI_ID} .am-tabs{display:flex;gap:0;padding:0;margin:0;border-bottom:1px solid #ddd;overflow-x:auto}
        #${UI_ID} .am-tabs button{flex:1;min-width:68px;padding:10px 6px 8px;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:rgba(0,0,0,.60);font-size:12px;font-weight:500;white-space:nowrap}
        #${UI_ID} .am-tabs button.active{background:transparent;border-bottom-color:#448aff;color:#212121}
        #${UI_ID} .am-content{overflow:auto;padding:8px 2px;min-height:170px;max-height:calc(72vh - 155px)}
        #${UI_ID} .am-page[hidden]{display:none}
        #${UI_ID} .am-group-title{margin:14px 0 6px;padding:0 0 5px;border:0;border-bottom:1px solid #ddd;background:transparent;color:rgba(0,0,0,.70);font-size:13px;font-weight:500;letter-spacing:0}
        #${UI_ID} .am-control{display:block;padding:8px 2px 9px;border-bottom:1px solid #eee}
        #${UI_ID} .am-control span{display:flex;align-items:baseline;gap:7px;color:rgba(0,0,0,.82);font-size:13px;line-height:19px}
        #${UI_ID} .am-control b{color:#555;font-family:"Helvetica","Arial",sans-serif;font-weight:600}
        #${UI_ID} output{margin-left:auto;color:#666;font-size:12px;font-variant-numeric:tabular-nums}
        #${UI_ID} input[type=range]{display:block;width:calc(100% - 24px);height:28px;margin:4px 12px 0;accent-color:#448aff;touch-action:pan-y}
        #${UI_ID} input[type=checkbox]{appearance:none;-webkit-appearance:none;width:36px;height:14px;margin:0 2px 0 10px;position:relative;border:0;border-radius:14px;background:rgba(0,0,0,.26);flex:0 0 36px;cursor:pointer;vertical-align:middle;transition:background .18s ease}
        #${UI_ID} input[type=checkbox]::before{content:"";position:absolute;left:0;top:-3px;width:20px;height:20px;border-radius:50%;background:#fafafa;box-shadow:0 2px 2px #0002,0 1px 5px #0002;transition:left .18s ease,background .18s ease}
        #${UI_ID} input[type=checkbox]:checked{background:rgba(255,193,7,.50)}
        #${UI_ID} input[type=checkbox]:checked::before{left:16px;background:rgb(255,193,7)}
        #${UI_ID} input[type=checkbox]:focus-visible{outline:2px solid #448aff;outline-offset:4px}
        #${UI_ID} .am-check{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid #eee;color:rgba(0,0,0,.82);font-size:13px;min-height:48px}
        #${UI_ID} .am-check span{flex:1}
        #${UI_ID} .am-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:6px 0 10px}
        #${UI_ID} .am-metric{padding:7px;background:#f5f5f5;border:0;border-bottom:2px solid #e0e0e0;border-radius:0;min-width:0}
        #${UI_ID} .am-metric small{display:block;color:#757575;font-size:10px;line-height:14px}
        #${UI_ID} .am-metric b{display:block;margin-top:3px;color:#333;font-size:12px;font-weight:500;overflow-wrap:anywhere}
        #${UI_ID} .am-note{padding:7px 2px;margin:7px 0;background:transparent;border:0;border-top:1px solid #eee;border-radius:0;color:#666;font-size:11px;line-height:1.55}
        #${UI_ID} .am-actions{display:flex;gap:6px;padding:8px 0;border-top:1px solid #ddd}
        #${UI_ID} .am-actions button{flex:1;min-height:36px;padding:6px 10px;border:0;border-radius:2px;background:#eee;color:#333;font-size:12px;font-weight:500;text-transform:uppercase;box-shadow:0 1px 2px #0002}
        #${UI_ID} .am-actions button.primary{background:#448aff;color:#fff}
        #${UI_ID} .am-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        #${UI_ID} .am-card{padding:7px;background:#f5f5f5;border:0;border-bottom:1px solid #ddd;border-radius:0;color:#666;font-size:11px;line-height:1.45;min-width:0;overflow-wrap:anywhere}
        #${UI_ID} .am-card b{display:block;color:#444;margin-bottom:3px;font-size:12px;font-weight:500}
        #${UI_ID} .am-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}
        #${UI_ID} .am-presets button{padding:8px;background:#fff;color:#333;border:1px solid #bbb;border-radius:2px;font-size:12px}
        #${UI_ID} a{color:#1565c0;text-decoration:none}#${UI_ID} a:hover{text-decoration:underline}
        #${UI_ID} fieldset{border:0;border-top:1px solid #ddd;padding:7px 0;margin:10px 0}
        #${UI_ID} legend{padding:0 6px 0 0;color:#555;font-size:13px;font-weight:500}
        @media(max-width:520px){#${UI_ID} .am-panel{max-height:76vh}#${UI_ID} .am-content{max-height:calc(76vh - 150px)}#${UI_ID} .am-tabs button{font-size:11px;padding:9px 5px;min-width:58px}#${UI_ID} .am-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
      </style>
      <section class="am-panel" aria-label="AtmosphereMod GeoFS Options">
        <header class="am-head"><div class="am-top"><div><div class="am-title">AtmosphereMod</div><div class="am-sub">GeoFS 4.0 · 大気・光学・気象エフェクト 1.11.0</div></div><div style="display:flex;align-items:center;gap:8px"><span class="am-badge warn" data-am-badge>CHECK</span><button class="am-close" data-close>×</button></div></div><div class="am-status" data-am-status>GeoFSの描画環境を確認しています</div></header>
        <div class="am-bar"><label><input type="checkbox" data-master> Mod 有効</label><label><input type="checkbox" data-T0> 大気散乱</label><span style="font-size:10px;color:rgba(0,0,0,.54)">雲：GeoFS標準描画を維持</span></div>
        <nav class="am-tabs"><button class="active" data-tab="overview">概要</button><button data-tab="haze">空・霞</button><button data-tab="clouds">雲</button><button data-tab="weather">気象物理</button><button data-tab="support">移植範囲</button></nav>
        <div class="am-content">
          <section class="am-page" data-page="overview">
            <div class="am-metrics"><div class="am-metric"><small>VISIBILITY</small><b data-metric="vis">—</b></div><div class="am-metric"><small>ALTITUDE</small><b data-metric="altitude">—</b></div><div class="am-metric"><small>CLOUD COVER</small><b data-metric="cover">—</b></div><div class="am-metric"><small>CLOUD BASE</small><b data-metric="base">—</b></div><div class="am-metric"><small>CLOUD TOP</small><b data-metric="top">—</b></div><div class="am-metric"><small>TEMP</small><b data-metric="temp">—</b></div><div class="am-metric"><small>DEW POINT</small><b data-metric="dew">—</b></div><div class="am-metric"><small>NATIVE CLOUDS</small><b data-metric="volume">—</b></div><div class="am-metric"><small>CAPE (EST.)</small><b data-metric="cape">—</b></div><div class="am-metric"><small>LCL</small><b data-metric="lcl">—</b></div><div class="am-metric"><small>WET BULB</small><b data-metric="wetbulb">—</b></div></div>
            <div class="am-note">天候入力：<span data-weather-source>未取得</span><br>数値予報が有効な場合は鉛直プロファイルを使用し、未取得時はGeoFSの集約気象値へ戻ります。</div>
            <div class="am-group-title">プロファイル</div><div class="am-presets"><button data-preset="default">MSFS Defaults</button><button data-preset="clear">Clear Air</button><button data-preset="maritime">Maritime</button><button data-preset="dusty">Dust / Haze</button></div>
            <div class="am-note">Ctrl + Shift + F9：Mod全体のON / OFF<br>Ctrl + Shift + F10：現在設定で大気・光学を再構築</div>
          </section>
          <section class="am-page" data-page="haze" hidden>
            <div class="am-check"><span>T13 · GeoFS天候から霞量を推定</span><input type="checkbox" data-bool="T13"></div>
            <div class="am-check"><span>T8 · 薄明色・白色点の補正（近似）</span><input type="checkbox" data-bool="T8"></div>
            ${renderControls(CONTROL_GROUPS[0])}
            <label class="am-control"><span><b>T16</b> 天候連動霞の強度<output data-value="T16"></output></span><input type="range" data-setting="T16" min="0" max="2" step="0.05"></label>
            <label class="am-check"><span>C22 · 昼光ホワイトバランス（近似）</span><input type="checkbox" data-bool="C22"></label>
            <div class="am-group-title">季節・夕焼け・反射 / Seasonal sunset & reflection</div>
            <label class="am-control"><span><b>SS</b> 季節別の夕焼け・太陽光スペクトル <output data-value="SS"></output></span><input type="range" data-setting="SS" min="0" max="1.5" step="0.05"></label>
            <label class="am-control"><span><b>RW</b> 水面・地表へ返る夕焼け色 <output data-value="RW"></output></span><input type="range" data-setting="RW" min="0" max="1.5" step="0.05"></label>
            <div class="am-grid"><div class="am-card"><b>季節 / 太陽幾何</b><span data-metric="seasonSun">—</span></div><div class="am-card"><b>夕焼け・色温度差</b><span data-metric="sunsetStrength">—</span></div><div class="am-card"><b>水面反射</b><span data-metric="waterReflection">—</span></div><div class="am-card"><b>光路長 / 視程</b><span data-metric="airMass">—</span></div><div class="am-card"><b>波長別透過率</b><span data-metric="spectral">—</span></div><div class="am-card"><b>薄明フェーズ</b><span data-metric="twilight">—</span></div></div>
            <div class="am-note">GeoFSの太陽ワールドベクトルから太陽高度・方位・視線との相対角を取得し、Kasten–Young大気光路長、可視域のRayleigh/Mie減衰、Angström指数、湿度による粒子成長、可降水量、視程、雲量・降水・霧を組み合わせます。固定の季節色パレットではなく、波長別の直達光と散乱光から色を算出します。春夏秋冬の気候差は弱いエアロゾル事前値だけに限定し、ライブ気象を優先します。水面色はGeoFS標準Water FXのhorizonColor / azimutColorへ反映し、Water FX・SSRを勝手にONにはしません。</div>
            <div class="am-group-title">レンズ光学 / Lens optics</div>
            <div class="am-check"><span>LG · 視線・太陽方位に追従するレンズゴースト</span><input type="checkbox" data-bool="LG"></div>
            <label class="am-control"><span><b>LGI</b> ゴースト・フレア強度 <output data-value="LGI"></output></span><input type="range" data-setting="LGI" min="0" max="1" step="0.01"></label>
            <div class="am-note">レンズゴーストは太陽のワールド方向をカメラ座標へ毎フレーム投影し、画面中心を通る光学軸上に複数の内部反射像を配置します。太陽が視野外へ離れる・地平線下へ沈むと減衰します。レンズコーティングや絞り羽根の固有データはGeoFSから取得できないため、一般的な多枚数レンズの近似です。</div>
            <div class="am-note">T8はMSFS版の95波長フィット値やオゾンLUTを移植したものではありません。GeoFSの色補正APIによる弱い色調整です。T14の緯度・季節別オゾンクライマトロジーも未移植です。</div>
          </section>
          <section class="am-page" data-page="clouds" hidden>
            <div class="am-group-title">GeoFS標準の雲描画</div>
            <div class="am-note">雲の形状生成・煙スプライト・独自ビルボードはこの版では使用しません。GeoFS本体の雲シェーダーと標準テクスチャ資産をそのまま使い、Modから雲のON/OFF・雲量・雲底・雲頂を上書きしません。雲の品質や表示切替はGeoFSの Options → Graphics 側で設定してください。</div>
            <div class="am-group-title">保持する描画処理</div>
            <div class="am-grid"><div class="am-card"><b>大気散乱</b>Rayleigh / Mie散乱、エアロゾルの波長依存、後方散乱、境界層霞</div><div class="am-card"><b>雲描画</b>GeoFS標準シェーダー・標準テクスチャを変更せず維持</div><div class="am-card"><b>光学・夕焼け</b>季節別エアロゾル補正、太陽高度・水蒸気・水面反射色</div><div class="am-card"><b>気象現象</b>気象指標に応じた雷放電路と竜巻の渦構造</div></div>
          </section>
          <section class="am-page" data-page="weather" hidden>
            <div class="am-group-title">数値予報プロファイル / Numerical weather model</div>
            <div class="am-check"><span>NWP · 航空機位置の鉛直気象プロファイルを利用</span><input type="checkbox" data-bool="NWP"></div>
            <div class="am-actions" style="padding:0;border:0"><button data-nwp-refresh>予報データを今すぐ更新</button></div>
            <div class="am-note">データ状態：<span data-nwp-status>未取得</span><br>Open-Meteoの数値予報を使用します。送信する位置はGeoFS内の航空機座標で、端末のGPS位置は使用しません。無料APIの非商用条件・帰属表示に従ってください。<br><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo · CC BY 4.0</a></div>
            <div class="am-group-title">物理診断エンジン / Reduced-order weather physics</div>
            <div class="am-check"><span>WX · 熱力学・対流・降水相の物理診断</span><input type="checkbox" data-bool="WX"></div>
            ${renderControls(CONTROL_GROUPS[2])}
            <div class="am-group-title">気象現象エフェクト / Severe weather effects</div>
            <label class="am-check"><span>雷 · 放電路と画面フラッシュ</span><input type="checkbox" data-bool="WX_LIGHTNING"></label>
            <label class="am-check"><span>竜巻 · 渦状ファンネルと地表ダスト</span><input type="checkbox" data-bool="WX_TORNADO"></label>
            <div class="am-actions" style="padding:0;border:0"><button data-lightning-test>雷をテスト発生</button><button data-tornado-test>竜巻をテスト生成</button></div>
            <div class="am-note"><span data-weather-effects-status>気象イベント待機中</span><br>自動発生はCAPE・鉛直風シア・混合相層・雷ポテンシャル等の推定指標に連動します。竜巻は予報・警報データではなく、視覚イベントの発生判定用近似です。</div>
            <div class="am-grid">
              <div class="am-card"><b>CAPE</b><span data-metric="cape">—</span></div>
              <div class="am-card"><b>CIN</b><span data-metric="cin">—</span></div>
              <div class="am-card"><b>LCL / LFC / EL</b><span data-metric="lcl">—</span> / <span data-metric="lfc">—</span> / <span data-metric="el">—</span></div>
              <div class="am-card"><b>Freezing level</b><span data-metric="freeze">—</span></div>
              <div class="am-card"><b>Wet-bulb / RH</b><span data-metric="wetbulb">—</span> / <span data-metric="rh">—</span></div>
              <div class="am-card"><b>0–top wind shear</b><span data-metric="shear">—</span></div>
              <div class="am-card"><b>Precipitation phase</b><span data-metric="phase">—</span></div>
              <div class="am-card"><b>Mixing ratio / VPD</b><span data-metric="mixratio">—</span> / <span data-metric="vpd">—</span></div>
              <div class="am-card"><b>Updraft (model / parcel)</b><span data-metric="updraft">—</span></div>
              <div class="am-card"><b>Lightning potential index</b><span data-metric="lpi">—</span></div>
              <div class="am-card"><b>Precipitable water</b><span data-metric="water">—</span></div>
              <div class="am-card"><b>Shortwave radiation</b><span data-metric="radiation">—</span></div>
              <div class="am-card"><b>Turbulence index (proxy)</b><span data-metric="turbulence">—</span></div>
              <div class="am-card"><b>Downdraft potential (proxy)</b><span data-metric="downdraft">—</span></div>
              <div class="am-card"><b>Warm-rain growth proxy</b><span data-metric="warmrain">—</span></div>
              <div class="am-card"><b>Bergeron ice-growth proxy</b><span data-metric="bergeron">—</span></div>
              <div class="am-card"><b>Riming / graupel proxy</b><span data-metric="riming">—</span></div>
              <div class="am-card"><b>Hail-favourability proxy</b><span data-metric="hail">—</span></div>
              <div class="am-card"><b>Evaporative-cooling proxy</b><span data-metric="evaporative">—</span></div>
            </div>
            <div class="am-note">NWP有効時は航空機位置周辺の数値予報から12気圧面の気温・露点・相対湿度・風・鉛直速度・雲量・ジオポテンシャル高度を取得します。気圧面を100m間隔へ補間して湿潤断熱パーセルを追跡し、CAPE/CIN/LCL/LFC/EL、鉛直シア、凍結高度、上昇流、混合相層、降水相を診断します。モデルCAPE/CIN・上昇流・雷ポテンシャルも取れる場合は照合します。<br><br><b>重要：</b>GeoFS単体は完全な鉛直プロファイルを公開しません。NWP有効時はOpen-Meteoの気圧面データを補間してCAPE/CIN等を診断し、モデル提供値とも照合します。通信失敗時はGeoFS集約値と合成環境プロファイルへ戻ります。雲の暖雨成長・Bergeron氷晶成長・着氷（riming）・雹・下降流は気温・湿度・氷水混相層から求める可能性指標であり、粒子ごとの質量・粒径・落下運動を積分した微物理計算ではありません。実況観測や予報の代替ではありません。</div>
            <div class="am-note">降水相は湿球温度で雨／雪を選択します。GeoFS標準の降水エフェクトが雨・雪以外の粒子（霰・雹・凍雨）を提供しないため、これらを本物の粒子として再現したとは扱いません。</div>
          </section>
          <section class="am-page" data-page="support" hidden>
            <div class="am-group-title">GeoFSで実装する項目</div>
            <div class="am-grid"><div class="am-card"><b>独立スイッチ</b>T0 / C0：大気モデルと雲照明モデルを個別に切り替え</div><div class="am-card"><b>大気・霞（近似）</b>T1–T7, T9–T12：境界層、自由対流圏、粒子色、後方散乱、遠景の雲霞</div><div class="am-card"><b>天候連動（近似）</b>T13, T16：GeoFSの集約visibility / humidity / fog / precipitationを使う推定。METAR観測所補間ではありません</div><div class="am-card"><b>雲照明（近似）</b>C1–C7：前方散乱、多重散乱、雲内部光、Powder効果</div><div class="am-card"><b>雲描画</b>GeoFS標準シェーダーと標準テクスチャを維持。Mod側で雲形状を置換しません</div><div class="am-card"><b>雲の光学</b>C1–C11 / IR / IF：水滴Mie前方散乱、内部多重散乱、Powder、彩雲回折、氷晶22度ハローを近似</div><div class="am-card"><b>色補正（近似）</b>T8, C22：GeoFS色補正API。MSFSの物理的なスペクトル補正と同等ではありません</div><div class="am-card"><b>熱力学診断（推定）</b>Magnus/Buck飽和水蒸気圧、湿球温度、LCL、乾燥・湿潤断熱、仮温度、CAPE/CIN、LFC/EL、凍結高度</div><div class="am-card"><b>力学診断（簡易）</b>GeoFS風層から鉛直シア、近傍地形勾配と風向から地形性上昇を推定</div><div class="am-card"><b>降水相</b>湿球温度で雨／雪を切り替え。雹・霰・凍雨の独立粒子系は未対応</div><div class="am-card"><b>雷光</b>雷ポテンシャル・対流・混合相を用いた放電路と閃光の視覚近似</div><div class="am-card"><b>竜巻</b>CAPE・鉛直シア・LCLから発生機会を推定する渦状ファンネル演出。実際の竜巻予報ではありません</div><div class="am-card"><b>復元</b>ModをOFFにすると元のGeoFS GLSL文字列と大気APIへ戻します</div></div>
            <div class="am-group-title">MSFS専用で未移植</div><div class="am-note">${UNSUPPORTED.join(", ")}<br><br>DXIL/ReShadeのシェーダーパッチ、MSFSのEFB/SimConnect連携、8観測所のMETAR補間、METAR雲アンカー、機体影マップ、雲内視程、実気象に基づくCB/TCU発生予測、雷雨の気象場・降水粒子・電荷分離はGeoFSの同じAPI・描画データを持たないため、物理的な気象再現としては未実装です。積乱雲形状はプロシージャル近似です。</div>
            <div class="am-actions" style="padding:0;border:0"><button data-export>JSONを書き出す</button><button data-import>JSONを読み込む</button></div><input type="file" accept="application/json,.json" data-file hidden>
            <div class="am-note">GeoFS 4.0 Beta / Cesium 1.136向け。UIはOptions内の「AtmosphereMod · Atmosphere & Clouds」に登録します。雲はGeoFS標準描画を維持し、このModでは置換しません。</div>
          </section>
        </div>
        <div class="am-actions"><button data-reset>初期値</button><button data-reapply>再適用</button><button class="primary" data-save>設定保存</button></div>
      </section>`;
    const menuItem = document.createElement("li");
    menuItem.id = MENU_ITEM_ID;
    menuItem.className = "geofs-list-collapsible-item";
    menuItem.appendChild(document.createTextNode("AtmosphereMod · Atmosphere & Clouds"));
    const collapsible = document.createElement("div");
    collapsible.className = "geofs-collapsible";
    collapsible.appendChild(root);
    menuItem.appendChild(collapsible);
    const graphicsItem = Array.from(preferenceList.children).find(node =>
      node.matches?.("li.geofs-list-collapsible-item") && /^Graphics\b/.test((node.firstChild?.textContent || node.textContent || "").trim())
    );
    if (graphicsItem) graphicsItem.insertAdjacentElement("afterend", menuItem);
    else preferenceList.appendChild(menuItem);
    state.root = root;
    state.menuItem = menuItem;

    root.querySelector("[data-close]").addEventListener("click", () => menuItem.classList.remove("geofs-list-item-expanded"));
    root.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
      root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b === button));
      root.querySelectorAll("[data-page]").forEach(page => page.hidden = page.dataset.page !== button.dataset.tab);
    }));
    root.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
    root.querySelectorAll("[data-cloud-preset]").forEach(button => button.addEventListener("click", () => {
      Object.assign(S, CLOUD_PRESETS[button.dataset.cloudPreset] || CLOUD_PRESETS.mixed);
      S.CG = 1;
      syncUI(); scheduleRebuild(); saveSettings();
    }));
    root.querySelector("[data-master]").addEventListener("change", e => {
      state.masterEnabled = e.target.checked;
      if (!state.masterEnabled) clearWeatherEffects();
      syncUI(); scheduleRebuild();
    });
    root.querySelector("[data-T0]").addEventListener("change", e => { S.T0 = e.target.checked ? 1 : 0; syncUI(); scheduleRebuild(); });
    root.querySelectorAll("[data-bool]").forEach(input => input.addEventListener("change", () => {
      const key = input.dataset.bool;
      S[key] = input.checked ? 1 : 0;
      state.physics = computeWeatherPhysics();
      syncUI(); scheduleRebuild(); saveSettings();
      if (key === "NWP" && S.NWP) fetchNwpProfile(true);
    }));
    root.querySelectorAll("[data-setting]").forEach(input => {
      const commit = () => {
        const key = input.dataset.setting;
        S[key] = clamp(input.value, LIMITS[key][0], LIMITS[key][1]);
        const out = root.querySelector(`[data-value="${key}"]`);
        if (out) out.textContent = fmtControl(key, S[key]);
        scheduleRebuild();
      };
      input.addEventListener("input", commit);
      input.addEventListener("change", commit);
    });
    root.querySelector("[data-reset]").addEventListener("click", () => {
      Object.assign(S, DEFAULTS); state.masterEnabled = true; state.physics = computeWeatherPhysics(); syncUI(); scheduleRebuild(); saveSettings();
      if (S.NWP) fetchNwpProfile(true);
    });
    root.querySelector("[data-reapply]").addEventListener("click", () => {
      if (!state.compatible) return updateStatus("GeoFS描画環境が利用できません");
      scheduleRebuild(); updateStatus("大気・光学を再構築しています");
    });
    root.querySelector("[data-save]").addEventListener("click", () => { saveSettings(); updateStatus("設定をこのブラウザーに保存しました"); });
    root.querySelector("[data-nwp-refresh]").addEventListener("click", () => fetchNwpProfile(true));
    root.querySelector("[data-lightning-test]")?.addEventListener("click", () => { if (!triggerLightning(true)) updateStatus("雷エフェクトを生成できません · GeoFSのカメラ初期化を確認してください"); else updateStatus("雷エフェクトをテスト発生しました"); });
    root.querySelector("[data-tornado-test]")?.addEventListener("click", () => { if (!spawnTornado(true)) updateStatus("竜巻エフェクトを生成できません · GeoFSのカメラ初期化を確認してください"); else updateStatus("竜巻エフェクトをテスト生成しました"); });
    root.querySelector("[data-export]").addEventListener("click", exportProfile);
    root.querySelector("[data-import]").addEventListener("click", () => root.querySelector("[data-file]").click());
    root.querySelector("[data-file]").addEventListener("change", e => importProfile(e.target.files?.[0]));

    state.keyHandler = event => {
      if (!event.ctrlKey || !event.shiftKey || !["F9", "F10"].includes(event.code)) return;
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      event.preventDefault();
      if (event.code === "F9") {
        state.masterEnabled = !state.masterEnabled;
        if (!state.masterEnabled) clearWeatherEffects();
      } else scheduleRebuild();
      syncUI(); scheduleRebuild();
    };
    window.addEventListener("keydown", state.keyHandler);
    syncUI(); refreshMetrics();
  }

  function install() {
    const G = window.geofs, C = window.Cesium, sh = window.geofsShaders;
    if (!G || !C || !G.api?.viewer || !G.fx?.atmosphere || !document.querySelector(".geofs-preference-list") ||
        !C.Cartesian2 || !C.Cartesian3 || !C.Color || !C.PostProcessStage ||
        typeof C.PolylineCollection !== "function" || typeof C.PointPrimitiveCollection !== "function") return false;
    if (Number.parseFloat(G.version) < 4) {
      console.error("[AtmosphereMod GeoFS] GeoFS 4.0 or later is required; current version:", G.version);
      return false;
    }
    const a = G.fx.atmosphere;
    if (typeof a.create !== "function" || typeof a.destroy !== "function") return false;

    state.geofs = G; state.Cesium = C; state.atmosphere = a; state.shaders = sh || {};
    state.physics = computeWeatherPhysics();
    state.original = {
      common: sh?.["atmosphereCommon.glsl"],
      clouds: sh?.["volumetricCloudsFS.glsl"],
      create: a.create, destroy: a.destroy, methods: { update: a.update, setConditions: a.setConditions },
      renderPrefs: {
        advancedAtmosphere: G.api.renderingSettings?.advancedAtmosphere,
        volumetricClouds: G.api.renderingSettings?.volumetricClouds
      }
    };

    installSeasonalLightingHooks();

    // The native cloud shader is retained unchanged; only atmosphereCommon.glsl is patched.
    state.compatible = true;
    createUI();
    a.create = function (...args) {
      applyShaders();
      setCloudRuntimeFlags(false);
      const result = state.original.create.apply(this, createArgs());
      applyCloudWeatherOverride();
      return result;
    };
    if (typeof state.original.methods.update === "function") {
      a.update = function (...args) {
        const result = state.original.methods.update.apply(this, args);
        applyCloudWeatherOverride();
        return result;
      };
    }
    if (typeof state.original.methods.setConditions === "function") {
      a.setConditions = function (...args) {
        const result = state.original.methods.setConditions.apply(this, args);
        applyCloudWeatherOverride();
        return result;
      };
    }

    patchWeatherSet();
    updateLensGhostStage();
    rebuildAtmosphere();
    updateColorModifiers();
    state.lastWeatherSignature = weatherSignature();
    state.physics = computeWeatherPhysics();
    state.lastPhysicsSignature = physicsSignature(state.physics);
    updateWeatherEffects(state.physics);
    state.timer = setInterval(() => {
      if (state.destroyed) return;
      updateColorModifiers();
      try { const model = sunsetOpticalState(); applySeasonalSunlight(model); applySeasonalWaterReflection(model); } catch (error) { console.warn("[AtmosphereMod GeoFS] Seasonal reflection tick skipped", error); }
      refreshMetrics();
      const next = weatherSignature();
      const physical = computeWeatherPhysics();
      const nextPhysics = physicsSignature(physical);
      const changed = next !== state.lastWeatherSignature || (S.WX && nextPhysics !== state.lastPhysicsSignature);
      state.physics = physical;
      updateWeatherEffects(physical);
      if ((S.T13 || S.WX) && changed) {
        state.lastWeatherSignature = next;
        state.lastPhysicsSignature = nextPhysics;
        scheduleRebuild();
      }
      updateStatus();
    }, 5000);
    state.weatherHandler = () => { state.lastWeatherSignature = weatherSignature(); scheduleRebuild(); };
    window.addEventListener("geofsWeatherChange", state.weatherHandler);
    console.info(`[AtmosphereMod GeoFS] ${VERSION} loaded; native GeoFS clouds preserved; atmosphere scattering, lens optics, lightning and tornado effects initialized.`);
    return true;
  }

  function destroy(options = {}) {
    if (state.destroyed) return;
    state.destroyed = true;
    clearInterval(state.timer); clearInterval(state.waitTimer); clearInterval(state.nwpTimer); clearTimeout(state.rebuildTimer);
    if (state.keyHandler) window.removeEventListener("keydown", state.keyHandler);
    if (state.weatherHandler) window.removeEventListener("geofsWeatherChange", state.weatherHandler);
    restoreWeatherSet();
    restoreSeasonalLightingHooks();
    removeLensGhostStage();
    clearWeatherEffects();
    if (state.atmosphere && state.original) {
      try {
        const a = state.atmosphere;
        const args = [
          typeof state.original.renderPrefs.advancedAtmosphere === "boolean" ? state.original.renderPrefs.advancedAtmosphere : !!a.advancedAtmosphere,
          finite(state.geofs?.api?.renderingSettings?.scatteringQuality, finite(a.quality, 4)),
          typeof state.original.renderPrefs.volumetricClouds === "boolean" ? state.original.renderPrefs.volumetricClouds : !!a.volumetricClouds,
          !!a.realTimeClouds, !!a.retro
        ];
        restoreShaders();
        setCloudRuntimeFlags(false);
        if (a.postProcessingStages && state.original.destroy) state.original.destroy.call(a);
        a.create = state.original.create;
        if (state.original.methods.update) a.update = state.original.methods.update;
        if (state.original.methods.setConditions) a.setConditions = state.original.methods.setConditions;
        state.original.create.apply(a, args);
        const loc = state.geofs?.camera?.lla || state.geofs?.aircraft?.instance?.llaLocation;
        if (loc && a.update) a.update(loc, true);
        state.geofs?.api?.removeAtmosphereColorModifier?.(MODIFIER_ID);
      } catch (error) { console.error("[AtmosphereMod GeoFS] Cleanup error", error); }
    }
    state.menuItem?.remove();
    state.root?.remove();
    try { delete window[GLOBAL_KEY]; } catch (_) { window[GLOBAL_KEY] = undefined; }
    if (!options.silent) console.info("[AtmosphereMod GeoFS] Removed; original GeoFS shader sources restored.");
  }

  // Private deterministic shader-fixture mode used by the included verifier.
  // It is inert in GeoFS unless this explicit test flag and source fixture exist.
  if (window.__ATMOSPHEREMOD_GEOFS_TEST_MODE__ === true && window.__ATMOSPHEREMOD_GEOFS_TEST_FIXTURE__) {
    state.original = {
      common: window.__ATMOSPHEREMOD_GEOFS_TEST_FIXTURE__.common,
      clouds: window.__ATMOSPHEREMOD_GEOFS_TEST_FIXTURE__.clouds,
      renderPrefs: null
    };
    const testRuntime = window.__ATMOSPHEREMOD_GEOFS_TEST_RUNTIME__;
    if (testRuntime) {
      state.atmosphere = testRuntime.atmosphere;
      state.geofs = { api: { renderingSettings: testRuntime.renderingSettings } };
      state.original.renderPrefs = testRuntime.renderPrefs;
      window.weather = testRuntime.weather;
    }
    state.physics = computeWeatherPhysics();
    if (window.__ATMOSPHEREMOD_GEOFS_TEST_API__) {
      state.geofs = { api: { ...(state.geofs?.api || {}), ...window.__ATMOSPHEREMOD_GEOFS_TEST_API__ } };
      updateColorModifiers();
    }
    window.__ATMOSPHEREMOD_GEOFS_TEST_RESULT__ = {
      common: state.original.common,
      clouds: state.original.clouds,
      settings: { ...S },
      masterEnabled: state.masterEnabled,
      testWeatherPhysics(definition) { return computeWeatherPhysics(definition || {}); },
      testParseNwp(data, lat = 35.0, lon = 135.0, ground = 0) {
        const profile = parseNwpResponse(data, lat, lon, ground);
        state.nwpProfile = profile; S.NWP = 1; state.physics = computeWeatherPhysics();
        return profile;
      },
      testNwpPhysics() { return computeWeatherPhysics(); },
      testSeasonalClimate(localSeason) { return seasonalClimateProfile(localSeason); },
      testSunsetEnvelope(elevationDeg) {
        const season = seasonalClimateProfile(finite(window.weather?.localSeason, 37.5));
        const band = smoothstepSafe(-10, -2, elevationDeg) * (1 - smoothstepSafe(1, 18, elevationDeg));
        return { elevationDeg, season, horizonBand: band };
      },
      testSeasonalLightingHooks(manager, globe, CesiumStub, geofsStub, localSeason = 50, localTime = 18) {
        state.Cesium = CesiumStub; state.geofs = geofsStub; state.masterEnabled = true;
        window.weather = { localSeason, localTime, timeRatio: 0.5, belowCloudsBrightness: 1, definition: { visibility: 18000, cloudCover: 35, airTemperatureSL: 24, dewPointSL: 17, precipitationAmount: 0, fogDensity: 0 } };
        state.nativeLighting = { manager: null, globe: null, originalDayNightUpdate: null, originalGlobeSetColours: null, dayNightWrapper: null, globeWrapper: null, baseSunColor: null, baseSunSource: null, lastSunOutput: null, baseWaterColors: null, lastSunSignature: "", lastWaterSignature: "" };
        geofsStub.fx.dayNightManager = manager; geofsStub.fx.globe = globe;
        installSeasonalLightingHooks(); manager.update();
        globe.setColours(new CesiumStub.Color(0.42, 0.56, 0.68, 1), new CesiumStub.Color(0.20, 0.30, 0.43, 1));
        const result = {
          sunTinted: !!manager.sunColor && manager.sunColor.blue < 0.99,
          sunRGB: manager.sunColor ? [manager.sunColor.red, manager.sunColor.green, manager.sunColor.blue] : null,
          sceneLightCalls: geofsStub.api.sceneLightCalls || 0,
          waterTinted: !!globe.lastHorizon && globe.lastHorizon.red > 0.42,
          waterHorizonRGB: globe.lastHorizon ? [globe.lastHorizon.red, globe.lastHorizon.green, globe.lastHorizon.blue] : null,
          season: seasonalClimateProfile(localSeason).name
        };
        restoreSeasonalLightingHooks(); return result;
      },
      testBuildCloudShader() { return state.original.clouds; },
      testBuildCommonShader() { state.masterEnabled = true; return buildAtmosphereShader(true); },
      testShaderPair() { state.masterEnabled = true; return { common: buildAtmosphereShader(true), clouds: state.original.clouds }; },
      testVisualEffects(CesiumStub, geofsStub) {
        state.Cesium = CesiumStub; state.geofs = geofsStub; state.masterEnabled = true; state.compatible = true;
        state.physics = { cape: 2400, lclM: 600, shearMsPerKm: 22, lightningPotential: 0.9, thunderObs: 1, convectiveIndex: 0.9 };
        const lightning = triggerLightning(true); const tornado = spawnTornado(true);
        return { lightning, tornado, primitiveCount: geofsStub.api.viewer.scene.primitives.items.length,
          lightningCount: state.weatherFx.lightningCollections.length, tornadoLines: !!state.weatherFx.tornadoLines,
          tornadoPoints: !!state.weatherFx.tornadoPoints };
      },
      testCloudRuntime(patch = {}) {
        Object.assign(S, patch);
        setCloudRuntimeFlags(shouldForceClouds());
        applyCloudWeatherOverride();
        const a = state.atmosphere;
        return {
          settings: { ...S },
          renderingSettings: { ...state.geofs?.api?.renderingSettings },
          atmosphereUniforms: { ...(a?.atmospherePostProcessStage?.uniforms || {}) },
          cloudUniforms: { ...(a?.cloudsPostProcessStage?.uniforms || {}) },
          createArgs: createArgs()
        };
      }
    };
    return;
  }

  state.apply = patch => {
    if (!patch || typeof patch !== "object") return;
    for (const [key, range] of Object.entries(LIMITS)) if (key in patch) S[key] = clamp(patch[key], range[0], range[1]);
    S.CM = Math.round(clamp(S.CM, 0, 10));
    S.CQ = Math.round(clamp(S.CQ, 1, 3));
    for (const key of ["T8", "T13", "C22", "T0", "C0", "CG", "WX", "NWP", "LG", "WX_LIGHTNING", "WX_TORNADO"]) if (key in patch) S[key] = patch[key] ? 1 : 0;
    if ("masterEnabled" in patch) {
      state.masterEnabled = !!patch.masterEnabled;
      if (!state.masterEnabled) clearWeatherEffects();
    }
    syncUI(); scheduleRebuild();
    if (S.NWP) fetchNwpProfile(true);
  };
  state.getSettings = () => ({ ...S, masterEnabled: state.masterEnabled });
  state.getCapabilities = () => ({
    geoFSVersion: state.geofs?.version,
    implemented: ["T0 atmospheric scattering shader", "layered aerosol / Mie wavelength tint", "lens ghost projection", "GeoFS native cloud renderer passthrough", "lightning polylines and screen flash", "tornado spiral funnel and debris field"],
    approximated: [...APPROXIMATED, "seasonal sunset spectrum from GeoFS solar position and seasonal climatology", "native water/ground reflected tint through GeoFS scene light and water reflection uniforms", "lightning strike interval from convective and mixed-phase indices", "tornado event trigger from CAPE / shear / LCL proxies"],
    unsupported: [...UNSUPPORTED, "electrical charge separation and full lightning physics", "tornado pressure field / mass-conserving wind field / debris dynamics"],
    weatherPhysics: ["Open-Meteo 12-level pressure-profile diagnostics", "CAPE/CIN/LFC/EL estimate", "wind shear and orographic-lift diagnostics", "rain/snow phase selection", "mixed-phase and lightning-potential estimates", "automatic lightning flash/branch events", "rare tornado visual events"],
    limitations: ["GeoFS standard cloud renderer is untouched; no custom cloud sprites or replacement cloud textures are generated", "weather physics uses available GeoFS summaries or interpolated NWP pressure levels, not a local radiosonde", "lightning and tornado geometry are visual approximations driven by meteorological proxy indices, not a charge-transport or CFD solver", "lens ghosts use generic optical shapes rather than measured lens prescription data", "seasonal climatology is a small bias layered on top of live GeoFS/NWP humidity, visibility and precipitable-water inputs", "native water reflection uses GeoFS Water FX sky-color uniforms; SSR is not forced on", "atmospheric scattering uses a reduced-order visible-band Rayleigh/Mie and aerosol model"],
    renderingArchitecture: "native GeoFS cloud pipeline preserved; atmosphereCommon shader receives only validated aerosol/scattering edits; seasonal sunlight modifies GeoFS scene-light/cloud illumination and native water horizon/azimuth reflection; independent Cesium lightning and tornado geometry",
    compatible: state.compatible
  });
  state.destroy = destroy;
  window[GLOBAL_KEY] = state;

  // Wait for the globe/runtime to finish initializing; no hard-coded delay.
  let attempts = 0;
  state.waitTimer = setInterval(() => {
    if (state.destroyed) return clearInterval(state.waitTimer);
    attempts++;
    try {
      if (install()) {
        clearInterval(state.waitTimer);
        state.waitTimer = 0;
      }
    } catch (error) {
      console.error("[AtmosphereMod GeoFS] Initialization failed", error);
      clearInterval(state.waitTimer);
      delete window[GLOBAL_KEY];
    }
    if (attempts > 300) {
      clearInterval(state.waitTimer);
      console.error("[AtmosphereMod GeoFS] GeoFS 4.0 runtime was not ready after 90 seconds.");
      updateStatus("GeoFSの初期化を検出できません。ワールド読み込み後にJSを再実行してください");
    }
  }, 300);
})();
