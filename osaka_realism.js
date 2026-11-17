(()=>{
'use strict';
const KEY='__osakaRealism';
if(window[KEY]&&typeof window[KEY].stop==='function')window[KEY].stop();
const C=window.Cesium,G=window.geofs;
if(!C||!G||!G.api||!G.api.viewer){console.error('[OSAKA] GeoFS Cesium viewer not found.');return;}
const viewer=G.api.viewer,scene=viewer.scene;
const S={active:false,generation:0,loading:false,loadingBuildings:false,loadingTransport:false,loadingRail:false,loadingFacilities:false,loadingExpressway:false,tiles:[],models:[],collections:[],entities:[],blobUrls:[],timer:0,trainTimer:0,orthoLayer:null,railTiles:null,facilities:null,lastQuery:0,lastLat:null,lastLon:null,lastUpdate:0,train:null,osm:null,lightsEnabled:true,lampPoints:null};
const OSM_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const PLATEAU='https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/';
const EXPRESSWAY_URLS=[
'https://huggingface.co/supermanone-boop/hankyu/resolve/main/Osaka_Expressways_Realistic_v7_optimized_130.glb.gz',
'https://huggingface.co/supermanone-boop/OSAKA/resolve/main/Osaka_Expressways_Realistic_v4.glb.gz'
];
const EXPRESSWAY_ANCHOR={lon:135.51052305,lat:34.74052680,height:0};
const ui={};
const css=`#osakaR{position:fixed;z-index:999999;left:10px;top:92px;width:252px;background:rgba(20,27,34,.94);color:#eef4f8;border:1px solid #61717d;border-radius:8px;font:13px/1.45 Arial,sans-serif;box-shadow:0 4px 18px #0008;padding:9px}#osakaR *{box-sizing:border-box}#osakaR header{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px;margin-bottom:7px}#osakaR button{background:#344957;color:#fff;border:1px solid #718694;border-radius:5px;padding:5px 8px;font-size:12px}#osakaR button:active{background:#526c7c}#osakaR .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 8px;margin:7px 0}#osakaR label{display:flex;align-items:center;gap:5px;white-space:nowrap}#osakaR input[type=checkbox]{accent-color:#7fb7cd}#osakaR input[type=range]{width:100%}#osakaR .small{font-size:11px;color:#b9c8d1}#osakaR #osakaStatus{min-height:30px;margin-top:6px;color:#c8e1ef;overflow-wrap:anywhere}#osakaReopen{position:fixed;z-index:999999;left:10px;top:92px;display:none;background:#202b33;color:#fff;border:1px solid #748490;border-radius:6px;padding:7px 10px;font:12px Arial,sans-serif}`;
document.getElementById('osakaR')?.remove();document.getElementById('osakaReopen')?.remove();document.getElementById('osakaRStyle')?.remove();const style=document.createElement('style');style.id='osakaRStyle';style.textContent=css;document.head.appendChild(style);
const panel=document.createElement('div');panel.id='osakaR';
panel.innerHTML=`<header><span>OSAKA GeoFS Realism</span><button id="osakaClose">×</button></header><div class="grid"><label><input id="osakaBuildings" type="checkbox" checked>建物・LOD3</label><label><input id="osakaTransport" type="checkbox" checked>道路3D</label><label><input id="osakaOrtho" type="checkbox" checked>航空写真</label><label><input id="osakaFacilities" type="checkbox" checked>街灯・設備3D</label><label><input id="osakaRoads" type="checkbox" checked>道路線・高架</label><label><input id="osakaRails" type="checkbox" checked>線路・枕木</label><label><input id="osakaLights" type="checkbox" checked>街灯</label><label><input id="osakaTrain" type="checkbox" checked>走行列車</label><label><input id="osakaExpressway" type="checkbox">高速道路GLB</label></div><div class="small">周辺読み込み半径 <b id="osakaRadiusLabel">6 km</b></div><input id="osakaRadius" type="range" min="3" max="12" step="1" value="6"><div style="display:flex;gap:6px;margin-top:7px"><button id="osakaStart">開始 / 更新</button><button id="osakaStop">停止・削除</button></div><div id="osakaStatus">待機中。大阪府内で開始してください。</div><div class="small">建物はテクスチャ付きPLATEAU優先。道路・線路は近傍データを取得します。</div>`;
document.body.appendChild(panel);
const reopen=document.createElement('button');reopen.id='osakaReopen';reopen.textContent='OSAKA';document.body.appendChild(reopen);
const $=id=>document.getElementById(id);
['osakaBuildings','osakaTransport','osakaOrtho','osakaFacilities','osakaRoads','osakaRails','osakaLights','osakaTrain','osakaExpressway','osakaRadius','osakaRadiusLabel','osakaStatus'].forEach(id=>ui[id]=$(id));
const status=t=>{ui.osakaStatus.textContent=t;console.log('[OSAKA]',t);};
const active=id=>ui[id].checked;
const radius=()=>Number(ui.osakaRadius.value)*1000;
ui.osakaRadius.addEventListener('input',()=>ui.osakaRadiusLabel.textContent=ui.osakaRadius.value+' km');
$('osakaClose').onclick=()=>{panel.style.display='none';reopen.style.display='block';};
reopen.onclick=()=>{panel.style.display='block';reopen.style.display='none';};
function getAircraft(){
 try{
  const p=G.aircraft&&G.aircraft.instance&&G.aircraft.instance.llaLocation;
  if(!p||p.length<2)return null;
  let lat,lon;
  if(Math.abs(Number(p[0]))<=90&&Math.abs(Number(p[1]))>90){lat=Number(p[0]);lon=Number(p[1]);}
  else{lon=Number(p[0]);lat=Number(p[1]);}
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const h=Number(p[2])||0;
  return {lat,lon,height:h};
 }catch(e){return null;}
}
function inOsaka(p){return p&&p.lon>=134.80&&p.lon<=136.05&&p.lat>=34.25&&p.lat<=35.10;}
function distance(a,b){const R=6371000,rad=x=>x*Math.PI/180,dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon),v=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(v));}
function groundHeight(lon,lat){try{const c=C.Cartographic.fromDegrees(lon,lat);const h=scene.globe.getHeight(c);return Number.isFinite(h)?h:0;}catch(e){return 0;}}
function makeCollection(){const p=new C.PolylineCollection();scene.primitives.add(p);S.collections.push(p);return p;}
function material(color){return C.Material.fromType('Color',{color});}
function addLine(col,pts,width,color){if(pts.length<2)return;col.add({positions:pts,width,material:material(color)});}
function addPointCollection(){const p=new C.PointPrimitiveCollection();scene.primitives.add(p);S.collections.push(p);return p;}
function cart(lon,lat,h){return C.Cartesian3.fromDegrees(lon,lat,h);}
function offsetLL(lat,lon,east,north){const dLat=north/111320,dLon=east/(111320*Math.max(.2,Math.cos(lat*Math.PI/180)));return {lat:lat+dLat,lon:lon+dLon};}
function getTile(url,label,maxError){
 return new Promise((resolve,reject)=>{
  let t;try{t=new C.Cesium3DTileset({url,maximumScreenSpaceError:maxError||24});}catch(e){reject(e);return;}
  try{scene.primitives.add(t);S.tiles.push(t);}catch(e){reject(e);return;}
  const ready=t.readyPromise&&typeof t.readyPromise.then==='function'?t.readyPromise:Promise.resolve(t);
  ready.then(()=>{t.maximumScreenSpaceError=maxError||24;if('dynamicScreenSpaceError'in t)t.dynamicScreenSpaceError=true;if('maximumMemoryUsage'in t)t.maximumMemoryUsage=160;status(label+' 読み込み完了');resolve(t);}).catch(e=>{try{scene.primitives.remove(t);}catch(_){}S.tiles=S.tiles.filter(x=>x!==t);reject(e);});
 });
}
async function firstWorking(specs,label,maxError){let last;for(const spec of specs){try{return await getTile(PLATEAU+spec+'/tileset.json',label,maxError);}catch(e){last=e;console.warn('[OSAKA] tileset failed',spec,e);}}throw last||new Error('No PLATEAU dataset');}
async function loadBuildings(){if(S.buildings||S.loadingBuildings||!active('osakaBuildings'))return;const gen=S.generation;S.loadingBuildings=true;status('PLATEAU建物を取得中…');try{const t=await firstWorking(['27-bldg-maxlod3-texture-latest','27100-bldg-maxlod3-texture-latest'],'建物',24);if(gen!==S.generation||!S.active||!active('osakaBuildings')){scene.primitives.remove(t);S.tiles=S.tiles.filter(x=>x!==t);return;}S.buildings=t;}catch(e){if(gen===S.generation)status('建物タイルを取得できません: '+(e.message||e));}finally{S.loadingBuildings=false;}}
async function loadTransport(){if(S.transport||S.loadingTransport||!active('osakaTransport'))return;const gen=S.generation;S.loadingTransport=true;status('PLATEAU道路LOD3を取得中…');try{const t=await firstWorking(['27-tran-lod3-latest','27100-tran-lod3-latest'],'道路LOD3',28);if(gen!==S.generation||!S.active||!active('osakaTransport')){scene.primitives.remove(t);S.tiles=S.tiles.filter(x=>x!==t);return;}S.transport=t;}catch(e){if(gen===S.generation)status('道路LOD3なし。OSM道路線形を使用します。');}finally{S.loadingTransport=false;}}
async function loadRailTiles(){if(S.railTiles||S.loadingRail||!active('osakaRails'))return;const gen=S.generation;S.loadingRail=true;status('PLATEAU鉄道LOD3を取得中…');try{const t=await firstWorking(['27-rwy-lod3-latest','27100-rwy-lod3-latest'],'鉄道LOD3',28);if(gen!==S.generation||!S.active||!active('osakaRails')){scene.primitives.remove(t);S.tiles=S.tiles.filter(x=>x!==t);return;}S.railTiles=t;}catch(e){if(gen===S.generation)status('鉄道LOD3なし。OSM線路データを使用します。');}finally{S.loadingRail=false;}}
async function loadFacilities(){if(S.facilities||S.loadingFacilities||!active('osakaFacilities'))return;const gen=S.generation;S.loadingFacilities=true;status('PLATEAU街路設備LOD3を取得中…');try{const t=await firstWorking(['27-frn-lod3-latest','27100-frn-lod3-latest'],'街路設備LOD3',30);if(gen!==S.generation||!S.active||!active('osakaFacilities')){scene.primitives.remove(t);S.tiles=S.tiles.filter(x=>x!==t);return;}S.facilities=t;}catch(e){if(gen===S.generation)status('PLATEAU街路設備なし。OSM街灯を補助表示します。');}finally{S.loadingFacilities=false;}}
function loadOrtho(){if(S.orthoLayer||!active('osakaOrtho'))return;try{const provider=new C.UrlTemplateImageryProvider({url:'https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png',rectangle:C.Rectangle.fromDegrees(134.80,34.25,136.05,35.10),minimumLevel:10,maximumLevel:19,credit:new C.Credit('国土交通省 Project PLATEAU')});S.orthoLayer=viewer.imageryLayers.addImageryProvider(provider);S.orthoLayer.alpha=.96;status('大阪のPLATEAU航空写真を追加しました');}catch(e){status('航空写真レイヤーを追加できません: '+(e.message||e));}}
async function loadExpressway(){if(S.expressway||S.loadingExpressway||!active('osakaExpressway'))return;const gen=S.generation;S.loadingExpressway=true;if(window.__osakaExpresswaysModel){S.expressway=window.__osakaExpresswaysModel;S.models.push(S.expressway);S.loadingExpressway=false;return;}const p=getAircraft();if(!p||distance(p,{lat:EXPRESSWAY_ANCHOR.lat,lon:EXPRESSWAY_ANCHOR.lon})>28000){status('高速道路GLBは大阪中心部から28km以内で読み込みます。');S.loadingExpressway=false;return;}status('高速道路GLBを取得中（大容量）…');let last;
 for(const url of EXPRESSWAY_URLS){try{const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error('HTTP '+r.status);let data=await r.arrayBuffer();if(url.endsWith('.gz')){if(!window.DecompressionStream)throw new Error('gzip展開非対応');const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));data=await new Response(stream).arrayBuffer();}if(gen!==S.generation||!S.active||!active('osakaExpressway')){S.loadingExpressway=false;return;}const blob=new Blob([data],{type:'model/gltf-binary'}),blobUrl=URL.createObjectURL(blob);S.blobUrls.push(blobUrl);const pos=cart(EXPRESSWAY_ANCHOR.lon,EXPRESSWAY_ANCHOR.lat,EXPRESSWAY_ANCHOR.height);const matrix=C.Transforms.headingPitchRollToFixedFrame(pos,new C.HeadingPitchRoll(0,0,0));const m=C.Model.fromGltf({url:blobUrl,modelMatrix:matrix,allowPicking:true,incrementallyLoadTextures:true});scene.primitives.add(m);S.models.push(m);S.expressway=m;window.__osakaExpresswaysModel=m;S.loadingExpressway=false;if(m.readyToRender&&m.readyToRender.addEventListener)m.readyToRender.addEventListener(()=>status('高速道路GLB表示完了'));else status('高速道路GLBを登録しました');return;}catch(e){if(gen!==S.generation||!S.active){S.loadingExpressway=false;return;}last=e;console.warn('[OSAKA] expressway model failed',url,e);}}
 status('高速道路GLB読込失敗: '+(last&&last.message||last));S.loadingExpressway=false;
}
function clearVector(){if(S.trainTimer)clearInterval(S.trainTimer);S.trainTimer=0;S.lampPoints=null;for(const c of S.collections){try{scene.primitives.remove(c);}catch(e){}}S.collections=[];S.entities.forEach(e=>{try{viewer.entities.remove(e);}catch(_){}});S.entities=[];S.train=null;S.osm=null;}
function parseWays(json){return (json.elements||[]).filter(e=>e.type==='way'&&Array.isArray(e.geometry)&&e.geometry.length>1);}
async function getOsm(p){const r=radius(),dlat=r/111320,dlon=r/(111320*Math.max(.25,Math.cos(p.lat*Math.PI/180)));const s=p.lat-dlat,w=p.lon-dlon,n=p.lat+dlat,e=p.lon+dlon;const q=`[out:json][timeout:25];(way["highway"~"motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary"](${s},${w},${n},${e});way["railway"~"rail|light_rail|tram|subway|narrow_gauge"](${s},${w},${n},${e}););out tags geom;`;
 let last;for(const endpoint of OSM_ENDPOINTS){try{const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),30000);const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q),signal:ctl.signal});clearTimeout(to);if(!res.ok)throw new Error('HTTP '+res.status);return await res.json();}catch(e){last=e;console.warn('[OSAKA] Overpass failed',endpoint,e);}}throw last||new Error('Overpass unavailable');}
function geom(e){return e.geometry.map(p=>({lat:p.lat,lon:p.lon}));}
function lengthOf(path){let d=0;for(let i=1;i<path.length;i++)d+=distance(path[i-1],path[i]);return d;}
function bearing(a,b){const r=x=>x*Math.PI/180,y=x=>x*180/Math.PI,la=r(a.lat),lb=r(b.lat),dl=r(b.lon-a.lon);return Math.atan2(Math.sin(dl)*Math.cos(lb),Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(dl));}
function pointAt(path,cum,dist){const total=cum[cum.length-1];dist=((dist%total)+total)%total;let i=1;while(i<cum.length-1&&cum[i]<dist)i++;const seg=cum[i]-cum[i-1],t=seg>0?(dist-cum[i-1])/seg:0,a=path[i-1],b=path[i];return {lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,heading:bearing(a,b)};}
function makeTrain(path,way){const len=lengthOf(path);if(len<900)return null;const cum=[0];for(let i=1;i<path.length;i++)cum.push(cum[i-1]+distance(path[i-1],path[i]));const train={path,cum,len,start:Math.random()*len,entities:[],born:Date.now(),speed:13,way};
 const silver=C.Color.fromBytes(203,211,216),roof=C.Color.fromBytes(83,94,101),glass=C.Color.fromBytes(28,58,72),stripe=C.Color.fromBytes(0,119,112),wheel=C.Color.fromBytes(36,40,43),lamp=C.Color.fromBytes(255,224,153);
 for(let carIndex=0;carIndex<4;carIndex++){
  const parts=[
   {x:0,y:0,z:2.25,dim:[2.78,18.5,3.25],color:silver},
   {x:0,y:0,z:4.0,dim:[2.68,17.6,.32],color:roof},
   {x:0,y:0,z:2.95,dim:[.035,15.8,.92],color:glass,side:1},
   {x:0,y:0,z:2.95,dim:[.035,15.8,.92],color:glass,side:-1},
   {x:0,y:0,z:1.75,dim:[.045,17.6,.23],color:stripe,side:1},
   {x:0,y:0,z:1.75,dim:[.045,17.6,.23],color:stripe,side:-1},
   {x:0,y:0,z:.75,dim:[2.45,3.2,.55],color:wheel}
  ];
  for(const part of parts){const en=viewer.entities.add({position:cart(path[0].lon,path[0].lat,0),box:{dimensions:new C.Cartesian3(part.dim[0],part.dim[1],part.dim[2]),material:part.color,outline:false}});train.entities.push({entity:en,part,carIndex});S.entities.push(en);}
 }
 const update=()=>{const elapsed=(Date.now()-train.born)/1000;for(const item of train.entities){const d=train.start+elapsed*train.speed-item.carIndex*20.2,pt=pointAt(path,cum,d),h=groundHeight(pt.lon,pt.lat)+(way.tags&&way.tags.bridge==='yes'?5.5:1.0);const x=(item.part.side||0)*1.40,y=item.part.y||0,hd=pt.heading;const east=x*Math.cos(hd)+y*Math.sin(hd),north=-x*Math.sin(hd)+y*Math.cos(hd),ll=offsetLL(pt.lat,pt.lon,east,north),pos=cart(ll.lon,ll.lat,h+(item.part.z||0));item.entity.position=pos;item.entity.orientation=C.Transforms.headingPitchRollQuaternion(pos,new C.HeadingPitchRoll(hd,0,0));}};
 train.update=update;update();return train;
}
function buildVectors(json){clearVector();const ways=parseWays(json),roads=ways.filter(w=>w.tags&&w.tags.highway),rails=ways.filter(w=>w.tags&&w.tags.railway);const roadCol=makeCollection(),railCol=makeCollection(),lightCol=makeCollection(),lampCol=addPointCollection();S.lampPoints=lampCol;
 let poleCount=0,sleeperCount=0;
 for(const w of roads.slice(0,420)){
  const path=geom(w),tag=w.tags,high=tag.highway||'secondary',bridge=tag.bridge==='yes'||Number(tag.layer)>0,offset=bridge?(Number(tag.layer)>0?Math.max(4.5,Number(tag.layer)*4.5):6):.45;
  const pts=path.map(p=>cart(p.lon,p.lat,groundHeight(p.lon,p.lat)+offset));
  const widths={motorway:8,motorway_link:6,trunk:7,trunk_link:5,primary:5,primary_link:4,secondary:3.5};
  const widthsPx=widths[high]||3.2,roadColor=high==='motorway'||high==='motorway_link'?C.Color.fromBytes(56,61,66,245):C.Color.fromBytes(72,77,82,235);
  if(active('osakaRoads')){
   addLine(roadCol,pts,widthsPx,roadColor);
   if(bridge){const edgeL=[],edgeR=[];for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],hd=bearing(a,b),p=path[i],g=groundHeight(p.lon,p.lat)+offset+0.2;for(const side of [-1,1]){const ll=offsetLL(p.lat,p.lon,side*7*Math.cos(hd),side*7*-Math.sin(hd));(side<0?edgeL:edgeR).push(cart(ll.lon,ll.lat,g));}}addLine(roadCol,edgeL,1.2,C.Color.fromBytes(181,187,190));addLine(roadCol,edgeR,1.2,C.Color.fromBytes(181,187,190));}
  }
  if(active('osakaLights')&&poleCount<420&&tag.lit!=='no'&&(high==='motorway'||high==='motorway_link'||high==='trunk'||high==='primary')){
   const total=lengthOf(path);for(let d=35;d<total&&poleCount<420;d+=85){let cum=[0];for(let i=1;i<path.length;i++)cum.push(cum[i-1]+distance(path[i-1],path[i]));const pt=pointAt(path,cum,d),base=groundHeight(pt.lon,pt.lat)+offset;const top=cart(pt.lon,pt.lat,base+7.3);addLine(lightCol,[cart(pt.lon,pt.lat,base),top],1.4,C.Color.fromBytes(76,79,78));const tip=offsetLL(pt.lat,pt.lon,1.4*Math.cos(pt.heading),-1.4*Math.sin(pt.heading));addLine(lightCol,[top,cart(tip.lon,tip.lat,base+7.0)],1.2,C.Color.fromBytes(90,91,86));lampCol.add({position:cart(tip.lon,tip.lat,base+7.0),pixelSize:7,color:C.Color.fromBytes(255,219,153,225),outlineColor:C.Color.fromBytes(255,245,220,120),outlineWidth:1});poleCount++;}
  }
 }
 if(active('osakaRails')){
  for(const w of rails.slice(0,220)){
   if(w.tags&&w.tags.tunnel==='yes')continue;const path=geom(w),bridge=w.tags.bridge==='yes'||Number(w.tags.layer)>0,baseOffset=bridge?(Number(w.tags.layer)>0?Math.max(4.5,Number(w.tags.layer)*4.5):5.8):.65;
   const cum=[0];for(let i=1;i<path.length;i++)cum.push(cum[i-1]+distance(path[i-1],path[i]));const gauge=Number(w.tags.gauge)||1067,half=(gauge/1000)/2;
   for(const side of [-1,1]){const railPts=[];for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],hd=bearing(a,b),p=path[i],ll=offsetLL(p.lat,p.lon,side*half*Math.cos(hd),side*half*-Math.sin(hd));railPts.push(cart(ll.lon,ll.lat,groundHeight(p.lon,p.lat)+baseOffset+.18));}addLine(railCol,railPts,2.1,C.Color.fromBytes(66,71,75));}
   if(sleeperCount<1200){for(let d=0;d<cum[cum.length-1]&&sleeperCount<1200;d+=8){const pt=pointAt(path,cum,d),a=offsetLL(pt.lat,pt.lon,-1.25*Math.cos(pt.heading),1.25*Math.sin(pt.heading)),b=offsetLL(pt.lat,pt.lon,1.25*Math.cos(pt.heading),-1.25*Math.sin(pt.heading)),h=groundHeight(pt.lon,pt.lat)+baseOffset+.03;addLine(railCol,[cart(a.lon,a.lat,h),cart(b.lon,b.lat,h)],2.0,C.Color.fromBytes(88,72,55));sleeperCount++;}}
  }
 }
 if(active('osakaTrain')){const candidate=rails.map(w=>({w,path:geom(w),len:lengthOf(geom(w))})).filter(x=>x.len>900).sort((a,b)=>b.len-a.len)[0];if(candidate){S.train=makeTrain(candidate.path,candidate.w);if(S.train)S.trainTimer=setInterval(()=>{if(S.active&&S.train)S.train.update();},180);}}
 S.osm={roads:roads.length,rails:rails.length,lightPoles:poleCount,sleepers:sleeperCount};status(`近傍データ表示: 道路${roads.length} / 鉄道${rails.length} / 街灯${poleCount}。`);
}
async function refreshVectors(p){const now=Date.now();if(S.loading||!active('osakaRoads')&&!active('osakaRails')&&!active('osakaLights')&&!active('osakaTrain'))return;if(S.lastLat!==null&&distance(p,{lat:S.lastLat,lon:S.lastLon})<radius()*.45&&now-S.lastQuery<120000)return;S.loading=true;S.lastQuery=now;S.lastLat=p.lat;S.lastLon=p.lon;const gen=S.generation;try{status('周辺の道路・鉄道データを取得中…');const data=await getOsm(p);if(gen!==S.generation||!S.active)return;buildVectors(data);}catch(e){status('道路・鉄道データ取得失敗: '+(e.message||e));}finally{S.loading=false;}}
function isNight(){try{const d=viewer.clock&&viewer.clock.currentTime?C.JulianDate.toDate(viewer.clock.currentTime):new Date();return d.getHours()<6||d.getHours()>=18;}catch(e){return true;}}
function update(){if(!S.active)return;const p=getAircraft();if(!p){status('航空機の位置を取得できません。GeoFSで機体を読み込んでください。');return;}if(!inOsaka(p)){status('大阪エリア外です。大阪府内に移動すると自動で開始します。');return;}if(active('osakaBuildings'))loadBuildings();if(active('osakaTransport'))loadTransport();if(active('osakaRails'))loadRailTiles();if(active('osakaFacilities'))loadFacilities();if(active('osakaOrtho'))loadOrtho();if(S.orthoLayer)S.orthoLayer.show=inOsaka(p)&&active('osakaOrtho');if(active('osakaExpressway'))loadExpressway();refreshVectors(p);if(S.lampPoints)S.lampPoints.show=isNight()&&active('osakaLights');if(S.expressway){const d=distance(p,{lat:EXPRESSWAY_ANCHOR.lat,lon:EXPRESSWAY_ANCHOR.lon});S.expressway.show=d<32000&&active('osakaExpressway');}if(S.buildings)S.buildings.show=active('osakaBuildings');if(S.transport)S.transport.show=active('osakaTransport');if(S.railTiles)S.railTiles.show=active('osakaRails');if(S.facilities)S.facilities.show=active('osakaFacilities');}
function start(){if(S.active){update();return;}S.active=true;status('起動しました。大阪周辺のデータを確認中…');update();S.timer=setInterval(update,2500);}
function stop(){S.active=false;S.generation++;if(S.timer)clearInterval(S.timer);S.timer=0;clearVector();for(const t of S.tiles){try{scene.primitives.remove(t);}catch(e){}}S.tiles=[];S.buildings=null;S.transport=null;S.railTiles=null;S.facilities=null;S.loadingRail=false;S.loadingFacilities=false;if(S.orthoLayer){try{viewer.imageryLayers.remove(S.orthoLayer,true);}catch(e){}S.orthoLayer=null;}for(const m of S.models){try{scene.primitives.remove(m);}catch(e){}}S.models=[];S.expressway=null;window.__osakaExpresswaysModel=null;S.loadingBuildings=false;S.loadingTransport=false;S.loadingRail=false;S.loadingFacilities=false;S.loadingExpressway=false;for(const u of S.blobUrls){try{URL.revokeObjectURL(u);}catch(e){}}S.blobUrls=[];status('停止しました。追加した道路・線路・列車・タイルを削除しました。');}
$('osakaStart').onclick=start;$('osakaStop').onclick=stop;
ui.osakaBuildings.addEventListener('change',()=>{if(S.buildings)S.buildings.show=active('osakaBuildings');if(S.active&&active('osakaBuildings'))loadBuildings();});
ui.osakaTransport.addEventListener('change',()=>{if(S.transport)S.transport.show=active('osakaTransport');if(S.active&&active('osakaTransport'))loadTransport();});
ui.osakaExpressway.addEventListener('change',()=>{if(!active('osakaExpressway')&&S.expressway)S.expressway.show=false;if(S.active&&active('osakaExpressway'))loadExpressway();});
ui.osakaRails.addEventListener('change',()=>{if(S.railTiles)S.railTiles.show=active('osakaRails');S.lastQuery=0;if(S.active&&active('osakaRails'))loadRailTiles();if(S.active){const p=getAircraft();if(p)refreshVectors(p);}});
for(const id of ['osakaRoads','osakaLights','osakaTrain'])ui[id].addEventListener('change',()=>{S.lastQuery=0;if(S.active){const p=getAircraft();if(p)refreshVectors(p);}});
S.stop=stop;S.start=start;S.update=update;S.state=S;window[KEY]=S;
status('準備完了。大阪府内で「開始 / 更新」を押してください。');
})();
