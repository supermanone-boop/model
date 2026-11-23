/*
 * AtmosphereMod GeoFS 4.0 port 1.0.0
 * Reimplementation of portable AtmosphereMod 0.8.0 concepts for the
 * GeoFS 4.0 / Cesium 1.136 atmosphere + volumetric-cloud shader pipeline.
 *
 * Important: MSFS ReShade/DXIL binaries, SimConnect/Coherent EFB interfaces,
 * MSFS weather-volume generation and MSFS shadow-map data are not compatible
 * with GeoFS. This port patches GeoFS GLSL source strings only.
 */
(() => {
  "use strict";

  const VERSION = "1.0.0-gf4";
  const GLOBAL_KEY = "__ATMOSPHEREMOD_GEOFS_100__";
  const STORAGE_KEY = "atmospheremod.geofs.100.settings";
  const UI_ID = "amgfs100-root";
  const MODIFIER_ID = "atmospheremod-geofs-100";
  const MASTER_KEY = "atmospheremod.geofs.100.enabled";
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
    C16: 0.85, C17: 0.82, C18: 0, C19: 1.15, C28: 0.82, C29: 360, C30: 0.018, C31: 420,
    C22: 1,
    CG: 1, CC: 0.62, CB: 250, CT: 14500,
    CM: 0, IR: 0.78, IF: 0.68
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
    C31: [0, 1500],
    CC: [0, 1], CB: [0, 10000], CT: [500, 16000], CM: [0, 5], IR: [0, 1], IF: [0, 1]
  });

  const PRESETS = {
    default: { ...DEFAULTS },
    clear: {
      T1: 1.1, T2: 0.12, T3: 1.2, T4: 0.2, T5: 2.0, T6: 0.02,
      T7: 0.05, T8: 1, T9: 0.72, T10: 1.3, T11: 1, T12: 1, T13: 1, T16: 0.7,
      C1: 0.97, C2: 0.25, C3: 0.24, C4: 0.34, C5: 0.045, C6: 0.28,
      C7: 150, C8: 0.2, C9: 0, C10: 10, C11: 0.08,
      C16: 0.45, C17: 0.85, C18: 0, C19: 1.0, C28: 0.8, C29: 300, C30: 0.008, C31: 550, C22: 1
    },
    maritime: {
      T1: 1.8, T2: 0.28, T3: 3.2, T4: 0.8, T5: 3.4, T6: 0,
      T7: 0.06, T8: 1, T9: 0.76, T10: 0.3, T11: 1, T12: 1, T13: 1, T16: 1,
      C1: 0.95, C2: 0.32, C3: 0.34, C4: 0.36, C5: 0.06, C6: 0.36,
      C7: 190, C8: 0.3, C9: 0, C10: 10, C11: 0.08,
      C16: 0.65, C17: 0.78, C18: 0, C19: 1.1, C28: 0.9, C29: 320, C30: 0.01, C31: 600, C22: 1
    },
    dusty: {
      T1: 2.8, T2: 0.45, T3: 7.5, T4: 1.1, T5: 4.5, T6: 0.55,
      T7: 0.18, T8: 1, T9: 0.62, T10: 0.4, T11: 1, T12: 1, T13: 1, T16: 1.15,
      C1: 0.94, C2: 0.38, C3: 0.28, C4: 0.34, C5: 0.055, C6: 0.32,
      C7: 170, C8: 0.3, C9: 0, C10: 10, C11: 0.08,
      C16: 0.6, C17: 0.78, C18: 0, C19: 1.15, C28: 0.88, C29: 320, C30: 0.01, C31: 600, C22: 1
    }
  };

  const CLOUD_MODES = ["混合雲", "積雲", "積乱雲", "層積雲", "高積雲", "巻雲"];
  const CLOUD_PRESETS = {
    mixed: { CM: 0, CC: 0.62, CB: 250, CT: 14500, IR: 0.78, IF: 0.68, C10: 10, C11: 0.08 },
    cumulus: { CM: 1, CC: 0.48, CB: 700, CT: 7800, IR: 0.35, IF: 0.30, C10: 10, C11: 0.08 },
    storm: { CM: 2, CC: 0.86, CB: 250, CT: 15800, IR: 0.15, IF: 0.85, C10: 13, C11: 0.10, C16: 1.35, C3: 0.46, C6: 0.48 },
    stratocumulus: { CM: 3, CC: 0.72, CB: 250, CT: 6200, IR: 0.25, IF: 0.18, C10: 11, C11: 0.09 },
    altocumulus: { CM: 4, CC: 0.58, CB: 1800, CT: 10500, IR: 0.58, IF: 0.42, C10: 9, C11: 0.08 },
    cirrus: { CM: 5, CC: 0.55, CB: 6200, CT: 16000, IR: 0.42, IF: 0.95, C10: 6, C11: 0.06 }
  };

  const IMPLEMENTED = ["T0", "C0"];
  const APPROXIMATED = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T16",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
    "C16", "C17", "C18", "C19", "C22", "C28", "C29", "C30", "C31", "CM", "IR", "IF"
  ];
  const UNSUPPORTED = [
    "T14", "T15", "C12", "C20", "C21",
    "C23", "C24", "C25", "C26", "C27", "C32", "C33", "C34", "C36", "C37"
  ];

  let old = window[GLOBAL_KEY];
  if (old && typeof old.destroy === "function") {
    try { old.destroy({ silent: true }); } catch (e) { console.warn(e); }
  }
  for (const legacyKey of ["__ATMOSPHEREMOD_GEOFS_093__", "__ATMOSPHEREMOD_GEOFS_092__", "__ATMOSPHEREMOD_GEOFS_091__", "__ATMOSPHEREMOD_GEOFS_090__", "__ATMOSPHEREMOD_GEOFS_081__", "__ATMOSPHEREMOD_GEOFS_080__"]) {
    try { if (window[legacyKey]?.destroy) window[legacyKey].destroy({ silent: true }); } catch (_) {}
  }
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
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.093.settings") || "{}"); } catch (_) {}
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
    const value = { ...DEFAULTS, ...saved };
    for (const [k, range] of Object.entries(LIMITS)) value[k] = clamp(finite(value[k], DEFAULTS[k]), range[0], range[1]);
    for (const k of ["T0", "C0", "T8", "T13", "C22", "CG"]) value[k] = value[k] ? 1 : 0;
    value.CM = Math.round(clamp(value.CM, 0, 5));
    return value;
  }

  function loadMasterEnabled() {
    const current = localStorage.getItem(MASTER_KEY);
    const v093 = localStorage.getItem("atmospheremod.geofs.093.enabled");
    const previous = localStorage.getItem("atmospheremod.geofs.091.enabled");
    const legacy = localStorage.getItem("atmospheremod.geofs.090.enabled");
    return (current === null ? (v093 !== null ? v093 : (previous === null ? legacy : previous)) : current) !== "false";
  }

  const state = {
    settings: loadSettings(), masterEnabled: loadMasterEnabled(),
    geofs: null, Cesium: null, atmosphere: null, shaders: null, original: null,
    root: null, compatible: false, applied: false, destroyed: false,
    timer: 0, waitTimer: 0, rebuildTimer: 0, lastWeatherSignature: "",
    lastColorSignature: "", lastStatus: "", keyHandler: null, weatherHandler: null
  };
  const S = state.settings;

  function weatherObject() {
    return window.weather && window.weather.definition ? window.weather : null;
  }

  function weatherMetrics() {
    const w = weatherObject();
    const d = w?.definition || {};
    const visibility = clamp(finite(d.visibility, 10000), 500, 100000);
    const temp = finite(d.airTemperatureSL, 15);
    const dew = finite(d.dewPointSL, finite(d.dewPoint, temp - 7));
    // GeoFS supplies sea-level temperature and dew point in degrees Celsius.
    // Use a saturation-vapour-pressure ratio rather than a linear dew-point spread.
    const humidity = clamp(Math.exp(
      (17.625 * dew) / (243.04 + dew) -
      (17.625 * temp) / (243.04 + temp)
    ), 0, 1);
    const visFactor = clamp(Math.pow(10000 / visibility, 0.45), 0.62, 1.7);
    const humidityFactor = 0.76 + humidity * 0.38;
    const fogFactor = 1 + clamp(finite(d.fogDensity, 0), 0, 1) * 0.25;
    const precipFactor = 1 + clamp(finite(d.precipitationAmount, 0), 0, 1) * 0.12;
    const raw = visFactor * humidityFactor * fogFactor * precipFactor;
    const linked = S.T13 ? clamp(raw * S.T16, 0.45, 2.2) : 1;
    return { visibility, humidity, factor: linked, raw, temperature: temp, dewPoint: dew, definition: d };
  }

  function weatherSignature() {
    const m = weatherMetrics(), d = m.definition;
    return [
      Math.round(m.visibility / 250) * 250,
      Math.round(m.humidity * 20) / 20,
      Math.round(finite(d.fogDensity, 0) * 20) / 20,
      Math.round(finite(d.precipitationAmount, 0) * 20) / 20,
      Math.round(finite(d.cloudBase, 0) / 100) * 100,
      Math.round(finite(d.cloudTop, 0) / 100) * 100
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
    const start = source.indexOf(startToken);
    if (start < 0 || source.indexOf(startToken, start + startToken.length) >= 0) {
      throw new Error("GeoFS cloudDensity function hook mismatch");
    }
    const end = source.indexOf(endToken, start);
    if (end < 0) throw new Error("GeoFS cloudDensity end marker mismatch");
    const w = cloudModeWeights();
    const highFadeTop = S.C18 > 0 ? S.C18 : 6000;
    const profile = `
float cloudDensity(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage) {
  const mat3 OCT_ROT = mat3( 0.00,  0.80,  0.60,
                            -0.80,  0.36, -0.48,
                            -0.60, -0.48,  0.64);
  float height = length(p) - realPlanetRadius;
  heightRatio = (height - cloudBase) / max(cloudThickness, 1.0);
  if (finalCoverage <= 0.015 || heightRatio < 0.0 || heightRatio > 1.0) return 0.0;

  // Stable world-space field. Wind moves the field without changing cloud altitude.
  vec3 q = p * 0.002 + wind;
  float nMacro = noise(q * 0.014 + vec3(11.7, 3.1, 6.4));
  float nMeso  = noise(q * 0.045 + vec3(4.3, 19.1, 2.7));
  float nMicro = noise(q * 0.12  + vec3(17.1, 4.7, 29.3));
  float nShape = noise(q * 0.28  + vec3(5.3, 16.1, 9.7));
  float nFine = nShape;
  if (lod > 0.35) nFine = noise(q * (${fmt(500 / Math.max(150, S.C31), 7)}) + vec3(23.1, 8.7, 14.2));

  // Independent horizontal masks give each cloud family its own spacing and scale.
  float threshold = 1.0 - finalCoverage;
  float feather = mix(0.055, 0.13, 1.0 - finalCoverage);
  float scField = nMacro * 0.64 + nMeso * 0.36;
  float cuField = nMacro * 0.52 + nMeso * 0.48;
  float acField = nMeso * 0.38 + nMicro * 0.62;
  vec3 cirrusQ = OCT_ROT * q;
  float ciField = noise(cirrusQ * vec3(0.022, 0.11, 0.045) + vec3(3.7, 17.2, 8.3)) * 0.68
                + noise(cirrusQ * vec3(0.040, 0.19, 0.075) + vec3(15.4, 2.8, 21.1)) * 0.32;
  float scMask = smoothstep(threshold - feather, threshold + feather, scField);
  float cuMask = smoothstep(threshold - feather * 0.82, threshold + feather * 0.82, cuField);
  float acMask = smoothstep(threshold - feather * 0.92, threshold + feather * 0.92, acField);
  float ciMask = smoothstep(threshold - feather * 1.12, threshold + feather * 1.12, ciField);

  // Altitude profiles: low stratocumulus, rising cumulus, mid-level altocumulus, high cirrus.
  float hr = heightRatio;
  float scProfile = smoothstep(0.006, 0.045, hr) * (1.0 - smoothstep(0.155, 0.285, hr));
  float cuProfile = smoothstep(0.012, 0.095, hr) * (1.0 - smoothstep(0.44, 0.72, hr));
  float acProfile = smoothstep(0.255, 0.365, hr) * (1.0 - smoothstep(0.58, 0.75, hr));
  float ciProfile = smoothstep(0.58, 0.72, hr) * (1.0 - smoothstep(0.91, 1.0, hr));

  // Reuse spatial octaves for body detail; only near LOD receives the finest octave.
  float scTexture = nMeso * 0.58 + nMicro * 0.30 + nShape * 0.12;
  float cuTexture = nMicro * 0.48 + nShape * 0.34 + nFine * 0.18;
  float acTexture = nMicro * 0.58 + nShape * 0.42;
  float ciTexture = noise(cirrusQ * vec3(0.03, 0.16, 0.06) + vec3(9.1, 4.8, 12.7)) * 0.72
                  + noise(cirrusQ * vec3(0.05, 0.27, 0.10) + vec3(20.3, 11.4, 3.5)) * 0.28;

  // Broken low cloud decks with a lumpy top rather than a featureless sheet.
  float scBody = scProfile * scMask;
  float scDensity = max(scBody * (1.12 + 0.48 * scTexture) - (1.0 - scTexture) * 0.12 - 0.05, 0.0)
                  * ${fmt(w.sc, 4)};

  // Convective cumulus: broad lower body, rounded turrets and eroded edges.
  float cuBody = cuProfile * cuMask;
  float cuErosion = 0.14 + 0.30 * (1.0 - cuTexture) + ${fmt(S.C30, 5)} * (1.0 - nFine) * 1.2;
  float cuDensity = max(cuBody * (1.25 + 0.38 * cuTexture) - cuErosion, 0.0)
                  * ${fmt(w.cu, 4)};

  // Mid-level cloudlets with smaller spacing and a softer optical body.
  float acBody = acProfile * acMask;
  float acDensity = max(acBody * (0.95 + 0.52 * acTexture) - (1.0 - acTexture) * 0.20 - 0.04, 0.0)
                  * ${fmt(w.ac, 4)};

  // High ice cloud is elongated along the rotated field and kept optically thin.
  float ciBody = ciProfile * ciMask;
  float ciDensity = max(ciBody * (0.50 + 0.72 * ciTexture) - (1.0 - ciTexture) * 0.18 - 0.025, 0.0)
                  * ${fmt(w.ci, 4)} * ${fmt(S.IF, 4)};

  // Deep convective columns; the native tower function supplies cell and anvil geometry.
  float towerCellSize = clamp(cloudThickness * 1.25, 2600.0, 9000.0);
  vec3 towerQ = normalize(p) * (realPlanetRadius / towerCellSize) + wind / (0.002 * towerCellSize);
  float towerRegion = smoothstep(0.10, 0.90, noise(q * 0.035 + vec3(8.1, 2.7, 18.4)));
  float towerChance = saturate(finalCoverage) * mix(0.045, 0.34, towerRegion) * ${fmt(w.storm, 4)};
  bool towerPossible = towerChance > 0.003 && hash3(floor(towerQ), 0.0).x <= towerChance;
  float towerDensity = 0.0;
  if (towerPossible) {
    float towerNoise = noise(q * 0.30);
    float towerMass = towerField(towerQ, hr, towerChance, towerNoise, finalCoverage, cloudThickness);
    towerDensity = max(towerMass * ${fmt(w.storm > 0.8 ? 1.82 : 1.42, 3)} - 0.10, 0.0);
  }

  // Overlap species so a thunderhead can merge into its low cloud base.
  float convectiveDensity = max(cuDensity, towerDensity);
  float d = max(max(scDensity, acDensity), max(ciDensity, convectiveDensity));
  float coarse = max(max(scBody, cuBody), max(acBody, ciBody));
  float farDensity = max(d, coarse * 0.22);
  d = mix(farDensity, d, smoothstep(0.0, 1.0, lod));

  // Flat cloud bases, denser cores and gradual high-cloud fade.
  float baseTransition = max(100.0, ${fmt(S.C29, 2)});
  float baseFade = smoothstep(0.0, baseTransition, height - cloudBase);
  d *= mix(1.0, baseFade, ${fmt(S.C28 * 0.72, 5)});
  float profileExponent = mix(1.08, 0.78, ${fmt(S.C17, 5)});
  d = pow(max(d, 0.0), profileExponent);
  float core = smoothstep(0.18, 0.90, d);
  d *= 1.0 + ${fmt(S.C16 * 0.24, 5)} * core;
  float highFade = smoothstep(${fmt(highFadeTop - 2200, 2)}, ${fmt(highFadeTop, 2)}, height);
  d = mix(d, d * ${fmt(S.C19 > 0 ? S.C19 : 1.0, 5)}, highFade * smoothstep(0.45, 0.82, hr));
  d = pow(max(d, 0.0), 1.0 + ${fmt(S.C8 * 0.035, 5)});
  return clamp(d, 0.0, 2.5);
}`
    return source.slice(0, start) + profile + source.slice(end + 2);
  }

  function buildAtmosphereShader(enableAtmosphere = !!S.T0, enableClouds = !!S.C0) {
    let shader = state.original.common;

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
      shader = replaceExactly(shader,
        "float stormIntensity = saturate((cover - 0.5) * 2.0) * smoothstep(1000.0, 3000.0, thickness);",
        "float stormIntensity = saturate((cover - 0.32) * 1.45) * smoothstep(1800.0, 3500.0, thickness);",
        "cumulonimbus updraft / anvil strength");
      shader = replaceExactly(shader,
        "float anvilFlare = pow(anvilProgress, 2.5) * mix(1.5, 3.5, stormIntensity);",
        "float anvilFlare = pow(anvilProgress, 1.9) * mix(1.6, 4.0, stormIntensity);",
        "cumulonimbus anvil spread");
      shader = replaceExactly(shader,
        "float wave = hn * 12.0 + r0.z * 40.0;",
        "float wave = hn * 15.0 + r0.z * 40.0;",
        "cumulonimbus cauliflower billow frequency");
    }
    return shader;
  }

  function buildCloudShader() {
    let shader = state.original.clouds;
    shader = replaceExactly(shader, "float distanceToFirstCloud = 0.0;",
      "float distanceToFirstCloud = 0.0;\nfloat amFirstCloudHeightRatio = 0.0;", "capture first cloud altitude");
    shader = replaceExactly(shader, "distanceToFirstCloud = distance;",
      "distanceToFirstCloud = distance;\namFirstCloudHeightRatio = heightRatio;", "store first cloud altitude");
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
    shader = replaceExactly(shader, "float extinctionCoeff = 0.01 * dens;",
      `float extinctionCoeff = 0.01 * dens * clamp(10.0 / ${fmt(droplet, 4)}, 0.45, 2.5);`, "water-droplet extinction");

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

    const lightNeedle = "vec3 lightTerm = sunScatteringPhase * sunLight + ambientScatteringPhase * ambientLight;";
    const lightReplacement = `float amDeepCloudLight = mix(1.0, ${fmt(deepLight / 0.033, 5)}, clamp(1.0 - transmitance, 0.0, 1.0) * 0.25);
vec3 lightTerm = sunScatteringPhase * sunLight * (1.0 - ${fmt(bounceShare * 0.35, 5)}) + ambientScatteringPhase * ambientLight * (1.0 + ${fmt(bounceShare, 5)}) * amDeepCloudLight;`;
    shader = replaceExactly(shader, lightNeedle, lightReplacement, "cloud bounced illumination");

    const powderNeedle = "cloud.rgb += cloud.a * 15.0 * lightTerm * (1.0 - stepT);";
    const powderReplacement = `float amPowderBuild = 1.0 - exp(-dens * marchStep / ${fmt(powderDepth, 2)});
float amPowderBack = 1.0 - smoothstep(-0.15, 0.72, dotLightRay);
float amPowderTerm = amPowderBuild * (1.0 - transmitance) * ${fmt(powder, 5)} * amPowderBack;
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
cloud.rgb += (amIridescentTint * 0.12 + vec3(0.72, 0.82, 1.0) * amIriBroad * 0.035) * amThinCloudMask * ${fmt(iridescence, 5)};
float amSilverLining = pow(max(amSolarCos, 0.0), 9.0) * amThinCloudMask;
cloud.rgb += vec3(1.0, 0.91, 0.76) * amSilverLining * 0.045;

// Subtle ice-crystal halo around the Sun, weighted by the high-cloud ice setting.
float amHaloAngle = 22.0 * 0.01745329252;
float amHaloWidth = 0.009 + ${fmt(S.IF * 0.004, 6)};
float amIceHalo = exp(-pow((amSolarAngle - amHaloAngle) / amHaloWidth, 2.0));
float amHighCloudHint = smoothstep(0.58, 0.78, amFirstCloudHeightRatio) * smoothstep(0.18, 0.48, amCloudOpacity) * (1.0 - smoothstep(0.88, 0.99, amCloudOpacity));
cloud.rgb += vec3(0.72, 0.82, 1.0) * amIceHalo * amHighCloudHint * ${fmt(S.IF * 0.045, 5)};
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

  function shouldForceClouds() {
    return !!(state.masterEnabled && S.C0 && S.CG);
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
    const nativeBase = clamp(finite(d.cloudBase, 1000), 0, 15000);
    const nativeTop = Math.max(nativeBase + 500, clamp(finite(d.cloudTop, nativeBase + 3000), 500, 16000));
    const base = S.CG ? clamp(S.CB, 0, 10000) : nativeBase;
    const top = S.CG ? clamp(Math.max(S.CT, base + 500), base + 500, 16000) : nativeTop;
    const cover = S.CG ? clamp(S.CC, 0, 1)
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
      if (a.postProcessingStages && typeof state.original.destroy === "function") {
        state.original.destroy.call(a);
      }
      applyShaders();
      setCloudRuntimeFlags(shouldForceClouds());
      state.original.create.apply(a, args);
      applyCloudWeatherOverride();
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
        if (a.postProcessingStages && state.original.destroy) state.original.destroy.call(a);
        state.original.create.apply(a, args);
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
    return `GeoFS 4.0 · ${CLOUD_MODES[Math.round(S.CM)]} · 層別ボリューム雲を適用`;
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

  function heightText(v) { return Number.isFinite(Number(v)) ? `${Math.round(Number(v)).toLocaleString()} m` : "—"; }
  function distanceText(v) { if (!Number.isFinite(Number(v))) return "—"; const km = Number(v) / 1000; return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`; }

  function refreshMetrics() {
    if (!state.root) return;
    const w = weatherObject(), d = w?.definition || {};
    const loc = state.geofs?.aircraft?.instance?.llaLocation;
    const cloud = liveCloudStats();
    const metrics = {
      vis: distanceText(finite(d.visibility, NaN)),
      altitude: Number.isFinite(Number(loc?.[2])) ? heightText(loc[2]) : "—",
      cover: Number.isFinite(cloud.cover) ? `${Math.round(clamp(cloud.cover, 0, 1) * 100)}%` : "—",
      base: Number.isFinite(cloud.base) ? heightText(cloud.base) : "—",
      top: Number.isFinite(cloud.top) ? heightText(cloud.top) : "—",
      temp: Number.isFinite(Number(d.airTemperatureSL)) ? `${Number(d.airTemperatureSL).toFixed(1)} °C` : "—",
      dew: Number.isFinite(Number(d.dewPointSL)) ? `${Number(d.dewPointSL).toFixed(1)} °C` : "—",
      volume: cloud.volumetric && cloud.stageReady ? "ON" : cloud.volumetric ? "WAIT" : "OFF"
    };
    for (const [key, value] of Object.entries(metrics)) {
      const el = state.root.querySelector(`[data-metric="${key}"]`);
      if (el) el.textContent = value;
    }
    const src = state.root.querySelector("[data-weather-source]");
    if (src) src.textContent = S.CG ? "AtmosphereMod manual cloud deck" : w ? "GeoFS weather.definition（集約値）" : "未取得";
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
      ["C31", "細かいビローのスケール", 0, 1500, 10, "m"]
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
        C29: "300 m (標準値)", C31: "350 m (標準値)"
      };
      if (zeroDefaults[key]) return zeroDefaults[key];
    }
    if (["T1", "T2", "T5"].includes(key)) return `${Number(value).toFixed(2)} km`;
    if (["C7", "C18", "C29", "C31", "CB", "CT"].includes(key)) return `${Math.round(value)} m`;
    if (key === "CC") return `${Math.round(value * 100)}%`;
    if (key === "CM") return CLOUD_MODES[Math.round(value)] || "Mixed sky";
    if (key === "IR" || key === "IF") return `${Math.round(value * 100)}%`;
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
      source: "AtmosphereMod MSFS 0.8.0 tunables mapped to GeoFS 4.0",
      exportedAt: new Date().toISOString(), masterEnabled: state.masterEnabled,
      settings: { ...S }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "AtmosphereMod-GeoFS-1.0.0-profile.json";
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
      for (const key of ["T0", "C0", "T8", "T13", "C22", "CG"]) if (key in incoming) S[key] = incoming[key] ? 1 : 0;
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
      <button class="am-launch" data-open><span class="am-icon">AM</span><span>ATMOSPHERE MOD<br><small style="font-size:9px;color:#a9c0cd">GEOFS 4.0 PORT 1.0.0</small></span></button>
      <section class="am-panel" aria-label="AtmosphereMod GeoFS controls">
        <header class="am-head"><div class="am-top"><div><div class="am-title">ATMOSPHERE CONTROL</div><div class="am-sub">MSFS 0.8.0 TUNABLES · GEOFS 4.0 · 1.0.0 CLOUD ENGINE</div></div><div style="display:flex;align-items:center;gap:8px"><span class="am-badge warn" data-am-badge>CHECK</span><button class="am-close" data-close>×</button></div></div><div class="am-status" data-am-status>GeoFSの描画環境を確認しています</div></header>
        <div class="am-bar"><label><input type="checkbox" data-master> Mod 有効</label><label><input type="checkbox" data-T0> T0 Atmosphere</label><label><input type="checkbox" data-C0> C0 Clouds</label></div>
        <nav class="am-tabs"><button class="active" data-tab="overview">概要</button><button data-tab="haze">空・霞</button><button data-tab="clouds">雲</button><button data-tab="support">移植範囲</button></nav>
        <div class="am-content">
          <section class="am-page" data-page="overview">
            <div class="am-metrics"><div class="am-metric"><small>VISIBILITY</small><b data-metric="vis">—</b></div><div class="am-metric"><small>ALTITUDE</small><b data-metric="altitude">—</b></div><div class="am-metric"><small>CLOUD COVER</small><b data-metric="cover">—</b></div><div class="am-metric"><small>CLOUD BASE</small><b data-metric="base">—</b></div><div class="am-metric"><small>CLOUD TOP</small><b data-metric="top">—</b></div><div class="am-metric"><small>TEMP</small><b data-metric="temp">—</b></div><div class="am-metric"><small>DEW POINT</small><b data-metric="dew">—</b></div><div class="am-metric"><small>VOLUMETRIC</small><b data-metric="volume">—</b></div></div>
            <div class="am-note">天候入力：<span data-weather-source>未取得</span><br>GeoFSが公開する集約weather.definitionを使います。MSFS版の観測所別METARデータを直接受け取る機能とは異なります。</div>
            <div class="am-group-title">プロファイル</div><div class="am-presets"><button data-preset="default">MSFS Defaults</button><button data-preset="clear">Clear Air</button><button data-preset="maritime">Maritime</button><button data-preset="dusty">Dust / Haze</button></div>
            <div class="am-note">Ctrl + Shift + F9：Mod全体のON / OFF<br>Ctrl + Shift + F10：現在設定でシェーダー再構築</div>
          </section>
          <section class="am-page" data-page="haze" hidden>
            <div class="am-check"><span>T13 · GeoFS天候から霞量を推定</span><input type="checkbox" data-bool="T13"></div>
            <div class="am-check"><span>T8 · 薄明色・白色点の補正（近似）</span><input type="checkbox" data-bool="T8"></div>
            ${renderControls(CONTROL_GROUPS[0])}
            <label class="am-control"><span><b>T16</b> 天候連動霞の強度<output data-value="T16"></output></span><input type="range" data-setting="T16" min="0" max="2" step="0.05"></label>
            <label class="am-check"><span>C22 · 昼光ホワイトバランス（近似）</span><input type="checkbox" data-bool="C22"></label>
            <div class="am-note">T8はMSFS版の95波長フィット値やオゾンLUTを移植したものではありません。GeoFSの色補正APIによる弱い色調整です。T14の緯度・季節別オゾンクライマトロジーも未移植です。</div>
          </section>
          <section class="am-page" data-page="clouds" hidden>
            <div class="am-group-title">雲の生成 / Layered cloud species</div>
            <div class="am-check"><span>CG · 手動で雲を生成（OFFでGeoFS天候へ追従）</span><input type="checkbox" data-bool="CG"></div>
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
            <div class="am-note">雲密度場を作り直し、低層の層積雲、中層の積雲・高積雲、高層の巻雲を別々の高度帯とノイズ場で重ねます。積乱雲は鉛直セル・風による傾き・上部のかなとこ形状を使用します。水滴径による前方散乱・減衰と、太陽近傍の回折色を追加します。彩雲は鏡面反射ではなく、水滴の回折を近似しています。氷晶の22度ハローも簡易近似です。GeoFSの画質設定は上書きしません。高密度の雲描画はGPU負荷が増えるため、画質を上げすぎるとフレームレートが低下する場合があります。</div>
          </section>
          <section class="am-page" data-page="support" hidden>
            <div class="am-group-title">GeoFSで実装する項目</div>
            <div class="am-grid"><div class="am-card"><b>独立スイッチ</b>T0 / C0：大気モデルと雲照明モデルを個別に切り替え</div><div class="am-card"><b>大気・霞（近似）</b>T1–T7, T9–T12：境界層、自由対流圏、粒子色、後方散乱、遠景の雲霞</div><div class="am-card"><b>天候連動（近似）</b>T13, T16：GeoFSの集約visibility / humidity / fog / precipitationを使う推定。METAR観測所補間ではありません</div><div class="am-card"><b>雲照明（近似）</b>C1–C7：前方散乱、多重散乱、雲内部光、Powder効果</div><div class="am-card"><b>雲種・構造（プロシージャル）</b>CM：層積雲・積雲・積乱雲・高積雲・巻雲を別高度帯で生成。塔状セル、風シア、かなとこ雲を近似</div><div class="am-card"><b>雲の光学</b>C1–C11 / IR / IF：水滴Mie前方散乱、内部多重散乱、Powder、彩雲回折、氷晶22度ハローを近似</div><div class="am-card"><b>色補正（近似）</b>T8, C22：GeoFS色補正API。MSFSの物理的なスペクトル補正と同等ではありません</div><div class="am-card"><b>復元</b>ModをOFFにすると元のGeoFS GLSL文字列と大気APIへ戻します</div></div>
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
      S[input.dataset.bool] = input.checked ? 1 : 0; syncUI(); scheduleRebuild();
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
      Object.assign(S, DEFAULTS); state.masterEnabled = true; syncUI(); scheduleRebuild();
    });
    root.querySelector("[data-reapply]").addEventListener("click", () => {
      if (!state.compatible) return updateStatus("対応シェーダーフックがないため再適用できません");
      scheduleRebuild(); updateStatus("シェーダーを再構築しています");
    });
    root.querySelector("[data-save]").addEventListener("click", () => { saveSettings(); updateStatus("設定をこのブラウザーに保存しました"); });
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

    if (a.postProcessingStages) rebuildAtmosphere();
    else if (createArgs()[0]) updateStatus("GeoFS大気ステージの初期化を待っています");
    updateColorModifiers();
    state.lastWeatherSignature = weatherSignature();
    state.timer = setInterval(() => {
      if (state.destroyed) return;
      updateColorModifiers(); refreshMetrics();
      const next = weatherSignature();
      if (S.T13 && next !== state.lastWeatherSignature) {
        state.lastWeatherSignature = next;
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
    clearInterval(state.timer); clearInterval(state.waitTimer); clearTimeout(state.rebuildTimer);
    if (state.keyHandler) window.removeEventListener("keydown", state.keyHandler);
    if (state.weatherHandler) window.removeEventListener("geofsWeatherChange", state.weatherHandler);
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
    for (const key of ["T8", "T13", "C22", "T0", "C0", "CG"]) if (key in patch) S[key] = patch[key] ? 1 : 0;
    if ("masterEnabled" in patch) state.masterEnabled = !!patch.masterEnabled;
    syncUI(); scheduleRebuild();
  };
  state.getSettings = () => ({ ...S, masterEnabled: state.masterEnabled });
  state.getCapabilities = () => ({ geoFSVersion: state.geofs?.version, implemented: [...IMPLEMENTED], approximated: [...APPROXIMATED], unsupported: [...UNSUPPORTED], compatible: state.compatible });
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
