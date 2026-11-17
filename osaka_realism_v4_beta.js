(()=>{
'use strict';
const KEY='__OSAKA_REALISM_BETA_V4__';
if(window[KEY]?.stop)window[KEY].stop();
const C=window.Cesium,G=window.geofs,V=G?.api?.viewer;
const SC=V?.scene;
const MIN_VERSION=147;
const parseVersion=s=>{const m=String(s||'').match(/^(\d+)\.(\d+)/);return m?{major:+m[1],minor:+m[2]}:{major:0,minor:0};};
const ver=parseVersion(C?.VERSION);
if(!C||!G||!V||!SC){console.error('[OSAKA beta v4] GeoFS/Cesium viewerが見つかりません');return;}
if(ver.major<1||(ver.major===1&&ver.minor<MIN_VERSION)){
 console.error(`[OSAKA beta v4] CesiumJS 1.147+ が必要です。現在: ${C.VERSION||'version unknown'}。既に起動したGeoFS viewerのCesiumを後から差し替えることはできません。beta側のviewer自体を新しいCesiumで起動してください。`);
 return;
}
if(!C.CustomShader||!C.Model?.fromGltfAsync||!C.Cesium3DTileset?.fromUrl||!C.TextureUniform){console.error('[OSAKA beta v4] 必須のCesium 1.147 APIが不足しています');return;}
const REPO='supermanone-boop/OSAKA',BRANCH='main';
const RAW=`https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const TREE=`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const PLATEAU='https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/';
const AREA='27';
const ROOT='super/plateau_facades/';
const ATLAS_W=1584,ATLAS_H=1056,LIGHTS=12;
const EXPRESSWAY={path:'Osaka_Expressways_Realistic_v4.glb.gz',url:'https://huggingface.co/supermanone-boop/OSAKA/resolve/main/Osaka_Expressways_Realistic_v4.glb.gz',lon:135.51052305,lat:34.74052680,alt:0};
const S={active:false,stopped:false,generation:0,tiles:[],models:[],shaders:[],blobUrls:[],lampData:[],lampEntities:[],glowEntities:[],pointCollection:null,postStages:[],preUpdate:null,mouseHandler:null,placing:false,tree:null,treeAt:0,loaded:{buildings:0,roads:0,rails:0},failed:[],pbr:null,glowCanvas:null,sceneOriginal:null,loads:new Set(),lastLampCenter:null,lastLampFetch:0};
const css=`#osakaBeta4{position:fixed;z-index:999999;left:10px;top:82px;width:286px;max-height:78vh;overflow:auto;background:rgba(12,19,26,.97);color:#edf5fa;border:1px solid #657985;border-radius:9px;padding:10px;font:13px/1.45 Arial,sans-serif;box-shadow:0 5px 24px #000b}#osakaBeta4 *{box-sizing:border-box}#osakaBeta4 header{display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:7px}#osakaBeta4 button{background:#344d5c;color:#fff;border:1px solid #8299a6;border-radius:5px;padding:6px 8px;font-size:12px}#osakaBeta4 label{display:flex;align-items:center;gap:7px;margin:7px 0}#osakaBeta4 input[type=checkbox]{accent-color:#e5b86d}#osakaBeta4 input[type=range],#osakaBeta4 select{width:100%}#osakaBeta4 select{background:#1d2d37;color:#fff;border:1px solid #667e8c;border-radius:5px;padding:6px;margin:4px 0 7px}#osakaBeta4 .small{font-size:11px;color:#b9c9d1}#osakaBeta4 .row{display:flex;gap:6px;align-items:center}#osakaBeta4 .row button{flex:1}#osakaBeta4 .rangeLine{display:block;margin-top:7px}#osakaBeta4 .rangeLine span{display:flex;justify-content:space-between}#osakaBeta4 #ob4Status{margin-top:8px;min-height:38px;overflow-wrap:anywhere;color:#d4e9f4}#osakaBetaReopen4{position:fixed;z-index:999999;left:10px;top:82px;display:none;background:#202c34;color:#fff;border:1px solid #8299a6;border-radius:6px;padding:7px 10px;font:12px Arial}`;
['osakaBeta4','osakaBetaReopen4','osakaBeta4Style'].forEach(id=>document.getElementById(id)?.remove());
const style=document.createElement('style');style.id='osakaBeta4Style';style.textContent=css;document.head.appendChild(style);
const panel=document.createElement('div');panel.id='osakaBeta4';
panel.innerHTML=`<header><span>OSAKA Realism BETA v4</span><button id="ob4Close">×</button></header>
<div class="small">CesiumJS ${C.VERSION} / PLATEAU建物 + OSAKA道路・線路</div>
<label><input type="checkbox" id="ob4Buildings" checked>PLATEAU建物（大阪府）</label>
<select id="ob4Lod"><option value="maxlod3">LOD3優先（公開LODで補完）</option><option value="lod3">LOD3のみ</option></select>
<label><input type="checkbox" id="ob4Roads" checked>OSAKA高速道路GLB</label>
<label><input type="checkbox" id="ob4Rails" checked>OSAKA鉄道・線路GLB</label>
<label><input type="checkbox" id="ob4Lamps" checked>街灯＋周囲への局所照明</label>
<div class="small">点灯モード</div><select id="ob4Mode"><option value="on">常時点灯（表示テスト向け）</option><option value="auto">昼夜自動</option><option value="off">消灯</option></select>
<label class="rangeLine"><span><b>照明強度</b><span id="ob4PowerVal">1.8×</span></span><input id="ob4Power" type="range" min="0.3" max="3.5" value="1.8" step="0.1"></label>
<label class="rangeLine"><span><b>照明半径</b><span id="ob4RadiusVal">42 m</span></span><input id="ob4Radius" type="range" min="18" max="85" value="42" step="1"></label>
<div class="row" style="margin-top:9px"><button id="ob4Start">大阪を読み込む</button><button id="ob4Stop">停止・削除</button></div>
<div class="row" style="margin-top:6px"><button id="ob4Place">タップで照明を追加</button></div>
<div id="ob4Status">待機中</div>
<div class="small">街灯位置：OpenStreetMapのstreet_lampノード。局所照明：PLATEAU建物とOSAKA GLBのPBR面。地面には光だまりを描画します。</div>`;
document.body.appendChild(panel);
const reopen=document.createElement('button');reopen.id='osakaBetaReopen4';reopen.textContent='OSAKA BETA';document.body.appendChild(reopen);
const $=id=>document.getElementById(id);
const ui={buildings:$('ob4Buildings'),lod:$('ob4Lod'),roads:$('ob4Roads'),rails:$('ob4Rails'),lamps:$('ob4Lamps'),mode:$('ob4Mode'),power:$('ob4Power'),radius:$('ob4Radius'),status:$('ob4Status')};
const say=t=>{ui.status.textContent=t;console.log('[OSAKA beta v4]',t);};
$('ob4Close').onclick=()=>{panel.style.display='none';reopen.style.display='block';};
reopen.onclick=()=>{panel.style.display='block';reopen.style.display='none';};
ui.power.addEventListener('input',()=>{$('ob4PowerVal').textContent=Number(ui.power.value).toFixed(1)+'×';requestRender();});
ui.radius.addEventListener('input',()=>{$('ob4RadiusVal').textContent=ui.radius.value+' m';requestRender();});
function requestRender(){try{SC.requestRender();}catch(_){}}
function aircraftLLA(){try{const a=G.aircraft?.instance?.llaLocation;if(a&&a.length>=2){let lon=+a[0],lat=+a[1];if(Math.abs(lon)<=90&&Math.abs(lat)>90)[lon,lat]=[lat,lon];if(Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90)return{lon,lat,alt:+a[2]||0};}}catch(_){}return cameraLLA();}
function cameraLLA(){try{const p=C.Cartographic.fromCartesian(SC.camera.positionWC,C.Ellipsoid.WGS84);if(p)return{lon:C.Math.toDegrees(p.longitude),lat:C.Math.toDegrees(p.latitude),alt:p.height};}catch(_){}return null;}
function rad(x){return x*Math.PI/180;}
function haversine(a,b){const R=6371000,dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon),q=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function inOsaka(o){return o&&o.lon>134.65&&o.lon<136.25&&o.lat>34.15&&o.lat<35.25;}
function plateauUrl(lod){return `${PLATEAU}${AREA}-bldg-${lod}-latest/tileset.json`;}
function toGlTexture(image){
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('PBRテクスチャCanvasを初期化できません');
 ctx.drawImage(image,0,0);const src=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 const out=new Uint8Array(src.length),stride=canvas.width*4;
 for(let y=0;y<canvas.height;y++)out.set(src.subarray(y*stride,(y+1)*stride),(canvas.height-1-y)*stride);
 return new C.TextureUniform({typedArray:out,width:canvas.width,height:canvas.height,pixelFormat:C.PixelFormat.RGBA,pixelDatatype:C.PixelDatatype.UNSIGNED_BYTE,repeat:false,minificationFilter:C.TextureMinificationFilter.LINEAR,magnificationFilter:C.TextureMagnificationFilter.LINEAR,maximumAnisotropy:8});
}
async function loadPbrMaps(){
 if(S.pbr)return S.pbr;
 const names=['facade_atlas.jpg','roughness_atlas.png','metalness_atlas.png','normal_atlas.png'];
 const keys=['albedo','roughness','metalness','normal'];const out={};
 for(let i=0;i<names.length;i++){
  const img=await new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error(names[i]+' の取得に失敗。GitHub配置先を確認してください'));im.src=RAW+ROOT+names[i]+'?v=4';});
  if(img.naturalWidth!==ATLAS_W||img.naturalHeight!==ATLAS_H)throw new Error(`${names[i]} 寸法が不一致: ${img.naturalWidth}x${img.naturalHeight}`);
  out[keys[i]]=toGlTexture(img);
 }
 S.pbr=out;return out;
}
function makeUniforms(withFacade){
 const U=C.UniformType,u={};
 if(withFacade){u.uFacadeAtlas={type:U.SAMPLER_2D,value:S.pbr.albedo};u.uRoughAtlas={type:U.SAMPLER_2D,value:S.pbr.roughness};u.uMetalAtlas={type:U.SAMPLER_2D,value:S.pbr.metalness};u.uNormalAtlas={type:U.SAMPLER_2D,value:S.pbr.normal};}
 u.uNightFactor={type:U.FLOAT,value:1.0};
 for(let i=0;i<LIGHTS;i++){
  u[`uLampPR${i}`]={type:U.VEC4,value:new C.Cartesian4(0,0,0,1)};
  u[`uLampCP${i}`]={type:U.VEC4,value:new C.Cartesian4(0.0,0.0,0.0,0.0)};
 }
 return u;
}
function lightShaderText(){
 let body='';
 for(let i=0;i<LIGHTS;i++)body+=`
  {
   vec3 delta${i}=uLampPR${i}.xyz - pEC;
   float dist${i}=length(delta${i});
   float range${i}=max(uLampPR${i}.w,0.001);
   if(dist${i}<range${i} && uLampCP${i}.w>0.0){
    vec3 L${i}=delta${i}/max(dist${i},0.001);
    float fall${i}=pow(max(1.0-dist${i}/range${i},0.0),2.0)/(1.0+0.0025*dist${i}*dist${i});
    float ndl${i}=max(dot(N,L${i}),0.0);
    vec3 H${i}=normalize(L${i}+V);
    float gloss${i}=pow(max(dot(N,H${i}),0.0),mix(96.0,5.0,clamp(material.roughness,0.04,1.0)))*(1.0-clamp(material.roughness,0.04,1.0))*0.22;
    lampIrradiance += uLampCP${i}.rgb * uLampCP${i}.w * fall${i} * (ndl${i} + gloss${i});
   }
  }
 `;
 return `
  vec3 lampIrradiance=vec3(0.0);
  ${body}
  material.emissive += material.diffuse * lampIrradiance * uNightFactor;
 `;
}
function facadeShaderBody(){return `
  vec3 base=material.diffuse;
  float lo=min(base.r,min(base.g,base.b));
  float hi=max(base.r,max(base.g,base.b));
  float whiteMask=smoothstep(0.68,0.88,lo)*(1.0-smoothstep(0.075,0.20,hi-lo));
  if(whiteMask>0.02){
    float fid=float(fsInput.featureIds.featureId_0);
    float materialId=mod(abs(fid),6.0);
    vec3 nmc=abs(normalize(vFacadeNormalMC));
    vec2 uv;
    if(nmc.y>=nmc.x && nmc.y>=nmc.z) uv=vFacadePosMC.xz;
    else if(nmc.x>=nmc.z) uv=vFacadePosMC.zy;
    else uv=vFacadePosMC.xy;
    float tileScale=0.25;
    if(materialId<0.5) tileScale=0.65;
    else if(materialId>0.5 && materialId<1.5) tileScale=0.22;
    else if(materialId>1.5 && materialId<2.5) tileScale=0.35;
    else if(materialId>2.5 && materialId<3.5) tileScale=0.42;
    else if(materialId>3.5 && materialId<4.5) tileScale=0.24;
    else tileScale=0.32;
    vec2 cellUV=fract(uv*tileScale);
    float col=mod(materialId,3.0);
    float rowFromBottom=1.0-floor(materialId/3.0);
    vec2 atlasUV=(vec2(col,rowFromBottom)*528.0+vec2(8.0)+cellUV*512.0)/vec2(1584.0,1056.0);
    vec3 albedoSRGB=texture(uFacadeAtlas,atlasUV).rgb;
    vec3 albedo=pow(max(albedoSRGB,vec3(0.001)),vec3(2.2));
    float rough=texture(uRoughAtlas,atlasUV).r;
    float metal=texture(uMetalAtlas,atlasUV).r;
    vec3 mapN=normalize(texture(uNormalAtlas,atlasUV).xyz*2.0-1.0);
    vec3 dPdx=dFdx(fsInput.attributes.positionEC);
    vec3 dPdy=dFdy(fsInput.attributes.positionEC);
    vec2 dUVdx=dFdx(uv);
    vec2 dUVdy=dFdy(uv);
    vec3 T=dPdx*dUVdy.y-dPdy*dUVdx.y;
    vec3 B=-dPdx*dUVdy.x+dPdy*dUVdx.x;
    T=normalize(T-N*dot(N,T));
    vec3 Baxis=normalize(cross(N,T));
    float handed=sign(dot(Baxis,B));
    vec3 Bfinal=Baxis*(handed==0.0?1.0:handed);
    material.diffuse=mix(base,albedo,whiteMask);
    material.roughness=mix(material.roughness,clamp(rough,0.08,0.98),whiteMask);
    material.metallic=mix(material.metallic,clamp(metal,0.0,0.92),whiteMask);
    vec3 detailNormal=normalize(T*mapN.x+Bfinal*mapN.y+N*mapN.z);
    material.normalEC=normalize(mix(N,detailNormal,whiteMask*0.78));
  }
 `;}
function createSurfaceShader(withFacade){
 const uniforms=makeUniforms(withFacade);
 const varyings=withFacade?{vFacadePosMC:C.VaryingType.VEC3,vFacadeNormalMC:C.VaryingType.VEC3}:undefined;
 const vertexShaderText=withFacade?`
  void vertexMain(VertexInput vsInput,inout czm_modelVertexOutput vsOutput){
    vFacadePosMC=vsInput.attributes.positionMC;
    vFacadeNormalMC=vsInput.attributes.normalMC;
  }
 `:undefined;
 const fragmentShaderText=`
  void fragmentMain(FragmentInput fsInput,inout czm_modelMaterial material){
    vec3 pEC=fsInput.attributes.positionEC;
    vec3 N=normalize(fsInput.attributes.normalEC);
    vec3 V=normalize(-pEC);
    ${withFacade?facadeShaderBody():''}
    ${lightShaderText()}
  }
 `;
 return new C.CustomShader({mode:C.CustomShaderMode.MODIFY_MATERIAL,lightingModel:C.LightingModel.PBR,uniforms,varyings,vertexShaderText,fragmentShaderText});
}
function saveSceneSettings(){
 const sm=SC.shadowMap;
 S.sceneOriginal={hdr:SC.highDynamicRange,shadows:SC.shadows,globeLighting:SC.globe?.enableLighting,groundAtmosphere:SC.globe?.showGroundAtmosphere,shadowEnabled:sm?.enabled,softShadows:sm?.softShadows,shadowSize:sm?.size,shadowMax:sm?.maximumDistance,shadowDarkness:sm?.darkness};
 try{SC.highDynamicRange=!!SC.highDynamicRangeSupported;}catch(_){}
 try{SC.shadows=true;}catch(_){}
 try{if(SC.globe){SC.globe.enableLighting=true;SC.globe.showGroundAtmosphere=true;}}catch(_){}
 try{if(sm){sm.enabled=true;sm.softShadows=true;sm.size=2048;sm.maximumDistance=7000;sm.darkness=0.38;}}catch(_){}
 const lib=C.PostProcessStageLibrary;
 try{if(lib?.createBloomStage){const b=lib.createBloomStage();b.enabled=true;SC.postProcessStages.add(b);S.postStages.push(b);}}catch(e){console.warn('[OSAKA beta v4] bloom stage',e);}
 try{if(lib?.createAmbientOcclusionStage&&lib.isAmbientOcclusionSupported?.(SC)){const ao=lib.createAmbientOcclusionStage();ao.enabled=true;SC.postProcessStages.add(ao);S.postStages.push(ao);}}catch(e){console.warn('[OSAKA beta v4] AO stage',e);}
}
function restoreSceneSettings(){
 if(!S.sceneOriginal)return;const o=S.sceneOriginal;try{SC.highDynamicRange=o.hdr;SC.shadows=o.shadows;if(SC.globe){SC.globe.enableLighting=o.globeLighting;SC.globe.showGroundAtmosphere=o.groundAtmosphere;}const sm=SC.shadowMap;if(sm){sm.enabled=o.shadowEnabled;sm.softShadows=o.softShadows;sm.size=o.shadowSize;sm.maximumDistance=o.shadowMax;sm.darkness=o.shadowDarkness;}}catch(e){console.warn(e);}S.sceneOriginal=null;
}
function solarNightFactor(){
 if(ui.mode.value==='off'||!ui.lamps.checked)return 0;
 if(ui.mode.value==='on')return 1;
 const p=aircraftLLA();if(!p)return 0.5;
 const now=new Date(),day=Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-Date.UTC(now.getUTCFullYear(),0,0))/86400000);
 const gamma=2*Math.PI/365*(day-1+(now.getUTCHours()-12)/24);
 const dec=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const solarHours=now.getUTCHours()+now.getUTCMinutes()/60+p.lon/15;
 const ha=rad((solarHours-12)*15);
 const sinAlt=Math.sin(rad(p.lat))*Math.sin(dec)+Math.cos(rad(p.lat))*Math.cos(dec)*Math.cos(ha);
 return Math.max(0,Math.min(1,(0.10-sinAlt)/0.16));
}
function updateShaderLights(){
 if(!S.shaders.length&&!S.pointCollection)return;
 const night=solarNightFactor();
 if(S.pointCollection)S.pointCollection.show=night>0.015;
 for(const id of S.glowEntities){const e=V.entities.getById(id);if(e)e.show=night>0.015;}
 const center=aircraftLLA();
 const candidates=S.lampData.map(l=>({l,d:center?haversine(center,{lon:l.lon,lat:l.lat}):Infinity})).sort((a,b)=>a.d-b.d).slice(0,LIGHTS);
 const view=SC.camera.viewMatrix;
 for(const shader of S.shaders){
  try{
   shader.setUniform('uNightFactor',night);
   for(let i=0;i<LIGHTS;i++){
    const item=candidates[i];
    if(item){const eye=C.Matrix4.multiplyByPoint(view,item.l.ecef,new C.Cartesian3());shader.setUniform(`uLampPR${i}`,new C.Cartesian4(eye.x,eye.y,eye.z,Number(ui.radius.value)));const k=item.l.color||new C.Cartesian3(1.0,0.66,0.39);const power=Number(ui.power.value)*item.l.power;shader.setUniform(`uLampCP${i}`,new C.Cartesian4(k.x,k.y,k.z,power));}
    else{shader.setUniform(`uLampPR${i}`,new C.Cartesian4(0,0,0,1));shader.setUniform(`uLampCP${i}`,new C.Cartesian4(0,0,0,0));}
   }
  }catch(e){console.warn('[OSAKA beta v4] light uniform',e);}
 }
}
function makeGlowCanvas(){
 if(S.glowCanvas)return S.glowCanvas;
 const c=document.createElement('canvas');c.width=256;c.height=256;const x=c.getContext('2d');
 const g=x.createRadialGradient(128,128,2,128,128,126);g.addColorStop(0,'rgba(255,210,140,0.48)');g.addColorStop(.18,'rgba(255,184,104,0.30)');g.addColorStop(.48,'rgba(255,156,77,0.12)');g.addColorStop(1,'rgba(255,130,55,0)');x.fillStyle=g;x.fillRect(0,0,256,256);S.glowCanvas=c;return c;
}
function clearLampVisuals(){
 for(const id of S.lampEntities){try{V.entities.removeById(id);}catch(_){}}S.lampEntities=[];S.glowEntities=[];
 if(S.pointCollection){try{SC.primitives.remove(S.pointCollection);}catch(_){}S.pointCollection=null;}
}
function addLampVisual(lamp){
 const base=C.Cartesian3.fromDegrees(lamp.lon,lamp.lat,lamp.ground);
 const head=C.Cartesian3.fromDegrees(lamp.lon,lamp.lat,lamp.ground+lamp.height);
 lamp.ecef=head;
 const prefix='osaka_lamp_'+Math.round(lamp.lon*1e6)+'_'+Math.round(lamp.lat*1e6)+'_'+(S.lampEntities.length);
 try{
  const pole=V.entities.add({id:prefix+'_pole',polyline:{positions:[base,head],width:2.1,arcType:C.ArcType.NONE,material:C.Color.fromCssColorString('#34383b')}});S.lampEntities.push(pole.id);
  const pool=V.entities.add({id:prefix+'_pool',position:C.Cartesian3.fromDegrees(lamp.lon,lamp.lat,lamp.ground+0.18),ellipse:{semiMajorAxis:15,semiMinorAxis:15,height:lamp.ground+0.18,material:new C.ImageMaterialProperty({image:makeGlowCanvas(),transparent:true}),outline:false,granularity:C.Math.toRadians(4)}});S.lampEntities.push(pool.id);S.glowEntities.push(pool.id);
 }catch(e){console.warn('[OSAKA beta v4] lamp fixture entity',e);}
 if(S.pointCollection)S.pointCollection.add({position:head,pixelSize:9,color:new C.Color(1.0,0.79,0.48,0.98),outlineColor:new C.Color(0.18,0.12,0.06,0.9),outlineWidth:1,scaleByDistance:new C.NearFarScalar(80,1.0,5500,0.28),disableDepthTestDistance:0});
}
function cameraOrAircraftCenter(){return aircraftLLA()||cameraLLA();}
async function fetchOverpass(endpoint,query){
 const r=await fetch(endpoint,{method:'POST',mode:'cors',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json'},body:'data='+encodeURIComponent(query),cache:'no-store'});
 if(!r.ok)throw new Error(`Overpass HTTP ${r.status}`);return await r.json();
}
async function loadStreetLamps(gen){
 if(!ui.lamps.checked)return;
 const center=cameraOrAircraftCenter();if(!center||!inOsaka(center)){say('街灯取得待ち：大阪上空で飛行位置を取得できていません');return;}
 const radius=6500,dy=radius/111320,dx=radius/(111320*Math.max(.15,Math.cos(rad(center.lat))));
 const s=center.lat-dy,w=center.lon-dx,n=center.lat+dy,e=center.lon+dx;
 const q=`[out:json][timeout:30];(node["highway"="street_lamp"](${s},${w},${n},${e});node["man_made"="street_lamp"](${s},${w},${n},${e}););out body;`;
 let data,last;
 for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){try{data=await fetchOverpass(endpoint,q);break;}catch(err){last=err;}}
 if(gen!==S.generation||S.stopped)return;
 if(!data?.elements?.length)throw last||new Error('周辺の街灯データが見つかりません');
 const nodes=new Map();for(const el of data.elements){if(el.type!=='node'||!Number.isFinite(el.lat)||!Number.isFinite(el.lon))continue;nodes.set(el.id,el);}
 let list=[...nodes.values()].map(el=>({id:el.id,lat:el.lat,lon:el.lon,tags:el.tags||{},height:Math.max(3,Math.min(14,parseFloat((el.tags||{}).height)||parseFloat((el.tags||{})['light:height'])||6.5)),power:1.0,color:new C.Cartesian3(1.0,0.68,0.42)}));
 list.sort((a,b)=>haversine(center,a)-haversine(center,b));list=list.slice(0,520);
 const cartos=list.map(l=>C.Cartographic.fromDegrees(l.lon,l.lat));
 try{if(C.sampleTerrainMostDetailed&&V.terrainProvider){const sampled=await C.sampleTerrainMostDetailed(V.terrainProvider,cartos);for(let i=0;i<list.length;i++)if(Number.isFinite(sampled[i]?.height))list[i].ground=sampled[i].height;}}catch(e){console.warn('[OSAKA beta v4] terrain sample fallback',e);}
 for(let i=0;i<list.length;i++)if(!Number.isFinite(list[i].ground)){const h=SC.globe.getHeight?.(cartos[i]);list[i].ground=Number.isFinite(h)?h:0;}
 if(gen!==S.generation||S.stopped)return;
 clearLampVisuals();S.lampData=list;
 S.pointCollection=new C.PointPrimitiveCollection();SC.primitives.add(S.pointCollection);
 for(const lamp of list.slice(0,160))addLampVisual(lamp);
 S.lastLampCenter={lon:center.lon,lat:center.lat};S.lastLampFetch=Date.now();
 say(`街灯 ${list.length}基を取得。周囲の最大${LIGHTS}灯で局所照明中（表示灯具 ${Math.min(160,list.length)}基）`);requestRender();
}
function addManualLamp(cartographic){
 const lon=C.Math.toDegrees(cartographic.longitude),lat=C.Math.toDegrees(cartographic.latitude),ground=cartographic.height||0;
 const l={id:'manual-'+Date.now()+'-'+Math.random(),lon,lat,ground,height:6.5,power:1.0,color:new C.Cartesian3(1.0,0.68,0.42)};l.ecef=C.Cartesian3.fromDegrees(lon,lat,ground+l.height);
 S.lampData.push(l);if(!S.pointCollection){S.pointCollection=new C.PointPrimitiveCollection();SC.primitives.add(S.pointCollection);}addLampVisual(l);say(`テスト照明を追加：${lat.toFixed(6)}, ${lon.toFixed(6)}`);requestRender();
}
function activateManualPlacement(){
 S.placing=!S.placing;$('ob4Place').textContent=S.placing?'配置モード終了':'タップで照明を追加';
 say(S.placing?'照明を置く地面をタップしてください。':'照明配置モードを終了しました');
}
function setupInput(){
 try{S.mouseHandler=new C.ScreenSpaceEventHandler(SC.canvas);S.mouseHandler.setInputAction(m=>{if(!S.placing)return;let p=null;try{if(SC.pickPositionSupported)p=SC.pickPosition(m.position);}catch(_){}if(!p){const ray=SC.camera.getPickRay(m.position);if(ray)p=SC.globe.pick(ray,SC);}if(!p)return;const c=C.Cartographic.fromCartesian(p);if(c)addManualLamp(c);},C.ScreenSpaceEventType.LEFT_CLICK);}catch(e){console.warn('[OSAKA beta v4] manual lamp picker',e);}
}
function aircraftDistanceToModel(origin){const p=aircraftLLA();return p?haversine(p,origin):0;}
async function fetchTree(){if(S.tree&&Date.now()-S.treeAt<300000)return S.tree;const r=await fetch(TREE,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw new Error('OSAKA GitHub tree HTTP '+r.status);const j=await r.json();if(!Array.isArray(j.tree)||j.truncated)throw new Error('OSAKA GitHub treeが不完全です');S.tree=j.tree;S.treeAt=Date.now();return j.tree;}
function isTrackPath(p){return /^super\/(tracks?|rails?|railway)\//i.test(p)&&/\.glb(?:\.gz)?$/i.test(p);}
function getOrigin(doc){
 const roots=[doc?.asset?.extras,doc?.extras,doc?.scenes?.[0]?.extras,...(doc?.nodes||[]).slice(0,10000).map(n=>n.extras)].filter(Boolean),keys=['origin','georeference','geoReference','geographic','geolocation','geoOrigin','worldOrigin','referencePoint','placement','location','anchor','lla','originLLA','positionLLA'];
 const queue=roots.map(v=>({v,d:0})),seen=new Set();
 while(queue.length){const {v,d}=queue.shift();if(!v||typeof v!=='object'||seen.has(v)||d>6)continue;seen.add(v);
  if(!Array.isArray(v)){
   let lon=null,lat=null,alt=0;for(const k of ['lon','lng','longitude','originLon','originLongitude','origin_longitude'])if(Number.isFinite(+v[k])){lon=+v[k];break;}for(const k of ['lat','latitude','originLat','originLatitude','origin_latitude'])if(Number.isFinite(+v[k])){lat=+v[k];break;}for(const k of ['alt','altitude','elevation','originAlt','originAltitude','origin_altitude'])if(Number.isFinite(+v[k])){alt=+v[k];break;}
   if(lon!==null&&lat!==null&&Math.abs(lon)<=180&&Math.abs(lat)<=90)return{lon,lat,alt,meta:v};for(const k of keys)if(v[k]&&typeof v[k]==='object')queue.push({v:v[k],d:d+1});
  }else if(v.length>=2&&Number.isFinite(+v[0])&&Number.isFinite(+v[1])){let lon=+v[0],lat=+v[1];if(Math.abs(lon)<=90&&Math.abs(lat)>90)[lon,lat]=[lat,lon];if(Math.abs(lon)<=180&&Math.abs(lat)<=90)return{lon,lat,alt:+v[2]||0,meta:{}};}
 }
 return null;
}
function readGlbJson(buf){try{const d=new DataView(buf);if(d.getUint32(0,true)!==0x46546c67||d.getUint32(4,true)!==2)return null;let p=12;while(p+8<=d.byteLength){const n=d.getUint32(p,true),t=d.getUint32(p+4,true);p+=8;if(p+n>d.byteLength)return null;if(t===0x4e4f534a)return JSON.parse(new TextDecoder().decode(new Uint8Array(buf,p,n)).replace(/[\0 ]+$/,''));p+=n;}return null;}catch(_){return null;}}
async function decompressGzip(buf){if(buf.byteLength<2)return buf;const b=new Uint8Array(buf,0,2);if(b[0]===0x1f&&b[1]===0x8b){if(!window.DecompressionStream)throw new Error('gzip展開に対応したブラウザが必要です');return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}return buf;}
async function fetchSidecar(path){const stem=path.replace(/\.glb(?:\.gz)?$/i,'');for(const suffix of ['.json','.meta.json','.metadata.json'])try{const r=await fetch(RAW+stem+suffix,{cache:'force-cache'});if(r.ok){const origin=getOrigin(await r.json());if(origin)return origin;}}catch(_){}return null;}
function makeModelMatrix(origin){const p=C.Cartesian3.fromDegrees(origin.lon,origin.lat,origin.alt,C.Ellipsoid.WGS84);const m=origin.meta||{};const deg=x=>Number.isFinite(+x)?+x*Math.PI/180:0;const hpr=new C.HeadingPitchRoll(deg(m.headingDeg??m.heading),deg(m.pitchDeg??m.pitch),deg(m.rollDeg??m.roll));return C.Transforms.headingPitchRollToFixedFrame(p,hpr,C.Ellipsoid.WGS84);}
async function addOwnGlb(file,kind,gen){if(S.loads.has(file.path))return;S.loads.add(file.path);let model=null,shader=null,url=null;try{
 const src=file.url||RAW+file.path.split('/').map(encodeURIComponent).join('/');const r=await fetch(src,{cache:'force-cache'});if(!r.ok)throw new Error('GLB HTTP '+r.status);const buffer=await decompressGzip(await r.arrayBuffer());if(gen!==S.generation||S.stopped)return;
 const json=readGlbJson(buffer);if(!json)throw new Error('GLB v2 header/JSON不正');let origin=getOrigin(json);if(!origin)origin=await fetchSidecar(file.path);
 if(!origin&&file.path.toLowerCase().endsWith(EXPRESSWAY.path.toLowerCase()))origin={lon:EXPRESSWAY.lon,lat:EXPRESSWAY.lat,alt:EXPRESSWAY.alt,meta:{}};
 if(!origin){S.failed.push(file.path+'：原点extras/sidecarがないため配置を保留');return;}
 if(!inOsaka(origin)){S.failed.push(file.path+'：大阪範囲外のためskip');return;}
 if(aircraftDistanceToModel(origin)>50000){S.failed.push(file.path+'：航空機から50km超のためskip');return;}
 url=URL.createObjectURL(new Blob([buffer],{type:'model/gltf-binary'}));S.blobUrls.push(url);shader=createSurfaceShader(false);S.shaders.push(shader);
 const m=json.asset?.extras||{};const opts={url,modelMatrix:makeModelMatrix(origin),customShader:shader,allowPicking:true,incrementallyLoadTextures:true,asynchronous:true,shadows:C.ShadowMode.ENABLED,enableVerticalExaggeration:false};
 if(m.upAxis==='Z')opts.upAxis=C.Axis.Z;else if(m.upAxis==='X')opts.upAxis=C.Axis.X;
 model=await C.Model.fromGltfAsync(opts);if(gen!==S.generation||S.stopped){try{model.destroy();}catch(_){}return;}SC.primitives.add(model);S.models.push({obj:model,kind,path:file.path});
 if(model.imageBasedLighting?.imageBasedLightingFactor)model.imageBasedLighting.imageBasedLightingFactor=new C.Cartesian2(0.9,0.65);
 model.shadows=C.ShadowMode.ENABLED;S.loaded[kind]++;say(`${kind==='roads'?'高速道路':'線路'} PBRモデル読込：${file.path}`);requestRender();
 }catch(e){if(shader&&!S.shaders.includes(shader)){try{shader.destroy();}catch(_){}}S.failed.push(file.path+'：'+(e.message||e));console.warn('[OSAKA beta v4] GLB',file.path,e);}
}
async function loadOwnModels(gen){
 if(ui.roads.checked)await addOwnGlb(EXPRESSWAY,'roads',gen);
 if(ui.rails.checked){const tree=await fetchTree();const tracks=tree.filter(x=>x.type==='blob'&&isTrackPath(x.path));if(!tracks.length)S.failed.push('super/tracks等の下にGLBがありません');for(const f of tracks){if(gen!==S.generation||S.stopped)return;await addOwnGlb({path:f.path},'rails',gen);}}
}
async function loadBuildings(gen){
 if(!ui.buildings.checked)return;
 await loadPbrMaps();if(gen!==S.generation||S.stopped)return;
 const shader=createSurfaceShader(true);S.shaders.push(shader);
 let last;
 for(const lod of [ui.lod.value]){
  let tileset=null;try{
   tileset=await C.Cesium3DTileset.fromUrl(plateauUrl(lod),{customShader:shader,maximumScreenSpaceError:12,cacheBytes:256*1024*1024,maximumCacheOverflowBytes:64*1024*1024,dynamicScreenSpaceError:true,cullRequestsWhileMoving:true,preloadWhenHidden:false,preloadFlightDestinations:false,shadows:C.ShadowMode.ENABLED});
   if(gen!==S.generation||S.stopped){try{tileset.destroy();}catch(_){}return;}
   SC.primitives.add(tileset);S.tiles.push({obj:tileset,kind:'buildings'});tileset.shadows=C.ShadowMode.ENABLED;S.loaded.buildings++;say(`PLATEAU大阪府 建物 ${lod} 読み込み完了`);requestRender();return;
  }catch(e){last=e;if(tileset){try{SC.primitives.remove(tileset);}catch(_){}}console.warn('[OSAKA beta v4] PLATEAU',lod,e);}
 }
 throw last||new Error('PLATEAU tilesetを読み込めません');
}
async function start(){
 if(S.active){say('読み込み中です');return;}if(S.tiles.length||S.models.length||S.shaders.length){say('既にモデルがあります。「停止・削除」してから再読み込みしてください');return;}S.active=true;S.stopped=false;S.generation++;const gen=S.generation;S.failed=[];S.loads.clear();S.loaded={buildings:0,roads:0,rails:0};say('照明点・PBRマップ・PLATEAUを準備中…');
 saveSceneSettings();
 if(!S.preUpdate){S.preUpdate=()=>{updateShaderLights();if(ui.lamps.checked){const c=cameraOrAircraftCenter();if(c&&S.lastLampCenter&&haversine(c,S.lastLampCenter)>2200&&Date.now()-S.lastLampFetch>45000&&!S.fetchingLamps){S.fetchingLamps=true;loadStreetLamps(S.generation).catch(e=>console.warn(e)).finally(()=>S.fetchingLamps=false);}}};SC.preUpdate.addEventListener(S.preUpdate);}
 try{setupInput();if(ui.lamps.checked){S.fetchingLamps=true;try{await loadStreetLamps(gen);}catch(e){S.failed.push('街灯：'+(e.message||e));say('街灯取得失敗。手動の照明配置も使用できます');}finally{S.fetchingLamps=false;}}
  const tasks=[];if(ui.buildings.checked)tasks.push(loadBuildings(gen).catch(e=>{S.failed.push('PLATEAU建物：'+(e.message||e));}));if(ui.roads.checked||ui.rails.checked)tasks.push(loadOwnModels(gen).catch(e=>{S.failed.push('OSAKAモデル：'+(e.message||e));}));await Promise.all(tasks);
 }catch(e){S.failed.push(e.message||String(e));}if(gen!==S.generation||S.stopped)return;S.active=false;
 say(`完了：PLATEAU建物 ${S.loaded.buildings} / 高速道路 ${S.loaded.roads} / 線路 ${S.loaded.rails} / 街灯 ${S.lampData.length}。失敗・除外 ${S.failed.length}件`);if(S.failed.length)console.warn('[OSAKA beta v4] 詳細',S.failed);requestRender();
}
function stop(){
 S.stopped=true;S.active=false;S.generation++;S.placing=false;$('ob4Place').textContent='タップで照明を追加';
 for(const x of S.tiles){try{SC.primitives.remove(x.obj);}catch(_){}}for(const x of S.models){try{SC.primitives.remove(x.obj);}catch(_){}}S.tiles=[];S.models=[];
 if(S.preUpdate){try{SC.preUpdate.removeEventListener(S.preUpdate);}catch(_){}S.preUpdate=null;}
 if(S.mouseHandler){try{S.mouseHandler.destroy();}catch(_){}S.mouseHandler=null;}
 clearLampVisuals();S.lampData=[];
 for(const sh of S.shaders){try{if(!sh.isDestroyed?.())sh.destroy();}catch(_){}}S.shaders=[];
 for(const st of S.postStages){try{SC.postProcessStages.remove(st);}catch(_){}}S.postStages=[];
 for(const u of S.blobUrls){try{URL.revokeObjectURL(u);}catch(_){}}S.blobUrls=[];S.loads.clear();S.pbr=null;S.glowCanvas=null;S.lastLampCenter=null;S.lastLampFetch=0;restoreSceneSettings();say('追加したPLATEAU・OSAKAモデル・照明を削除しました');requestRender();
}
$('ob4Start').onclick=start;$('ob4Stop').onclick=stop;$('ob4Place').onclick=activateManualPlacement;
ui.lamps.addEventListener('change',()=>{if(!ui.lamps.checked){S.lampData=[];clearLampVisuals();}else if(S.active){loadStreetLamps(S.generation).catch(e=>say('街灯取得失敗：'+e.message));}requestRender();});
ui.mode.addEventListener('change',requestRender);
ui.buildings.addEventListener('change',()=>S.tiles.filter(x=>x.kind==='buildings').forEach(x=>x.obj.show=ui.buildings.checked));
ui.roads.addEventListener('change',()=>S.models.filter(x=>x.kind==='roads').forEach(x=>x.obj.show=ui.roads.checked));
ui.rails.addEventListener('change',()=>S.models.filter(x=>x.kind==='rails').forEach(x=>x.obj.show=ui.rails.checked));
S.stop=stop;S.start=start;S.state=S;window[KEY]=S;
say(`準備完了。CesiumJS ${C.VERSION}。建物PLATEAU / 高速道路・線路OSAKA / 街灯局所PBR照明`);
})();
