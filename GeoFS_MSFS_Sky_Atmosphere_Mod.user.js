// ==UserScript==
// @name         GeoFS MSFS Atmospheric Lighting & Sky Overhaul
// @namespace    https://dya.jp/geofs-msfs-atmosphere-mod
// @version      5.2.0
// @description  Native GeoFS Options integration with MSFS-inspired atmosphere, volumetric cloud and weather visual modules.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
'use strict';

const KEY = '__GEOFS_MSFS_SKY_ATMOSPHERE_MOD_V52__';
const MARK = 'GEOFS_MSFS_SKY_ATMOSPHERE_MOD_V52';
if (window[KEY]) return;

// Stop the previous experimental build if it is still active.
try {
  for (const oldKey of ['__GEOFS_MSFS_CLOUD_ENGINE_V30__','__GEOFS_MSFS_ATMOSPHERE_REALISM_MOD_V40__','__GEOFS_MSFS_SKY_ATMOSPHERE_MOD_V50__','__GEOFS_MSFS_SKY_ATMOSPHERE_MOD_V51__']) {
    const old = window[oldKey];
    if (old && typeof old.disable === 'function') old.disable();
  }
} catch (_) {}

const STORAGE_KEY = 'GEOFS_MSFS_SKY_ATMOSPHERE_MOD_SETTINGS_V52';
const PRESET_KEY = 'GEOFS_MSFS_SKY_ATMOSPHERE_MOD_PRESETS_V52';
const defaults = {
  enabled: 1,
  morphology: 1.08, cloudOpacity: 1.20, detail: 1.16, layering: 0.82,
  cirrus: 0.92, stratus: 1.05, anvil: 1.05, flatBases: 1.22,
  topVariation: 1.05, windEvolution: 1.0,
  lighting: 1.16, silverLining: 0.88, powder: 0.56, selfShadow: 1.12,
  groundShadow: 1.05, flyThrough: 0.70, lightning: 0.12, glory: 0.35,
  aerialPerspective: 1.10, boundaryFog: 1.0,
  skyRayleigh: 1.0, skyMie: 1.0, rayleighScale: 1.0, mieScale: 1.0,
  atmoDensity: 1.0, ozone: 1.0, mieG: 0.72, aerosolAngstrom: 1.05,
  hazeBoundary: 0.72, hazeTopKm: 1.65, hazeEdgeKm: 0.18,
  freeHaze: 0.28, brownAbsorption: 0.02,
  whiteBalance: 0.82, skyExposure: 1.08, skySaturation: 1.0,
  sunHalo: 0.52, twilight: 0.82, horizonGlow: 0.72
};
const ranges = {
  enabled:[0,1], morphology:[0,2], cloudOpacity:[0,2], detail:[0,2], layering:[0,2],
  cirrus:[0,2], stratus:[0,2], anvil:[0,2], flatBases:[0,2], topVariation:[0,2], windEvolution:[0,2],
  lighting:[0,2], silverLining:[0,2], powder:[0,1], selfShadow:[0,2], groundShadow:[0,2],
  flyThrough:[0,2], lightning:[0,1], glory:[0,1], aerialPerspective:[0,2], boundaryFog:[0,2],
  skyRayleigh:[0.55,1.55], skyMie:[0.45,1.8], rayleighScale:[0.65,1.35], mieScale:[0.55,1.65],
  atmoDensity:[0.55,1.65], ozone:[0.45,1.65], mieG:[0.55,0.92], aerosolAngstrom:[0,2],
  hazeBoundary:[0,2], hazeTopKm:[0.3,4.0], hazeEdgeKm:[0.05,0.9], freeHaze:[0,1.5],
  brownAbsorption:[0,1], whiteBalance:[0,1], skyExposure:[0.65,1.6], skySaturation:[0.65,1.35], sunHalo:[0,1.5], twilight:[0,1.5], horizonGlow:[0,1.5]
};
function normalizeSettings(value) {
  const result = Object.assign({}, defaults);
  for (const key of Object.keys(defaults)) {
    if (typeof value?.[key] === 'number' && Number.isFinite(value[key])) {
      const [lo, hi] = ranges[key] || [0,2];
      result[key] = clamp(value[key], lo, hi);
    }
  }
  return result;
}
function readStored() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch (_) { return Object.assign({}, defaults); }
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

const state = window[KEY] = {
  version: '5.2.0', active: false, ready: false, error: null,
  originalShaders: null, originalCreate: null, originalDestroy: null,
  originalPostProcessStage: null, originalSpawnClouds: null,
  stageProxyInstalled: false, createWrapped: false, rendererRebuilt: false,
  cloudRenderScale: null, nativeUi: false, observer: null,
  settings: readStored(), presetName: 'MSFS-inspired Natural',
  saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (_) {}
  }
};
const log = (...args) => console.info('[GeoFS MSFS Sky Atmosphere Mod 5]', ...args);

const densityFunction = String.raw`float cloudDensity(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage) {
    float stockHeightRatio = 0.0;
    float stockDensity = cloudDensityStock(p, wind, lod, stockHeightRatio, finalCoverage);
    float altitude = length(p) - realPlanetRadius;
    heightRatio = (altitude - cloudBase) / max(cloudThickness, 1.0);
    if (finalCoverage <= 0.025 || heightRatio < 0.0 || heightRatio > 1.0) return stockDensity;

    const mat3 CLOUD_ROT = mat3( 0.00, 0.80, 0.60,
                                -0.80, 0.36,-0.48,
                                -0.60,-0.48, 0.64);
    float h = clamp(heightRatio, 0.0, 1.0);
    // Low-frequency coordinates extend the weather cells and reduce the repetitive popcorn pattern.
    vec3 adv = p * 0.00042 + wind * (0.72 * modWindEvolution);
    float continent = noise(adv * 0.014 + vec3(2.0, 17.0, 5.0));
    float macro = noise(adv * 0.060 + vec3(7.1, 2.8, 19.3));
    float genus = noise(adv * 0.027 + vec3(17.1, 4.7, 29.3));
    float cell = noise(adv * 0.205 + vec3(8.2, 31.4, 2.8));
    float warpA = noise(adv * 0.052 + vec3(31.0, 5.0, 19.0));
    float warpB = noise(CLOUD_ROT * adv * 0.108 + vec3(3.0, 21.0, 7.0));
    vec3 warped = adv + (vec3(warpA, warpB, macro) - 0.5) * 1.45;

    float lowNoise = noise(warped * 0.62 + vec3(3.7, 9.1, 21.6));
    float mediumNoise = 0.5;
    float fineNoise = 0.5;
    float detailWeight = smoothstep(0.10, 1.25, lod) * clamp(modDetail, 0.0, 2.0);
    if (lod > 0.10) mediumNoise = noise(CLOUD_ROT * warped * 1.42 + vec3(13.2, 2.4, 7.8));
    if (lod > 1.05) fineNoise = noise(CLOUD_ROT * warped * 2.85 + vec3(5.1, 18.7, 11.3));

    // Classify the local weather cell into stratiform and convective morphology.
    float stratiformWeight = (1.0 - smoothstep(0.26, 0.56, genus)) * clamp(modStratus, 0.0, 2.0);
    float cumulusWeight = smoothstep(0.45, 0.80, genus);
    float mixedWeight = clamp(1.0 - stratiformWeight - cumulusWeight, 0.0, 1.0);
    float localTopNoise = noise(adv * 0.041 + vec3(28.0, 3.0, 14.0));
    float localTop = mix(0.72, 0.985, mix(0.25, 1.0, localTopNoise) * clamp(modTopVariation, 0.0, 2.0) * 0.5);

    // Stratiform decks keep a flatter base and softer top; cumulus grows vertically with rounded turrets.
    float stratusProfile = smoothstep(0.006, 0.052, h) * (1.0 - smoothstep(localTop * 0.78, localTop, h));
    float stratocumulusProfile = smoothstep(0.010, 0.085, h) * (1.0 - smoothstep(localTop * 0.86, localTop, h));
    float cumulusProfile = pow(max(0.0, sin(3.14159265 * clamp(h / max(localTop, 0.2), 0.0, 1.0))), 0.64);
    float stratiformProfile = mix(stratusProfile, stratocumulusProfile, smoothstep(0.38, 0.74, macro));
    float verticalProfile = stratiformWeight * stratiformProfile + mixedWeight * stratocumulusProfile + cumulusWeight * cumulusProfile;

    // Level cloud bases: only gentle thermal lifting and broad-scale undulation remain near the base.
    float baseUndulation = mix(0.006, 0.035, macro) * mix(1.7, 0.42, clamp(modFlatBases * 0.5, 0.0, 1.0));
    float flatBaseMask = smoothstep(baseUndulation, baseUndulation + 0.070, h);
    float topFade = 1.0 - smoothstep(localTop * 0.94, localTop, h);
    verticalProfile *= flatBaseMask * topFade;

    // Broken cloud fields are organized into weather masses instead of evenly spaced cells.
    float coverageShape = clamp((finalCoverage - 0.10) / 0.90, 0.0, 1.0);
    float weatherBody = smoothstep(0.18, 0.82, mix(continent, macro, 0.58) + coverageShape * 0.22);
    float billow = 0.59 * cell + 0.27 * lowNoise + 0.10 * mix(0.5, mediumNoise, detailWeight) + 0.04 * mix(0.5, fineNoise, detailWeight);
    float erosion = mix(0.27, 0.105, clamp(lod / 2.0, 0.0, 1.0));
    float body = verticalProfile * weatherBody * (0.72 + 0.55 * coverageShape) - (1.0 - billow) * erosion;

    // Native GeoFS convective tower function: tapered trunks, shear and anvil spread.
    float towerCellSize = clamp(cloudThickness * 2.7, 1800.0, 10500.0);
    vec3 towerQ = normalize(p) * (realPlanetRadius / towerCellSize) + wind / (0.002 * towerCellSize);
    float stormIntensity = smoothstep(0.56, 0.94, finalCoverage) * smoothstep(1700.0, 5500.0, cloudThickness);
    float towerRegion = smoothstep(0.48, 0.84, genus);
    float towerChance = clamp(finalCoverage * mix(0.018, 0.27, stormIntensity) * modAnvil, 0.0, 0.55);
    float tower = 0.0;
    if (towerChance > 0.004 && towerRegion > 0.01) {
        tower = towerField(towerQ, h, towerChance * towerRegion, lowNoise, finalCoverage, cloudThickness);
    }

    // Fine fibrous upper cloud veil; this remains subordinate to the main weather deck.
    vec3 streakCoord = CLOUD_ROT * warped;
    float streakBroad = noise(vec3(streakCoord.x * 0.105, streakCoord.y * 0.022, streakCoord.z * 0.096) + vec3(4.0, 8.0, 12.0));
    float streakFine = noise(vec3(streakCoord.x * 0.31, streakCoord.y * 0.052, streakCoord.z * 0.29) + vec3(9.0, 2.0, 17.0));
    float cirrusBand = smoothstep(0.69, 0.94, h) * (1.0 - smoothstep(0.975, 1.0, h));
    float cirrus = smoothstep(0.48, 0.78, streakBroad * 0.70 + streakFine * 0.30) * cirrusBand * 0.085 * clamp(modCirrus, 0.0, 2.0);

    // Subtle internal strata add layered decks without inventing unsupported independent weather layers.
    float layerNoise = noise(adv * 0.019 + vec3(18.0, 29.0, 6.0));
    float bandA = (1.0 - smoothstep(0.0, 0.105, abs(h - mix(0.29, 0.39, layerNoise)))) * smoothstep(0.37, 0.84, layerNoise);
    float bandB = (1.0 - smoothstep(0.0, 0.078, abs(h - mix(0.67, 0.77, macro)))) * smoothstep(0.55, 0.91, macro);
    float thinLayers = (bandA * 0.068 + bandB * 0.042) * clamp(modLayering, 0.0, 2.0);

    float enhanced = max(body, tower * mix(0.95, 1.65, stormIntensity));
    enhanced = max(enhanced, thinLayers * weatherBody);
    enhanced += cirrus * (0.45 + 0.55 * (1.0 - stratiformWeight));
    enhanced *= mix(0.92, 1.10, h);
    enhanced *= mix(0.74, 1.42, clamp(modMorphology * 0.5, 0.0, 1.0));
    enhanced = clamp((enhanced - 0.022) * 1.48, 0.0, 1.0);
    enhanced = clamp(enhanced * mix(0.55, 1.48, clamp(modCloudOpacity * 0.5, 0.0, 1.0)), 0.0, 1.0);
    return mix(stockDensity, enhanced, clamp(modEnable, 0.0, 1.0));
}`;

const commonUniforms = `// ${MARK}
uniform float modEnable;
uniform float modMorphology;
uniform float modCloudOpacity;
uniform float modDetail;
uniform float modLayering;
uniform float modCirrus;
uniform float modStratus;
uniform float modAnvil;
uniform float modFlatBases;
uniform float modTopVariation;
uniform float modWindEvolution;
uniform float modLighting;
uniform float modSilver;
uniform float modPowder;
uniform float modSelfShadow;
uniform float modGroundShadow;
uniform float modFlyThrough;
uniform float modLightning;
uniform float modGlory;
uniform float modAerialPerspective;
uniform float modBoundaryFog;
uniform float modSkyRayleigh;
uniform float modSkyMie;
uniform float modRayleighScale;
uniform float modMieScale;
uniform float modAtmoDensity;
uniform float modOzone;
uniform float modMieG;
uniform float modAerosolAngstrom;
uniform float modHazeBoundary;
uniform float modHazeTopKm;
uniform float modHazeEdgeKm;
uniform float modFreeHaze;
uniform float modBrownAbsorption;
uniform float modWhiteBalance;
uniform float modSkyExposure;
uniform float modSkySaturation;
uniform float modSunHalo;
uniform float modTwilight;
uniform float modHorizonGlow;
uniform float modClock;`;

const atmosphericScatteringFunction = String.raw`vec4 calculate_scattering(
vec3 start,
vec3 dir,
float maxDistance,
vec3 light_dir
) {
    float a = dot(dir, dir);
    float b = 2.0 * dot(dir, start);
    float c = dot(start, start) - atmoRadiusSquared;
    float discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0.0) return vec4(0.0);
    float root = sqrt(max(discriminant, 0.0));
    vec2 rayLength = vec2(max((-b - root) / (2.0 * a), 0.0), min((-b + root) / (2.0 * a), maxDistance));
    if (rayLength.x >= rayLength.y) return vec4(0.0);

    const float PI_ATMO = 3.14159265359;
    const float FOUR_PI_ATMO = 12.56637061436;
    vec3 betaRay = vec3(5.8e-6, 13.5e-6, 33.1e-6) * mix(1.0, modSkyRayleigh, modEnable);
    float angstrom = mix(0.0, modAerosolAngstrom, modEnable);
    vec3 wavelengthRatio = vec3(0.55 / 0.65, 1.0, 0.55 / 0.45);
    vec3 betaMie = vec3(21.0e-6) * pow(wavelengthRatio, vec3(angstrom)) * mix(1.0, modSkyMie, modEnable);
    vec3 betaOzone = vec3(0.65e-6, 1.881e-6, 0.085e-6) * modOzone * modEnable;
    vec3 betaBrown = vec3(0.12e-6, 0.42e-6, 1.05e-6) * modBrownAbsorption * modEnable;
    float rayleighHeight = 8000.0 * mix(1.0, modRayleighScale, modEnable);
    float mieHeight = 1200.0 * mix(1.0, modMieScale, modEnable);
    float densityScale = mix(1.0, modAtmoDensity, modEnable);
    float gMie = mix(0.76, modMieG, modEnable);
    float mu = clamp(dot(normalize(dir), normalize(light_dir)), -1.0, 1.0);
    float mu2 = mu * mu;
    float phaseRayleigh = (3.0 / (16.0 * PI_ATMO)) * (1.0 + mu2);
    float hgDenom = max(1.0 + gMie * gMie - 2.0 * gMie * mu, 0.001);
    float phaseMieForward = (1.0 - gMie * gMie) / (FOUR_PI_ATMO * pow(hgDenom, 1.5));
    float gBack = -0.12;
    float phaseMieBack = (1.0 - gBack * gBack) / (FOUR_PI_ATMO * pow(max(1.0 + gBack*gBack - 2.0*gBack*mu, 0.001), 1.5));
    float phaseMie = mix(phaseMieBack, phaseMieForward, 0.91);

    float outerRadius = sqrt(atmoRadiusSquared);
    float planetRadiusPhysical = realPlanetRadius;
    float stepSize = (rayLength.y - rayLength.x) / float(PRIMARY_STEPS);
    vec3 totalRayleigh = vec3(0.0);
    vec3 totalMie = vec3(0.0);
    vec3 totalAmbient = vec3(0.0);
    vec3 opticalView = vec3(0.0); // Rayleigh, Mie, ozone
    float opticalBrown = 0.0;
    vec3 sunDirection = normalize(light_dir);

    // Solar white balance is applied to the source spectrum before atmospheric transport.
    vec3 solarSpectrum = mix(vec3(1.035, 1.0, 0.925), vec3(1.0), modWhiteBalance * modEnable);
    vec3 solarIrradiance = vec3(100.0) * solarSpectrum;

    for (int i = 0; i < PRIMARY_STEPS; ++i) {
        float t = rayLength.x + (float(i) + 0.5) * stepSize;
        vec3 samplePosition = start + dir * t;
        float altitude = max(length(samplePosition) - planetRadiusPhysical, 0.0);
        float rayleighDensity = exp(-altitude / max(rayleighHeight, 100.0));
        float mieBaseDensity = exp(-altitude / max(mieHeight, 100.0));
        float boundaryTop = max(modHazeTopKm, 0.3) * 1000.0;
        float boundaryEdge = max(modHazeEdgeKm, 0.05) * 1000.0;
        float boundaryShape = (1.0 - smoothstep(boundaryTop - boundaryEdge, boundaryTop + boundaryEdge, altitude)) * exp(-altitude / 1900.0);
        float freeTroposphereShape = exp(-altitude / 2800.0);
        float mieDensity = mieBaseDensity * 0.26 + modHazeBoundary * boundaryShape + modFreeHaze * freeTroposphereShape;
        float ozoneDensity = clamp(1.0 - abs(altitude - 25000.0) / 15000.0, 0.0, 1.0);
        float brownDensity = boundaryShape * modBrownAbsorption * modEnable;

        opticalView += vec3(rayleighDensity, mieDensity, ozoneDensity) * stepSize * densityScale;
        opticalBrown += brownDensity * stepSize * densityScale;
        vec3 viewTransmittance = exp(-(betaRay * opticalView.x + betaMie * opticalView.y + betaOzone * opticalView.z + betaBrown * opticalBrown));

        // Test whether the planet blocks direct sunlight at this atmospheric sample.
        float sunB = dot(samplePosition, sunDirection);
        float sunC = dot(samplePosition, samplePosition) - planetRadiusPhysical * planetRadiusPhysical;
        float sunDisc = sunB * sunB - sunC;
        float sunNearGround = -sunB - sqrt(max(sunDisc, 0.0));
        float sunVisible = (sunDisc > 0.0 && sunNearGround > 0.0) ? 0.0 : 1.0;

        float sunBOuter = dot(samplePosition, sunDirection);
        float sunCOuter = dot(samplePosition, samplePosition) - outerRadius * outerRadius;
        float sunDOuter = max(sunBOuter * sunBOuter - sunCOuter, 0.0);
        float sunDistance = max(-sunBOuter + sqrt(sunDOuter), 0.0);
        float sunStep = sunDistance / float(LIGHT_STEPS);
        vec3 opticalSun = vec3(0.0);
        float opticalSunBrown = 0.0;
        for (int j = 0; j < LIGHT_STEPS; ++j) {
            vec3 sunPosition = samplePosition + sunDirection * ((float(j) + 0.5) * sunStep);
            float sunAltitude = max(length(sunPosition) - planetRadiusPhysical, 0.0);
            float sunRayleighDensity = exp(-sunAltitude / max(rayleighHeight, 100.0));
            float sunMieBaseDensity = exp(-sunAltitude / max(mieHeight, 100.0));
            float sunBoundaryShape = (1.0 - smoothstep(boundaryTop - boundaryEdge, boundaryTop + boundaryEdge, sunAltitude)) * exp(-sunAltitude / 1900.0);
            float sunFreeShape = exp(-sunAltitude / 2800.0);
            float sunMieDensity = sunMieBaseDensity * 0.26 + modHazeBoundary * sunBoundaryShape + modFreeHaze * sunFreeShape;
            float sunOzoneDensity = clamp(1.0 - abs(sunAltitude - 25000.0) / 15000.0, 0.0, 1.0);
            float sunBrownDensity = sunBoundaryShape * modBrownAbsorption * modEnable;
            opticalSun += vec3(sunRayleighDensity, sunMieDensity, sunOzoneDensity) * sunStep * densityScale;
            opticalSunBrown += sunBrownDensity * sunStep * densityScale;
        }
        vec3 sunTransmittance = exp(-(betaRay * opticalSun.x + betaMie * opticalSun.y + betaOzone * opticalSun.z + betaBrown * opticalSunBrown));
        vec3 totalTransmittance = viewTransmittance * sunTransmittance * sunVisible;
        totalRayleigh += rayleighDensity * totalTransmittance * stepSize * densityScale;
        totalMie += mieDensity * totalTransmittance * stepSize * densityScale;
        // Cheap energy-conserving fill term: a small broad contribution representing higher-order scattering.
        totalAmbient += (rayleighDensity * betaRay + mieDensity * betaMie) * totalTransmittance * stepSize * 0.035;
    }

    vec3 radiance = (phaseRayleigh * betaRay * totalRayleigh + phaseMie * betaMie * totalMie) * solarIrradiance;
    float sunElevationCamera = dot(normalize(start), sunDirection);
    float twilightStrength = (1.0 - smoothstep(-0.20, 0.06, sunElevationCamera)) * modTwilight * modEnable;
    vec3 ambientSkyTint = mix(vec3(0.22, 0.28, 0.40), vec3(0.13, 0.20, 0.43), clamp(twilightStrength, 0.0, 1.0));
    radiance += totalAmbient * solarIrradiance * ambientSkyTint;
    // Residual blue-hour skylight approximates higher-order illumination from sunlit atmosphere beyond the planet's shadow.
    // It fades with solar depression and view distance, so nearby foreground objects are not flatly tinted blue.
    float twilightFade = 1.0 - smoothstep(-0.035, 0.045, sunElevationCamera);
    float twilightAfterglow = exp(-max(-sunElevationCamera, 0.0) / 0.11) * twilightFade * modTwilight * modEnable;
    float viewUpCosine = clamp(dot(normalize(dir), normalize(start)), 0.0, 1.0);
    float twilightViewFactor = 0.55 + 0.45 * pow(1.0 - viewUpCosine, 0.7);
    float twilightDistanceFade = smoothstep(12000.0, 120000.0, maxDistance);
    radiance += vec3(0.12, 0.17, 0.30) * twilightAfterglow * twilightViewFactor * twilightDistanceFade;
    vec3 transmittanceView = exp(-(betaRay * opticalView.x + betaMie * opticalView.y + betaOzone * opticalView.z + betaBrown * opticalBrown));
    float opacity = 1.0 - dot(transmittanceView, vec3(0.2126, 0.7152, 0.0722));
    return vec4(max(radiance, vec3(0.0)), clamp(opacity, 0.0, 1.0));
}`;

function patchCommon(source) {
  if (source.includes(MARK)) return source;
  let result = source.replace('precision highp float;', 'precision highp float;\n' + commonUniforms);
  const cloudPattern = /float cloudDensity\(vec3 p, vec3 wind, float lod, inout float heightRatio, float finalCoverage\) \{[\s\S]*?\n\}\n#endif/;
  const cloudMatch = result.match(cloudPattern);
  if (!cloudMatch) throw new Error('GeoFS cloudDensity() block was not found');
  const stockCloud = cloudMatch[0].replace('float cloudDensity(', 'float cloudDensityStock(').replace(/\n#endif$/, '');
  result = result.replace(cloudPattern, stockCloud + '\n' + densityFunction + '\n#endif');

  const begin = result.indexOf('vec4 calculate_scattering(');
  const end = result.indexOf('\n}\n#endif', begin);
  if (begin < 0 || end < 0) throw new Error('GeoFS calculate_scattering() block was not found');
  const originalFunction = result.slice(begin, end + 2);
  const stockFunction = originalFunction.replace('vec4 calculate_scattering(', 'vec4 calculate_scatteringStock(');
  const enhancedFunction = atmosphericScatteringFunction.replace(') {\n    float a = dot(dir, dir);', ') {\n    if (modEnable < 0.5) return calculate_scatteringStock(start, dir, maxDistance, light_dir);\n    float a = dot(dir, dir);');
  result = result.slice(0, begin) + stockFunction + '\n' + enhancedFunction + result.slice(end + 2);
  return result;
}

function mustReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error('GeoFS shader anchor missing: ' + label);
  return source.replace(before, after);
}


function patchCloudLighting(source) {
  if (source.includes(MARK)) return source;
  source = mustReplace(source,
    'float inScattering = Schlick(kInScattering, dotLightRay); //HenyeyGreenstein(gInScattering, dotLightRay);\nfloat outScattering = isotropic(); //HenyeyGreenstein(gOutScattering, dotLightRay);\nfloat sunScatteringPhase = mix(outScattering, inScattering, smoothstep(-0.2, 0.8, dotLightRay));\nfloat ambientScatteringPhase = isotropic();',
    `float stockInScattering = Schlick(kInScattering, dotLightRay);
float stockOutScattering = isotropic();
float stockSunPhase = mix(stockOutScattering, stockInScattering, smoothstep(-0.2, 0.8, dotLightRay));
float forwardLobe = HenyeyGreenstein(0.90, dotLightRay);
float broadLobe = HenyeyGreenstein(0.38, dotLightRay);
float modSunPhase = mix(broadLobe, forwardLobe, 0.60);
float sunScatteringPhase = mix(stockSunPhase, modSunPhase, clamp(modLighting * 0.5, 0.0, 1.0) * modEnable);
float outScattering = mix(stockOutScattering, HenyeyGreenstein(-0.12, dotLightRay), 0.28 * modEnable);
float ambientScatteringPhase = mix(isotropic(), HenyeyGreenstein(0.05, dotLightRay), 0.12 * modEnable);`,
    'cloud phase scattering');
  source = mustReplace(source,
    `float shadowStrength = 10.0;
float hrShadow;
float d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage);
float d2 = 0.2;
if (lod > 1.0) {
d2 = cloudDensity(position + light_dir * shortMarchStep * 10.0, wind, 0.0, hrShadow, coverage);
}
float opticalDepth = (d1 + d2);
float transmitance = exp(-shadowStrength * opticalDepth);`,
    `float shadowStrength = mix(10.0, mix(8.5, 15.0, clamp(modSelfShadow * 0.5, 0.0, 1.0)), modEnable);
float hrShadow;
float d1 = cloudDensity(position + light_dir * shortMarchStep, wind, 0.0, hrShadow, coverage);
float d2 = 0.0;
float d3 = 0.0;
float d4 = 0.0;
if (lod > 0.40) d2 = cloudDensity(position + light_dir * shortMarchStep * 4.0, wind, 0.0, hrShadow, coverage);
if (lod > 1.00) d3 = cloudDensity(position + light_dir * shortMarchStep * 9.0, wind, 0.0, hrShadow, coverage);
if (lod > 1.55) d4 = cloudDensity(position + light_dir * shortMarchStep * 16.0, wind, 0.0, hrShadow, coverage);
float opticalDepth = d1 * 0.46 + d2 * 0.29 + d3 * 0.17 + d4 * 0.08;
float transmitance = exp(-shadowStrength * opticalDepth);
float powderTerm = (1.0 - exp(-2.35 * opticalDepth)) * modPowder * modEnable;
float silverTerm = pow(max(dotLightRay, 0.0), 23.0) * 0.30 * modSilver * modEnable;`,
    'multi-sample cloud self-shadow');
  source = mustReplace(source,
    'float extinctionCoeff = 0.01 * dens;',
    'float extinctionCoeff = 0.01 * dens * mix(1.0, 1.18, clamp(modLighting * 0.5, 0.0, 1.0) * modEnable);',
    'cloud extinction');
  source = mustReplace(source,
    'float heightRatio;\nvec3 position = start + dir * (distance + 0.5 * marchStep);',
    `float heightRatio;
vec3 position = start + dir * (distance + 0.5 * marchStep);`,
    'cloud sample location');
  source = mustReplace(source,
    'dens = cloudDensity(position, wind, lod, heightRatio, coverage);',
    `dens = cloudDensity(position, wind, lod, heightRatio, coverage);
float cameraCloudDistance = length(position - start);
float nearCloudBlend = (1.0 - smoothstep(40.0, 260.0, cameraCloudDistance)) * modFlyThrough * modEnable;
float nearCloudDensity = pow(max(dens, 0.0), 0.44) * 0.62;
dens = mix(dens, max(dens, nearCloudDensity), nearCloudBlend);`,
    'near-aircraft cloud visibility');
  source = mustReplace(source,
    'vec3 lightTerm = sunScatteringPhase * sunLight + ambientScatteringPhase * ambientLight;\ncloud.rgb += cloud.a * 15.0 * lightTerm * (1.0 - stepT);',
    `vec3 multipleScatterFill = ambientLight * (0.20 + 0.36 * pow(1.0 - transmitance, 0.68)) * mix(1.0, modLighting, modEnable);
vec3 powderLight = sunColor * powderTerm * mix(0.25, 1.0, pow(max(-dotLightRay, 0.0), 1.7));
vec3 silverLight = sunColor * silverTerm * transmitance;
vec3 lightTerm = sunScatteringPhase * sunLight + ambientScatteringPhase * multipleScatterFill + powderLight + silverLight;
cloud.rgb += cloud.a * 15.0 * lightTerm * (1.0 - stepT);
float lightningSeed = hash3(floor(position / vec3(1450.0, 1450.0, 1850.0)), 19.0).x;
float lightningPhase = mod(modClock + lightningSeed * 9.7, 17.0);
float lightningPulse = exp(-pow((lightningPhase - 0.62) * 9.0, 2.0)) + 0.42 * exp(-pow((lightningPhase - 1.02) * 12.0, 2.0));
float stormCloudMask = smoothstep(0.70, 0.98, coverage) * smoothstep(2200.0, 5400.0, cloudThickness);
cloud.rgb += cloud.a * vec3(0.48, 0.60, 0.82) * lightningPulse * stormCloudMask * modLightning * modEnable;
float antiSolarCos = clamp(dot(dir, -light_dir), -1.0, 1.0);
float antiSolarAngle = acos(antiSolarCos);
float gloryBlue = exp(-pow((antiSolarAngle - 0.030) / 0.010, 2.0));
float gloryRed = exp(-pow((antiSolarAngle - 0.046) / 0.013, 2.0));
float gloryStrength = modGlory * modEnable * smoothstep(0.42, 0.86, heightRatio) * (1.0 - smoothstep(0.88, 1.0, heightRatio));
vec3 gloryColor = vec3(0.48, 0.72, 1.0) * gloryBlue + vec3(1.0, 0.42, 0.24) * gloryRed;
cloud.rgb += cloud.a * gloryColor * gloryStrength * 0.075;`,
    'multiple scattering, powder and storm flashes');
  source = source.replace('precision highp float;', 'precision highp float;\n// ' + MARK);
  return source;
}

function patchAtmosphere(source) {
  if (source.includes(MARK)) return source;
  source = mustReplace(source,
    'fragFogDensity = clamp((volumetricFogTop - elevation) / (volumetricFogTop - volumetricFogBottom), 0.0, 1.0) * volumetricFogDensity * depth; // volumetric',
    'fragFogDensity = clamp((volumetricFogTop - elevation) / (volumetricFogTop - volumetricFogBottom), 0.0, 1.0) * volumetricFogDensity * depth * mix(1.0, modBoundaryFog, modEnable); // layered atmosphere mod',
    'volumetric fog density');
  const oldShadow = `float mask = 1.0;
vec2 toClouds = raySphereIntersect(vWorldPosition, -lightDirection, baseDistance);
vec3 position = vWorldPosition + (-lightDirection * toClouds.x);
float hr;
float dens = cloudDensity(position, wind, 0.0, hr, cloudCoverageAt(position));
mask = clamp(1.0 - dens * 1.5, 0.45, 1.0);
color *= mask;`;
  source = mustReplace(source, oldShadow, `float mask = 1.0;
vec2 toClouds = raySphereIntersect(vWorldPosition, -lightDirection, baseDistance);
vec3 position = vWorldPosition + (-lightDirection * toClouds.x);
float shadowOpticalDepth = 0.0;
float shadowStep = max(baseThickness * 0.30, 160.0);
for (int shadowTap = 0; shadowTap < 6; shadowTap++) {
    vec3 shadowPosition = position + (-lightDirection) * (float(shadowTap) * shadowStep);
    float shadowHeightRatio;
    float shadowCoverage = cloudCoverageAt(shadowPosition);
    float shadowDensity = cloudDensity(shadowPosition, wind, 0.0, shadowHeightRatio, shadowCoverage);
    shadowOpticalDepth += max(shadowDensity, 0.0) * 0.17;
}
float integratedShadow = clamp(exp(-2.8 * shadowOpticalDepth), 0.28, 1.0);
mask = mix(1.0, integratedShadow, clamp(modGroundShadow * 0.5, 0.0, 1.0) * modEnable);
color.rgb *= mask;`, 'integrated cloud shadows on terrain');
  source = mustReplace(source,
    'float backFogDensity = backgroundFogDensity * depth;\ncolor = mix(color, vec4(backgroundFogColor.rgb, 1.0), clamp(backFogDensity, 0.0, 1.0));',
    `float distanceHaze = 0.0;
if (depth < 1.0) {
    float altitudeFade = exp(-max(elevation, 0.0) / 18000.0);
    float hazeDistance = 1.0 - exp(-distance * 0.0000032);
    distanceHaze = hazeDistance * 0.12 * modAerialPerspective * altitudeFade * modEnable;
}
float backFogDensity = clamp(backgroundFogDensity * depth + distanceHaze, 0.0, 0.90);
color = mix(color, vec4(backgroundFogColor.rgb, 1.0), backFogDensity);`,
    'distance aerial perspective');

  // A restrained solar aureole complements the physical Mie lobe without drawing a second sun disc.
  source = source.replace('void main() {', `vec3 gcm5AcesToneMap(vec3 x) {
    x = max(x, vec3(0.0));
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {`);
  source = mustReplace(source,
    'float exposure = 1.2;\ncolor = vec4(1.0 - exp(-exposure * color));',
    `if (depth >= 1.0) {
    vec3 localUp = normalize(czm_viewerPositionWC);
    float sunElevation = dot(localUp, lightDirection);
    float sunCosine = clamp(dot(direction, lightDirection), -1.0, 1.0);
    float sunAngle = acos(sunCosine);
    float broadHalo = exp(-pow(sunAngle / 0.040, 2.0));
    float tightHalo = exp(-pow(sunAngle / 0.012, 2.0));
    vec3 haloTint = mix(vec3(1.0, 0.58, 0.34), vec3(1.0, 0.91, 0.76), smoothstep(-0.06, 0.20, sunElevation));
    color.rgb += haloTint * (broadHalo * 0.035 + tightHalo * 0.045) * modSunHalo * modEnable;
    vec3 sunHorizontal = lightDirection - localUp * sunElevation;
    sunHorizontal *= inversesqrt(max(dot(sunHorizontal, sunHorizontal), 0.0001));
    float viewElevation = dot(direction, localUp);
    float horizonBand = exp(-abs(viewElevation) * 8.0);
    float sunAzimuthAlignment = pow(max(dot(direction, sunHorizontal), 0.0), 2.0);
    float goldenHour = 1.0 - smoothstep(-0.06, 0.24, sunElevation);
    float twilight = 1.0 - smoothstep(-0.18, 0.02, sunElevation);
    vec3 horizonTint = mix(vec3(1.0, 0.36, 0.12), vec3(0.86, 0.49, 0.32), twilight);
    float horizonGlow = horizonBand * sunAzimuthAlignment * goldenHour * modHorizonGlow * modEnable;
    color.rgb += horizonTint * horizonGlow * 0.055;
}
vec3 stockMappedColor = vec3(1.0) - exp(-1.2 * max(color.rgb, vec3(0.0)));
float exposure = 1.2 * mix(1.0, modSkyExposure, modEnable);
vec3 modMappedColor = gcm5AcesToneMap(color.rgb * exposure);
float mappedLuma = dot(modMappedColor, vec3(0.2126, 0.7152, 0.0722));
modMappedColor = mix(vec3(mappedLuma), modMappedColor, modSkySaturation);
vec3 mappedColor = mix(stockMappedColor, modMappedColor, modEnable);
color = vec4(clamp(mappedColor, 0.0, 1.0), 1.0);`,
    'filmic tone mapping and sun halo');
  source = source.replace('precision highp float;', 'precision highp float;\n// ' + MARK);
  return source;
}

function patchShaders() {
  const table = window.geofsShaders;
  if (!table || typeof table['atmosphereCommon.glsl'] !== 'string' ||
      typeof table['volumetricCloudsFS.glsl'] !== 'string' ||
      typeof table['atmosphereOnlyFS.glsl'] !== 'string') return false;
  if (table['atmosphereCommon.glsl'].includes(MARK)) { state.ready = true; state.active = true; return true; }

  const patchedCommon = patchCommon(table['atmosphereCommon.glsl']);
  const patchedCloud = patchCloudLighting(table['volumetricCloudsFS.glsl']);
  const patchedAtmosphere = patchAtmosphere(table['atmosphereOnlyFS.glsl']);
  state.originalShaders = {
    common: table['atmosphereCommon.glsl'],
    cloud: table['volumetricCloudsFS.glsl'],
    atmosphere: table['atmosphereOnlyFS.glsl']
  };
  table['atmosphereCommon.glsl'] = patchedCommon;
  table['volumetricCloudsFS.glsl'] = patchedCloud;
  table['atmosphereOnlyFS.glsl'] = patchedAtmosphere;
  state.active = true;
  state.ready = true;
  return true;
}

function installStageUniforms() {
  if (!window.Cesium || !Cesium.PostProcessStage || state.stageProxyInstalled) return;
  const OriginalStage = Cesium.PostProcessStage;
  state.originalPostProcessStage = OriginalStage;
  Cesium.PostProcessStage = new Proxy(OriginalStage, {
    construct(target, args, newTarget) {
      let options = args[0] || {};
      if (typeof options.fragmentShader === 'string' && options.fragmentShader.includes(MARK)) {
        if (state.settings.enabled && options.fragmentShader.includes('vec4 calculate_clouds(') && Number.isFinite(options.textureScale)) {
          const quality = Number((window.geofs && geofs.fx && geofs.fx.atmosphere && geofs.fx.atmosphere.quality) || 7);
          const boost = quality >= 7 ? 0.70 : (quality >= 5 ? 0.62 : options.textureScale);
          if (boost > options.textureScale) options = Object.assign({}, options, { textureScale: boost });
          state.cloudRenderScale = options.textureScale;
        }
        const get = key => () => state.settings[key];
        const uniforms = Object.assign({}, options.uniforms || {}, {
          modEnable: () => state.settings.enabled,
          modMorphology: get('morphology'), modCloudOpacity: get('cloudOpacity'),
          modDetail: get('detail'), modLayering: get('layering'), modCirrus: get('cirrus'),
          modStratus: get('stratus'), modAnvil: get('anvil'), modFlatBases: get('flatBases'),
          modTopVariation: get('topVariation'), modWindEvolution: get('windEvolution'),
          modLighting: get('lighting'), modSilver: get('silverLining'), modPowder: get('powder'),
          modSelfShadow: get('selfShadow'), modGroundShadow: get('groundShadow'),
          modFlyThrough: get('flyThrough'), modLightning: get('lightning'),
          modAerialPerspective: get('aerialPerspective'), modBoundaryFog: get('boundaryFog'),
          modSkyRayleigh: get('skyRayleigh'), modSkyMie: get('skyMie'),
          modRayleighScale: get('rayleighScale'), modMieScale: get('mieScale'),
          modAtmoDensity: get('atmoDensity'), modOzone: get('ozone'), modMieG: get('mieG'),
          modAerosolAngstrom: get('aerosolAngstrom'), modHazeBoundary: get('hazeBoundary'),
          modHazeTopKm: get('hazeTopKm'), modHazeEdgeKm: get('hazeEdgeKm'),
          modFreeHaze: get('freeHaze'), modBrownAbsorption: get('brownAbsorption'),
          modWhiteBalance: get('whiteBalance'), modSkyExposure: get('skyExposure'),
          modSkySaturation: get('skySaturation'), modSunHalo: get('sunHalo'),
          modTwilight: get('twilight'), modHorizonGlow: get('horizonGlow'), modGlory: get('glory'),
          modClock: () => performance.now() * 0.001
        });
        args[0] = Object.assign({}, options, { uniforms });
      }
      return Reflect.construct(target, args, newTarget);
    }
  });
  state.stageProxyInstalled = true;
}

function wrapAtmosphereCreate() {
  const atmosphere = window.geofs && geofs.fx && geofs.fx.atmosphere;
  if (!atmosphere || typeof atmosphere.create !== 'function' || state.createWrapped) return;
  state.originalCreate = atmosphere.create;
  state.originalDestroy = atmosphere.destroy;
  const originalCreate = state.originalCreate;
  const originalDestroy = state.originalDestroy;
  atmosphere.create = function () {
    patchShaders();
    installStageUniforms();
    if (this.postProcessingStages && typeof originalDestroy === 'function') originalDestroy.call(this);
    const result = originalCreate.apply(this, arguments);
    state.rendererRebuilt = true;
    return result;
  };
  state.createWrapped = true;
}

function updateRenderer() {
  try {
    const atm = window.geofs && geofs.fx && geofs.fx.atmosphere;
    if (atm && atm.postProcessingStages && typeof state.originalCreate === 'function') {
      if (typeof state.originalDestroy === 'function') state.originalDestroy.call(atm);
      const args = [!!atm.advancedAtmosphere, Number.isFinite(atm.quality) ? atm.quality : 7, !!atm.volumetricClouds, !!atm.realTimeClouds, !!atm.retro];
      state.originalCreate.apply(atm, args);
      return true;
    }
  } catch (error) { state.error = String(error); }
  return false;
}

function getNativePreferencePanel() {
  if (window.geofs && geofs.$preferencePanel) {
    const panel = geofs.$preferencePanel[0] || geofs.$preferencePanel;
    if (panel && panel.querySelector) return panel;
  }
  return document.querySelector('.geofs-preferences');
}
function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

const controlGroups = [
  { title: '空の色・太陽光・色再現', controls: [
    ['skyRayleigh','Rayleigh散乱スペクトル（青空）',0.55,1.55,0.01],
    ['skyMie','Mie散乱（太陽周辺の霞）',0.45,1.8,0.01],
    ['ozone','オゾン吸収（夕暮れの青さ）',0.45,1.65,0.01],
    ['mieG','エアロゾル前方散乱・太陽ハロー',0.55,0.92,0.01],
    ['aerosolAngstrom','エアロゾル粒子の色（湿潤〜微粒子）',0,2,0.01],
    ['whiteBalance','昼光ホワイトバランス',0,1,0.01],
    ['skyExposure','大気・画面露出',0.65,1.6,0.01],
    ['skySaturation','色の自然さ・彩度',0.65,1.35,0.01],
    ['sunHalo','太陽周辺の散乱ハロー',0,1.5,0.01],
    ['twilight','薄明時の青い環境光',0,1.5,0.01],
    ['horizonGlow','朝夕の地平線グロー',0,1.5,0.01]
  ]},
  { title: '層状ヘイズ・大気遠近', controls: [
    ['hazeBoundary','地表境界層ヘイズの濃さ',0,2,0.01],
    ['hazeTopKm','境界層ヘイズの上端（km）',0.3,4.0,0.01],
    ['hazeEdgeKm','ヘイズ上端の境界幅（km）',0.05,0.9,0.01],
    ['freeHaze','自由対流圏の薄い霞',0,1.5,0.01],
    ['brownAbsorption','煙・黄砂系の吸収',0,1,0.01],
    ['aerialPerspective','遠景の大気遠近',0,2,0.01],
    ['boundaryFog','GeoFS体積フォグとの合成',0,2,0.01],
    ['atmoDensity','大気全体の光学密度',0.55,1.65,0.01],
    ['rayleighScale','Rayleighスケール高度',0.65,1.35,0.01],
    ['mieScale','Mieスケール高度',0.55,1.65,0.01]
  ]},
  { title: '雲の形状・雲種', controls: [
    ['morphology','雲の形状変化',0,2,0.01], ['cloudOpacity','雲の光学厚・密度',0,2,0.01],
    ['detail','雲表面の細部',0,2,0.01], ['stratus','層雲・層積雲の構造',0,2,0.01],
    ['layering','雲内部の層構造',0,2,0.01], ['cirrus','上層の巻雲状構造',0,2,0.01],
    ['anvil','積乱雲・かなとこ雲',0,2,0.01], ['flatBases','平坦な雲底',0,2,0.01],
    ['topVariation','雲頂の局所的な高さ変化',0,2,0.01], ['windEvolution','風による雲の移流',0,2,0.01]
  ]},
  { title: '雲の光・影・光学現象', controls: [
    ['lighting','雲内部の散乱光',0,2,0.01], ['silverLining','太陽側の銀縁光',0,2,0.01],
    ['powder','Powder効果',0,1,0.01], ['selfShadow','雲内部の自己遮蔽',0,2,0.01],
    ['groundShadow','地表に落ちる雲影',0,2,0.01], ['flyThrough','雲内・雲際の視程低下',0,2,0.01],
    ['glory','雲頂のグローリー近似',0,1,0.01], ['lightning','雷雨雲内の発光フラッシュ',0,1,0.01]
  ]}
];
const builtInPresets = {
  'MSFS-inspired Natural': Object.assign({}, defaults),
  'Clear Alpine': Object.assign({}, defaults, { hazeBoundary:0.28,hazeTopKm:1.1,hazeEdgeKm:0.12,freeHaze:0.12,brownAbsorption:0,skyRayleigh:1.08,skyMie:0.75,ozone:1.12,mieG:0.69,aerosolAngstrom:1.25,whiteBalance:0.9,skyExposure:1.03,skySaturation:1.02,sunHalo:0.38,atmoDensity:0.88, morphology:0.88,cloudOpacity:1.05,layering:0.42,cirrus:0.68,stratus:0.52,anvil:0.35,lighting:1.0,silverLining:0.68,powder:0.35,selfShadow:0.86,glory:0.25,groundShadow:0.82,lightning:0 }),
  'Cumulus Day': Object.assign({}, defaults, { hazeBoundary:0.55,hazeTopKm:1.6,freeHaze:0.25,skyRayleigh:1.0,skyMie:0.92,ozone:1.0,mieG:0.73,aerosolAngstrom:1.0,whiteBalance:0.85,skyExposure:1.08,sunHalo:0.48,morphology:1.28,cloudOpacity:1.34,detail:1.35,anvil:0.9,flatBases:1.35,lighting:1.2,silverLining:0.94,powder:0.64,selfShadow:1.25,glory:0.44,groundShadow:1.10,flyThrough:0.86,lightning:0 }),
  'Stratocumulus Overcast': Object.assign({}, defaults, { hazeBoundary:1.25,hazeTopKm:1.8,freeHaze:0.7,brownAbsorption:0.04,skyRayleigh:0.92,skyMie:1.24,ozone:1.0,mieG:0.78,aerosolAngstrom:0.35,whiteBalance:0.78,skyExposure:0.92,skySaturation:0.9,sunHalo:0.25,atmoDensity:1.18,morphology:0.94,cloudOpacity:1.42,detail:0.86,layering:1.55,cirrus:0.72,stratus:1.7,anvil:0.2,lighting:0.92,silverLining:0.4,powder:0.30,selfShadow:1.15,groundShadow:1.3,flyThrough:0.65,lightning:0 }),
  'Thunderstorm': Object.assign({}, defaults, { hazeBoundary:1.5,hazeTopKm:2.4,freeHaze:0.88,brownAbsorption:0.08,skyRayleigh:0.87,skyMie:1.42,ozone:0.98,mieG:0.82,aerosolAngstrom:0.55,whiteBalance:0.78,skyExposure:0.90,skySaturation:0.88,sunHalo:0.3,atmoDensity:1.35,morphology:1.45,cloudOpacity:1.55,detail:1.42,layering:0.62,cirrus:1.0,anvil:1.85,flatBases:0.84,topVariation:1.8,windEvolution:1.3,lighting:1.25,silverLining:1.0,powder:0.48,selfShadow:1.7,groundShadow:1.45,flyThrough:1.25,lightning:0.95,glory:0.1 }),
  'Hazy Sunset': Object.assign({}, defaults, { hazeBoundary:1.35,hazeTopKm:1.8,hazeEdgeKm:0.28,freeHaze:1.05,brownAbsorption:0.22,skyRayleigh:1.0,skyMie:1.52,ozone:1.22,mieG:0.84,aerosolAngstrom:0.65,whiteBalance:0.88,skyExposure:1.12,skySaturation:1.08,sunHalo:0.86,atmoDensity:1.24,aerialPerspective:1.6,morphology:0.9,cloudOpacity:0.96,detail:0.9,layering:0.75,cirrus:1.3,stratus:0.9,anvil:0.3,lighting:0.96,silverLining:1.08,powder:0.34,selfShadow:0.82,groundShadow:0.5,flyThrough:0.35,lightning:0 }),
  'Clean Blue Hour': Object.assign({}, defaults, { hazeBoundary:0.38,hazeTopKm:1.3,freeHaze:0.20,skyRayleigh:1.18,skyMie:0.82,ozone:1.38,mieG:0.70,aerosolAngstrom:1.25,whiteBalance:0.7,skyExposure:0.94,skySaturation:1.13,sunHalo:0.44,atmoDensity:0.94,aerialPerspective:0.75 })
};

function refreshControlUI(root) {
  if (!root) return;
  root.querySelectorAll('[data-gcm5-key]').forEach(input => {
    const key = input.dataset.gcm5Key;
    if (!(key in state.settings)) return;
    if (input.type === 'checkbox') input.checked = !!state.settings[key];
    else input.value = state.settings[key];
    const output = root.querySelector(`[data-gcm5-out="${key}"]`);
    if (output) output.textContent = Number(state.settings[key]).toFixed(2);
  });
  const name = root.querySelector('#gcm5-current-preset');
  if (name) name.textContent = state.presetName;
  const toggle = root.querySelector('#gcm5-master');
  if (toggle) toggle.checked = !!state.settings.enabled;
}
function applyPreset(name, root) {
  const preset = builtInPresets[name];
  if (!preset) return false;
  state.settings = normalizeSettings(Object.assign({}, defaults, preset));
  state.presetName = name;
  state.saveSettings();
  refreshControlUI(root || document.getElementById('geofs-msfs-sky-atmosphere-mod-v5'));
  return true;
}
function readCustomPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch (_) { return {}; }
}
function writeCustomPresets(presets) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch (_) {}
}
function updatePresetSelect(root) {
  const select = root && root.querySelector('#gcm5-preset-select');
  if (!select) return;
  const custom = readCustomPresets();
  const names = Object.keys(custom);
  select.innerHTML = '<option value="">プリセットを選択…</option>' +
    Object.keys(builtInPresets).map(name => `<option value="builtin:${htmlEscape(name)}">${htmlEscape(name)}</option>`).join('') +
    names.map(name => `<option value="custom:${htmlEscape(name)}">${htmlEscape(name)}（保存済み）</option>`).join('');
}
function applySelectedPreset(root) {
  const select = root.querySelector('#gcm5-preset-select');
  if (!select || !select.value) return;
  const [type, ...parts] = select.value.split(':');
  const name = parts.join(':');
  if (type === 'builtin') applyPreset(name, root);
  else {
    const preset = readCustomPresets()[name];
    if (preset && typeof preset === 'object') {
      state.settings = normalizeSettings(Object.assign({}, defaults, preset));
      state.presetName = name;
      state.saveSettings();
      refreshControlUI(root);
    }
  }
}
function saveCurrentPreset(root) {
  const name = window.prompt('プリセット名を入力してください', state.presetName || 'My Weather Look');
  if (!name || !name.trim()) return;
  const cleanName = name.trim().slice(0, 48);
  const custom = readCustomPresets();
  custom[cleanName] = Object.assign({}, state.settings);
  writeCustomPresets(custom);
  state.presetName = cleanName;
  updatePresetSelect(root);
  root.querySelector('#gcm5-current-preset').textContent = cleanName;
}
function exportPresets() {
  const payload = { format:'GeoFS-MSFS-Atmosphere-Mod-Presets', version:5, presets:readCustomPresets(), active:Object.assign({},state.settings) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'GeoFS_MSFS_Atmosphere_Presets.json';
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function importPresetFile(file, root) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      const imported = data.presets && typeof data.presets === 'object' ? data.presets : { 'Imported preset': data.active || data };
      const custom = readCustomPresets();
      let count = 0;
      for (const [name, values] of Object.entries(imported)) {
        if (!values || typeof values !== 'object') continue;
        const clean = {};
        for (const key of Object.keys(defaults)) {
          if (typeof values[key] === 'number' && Number.isFinite(values[key])) { const [lo, hi] = ranges[key] || [0,2]; clean[key] = key === 'enabled' ? (values[key] ? 1 : 0) : clamp(values[key], lo, hi); }
        }
        if (Object.keys(clean).length) { custom[String(name).slice(0,48)] = Object.assign({}, defaults, clean); count++; }
      }
      if (count < 1) throw new Error('設定値を読み取れませんでした');
      writeCustomPresets(custom); updatePresetSelect(root);
      window.alert(`${count}件のプリセットを読み込みました。`);
    } catch (error) { window.alert('プリセットを読み込めませんでした: ' + error.message); }
  };
  reader.readAsText(file);
}

function buildNativeUI() {
  if (state.nativeUi) return true;
  const alreadyMounted = document.getElementById('geofs-msfs-sky-atmosphere-mod-v5');
  if (alreadyMounted) { state.nativeUi = true; return true; }
  const panel = getNativePreferencePanel();
  if (!panel) return false;

  const section = document.createElement('section');
  section.id = 'geofs-msfs-sky-atmosphere-mod-v5';
  section.className = 'geofs-msfs-atmosphere-mod geofs-preference-controls geofs-advanced-atmosphere-settings';
  section.style.cssText = 'display:block;box-sizing:border-box;margin:14px 0 10px;padding:12px 12px 14px;border:1px solid rgba(130,160,185,.48);border-radius:5px;background:rgba(20,35,48,.34);color:inherit;font-size:13px;line-height:1.45;';
  const groupsHtml = controlGroups.map((group, index) => `<details ${index === 0 ? 'open' : ''} style="margin-top:9px;border-top:1px solid rgba(130,160,185,.28);padding-top:7px"><summary style="font-weight:600;cursor:pointer;padding:5px 0">${htmlEscape(group.title)}</summary><div style="padding:4px 2px">${group.controls.map(([key,label,min,max,step]) => `<label style="display:block;margin:9px 0 7px"><span style="display:flex;justify-content:space-between;gap:10px"><span>${htmlEscape(label)}</span><output data-gcm5-out="${key}" style="font-variant-numeric:tabular-nums">${state.settings[key].toFixed(2)}</output></span><input data-gcm5-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.settings[key]}" style="width:100%;accent-color:#4e9acb;touch-action:pan-y"></label>`).join('')}</div></details>`).join('');
  section.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div><div style="font-size:15px;font-weight:700;letter-spacing:.02em">MSFS SKY, LIGHTING & WEATHER MOD</div><div style="font-size:10px;opacity:.72">GeoFS標準レンダラー拡張 · v5.2.0</div></div>
      <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" style="white-space:nowrap"><input id="gcm5-master" type="checkbox" class="mdl-switch__input" ${state.settings.enabled ? 'checked' : ''}><span class="mdl-switch__label">MOD ON</span></label>
    </div>
    <div style="margin-top:10px;padding:8px;border-left:3px solid #65a8d2;background:rgba(95,155,195,.10);font-size:11px">GeoFSのOptions → Graphics → Advanced内に統合。空色・太陽光・層状ヘイズは大気散乱計算そのものを拡張し、ライブ天候はGeoFS標準の雲量・風・太陽方向を引き継ぎます。</div>
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px">
      <select id="gcm5-preset-select" style="flex:1;min-width:150px;max-width:100%;padding:7px;border-radius:3px;background:rgba(0,0,0,.12);color:inherit;border:1px solid rgba(130,160,185,.5)"><option value="">プリセットを選択…</option></select>
      <button id="gcm5-load-preset" type="button" class="mdl-button mdl-js-button mdl-button--raised">読込</button>
    </div>
    <div style="font-size:10px;opacity:.72;margin:5px 0 8px">現在のプリセット: <strong id="gcm5-current-preset">${htmlEscape(state.presetName)}</strong></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:7px 0">
      <button id="gcm5-save-preset" type="button" class="mdl-button mdl-js-button mdl-button--raised">名前を付けて保存</button>
      <button id="gcm5-export" type="button" class="mdl-button mdl-js-button">JSON書出</button>
      <button id="gcm5-import-trigger" type="button" class="mdl-button mdl-js-button">JSON読込</button>
      <input id="gcm5-import-file" type="file" accept="application/json,.json" style="display:none">
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:7px 0 10px">
      <button id="gcm5-native-enable" type="button" class="mdl-button mdl-js-button mdl-button--raised">GeoFS標準の高度な大気・ボリュメトリック雲をON</button>
      <button id="gcm5-reset" type="button" class="mdl-button mdl-js-button">設定初期化</button>
    </div>
    <div style="font-size:10px;opacity:.74;margin:4px 0 8px">下の各機能は飛行中に即時反映されます。大気散乱はピクセルごとに太陽方向・高度・視線距離を積分します。高負荷時はGeoFSの散乱品質を下げるか雲の細部を抑えてください。</div>
    ${groupsHtml}
    <div id="gcm5-status" role="status" style="font-size:10px;opacity:.72;margin-top:9px;border-top:1px solid rgba(130,160,185,.28);padding-top:8px">シェーダー状態を確認中…</div>`;

  // Add the controls as a child of GeoFS's actual Options > Graphics > Advanced container.
  // Do not fall back to an unrelated panel or a floating overlay.
  const advancedGraphics = panel.querySelector('.geofs-advancedGraphics');
  if (!advancedGraphics) return false;
  advancedGraphics.appendChild(section);

  const setControl = (input) => {
    const key = input.dataset.gcm5Key;
    if (!(key in state.settings)) return;
    state.settings[key] = input.type === 'checkbox' ? (input.checked ? 1 : 0) : clamp(Number(input.value), Number(input.min), Number(input.max));
    const out = section.querySelector(`[data-gcm5-out="${key}"]`);
    if (out) out.textContent = Number(state.settings[key]).toFixed(2);
    state.saveSettings();
  };
  section.addEventListener('input', event => {
    if (event.target.matches('[data-gcm5-key]')) setControl(event.target);
  });
  section.addEventListener('change', event => {
    if (event.target.matches('[data-gcm5-key]')) setControl(event.target);
  });
  section.querySelector('#gcm5-master').addEventListener('change', event => {
    state.settings.enabled = event.target.checked ? 1 : 0;
    state.saveSettings();
  });
  section.querySelector('#gcm5-load-preset').addEventListener('click', () => applySelectedPreset(section));
  section.querySelector('#gcm5-save-preset').addEventListener('click', () => saveCurrentPreset(section));
  section.querySelector('#gcm5-export').addEventListener('click', exportPresets);
  section.querySelector('#gcm5-import-trigger').addEventListener('click', () => section.querySelector('#gcm5-import-file').click());
  section.querySelector('#gcm5-import-file').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (file) importPresetFile(file, section);
    event.target.value = '';
  });
  section.querySelector('#gcm5-reset').addEventListener('click', () => {
    state.settings = Object.assign({}, defaults); state.presetName = 'MSFS-inspired Natural';
    state.saveSettings(); refreshControlUI(section);
  });
  section.querySelector('#gcm5-native-enable').addEventListener('click', enableNativeRequirements);

  updatePresetSelect(section);
  refreshControlUI(section);
  try { if (window.componentHandler && typeof componentHandler.upgradeDom === 'function') componentHandler.upgradeDom(); } catch (_) {}
  state.nativeUi = true;
  updateUiStatus();
  return true;
}

function updateUiStatus() {
  const node = document.querySelector('#gcm5-status');
  if (!node) return;
  const atm = window.geofs && geofs.fx && geofs.fx.atmosphere;
  const advanced = !!(geofs && geofs.preferences && geofs.preferences.graphics && geofs.preferences.graphics.advancedAtmosphere);
  const clouds = !!(geofs && geofs.preferences && geofs.preferences.graphics && geofs.preferences.graphics.volumetricClouds);
  node.textContent = `大気シェーダー: ${state.ready ? 'v5拡張済み' : '待機中'} · GeoFS高度な大気: ${advanced ? 'ON' : 'OFF'} · ボリュメトリック雲: ${clouds ? 'ON' : 'OFF'} · 雲描画倍率: ${state.cloudRenderScale || '標準'}`;
}
function enableNativeRequirements() {
  try {
    if (!window.geofs || !geofs.preferences || !geofs.preferences.graphics) throw new Error('GeoFS設定がまだ初期化されていません');
    geofs.preferences.graphics.advancedAtmosphere = true;
    geofs.preferences.graphics.volumetricClouds = true;
    if (typeof geofs.api?.renderingQuality === 'function') {
      const quality = Number(geofs.preferences.graphics.quality || 0);
      geofs.api.renderingQuality(quality, true);
    } else {
      if (typeof geofs.fx?.atmosphere?.create === 'function') {
        geofs.fx.atmosphere.create(true, geofs.preferences.graphics.advanced?.scatteringQuality || 7, true, !geofs.preferences.weather?.manual);
      }
    }
    if (typeof geofs.setPreferenceValues === 'function' && geofs.$preferencePanel) geofs.setPreferenceValues(geofs.$preferencePanel, true);
    if (typeof geofs.savePreferences === 'function') geofs.savePreferences();
    updateUiStatus();
    log('GeoFS native atmosphere and volumetric clouds enabled');
  } catch (error) {
    state.error = String(error);
    const node = document.querySelector('#gcm5-status');
    if (node) node.textContent = 'GeoFS標準機能のONに失敗: ' + state.error;
  }
}

function installCloudManagerCompatibility() {
  const cm = window.geofs && geofs.fx && geofs.fx.cloudManager;
  if (!cm || cm.__msfsAtmosphereModV52) return;
  state.originalSpawnClouds = cm.spawnClouds;
  cm.spawnClouds = function () {
    const atm = window.geofs && geofs.fx && geofs.fx.atmosphere;
    if (state.active && atm && atm.volumetricClouds) return;
    if (typeof state.originalSpawnClouds === 'function') return state.originalSpawnClouds.apply(this, arguments);
  };
  cm.__msfsAtmosphereModV52 = true;
  const atm = window.geofs && geofs.fx && geofs.fx.atmosphere;
  if (atm && atm.volumetricClouds && typeof cm.destroyAllClouds === 'function') cm.destroyAllClouds();
}

function initialize() {
  try {
    if (!window.geofs || !window.geofsShaders) return false;
    patchShaders();
    installStageUniforms();
    wrapAtmosphereCreate();
    installCloudManagerCompatibility();
    const currentAtmo = geofs.fx && geofs.fx.atmosphere;
    if (!state.rendererRebuilt && currentAtmo && currentAtmo.postProcessingStages && state.originalCreate) {
      if (updateRenderer()) state.rendererRebuilt = true;
    }
    buildNativeUI();
    updateUiStatus();
    return true;
  } catch (error) {
    state.error = String(error && error.stack || error);
    console.error('[GeoFS MSFS Sky Atmosphere Mod 5]', error);
    const node = document.querySelector('#gcm5-status');
    if (node) node.textContent = '初期化エラー: ' + state.error;
    return false;
  }
}

function disable() {
  try {
    if (state.originalShaders && window.geofsShaders) {
      geofsShaders['atmosphereCommon.glsl'] = state.originalShaders.common;
      geofsShaders['volumetricCloudsFS.glsl'] = state.originalShaders.cloud;
      geofsShaders['atmosphereOnlyFS.glsl'] = state.originalShaders.atmosphere;
    }
    const atm = window.geofs && geofs.fx && geofs.fx.atmosphere;
    if (atm && state.createWrapped) atm.create = state.originalCreate;
    const cm = window.geofs && geofs.fx && geofs.fx.cloudManager;
    if (cm && state.originalSpawnClouds) { cm.spawnClouds = state.originalSpawnClouds; delete cm.__msfsAtmosphereModV52; }
    if (state.stageProxyInstalled && window.Cesium) Cesium.PostProcessStage = state.originalPostProcessStage;
    const root = document.getElementById('geofs-msfs-sky-atmosphere-mod-v5');
    if (root) root.remove();
    if (state.observer) state.observer.disconnect();
    state.active = false; state.ready = false;
    log('shader sources restored; reload GeoFS to rebuild the stock GPU programs');
  } catch (error) { state.error = String(error); }
}

state.applyPreset = name => applyPreset(name, document.getElementById('geofs-msfs-sky-atmosphere-mod-v5'));
state.enableNativeRequirements = enableNativeRequirements;
state.status = () => ({ version:state.version, active:state.active, ready:state.ready, nativeUi:state.nativeUi, error:state.error, cloudRenderScale:state.cloudRenderScale, settings:Object.assign({},state.settings) });
state.disable = disable;

const poll = setInterval(() => initialize(), 650);
setTimeout(() => clearInterval(poll), 90000);
if (document.body && window.MutationObserver) {
  state.observer = new MutationObserver(() => {
    if (!state.nativeUi) { try { buildNativeUI(); updateUiStatus(); } catch (_) {} }
  });
  state.observer.observe(document.body, { childList:true, subtree:true });
}
log('waiting for GeoFS rendering pipeline and native Options panel');
})();
