/*
 * AtmosphereMod GeoFS 4.0 port 1.6.1
 * Reimplementation of portable AtmosphereMod 0.8.0 concepts for the
 * GeoFS 4.0 / Cesium 1.136 atmosphere + volumetric-cloud shader pipeline.
 *
 * Important: MSFS ReShade/DXIL binaries, SimConnect/Coherent EFB interfaces,
 * MSFS weather-volume generation and MSFS shadow-map data are not compatible
 * with GeoFS. This port patches GeoFS GLSL source strings only.
 */
(() => {
  "use strict";

  const VERSION = "1.6.1-gf4-connected-billows-spectral-twilight-lensghost";
  const GLOBAL_KEY = "__ATMOSPHEREMOD_GEOFS_160__";
  const STORAGE_KEY = "atmospheremod.geofs.160.settings";
  const UI_ID = "amgfs160-root";
  const MODIFIER_ID = "atmospheremod-geofs-160";
  const MASTER_KEY = "atmospheremod.geofs.160.enabled";
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
    C22: 1, LG: 1, LGI: 0.42,
    CG: 0, CC: 0.62, CB: 250, CT: 14500,
    CM: 0, IR: 0.78, IF: 0.68,
    WX: 1, NWP: 1, WLR: 6.5, WENT: 0.12
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
    CC: [0, 1], CB: [0, 10000], CT: [500, 16000], CM: [0, 5], IR: [0, 1], IF: [0, 1],
    WLR: [4.0, 9.5], WENT: [0, 0.5]
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

  const CLOUD_MODES = ["混合雲", "積雲", "積乱雲", "層積雲", "高積雲", "巻雲"];
  const CLOUD_PRESETS = {
    mixed: { CM: 0, CC: 0.62, CB: 250, CT: 14500, IR: 0.78, IF: 0.68, C10: 10, C11: 0.08, C30: 0.028, C31: 105 },
    cumulus: { CM: 1, CC: 0.48, CB: 700, CT: 7800, IR: 0.35, IF: 0.30, C10: 10, C11: 0.08, C30: 0.030, C31: 90 },
    storm: { CM: 2, CC: 0.86, CB: 250, CT: 15800, IR: 0.15, IF: 0.85, C10: 13, C11: 0.10, C16: 1.35, C3: 0.46, C6: 0.48, C30: 0.028, C31: 95 },
    stratocumulus: { CM: 3, CC: 0.72, CB: 250, CT: 6200, IR: 0.25, IF: 0.18, C10: 11, C11: 0.09, C30: 0.020, C31: 160 },
    altocumulus: { CM: 4, CC: 0.58, CB: 1800, CT: 10500, IR: 0.58, IF: 0.42, C10: 9, C11: 0.08, C30: 0.023, C31: 120 },
    cirrus: { CM: 5, CC: 0.55, CB: 6200, CT: 16000, IR: 0.42, IF: 0.95, C10: 6, C11: 0.06, C30: 0.015, C31: 220 }
  };

  const IMPLEMENTED = ["T0", "C0"];
  const APPROXIMATED = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T16",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
    "C16", "C17", "C18", "C19", "C22", "C28", "C29", "C30", "C31", "CM", "IR", "IF", "LG", "LGI"
  ];
  const UNSUPPORTED = [
    "T14", "T15", "C12", "C20", "C21",
    "C23", "C24", "C25", "C26", "C27", "C32", "C33", "C34", "C36", "C37"
  ];

  let old = window[GLOBAL_KEY];
  if (old && typeof old.destroy === "function") {
    try { old.destroy({ silent: true }); } catch (e) { console.warn(e); }
  }
  for (const legacyKey of ["__ATMOSPHEREMOD_GEOFS_152__", "__ATMOSPHEREMOD_GEOFS_150__", "__ATMOSPHEREMOD_GEOFS_140__", "__ATMOSPHEREMOD_GEOFS_130__", "__ATMOSPHEREMOD_GEOFS_120__", "__ATMOSPHEREMOD_GEOFS_110__", "__ATMOSPHEREMOD_GEOFS_100__", "__ATMOSPHEREMOD_GEOFS_093__", "__ATMOSPHEREMOD_GEOFS_092__", "__ATMOSPHEREMOD_GEOFS_091__", "__ATMOSPHEREMOD_GEOFS_090__", "__ATMOSPHEREMOD_GEOFS_081__", "__ATMOSPHEREMOD_GEOFS_080__"]) {
    try { if (window[legacyKey]?.destroy) window[legacyKey].destroy({ silent: true }); } catch (_) {}
  }
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
    for (const k of ["T0", "C0", "T8", "T13", "C22", "CG", "WX", "NWP", "LG"]) value[k] = value[k] ? 1 : 0;
    value.CM = Math.round(clamp(value.CM, 0, 5));
    return value;
  }

  function loadMasterEnabled() {
    const current = localStorage.getItem(MASTER_KEY);
    const v150 = localStorage.getItem("atmospheremod.geofs.150.enabled");
    const v140 = localStorage.getItem("atmospheremod.geofs.140.enabled");
    const v130 = localStorage.getItem("atmospheremod.geofs.130.enabled");
    const v120 = localStorage.getItem("atmospheremod.geofs.120.enabled");
    const v110 = localStorage.getItem("atmospheremod.geofs.110.enabled");
    const v093 = localStorage.getItem("atmospheremod.geofs.093.enabled");
    const previous = localStorage.getItem("atmospheremod.geofs.091.enabled");
    const legacy = localStorage.getItem("atmospheremod.geofs.090.enabled");
    return (current === null ? (v150 !== null ? v150 : (v140 !== null ? v140 : (v130 !== null ? v130 : (v120 !== null ? v120 : (v110 !== null ? v110 : (v093 !== null ? v093 : (previous === null ? legacy : previous))))))) : current) !== "false";
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
    root: null, compatible: false, applied: false, destroyed: false, lastPhysicsSignature: "", lastNativeWeatherDefinition: null,
    lensGhostStage: null, lensGhostScene: null, lensGhostFrameCache: null, lensGhostFrameCacheNumber: -1,
    timer: 0, waitTimer: 0, rebuildTimer: 0, lastWeatherSignature: "",
    lastColorSignature: "", lastStatus: "", keyHandler: null, weatherHandler: null,
    nwpProfile: null, nwpStatus: "未取得", nwpLastFetch: 0, nwpLastCoords: null, nwpInFlight: false, nwpTimer: 0
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
    if (count !== 1) throw new Error(`GeoFS 4.0 shader hook mismatch: ${label} (${count} matches)`);
    return source.replace(needle, replacement);
  }

  function mieRGB() {
    const alpha = S.T10;
    const r = Math.pow(680 / 550, -alpha);
    const g = 1;
    const b = Math.pow(440 / 550, -alpha);
    return [r, g, b];
  }

  // Reduced-order visible-band optical depth. Humidity increases hygroscopic
  // aerosol growth; precipitable water only weakly increases the diffuse veil,
  // because water vapour is not a strong broadband absorber in visible RGB.
  function atmosphericOptics() {
    const met = weatherMetrics();
    const surface = activeNwpProfile()?.surface;
    const pw = clamp(finite(surface?.precipitableWaterMm, 18 + met.humidity * 16), 2, 75);
    const rh = clamp(met.humidity, 0, 1);
    const visibilityKm = clamp(met.visibility / 1000, 0.5, 100);
    const hygroscopicGrowth = 1.0 + 0.62 * Math.pow(rh, 3.2);
    const columnMoisture = 1.0 + 0.045 * clamp((pw - 10) / 45, 0, 1);
    const aerosolTau550 = clamp((1.2 * 3.912 / visibilityKm) * hygroscopicGrowth * columnMoisture, 0.015, 0.82);
    const rayleigh = wavelengthUm => {
      const inv2 = 1 / (wavelengthUm * wavelengthUm);
      return 0.008569 * inv2 * inv2 * (1 + 0.0113 * inv2 + 0.00013 * inv2 * inv2);
    };
    const mie = wavelengthUm => aerosolTau550 * Math.pow(wavelengthUm / 0.55, -clamp(S.T10, 0, 2.5));
    return {
      tauRayR: rayleigh(0.650), tauRayG: rayleigh(0.550), tauRayB: rayleigh(0.450),
      tauMieR: mie(0.650), tauMieG: mie(0.550), tauMieB: mie(0.450),
      aerosolTau550, humidity: rh, precipitableWaterMm: pw,
      moistureVeil: clamp(0.58 * aerosolTau550 + 0.25 * (hygroscopicGrowth - 1.0) + 0.06 * (pw / 75), 0, 1),
      hygroscopicGrowth
    };
  }

  function cloudModeWeights() {
    switch (Math.round(S.CM)) {
      case 1: return { sc: 0, cu: 1, storm: 0.18, ac: 0, ci: 0 };
      case 2: return { sc: 0, cu: 0.30, storm: 1, ac: 0, ci: 0.28 };
      case 3: return { sc: 1, cu: 0, storm: 0, ac: 0, ci: 0 };
      case 4: return { sc: 0, cu: 0, storm: 0, ac: 1, ci: 0 };
      case 5: return { sc: 0, cu: 0, storm: 0, ac: 0.12, ci: 1 };
      default: return { sc: 0.78, cu: 1, storm: 0.34, ac: 0.62, ci: 0.42 };
    }
  }

  function replaceCloudDensityFunction(source) {
    const startToken = "float cloudDensity(";
    const endToken = "\n}\n#endif";
    const w = cloudModeWeights();
    const phys = state.physics || computeWeatherPhysics();
    const capeDrive = S.WX
      ? Math.max(smoothstepSafe(100, 1800, phys.cape), S.CM === 2 ? 0.58 : 0)
      : (S.CM === 2 ? 0.62 : 0);
    const shearDrive = S.WX ? clamp(phys.shearMsPerKm / 18, 0, 1) : 0;
    const shearLen = Math.hypot(phys.shearEast || 0, phys.shearNorth || 0) || 1;
    const shearX = (phys.shearEast || 0) / shearLen;
    const shearY = (phys.shearNorth || 0) / shearLen;
    const freezing = S.WX ? phys.freezingLevelM : 5000;
    const precip = S.WX ? phys.precip01 : 0;
    const highFadeTop = S.C18 > 0 ? S.C18 : 6000;
    const fineBillowScaleM = clamp(S.C31 > 0 ? S.C31 : 105, 80, 1500);
    // C31 is the smallest requested cotton feature; the four octaves span larger-to-smaller scales.
    const fineBillowFrequency = 500 / (fineBillowScaleM * 2.5);
    const fineBillowStrength = clamp(S.C30 / 0.026, 0, 1.8);
    const start = source.indexOf(startToken);
    if (start < 0 || source.indexOf(startToken, start + startToken.length) >= 0) {
      throw new Error("GeoFS cloudDensity function hook mismatch");
    }
    const end = source.indexOf(endToken, start);
    if (end < 0) throw new Error("GeoFS cloudDensity end marker mismatch");
    const profile = `
float amCellularDistance(vec3 p) {
  vec3 base = floor(p);
  vec3 f = fract(p);
  vec3 side = step(vec3(0.5), f);
  float nearest2 = 1e5;
  for (int z = 0; z < 2; z++) {
    for (int y = 0; y < 2; y++) {
      for (int x = 0; x < 2; x++) {
        vec3 corner = vec3(float(x), float(y), float(z)) - vec3(1.0) + side;
        vec3 cell = base + corner;
        float h1 = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        float h2 = fract(sin(dot(cell, vec3(269.5, 183.3, 246.1)) + 19.19) * 24634.6345);
        vec3 rnd = vec3(h1, h2, fract(h1 * 1.71 + h2 * 2.37 + 0.153));
        vec3 feature = corner + mix(vec3(0.24), vec3(0.76), rnd) - f;
        nearest2 = min(nearest2, dot(feature, feature));
      }
    }
  }
  return sqrt(nearest2);
}
vec4 amCloudSpeciesWeights;
float amCloudStormWeight;
float cloudDensity(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage) {
  amCloudSpeciesWeights = vec4(0.0);
  amCloudStormWeight = 0.0;
  const mat3 OCT_ROT = mat3( 0.00,  0.80,  0.60,
                            -0.80,  0.36, -0.48,
                            -0.60, -0.48,  0.64);
  float height = length(p) - realPlanetRadius;
  heightRatio = (height - cloudBase) / max(cloudThickness, 1.0);
  float coverage = clamp(finalCoverage, 0.0, 1.0);
  if (coverage <= 0.015 || heightRatio < 0.0 || heightRatio > 1.0) return 0.0;

  // World scale: q=0.002*p, so one q-unit represents 500 m.
  // A low-frequency warp keeps the cloud body coherent; fine octaves only
  // erode and swell its surface, never spawn isolated dots or sprite-like cells.
  vec3 q = p * 0.002 + wind;
  float warpA = noise(q * 0.075 + vec3(13.7, 5.1, 21.3));
  float warpB = noise((OCT_ROT * q) * 0.082 + vec3(2.9, 18.4, 7.6));
  vec3 warpedQ = q + vec3(warpA - 0.5, warpB - 0.5, (warpA - warpB) * 0.35) * 1.35;

  // Main morphology: 8 km mass, 3 km lobes, 1.2 km cauliflower crowns.
  float nMacro = noise(warpedQ * 0.060 + vec3(11.7, 3.1, 6.4));
  float nMeso  = noise(warpedQ * 0.170 + vec3(4.3, 19.1, 2.7));
  // Cellular Voronoi billows replace the previous value-noise-only lobes.
  // The cells overlap inside the broad cloud envelope, producing readable
  // rounded lobes and scalloped boundaries instead of isolated noise dots.
  float nLobe = 1.0 - smoothstep(0.14, 1.04,
      amCellularDistance((OCT_ROT * warpedQ) * 0.44 + vec3(5.1, 12.7, 3.4)));

  // Micro-billows are also cellular, not four broad value-noise blobs.
  // C31 sets the target scale; quality caps are derived from the actual
  // density sample interval so sub-sample detail is not promoted as real.
  vec3 fineQ = OCT_ROT * warpedQ;
  // Keep the finest octave at roughly two density samples per feature.
  // GeoFS QUALITY_7 is the highest-quality tier; QUALITY_0 is the lowest.
  float amFineMaxFrequency = 3.05;
#if defined(QUALITY_0)
  amFineMaxFrequency = 0.55;
#elif defined(QUALITY_1)
  amFineMaxFrequency = 0.62;
#elif defined(QUALITY_2)
  amFineMaxFrequency = 0.83;
#elif defined(QUALITY_3)
  amFineMaxFrequency = 1.14;
#elif defined(QUALITY_4)
  amFineMaxFrequency = 1.72;
#elif defined(QUALITY_5)
  amFineMaxFrequency = 2.90;
#elif defined(QUALITY_6)
  amFineMaxFrequency = 3.55;
#elif defined(QUALITY_7)
  amFineMaxFrequency = 4.10;
#endif
  float amFineFrequency = min(${fmt(fineBillowFrequency, 5)}, amFineMaxFrequency / 2.50);
  float amFineFrequencyB = min(amFineFrequency * 1.35, amFineMaxFrequency);
  float amFineFrequencyC = min(amFineFrequency * 2.50, amFineMaxFrequency);
  float amFineStrength = ${fmt(fineBillowStrength, 5)};
  float nFineA = clamp(0.5 + ((1.0 - smoothstep(0.16, 1.00,
      amCellularDistance(fineQ * amFineFrequency + vec3(7.3, 21.7, 4.2)))) - 0.5) * amFineStrength, 0.0, 1.0);
  float nFineB = nFineA;
  float nFineC = nFineA;
  float nFineD = nFineA;
#if defined(QUALITY_4) || defined(QUALITY_5) || defined(QUALITY_6) || defined(QUALITY_7)
  nFineB = clamp(0.5 + ((1.0 - smoothstep(0.16, 1.00,
      amCellularDistance(fineQ * amFineFrequencyB + vec3(19.3, 6.7, 12.9)))) - 0.5) * amFineStrength, 0.0, 1.0);
#endif
#if defined(QUALITY_5) || defined(QUALITY_6) || defined(QUALITY_7) || (!defined(QUALITY_0) && !defined(QUALITY_1) && !defined(QUALITY_2) && !defined(QUALITY_3) && !defined(QUALITY_4))
  nFineC = clamp(0.5 + ((1.0 - smoothstep(0.16, 1.00,
      amCellularDistance(fineQ * amFineFrequencyC + vec3(3.7, 14.9, 25.1)))) - 0.5) * amFineStrength, 0.0, 1.0);
#endif
nFineD = nFineC;
  float detailLod = smoothstep(0.04, 0.92, lod);
  float cottonFbm = nFineA * 0.50 + nFineB * 0.31 + nFineC * 0.19;
  cottonFbm = mix(nFineA, cottonFbm, detailLod);
  float cottonRidge = pow(max(1.0 - abs(2.0 * cottonFbm - 1.0), 0.0), 1.55);
  float cottonTip = pow(max((cottonFbm - 0.54) * 2.55, 0.0), 1.82);
  float cottonCrest = pow(max((cottonFbm - 0.43) * 1.76, 0.0), 1.64);

  // Keep a narrow but sampleable transition: far LOD widens it to suppress
  // shimmer, while close LOD preserves a clearly readable cauliflower edge.
  float threshold = 1.0 - coverage;
  float feather = mix(0.012, 0.034, 1.0 - coverage) * mix(1.04, 0.58, detailLod);
  float scField = nMacro * 0.62 + nMeso * 0.27 + nLobe * 0.08 + nFineA * 0.03;
  float cuField = nMacro * 0.40 + nMeso * 0.30 + nLobe * 0.22 + nFineA * 0.08;
  float acField = nMeso * 0.50 + nLobe * 0.35 + nFineA * 0.15;
  vec3 cirrusQ = OCT_ROT * warpedQ;
  float ciField = noise(cirrusQ * vec3(0.022, 0.105, 0.046) + vec3(3.7, 17.2, 8.3)) * 0.68
                + noise(cirrusQ * vec3(0.041, 0.190, 0.078) + vec3(15.4, 2.8, 21.1)) * 0.32;
  float scMask = smoothstep(threshold - feather, threshold + feather, scField);
  float cuMask = smoothstep(threshold - feather * 0.66, threshold + feather * 0.66, cuField);
  float acMask = smoothstep(threshold - feather * 0.72, threshold + feather * 0.72, acField);
  float ciMask = smoothstep(threshold - feather * 0.84, threshold + feather * 0.84, ciField);

  float hr = heightRatio;
  float amConvectiveDrive = ${fmt(capeDrive, 5)};
  float amShearDrive = ${fmt(shearDrive, 5)};
  float amShearX = ${fmt(shearX, 5)};
  float amShearY = ${fmt(shearY, 5)};
  float amFreezingHeight = ${fmt(freezing, 2)};
  float amPrecipitation = ${fmt(precip, 5)};
  float amMixedPhase = smoothstep(amFreezingHeight - 3000.0, amFreezingHeight - 1400.0, height)
                     * (1.0 - smoothstep(amFreezingHeight + 250.0, amFreezingHeight + 1500.0, height));

  // Localized cloud towers have naturally uneven, occasionally pointed crowns.
  float topField = nMacro * 0.55 + nMeso * 0.30 + nLobe * 0.15;
  float cuTop = mix(0.43, 0.81, smoothstep(0.27, 0.73, topField));
  cuTop += (nLobe - 0.5) * 0.075 + cottonTip * 0.075 + (nFineA - 0.5) * 0.018;
  cuTop = clamp(cuTop, 0.34, 0.94);
  float stormTop = mix(0.67, 0.96, smoothstep(0.25, 0.72, topField));
  stormTop = clamp(stormTop + cottonTip * 0.04, 0.65, 0.99);

  // Distinct vertical profiles for low, middle, high and deep convective clouds.
  float scProfile = smoothstep(0.006, 0.045, hr) * (1.0 - smoothstep(0.16, 0.285, hr));
  float cuBaseProfile = smoothstep(0.008, 0.054, hr);
  float cuProfile = cuBaseProfile * (1.0 - smoothstep(cuTop - 0.048, cuTop + 0.012, hr));
  float acProfile = smoothstep(0.255, 0.365, hr) * (1.0 - smoothstep(0.62, 0.77, hr));
  float ciProfile = smoothstep(0.58, 0.72, hr) * (1.0 - smoothstep(0.92, 1.0, hr));

  float scTexture = clamp(nMeso * 0.38 + nLobe * 0.28 + nFineA * 0.22 + cottonFbm * 0.12, 0.0, 1.0);
  float cuTexture = clamp(nMeso * 0.22 + nLobe * 0.28 + nFineA * 0.24 + nFineB * 0.16 + cottonRidge * 0.10, 0.0, 1.0);
  float acTexture = clamp(nMeso * 0.37 + nLobe * 0.29 + nFineA * 0.22 + nFineB * 0.12, 0.0, 1.0);
  float ciTexture = noise(cirrusQ * vec3(0.031, 0.155, 0.064) + vec3(9.1, 4.8, 12.7)) * 0.72
                  + noise(cirrusQ * vec3(0.052, 0.270, 0.105) + vec3(20.3, 11.4, 3.5)) * 0.28;

  // Stratocumulus: a broad deck with small-scale connected rolls and soft holes.
  float scBody = scProfile * scMask;
  float scEdge = 1.0 - smoothstep(0.22, 0.86, scBody);
  float scDensity = max(scBody * (0.86 + 0.26 * scTexture)
                  - scEdge * (0.025 + 0.045 * (1.0 - cottonFbm)) - 0.018, 0.0)
                  * ${fmt(w.sc, 4)};

  // Cumulus: flattened bases, cotton-like cauliflower surfaces, fine scallops.
  float cuBody = cuProfile * cuMask;
  float cuFineRelief = (cottonFbm - 0.5) * (0.142 * amFineStrength)
                     + (cottonCrest - 0.22) * (0.062 * amFineStrength)
                     + (nFineB - 0.5) * (0.035 * amFineStrength);
  float cuSurface = clamp(cuBody + cuFineRelief * smoothstep(0.035, 0.55, cuBody), 0.0, 1.0);
  float cuEdge = 1.0 - smoothstep(0.16, 0.90, cuSurface);
  float cuBillow = 0.66 + 0.30 * nLobe + 0.17 * nFineA + 0.14 * cottonRidge + 0.12 * cottonCrest;
  float cuErosion = cuEdge * ((0.040 + 0.076 * (1.0 - nLobe))
                    + (1.0 - nFineA) * 0.030 + (1.0 - nFineB) * 0.022
                    + (1.0 - nFineC) * 0.014 + (1.0 - nFineD) * 0.008);
  float cuDensity = max(cuSurface * cuBillow - cuErosion - 0.012, 0.0)
                  * ${fmt(w.cu, 4)};

  // Altocumulus: smaller coherent patches with a finer scalloped perimeter.
  float acBody = acProfile * acMask;
  float acEdge = 1.0 - smoothstep(0.20, 0.84, acBody);
  float acDensity = max(acBody * (0.80 + 0.42 * acTexture)
                  - acEdge * (0.035 + 0.042 * (1.0 - nFineA)) - 0.020, 0.0)
                  * ${fmt(w.ac, 4)};

  // Cirrus: horizontally stretched filaments, low optical depth and ice weighting.
  float ciBody = ciProfile * ciMask;
  float ciDensity = max(ciBody * (0.38 + 0.78 * ciTexture) - (1.0 - ciTexture) * 0.12 - 0.018, 0.0)
                  * ${fmt(w.ci, 4)} * ${fmt(S.IF, 4)};

  // Cumulonimbus: connected updraft towers with small-scale crown corrugation,
  // horizontal shear and a broad anvil. The high-frequency field only roughens
  // the boundary; it does not create independent cloud balls.
  vec3 stormQ = warpedQ + vec3(amShearX, amShearY, 0.0) * (pow(hr, 3.0) * (1.2 + amShearDrive * 1.8));
  float stormLarge = noise(stormQ * 0.082 + vec3(8.1, 2.7, 18.4));
  float stormMeso = noise(stormQ * 0.235 + vec3(6.2, 13.1, 4.8));
  float stormFineFrequency = max(0.40, amFineFrequencyC * 0.72);
  float stormFine = noise((OCT_ROT * stormQ) * stormFineFrequency + vec3(12.3, 7.1, 22.5));
  float stormField = stormLarge * 0.50 + stormMeso * 0.34 + stormFine * 0.12 + nFineA * 0.04;
  float stormMask = smoothstep(threshold - feather * 0.78, threshold + feather * 0.78, stormField);
  float stormProfile = cuBaseProfile * (1.0 - smoothstep(stormTop - 0.052, stormTop + 0.012, hr));
  float stormBody = stormProfile * stormMask;
  float stormRelief = (cottonFbm - 0.5) * 0.075 + (cottonCrest - 0.22) * 0.025;
  float stormSurface = clamp(stormBody + stormRelief * smoothstep(0.04, 0.62, stormBody), 0.0, 1.0);
  float stormEdge = 1.0 - smoothstep(0.15, 0.91, stormSurface);
  float anvilField = noise((OCT_ROT * stormQ) * vec3(0.070, 0.245, 0.105) + vec3(12.1, 4.4, 19.8)) * 0.88
                   + stormFine * 0.12;
  float anvilMask = smoothstep(threshold - 0.16, threshold + 0.13, anvilField);
  float anvilProfile = smoothstep(stormTop - 0.09, stormTop + 0.008, hr)
                     * (1.0 - smoothstep(stormTop + 0.13, stormTop + 0.29, hr));
  float anvilDensity = anvilProfile * anvilMask * (0.16 + 0.24 * amConvectiveDrive);
  float stormSurfaceErosion = stormEdge * ((1.0 - stormFine) * 0.042 + (1.0 - nFineA) * 0.020);
  float stormDrive = mix(0.42, 1.0, amConvectiveDrive) * ${fmt(w.storm, 4)};
  float stormDensity = (max(stormSurface * (0.80 + 0.28 * nLobe + 0.15 * stormFine + 0.08 * cottonCrest) - stormSurfaceErosion - 0.014, 0.0)
                     + anvilDensity) * stormDrive;

  float rainCore = smoothstep(0.60, 0.86, nMacro * 0.65 + nMeso * 0.35);
  float rainShaft = rainCore * smoothstep(0.22, 0.70, hr)
                  * (1.0 - smoothstep(0.82, 1.0, hr)) * amPrecipitation;
  float mixedPhaseBoost = amMixedPhase * (0.035 + 0.12 * amConvectiveDrive);
  float convectiveDensity = max(cuDensity, stormDensity);
  float amSpeciesTotal = max(scDensity + cuDensity + acDensity + ciDensity + stormDensity, 1e-5);
  amCloudSpeciesWeights = vec4(scDensity, cuDensity, acDensity, ciDensity) / amSpeciesTotal;
  amCloudStormWeight = stormDensity / amSpeciesTotal;
  float d = max(max(scDensity, acDensity), max(ciDensity, convectiveDensity));
  d += mixedPhaseBoost * smoothstep(0.18, 0.72, d);
  d += rainShaft * 0.10;

  // Retain broad silhouettes in the far field; progressively reveal the
  // cotton-scale field only when the selected GPU quality can sample it.
  float coarse = max(max(scBody, cuBody), max(acBody, ciBody));
  float farDensity = max(d, coarse * 0.15);
  d = mix(farDensity, d, smoothstep(0.015, 0.90, lod));

  float baseTransition = max(100.0, ${fmt(S.C29, 2)});
  float baseFade = smoothstep(0.0, baseTransition, height - cloudBase);
  d *= mix(1.0, baseFade, ${fmt(S.C28 * 0.72, 5)});
  float profileExponent = mix(1.06, 0.82, ${fmt(S.C17, 5)});
  d = pow(max(d, 0.0), 1.06 + ${fmt(S.C8 * 0.025, 5)});
  ${activeNwpProfile() && !S.CG && (state.physics?.cloudLayers?.length) ? `float amNwpBands = 0.0;
${state.physics.cloudLayers.slice(0, 5).map((band, i) => `amNwpBands = max(amNwpBands, smoothstep(${fmt(band.baseM - 180, 1)}, ${fmt(band.baseM + 140, 1)}, height) * (1.0 - smoothstep(${fmt(band.topM - 120, 1)}, ${fmt(band.topM + 220, 1)}, height)));`).join("\n")}
  d *= amNwpBands;` : ""}
  return clamp(d, 0.0, 2.5);
}`
    return source.slice(0, start) + profile + source.slice(end + 2);
  }


  function improveCloudMarchSampling(source) {
    const tiers = [
      ["QUALITY_7", 375, 60, 224, 3.0],
      ["QUALITY_6", 450, 70, 208, 2.0],
      ["QUALITY_5", 525, 85, 192, 1.0],
      ["QUALITY_4", 675, 145, 144, 1.0],
      ["QUALITY_3", 775, 220, 112, 0.85],
      ["QUALITY_2", 900, 300, 84, 0.68],
      ["QUALITY_1", 1050, 400, 48, 0.0],
      ["QUALITY_0", 1250, 450, 30, 0.0]
    ];
    for (const [name, march, density, steps, lod] of tiers) {
      const pattern = new RegExp(`(#(?:ifdef|elif)\\s+(?:defined\\s+)?${name}\\b)([\\s\\S]*?)(?=\\n#elif\\b|\\n#else\\b|\\n#endif\\b)`);
      const match = source.match(pattern);
      if (!match) continue;
      let body = match[2];
      body = body.replace(/#define CLOUDS_MAX_LOD [0-9.]+/, `#define CLOUDS_MAX_LOD ${lod}`);
      body = body.replace(/#define CLOUDS_MARCH_STEP [0-9.]+/, `#define CLOUDS_MARCH_STEP ${march}.0`);
      body = body.replace(/#define CLOUDS_DENS_MARCH_STEP [0-9.]+/, `#define CLOUDS_DENS_MARCH_STEP ${density}.0`);
      body = body.replace(/#define MAXIMUM_CLOUDS_STEPS [0-9]+/, `#define MAXIMUM_CLOUDS_STEPS ${steps}`);
      source = source.replace(match[0], match[1] + body);
    }
    // GeoFS's unqualified default branch also needs the denser sampling path.
    const defaultPattern = /(#else\s*\/\/DEFAULT)([\s\S]*?)(?=\n#endif\b)/;
    const defaultMatch = source.match(defaultPattern);
    if (defaultMatch) {
      let body = defaultMatch[2];
      body = body.replace(/#define CLOUDS_MAX_LOD [0-9.]+/, "#define CLOUDS_MAX_LOD 1.0");
      body = body.replace(/#define CLOUDS_MARCH_STEP [0-9.]+/, "#define CLOUDS_MARCH_STEP 500.0");
      body = body.replace(/#define CLOUDS_DENS_MARCH_STEP [0-9.]+/, "#define CLOUDS_DENS_MARCH_STEP 80.0");
      body = body.replace(/#define MAXIMUM_CLOUDS_STEPS [0-9]+/, "#define MAXIMUM_CLOUDS_STEPS 128");
      source = source.replace(defaultMatch[0], defaultMatch[1] + body);
    }
    return source;
  }

  function buildAtmosphereShader(enableAtmosphere = !!S.T0, enableClouds = !!S.C0) {
    let shader = state.original.common;
    if (enableClouds) shader = improveCloudMarchSampling(shader);

    if (enableAtmosphere) {
    const m = weatherMetrics();
    const [r, g, b] = mieRGB();
    const mieScale = 21e-6;

    shader = replaceExactly(shader,
      "const vec3 beta_mie = vec3(21e-6);",
      `const vec3 beta_mie = vec3(${fmt(mieScale * r, 12)}, ${fmt(mieScale * g, 12)}, ${fmt(mieScale * b, 12)});`,
      "Angstrom aerosol colour / absorption tint");
    shader = replaceExactly(shader, "const float g = 0.9;",
      `const float g = ${fmt(S.T9 > 0 ? S.T9 : 0.8, 5)};`, "aerosol asymmetry (0 = GeoFS default 0.8)");
    // A weak backward-scattering lobe adds the aerosol back-glow (T7).
    const phaseNeedle = "float phase_mie = (allow_mie ? 3.0 : 0.5 ) / (25.1327412287 ) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));";
    const phaseReplacement = `float phase_mie = (allow_mie ? 3.0 : 0.5 ) / (25.1327412287 ) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
float amBackG = -max(0.05, g * 0.5);
float amBackGG = amBackG * amBackG;
float amBackPhase = (allow_mie ? 3.0 : 0.5) / 25.1327412287 * ((1.0 - amBackGG) * (mumu + 1.0)) / (pow(1.0 + amBackGG - 2.0 * mu * amBackG, 1.5) * (2.0 + amBackGG));
phase_mie = mix(phase_mie, amBackPhase, ${fmt(S.T7, 5)});`;
    shader = replaceExactly(shader, phaseNeedle, phaseReplacement, "aerosol backscatter");

    // Boundary-layer haze plus a separate, exponentially thinning free troposphere.
    shader = replaceExactly(shader,
      "#ifdef ADVANCED_ATMOSPHERE\nvec4 calculate_scattering(",
      `${makeAerosolFunction()}\n#ifdef ADVANCED_ATMOSPHERE\nvec4 calculate_scattering(`,
      "layered aerosol density function");
    shader = replaceExactly(shader,
      "vec2 density = exp(-height_i / scale_height) * step_size_i;",
      `float amAltitude_i = max(height_i - (realPlanetRadius - planetRadius), 0.0);
float amBoundary_i = amBoundaryDensity(amAltitude_i);
vec2 density = vec2(exp(-height_i / scale_height.x), amAerosolDensity(amAltitude_i)) * step_size_i;
amBrownOpt_i += amBoundary_i * step_size_i;`,
      "primary-ray aerosol density");
    shader = replaceExactly(shader,
      "vec2 opt_i = vec2(0.0);",
      "vec2 opt_i = vec2(0.0);\nfloat amBrownOpt_i = 0.0;",
      "boundary-layer absorption accumulator");
    shader = replaceExactly(shader,
      "vec2 opt_l = vec2(0.0);",
      "vec2 opt_l = vec2(0.0);\nfloat amBrownOpt_l = 0.0;",
      "sun-ray boundary-layer absorption accumulator");
    shader = replaceExactly(shader,
      "opt_l += exp(-height_l / scale_height) * step_size_l;",
      `float amAltitude_l = max(height_l - (realPlanetRadius - planetRadius), 0.0);
float amBoundary_l = amBoundaryDensity(amAltitude_l);
opt_l += vec2(exp(-height_l / scale_height.x), amAerosolDensity(amAltitude_l)) * step_size_l;
amBrownOpt_l += amBoundary_l * step_size_l;`,
      "sun-ray aerosol density");
    shader = replaceExactly(shader,
      "vec3 attn = exp(-((beta_mie * (opt_i.y + opt_l.y)) + (beta_ray * (opt_i.x + opt_l.x)))) * mask;",
      `vec3 amAttn = exp(-((beta_mie * (opt_i.y + opt_l.y)) + (beta_ray * (opt_i.x + opt_l.x))));
amAttn.b *= exp(-${fmt(S.T6, 5)} * (amBrownOpt_i + amBrownOpt_l) * 21e-6 * 0.8);
vec3 attn = amAttn * mask;`,
      "boundary-layer-only brown absorption");
    shader = replaceExactly(shader,
      "float opacity = length(exp(-((beta_mie * opt_i.y) + (beta_ray * opt_i.x)) * density_multiplier));",
      `vec3 amOpacity = exp(-((beta_mie * opt_i.y) + (beta_ray * opt_i.x)) * density_multiplier);
amOpacity.b *= exp(-${fmt(S.T6, 5)} * amBrownOpt_i * 21e-6 * density_multiplier * 0.8);
float opacity = length(amOpacity);`,
      "boundary-layer absorption in atmospheric opacity");
    }

    // Replace the stock single-family density field with layered cloud species.
    if (enableClouds) {
      shader = replaceCloudDensityFunction(shader);
    }
    return shader;
  }

  function buildCloudShader() {
    let shader = state.original.clouds;
    const phys = state.physics || computeWeatherPhysics();
    const lightning = S.WX ? clamp(phys.lightningPotential, 0, 1) : 0;
    shader = replaceExactly(shader, "float distanceToFirstCloud = 0.0;",
      "float distanceToFirstCloud = 0.0;\nfloat amFirstCloudHeightRatio = 0.0;", "capture first cloud altitude");
    shader = replaceExactly(shader, "distanceToFirstCloud = distance;",
      "distanceToFirstCloud = distance;\namFirstCloudHeightRatio = heightRatio;", "store first cloud altitude");
    shader = replaceExactly(shader,
      "dens = cloudDensity(position, wind, lod, heightRatio, coverage);",
      "dens = cloudDensity(position, wind, lod, heightRatio, coverage);\nvec4 amSampleSpeciesMix = amCloudSpeciesWeights;\nfloat amSampleStormMix = amCloudStormWeight;",
      "capture per-sample cloud species weights");
    const shadowNeedle = `float shadowStrength = 10.0;
float hrShadow;
float d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage);
float d2 = 0.2;
if (lod > 1.0) {
d2 = cloudDensity(position + light_dir * shortMarchStep * 10.0, wind, 0.0, hrShadow, coverage);
}
float opticalDepth = (d1 + d2);
float transmitance = exp(-shadowStrength * opticalDepth);`;
    const shadowReplacement = `float shadowStrength = 8.4;
float hrShadow;
float d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage);
vec3 amLocalUp = normalize(position);
float amNormalProbeStep = max(shortMarchStep * 1.35, 70.0);
float d2 = cloudDensity(position + amLocalUp * amNormalProbeStep, wind, 0.0, hrShadow, coverage);
float d3 = cloudDensity(position + light_dir * shortMarchStep * 4.0, wind, 0.0, hrShadow, coverage);
float opticalDepth = 0.018 + max(d1 - 0.035, 0.0) * 0.74 + max(d3 - 0.035, 0.0) * 0.42;
float transmitance = exp(-shadowStrength * opticalDepth);`;
    shader = replaceExactly(shader, shadowNeedle, shadowReplacement, "sunward shadow and vertical density-gradient probe");
    const k = S.C1;
    const bounceShare = S.C3;
    const bounceG = S.C4;
    const deepLight = S.C5 > 0 ? S.C5 : 0.033;
    const powder = S.C6;
    const powderDepth = S.C7 > 0 ? S.C7 : 100;
    const glory = S.C9;
    const droplet = S.C10 > 0 ? S.C10 : 10;
    const spread = S.C11 > 0 ? S.C11 : 0.08;
    const iridescence = S.IR;
    const phaseK = clamp(k + (droplet - 10) * 0.0012 + S.IF * 0.006, 0.78, 0.99);
    shader = replaceExactly(shader, "const float kInScattering = 0.99;",
      `const float kInScattering = ${fmt(phaseK, 5)};`, "droplet-size-dependent forward scattering");
    const modeExtinction = [1.0, 0.96, 1.28, 1.12, 0.88, 0.58][Math.round(S.CM)] ?? 1.0;
    shader = replaceExactly(shader, "float extinctionCoeff = 0.01 * dens;",
      `float extinctionCoeff = 0.01 * dens * clamp(10.0 / ${fmt(droplet, 4)}, 0.45, 2.5) * ${fmt(modeExtinction, 4)};`, "species-dependent optical extinction");

    const phaseNeedle = "float inScattering = Schlick(kInScattering, dotLightRay); //HenyeyGreenstein(gInScattering, dotLightRay);";
    const phaseReplacement = `float amMieG = clamp(0.82 + (${fmt(droplet, 4)} - 10.0) * 0.0025, 0.76, 0.90);
float amMieGG = amMieG * amMieG;
float amMieHG = (1.0 - amMieGG) / (12.5663706 * pow(max(1.0 + amMieGG - 2.0 * amMieG * dotLightRay, 0.001), 1.5));
float inScattering = mix(Schlick(kInScattering, dotLightRay), amMieHG, 0.62);`;
    shader = replaceExactly(shader, phaseNeedle, phaseReplacement, "droplet Mie/Henyey-Greenstein phase");

    const sunPhaseNeedle = "float sunScatteringPhase = mix(outScattering, inScattering, smoothstep(-0.2, 0.8, dotLightRay));";
    const sunPhaseReplacement = `float amBaseSunPhase = mix(outScattering, inScattering, smoothstep(-0.2, 0.8, dotLightRay));
float sunScatteringPhase = mix(amBaseSunPhase, inScattering, ${fmt(S.C2, 5)});`;
    shader = replaceExactly(shader, sunPhaseNeedle, sunPhaseReplacement, "cloud forward-lobe weight");

    const ambientNeedle = "float ambientScatteringPhase = isotropic();";
    const ambientReplacement = `float amBounceG = ${fmt(bounceG, 5)};
float amBounceGG = amBounceG * amBounceG;
float amBouncePhase = (1.0 - amBounceGG) / (12.5663706 * pow(1.0 + amBounceGG - 2.0 * dotLightRay * amBounceG, 1.5));
float ambientScatteringPhase = mix(isotropic(), amBouncePhase, ${fmt(bounceShare, 5)});`;
    shader = replaceExactly(shader, ambientNeedle, ambientReplacement, "cloud multiple scattering");

    const freezingHeight = (state.physics || computeWeatherPhysics()).freezingLevelM;
    const optics = atmosphericOptics();
    const lightNeedle = "vec3 lightTerm = sunScatteringPhase * sunLight + ambientScatteringPhase * ambientLight;";
    const lightReplacement = `float amDeepCloudLight = mix(1.0, ${fmt(deepLight / 0.033, 5)}, clamp(1.0 - transmitance, 0.0, 1.0) * 0.25);
float amCloudSampleAltitude = length(position) - realPlanetRadius;
float amSunElevationDeg = degrees(asin(clamp(dot(normalize(light_dir), amLocalUp), -1.0, 1.0)));
float amAirMassTerm = 1.0 / max(0.035, sin(radians(max(amSunElevationDeg, -4.0))) + 0.50572 * pow(max(amSunElevationDeg + 6.07995, 0.1), -1.6364));
amAirMassTerm = clamp(amAirMassTerm, 1.0, 32.0);
float amRayleighColumn = exp(-max(amCloudSampleAltitude, 0.0) / 8000.0);
float amAerosolColumn = exp(-max(amCloudSampleAltitude, 0.0) / 1350.0);
vec3 amSunOpticalDepth = vec3(${fmt(optics.tauRayR, 6)}, ${fmt(optics.tauRayG, 6)}, ${fmt(optics.tauRayB, 6)}) * (amAirMassTerm * amRayleighColumn)
                       + vec3(${fmt(optics.tauMieR, 6)}, ${fmt(optics.tauMieG, 6)}, ${fmt(optics.tauMieB, 6)}) * (amAirMassTerm * amAerosolColumn);
vec3 amSunTransmittance = exp(-amSunOpticalDepth);
vec3 amSpectralSunTint = clamp(amSunTransmittance / max(amSunTransmittance.g, 0.012), vec3(0.34, 0.82, 0.10), vec3(2.35, 1.0, 0.92));
float amSunsetBlend = 1.0 - smoothstep(2.0, 19.0, amSunElevationDeg);
float amSunVisible = smoothstep(-1.3, 1.0, amSunElevationDeg);
float amSunEnergy = mix(1.0, clamp(sqrt(dot(amSunTransmittance, vec3(0.333333))) * 1.85, 0.18, 1.0), amSunsetBlend);
float amAerosolForwardVeil = 1.0 - exp(-${fmt(optics.tauMieG, 6)} * amAirMassTerm * amAerosolColumn);
float amHumidityDesaturation = clamp(amAerosolForwardVeil * 0.22 + ${fmt(optics.moistureVeil * 0.08, 5)}, 0.0, 0.24);
vec3 amNeutralMieFill = vec3(1.0, 0.94, 0.86);
vec3 amSunsetColor = mix(amSpectralSunTint, amNeutralMieFill, amHumidityDesaturation * amSunsetBlend);
sunLight *= mix(vec3(1.0), amSunsetColor, amSunsetBlend) * amSunEnergy * amSunVisible;
vec3 amWarmSkyTint = mix(vec3(1.0), vec3(1.0, 0.80, 0.66), amSunsetBlend * clamp(0.05 + amAerosolForwardVeil * 0.18 + ${fmt(optics.moistureVeil * 0.04, 5)}, 0.0, 0.22));
ambientLight *= amWarmSkyTint;

float amIcePhaseFraction = smoothstep(${fmt(freezingHeight - 650, 2)}, ${fmt(freezingHeight + 1050, 2)}, amCloudSampleAltitude);
float amCloudTopLight = smoothstep(0.20, 0.86, heightRatio);
float amCloudOpticalBody = smoothstep(0.12, 1.05, dens);
vec3 amStratocumulusTint = mix(vec3(0.90, 0.95, 1.035), vec3(1.015, 1.025, 1.035), amCloudTopLight);
vec3 amCumulusTint = mix(vec3(0.82, 0.89, 1.02), vec3(1.095, 1.075, 1.035), amCloudTopLight);
vec3 amAltocumulusTint = mix(vec3(0.86, 0.91, 1.025), vec3(1.045, 1.045, 1.055), amCloudTopLight);
vec3 amCirrusTint = mix(vec3(0.82, 0.89, 1.045), vec3(1.035, 1.055, 1.09), amCloudTopLight);
vec3 amStormTint = mix(vec3(0.48, 0.57, 0.73), vec3(1.12, 1.095, 1.045), amCloudTopLight);
vec3 amSpeciesMaterial = amSampleSpeciesMix.x * amStratocumulusTint
                       + amSampleSpeciesMix.y * amCumulusTint
                       + amSampleSpeciesMix.z * amAltocumulusTint
                       + amSampleSpeciesMix.w * amCirrusTint
                       + amSampleStormMix * amStormTint;
vec3 amIceMaterial = vec3(0.88, 0.95, 1.10);
amSpeciesMaterial = mix(amSpeciesMaterial, amIceMaterial, amIcePhaseFraction * ${fmt(S.IF, 4)});
float amBaseShade = 1.0 - smoothstep(0.035, 0.27, heightRatio);
float amTopFacing = smoothstep(-0.025, 0.090, dens - d2);
float amUnderside = max(amBaseShade * 0.68, smoothstep(0.018, 0.13, d2 - dens));
float amSunFacing = smoothstep(-0.045, 0.135, dens - d1);
float amShadowOcclusion = clamp((1.0 - transmitance) * 0.27 + amUnderside * 0.72 + amCloudOpticalBody * 0.12, 0.0, 0.94);
vec3 amCoolShadowColor = mix(vec3(0.58, 0.69, 0.87), vec3(0.36, 0.47, 0.68), amSampleStormMix);
vec3 amInteriorShade = mix(vec3(1.0), amCoolShadowColor, amShadowOcclusion);
vec3 amCloudScatterTint = amSpeciesMaterial * amInteriorShade;
float amDirectContrast = mix(0.14, 1.38, pow(clamp(amSunFacing * 0.72 + amTopFacing * 0.28, 0.0, 1.0), 0.74));
float amAmbientOcclusion = mix(0.50, 1.0, 1.0 - amShadowOcclusion * 0.76);
vec3 lightTerm = (sunScatteringPhase * sunLight * amDirectContrast * (1.0 - ${fmt(bounceShare * 0.35, 5)})
                + ambientScatteringPhase * ambientLight * (1.0 + ${fmt(bounceShare, 5)}) * amDeepCloudLight * amAmbientOcclusion) * amCloudScatterTint;`;
    shader = replaceExactly(shader, lightNeedle, lightReplacement, "directional cloud surface lighting and cool self-shadows");

    const powderNeedle = "cloud.rgb += cloud.a * 15.0 * lightTerm * (1.0 - stepT);";
    const powderReplacement = `float amPowderBuild = 1.0 - exp(-dens * marchStep / ${fmt(powderDepth, 2)});
float amPowderBack = 1.0 - smoothstep(-0.15, 0.72, dotLightRay);
float amPowderTerm = amPowderBuild * (1.0 - transmitance) * ${fmt(powder, 5)} * amPowderBack * (0.55 + 0.45 * amSunFacing);
cloud.rgb += cloud.a * 15.0 * lightTerm * (1.0 - stepT) * (1.0 + amPowderTerm);`;
    shader = replaceExactly(shader, powderNeedle, powderReplacement, "powder build-up");

    const gloryNeedle = "cloud.a = (1.0 - cloud.a);";
    const radius = (2.4 * Math.PI / 180) * (10 / droplet);
    const width = spread * 0.10;
    const gloryReplacement = `float amCloudOpacity = clamp(1.0 - cloud.a, 0.0, 1.0);
float amAntiSolar = dot(normalize(dir), -normalize(light_dir));
float amGloryAngle = acos(clamp(amAntiSolar, -1.0, 1.0));
float amGloryRadius = ${fmt(radius, 7)};
float amGloryWidth = ${fmt(width, 7)};
float amGloryCore = exp(-pow(amGloryAngle / max(amGloryWidth, 0.002), 2.0));
float amGloryBlue = exp(-pow((amGloryAngle - amGloryRadius * 0.68) / max(amGloryWidth, 0.002), 2.0));
float amGloryRed = exp(-pow((amGloryAngle - amGloryRadius) / max(amGloryWidth * 1.2, 0.002), 2.0));
float amGloryOuter = exp(-pow((amGloryAngle - amGloryRadius * 1.72) / max(amGloryWidth * 1.45, 0.002), 2.0));
vec3 amGloryColor = vec3(0.08, 0.18, 0.62) * amGloryCore + vec3(0.12, 0.45, 1.0) * amGloryBlue + vec3(1.0, 0.28, 0.08) * amGloryRed + vec3(0.65, 0.20, 0.12) * amGloryOuter;
cloud.rgb += amGloryColor * amCloudOpacity * ${fmt(0.18 * glory, 5)};

// Water-droplet cloud iridescence: weak, pastel diffraction bands near the Sun.
float amSolarCos = clamp(dot(normalize(dir), normalize(light_dir)), -1.0, 1.0);
float amSolarAngle = acos(amSolarCos);
float amDropRadius = ${fmt(droplet, 4)} * 1e-6;
float amIriRedAngle = 1.22 * 0.65e-6 / max(2.0 * amDropRadius, 1e-9);
float amIriGreenAngle = 1.22 * 0.54e-6 / max(2.0 * amDropRadius, 1e-9);
float amIriBlueAngle = 1.22 * 0.46e-6 / max(2.0 * amDropRadius, 1e-9);
float amIriWidth = max(0.0022, ${fmt(0.0015 + spread * 0.010, 7)});
float amIriRed = exp(-pow((amSolarAngle - amIriRedAngle) / amIriWidth, 2.0));
float amIriGreen = exp(-pow((amSolarAngle - amIriGreenAngle) / amIriWidth, 2.0));
float amIriBlue = exp(-pow((amSolarAngle - amIriBlueAngle) / amIriWidth, 2.0));
float amThinCloudMask = smoothstep(0.025, 0.28, amCloudOpacity) * (1.0 - smoothstep(0.62, 0.94, amCloudOpacity));
vec3 amIridescentTint = vec3(1.0, 0.28, 0.12) * amIriRed + vec3(0.18, 0.95, 0.40) * amIriGreen + vec3(0.18, 0.42, 1.0) * amIriBlue;
float amIriBroad = exp(-pow(amSolarAngle / max(amIriRedAngle * 2.6, 0.01), 2.0));
float amSilverLining = pow(max(amSolarCos, 0.0), 9.0) * amThinCloudMask;
cloud.rgb += vec3(1.0, 0.91, 0.76) * amSilverLining * 0.045;

// Subtle ice-crystal halo around the Sun, weighted by the high-cloud ice setting.
float amHaloAngle = 22.0 * 0.01745329252;
float amHaloWidth = 0.009 + ${fmt(S.IF * 0.004, 6)};
float amIceHalo = exp(-pow((amSolarAngle - amHaloAngle) / amHaloWidth, 2.0));
float amHighCloudHint = smoothstep(0.58, 0.78, amFirstCloudHeightRatio) * smoothstep(0.18, 0.48, amCloudOpacity) * (1.0 - smoothstep(0.88, 0.99, amCloudOpacity));
float amCloudAltitudeEstimate = cloudBase + amFirstCloudHeightRatio * cloudThickness;
float amIcePhaseAtCloud = smoothstep(${fmt((state.physics || computeWeatherPhysics()).freezingLevelM - 550, 2)}, ${fmt((state.physics || computeWeatherPhysics()).freezingLevelM + 950, 2)}, amCloudAltitudeEstimate);
amIridescentTint *= (1.0 - 0.82 * amIcePhaseAtCloud);
amIriBroad *= (1.0 - 0.65 * amIcePhaseAtCloud);
amIceHalo *= amIcePhaseAtCloud;
cloud.rgb += (amIridescentTint * 0.12 + vec3(0.72, 0.82, 1.0) * amIriBroad * 0.035) * amThinCloudMask * ${fmt(iridescence, 5)};
cloud.rgb += vec3(0.72, 0.82, 1.0) * amIceHalo * amHighCloudHint * ${fmt(S.IF * 0.045, 5)};
float amLightningSlot = floor(float(czm_frameNumber) / 5.0);
float amLightningRandom = fract(sin(amLightningSlot * 12.9898 + 78.233) * 43758.5453);
float amLightningFlash = smoothstep(0.994, 1.0, amLightningRandom) * ${fmt(lightning, 5)};
cloud.rgb += vec3(0.72, 0.82, 1.0) * amLightningFlash * amCloudOpacity * 0.85;
cloud.a = amCloudOpacity;`;
    shader = replaceExactly(shader, gloryNeedle, gloryReplacement, "glory, droplet diffraction and ice halo");

    // T11 changes distant-cloud haze from grey dimming to per-channel scattering.
    const hazeNeedle = "cloud.rgb = cloud.rgb * (1.0 - atmosphereAtDistance.a) + atmosphereAtDistance.rgb;";
    const hazeReplacement = `vec3 amCloudHazeGrey = vec3(dot(atmosphereAtDistance.rgb, vec3(0.299, 0.587, 0.114)));
vec3 amCloudHazePerChannel = mix(amCloudHazeGrey, atmosphereAtDistance.rgb, ${fmt(S.T11, 5)});
cloud.rgb = cloud.rgb * (1.0 - atmosphereAtDistance.a) + amCloudHazePerChannel;`;
    shader = replaceExactly(shader, hazeNeedle, hazeReplacement, "per-channel distant-cloud haze");

    // T12 stretches the cloud far slice only as the camera climbs above 10 km.
    const distanceNeedle = "tmax = min(tmax, tmin + CLOUDS_MAX_VIEWING_DISTANCE);";
    const distanceReplacement = `float amHighAltitudeStretch = smoothstep(0.0, 10000.0, startHeight) * ${fmt(S.T12, 5)};
float amCloudViewDistance = mix(CLOUDS_MAX_VIEWING_DISTANCE, 357000.0, amHighAltitudeStretch);
tmax = min(tmax, tmin + amCloudViewDistance);`;
    shader = replaceExactly(shader, distanceNeedle, distanceReplacement, "high-altitude cloud far-slice stretch");
    return shader;
  }

  function restoreShaders() {
    if (!state.shaders || !state.original) return;
    state.shaders["atmosphereCommon.glsl"] = state.original.common;
    state.shaders["volumetricCloudsFS.glsl"] = state.original.clouds;
  }

  function applyShaders() {
    if (!state.shaders || !state.original) return;
    if (!state.masterEnabled) { restoreShaders(); return; }
    const atmosphere = S.T0 !== 0;
    const clouds = S.C0 !== 0;
    state.shaders["atmosphereCommon.glsl"] = (atmosphere || clouds)
      ? buildAtmosphereShader(atmosphere, clouds) : state.original.common;
    state.shaders["volumetricCloudsFS.glsl"] = clouds ? buildCloudShader() : state.original.clouds;
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
    const ratio = w && Number.isFinite(w.timeRatio) ? clamp(w.timeRatio, 0, 1) : 0;
    // GeoFS exposes a colour-modifier API, not the MSFS 95-wavelength ozone LUT.
    // This is deliberately a subtle display-space approximation, not a claim of spectral parity.
    const twilight = clamp(1 - Math.abs(ratio - 0.88) / 0.16, 0, 1);
    const modifier = {
      brightnessShift: daylightBalanceActive ? 0.012 : 0,
      saturationShift: atmosphereColorActive ? 0.018 : 0,
      hueShift: -twilight * (atmosphereColorActive ? 0.006 : 0),
      groundBrightnessShift: daylightBalanceActive ? 0.012 : 0,
      groundSaturationShift: atmosphereColorActive ? 0.004 : 0,
      groundHueShift: 0,
      fogBrightness: 1,
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
float amLensDisc(vec2 p, vec2 c, float radius) {
  float r = length(p - c);
  float core = exp(-pow(r / max(radius * 0.48, 0.0005), 2.0));
  float ring = exp(-pow((r - radius * 0.78) / max(radius * 0.105, 0.00035), 2.0));
  float outer = exp(-pow((r - radius * 1.34) / max(radius * 0.10, 0.00035), 2.0));
  return core * 0.12 + ring * 0.38 + outer * 0.10;
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
  float d1 = amLensDisc(p, g1, 0.027);
  float d2 = amLensDisc(p, g2, 0.050);
  float d3 = amLensDisc(p, g3, 0.078);
  float d4 = amLensDisc(p, g4, 0.034);
  float d1R = amLensDisc(p, g1 + opticalAxis * 0.0014, 0.0275);
  float d1B = amLensDisc(p, g1 - opticalAxis * 0.0014, 0.0265);
  float d3R = amLensDisc(p, g3 + opticalAxis * 0.0020, 0.079);
  float d3B = amLensDisc(p, g3 - opticalAxis * 0.0020, 0.077);
  float r = length(p - sun);
  float sunHalo = exp(-pow(r / 0.105, 2.0));
  float sunCore = exp(-pow(r / 0.018, 2.0));
  float horizontalStreak = exp(-pow((p.y - sun.y) / 0.0028, 2.0)) * exp(-abs(p.x - sun.x) * 8.0);
  vec3 ghosts = vec3(0.0);
  ghosts += vec3(d1R * 0.70, d1 * 0.82, d1B * 1.08) * vec3(0.44, 0.80, 1.15);
  ghosts += d2 * vec3(1.08, 0.46, 0.30);
  ghosts += vec3(d3R * 0.78, d3 * 0.86, d3B * 1.06) * vec3(0.42, 0.66, 1.12);
  ghosts += d4 * vec3(0.92, 0.76, 0.46);
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

  function shouldForceClouds() {
    return !!(state.masterEnabled && S.C0 && (S.CG || activeNwpProfile()));
  }

  function setCloudRuntimeFlags(force) {
    const api = state.geofs?.api?.renderingSettings;
    if (!api || !state.original?.renderPrefs) return;
    if (force) {
      api.advancedAtmosphere = true;
      api.volumetricClouds = true;
    } else {
      const saved = state.original.renderPrefs;
      if (typeof saved.advancedAtmosphere === "boolean") api.advancedAtmosphere = saved.advancedAtmosphere;
      if (typeof saved.volumetricClouds === "boolean") api.volumetricClouds = saved.volumetricClouds;
    }
  }

  function applyCloudWeatherOverride() {
    const a = state.atmosphere;
    if (!a || !state.masterEnabled || !S.C0) return;
    const weather = window.weather || {};
    const d = weather.definition || {};
    state.physics = computeWeatherPhysics(d);
    const native = physicsCloudBaseTop(d);
    const nwp = activeNwpProfile();
    const base = S.CG ? clamp(S.CB, 0, 10000) : native.base;
    const top = S.CG ? clamp(Math.max(S.CT, base + 500), base + 500, 22000) : native.top;
    const cover = S.CG ? clamp(S.CC, 0, 1)
      : nwp && Number.isFinite(nwp.surface.cloudCover) ? clamp(nwp.surface.cloudCover, 0, 1)
      : a.realTimeClouds ? 1 : clamp(finite(d.cloudCover, 0) * 0.01, 0, 1);
    const thickness = Math.max(500, top - base);
    const layerPosition = clamp(finite(d.cloudLayerPosition, 0.2), 0.02, 0.8);
    const baseThickness = thickness * layerPosition;
    const layer = base + baseThickness;
    const wind = weather.currentWindVectorWC;
    const stages = [a.atmospherePostProcessStage?.uniforms, a.cloudsPostProcessStage?.uniforms].filter(Boolean);
    for (const u of stages) {
      const radius = finite(u.realPlanetRadius, finite(a.realPlanetRadius, 6371000));
      u.cloudCover = cover;
      u.cloudBase = base;
      u.cloudTop = top;
      u.cloudThickness = thickness;
      u.layerPosition = layerPosition;
      u.baseThickness = baseThickness;
      u.layer = layer;
      u.cloudBaseRadius = radius + base;
      u.cloudTopRadius = radius + top;
      if (wind) u.windVector = wind;
    }
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

  function createArgs() {
    const a = state.atmosphere;
    const api = state.geofs?.api?.renderingSettings || {};
    const force = shouldForceClouds();
    const advanced = force ? true : (typeof api.advancedAtmosphere === "boolean" ? api.advancedAtmosphere : !!a.advancedAtmosphere);
    const baseQuality = finite(api.scatteringQuality, finite(a.quality, 4));
    // Preserve the user's GeoFS quality level; this shader is more expensive per sample.
    const quality = baseQuality;
    const volumetric = force ? true : (typeof api.volumetricClouds === "boolean" ? api.volumetricClouds : !!a.volumetricClouds);
    // Manual coverage must bypass the realtime coverage texture; otherwise an empty weather mask can erase the generated cloud field.
    const realtime = force ? false : (typeof a.realTimeClouds === "boolean" ? a.realTimeClouds : false);
    const retro = typeof a.retro === "boolean" ? a.retro : false;
    return [advanced, quality, volumetric, realtime, retro];
  }

  function rebuildAtmosphere() {
    const a = state.atmosphere;
    if (!a || typeof state.original?.create !== "function") return false;
    let args;
    try {
      setCloudRuntimeFlags(shouldForceClouds());
      args = createArgs();
      removeLensGhostStage();
      if (a.postProcessingStages && typeof state.original.destroy === "function") {
        state.original.destroy.call(a);
      }
      applyShaders();
      setCloudRuntimeFlags(shouldForceClouds());
      state.original.create.apply(a, args);
      applyCloudWeatherOverride();
      updateLensGhostStage();
      const loc = state.geofs?.camera?.lla || state.geofs?.aircraft?.instance?.llaLocation;
      if (loc && typeof a.update === "function") a.update(loc, true);
      if (typeof a.setFogColor === "function") a.setFogColor();
      updateColorModifiers();
      state.applied = true;
      updateStatus();
      return true;
    } catch (error) {
      console.error("[AtmosphereMod GeoFS] Stage rebuild failed; restoring stock shaders", error);
      restoreShaders();
      try {
        removeLensGhostStage();
        if (a.postProcessingStages && state.original.destroy) state.original.destroy.call(a);
        state.original.create.apply(a, args);
        updateLensGhostStage();
      } catch (restoreError) {
        console.error("[AtmosphereMod GeoFS] Native atmosphere recovery failed", restoreError);
      }
      updateStatus("シェーダー再構築エラー · GeoFS標準シェーダーに復帰しました");
      return false;
    }
  }

  function scheduleRebuild() {
    clearTimeout(state.rebuildTimer);
    state.rebuildTimer = setTimeout(() => {
      if (state.destroyed || !state.compatible) return;
      try {
        applyShaders();
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
    const weather = weatherObject()?.definition || {};
    const cloudStage = a?.cloudsPostProcessStage?.uniforms;
    const atmosphereStage = a?.atmospherePostProcessStage?.uniforms;
    const cover = finite(cloudStage?.cloudCover, finite(atmosphereStage?.cloudCover, NaN));
    return {
      cover,
      base: finite(cloudStage?.cloudBase, finite(weather.cloudBase, NaN)),
      top: finite(cloudStage?.cloudTop, finite(weather.cloudTop, NaN)),
      volumetric: !!a?.volumetricClouds,
      advanced: !!a?.advancedAtmosphere,
      stageReady: !!a?.cloudsPostProcessStage
    };
  }

  function statusText(extra) {
    if (extra) return extra;
    if (!state.geofs) return "GeoFSの読み込みを待っています";
    if (!state.compatible) return "このGeoFSビルドでは描画フックを確認できません";
    if (!state.masterEnabled) return "停止中 · 標準の大気・雲シェーダーを使用しています";
    const cloud = liveCloudStats();
    if (S.T0 && !state.atmosphere?.advancedAtmosphere) return "待機中 · GeoFS設定でAdvanced Atmosphereを有効にしてください";
    if (S.C0 && !cloud.advanced) return "雲を表示するにはGeoFS設定のAdvanced AtmosphereをONにしてください";
    if (S.C0 && !cloud.volumetric) return "GeoFS設定のVolumetric CloudsをONにしてください（C0は描画を有効化する設定ではありません）";
    if (S.C0 && cloud.stageReady && Number.isFinite(cloud.cover) && cloud.cover <= 0.1) return "雲量が0.1以下です · 手動生成設定と雲レイヤーを確認してください";
    if (S.C0 && !cloud.stageReady) return "雲シェーダーは適用済み · GeoFS雲描画ステージの生成待ち";
    if (!S.T0 && !S.C0) return S.C22
      ? "T0 / C0 OFF · 標準シェーダー + C22昼光補正"
      : "T0 / C0 OFF · GeoFS標準描画を使用しています";
    return `GeoFS 4.0 · ${activeNwpProfile() ? "NWP鉛直予報" : "GeoFS天候"} · ${CLOUD_MODES[Math.round(S.CM)]} · 熱力学診断 ${S.WX ? "ON" : "OFF"}`;
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
      volume: cloud.volumetric && cloud.stageReady ? "ON" : cloud.volumetric ? "WAIT" : "OFF"
    };
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
    if (src) src.textContent = S.CG ? "AtmosphereMod manual cloud deck" : nwp ? `Open-Meteo 鉛直予報 (${nwp.levels.length}層 · ${nwp.validTime} UTC)` : w ? "GeoFS weather.definition（集約値・NWP未接続）" : "未取得";
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
      source: "AtmosphereMod GeoFS 1.6.0 cellular cloud morphology + atmosphere optics + camera-projected lens ghosts",
      exportedAt: new Date().toISOString(), masterEnabled: state.masterEnabled,
      settings: { ...S }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "AtmosphereMod-GeoFS-1.6.0-profile.json";
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
      for (const key of ["T0", "C0", "T8", "T13", "C22", "CG", "WX", "NWP"]) if (key in incoming) S[key] = incoming[key] ? 1 : 0;
      S.CM = Math.round(clamp(S.CM, 0, 5));
      if (typeof parsed.masterEnabled === "boolean") state.masterEnabled = parsed.masterEnabled;
      syncUI(); scheduleRebuild(); saveSettings();
    }).catch(error => {
      console.error("[AtmosphereMod GeoFS] Profile import failed", error);
      updateStatus("設定JSONの読み込みに失敗しました");
    });
  }

  function createUI() {
    document.getElementById(UI_ID)?.remove();
    const root = document.createElement("div");
    root.id = UI_ID;
    root.innerHTML = `
      <style>
        #${UI_ID}{position:fixed;z-index:999999;left:12px;top:74px;color:#eaf2f7;font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:none;--line:rgba(143,177,198,.2);--muted:#94aaba;--panel:rgba(7,17,27,.97);}
        #${UI_ID} *{box-sizing:border-box}#${UI_ID} button,#${UI_ID} input{font:inherit}#${UI_ID} button{cursor:pointer}
        #${UI_ID} .am-launch{pointer-events:auto;display:flex;gap:9px;align-items:center;padding:9px 13px;border:1px solid #52758b;border-radius:7px;background:linear-gradient(135deg,#18394d,#081522);color:#edf5fa;box-shadow:0 8px 24px #0008;font-weight:800;letter-spacing:.08em}
        #${UI_ID} .am-icon{display:grid;place-items:center;width:26px;height:26px;border-radius:5px;background:#28627c}
        #${UI_ID} .am-panel{pointer-events:auto;display:none;flex-direction:column;width:min(460px,calc(100vw - 24px));max-height:min(86vh,850px);margin-top:8px;overflow:hidden;border:1px solid #49687c;border-radius:10px;background:var(--panel);box-shadow:0 18px 60px #000b;backdrop-filter:blur(14px)}
        #${UI_ID}.open .am-panel{display:flex}#${UI_ID} .am-head{padding:12px 14px;background:#102638;border-bottom:1px solid var(--line)}
        #${UI_ID} .am-top{display:flex;align-items:center;justify-content:space-between;gap:10px}#${UI_ID} .am-title{font-size:13px;font-weight:850;letter-spacing:.14em}#${UI_ID} .am-sub{font-size:9px;color:var(--muted);letter-spacing:.1em}
        #${UI_ID} .am-badge{padding:4px 8px;border:1px solid #507286;border-radius:4px;font-size:9px;font-weight:800}#${UI_ID} .am-badge.on{color:#9be3b8;border-color:#39795d}#${UI_ID} .am-badge.warn{color:#f3d49a;border-color:#866b3b}#${UI_ID} .am-badge.off{color:#aab6bf;border-color:#56616b}
        #${UI_ID} .am-status{margin-top:8px;color:#bbcfdb;font-size:10px;min-height:14px}#${UI_ID} .am-close{background:none;border:0;color:#b9cbd6;font-size:21px}
        #${UI_ID} .am-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:11px}
        #${UI_ID} .am-tabs{display:flex;gap:5px;padding:8px 10px;border-bottom:1px solid var(--line)}#${UI_ID} .am-tabs button{flex:1;padding:7px 4px;background:#132b3c;border:1px solid #2e4b5d;border-radius:5px;color:#bcd0dc;font-size:10px}
        #${UI_ID} .am-tabs button.active{background:#23516a;border-color:#5e9ab6;color:#fff}#${UI_ID} .am-content{overflow:auto;padding:10px 12px;min-height:170px}
        #${UI_ID} .am-page[hidden]{display:none}#${UI_ID} .am-group-title{margin:7px 0 8px;padding:7px 8px;border-left:3px solid #66b5d7;background:#102637;color:#d8e9f2;font-size:11px;font-weight:800;letter-spacing:.05em}
        #${UI_ID} .am-control{display:block;padding:7px 2px;border-bottom:1px solid rgba(130,160,180,.10)}#${UI_ID} .am-control span{display:flex;align-items:baseline;gap:7px;color:#d9e6ee;font-size:10px}#${UI_ID} .am-control b{color:#82c9e8;font-family:ui-monospace,monospace}#${UI_ID} output{margin-left:auto;color:#b6d6e5;font-family:ui-monospace,monospace}
        #${UI_ID} input[type=range]{display:block;width:100%;height:16px;margin:5px 0 0;accent-color:#69bada}#${UI_ID} input[type=checkbox]{accent-color:#58a7cb}
        #${UI_ID} .am-check{display:flex;justify-content:space-between;align-items:center;padding:8px 2px;border-bottom:1px solid var(--line);font-size:11px}
        #${UI_ID} .am-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:5px 0 10px}#${UI_ID} .am-metric{padding:8px;background:#102536;border:1px solid #2c4759;border-radius:5px}#${UI_ID} .am-metric small{display:block;color:#93abba;font-size:9px}#${UI_ID} .am-metric b{display:block;margin-top:3px;font-size:12px}
        #${UI_ID} .am-note{padding:9px;margin:8px 0;background:#182b37;border:1px solid #3a5261;border-radius:6px;color:#b7cbd7;font-size:10px;line-height:1.55}
        #${UI_ID} .am-actions{display:flex;gap:7px;padding:9px 12px;border-top:1px solid var(--line)}#${UI_ID} .am-actions button{flex:1;padding:8px 5px;border:1px solid #42677d;border-radius:5px;background:#18374b;color:#e4f0f5;font-size:10px;font-weight:750}#${UI_ID} .am-actions button.primary{background:#245975}
        #${UI_ID} .am-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}#${UI_ID} .am-card{padding:8px;background:#102536;border:1px solid #2c4759;border-radius:6px;color:#b9ccd7;font-size:10px}#${UI_ID} .am-card b{display:block;color:#ddecf4;margin-bottom:3px}
        #${UI_ID} .am-presets{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}#${UI_ID} .am-presets button{padding:8px;background:#17364a;color:#e5f0f5;border:1px solid #3a5b70;border-radius:5px;font-size:10px}
        @media(max-width:520px){#${UI_ID}{left:6px;top:58px}#${UI_ID} .am-panel{width:calc(100vw - 12px);max-height:84vh}}
      </style>
      <button class="am-launch" data-open><span class="am-icon">AM</span><span>ATMOSPHERE MOD<br><small style="font-size:9px;color:#a9c0cd">GEOFS 4.0 PORT 1.6.1</small></span></button>
      <section class="am-panel" aria-label="AtmosphereMod GeoFS controls">
        <header class="am-head"><div class="am-top"><div><div class="am-title">ATMOSPHERE CONTROL</div><div class="am-sub">MSFS 0.8.0 TUNABLES · GEOFS 4.0 · 1.6.1 CONNECTED CLOUD OPTICS</div></div><div style="display:flex;align-items:center;gap:8px"><span class="am-badge warn" data-am-badge>CHECK</span><button class="am-close" data-close>×</button></div></div><div class="am-status" data-am-status>GeoFSの描画環境を確認しています</div></header>
        <div class="am-bar"><label><input type="checkbox" data-master> Mod 有効</label><label><input type="checkbox" data-T0> T0 Atmosphere</label><label><input type="checkbox" data-C0> C0 Clouds</label></div>
        <nav class="am-tabs"><button class="active" data-tab="overview">概要</button><button data-tab="haze">空・霞</button><button data-tab="clouds">雲</button><button data-tab="weather">気象物理</button><button data-tab="support">移植範囲</button></nav>
        <div class="am-content">
          <section class="am-page" data-page="overview">
            <div class="am-metrics"><div class="am-metric"><small>VISIBILITY</small><b data-metric="vis">—</b></div><div class="am-metric"><small>ALTITUDE</small><b data-metric="altitude">—</b></div><div class="am-metric"><small>CLOUD COVER</small><b data-metric="cover">—</b></div><div class="am-metric"><small>CLOUD BASE</small><b data-metric="base">—</b></div><div class="am-metric"><small>CLOUD TOP</small><b data-metric="top">—</b></div><div class="am-metric"><small>TEMP</small><b data-metric="temp">—</b></div><div class="am-metric"><small>DEW POINT</small><b data-metric="dew">—</b></div><div class="am-metric"><small>VOLUMETRIC</small><b data-metric="volume">—</b></div><div class="am-metric"><small>CAPE (EST.)</small><b data-metric="cape">—</b></div><div class="am-metric"><small>LCL</small><b data-metric="lcl">—</b></div><div class="am-metric"><small>WET BULB</small><b data-metric="wetbulb">—</b></div></div>
            <div class="am-note">天候入力：<span data-weather-source>未取得</span><br>数値予報が有効な場合は鉛直プロファイルを使用し、未取得時はGeoFSの集約気象値へ戻ります。</div>
            <div class="am-group-title">プロファイル</div><div class="am-presets"><button data-preset="default">MSFS Defaults</button><button data-preset="clear">Clear Air</button><button data-preset="maritime">Maritime</button><button data-preset="dusty">Dust / Haze</button></div>
            <div class="am-note">Ctrl + Shift + F9：Mod全体のON / OFF<br>Ctrl + Shift + F10：現在設定でシェーダー再構築</div>
          </section>
          <section class="am-page" data-page="haze" hidden>
            <div class="am-check"><span>T13 · GeoFS天候から霞量を推定</span><input type="checkbox" data-bool="T13"></div>
            <div class="am-check"><span>T8 · 薄明色・白色点の補正（近似）</span><input type="checkbox" data-bool="T8"></div>
            ${renderControls(CONTROL_GROUPS[0])}
            <label class="am-control"><span><b>T16</b> 天候連動霞の強度<output data-value="T16"></output></span><input type="range" data-setting="T16" min="0" max="2" step="0.05"></label>
            <label class="am-check"><span>C22 · 昼光ホワイトバランス（近似）</span><input type="checkbox" data-bool="C22"></label>
            <div class="am-group-title">レンズ光学 / Lens optics</div>
            <div class="am-check"><span>LG · 視線・太陽方位に追従するレンズゴースト</span><input type="checkbox" data-bool="LG"></div>
            <label class="am-control"><span><b>LGI</b> ゴースト・フレア強度 <output data-value="LGI"></output></span><input type="range" data-setting="LGI" min="0" max="1" step="0.01"></label>
            <div class="am-note">レンズゴーストは太陽のワールド方向をカメラ座標へ毎フレーム投影し、画面中心を通る光学軸上に複数の内部反射像を配置します。太陽が視野外へ離れる・地平線下へ沈むと減衰します。レンズコーティングや絞り羽根の固有データはGeoFSから取得できないため、一般的な多枚数レンズの近似です。</div>
            <div class="am-note">T8はMSFS版の95波長フィット値やオゾンLUTを移植したものではありません。GeoFSの色補正APIによる弱い色調整です。T14の緯度・季節別オゾンクライマトロジーも未移植です。</div>
          </section>
          <section class="am-page" data-page="clouds" hidden>
            <div class="am-group-title">雲の生成 / Layered cloud species</div>
            <div class="am-check"><span>CG · 手動で雲を生成（OFFでNWP / GeoFS天候へ追従）</span><input type="checkbox" data-bool="CG"></div>
            <label class="am-control"><span><b>CM</b> 雲種 <output data-value="CM"></output></span><input type="range" data-setting="CM" min="0" max="5" step="1"></label>
            <label class="am-control"><span><b>CC</b> 雲量 <output data-value="CC"></output></span><input type="range" data-setting="CC" min="0" max="1" step="0.01"></label>
            <label class="am-control"><span><b>CB</b> 雲底高度 <output data-value="CB"></output></span><input type="range" data-setting="CB" min="0" max="10000" step="100"></label>
            <label class="am-control"><span><b>CT</b> 雲頂高度 <output data-value="CT"></output></span><input type="range" data-setting="CT" min="1000" max="16000" step="100"></label>
            <label class="am-control"><span><b>IR</b> 水滴による彩雲（回折）<output data-value="IR"></output></span><input type="range" data-setting="IR" min="0" max="1" step="0.01"></label>
            <label class="am-control"><span><b>IF</b> 高層氷晶雲の割合<output data-value="IF"></output></span><input type="range" data-setting="IF" min="0" max="1" step="0.01"></label>
            <div class="am-presets">
              <button data-cloud-preset="mixed">混合雲</button><button data-cloud-preset="cumulus">積雲</button>
              <button data-cloud-preset="storm">積乱雲</button><button data-cloud-preset="stratocumulus">層積雲</button>
              <button data-cloud-preset="altocumulus">高積雲</button><button data-cloud-preset="cirrus">巻雲</button>
            </div>
            ${renderControls(CONTROL_GROUPS[1])}
            <div class="am-note">旧版の値ノイズFBM主体の起伏から、Voronoi型の3Dセルを使う連結ビロー場へ変更しました。粒子のような独立した点を並べず、細胞状の密度場を連続した雲体の内部で重ねることで、積雲の丸い塔・細かな波状の縁・小さな表面ふくらみを構成します。細部の最小スケールは密度サンプル間隔に応じて制限します。照明は水滴Mie前方散乱＋Henyey–Greenstein位相関数、太陽方向の光学深さ、雲内遮蔽、上向き密度差を用いた近似です。夕焼け色は太陽高度、波長ごとのRayleigh/Mie消散、視程、相対湿度によるエアロゾル吸湿成長、可降水量による弱い霞の変化から計算します。水蒸気を単純な赤色フィルターとして扱ってはいません。実測粒径分布・エアロゾル組成・完全な多重散乱ソルバーがないため、厳密な物理計算ではありません。セルラー場と追加の遮蔽サンプルでGPU負荷が増える可能性があります。</div>
          </section>
          <section class="am-page" data-page="weather" hidden>
            <div class="am-group-title">数値予報プロファイル / Numerical weather model</div>
            <div class="am-check"><span>NWP · 航空機位置の鉛直気象プロファイルを利用</span><input type="checkbox" data-bool="NWP"></div>
            <div class="am-actions" style="padding:0;border:0"><button data-nwp-refresh>予報データを今すぐ更新</button></div>
            <div class="am-note">データ状態：<span data-nwp-status>未取得</span><br>Open-Meteoの数値予報を使用します。送信する位置はGeoFS内の航空機座標で、端末のGPS位置は使用しません。無料APIの非商用条件・帰属表示に従ってください。<br><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo · CC BY 4.0</a></div>
            <div class="am-group-title">物理診断エンジン / Reduced-order weather physics</div>
            <div class="am-check"><span>WX · 熱力学・対流・降水相の物理診断</span><input type="checkbox" data-bool="WX"></div>
            ${renderControls(CONTROL_GROUPS[2])}
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
            <div class="am-grid"><div class="am-card"><b>独立スイッチ</b>T0 / C0：大気モデルと雲照明モデルを個別に切り替え</div><div class="am-card"><b>大気・霞（近似）</b>T1–T7, T9–T12：境界層、自由対流圏、粒子色、後方散乱、遠景の雲霞</div><div class="am-card"><b>天候連動（近似）</b>T13, T16：GeoFSの集約visibility / humidity / fog / precipitationを使う推定。METAR観測所補間ではありません</div><div class="am-card"><b>雲照明（近似）</b>C1–C7：前方散乱、多重散乱、雲内部光、Powder効果</div><div class="am-card"><b>雲種・構造（プロシージャル）</b>CM：連続3D密度場、複数スケールのビロー、平坦な雲底、変動する雲頂、風シアで流される積乱雲・かなとこ雲を近似</div><div class="am-card"><b>雲の光学</b>C1–C11 / IR / IF：水滴Mie前方散乱、内部多重散乱、Powder、彩雲回折、氷晶22度ハローを近似</div><div class="am-card"><b>色補正（近似）</b>T8, C22：GeoFS色補正API。MSFSの物理的なスペクトル補正と同等ではありません</div><div class="am-card"><b>熱力学診断（推定）</b>Magnus/Buck飽和水蒸気圧、湿球温度、LCL、乾燥・湿潤断熱、仮温度、CAPE/CIN、LFC/EL、凍結高度</div><div class="am-card"><b>力学診断（簡易）</b>GeoFS風層から鉛直シア、近傍地形勾配と風向から地形性上昇を推定</div><div class="am-card"><b>降水相</b>湿球温度で雨／雪を切り替え。雹・霰・凍雨の独立粒子系は未対応</div><div class="am-card"><b>雷光</b>NWPの雷ポテンシャル（取得可能時）・深い対流・混合相領域を組み合わせた雲内発光の近似。放電路・電荷分離は未実装</div><div class="am-card"><b>復元</b>ModをOFFにすると元のGeoFS GLSL文字列と大気APIへ戻します</div></div>
            <div class="am-group-title">MSFS専用で未移植</div><div class="am-note">${UNSUPPORTED.join(", ")}<br><br>DXIL/ReShadeのシェーダーパッチ、MSFSのEFB/SimConnect連携、8観測所のMETAR補間、METAR雲アンカー、機体影マップ、雲内視程、実気象に基づくCB/TCU発生予測、雷雨の気象場・降水粒子・電荷分離はGeoFSの同じAPI・描画データを持たないため、物理的な気象再現としては未実装です。積乱雲形状はプロシージャル近似です。</div>
            <div class="am-actions" style="padding:0;border:0"><button data-export>JSONを書き出す</button><button data-import>JSONを読み込む</button></div><input type="file" accept="application/json,.json" data-file hidden>
            <div class="am-note">GeoFS 4.0 Beta / Cesium 1.136向け。別ビルドではシェーダーフックの完全一致を再確認してから適用します。</div>
          </section>
        </div>
        <div class="am-actions"><button data-reset>初期値</button><button data-reapply>再適用</button><button class="primary" data-save>設定保存</button></div>
      </section>`;
    document.body.appendChild(root);
    state.root = root;

    const launch = root.querySelector("[data-open]");
    launch.addEventListener("click", () => root.classList.toggle("open"));
    root.querySelector("[data-close]").addEventListener("click", () => root.classList.remove("open"));
    root.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
      root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b === button));
      root.querySelectorAll("[data-page]").forEach(page => page.hidden = page.dataset.page !== button.dataset.tab);
    }));
    root.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
    root.querySelectorAll("[data-cloud-preset]").forEach(button => button.addEventListener("click", () => {
      Object.assign(S, CLOUD_PRESETS[button.dataset.cloudPreset] || CLOUD_PRESETS.mixed);
      syncUI(); scheduleRebuild(); saveSettings();
    }));
    root.querySelector("[data-master]").addEventListener("change", e => {
      state.masterEnabled = e.target.checked; syncUI(); scheduleRebuild();
    });
    root.querySelector("[data-T0]").addEventListener("change", e => { S.T0 = e.target.checked ? 1 : 0; syncUI(); scheduleRebuild(); });
    root.querySelector("[data-C0]").addEventListener("change", e => { S.C0 = e.target.checked ? 1 : 0; syncUI(); scheduleRebuild(); });
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
      if (!state.compatible) return updateStatus("対応シェーダーフックがないため再適用できません");
      scheduleRebuild(); updateStatus("シェーダーを再構築しています");
    });
    root.querySelector("[data-save]").addEventListener("click", () => { saveSettings(); updateStatus("設定をこのブラウザーに保存しました"); });
    root.querySelector("[data-nwp-refresh]").addEventListener("click", () => fetchNwpProfile(true));
    root.querySelector("[data-export]").addEventListener("click", exportProfile);
    root.querySelector("[data-import]").addEventListener("click", () => root.querySelector("[data-file]").click());
    root.querySelector("[data-file]").addEventListener("change", e => importProfile(e.target.files?.[0]));

    state.keyHandler = event => {
      if (!event.ctrlKey || !event.shiftKey || !["F9", "F10"].includes(event.code)) return;
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      event.preventDefault();
      if (event.code === "F9") state.masterEnabled = !state.masterEnabled;
      else scheduleRebuild();
      syncUI(); scheduleRebuild();
    };
    window.addEventListener("keydown", state.keyHandler);
    syncUI(); refreshMetrics();
  }

  function install() {
    const G = window.geofs, C = window.Cesium, sh = window.geofsShaders;
    if (!G || !C || !G.api?.viewer || !G.fx?.atmosphere || !sh) return false;
    if (Number.parseFloat(G.version) < 4) {
      console.error("[AtmosphereMod GeoFS] GeoFS 4.0 or later is required; current version:", G.version);
      return false;
    }
    const a = G.fx.atmosphere;
    if (typeof a.create !== "function" || typeof a.destroy !== "function" ||
        typeof sh["atmosphereCommon.glsl"] !== "string" ||
        typeof sh["volumetricCloudsFS.glsl"] !== "string") return false;

    state.geofs = G; state.Cesium = C; state.atmosphere = a; state.shaders = sh;
    state.physics = computeWeatherPhysics();
    state.original = {
      common: sh["atmosphereCommon.glsl"],
      clouds: sh["volumetricCloudsFS.glsl"],
      create: a.create, destroy: a.destroy, methods: { update: a.update, setConditions: a.setConditions },
      renderPrefs: {
        advancedAtmosphere: G.api.renderingSettings?.advancedAtmosphere,
        volumetricClouds: G.api.renderingSettings?.volumetricClouds
      }
    };

    // Probe every GLSL replacement before touching the live shader strings.
    buildAtmosphereShader();
    buildCloudShader();
    state.compatible = true;
    createUI();
    a.create = function (...args) {
      try { applyShaders(); }
      catch (error) { restoreShaders(); console.error("[AtmosphereMod GeoFS] Shader patch rejected", error); }
      const force = shouldForceClouds();
      setCloudRuntimeFlags(force);
      const result = state.original.create.apply(this, force ? createArgs() : args);
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
    if (a.postProcessingStages) rebuildAtmosphere();
    else if (createArgs()[0]) updateStatus("GeoFS大気ステージの初期化を待っています");
    updateColorModifiers();
    state.lastWeatherSignature = weatherSignature();
    state.physics = computeWeatherPhysics();
    state.lastPhysicsSignature = physicsSignature(state.physics);
    state.timer = setInterval(() => {
      if (state.destroyed) return;
      updateColorModifiers(); refreshMetrics();
      const next = weatherSignature();
      const physical = computeWeatherPhysics();
      const nextPhysics = physicsSignature(physical);
      const changed = next !== state.lastWeatherSignature || (S.WX && nextPhysics !== state.lastPhysicsSignature);
      state.physics = physical;
      if ((S.T13 || S.WX) && changed) {
        state.lastWeatherSignature = next;
        state.lastPhysicsSignature = nextPhysics;
        scheduleRebuild();
      }
      updateStatus();
    }, 5000);
    state.weatherHandler = () => { state.lastWeatherSignature = weatherSignature(); scheduleRebuild(); };
    window.addEventListener("geofsWeatherChange", state.weatherHandler);
    console.info(`[AtmosphereMod GeoFS] ${VERSION} loaded; GeoFS 4.0 shader hooks matched.`);
    return true;
  }

  function destroy(options = {}) {
    if (state.destroyed) return;
    state.destroyed = true;
    clearInterval(state.timer); clearInterval(state.waitTimer); clearInterval(state.nwpTimer); clearTimeout(state.rebuildTimer);
    if (state.keyHandler) window.removeEventListener("keydown", state.keyHandler);
    if (state.weatherHandler) window.removeEventListener("geofsWeatherChange", state.weatherHandler);
    restoreWeatherSet();
    removeLensGhostStage();
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
    const testAtmosphereEnabled = !!(state.masterEnabled && S.T0);
    const testCloudsEnabled = !!(state.masterEnabled && S.C0);
    if (window.__ATMOSPHEREMOD_GEOFS_TEST_API__) {
      state.geofs = { api: { ...(state.geofs?.api || {}), ...window.__ATMOSPHEREMOD_GEOFS_TEST_API__ } };
      updateColorModifiers();
    }
    window.__ATMOSPHEREMOD_GEOFS_TEST_RESULT__ = {
      common: (testAtmosphereEnabled || testCloudsEnabled)
        ? buildAtmosphereShader(testAtmosphereEnabled, testCloudsEnabled) : state.original.common,
      clouds: testCloudsEnabled ? buildCloudShader() : state.original.clouds,
      settings: { ...S },
      masterEnabled: state.masterEnabled,
      testWeatherPhysics(definition) { return computeWeatherPhysics(definition || {}); },
      testParseNwp(data, lat = 35.0, lon = 135.0, ground = 0) {
        const profile = parseNwpResponse(data, lat, lon, ground);
        state.nwpProfile = profile; S.NWP = 1; state.physics = computeWeatherPhysics();
        return profile;
      },
      testNwpPhysics() { return computeWeatherPhysics(); },
      testBuildCloudShader() { return buildCloudShader(); },
      testBuildCommonShader() { return buildAtmosphereShader(true, true); },
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
    S.CM = Math.round(clamp(S.CM, 0, 5));
    for (const key of ["T8", "T13", "C22", "T0", "C0", "CG", "WX", "NWP", "LG"]) if (key in patch) S[key] = patch[key] ? 1 : 0;
    if ("masterEnabled" in patch) state.masterEnabled = !!patch.masterEnabled;
    syncUI(); scheduleRebuild();
    if (S.NWP) fetchNwpProfile(true);
  };
  state.getSettings = () => ({ ...S, masterEnabled: state.masterEnabled });
  state.getCapabilities = () => ({ geoFSVersion: state.geofs?.version, implemented: [...IMPLEMENTED], approximated: [...APPROXIMATED], unsupported: [...UNSUPPORTED], weatherPhysics: ["Open-Meteo 12-level temperature/dewpoint/RH/wind/cloud profile", "profile-interpolated parcel CAPE/CIN/LFC/EL estimate", "forecast model CAPE/CIN cross-check", "freezing level", "wind shear diagnostic", "orographic lift estimate", "rain/snow phase selection", "mixed-phase cloud weighting", "in-cloud lightning flash approximation", "multi-layer cloud pressure-level mask"], opticalLimitations: ["connected cellular billow density field is a volumetric morphology approximation, not individually resolved cloud droplets", "sunset uses wavelength-dependent Rayleigh extinction, visibility-derived Mie aerosol optical depth and humidity-driven hygroscopic growth; precipitable water is only a weak diffuse-veiling input", "lens ghost is projected from the world-space Sun into camera view and uses a generic multi-element lens model with weak chromatic dispersion; no measured camera/lens prescription is available"], weatherPhysicsLimitations: ["forecast pressure-level profile is coarse and not a true local radiosonde; no full native 3D gridded weather volume", "no 3D mass-conserving atmosphere", "no cloud microphysics bins", "no hail/graupel/frozen-rain particle solver", "no electric charge transport or lightning channel geometry"], compatible: state.compatible });
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
