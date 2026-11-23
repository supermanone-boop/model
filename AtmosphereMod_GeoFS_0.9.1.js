/*
 * AtmosphereMod GeoFS 4.0 port 0.9.1
 * Reimplementation of portable AtmosphereMod 0.8.0 concepts for the
 * GeoFS 4.0 / Cesium 1.136 atmosphere + volumetric-cloud shader pipeline.
 *
 * Important: MSFS ReShade/DXIL binaries, SimConnect/Coherent EFB interfaces,
 * MSFS weather-volume generation and MSFS shadow-map data are not compatible
 * with GeoFS. This port patches GeoFS GLSL source strings only.
 */
(() => {
  "use strict";

  const VERSION = "0.9.1-gf4";
  const GLOBAL_KEY = "__ATMOSPHEREMOD_GEOFS_091__";
  const STORAGE_KEY = "atmospheremod.geofs.091.settings";
  const UI_ID = "amgfs091-root";
  const MODIFIER_ID = "atmospheremod-geofs-091";
  const MASTER_KEY = "atmospheremod.geofs.091.enabled";
  const finite = (v, fallback) => v === null || v === undefined || v === "" ? fallback
    : Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
  const fmt = (v, digits = 6) => Number(v).toFixed(digits);
  const lerp = (a, b, t) => a + (b - a) * t;

  const DEFAULTS = Object.freeze({
    T0: 1, C0: 1,
    T1: 1.5, T2: 0.15, T3: 4.0, T4: 0.6, T5: 2.5, T6: 0.05,
    T7: 0.1, T8: 1, T9: 0.7, T10: 1.3, T11: 1, T12: 1, T13: 1, T16: 1,
    C1: 0.9, C2: 0.5, C3: 0.4, C4: 0.4, C5: 0.12, C6: 0.5,
    C7: 150, C8: 0, C9: 0.5, C10: 4, C11: 0.08,
    C16: 0.5, C17: 0.33, C18: 0, C19: 1.5, C28: 1, C29: 300, C30: 0, C31: 600,
    C22: 1
  });

  // Limits retain the MSFS tunable ranges where the source defines them.
  const LIMITS = Object.freeze({
    T1: [0.3, 6], T2: [0.04, 1.5], T3: [0, 14], T4: [0, 3],
    T5: [0.5, 10], T6: [0, 1], T7: [0, 0.5], T9: [0, 0.99],
    T10: [0, 2.5], T11: [0, 1], T12: [0, 1], T16: [0, 2],
    C1: [0, 0.99], C2: [0, 0.5], C3: [0, 1], C4: [0, 0.9],
    C5: [0, 0.25], C6: [0, 1], C7: [0, 500], C8: [0, 8],
    C9: [0, 2], C10: [0, 20], C11: [0, 0.3], C16: [0, 4],
    C17: [0, 1], C18: [0, 12000], C19: [0, 3], C28: [0, 1], C29: [0, 1000], C30: [0, 0.05],
    C31: [0, 1500]
  });

  const PRESETS = {
    default: { ...DEFAULTS },
    clear: {
      T1: 1.1, T2: 0.12, T3: 1.2, T4: 0.2, T5: 2.0, T6: 0.02,
      T7: 0.05, T8: 1, T9: 0.72, T10: 1.3, T11: 1, T12: 1, T13: 1, T16: 0.7,
      C1: 0.93, C2: 0.38, C3: 0.32, C4: 0.32, C5: 0.10, C6: 0.25,
      C7: 120, C8: 0, C9: 0.25, C10: 8, C11: 0.09,
      C16: 0.3, C17: 0.42, C18: 0, C19: 1.5, C28: 0.75, C29: 250, C30: 0, C31: 600, C22: 1
    },
    maritime: {
      T1: 1.8, T2: 0.28, T3: 3.2, T4: 0.8, T5: 3.4, T6: 0,
      T7: 0.06, T8: 1, T9: 0.76, T10: 0.3, T11: 1, T12: 1, T13: 1, T16: 1,
      C1: 0.9, C2: 0.45, C3: 0.5, C4: 0.35, C5: 0.12, C6: 0.45,
      C7: 170, C8: 0, C9: 0.5, C10: 5, C11: 0.08,
      C16: 0.55, C17: 0.35, C18: 0, C19: 1.5, C28: 0.95, C29: 320, C30: 0, C31: 600, C22: 1
    },
    dusty: {
      T1: 2.8, T2: 0.45, T3: 7.5, T4: 1.1, T5: 4.5, T6: 0.55,
      T7: 0.18, T8: 1, T9: 0.62, T10: 0.4, T11: 1, T12: 1, T13: 1, T16: 1.15,
      C1: 0.9, C2: 0.5, C3: 0.38, C4: 0.35, C5: 0.12, C6: 0.4,
      C7: 160, C8: 0, C9: 0.4, C10: 5, C11: 0.08,
      C16: 0.5, C17: 0.36, C18: 0, C19: 1.5, C28: 0.9, C29: 300, C30: 0, C31: 600, C22: 1
    }
  };

  const IMPLEMENTED = ["T0", "C0"];
  const APPROXIMATED = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T16",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
    "C16", "C17", "C18", "C19", "C22", "C28", "C29", "C30", "C31"
  ];
  const UNSUPPORTED = [
    "T14", "T15", "C12", "C20", "C21",
    "C23", "C24", "C25", "C26", "C27", "C32", "C33", "C34", "C36", "C37"
  ];

  let old = window[GLOBAL_KEY];
  if (old && typeof old.destroy === "function") {
    try { old.destroy({ silent: true }); } catch (e) { console.warn(e); }
  }
  for (const legacyKey of ["__ATMOSPHEREMOD_GEOFS_090__", "__ATMOSPHEREMOD_GEOFS_081__", "__ATMOSPHEREMOD_GEOFS_080__"]) {
    try { if (window[legacyKey]?.destroy) window[legacyKey].destroy({ silent: true }); } catch (_) {}
  }
  document.getElementById("amgfs090-root")?.remove();
  document.getElementById("amgfs081-root")?.remove();
  document.getElementById("amgfs080-root")?.remove();

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) {}
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    if (!Object.keys(saved).length) {
      try { saved = JSON.parse(localStorage.getItem("atmospheremod.geofs.090.settings") || "{}"); } catch (_) {}
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    }
    const value = { ...DEFAULTS, ...saved };
    for (const [k, range] of Object.entries(LIMITS)) value[k] = clamp(finite(value[k], DEFAULTS[k]), range[0], range[1]);
    for (const k of ["T0", "C0", "T8", "T13", "C22"]) value[k] = value[k] ? 1 : 0;
    return value;
  }

  function loadMasterEnabled() {
    const current = localStorage.getItem(MASTER_KEY);
    const legacy = localStorage.getItem("atmospheremod.geofs.090.enabled");
    return (current === null ? legacy : current) !== "false";
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

    // Cloud density lives in GeoFS' shared atmosphere source and is independent
    // from the T0 atmosphere switch, just as C0 is independent in MSFS.
    if (enableClouds) {
    // Add the cloud type output used by C16 on the visible camera ray only.
    const densitySignatureNeedle = "float cloudDensity(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage) {";
    const densitySignatureReplacement = "float cloudDensity(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage, out float amCumulusWeightOut) {\namCumulusWeightOut = 0.0;";
    shader = replaceExactly(shader, densitySignatureNeedle, densitySignatureReplacement, "cloud density type output");

    // Cloud-base density shaping lives in GeoFS' shared cloud-volume source.
    const baseProfileNeedle = "float baseProfile    = saturate(1.0 - pow(hr - 0.12, 2.0) * 60.0);";
    const baseCenter = lerp(0.12, 0.035, S.C28);
    const baseSharpness = lerp(60, 92, S.C28);
    const profileExponent = S.C17 > 0 ? S.C17 : 1.0;
    const baseTransition = S.C29 > 0 ? S.C29 : 300.0;
    const fineBillowPeriod = S.C31 > 0 ? S.C31 : 350.0;
    const baseReplacement = `float amBaseRaw = saturate(1.0 - pow(hr - ${fmt(baseCenter, 5)}, 2.0) * ${fmt(baseSharpness, 3)});
float baseProfile = pow(max(amBaseRaw, 0.0), ${fmt(profileExponent, 5)});`;
    shader = replaceExactly(shader, baseProfileNeedle, baseReplacement, "cloud base profile");
    const cumulusProfileNeedle = "float cumulusProfile = saturate(1.0 - pow(hr - 0.25, 2.0) * 25.0);";
    const cumulusProfileReplacement = `float cumulusProfile = pow(saturate(1.0 - pow(hr - 0.25, 2.0) * 25.0), ${fmt(profileExponent, 5)});`;
    shader = replaceExactly(shader, cumulusProfileNeedle, cumulusProfileReplacement, "cumulus profile exponent");
    const cumulusWeightNeedle = "float cumulusWeight = smoothstep(0.25, 0.65, typeField);";
    const cumulusWeightReplacement = "float cumulusWeight = smoothstep(0.25, 0.65, typeField);\namCumulusWeightOut = cumulusWeight;";
    shader = replaceExactly(shader, cumulusWeightNeedle, cumulusWeightReplacement, "cloud type output");

    // C28 flattens noise near the base; C29 is the height of that transition.
    const shapeNeedle = "float shape     = noise(p * 0.3);";
    const shapeReplacement = `float shape = noise(p * 0.3);
float amBaseSmooth = ${fmt(S.C28, 5)} * (1.0 - smoothstep(0.0, ${fmt(baseTransition, 2)}, heightRatio * cloudThickness));
shape = mix(0.5, shape, 1.0 - amBaseSmooth * 0.9);`;
    shader = replaceExactly(shader, shapeNeedle, shapeReplacement, "smooth cloud bases");

    // Optional second billow octave (C30/C31), concentrated above the base.
    const erosionNeedle = "float erosion = 0.5 * mix(n0, billow, 0.1);";
    const erosionReplacement = `float erosion = 0.5 * mix(n0, billow, 0.1);
if (${fmt(S.C30, 5)} > 0.0) {
  float amFineScale = 500.0 / ${fmt(fineBillowPeriod, 2)};
  float amFineBillow = noise(p * amFineScale + vec3(11.7, 3.1, 6.4));
  float amFineFade = smoothstep(0.0, ${fmt(Math.max(50, baseTransition), 2)}, heightRatio * cloudThickness);
  erosion += (${fmt(S.C30, 5)}) * (amFineBillow - 0.5) * 0.6 * amFineFade;
}`;
    shader = replaceExactly(shader, erosionNeedle, erosionReplacement, "fine cloud billows");

    const densityNeedle = "float d = max(lowDensity, towerDensity);\nreturn d;//clamp((d - 0.04) * 1.7, 0.0, 1.0);";
    const densityReplacement = `float d = max(lowDensity, towerDensity);
float amCloudHighFadeTop = ${fmt(S.C18 === 0 ? 6000 : S.C18, 2)};
float amCloudHighFade = smoothstep(amCloudHighFadeTop - 3000.0, amCloudHighFadeTop, height);
float amCirrusThickness = mix(1.0, ${fmt(S.C19 === 0 ? 1 : S.C19, 5)}, amCloudHighFade);
d *= amCirrusThickness;
float amEdgeSharpness = ${fmt(S.C8, 5)};
d = mix(d, pow(max(d, 0.0), 1.0 + amEdgeSharpness * 0.12), clamp(amEdgeSharpness / 8.0, 0.0, 1.0));
return d;//clamp((d - 0.04) * 1.7, 0.0, 1.0);`;
    shader = replaceExactly(shader, densityNeedle, densityReplacement, "cloud edge sharpness");
    }
    return shader;
  }

  function buildCloudShader() {
    let shader = state.original.clouds;
    const k = S.C1;
    const bounceShare = S.C3;
    const bounceG = S.C4;
    const deepLight = S.C5 > 0 ? S.C5 : 0.033;
    const powder = S.C6;
    const powderDepth = S.C7 > 0 ? S.C7 : 100;
    const glory = S.C9;
    const droplet = S.C10 > 0 ? S.C10 : 10;
    const spread = S.C11 > 0 ? S.C11 : 0.15;
    const cloudHighFadeTop = S.C18 === 0 ? 6000 : S.C18;

    shader = replaceExactly(shader, "const float kInScattering = 0.99;",
      `const float kInScattering = ${fmt(k > 0 ? k : 0.5, 5)};`, "cloud forward-scattering lobe");

    const visibleDensityNeedle = "dens = cloudDensity(position, wind, lod, heightRatio, coverage);";
    const visibleDensityReplacement = `float amCumulusWeightAtSample = 0.0;
dens = cloudDensity(position, wind, lod, heightRatio, coverage, amCumulusWeightAtSample);
float amCloudSampleHeight = cloudBase + heightRatio * cloudThickness;
float amCloudHighFade = smoothstep(${fmt(cloudHighFadeTop - 3000, 2)}, ${fmt(cloudHighFadeTop, 2)}, amCloudSampleHeight);
float amCumulusCore = smoothstep(0.2, 0.9, max(dens, 0.0)) * amCumulusWeightAtSample;
float amCoreOpticalBoost = 1.0 + 0.75 * ${fmt(S.C16, 5)} * amCumulusCore * (1.0 - amCloudHighFade);
dens *= amCoreOpticalBoost;`;
    shader = replaceExactly(shader, visibleDensityNeedle, visibleDensityReplacement, "visible-ray cumulus optical thickness");

    const shadowDensity1Needle = "float d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage);";
    const shadowDensity1Replacement = "float amShadowCumulusWeight1 = 0.0;\nfloat d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage, amShadowCumulusWeight1);";
    shader = replaceExactly(shader, shadowDensity1Needle, shadowDensity1Replacement, "unmodified first shadow density sample");
    const shadowDensity2Needle = "d2 = cloudDensity(position + light_dir * shortMarchStep * 10.0, wind, 0.0, hrShadow, coverage);";
    const shadowDensity2Replacement = "float amShadowCumulusWeight2 = 0.0;\nd2 = cloudDensity(position + light_dir * shortMarchStep * 10.0, wind, 0.0, hrShadow, coverage, amShadowCumulusWeight2);";
    shader = replaceExactly(shader, shadowDensity2Needle, shadowDensity2Replacement, "unmodified second shadow density sample");

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
cloud.a = amCloudOpacity;`;
    shader = replaceExactly(shader, gloryNeedle, gloryReplacement, "droplet-sized glory approximation");

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

  function createArgs() {
    const a = state.atmosphere;
    const api = state.geofs?.api?.renderingSettings || {};
    const advanced = typeof a.advancedAtmosphere === "boolean" ? a.advancedAtmosphere : !!api.advancedAtmosphere;
    const quality = finite(a.quality, finite(api.scatteringQuality, 4));
    const volumetric = typeof a.volumetricClouds === "boolean" ? a.volumetricClouds : !!api.volumetricClouds;
    const realtime = typeof a.realTimeClouds === "boolean" ? a.realTimeClouds : false;
    const retro = typeof a.retro === "boolean" ? a.retro : false;
    return [advanced, quality, volumetric, realtime, retro];
  }

  function rebuildAtmosphere() {
    const a = state.atmosphere;
    if (!a || typeof state.original?.create !== "function") return false;
    const args = createArgs();
    try {
      if (a.postProcessingStages && typeof state.original.destroy === "function") {
        state.original.destroy.call(a);
      }
      applyShaders();
      state.original.create.apply(a, args);
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



  function statusText(extra) {
    if (extra) return extra;
    if (!state.geofs) return "GeoFSの読み込みを待っています";
    if (!state.compatible) return "このGeoFSビルドでは描画フックを確認できません";
    if (!state.masterEnabled) return "停止中 · 標準の大気・雲シェーダーを使用しています";
    if (S.T0 && !state.atmosphere?.advancedAtmosphere) return "待機中 · GeoFS設定でAdvanced Atmosphereを有効にしてください";
    if (S.C0 && !state.atmosphere?.volumetricClouds) return "大気は適用対象 · 雲の補正にはVolumetric Cloudsが必要です";
    if (!S.T0 && !S.C0) return S.C22
      ? "T0 / C0 OFF · 標準シェーダー + C22昼光補正"
      : "T0 / C0 OFF · GeoFS標準描画を使用しています";
    return "GeoFS 4.0 GLSLソースへ適用済み";
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
    const metrics = {
      vis: distanceText(finite(d.visibility, NaN)),
      altitude: Number.isFinite(Number(loc?.[2])) ? heightText(loc[2]) : "—",
      base: Number.isFinite(Number(d.cloudBase)) ? heightText(d.cloudBase) : "—",
      top: Number.isFinite(Number(d.cloudTop)) ? heightText(d.cloudTop) : "—",
      temp: Number.isFinite(Number(d.airTemperatureSL)) ? `${Number(d.airTemperatureSL).toFixed(1)} °C` : "—",
      dew: Number.isFinite(Number(d.dewPointSL)) ? `${Number(d.dewPointSL).toFixed(1)} °C` : "—"
    };
    for (const [key, value] of Object.entries(metrics)) {
      const el = state.root.querySelector(`[data-metric="${key}"]`);
      if (el) el.textContent = value;
    }
    const src = state.root.querySelector("[data-weather-source]");
    if (src) src.textContent = w ? "GeoFS weather.definition（集約値）" : "未取得";
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
      ["C10", "水滴半径", 0, 20, 0.5, "µm"],
      ["C11", "水滴サイズ分布", 0, 0.3, 0.005, ""],
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
    if (["C7", "C18", "C29", "C31"].includes(key)) return `${Math.round(value)} m`;
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
    const a = document.createElement("a"); a.href = url; a.download = "AtmosphereMod-GeoFS-0.9.1-profile.json";
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
      for (const key of ["T0", "C0", "T8", "T13", "C22"]) if (key in incoming) S[key] = incoming[key] ? 1 : 0;
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
      <button class="am-launch" data-open><span class="am-icon">AM</span><span>ATMOSPHERE MOD<br><small style="font-size:9px;color:#a9c0cd">GEOFS 4.0 PORT 0.9.1</small></span></button>
      <section class="am-panel" aria-label="AtmosphereMod GeoFS controls">
        <header class="am-head"><div class="am-top"><div><div class="am-title">ATMOSPHERE CONTROL</div><div class="am-sub">MSFS 0.8.0 TUNABLES · GEOFS 4.0 · 0.9.1</div></div><div style="display:flex;align-items:center;gap:8px"><span class="am-badge warn" data-am-badge>CHECK</span><button class="am-close" data-close>×</button></div></div><div class="am-status" data-am-status>GeoFSの描画環境を確認しています</div></header>
        <div class="am-bar"><label><input type="checkbox" data-master> Mod 有効</label><label><input type="checkbox" data-T0> T0 Atmosphere</label><label><input type="checkbox" data-C0> C0 Clouds</label></div>
        <nav class="am-tabs"><button class="active" data-tab="overview">概要</button><button data-tab="haze">空・霞</button><button data-tab="clouds">雲</button><button data-tab="support">移植範囲</button></nav>
        <div class="am-content">
          <section class="am-page" data-page="overview">
            <div class="am-metrics"><div class="am-metric"><small>VISIBILITY</small><b data-metric="vis">—</b></div><div class="am-metric"><small>ALTITUDE</small><b data-metric="altitude">—</b></div><div class="am-metric"><small>CLOUD BASE</small><b data-metric="base">—</b></div><div class="am-metric"><small>CLOUD TOP</small><b data-metric="top">—</b></div><div class="am-metric"><small>TEMP</small><b data-metric="temp">—</b></div><div class="am-metric"><small>DEW POINT</small><b data-metric="dew">—</b></div></div>
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
            ${renderControls(CONTROL_GROUPS[1])}
            <div class="am-note">GeoFSの既存ボリューム雲シェーダーに対する照明・密度補正です。C16は積雲の高密度領域を優先して補正しますが、MSFS版と同じ光学厚さモデルではありません。雲のメッシュや気象ボリュームそのものをMSFS版と同様に生成し直す機能ではありません。</div>
          </section>
          <section class="am-page" data-page="support" hidden>
            <div class="am-group-title">GeoFSで実装する項目</div>
            <div class="am-grid"><div class="am-card"><b>独立スイッチ</b>T0 / C0：大気モデルと雲照明モデルを個別に切り替え</div><div class="am-card"><b>大気・霞（近似）</b>T1–T7, T9–T12：境界層、自由対流圏、粒子色、後方散乱、遠景の雲霞</div><div class="am-card"><b>天候連動（近似）</b>T13, T16：GeoFSの集約visibility / humidity / fog / precipitationを使う推定。METAR観測所補間ではありません</div><div class="am-card"><b>雲照明（近似）</b>C1–C7：前方散乱、多重散乱、雲内部光、Powder効果</div><div class="am-card"><b>雲表現（近似）</b>C8–C11, C16–C19, C28–C31：雲縁、Glory、積雲コア密度、高層雲、底面、細かなビロー</div><div class="am-card"><b>色補正（近似）</b>T8, C22：GeoFS色補正API。MSFSの物理的なスペクトル補正と同等ではありません</div><div class="am-card"><b>復元</b>ModをOFFにすると元のGeoFS GLSL文字列と大気APIへ戻します</div></div>
            <div class="am-group-title">MSFS専用で未移植</div><div class="am-note">${UNSUPPORTED.join(", ")}<br><br>DXIL/ReShadeのシェーダーパッチ、MSFSのEFB/SimConnect連携、8観測所のMETAR補間、METAR雲アンカー、機体影マップ、雲内視程、CB/TCU・雷雨の気象ボリューム生成はGeoFSの同じAPI・描画データを持たないため、GeoFS版には含めていません。</div>
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
      create: a.create, destroy: a.destroy, methods: {}
    };

    // Probe every GLSL replacement before touching the live shader strings.
    buildAtmosphereShader();
    buildCloudShader();
    state.compatible = true;
    createUI();
    a.create = function (...args) {
      try { applyShaders(); }
      catch (error) { restoreShaders(); console.error("[AtmosphereMod GeoFS] Shader patch rejected", error); }
      return state.original.create.apply(this, args);
    };

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
        const a = state.atmosphere, args = createArgs();
        restoreShaders();
        if (a.postProcessingStages && state.original.destroy) state.original.destroy.call(a);
        a.create = state.original.create;
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
      clouds: window.__ATMOSPHEREMOD_GEOFS_TEST_FIXTURE__.clouds
    };
    const testAtmosphereEnabled = !!(state.masterEnabled && S.T0);
    const testCloudsEnabled = !!(state.masterEnabled && S.C0);
    if (window.__ATMOSPHEREMOD_GEOFS_TEST_API__) {
      state.geofs = { api: window.__ATMOSPHEREMOD_GEOFS_TEST_API__ };
      updateColorModifiers();
    }
    window.__ATMOSPHEREMOD_GEOFS_TEST_RESULT__ = {
      common: (testAtmosphereEnabled || testCloudsEnabled)
        ? buildAtmosphereShader(testAtmosphereEnabled, testCloudsEnabled) : state.original.common,
      clouds: testCloudsEnabled ? buildCloudShader() : state.original.clouds,
      settings: { ...S },
      masterEnabled: state.masterEnabled
    };
    return;
  }

  state.apply = patch => {
    if (!patch || typeof patch !== "object") return;
    for (const [key, range] of Object.entries(LIMITS)) if (key in patch) S[key] = clamp(patch[key], range[0], range[1]);
    for (const key of ["T8", "T13", "C22", "T0", "C0"]) if (key in patch) S[key] = patch[key] ? 1 : 0;
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
