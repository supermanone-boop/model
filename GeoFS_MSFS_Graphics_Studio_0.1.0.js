/*
 * GeoFS MSFS Graphics Studio 0.1.0
 * Target: GeoFS 3.9 / CesiumJS 1.96
 * Run: paste the complete file into the GeoFS browser console.
 *
 * What this add-on really changes:
 * - Full-screen color/exposure/contrast/saturation/temperature/sharpen/vignette.
 * - Cesium built-in bloom and screen-space ambient occlusion (when supported).
 * - Scene HDR, gamma, FXAA, MSAA, resolution scale, globe lighting, atmosphere,
 *   fog and shadow-map settings (only when the running build exposes the property).
 * - Imagery-layer brightness/contrast/saturation.
 * - IBL intensity/luminance on loaded Cesium Model and ModelExperimental objects.
 * - A small PBR material CustomShader on ModelExperimental objects only. Its
 *   reflection tint is a controllable sky-gradient approximation, not true
 *   real-time scene reflections. Native glTF PBR + IBL remains the real source
 *   of physically based specular response.
 *
 * No external libraries, downloads, or GeoFS source replacement required.
 */
(async function GeoFSMSFSGraphicsStudio() {
  "use strict";

  const W = window;
  const D = document;
  const C = W.Cesium;
  const G = W.geofs;
  const VERSION = "0.1.0";
  const KEY = "__GEOFS_MSFS_GRAPHICS_STUDIO__";
  const STORE = "geofs_msfs_graphics_studio_010";

  if (W[KEY]) {
    W[KEY].show();
    console.info(`[GeoFS MSFS Graphics Studio ${VERSION}] already installed; panel shown.`);
    return;
  }
  if (!C || !G || !G.api) {
    console.error("[GeoFS MSFS Graphics Studio] Cesium / GeoFS API not found. Run this on the loaded GeoFS page.");
    return;
  }

  let viewer = G.api.viewer;
  for (let i = 0; (!viewer || !viewer.scene || !viewer.scene.postProcessStages) && i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    viewer = G.api && G.api.viewer;
  }
  if (!viewer || !viewer.scene) {
    console.error("[GeoFS MSFS Graphics Studio] GeoFS viewer did not become ready.");
    return;
  }

  const scene = viewer.scene;
  const stages = scene.postProcessStages;
  const models = new Set();
  const modelRecords = new WeakMap();
  const hookRecords = [];
  const original = {
    hdr: scene.highDynamicRange,
    gamma: scene.gamma,
    fxaa: stages.fxaa ? stages.fxaa.enabled : undefined,
    resolutionScale: viewer.resolutionScale,
    msaaSamples: scene.msaaSamples,
    globeLighting: scene.globe ? scene.globe.enableLighting : undefined,
    groundAtmosphere: scene.globe ? scene.globe.showGroundAtmosphere : undefined,
    fogEnabled: scene.fog ? scene.fog.enabled : undefined,
    fogDensity: scene.fog ? scene.fog.density : undefined,
    skyHue: scene.skyAtmosphere ? scene.skyAtmosphere.hueShift : undefined,
    skySaturation: scene.skyAtmosphere ? scene.skyAtmosphere.saturationShift : undefined,
    skyBrightness: scene.skyAtmosphere ? scene.skyAtmosphere.brightnessShift : undefined,
    shadowEnabled: viewer.shadowMap ? viewer.shadowMap.enabled : undefined,
    shadowSoft: viewer.shadowMap ? viewer.shadowMap.softShadows : undefined,
    shadowDarkness: viewer.shadowMap && typeof viewer.shadowMap.darkness === "number" ? viewer.shadowMap.darkness : undefined,
    shadowSize: viewer.shadowMap ? viewer.shadowMap.size : undefined,
    imagery: []
  };

  function safeNumber(v, fallback) {
    return Number.isFinite(Number(v)) ? Number(v) : fallback;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function isDestroyed(obj) {
    try { return !!(obj && typeof obj.isDestroyed === "function" && obj.isDestroyed()); }
    catch (_) { return true; }
  }
  function isCesiumModel(obj) {
    if (!obj || typeof obj !== "object" || isDestroyed(obj)) return false;
    return ("imageBasedLighting" in obj || "customShader" in obj) &&
      ("readyPromise" in obj || typeof obj.update === "function");
  }

  const defaults = {
    exposure: 0.00,
    brightness: 0.00,
    contrast: 1.00,
    saturation: 1.00,
    temperature: 0.00,
    tint: 0.00,
    gamma: 1.00,
    sharpen: 0.00,
    vignette: 0.00,
    bloom: 0.00,
    bloomSpread: 1.00,
    ao: 0.00,

    reflection: 0.55,
    metallic: 0.25,
    specular: 1.10,
    roughness: 1.00,
    clearcoat: 0.20,
    rim: 0.15,
    albedo: 1.00,
    sunGlint: 0.15,
    iblDiffuse: 1.00,
    iblSpecular: 1.00,
    iblLuminance: 0.20,
    modelShadows: true,

    imageryBrightness: 1.00,
    imageryContrast: 1.00,
    imagerySaturation: 1.00,

    hdr: !!scene.highDynamicRange,
    sceneGamma: safeNumber(scene.gamma, 2.20),
    fxaa: stages.fxaa ? !!stages.fxaa.enabled : true,
    msaa: safeNumber(scene.msaaSamples, 1),
    resolution: safeNumber(viewer.resolutionScale, 1),
    globeLighting: scene.globe ? !!scene.globe.enableLighting : false,
    groundAtmosphere: scene.globe ? !!scene.globe.showGroundAtmosphere : true,
    fog: scene.fog ? !!scene.fog.enabled : false,
    fogDensity: scene.fog ? safeNumber(scene.fog.density, 0.0002) : 0.0002,
    skyHue: scene.skyAtmosphere ? safeNumber(scene.skyAtmosphere.hueShift, 0) : 0,
    skySaturation: scene.skyAtmosphere ? safeNumber(scene.skyAtmosphere.saturationShift, 0) : 0,
    skyBrightness: scene.skyAtmosphere ? safeNumber(scene.skyAtmosphere.brightnessShift, 0) : 0,
    shadows: viewer.shadowMap ? !!viewer.shadowMap.enabled : false,
    softShadows: viewer.shadowMap ? !!viewer.shadowMap.softShadows : false,
    shadowDarkness: viewer.shadowMap && typeof viewer.shadowMap.darkness === "number" ? viewer.shadowMap.darkness : 0.3,
    shadowSize: viewer.shadowMap ? safeNumber(viewer.shadowMap.size, 2048) : 2048
  };

  let state = Object.assign({}, defaults);
  try {
    const saved = JSON.parse(W.localStorage.getItem(STORE) || "null");
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(defaults)) {
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
          if (typeof defaults[key] === "boolean") state[key] = !!saved[key];
          else if (Number.isFinite(Number(saved[key]))) state[key] = Number(saved[key]);
        }
      }
    }
  } catch (_) {}

  const MODEL_SHADER = `
    uniform float u_reflection;
    uniform float u_metallic;
    uniform float u_specular;
    uniform float u_roughness;
    uniform float u_clearcoat;
    uniform float u_rim;
    uniform float u_albedo;
    uniform float u_sunGlint;

    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      vec3 baseColor = material.diffuse;
      vec3 N = normalize(material.normalEC + vec3(0.00001));
      vec3 V = normalize(-fsInput.attributes.positionEC);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      vec3 R = reflect(-V, N);

      // Approximate reflected sky/ground gradient. This is not a cubemap of
      // nearby scenery; true scene reflection requires a separate capture pass.
      vec3 groundColor = vec3(0.105, 0.115, 0.130);
      vec3 horizonColor = vec3(0.58, 0.70, 0.82);
      vec3 zenithColor = vec3(0.20, 0.39, 0.66);
      float horizonBlend = smoothstep(-0.42, 0.06, R.y);
      float zenithBlend = smoothstep(0.05, 0.88, R.y);
      vec3 envColor = mix(groundColor, horizonColor, horizonBlend);
      envColor = mix(envColor, zenithColor, zenithBlend);

      float fresnel = pow(1.0 - ndv, 5.0);
      float metal = clamp(u_metallic, 0.0, 1.0);
      float reflectionAmount = clamp(u_reflection, 0.0, 1.5);
      vec3 f0 = mix(material.specular, baseColor, metal);

      material.diffuse = baseColor * u_albedo;
      material.diffuse = mix(material.diffuse, envColor * mix(vec3(0.16), baseColor, metal),
        clamp(fresnel * reflectionAmount * (0.28 + 0.42 * metal + 0.18 * u_clearcoat), 0.0, 0.68));
      material.specular = f0 * u_specular;
      material.roughness = clamp(material.roughness * u_roughness, 0.04, 1.0);

      vec3 sunDir = normalize(czm_sunDirectionEC);
      vec3 sunReflect = reflect(-sunDir, N);
      float glossPower = mix(22.0, 300.0, 1.0 - material.roughness);
      float sunHighlight = pow(max(dot(sunReflect, V), 0.0), glossPower);
      float rim = pow(1.0 - ndv, 2.2) * u_rim;
      material.emissive += envColor * rim * 0.10;
      material.emissive += vec3(1.0, 0.91, 0.76) * sunHighlight * u_sunGlint * 0.20;
    }
  `;

  const colorStage = new C.PostProcessStage({
    name: "geofs_msfs_graphics_color_010",
    fragmentShader: `
      uniform sampler2D colorTexture;
      varying vec2 v_textureCoordinates;
      uniform float u_exposure;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_saturation;
      uniform float u_temperature;
      uniform float u_tint;
      uniform float u_gamma;
      uniform float u_sharpen;
      uniform float u_vignette;
      uniform vec2 u_texelSize;

      vec3 toSaturation(vec3 c, float amount) {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(l), c, amount);
      }

      void main() {
        vec2 uv = v_textureCoordinates;
        vec3 center = texture2D(colorTexture, uv).rgb;
        vec3 north = texture2D(colorTexture, uv + vec2(0.0, u_texelSize.y)).rgb;
        vec3 south = texture2D(colorTexture, uv - vec2(0.0, u_texelSize.y)).rgb;
        vec3 east  = texture2D(colorTexture, uv + vec2(u_texelSize.x, 0.0)).rgb;
        vec3 west  = texture2D(colorTexture, uv - vec2(u_texelSize.x, 0.0)).rgb;
        vec3 blur4 = (north + south + east + west) * 0.25;
        vec3 rgb = mix(center, center + (center - blur4), clamp(u_sharpen, 0.0, 1.0) * 0.85);

        rgb *= exp2(clamp(u_exposure, -3.0, 3.0));
        rgb += vec3(u_brightness);
        rgb = (rgb - vec3(0.5)) * u_contrast + vec3(0.5);
        rgb = toSaturation(rgb, u_saturation);
        rgb *= vec3(1.0 + u_temperature * 0.16 + u_tint * 0.025,
                    1.0 + u_tint * 0.10,
                    1.0 - u_temperature * 0.16 - u_tint * 0.025);
        rgb = max(rgb, vec3(0.0));
        rgb = pow(rgb, vec3(1.0 / max(u_gamma, 0.25)));

        vec2 p = uv * 2.0 - 1.0;
        float vig = smoothstep(1.35, 0.20, dot(p, p));
        rgb *= mix(1.0, vig, clamp(u_vignette, 0.0, 1.0));
        gl_FragColor = vec4(rgb, 1.0);
      }
    `,
    uniforms: {
      u_exposure: state.exposure,
      u_brightness: state.brightness,
      u_contrast: state.contrast,
      u_saturation: state.saturation,
      u_temperature: state.temperature,
      u_tint: state.tint,
      u_gamma: state.gamma,
      u_sharpen: state.sharpen,
      u_vignette: state.vignette,
      u_texelSize: () => new C.Cartesian2(1 / Math.max(1, scene.canvas.width), 1 / Math.max(1, scene.canvas.height))
    }
  });

  let bloomStage = null;
  let aoStage = null;
  try {
    if (C.PostProcessStageLibrary && typeof C.PostProcessStageLibrary.createBloomStage === "function") {
      bloomStage = C.PostProcessStageLibrary.createBloomStage();
      bloomStage.enabled = false;
      stages.add(bloomStage);
    }
  } catch (err) { console.warn("[Graphics Studio] Bloom stage unavailable:", err); }
  try {
    if (scene.context && scene.context.depthTexture && C.PostProcessStageLibrary &&
        typeof C.PostProcessStageLibrary.createAmbientOcclusionStage === "function") {
      aoStage = C.PostProcessStageLibrary.createAmbientOcclusionStage();
      aoStage.enabled = false;
      stages.add(aoStage);
    }
  } catch (err) { console.warn("[Graphics Studio] SSAO stage unavailable:", err); }
  stages.add(colorStage);

  function setUniform(shader, name, value) {
    try {
      if (shader && shader.uniforms && shader.uniforms[name]) shader.uniforms[name].value = value;
    } catch (_) {}
  }

  function makeModelShader() {
    if (!C.CustomShader || !C.UniformType || !C.LightingModel) return null;
    const F = C.UniformType.FLOAT;
    try {
      return new C.CustomShader({
        mode: C.CustomShaderMode ? C.CustomShaderMode.MODIFY_MATERIAL : undefined,
        lightingModel: C.LightingModel.PBR,
        uniforms: {
          u_reflection: { type: F, value: state.reflection },
          u_metallic: { type: F, value: state.metallic },
          u_specular: { type: F, value: state.specular },
          u_roughness: { type: F, value: state.roughness },
          u_clearcoat: { type: F, value: state.clearcoat },
          u_rim: { type: F, value: state.rim },
          u_albedo: { type: F, value: state.albedo },
          u_sunGlint: { type: F, value: state.sunGlint }
        },
        fragmentShaderText: MODEL_SHADER
      });
    } catch (err) {
      console.warn("[Graphics Studio] Model PBR shader creation failed:", err);
      return null;
    }
  }

  function applyModelRecord(model) {
    if (!isCesiumModel(model)) return false;
    let record = modelRecords.get(model);
    if (record && record.applied) return true;

    if (model.ready === false && model.readyPromise && typeof model.readyPromise.then === "function") {
      if (!record) {
        record = { waiting: true, applied: false };
        modelRecords.set(model, record);
        model.readyPromise.then(() => {
          const r = modelRecords.get(model);
          if (r) { r.waiting = false; r.applied = false; applyModelRecord(model); }
        }).catch(err => console.warn("[Graphics Studio] Model ready failed:", err));
      }
      return false;
    }

    record = record || {};
    record.originalIBL = model.imageBasedLighting;
    record.originalIblFactor = record.originalIBL && record.originalIBL.imageBasedLightingFactor
      ? C.Cartesian2.clone(record.originalIBL.imageBasedLightingFactor) : undefined;
    record.originalIblLuminance = record.originalIBL && "luminanceAtZenith" in record.originalIBL
      ? record.originalIBL.luminanceAtZenith : undefined;
    record.originalShader = ("customShader" in model) ? model.customShader : undefined;
    record.originalShadows = ("shadows" in model) ? model.shadows : undefined;
    record.iblCreated = false;

    try {
      if (("imageBasedLighting" in model) && !model.imageBasedLighting && C.ImageBasedLighting) {
        model.imageBasedLighting = new C.ImageBasedLighting({ imageBasedLightingFactor: new C.Cartesian2(1, 1) });
        record.iblCreated = true;
      }
    } catch (err) { console.warn("[Graphics Studio] IBL setup failed:", err); }

    if ("customShader" in model && C.CustomShader) {
      record.shader = makeModelShader();
      if (record.shader) {
        try { model.customShader = record.shader; }
        catch (err) { console.warn("[Graphics Studio] CustomShader attach failed:", err); record.shader = null; }
      }
    }
    record.applied = true;
    modelRecords.set(model, record);
    models.add(model);
    updateOneModel(model, record);
    return true;
  }

  function updateOneModel(model, record) {
    if (!model || isDestroyed(model)) return;
    record = record || modelRecords.get(model);
    if (!record || !record.applied) return;
    try {
      const ibl = model.imageBasedLighting;
      if (ibl) {
        if (ibl.imageBasedLightingFactor) {
          ibl.imageBasedLightingFactor = new C.Cartesian2(state.iblDiffuse, state.iblSpecular);
        }
        if ("luminanceAtZenith" in ibl) ibl.luminanceAtZenith = state.iblLuminance;
      }
    } catch (_) {}
    try {
      if ("shadows" in model && C.ShadowMode) {
        model.shadows = state.modelShadows ? C.ShadowMode.ENABLED : C.ShadowMode.DISABLED;
      }
    } catch (_) {}
    const sh = record.shader;
    if (sh) {
      setUniform(sh, "u_reflection", state.reflection);
      setUniform(sh, "u_metallic", state.metallic);
      setUniform(sh, "u_specular", state.specular);
      setUniform(sh, "u_roughness", state.roughness);
      setUniform(sh, "u_clearcoat", state.clearcoat);
      setUniform(sh, "u_rim", state.rim);
      setUniform(sh, "u_albedo", state.albedo);
      setUniform(sh, "u_sunGlint", state.sunGlint);
    }
  }

  function updateAllModels() {
    for (const model of Array.from(models)) {
      if (isDestroyed(model)) { models.delete(model); continue; }
      updateOneModel(model);
    }
  }

  function scanCollection(collection, depth) {
    if (!collection || depth > 7) return;
    if (isCesiumModel(collection)) { applyModelRecord(collection); return; }
    let items = null;
    try {
      if (Array.isArray(collection._primitives)) items = collection._primitives;
      else if (Array.isArray(collection._items)) items = collection._items;
      else if (typeof collection.length === "number" && typeof collection.get === "function") {
        items = [];
        for (let i = 0; i < collection.length; i++) items.push(collection.get(i));
      }
    } catch (_) {}
    if (!items) return;
    for (const item of items) {
      if (!item) continue;
      if (isCesiumModel(item)) applyModelRecord(item);
      else if (item._primitives || item._items || (typeof item.length === "number" && typeof item.get === "function")) {
        scanCollection(item, depth + 1);
      } else if (item._model && isCesiumModel(item._model)) applyModelRecord(item._model);
    }
  }

  function scanModels() {
    try { scanCollection(scene.primitives, 0); } catch (_) {}
    try { scanCollection(G.api.models, 0); } catch (_) {}
    try { scanCollection(G.api.instanceCollections, 0); } catch (_) {}
    updateAllModels();
    updateStats();
  }

  function hookFactory(ctor, methodName) {
    if (!ctor || typeof ctor[methodName] !== "function") return;
    const originalFn = ctor[methodName];
    if (originalFn.__gfsGraphicsStudioHook) return;
    function wrappedFactory() {
      const result = originalFn.apply(this, arguments);
      if (result && typeof result.then === "function") result.then(applyModelRecord).catch(() => {});
      else applyModelRecord(result);
      return result;
    }
    wrappedFactory.__gfsGraphicsStudioHook = true;
    wrappedFactory.__gfsGraphicsStudioOriginal = originalFn;
    try {
      ctor[methodName] = wrappedFactory;
      hookRecords.push({ ctor, methodName, wrappedFactory, originalFn });
    } catch (_) {}
  }
  hookFactory(C.Model, "fromGltf");
  hookFactory(C.ModelExperimental, "fromGltf");
  hookFactory(C.Model, "fromGltfAsync");

  function applyScene() {
    const u = colorStage.uniforms;
    u.u_exposure = state.exposure;
    u.u_brightness = state.brightness;
    u.u_contrast = state.contrast;
    u.u_saturation = state.saturation;
    u.u_temperature = state.temperature;
    u.u_tint = state.tint;
    u.u_gamma = state.gamma;
    u.u_sharpen = state.sharpen;
    u.u_vignette = state.vignette;

    if (bloomStage) {
      const amount = clamp(state.bloom, 0, 1);
      bloomStage.enabled = amount > 0.001;
      bloomStage.contrast = 128 + (1 - amount) * 65;
      bloomStage.brightness = -0.30 - amount * 0.30;
      bloomStage.sigma = 2.0 + clamp(state.bloomSpread, 0, 2) * 2.5;
      bloomStage.delta = 1.0;
      bloomStage.stepSize = 1.0;
    }
    if (aoStage) {
      aoStage.enabled = state.ao > 0.001;
      aoStage.intensity = clamp(state.ao, 0, 4);
    }

    try { if (typeof scene.highDynamicRange === "boolean") scene.highDynamicRange = !!state.hdr; } catch (_) {}
    try { if (Number.isFinite(state.sceneGamma)) scene.gamma = clamp(state.sceneGamma, 1.0, 3.0); } catch (_) {}
    try { if (stages.fxaa) stages.fxaa.enabled = !!state.fxaa; } catch (_) {}
    try { viewer.resolutionScale = clamp(state.resolution, 0.5, 1.6); } catch (_) {}
    try { if (typeof scene.msaaSamples === "number") scene.msaaSamples = clamp(Math.round(state.msaa), 1, 8); } catch (_) {}

    try { if (scene.globe && typeof scene.globe.enableLighting === "boolean") scene.globe.enableLighting = !!state.globeLighting; } catch (_) {}
    try { if (scene.globe && typeof scene.globe.showGroundAtmosphere === "boolean") scene.globe.showGroundAtmosphere = !!state.groundAtmosphere; } catch (_) {}
    try { if (scene.fog) { scene.fog.enabled = !!state.fog; scene.fog.density = clamp(state.fogDensity, 0, 0.01); } } catch (_) {}
    try {
      const sky = scene.skyAtmosphere;
      if (sky) {
        if ("hueShift" in sky) sky.hueShift = clamp(state.skyHue, -1, 1);
        if ("saturationShift" in sky) sky.saturationShift = clamp(state.skySaturation, -1, 1);
        if ("brightnessShift" in sky) sky.brightnessShift = clamp(state.skyBrightness, -1, 1);
      }
    } catch (_) {}
    try {
      const sm = viewer.shadowMap;
      if (sm) {
        sm.enabled = !!state.shadows;
        if ("softShadows" in sm) sm.softShadows = !!state.softShadows;
        if ("darkness" in sm) sm.darkness = clamp(state.shadowDarkness, 0, 1);
        if ("size" in sm) sm.size = clamp(Math.round(state.shadowSize), 512, 8192);
      }
    } catch (_) {}

    try {
      const layers = viewer.imageryLayers;
      const base = layers && layers.length ? layers.get(0) : null;
      if (base) {
        base.brightness = clamp(state.imageryBrightness, 0, 2);
        base.contrast = clamp(state.imageryContrast, 0, 2);
        base.saturation = clamp(state.imagerySaturation, 0, 2);
      }
    } catch (_) {}

    updateAllModels();
    saveState();
    updateReadouts();
  }

  function saveState() {
    try { W.localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }

  const PANEL_ID = "geofs-msfs-graphics-studio-panel";
  const oldPanel = D.getElementById(PANEL_ID);
  if (oldPanel) oldPanel.remove();
  const panel = D.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="gfs-head">
      <div class="gfs-brand"><div class="gfs-logo">G</div><div><b>MSFS Graphics Studio</b><small>GeoFS visual control · ${VERSION}</small></div></div>
      <div class="gfs-head-actions">
        <button type="button" data-action="collapse" title="折りたたむ">－</button>
        <button type="button" data-action="close" title="パネルを閉じる">×</button>
      </div>
    </div>
    <div class="gfs-content">
      <div class="gfs-presets">
        <button type="button" data-preset="msfs">MSFS風</button>
        <button type="button" data-preset="cinematic">Cinematic</button>
        <button type="button" data-preset="neutral">Natural</button>
        <button type="button" data-preset="performance">軽量</button>
      </div>
      <div class="gfs-status"><span class="gfs-dot"></span><span data-status>描画システムを初期化中...</span><button type="button" data-action="rescan">再検出</button></div>

      <details open>
        <summary>画面全体・色調 <em>POST FX</em></summary>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="exposure"></div>
          <div class="gfs-row" data-key="brightness"></div>
          <div class="gfs-row" data-key="contrast"></div>
          <div class="gfs-row" data-key="saturation"></div>
          <div class="gfs-row" data-key="temperature"></div>
          <div class="gfs-row" data-key="tint"></div>
          <div class="gfs-row" data-key="gamma"></div>
          <div class="gfs-row" data-key="sharpen"></div>
          <div class="gfs-row" data-key="vignette"></div>
        </div>
      </details>

      <details open>
        <summary>機体マテリアル・反射 <em>PBR / IBL</em></summary>
        <div class="gfs-note">対応するModelExperimental機体には材質シェーダーを適用。旧式ModelにはIBL調整を適用します。</div>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="reflection"></div>
          <div class="gfs-row" data-key="metallic"></div>
          <div class="gfs-row" data-key="specular"></div>
          <div class="gfs-row" data-key="roughness"></div>
          <div class="gfs-row" data-key="clearcoat"></div>
          <div class="gfs-row" data-key="rim"></div>
          <div class="gfs-row" data-key="albedo"></div>
          <div class="gfs-row" data-key="sunGlint"></div>
          <div class="gfs-row" data-key="iblDiffuse"></div>
          <div class="gfs-row" data-key="iblSpecular"></div>
          <div class="gfs-row" data-key="iblLuminance"></div>
          <label class="gfs-check"><input type="checkbox" data-check="modelShadows"><span>機体の影を有効化</span></label>
        </div>
      </details>

      <details>
        <summary>ブルーム・立体感 <em>POST FX</em></summary>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="bloom"></div>
          <div class="gfs-row" data-key="bloomSpread"></div>
          <div class="gfs-row" data-key="ao"></div>
        </div>
        <div class="gfs-note">SSAOは深度テクスチャ対応端末のみ使用できます。負荷が高い場合は0にしてください。</div>
      </details>

      <details>
        <summary>太陽光・空・霧 <em>SCENE</em></summary>
        <div class="gfs-checks">
          <label class="gfs-check"><input type="checkbox" data-check="globeLighting"><span>地表への太陽光</span></label>
          <label class="gfs-check"><input type="checkbox" data-check="groundAtmosphere"><span>地表付近の大気表現</span></label>
          <label class="gfs-check"><input type="checkbox" data-check="fog"><span>Cesiumフォグ</span></label>
        </div>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="fogDensity"></div>
          <div class="gfs-row" data-key="skyHue"></div>
          <div class="gfs-row" data-key="skySaturation"></div>
          <div class="gfs-row" data-key="skyBrightness"></div>
        </div>
      </details>

      <details>
        <summary>影・アンチエイリアス <em>QUALITY</em></summary>
        <div class="gfs-checks">
          <label class="gfs-check"><input type="checkbox" data-check="shadows"><span>シャドウマップ</span></label>
          <label class="gfs-check"><input type="checkbox" data-check="softShadows"><span>ソフトシャドウ</span></label>
          <label class="gfs-check"><input type="checkbox" data-check="fxaa"><span>FXAA</span></label>
          <label class="gfs-check"><input type="checkbox" data-check="hdr"><span>HDR（対応端末のみ）</span></label>
        </div>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="shadowDarkness"></div>
          <div class="gfs-row" data-key="shadowSize"></div>
          <div class="gfs-row" data-key="sceneGamma"></div>
          <div class="gfs-row" data-key="msaa"></div>
          <div class="gfs-row" data-key="resolution"></div>
        </div>
      </details>

      <details>
        <summary>衛星画像・地表 <em>IMAGERY</em></summary>
        <div class="gfs-sliders">
          <div class="gfs-row" data-key="imageryBrightness"></div>
          <div class="gfs-row" data-key="imageryContrast"></div>
          <div class="gfs-row" data-key="imagerySaturation"></div>
        </div>
      </details>

      <div class="gfs-footer">
        <button type="button" class="gfs-reset" data-action="reset">設定を初期値へ</button>
        <button type="button" class="gfs-restore" data-action="restore">導入前に復元</button>
      </div>
      <div class="gfs-footnote">設定はこのブラウザーに保存されます。周囲の建物を映す完全なリアルタイム反射は未実装です。</div>
    </div>
    <div class="gfs-minimized" hidden>MSFS Graphics Studio　<button type="button" data-action="expand">開く</button></div>
  `;

  const style = D.createElement("style");
  style.id = "geofs-msfs-graphics-studio-style";
  style.textContent = `
    #${PANEL_ID}{position:fixed;z-index:2147483000;top:64px;right:10px;width:340px;max-width:calc(100vw - 18px);max-height:calc(100vh - 76px);overflow:hidden;background:rgba(13,19,29,.96);color:#edf3fb;border:1px solid rgba(145,175,210,.34);border-radius:13px;box-shadow:0 12px 38px rgba(0,0,0,.48);font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;backdrop-filter:blur(12px);}
    #${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} button{font:inherit;color:inherit;cursor:pointer;border:1px solid rgba(160,185,215,.25);background:rgba(255,255,255,.07);border-radius:7px;padding:5px 8px}#${PANEL_ID} button:active{background:rgba(115,177,255,.24)}
    #${PANEL_ID} .gfs-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;background:linear-gradient(110deg,rgba(31,65,101,.95),rgba(20,31,47,.96));border-bottom:1px solid rgba(160,185,215,.22)}
    #${PANEL_ID} .gfs-brand{display:flex;gap:9px;align-items:center}#${PANEL_ID} .gfs-logo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#50a7ff,#2460a6);font-size:17px;font-weight:900}#${PANEL_ID} .gfs-brand b{display:block;font-size:13px;letter-spacing:.2px}#${PANEL_ID} .gfs-brand small{display:block;color:#aabbd0;font-size:10px}#${PANEL_ID} .gfs-head-actions{display:flex;gap:5px}#${PANEL_ID} .gfs-head-actions button{width:27px;height:27px;padding:0;font-size:15px}
    #${PANEL_ID} .gfs-content{overflow:auto;max-height:calc(100vh - 122px);padding:9px 10px 11px;scrollbar-width:thin;scrollbar-color:#53677f transparent}
    #${PANEL_ID} .gfs-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px}#${PANEL_ID} .gfs-presets button{font-size:10px;padding:6px 2px;background:rgba(64,120,180,.17)}
    #${PANEL_ID} .gfs-status{display:flex;align-items:center;gap:6px;padding:6px 7px;margin-bottom:8px;border-radius:7px;background:rgba(255,255,255,.055);color:#b8c7d8;font-size:10px}#${PANEL_ID} .gfs-status [data-status]{flex:1}#${PANEL_ID} .gfs-status button{padding:3px 6px;font-size:10px}#${PANEL_ID} .gfs-dot{width:7px;height:7px;border-radius:100%;background:#65d69a;box-shadow:0 0 7px #65d69a}
    #${PANEL_ID} details{border:1px solid rgba(150,175,205,.17);border-radius:8px;margin:7px 0;background:rgba(255,255,255,.025);overflow:hidden}#${PANEL_ID} summary{list-style:none;cursor:pointer;padding:8px 9px;font-weight:700;font-size:11px;background:rgba(255,255,255,.045)}#${PANEL_ID} summary::-webkit-details-marker{display:none}#${PANEL_ID} summary:after{content:"＋";float:right;color:#92a9c3}#${PANEL_ID} details[open] summary:after{content:"－"}#${PANEL_ID} summary em{float:right;margin-right:9px;font-style:normal;color:#77b8ff;font-size:9px;letter-spacing:.5px}
    #${PANEL_ID} .gfs-sliders{padding:5px 9px 7px}#${PANEL_ID} .gfs-row{padding:5px 0 4px;border-bottom:1px solid rgba(140,165,195,.10)}#${PANEL_ID} .gfs-row:last-child{border-bottom:0}#${PANEL_ID} .gfs-rowtop{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px}#${PANEL_ID} .gfs-rowtop label{color:#d7e1ed}#${PANEL_ID} .gfs-value{min-width:46px;text-align:right;color:#7fc0ff;font-variant-numeric:tabular-nums;font-weight:700}
    #${PANEL_ID} input[type=range]{display:block;width:100%;height:17px;margin:0;accent-color:#55aaff;cursor:pointer}#${PANEL_ID} .gfs-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:8px 9px 3px}#${PANEL_ID} .gfs-check{display:flex;align-items:center;gap:6px;color:#d1dbea;font-size:10px}#${PANEL_ID} .gfs-check input{accent-color:#55aaff;width:14px;height:14px;margin:0}
    #${PANEL_ID} .gfs-note{padding:6px 9px 2px;color:#8fa4bc;font-size:10px}#${PANEL_ID} .gfs-footer{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}#${PANEL_ID} .gfs-reset{background:rgba(64,130,205,.22)}#${PANEL_ID} .gfs-restore{background:rgba(190,90,90,.12)}#${PANEL_ID} .gfs-footnote{padding:8px 2px 1px;color:#8598ad;font-size:9px}
    #${PANEL_ID} .gfs-minimized{padding:9px 11px;font-weight:700}#${PANEL_ID} .gfs-minimized button{float:right;margin-top:-4px}
    @media(max-width:480px){#${PANEL_ID}{top:52px;right:6px;width:calc(100vw - 12px);max-height:calc(100vh - 60px)}#${PANEL_ID} .gfs-content{max-height:calc(100vh - 108px)}}
  `;
  D.head.appendChild(style);
  D.body.appendChild(panel);

  const sliderDefs = {
    exposure: ["露出", -2, 2, 0.05, " EV"],
    brightness: ["明るさ", -0.30, 0.30, 0.01, ""],
    contrast: ["コントラスト", 0.50, 1.60, 0.01, "×"],
    saturation: ["彩度", 0.00, 2.00, 0.01, "×"],
    temperature: ["色温度（青 ↔ 暖色）", -1, 1, 0.01, ""],
    tint: ["色かぶり（緑 ↔ マゼンタ）", -1, 1, 0.01, ""],
    gamma: ["ポストガンマ", 0.65, 1.50, 0.01, "×"],
    sharpen: ["シャープネス", 0, 1, 0.01, ""],
    vignette: ["周辺減光", 0, 1, 0.01, ""],

    reflection: ["天空反射の強さ（擬似）", 0, 1.5, 0.01, "×"],
    metallic: ["金属感", 0, 1, 0.01, ""],
    specular: ["スペキュラ強度", 0, 2.5, 0.01, "×"],
    roughness: ["表面の粗さ", 0.25, 2.5, 0.01, "×"],
    clearcoat: ["クリアコート", 0, 1.5, 0.01, "×"],
    rim: ["リムライト", 0, 2, 0.01, "×"],
    albedo: ["塗装色の明るさ", 0.5, 1.5, 0.01, "×"],
    sunGlint: ["太陽ハイライト", 0, 2, 0.01, "×"],
    iblDiffuse: ["環境光（拡散）", 0, 2, 0.01, "×"],
    iblSpecular: ["環境反射（IBL）", 0, 2, 0.01, "×"],
    iblLuminance: ["環境光の基準輝度", 0.02, 2, 0.01, ""],

    bloom: ["ブルーム強度", 0, 1, 0.01, ""],
    bloomSpread: ["ブルーム拡散", 0, 2, 0.01, "×"],
    ao: ["SSAO（接触陰影）", 0, 4, 0.05, "×"],

    fogDensity: ["フォグ密度", 0, 0.002, 0.00001, ""],
    skyHue: ["空の色相", -1, 1, 0.01, ""],
    skySaturation: ["空の彩度", -1, 1, 0.01, ""],
    skyBrightness: ["空の明るさ", -1, 1, 0.01, ""],

    shadowDarkness: ["影の濃さ", 0, 1, 0.01, ""],
    shadowSize: ["シャドウ解像度", 512, 8192, 512, " px"],
    sceneGamma: ["Cesiumガンマ", 1, 3, 0.01, "×"],
    msaa: ["MSAAサンプル", 1, 8, 1, "×"],
    resolution: ["レンダリング解像度", 0.5, 1.6, 0.05, "×"],

    imageryBrightness: ["地表画像の明るさ", 0.5, 1.5, 0.01, "×"],
    imageryContrast: ["地表画像のコントラスト", 0.5, 1.5, 0.01, "×"],
    imagerySaturation: ["地表画像の彩度", 0, 2, 0.01, "×"]
  };

  function formatValue(key, value) {
    const def = sliderDefs[key];
    const step = def ? def[3] : 0.01;
    const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 4;
    return Number(value).toFixed(decimals) + (def ? def[4] : "");
  }

  for (const [key, def] of Object.entries(sliderDefs)) {
    const row = panel.querySelector(`[data-key="${key}"]`);
    if (!row) continue;
    row.innerHTML = `<div class="gfs-rowtop"><label for="gfs-${key}">${def[0]}</label><output class="gfs-value" data-value="${key}"></output></div><input id="gfs-${key}" type="range" min="${def[1]}" max="${def[2]}" step="${def[3]}" data-slider="${key}">`;
    const input = row.querySelector("input");
    input.value = state[key];
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      const output = row.querySelector("output");
      if (output) output.textContent = formatValue(key, state[key]);
      applyScene();
    }, { passive: true });
  }

  function updateReadouts() {
    for (const key of Object.keys(sliderDefs)) {
      const input = panel.querySelector(`[data-slider="${key}"]`);
      const output = panel.querySelector(`[data-value="${key}"]`);
      if (input) input.value = state[key];
      if (output) output.textContent = formatValue(key, state[key]);
    }
    for (const input of panel.querySelectorAll("[data-check]")) {
      input.checked = !!state[input.dataset.check];
    }
  }

  function updateStats() {
    const status = panel.querySelector("[data-status]");
    if (!status) return;
    let experimental = 0, legacy = 0;
    for (const model of models) {
      if (isDestroyed(model)) continue;
      if ("customShader" in model) experimental++;
      else legacy++;
    }
    const hdrText = state.hdr && !scene.highDynamicRange ? " · HDR非対応" : "";
    status.textContent = `検出 ${models.size}機（PBR shader ${experimental} / IBL ${legacy + experimental}）${hdrText}`;
  }

  panel.addEventListener("input", event => {
    const input = event.target;
    if (input && input.matches("[data-check]")) {
      const key = input.dataset.check;
      state[key] = !!input.checked;
      applyScene();
    }
  });

  const presets = {
    msfs: {
      exposure: 0.10, brightness: 0.01, contrast: 1.08, saturation: 1.08, temperature: 0.05, tint: 0,
      gamma: 1.02, sharpen: 0.22, vignette: 0.08, bloom: 0.18, bloomSpread: 0.75, ao: 0.55,
      reflection: 0.72, metallic: 0.38, specular: 1.28, roughness: 0.88, clearcoat: 0.42, rim: 0.18,
      albedo: 1.02, sunGlint: 0.22, iblDiffuse: 1.10, iblSpecular: 1.25, iblLuminance: 0.25
    },
    cinematic: {
      exposure: 0.18, brightness: -0.01, contrast: 1.18, saturation: 1.13, temperature: 0.14, tint: 0.02,
      gamma: 1.04, sharpen: 0.16, vignette: 0.22, bloom: 0.32, bloomSpread: 1.25, ao: 0.85,
      reflection: 0.85, metallic: 0.48, specular: 1.40, roughness: 0.82, clearcoat: 0.55, rim: 0.32,
      albedo: 1.01, sunGlint: 0.32, iblDiffuse: 1.12, iblSpecular: 1.35, iblLuminance: 0.28
    },
    neutral: Object.assign({}, defaults, { sharpen: 0.08, iblDiffuse: 1, iblSpecular: 1, reflection: 0.35, metallic: 0.15 }),
    performance: {
      exposure: 0, brightness: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0,
      gamma: 1, sharpen: 0, vignette: 0, bloom: 0, bloomSpread: 0, ao: 0,
      reflection: 0.25, metallic: 0.10, specular: 0.90, roughness: 1.15, clearcoat: 0.05, rim: 0,
      albedo: 1, sunGlint: 0, iblDiffuse: 0.8, iblSpecular: 0.8, iblLuminance: 0.2,
      resolution: Math.min(1, defaults.resolution), msaa: 1, fxaa: true
    }
  };

  panel.addEventListener("click", event => {
    const button = event.target.closest("button[data-action],button[data-preset]");
    if (!button) return;
    if (button.dataset.preset) {
      const preset = presets[button.dataset.preset];
      if (preset) {
        for (const [k, v] of Object.entries(preset)) if (k in state) state[k] = v;
        updateReadouts(); applyScene();
      }
      return;
    }
    switch (button.dataset.action) {
      case "collapse":
        panel.querySelector(".gfs-content").hidden = true;
        panel.querySelector(".gfs-minimized").hidden = false;
        break;
      case "expand":
        panel.querySelector(".gfs-content").hidden = false;
        panel.querySelector(".gfs-minimized").hidden = true;
        break;
      case "close":
        panel.style.display = "none";
        break;
      case "rescan":
        scanModels();
        panel.querySelector("[data-status]").textContent += " · 再スキャン完了";
        break;
      case "reset":
        state = Object.assign({}, defaults);
        updateReadouts(); applyScene();
        break;
      case "restore":
        restoreOriginals();
        break;
    }
  });

  function restoreOriginals() {
    try {
      scene.highDynamicRange = original.hdr;
      if (original.gamma !== undefined) scene.gamma = original.gamma;
      if (stages.fxaa && original.fxaa !== undefined) stages.fxaa.enabled = original.fxaa;
      if (original.resolutionScale !== undefined) viewer.resolutionScale = original.resolutionScale;
      if (original.msaaSamples !== undefined) scene.msaaSamples = original.msaaSamples;
      if (scene.globe) {
        if (original.globeLighting !== undefined) scene.globe.enableLighting = original.globeLighting;
        if (original.groundAtmosphere !== undefined) scene.globe.showGroundAtmosphere = original.groundAtmosphere;
      }
      if (scene.fog) {
        if (original.fogEnabled !== undefined) scene.fog.enabled = original.fogEnabled;
        if (original.fogDensity !== undefined) scene.fog.density = original.fogDensity;
      }
      if (scene.skyAtmosphere) {
        if (original.skyHue !== undefined) scene.skyAtmosphere.hueShift = original.skyHue;
        if (original.skySaturation !== undefined) scene.skyAtmosphere.saturationShift = original.skySaturation;
        if (original.skyBrightness !== undefined) scene.skyAtmosphere.brightnessShift = original.skyBrightness;
      }
      if (viewer.shadowMap) {
        if (original.shadowEnabled !== undefined) viewer.shadowMap.enabled = original.shadowEnabled;
        if (original.shadowSoft !== undefined) viewer.shadowMap.softShadows = original.shadowSoft;
        if (original.shadowDarkness !== undefined) viewer.shadowMap.darkness = original.shadowDarkness;
        if (original.shadowSize !== undefined) viewer.shadowMap.size = original.shadowSize;
      }
      for (const item of original.imagery) {
        if (!item.layer || item.layer.isDestroyed && item.layer.isDestroyed()) continue;
        item.layer.brightness = item.brightness;
        item.layer.contrast = item.contrast;
        item.layer.saturation = item.saturation;
      }
    } catch (err) { console.warn("[Graphics Studio] Scene restore warning:", err); }

    for (const model of models) {
      const record = modelRecords.get(model);
      if (!record || isDestroyed(model)) continue;
      try {
        if (record.shader && model.customShader === record.shader) model.customShader = record.originalShader;
        if (record.iblCreated && model.imageBasedLighting && typeof model.imageBasedLighting.destroy === "function") {
          model.imageBasedLighting.destroy();
          model.imageBasedLighting = record.originalIBL;
        } else if (record.originalIBL && model.imageBasedLighting) {
          if (record.originalIblFactor) model.imageBasedLighting.imageBasedLightingFactor = C.Cartesian2.clone(record.originalIblFactor);
          if (record.originalIblLuminance !== undefined) model.imageBasedLighting.luminanceAtZenith = record.originalIblLuminance;
        }
        if (record.originalShadows !== undefined && "shadows" in model) model.shadows = record.originalShadows;
      } catch (_) {}
    }

    try { stages.remove(colorStage); } catch (_) {}
    try { if (bloomStage) stages.remove(bloomStage); } catch (_) {}
    try { if (aoStage) stages.remove(aoStage); } catch (_) {}
    for (const hook of hookRecords) {
      try { if (hook.ctor[hook.methodName] === hook.wrappedFactory) hook.ctor[hook.methodName] = hook.originalFn; } catch (_) {}
    }
    try { panel.remove(); } catch (_) {}
    try { style.remove(); } catch (_) {}
    try { W.localStorage.removeItem(STORE); } catch (_) {}
    delete W[KEY];
    console.info(`[GeoFS MSFS Graphics Studio ${VERSION}] original scene/model settings restored and add-on removed.`);
  }

  // Store imagery baseline for the currently active base imagery layer.
  try {
    const layers = viewer.imageryLayers;
    for (let i = 0; layers && i < layers.length; i++) {
      const layer = layers.get(i);
      if (layer) original.imagery.push({ layer, brightness: layer.brightness, contrast: layer.contrast, saturation: layer.saturation });
    }
  } catch (_) {}

  function show() {
    panel.style.display = "block";
    panel.querySelector(".gfs-content").hidden = false;
    panel.querySelector(".gfs-minimized").hidden = true;
  }

  W[KEY] = { show, restore: restoreOriginals, scan: scanModels, version: VERSION, panel };
  updateReadouts();
  scanModels();
  applyScene();

  const scanTimer = W.setInterval(() => {
    if (!W[KEY]) { W.clearInterval(scanTimer); return; }
    scanModels();
  }, 2500);
  W[KEY].scanTimer = scanTimer;

  console.info(`[GeoFS MSFS Graphics Studio ${VERSION}] installed. Use the panel at the upper-right. Restore: window.${KEY}.restore()`);
})();
