/*
 * GeoFS MSFS-inspired Visual Complete — consolidated beta edition
 * Target: the supplied GeoFS beta and its GeoFS-patched Cesium 1.136.0.
 * Requires the three PNG atlases in ./visual-assets/ on the same GitHub branch.
 * Run only once after a clean GeoFS page reload. No userscript manager needed.
 *
 * This is an integration of supported GeoFS/Cesium rendering paths. It does not
 * replace missing DEM, photogrammetry, biome, grass-mesh, or weather datasets.
 */
(() => {
  "use strict";

  const W = window;
  const C = W.Cesium;
  const G = W.geofs;
  const API = G?.api;
  const KEY = "__GEOFS_MSFS_VISUAL_COMPLETE__";
  const VERSION = "1.1.1";
  const REPO_ROOT = "https://raw.githubusercontent.com/supermanone-boop/model/refs/heads/main";
  const ASSET_ROOT = `${REPO_ROOT}/visual-assets`;
  const ASSETS = {
    albedo: `${ASSET_ROOT}/GeoFS_Surface_Albedo_Atlas.png`,
    normal: `${ASSET_ROOT}/GeoFS_Surface_Normal_Atlas.png`,
    nrma: `${ASSET_ROOT}/GeoFS_Surface_NRMA_Atlas.png`
  };

  if (!C || C.VERSION !== "1.136.0" || !API?.viewer?.scene || !C.Material || !W.geofsShaders) {
    console.error("[GeoFS Visual Complete] This build requires the supplied GeoFS beta with Cesium 1.136.0. Nothing was changed.");
    return;
  }
  if (W[KEY]?.installed) {
    if (W[KEY].version === VERSION) {
      W[KEY].refresh();
      console.info("[GeoFS Visual Complete] Already installed; refreshed existing edition.");
      return;
    }
    if (typeof W[KEY].restore === "function") {
      const restored = W[KEY].restore();
      if (restored !== true) {
        console.error("[GeoFS Visual Complete] Previous edition could not be restored. Reload GeoFS before installing this update.");
        return;
      }
      console.info("[GeoFS Visual Complete] Previous edition restored; upgrading to " + VERSION + ".");
    } else {
      console.error("[GeoFS Visual Complete] An older edition is active. Reload GeoFS before installing this update.");
      return;
    }
  }

  const viewer = API.viewer;
  const scene = viewer.scene;
  const globe = scene.globe;
  const post = scene.postProcessStages;
  const mobile = !!G.preferences?.mobile || /Android|iPhone|iPad|Mobile/i.test(W.navigator?.userAgent || "");
  const qualityMap = G.configuration?.current?.renderingQualityLevels || {};
  const qualityKeys = Object.keys(qualityMap).map(Number).filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  const highestPreset = qualityKeys.length ? qualityKeys[qualityKeys.length - 1] : null;
  if (highestPreset === null) {
    console.error("[GeoFS Visual Complete] Could not detect a valid GeoFS graphics-quality preset. Nothing was changed.");
    return;
  }

  const treeShaderText = `
vec3 gvcSrgbToLinear(vec3 c)
{
    c = max(c, vec3(0.0));
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
{
    vec4 texel = texture(u_treeTexture, fsInput.attributes.texCoord_0);
    if (texel.a < 0.48) discard;

    vec3 albedo = gvcSrgbToLinear(texel.rgb);
    vec3 N = normalize(fsInput.attributes.normalEC);
    if (!gl_FrontFacing) N = -N;

    material.baseColor = vec4(albedo, 1.0);
    material.diffuse = albedo;
    material.alpha = 1.0;
    material.specular = vec3(0.032, 0.038, 0.026);
    material.roughness = 0.88;
    material.normalEC = N;
    material.occlusion = 0.90;
    material.emissive = vec3(0.0);

    // Preserve GeoFS seasonal foliage, but avoid the previous UNLIT-only output.
    if (czm_lightColor.z < 0.12) {
        material.diffuse *= 0.035;
        material.emissive = albedo * 0.035;
    }
}
`;

  const buildingShaderText = `
vec3 gvcBuildingSrgbToLinear(vec3 c)
{
    c = max(c, vec3(0.0));
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
{
    vec2 uv = fsInput.attributes.texCoord_0;
    vec4 texel = texture(u_buildingTexture, uv);
    vec4 vertexColor = fsInput.attributes.color_0;
    if (!u_isSnowy) texel.rgb *= vertexColor.rgb;

    vec3 albedo = gvcBuildingSrgbToLinear(clamp(texel.rgb, 0.0, 1.0));
    vec3 N = normalize(fsInput.attributes.normalEC);
    vec3 V = normalize(-fsInput.attributes.positionEC);
    float specMask = 0.0;
    #ifdef BUILDINGS_REFLECTION
        specMask = clamp(texture(u_specularTexture, uv).r, 0.0, 1.0);
    #endif

    // The beta's existing specular map is reused as a material mask. It is not
    // a true packed ORM map, so metallic remains deliberately low.
    float roughness = clamp(mix(0.94, 0.28, pow(specMask, 1.1)), 0.22, 0.98);
    float metallic = clamp(specMask * 0.10, 0.0, 0.10);
    vec3 F0 = mix(vec3(0.04), albedo, metallic);

    material.baseColor = vec4(albedo, texel.a);
    material.diffuse = albedo * (1.0 - metallic);
    material.alpha = 1.0;
    material.specular = F0;
    material.roughness = roughness;
    material.normalEC = N;
    material.occlusion = 1.0;
    material.emissive = vec3(0.0);

    #ifdef BUILDINGS_REFLECTION
        vec3 reflectedEC = reflect(-V, N);
        vec3 reflectedWC = normalize(czm_inverseViewRotation * reflectedEC);
        vec2 environmentUv = vec2(reflectedWC.x, (reflectedWC.z - reflectedWC.y) / 3.0);
        vec3 environmentColor = gvcBuildingSrgbToLinear(texture(u_environmentTexture, environmentUv).rgb);
        material.emissive += environmentColor * F0 * specMask * 0.16;
    #endif

    // GeoFS swaps to a baked night texture and updates czm_lightColor at night.
    if (czm_lightColor.z < 0.12) {
        material.diffuse *= 0.025;
        material.emissive += albedo * 0.72;
    }
}
`;

  const groundShader = `
uniform sampler2D surfaceAlbedo;
uniform sampler2D surfaceNormal;
uniform sampler2D surfaceNRMA;
uniform float detailStrength;
uniform float normalStrength;
uniform float overlayOpacity;
uniform float wetness;
uniform float snowCoverage;
uniform float textureBlend;
uniform float grassStrength;
uniform float rockStrength;
uniform float detailScale;

const float GVC_PI = 3.141592653589793;

vec3 gvcGroundSrgbToLinear(vec3 c)
{
    c = max(c, vec3(0.0));
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

float gvcDggx(float NoH, float alpha)
{
    float a2 = alpha * alpha;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / max(GVC_PI * d * d, 0.00001);
}

float gvcG1(float NoX, float k)
{
    return NoX / max(NoX * (1.0 - k) + k, 0.0001);
}

vec3 gvcFresnel(float VoH, vec3 F0)
{
    float f = pow(clamp(1.0 - VoH, 0.0, 1.0), 5.0);
    return F0 + (1.0 - F0) * f;
}

vec2 gvcAtlasUv(float cell, vec2 uv)
{
    // Horizontal 4x1 atlas: grass | soil | rock | sand.
    // Keep a small inner margin so bilinear filtering does not cross cells.
    vec2 localUv = vec2(0.008) + fract(uv) * 0.984;
    return vec2((clamp(cell, 0.0, 3.0) + localUv.x) * 0.25, localUv.y);
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec3 imageSRGB = clamp(materialInput.layerColor.rgb, 0.0, 1.0);
    float imageMax = max(max(imageSRGB.r, imageSRGB.g), imageSRGB.b);
    float imageMin = min(min(imageSRGB.r, imageSRGB.g), imageSRGB.b);
    float imageLuma = dot(imageSRGB, vec3(0.2126, 0.7152, 0.0722));
    if (imageMax < 0.015) {
        material.diffuse = vec3(0.0);
        material.alpha = 0.0;
        return material;
    }

    vec3 imageLinear = gvcGroundSrgbToLinear(imageSRGB);
    float saturation = (imageMax - imageMin) / max(imageMax, 0.025);
    float greenDom = imageSRGB.g - max(imageSRGB.r, imageSRGB.b);
    float redDom = imageSRGB.r - imageSRGB.g;
    float blueDom = imageSRGB.b - max(imageSRGB.r, imageSRGB.g);

    // Heuristic masks only guide texture choice; the satellite image remains
    // the base surface. Grey urban areas and blue water receive little overlay.
    float vegetation = smoothstep(0.025, 0.145, greenDom)
                     * smoothstep(0.10, 0.34, imageLuma)
                     * (1.0 - smoothstep(0.78, 0.97, imageLuma));
    vegetation = clamp(vegetation * grassStrength, 0.0, 1.0);
    float slope = clamp(materialInput.slope, 0.0, 1.5707963);
    float rock = smoothstep(0.38, 1.08, slope) * (1.0 - vegetation * 0.82);
    rock = clamp(rock * rockStrength, 0.0, 1.0);
    float sand = smoothstep(0.04, 0.18, redDom)
               * smoothstep(0.28, 0.68, imageLuma)
               * (1.0 - vegetation) * (1.0 - rock);
    float neutral = 1.0 - smoothstep(0.10, 0.28, saturation);
    float paved = neutral * smoothstep(0.16, 0.52, imageLuma)
                * (1.0 - smoothstep(0.35, 0.90, slope));
    float waterHint = smoothstep(0.035, 0.16, blueDom)
                    * smoothstep(0.08, 0.28, imageSRGB.b);

    float cell = 1.0;
    if (vegetation > 0.30) cell = 0.0;
    else if (rock > 0.28) cell = 2.0;
    else if (sand > 0.28) cell = 3.0;

    // Reconstruct a stable local ECEF position from the camera and eye vector.
    vec3 positionWC = czm_viewerPositionWC + czm_inverseViewRotation * (-materialInput.positionToEyeEC);
    float radius = max(length(positionWC), 1.0);
    float latitude = asin(clamp(positionWC.z / radius, -1.0, 1.0));
    float longitude = atan(positionWC.y, positionWC.x);
    vec2 worldMeters = vec2(longitude * 6378137.0 * max(cos(latitude), 0.06), latitude * 6378137.0);
    vec2 tiledUv = fract(worldMeters * detailScale);

    // Fade high-frequency surface detail as the ground footprint per pixel grows.
    float pixelFootprint = max(length(dFdx(worldMeters)), length(dFdy(worldMeters)));
    float distanceFade = 1.0 - smoothstep(12.0, 65.0, pixelFootprint);
    vec2 atlasUv = gvcAtlasUv(cell, tiledUv);
    vec3 texAlbedo = gvcGroundSrgbToLinear(texture(surfaceAlbedo, atlasUv).rgb);
    vec3 texNormal = texture(surfaceNormal, atlasUv).rgb * 2.0 - 1.0;
    vec3 nrma = texture(surfaceNRMA, atlasUv).rgb;
    texNormal.xy *= normalStrength * distanceFade;
    texNormal = normalize(vec3(texNormal.xy, max(texNormal.z, 0.15)));

    vec3 N = normalize(materialInput.tangentToEyeMatrix * texNormal);
    vec3 baseN = normalize(materialInput.normalEC);
    N = normalize(mix(baseN, N, 0.88 * distanceFade));
    vec3 V = normalize(materialInput.positionToEyeEC);
    vec3 L = normalize(czm_lightDirectionEC);
    vec3 H = normalize(V + L);
    float NoV = max(dot(N, V), 0.001);
    float NoL = max(dot(N, L), 0.0);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);

    float ao = mix(1.0, nrma.r, 0.55 * distanceFade);
    float roughness = clamp(nrma.g, 0.42, 1.0);
    float wet = clamp(wetness, 0.0, 1.0);
    roughness = mix(roughness, max(0.18, roughness * 0.40), wet);
    float metallic = clamp(nrma.b, 0.0, 0.03); // Ground remains dielectric.
    vec3 F0 = mix(vec3(0.035), texAlbedo, metallic);
    float alphaR = max(roughness * roughness, 0.045);
    float D = gvcDggx(NoH, alphaR);
    float k = (roughness + 1.0);
    k = k * k / 8.0;
    float Gv = gvcG1(NoV, k);
    float Gl = gvcG1(max(NoL, 0.001), k);
    vec3 F = gvcFresnel(VoH, F0);
    vec3 specular = D * Gv * Gl * F / max(4.0 * NoV * max(NoL, 0.001), 0.001);
    vec3 diffuse = texAlbedo * (1.0 - metallic) * (1.0 - F) / GVC_PI;
    vec3 direct = (diffuse + specular) * czm_lightColor * NoL;
    vec3 ambient = texAlbedo * (1.0 - metallic) * (0.20 + 0.10 * max(N.z, 0.0)) * ao;

    // Keep aerial colour recognizable while adding the atlas' actual surface grain.
    float textureWeight = clamp(textureBlend * distanceFade, 0.0, 0.90);
    vec3 albedo = mix(imageLinear, texAlbedo, textureWeight);
    vec3 litSurface = mix(imageLinear, direct + ambient, 0.58);
    litSurface = mix(litSurface, albedo * (0.82 + 0.18 * NoL) * ao, 0.40);
    litSurface += specular * (0.025 + 0.30 * wet) * distanceFade;

    float snowMask = clamp(snowCoverage, 0.0, 1.0)
                   * smoothstep(650.0, 2600.0, materialInput.height)
                   * (1.0 - smoothstep(1.0, 1.42, slope));
    litSurface = mix(litSurface, vec3(0.72, 0.77, 0.81), snowMask * 0.88);

    float groundMask = max(max(vegetation, rock), max(sand, 0.24));
    groundMask *= (1.0 - paved * 0.86) * (1.0 - waterHint * 0.92);
    float alpha = clamp(overlayOpacity * groundMask * distanceFade, 0.0, 0.72);

    // GeoFS' modified GlobeFS finally composites material.diffuse + alpha only.
    // The normal/specular terms above therefore become a lit-colour response here.
    material.diffuse = clamp(litSurface, vec3(0.0), vec3(2.0));
    material.alpha = alpha;
    material.normal = N;
    material.specular = 0.04 + wet * 0.08;
    material.shininess = mix(12.0, 72.0, 1.0 - roughness);
    return material;
}
`;

  const profiles = {
    mobile:   { sse: 1.65, cache: 900, aoIntensity: 1.35, aoDirections: 4, aoSteps: 12, bloom: false, detail: 0.72, normal: 0.58, opacity: 0.28, texBlend: 0.62, scale: 0.12 },
    balanced: { sse: 1.20, cache: 1300, aoIntensity: 1.55, aoDirections: 6, aoSteps: 16, bloom: true, detail: 0.90, normal: 0.75, opacity: 0.36, texBlend: 0.68, scale: 0.14 },
    high:     { sse: 0.98, cache: 1800, aoIntensity: 1.70, aoDirections: 8, aoSteps: 20, bloom: true, detail: 1.00, normal: 0.90, opacity: 0.42, texBlend: 0.74, scale: 0.16 },
    ultra:    { sse: 0.82, cache: 2200, aoIntensity: 1.85, aoDirections: 10, aoSteps: 24, bloom: true, detail: 1.12, normal: 1.00, opacity: 0.46, texBlend: 0.78, scale: 0.18 }
  };

  const original = {
    renderingQuality: API.renderingQuality,
    adaptativeRenderingQuality: API.adaptativeRenderingQuality,
    setTerrainProvider: API.setTerrainProvider,
    setImageryProvider: API.setImageryProvider,
    setGT: API.setGT,
    setVegetation: API.setVegetation,
    setBuildings: API.setBuildings,
    setPBRshaders: API.setPBRshaders,
    setGlobeLighting: API.setGlobeLighting,
    initializeUniforms: API.initializeUniforms,
    loadModel: API.loadModel,
    treesInit: G.trees?.init,
    buildingsInit: G.buildings?.init,
    globe: {
      material: globe.material,
      enableLighting: globe.enableLighting,
      shadows: globe.shadows,
      lambertDiffuseMultiplier: globe.lambertDiffuseMultiplier,
      maximumScreenSpaceError: globe.maximumScreenSpaceError,
      tileCacheSize: globe.tileCacheSize,
      preloadAncestors: globe.preloadAncestors,
      preloadSiblings: globe.preloadSiblings,
      showWaterEffect: globe.showWaterEffect
    },
    qualityPreference: G.preferences?.graphics?.quality,
    advanced: G.preferences?.graphics?.advanced ? JSON.parse(JSON.stringify(G.preferences.graphics.advanced)) : null,
    renderingSettings: API.renderingSettings ? { ...API.renderingSettings } : null,
    ao: post?.ambientOcclusion ? {
      enabled: post.ambientOcclusion.enabled,
      intensity: post.ambientOcclusion.intensity,
      bias: post.ambientOcclusion.bias,
      lengthCap: post.ambientOcclusion.lengthCap,
      directionCount: post.ambientOcclusion.directionCount,
      stepCount: post.ambientOcclusion.stepCount,
      ambientOcclusionOnly: post.ambientOcclusion.ambientOcclusionOnly
    } : null,
    bloom: post?.bloom ? {
      enabled: post.bloom.enabled,
      contrast: post.bloom.contrast,
      brightness: post.bloom.brightness,
      delta: post.bloom.delta,
      sigma: post.bloom.sigma,
      stepSize: post.bloom.stepSize,
      glowOnly: post.bloom.glowOnly
    } : null,
    shadow: viewer.shadowMap ? {
      enabled: viewer.shadowMap.enabled,
      softShadows: viewer.shadowMap.softShadows,
      size: viewer.shadowMap.size,
      maximumDistance: viewer.shadowMap.maximumDistance,
      darkness: viewer.shadowMap.darkness,
      normalOffset: viewer.shadowMap.normalOffset
    } : null,
    pbrEnabled: !!G.PBRshadersOn,
    vegetationEnabled: !!G.preferences?.graphics?.vegetation,
    buildingsEnabled: !!G.preferences?.graphics?.buildings,
    treeShader: W.geofsShaders["treesFS.glsl"],
    buildingShader: W.geofsShaders["buildingsFS.glsl"],
    pbrFallbackShader: W.geofsShaders["PBRFallbackFS.glsl"]
  };

  const state = {
    installed: true,
    version: VERSION,
    highestPreset,
    profile: mobile ? "mobile" : "high",
    lockHighestPreset: true,
    material: null,
    materialApplied: false,
    manualUniformFallbacks: [],
    assetsConfigured: false,
    assetsPreflight: "not-started",
    lastError: null,
    lastWarnings: [
      "Ground material is an imagery overlay; it does not displace terrain geometry or add real grass blades.",
      "GeoFS GlobeFS composites material.diffuse and material.alpha; normal/specular are evaluated into shaded colour rather than a deferred terrain PBR buffer.",
      "The supplied terrain provider requests vertex normals but does not request water masks; Cesium's native water-mask effects remain unavailable on this provider.",
      "Ground classification is inferred from satellite-image colour and slope; it is not a geographic biome or road-vector dataset.",
      "The supplied beta terrain is limited by its existing DEM/terrain tile availability (the runway wrapper advertises level 12); this edition does not invent higher-resolution elevation data.",
      "No true grass-blade mesh source or geographic biome map is included in the beta files; grass detail here is a textured surface approximation while GeoFS tree tiles remain the real vegetation source.",
      "HDR is intentionally left on GeoFS' native rendering path. The earlier standalone HDR prototype did not establish a reliable final-compositor order for every beta post-process stage."
    ],
    generation: 0,
    materialPromise: null,
    nativePBR: false,
    buildingsPBR: false,
    treesPBR: false,
    terrainNormalsAvailable: false,
    wetness: 0.0,
    snowCoverage: G.isSnowy ? 1.0 : 0.0,
    grassStrength: 1.0,
    rockStrength: 1.0,
    textureBlend: profiles[mobile ? "mobile" : "high"].texBlend,
    overlayOpacity: profiles[mobile ? "mobile" : "high"].opacity,
    removePreRender: null,
    patched: {},
    refresh,
    apply,
    status,
    setProfile,
    setLockHighestPreset,
    setWetness,
    setSnowCoverage,
    setGrassStrength,
    setRockStrength,
    setTextureBlend,
    setOverlayOpacity,
    setVegetation,
    setBuildings,
    restore
  };

  function getTerrainProvider() {
    return viewer.terrainProvider || globe.terrainProvider || null;
  }
  function getBaseTerrainProvider(provider = getTerrainProvider()) {
    return provider?.baseProvider || provider?._baseProvider || provider;
  }
  function isGT() {
    return API.imageryProviderName === "gt" || !!API.gts || !globe.show;
  }
  function profile() {
    return profiles[state.profile] || profiles.balanced;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  async function preflightAssets() {
    if (state.assetsPreflight === "ready") return true;
    if (state.assetPromise) return state.assetPromise;
    state.assetsPreflight = "loading";
    state.assetPromise = Promise.all(Object.values(ASSETS).map(url => new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(true);
      image.onerror = () => reject(new Error(`Texture could not be loaded: ${url}`));
      image.src = url;
    }))).then(() => {
      state.assetsPreflight = "ready";
      return true;
    }).catch(error => {
      state.assetsPreflight = "failed";
      state.assetPromise = null;
      state.lastError = String(error?.message || error);
      throw error;
    });
    return state.assetPromise;
  }

  function installGeoFSManualTerrainUniforms(material) {
    // The supplied Cesium 1.136.0 vertex shader has two GeoFS-specific manual
    // uniforms that are not included in its stock terrain uniformMap.
    // ShaderProgram._setUniforms calls every manual uniform as a function;
    // leaving either entry absent causes: e[c.name] is not a function.
    const uniformMap = material?._uniforms;
    if (!uniformMap || typeof uniformMap !== "object") {
      throw new Error("Cesium Material._uniforms is unavailable; cannot install GeoFS terrain uniform callbacks.");
    }

    if (typeof uniformMap.windSpeed_0 !== "function") {
      uniformMap.windSpeed_0 = () => {
        const w = W.weather;
        const value = Number(w?.currentWindSpeedMs ?? w?.definition?.windSpeedMS ?? 0);
        return Number.isFinite(value) ? value : 0;
      };
    }
    if (typeof uniformMap.geofsTime_1 !== "function") {
      uniformMap.geofsTime_1 = () => {
        const value = Number(G.fx?.precisionTime ?? API.precisionTime ?? 0);
        return Number.isFinite(value) ? value : 0;
      };
    }

    const required = ["windSpeed_0", "geofsTime_1"];
    const missing = required.filter(name => typeof uniformMap[name] !== "function");
    if (missing.length) {
      throw new Error(`GeoFS terrain uniform callbacks are invalid: ${missing.join(", ")}`);
    }
    state.manualUniformFallbacks = required;
    return uniformMap;
  }

  async function createTerrainMaterial() {
    if (state.material) return state.material;
    if (state.materialPromise) return state.materialPromise;
    const generation = state.generation;
    state.materialPromise = (async () => {
      await preflightAssets();
      if (!state.installed || generation !== state.generation) return null;
      const p = profile();
      const material = new C.Material({
      fabric: {
        type: "GeoFS_MSFS_Inspired_Surface",
        uniforms: {
          surfaceAlbedo: ASSETS.albedo,
          surfaceNormal: ASSETS.normal,
          surfaceNRMA: ASSETS.nrma,
          detailStrength: p.detail,
          normalStrength: p.normal,
          overlayOpacity: state.overlayOpacity,
          wetness: state.wetness,
          snowCoverage: state.snowCoverage,
          textureBlend: state.textureBlend,
          grassStrength: state.grassStrength,
          rockStrength: state.rockStrength,
          detailScale: p.scale
        },
        source: groundShader
      },
      translucent: true,
      minificationFilter: C.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
      magnificationFilter: C.TextureMagnificationFilter.LINEAR
      });
      installGeoFSManualTerrainUniforms(material);
      if (!state.installed || generation !== state.generation) {
        material.destroy?.();
        return null;
      }
      state.material = material;
      state.assetsConfigured = true;
      return state.material;
    })();
    try {
      return await state.materialPromise;
    } finally {
      state.materialPromise = null;
    }
  }

  async function applyTerrainMaterial() {
    const generation = state.generation;
    if (isGT() || G.retroOn) {
      if (globe.material === state.material) globe.material = original.globe.material;
      state.materialApplied = false;
      return false;
    }
    const provider = getTerrainProvider();
    const base = getBaseTerrainProvider(provider);
    if (!provider || !base) return false;
    state.terrainNormalsAvailable = base.hasVertexNormals === true || provider.hasVertexNormals === true;
    const normalsRequested = base.requestVertexNormals === true || provider.requestVertexNormals === true;
    if (!state.terrainNormalsAvailable && !normalsRequested) {
      if (globe.material === state.material) globe.material = original.globe.material;
      state.materialApplied = false;
      const warning = "Current terrain provider does not advertise vertex normals; terrain micro-normal material was skipped.";
      if (!state.lastWarnings.includes(warning)) state.lastWarnings.push(warning);
      return false;
    }
    if (base.ready === false || provider.ready === false) {
      const ready = base.readyPromise || provider.readyPromise;
      if (ready && typeof ready.then === "function") {
        ready.then(() => applyTerrainMaterial()).catch(error => {
          state.lastError = String(error?.stack || error);
        });
      }
      return false;
    }
    try {
      const material = await createTerrainMaterial();
      if (!material || !state.installed || generation !== state.generation || isGT() || G.retroOn) {
        state.materialApplied = false;
        return false;
      }
      if (getTerrainProvider() !== provider) {
        state.lastWarnings.push("Terrain provider changed during texture loading; call GeoFSVisualComplete.refresh() to re-evaluate the new provider.");
        return false;
      }
      globe.material = material;
      state.materialApplied = globe.material === material;
      scene.requestRender?.();
      if (!state.terrainNormalsAvailable && normalsRequested) {
        const warning = "Provider requests vertex normals, but hasVertexNormals is not confirmed; microdetail is using the available Globe basis only.";
        if (!state.lastWarnings.includes(warning)) state.lastWarnings.push(warning);
      }
      return state.materialApplied;
    } catch (error) {
      state.lastError = String(error?.stack || error);
      state.materialApplied = false;
      console.error("[GeoFS Visual Complete] Terrain material setup failed:", error);
      return false;
    }
  }

  function updateTerrainUniforms() {
    if (!state.material?.uniforms) return false;
    const p = profile();
    const u = state.material.uniforms;
    u.detailStrength = p.detail;
    u.normalStrength = p.normal;
    u.wetness = state.wetness;
    u.snowCoverage = state.snowCoverage;
    u.textureBlend = state.textureBlend;
    u.overlayOpacity = state.overlayOpacity;
    u.grassStrength = state.grassStrength;
    u.rockStrength = state.rockStrength;
    u.detailScale = p.scale;
    scene.requestRender?.();
    return true;
  }

  function applyGroundQuality() {
    const p = profile();
    const altitude = Math.max(0, Number(G.aircraft?.instance?.llaLocation?.[2]) || Number(G.relativeAltitude) || 0);
    const speed = Math.max(0, Number(G.animation?.values?.kias) || Number(G.aircraft?.instance?.airspeedKias) || 0);
    const altitudeRelax = clamp(altitude / 18000, 0, 1) * 2.0;
    const speedRelax = clamp(speed / 300, 0, 1) * 0.55;
    const targetSSE = clamp(p.sse + altitudeRelax + speedRelax, p.sse, 4.8);
    globe.maximumScreenSpaceError = targetSSE;
    globe.tileCacheSize = p.cache;
    globe.preloadAncestors = true;
    globe.preloadSiblings = state.profile === "high" || state.profile === "ultra";
    if (API.renderingSettings) {
      API.renderingSettings.maximumScreenSpaceError = p.sse;
      API.renderingSettings.tileCacheSize = p.cache;
      API.renderingSettings.lowResRunways = false;
    }

    const provider = getTerrainProvider();
    const base = getBaseTerrainProvider(provider);
    state.terrainNormalsAvailable = base?.hasVertexNormals === true || provider?.hasVertexNormals === true;
    const terrainNormalsRequested = base?.requestVertexNormals === true || provider?.requestVertexNormals === true;
    if (state.terrainNormalsAvailable || terrainNormalsRequested) {
      // GeoFS beta sets Lambert diffuse multiplier to 10. Cesium clamps the
      // multiplied diffuse term to [0,1], so this saturates most sunlit slopes.
      globe.lambertDiffuseMultiplier = 0.9;
      if (typeof API.setGlobeLighting === "function") API.setGlobeLighting(true);
      else globe.enableLighting = true;
    }
    if (viewer.shadowMap && (viewer.shadowMap.enabled || viewer.shadows)) {
      viewer.shadowMap.softShadows = true;
      viewer.shadowMap.normalOffset = true;
      const maxSize = C.ContextLimits?.maximumTextureSize || 4096;
      const desired = state.profile === "ultra" ? 3072 : (state.profile === "high" ? 2048 : 1536);
      if (Number.isFinite(viewer.shadowMap.size)) viewer.shadowMap.size = Math.min(desired, maxSize);
    }

    // Built-in HBAO and Bloom exist in the supplied Cesium 1.136.0 collection.
    if (post?.ambientOcclusion && scene.context?.depthTexture) {
      post.ambientOcclusion.enabled = true;
      post.ambientOcclusion.ambientOcclusionOnly = false;
      post.ambientOcclusion.intensity = p.aoIntensity;
      post.ambientOcclusion.bias = 0.12;
      post.ambientOcclusion.lengthCap = 0.18;
      post.ambientOcclusion.directionCount = p.aoDirections;
      post.ambientOcclusion.stepCount = p.aoSteps;
    } else if (post?.ambientOcclusion) {
      post.ambientOcclusion.enabled = false;
    }
    if (post?.bloom) {
      post.bloom.enabled = p.bloom;
      post.bloom.glowOnly = false;
      post.bloom.contrast = 128;
      post.bloom.brightness = -0.38;
      post.bloom.delta = 1.0;
      post.bloom.sigma = 1.25;
      post.bloom.stepSize = 1.0;
    }
    scene.requestRender?.();
  }

  function applyPBRFallbackFix() {
    if (typeof original.initializeUniforms === "function") {
      state.patched.initializeUniforms = function (shader, path, ...args) {
        const requestedMetalness = shader?.textures?.metalness;
        const result = original.initializeUniforms.call(this, shader, path, ...args);
        if (shader?.name === "PBRFallback" && requestedMetalness && result) {
          result.metalness = requestedMetalness;
        }
        return result;
      };
      API.initializeUniforms = state.patched.initializeUniforms;
    }
    if (typeof original.pbrFallbackShader === "string") {
      W.geofsShaders["PBRFallbackFS.glsl"] = original.pbrFallbackShader.replace(
        "rough = clamp(rough, 0.045, 2.0);",
        "rough = clamp(rough, 0.045, 1.0);"
      );
    }
  }

  function patchModelIBLDefaults() {
    if (typeof original.loadModel !== "function") return;
    state.patched.loadModel = function (options, ...args) {
      if (options && typeof options === "object" && options.PBRshadersOn) {
        const next = { ...options };
        if (next.cesiumDiffuseFactor == null) next.cesiumDiffuseFactor = 1.45;
        if (next.cesiumEnvFactor == null) next.cesiumEnvFactor = 0.45;
        options = next;
      }
      return original.loadModel.call(this, options, ...args);
    };
    API.loadModel = state.patched.loadModel;
  }

  function installObjectPBR() {
    W.geofsShaders["treesFS.glsl"] = treeShaderText;
    W.geofsShaders["buildingsFS.glsl"] = buildingShaderText;

    if (G.trees && typeof original.treesInit === "function" && !state.patched.treesInit) {
      state.patched.treesInit = function (...args) {
        const result = original.treesInit.apply(this, args);
        if (this.shader) {
          this.shader.lightingModel = C.LightingModel.PBR;
          state.treesPBR = this.shader.lightingModel === C.LightingModel.PBR;
        }
        return result;
      };
      G.trees.init = state.patched.treesInit;
    }
    if (G.buildings && typeof original.buildingsInit === "function" && !state.patched.buildingsInit) {
      state.patched.buildingsInit = function (...args) {
        const result = original.buildingsInit.apply(this, args);
        if (this.buildingsShader) {
          this.buildingsShader.lightingModel = C.LightingModel.PBR;
          state.buildingsPBR = this.buildingsShader.lightingModel === C.LightingModel.PBR;
        }
        return result;
      };
      G.buildings.init = state.patched.buildingsInit;
    }
  }

  function rebuildActiveObjectProviders() {
    try {
      if (G.preferences?.graphics?.vegetation && (G.trees?.simple3DTileProvider || G.trees?.tileset)) {
        G.trees.destroy(); G.trees.init();
      }
      if (G.preferences?.graphics?.buildings && (G.buildings?.simple3DTileProvider || G.buildings?.tileset)) {
        G.buildings.destroy(); G.buildings.init();
      }
    } catch (error) {
      state.lastError = String(error?.stack || error);
      console.warn("[GeoFS Visual Complete] Existing tree/building provider rebuild was partial:", error);
    }
  }

  function ensurePBR() {
    try {
      if (typeof API.setPBRshaders === "function" && G.PBRshadersOn !== true) {
        API.setPBRshaders(true);
      }
      state.nativePBR = G.PBRshadersOn === true;
      return state.nativePBR;
    } catch (error) {
      state.lastError = String(error?.stack || error);
      return false;
    }
  }

  function setProfile(name) {
    if (!Object.prototype.hasOwnProperty.call(profiles, name)) {
      console.error("[GeoFS Visual Complete] Profile must be mobile, balanced, high, or ultra.");
      return false;
    }
    state.profile = name;
    state.textureBlend = profile().texBlend;
    state.overlayOpacity = profile().opacity;
    state.grassStrength = 1.0;
    state.rockStrength = 1.0;
    applyGroundQuality();
    updateTerrainUniforms();
    return status();
  }

  function setLockHighestPreset(enabled) {
    state.lockHighestPreset = !!enabled;
    if (state.lockHighestPreset) applyHighestPreset();
    return state.lockHighestPreset;
  }

  function applyHighestPreset() {
    if (typeof original.renderingQuality !== "function") return false;
    const level = state.lockHighestPreset ? highestPreset : (G.preferences?.graphics?.quality || highestPreset);
    original.renderingQuality.call(API, level);
    applyGroundQuality();
    ensurePBR();
    applyTerrainMaterial();
    return true;
  }

  function setWetness(value) {
    value = Number(value);
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    state.wetness = value;
    updateTerrainUniforms();
    return value;
  }

  function setSnowCoverage(value) {
    value = Number(value);
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    state.snowCoverage = value;
    updateTerrainUniforms();
    return value;
  }

  function setSurfaceParameter(key, value, min, max) {
    value = Number(value);
    if (!Number.isFinite(value) || value < min || value > max) {
      console.error(`[GeoFS Visual Complete] ${key} must be between ${min} and ${max}.`);
      return false;
    }
    state[key] = value;
    updateTerrainUniforms();
    return value;
  }

  function setGrassStrength(value) { return setSurfaceParameter("grassStrength", value, 0, 2); }
  function setRockStrength(value) { return setSurfaceParameter("rockStrength", value, 0, 2); }
  function setTextureBlend(value) { return setSurfaceParameter("textureBlend", value, 0, 1); }
  function setOverlayOpacity(value) { return setSurfaceParameter("overlayOpacity", value, 0, 0.8); }

  function setVegetation(enabled) {
    if (typeof API.setVegetation !== "function") return false;
    const result = API.setVegetation(!!enabled);
    scene.requestRender?.();
    return result !== false;
  }

  function setBuildings(enabled) {
    if (typeof API.setBuildings !== "function") return false;
    const result = API.setBuildings(!!enabled);
    scene.requestRender?.();
    return result !== false;
  }

  function apply() {
    applyGroundQuality();
    ensurePBR();
    installObjectPBR();
    applyTerrainMaterial();
    updateTerrainUniforms();
    return true;
  }

  function refresh() {
    applyGroundQuality();
    ensurePBR();
    return applyTerrainMaterial();
  }

  function status() {
    const provider = getTerrainProvider();
    const base = getBaseTerrainProvider(provider);
    const ao = post?.ambientOcclusion;
    const bloom = post?.bloom;
    const shadow = viewer.shadowMap;
    return {
      edition: VERSION,
      cesiumVersion: C.VERSION,
      profile: state.profile,
      detectedHighestGeoFSQuality: highestPreset,
      currentGeoFSQuality: G.preferences?.graphics?.quality,
      lockHighestPreset: state.lockHighestPreset,
      terrainProvider: provider?.constructor?.name || "unknown",
      terrainMaximumLevel: provider?.maximumLevel ?? null,
      baseTerrainMaximumLevel: base?.maximumLevel ?? null,
      requestVertexNormals: base?.requestVertexNormals,
      hasVertexNormals: base?.hasVertexNormals,
      terrainMaterialApplied: state.materialApplied,
      terrainMaterialAssets: state.assetsPreflight,
      terrainManualUniformFallbacks: [...state.manualUniformFallbacks],
      globeSSE: globe.maximumScreenSpaceError,
      tileCacheSize: globe.tileCacheSize,
      lambertDiffuseMultiplier: globe.lambertDiffuseMultiplier,
      AO: !!ao?.enabled,
      AOBias: ao?.bias ?? null,
      AODirections: ao?.directionCount ?? null,
      AOSteps: ao?.stepCount ?? null,
      bloom: !!bloom?.enabled,
      shadowEnabled: !!(shadow?.enabled || viewer.shadows),
      softShadows: !!shadow?.softShadows,
      shadowMapSize: shadow?.size ?? null,
      aircraftPBR: !!G.PBRshadersOn,
      buildingsPBR: state.buildingsPBR,
      treesPBR: state.treesPBR,
      vegetationEnabled: !!G.preferences?.graphics?.vegetation,
      buildingsEnabled: !!G.preferences?.graphics?.buildings,
      wetness: state.wetness,
      snowCoverage: state.snowCoverage,
      grassStrength: state.grassStrength,
      rockStrength: state.rockStrength,
      textureBlend: state.textureBlend,
      overlayOpacity: state.overlayOpacity,
      waterMaskAvailable: base?.hasWaterMask,
      waterSSR: API.renderingSettings?.waterSSR,
      volumetricClouds: API.renderingSettings?.volumetricClouds,
      lastError: state.lastError,
      warnings: [...new Set(state.lastWarnings)]
    };
  }

  function restore() {
    try {
      state.installed = false;
      state.generation++;

      if (API.renderingQuality === state.patched.renderingQuality) API.renderingQuality = original.renderingQuality;
      if (API.adaptativeRenderingQuality === state.patched.adaptativeRenderingQuality) API.adaptativeRenderingQuality = original.adaptativeRenderingQuality;
      if (API.setTerrainProvider === state.patched.setTerrainProvider) API.setTerrainProvider = original.setTerrainProvider;
      if (API.setImageryProvider === state.patched.setImageryProvider) API.setImageryProvider = original.setImageryProvider;
      if (API.setGT === state.patched.setGT) API.setGT = original.setGT;
      if (API.initializeUniforms === state.patched.initializeUniforms) API.initializeUniforms = original.initializeUniforms;
      if (API.loadModel === state.patched.loadModel) API.loadModel = original.loadModel;

      const hadTrees = !!(G.trees?.simple3DTileProvider || G.trees?.tileset);
      const hadBuildings = !!(G.buildings?.simple3DTileProvider || G.buildings?.tileset);
      if (G.trees && state.patched.treesInit && G.trees.init === state.patched.treesInit) G.trees.init = original.treesInit;
      if (G.buildings && state.patched.buildingsInit && G.buildings.init === state.patched.buildingsInit) G.buildings.init = original.buildingsInit;

      W.geofsShaders["treesFS.glsl"] = original.treeShader;
      W.geofsShaders["buildingsFS.glsl"] = original.buildingShader;
      W.geofsShaders["PBRFallbackFS.glsl"] = original.pbrFallbackShader;

      // Restore the user's original GeoFS quality / PBR selection before restoring
      // the final globe, post-process and shadow objects (the quality call mutates them).
      if (G.preferences?.graphics && original.qualityPreference !== undefined) {
        G.preferences.graphics.quality = original.qualityPreference;
        original.renderingQuality.call(API, original.qualityPreference);
        if (original.advanced && G.preferences.graphics.advanced) {
          Object.assign(G.preferences.graphics.advanced, original.advanced);
        }
      }
      if (G.PBRshadersOn !== original.pbrEnabled && typeof original.setPBRshaders === "function") {
        original.setPBRshaders.call(API, original.pbrEnabled);
      }

      if (hadTrees && original.treesInit) { G.trees.destroy(); G.trees.init(); }
      if (hadBuildings && original.buildingsInit) { G.buildings.destroy(); G.buildings.init(); }

      // Restore the exact pre-install renderer state after GeoFS quality restoration.
      globe.material = original.globe.material;
      globe.enableLighting = original.globe.enableLighting;
      globe.shadows = original.globe.shadows;
      globe.lambertDiffuseMultiplier = original.globe.lambertDiffuseMultiplier;
      globe.maximumScreenSpaceError = original.globe.maximumScreenSpaceError;
      globe.tileCacheSize = original.globe.tileCacheSize;
      globe.preloadAncestors = original.globe.preloadAncestors;
      globe.preloadSiblings = original.globe.preloadSiblings;
      globe.showWaterEffect = original.globe.showWaterEffect;

      if (post?.ambientOcclusion && original.ao) Object.assign(post.ambientOcclusion, original.ao);
      if (post?.bloom && original.bloom) Object.assign(post.bloom, original.bloom);
      if (viewer.shadowMap && original.shadow) Object.assign(viewer.shadowMap, original.shadow);
      if (API.renderingSettings && original.renderingSettings) Object.assign(API.renderingSettings, original.renderingSettings);

      if (state.material && !state.material.isDestroyed?.()) state.material.destroy();
      state.material = null;
      state.materialApplied = false;
      delete W[KEY];
      delete W.GeoFSVisualComplete;
      scene.requestRender?.();
      console.info("[GeoFS Visual Complete] Original GeoFS/Cesium settings restored.");
      return true;
    } catch (error) {
      state.lastError = String(error?.stack || error);
      console.error("[GeoFS Visual Complete] Restore failed:", error);
      return false;
    }
  }

  // Preserve the beta's graphics pipeline and then apply the integrated profile.
  state.patched.renderingQuality = function (...args) {
    const next = args.slice();
    if (state.lockHighestPreset) next[0] = highestPreset;
    const result = original.renderingQuality.apply(this, next);
    applyGroundQuality();
    ensurePBR();
    applyTerrainMaterial();
    return result;
  };
  API.renderingQuality = state.patched.renderingQuality;

  if (typeof original.adaptativeRenderingQuality === "function") {
    state.patched.adaptativeRenderingQuality = function (...args) {
      const result = original.adaptativeRenderingQuality.apply(this, args);
      applyGroundQuality();
      return result;
    };
    API.adaptativeRenderingQuality = state.patched.adaptativeRenderingQuality;
  }
  if (typeof original.setTerrainProvider === "function") {
    state.patched.setTerrainProvider = function (...args) {
      const result = original.setTerrainProvider.apply(this, args);
      applyTerrainMaterial();
      return result;
    };
    API.setTerrainProvider = state.patched.setTerrainProvider;
  }
  if (typeof original.setGT === "function") {
    state.patched.setGT = async function (...args) {
      const result = await original.setGT.apply(this, args);
      if (args[0]) {
        if (globe.material === state.material) globe.material = original.globe.material;
        state.materialApplied = false;
      } else {
        applyTerrainMaterial();
      }
      return result;
    };
    API.setGT = state.patched.setGT;
  }
  if (typeof original.setImageryProvider === "function") {
    state.patched.setImageryProvider = function (...args) {
      const result = original.setImageryProvider.apply(this, args);
      if (args[5] === "gt" || API.imageryProviderName === "gt") {
        if (globe.material === state.material) globe.material = original.globe.material;
        state.materialApplied = false;
      } else {
        Promise.resolve().then(() => applyTerrainMaterial());
      }
      return result;
    };
    API.setImageryProvider = state.patched.setImageryProvider;
  }

  applyPBRFallbackFix();
  patchModelIBLDefaults();
  installObjectPBR();
  rebuildActiveObjectProviders();

  W[KEY] = state;
  W.GeoFSVisualComplete = {
    apply,
    refresh,
    status,
    setProfile,
    setLockHighestPreset,
    setWetness,
    setSnowCoverage,
    setGrassStrength,
    setRockStrength,
    setTextureBlend,
    setOverlayOpacity,
    setVegetation,
    setBuildings,
    restore
  };

  (async () => {
    try {
      state.profile = mobile ? "mobile" : "high";
      if (state.lockHighestPreset && typeof original.renderingQuality === "function") {
        original.renderingQuality.call(API, highestPreset);
      }
      ensurePBR();
      applyGroundQuality();
      await preflightAssets();
      await applyTerrainMaterial();
      updateTerrainUniforms();
      console.info("[GeoFS Visual Complete] Integrated beta edition installed. Run GeoFSVisualComplete.status() for diagnostics.");
      console.table(status());
    } catch (error) {
      state.lastError = String(error?.stack || error);
      console.error("[GeoFS Visual Complete] Installation was partial. Check texture upload paths and console errors:", error);
      console.table(status());
    }
  })();
})();
