/* StoreGA · 3D digital twin (three.js, loaded on first visit to 即時店況).
   Customers are driven by the same model as every other page and walk on an A* grid, so nobody passes through a wall or a shelf. */
let twinLoading=null;
function initTwin(){if(twinLoading)return twinLoading;twinLoading=(async()=>{try{ window.twin=await (async()=>{
const THREE=await import('three');
const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');
const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');

const host=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D 店面模型：拖曳旋轉、滾輪縮放、點選區域');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xEEF0F3);scene.fog=new THREE.Fog(0xEEF0F3,60,140);
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.5;
const camera=new THREE.PerspectiveCamera(34,1,.1,300);
const CAMS={iso:{p:[19,23,27],t:[0,0,.5]},top:{p:[0,44,.01],t:[0,0,0]},door:{p:[7.5,5.2,17.5],t:[2.2,.9,6.5]}};
camera.position.set(...CAMS.iso.p);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(...CAMS.iso.t);controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=1.36;controls.minDistance=6;controls.maxDistance=70;controls.screenSpacePanning=false;controls.panSpeed=.6;
const hemi=new THREE.HemisphereLight(0xffffff,0xd6d8dd,.8);scene.add(hemi);
const key=new THREE.DirectionalLight(0xfff0dc,2.1);key.position.set(13,26,11);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-19,right:19,top:17,bottom:-17,near:2,far:70});key.shadow.bias=-.0003;key.shadow.normalBias=.025;key.shadow.radius=3;scene.add(key);
const fillL=new THREE.DirectionalLight(0xa9c4ff,.35);fillL.position.set(-18,14,-8);scene.add(fillL);

const M=(c,r=.8,m=0,x={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...x});
const MAT={plaster:M(0xffffff,.92),tile:M(0xffffff,.55),oak:M(0xb58b5c,.55),oakLight:M(0xd8c3a0,.6),walnut:M(0x5e4130,.6),black:M(0x1d2027,.42,.55),steel:M(0xb5bac1,.32,.85),
  white:M(0xf2f0eb,.6),fabric:M(0x3b4250,.95),glass:new THREE.MeshStandardMaterial({color:0xcfe3f5,transparent:true,opacity:.12,roughness:.05,metalness:.3,depthWrite:false}),
  pcb:M(0x1f6b4b,.55),chip:M(0x16181d,.4,.3),shield:M(0xc0c4ca,.3,.9),leaf:M(0x3f7a4c,.8),leaf2:M(0x5c9a58,.8),pot:M(0xd9d3c7,.7),asphalt:M(0xD3D6DB,.95),walk:M(0xE9EAEC,.9),curb:M(0xC7CACF,.85),slab:M(0xC4BAA8,.9),lane:M(0xffffff,.6)};
const box=(w,h,d,mat,cast=true)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.castShadow=cast;o.receiveShadow=true;return o};
const at=(o,x,y,z)=>{o.position.set(x,y,z);return o};
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const C=c=>new THREE.Color(c);
const qY=a=>new THREE.Quaternion().setFromAxisAngle(V(0,1,0),a);
const hash=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s)};

/* reversible assembly timeline: one progress value; every piece has start, duration, travel */
const build=[];const dirty=new Set();const tm=new THREE.Matrix4(),tp=new THREE.Vector3(),ZERO=V(1e-4,1e-4,1e-4);
const land=t=>{const c1=.45,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)};
let layerFade=0;
function piece(o,s,d=.08,travel=2.2){build.push({k:'m',o,y:o.position.y,s,d,travel});scene.add(o);return o}
function applyBuild(p){
  for(const it of build){const t=(p-it.s)/it.d;
    if(it.k==='m'){if(t<=0){it.o.visible=false;continue}it.o.visible=true;it.o.position.y=it.y+it.travel*(1-land(Math.min(1,t)))}
    else{if(t<=0)tm.compose(it.pos,it.q,ZERO);else{tp.copy(it.pos);tp.y+=it.travel*(1-land(Math.min(1,t)));tm.compose(tp,it.q,it.scl)}it.mesh.setMatrixAt(it.i,tm);dirty.add(it.mesh)}}
  dirty.forEach(m=>m.instanceMatrix.needsUpdate=true);dirty.clear();
  layerFade=clamp((p-.9)/.1,0,1);
}
function inst(geo,mat,list,cast=true){const m=new THREE.InstancedMesh(geo,mat,list.length);m.castShadow=cast;m.receiveShadow=true;
  list.forEach((it,i)=>{build.push({k:'i',mesh:m,i,pos:it.pos,q:it.q||new THREE.Quaternion(),scl:it.scl||V(1,1,1),s:it.s,d:it.d,travel:it.travel});if(it.c)m.setColorAt(i,it.c)});
  scene.add(m);return m}
const shadows=g=>{g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});return g};

/* ---- site ---- */
const ground=at(new THREE.Mesh(new THREE.PlaneGeometry(240,240),MAT.asphalt),0,-.42,0);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
piece(at(box(27,.4,18.6,MAT.slab),0,-.2,0),0,.06,1);
piece(at(box(30,.16,5.2,MAT.walk),1,-.34,11.9),0,.06,1);
piece(at(box(30,.22,.25,MAT.curb),1,-.31,14.6),.01,.06,1);
for(let i=0;i<7;i++)piece(at(box(2.2,.02,.16,MAT.lane,false),-12+i*4.4,-.405,17.2),.02,.06,.6);
{ const L=[];for(let r=0;r<17;r++)for(let q=0;q<25;q++){const x=-12+q,z=-8+r,j=hash(x,z);L.push({pos:V(x,.03,z),c:C(0xffffff).setRGB(.80+j*.04,.78+j*.04,.74+j*.035),s:.04+(r/17)*.17+(q/25)*.03,d:.06,travel:.9})}
  inst(new THREE.BoxGeometry(.97,.06,.97),MAT.tile,L,false); }
{ // masonry walls in running bond; the front is a low storefront wall with a real door opening
  const H=.45,T=.3,L=[];const qz=qY(Math.PI/2),qx=new THREE.Quaternion();
  const run=(axis,fixed,a0,a1,courses,gap)=>{for(let cs=0;cs<courses;cs++){let a=a0,first=true;while(a<a1-.01){const len=Math.min(first&&cs%2?.5:1,a1-a);first=false;const mid=a+len/2;a+=len;
    if(gap&&mid>gap[0]&&mid<gap[1])continue;const j=hash(mid*3.1,cs+fixed);
    L.push({pos:axis==='x'?V(mid,H/2+cs*H,fixed):V(fixed,H/2+cs*H,mid),q:axis==='x'?qx:qz,scl:V(len-.03,.96,1),c:C(0xffffff).setRGB(.9+j*.04,.885+j*.04,.86+j*.04),s:.22+cs*.052+(mid-a0)/(a1-a0)*.024,d:.07,travel:2.2})}}};
  run('x',-8.65,-12.8,12.8,6);run('z',-12.65,-8.5,8.8,6);run('z',12.65,-8.5,8.8,6);run('x',8.65,-12.5,12.5,2,[1,4]);
  inst(new THREE.BoxGeometry(1,H,T),MAT.plaster,L);
  const cap=M(0xd6d1c8,.7);
  piece(at(box(25.9,.08,.42,cap),0,2.74,-8.65),.55,.06,1.4);piece(at(box(.42,.08,17.4,cap),-12.65,2.74,0),.555,.06,1.4);piece(at(box(.42,.08,17.4,cap),12.65,2.74,0),.56,.06,1.4);
  piece(at(box(13.5,.06,.4,cap),-5.75,.93,8.65),.42,.06,1);piece(at(box(8.5,.06,.4,cap),8.25,.93,8.65),.42,.06,1);
  piece(at(box(24.9,.12,.04,MAT.walnut,false),0,.1,-8.48),.6,.05,.8);piece(at(box(.04,.12,16.9,MAT.walnut,false),-12.48,.1,0),.6,.05,.8);piece(at(box(.04,.12,16.9,MAT.walnut,false),12.48,.1,0),.6,.05,.8);
}
{ // glass storefront, mullions, door frame, lit sign
  const g=new THREE.Group();
  [[-12.5,1],[4,12.5]].forEach(([a,b])=>{const w=b-a;const gl=at(new THREE.Mesh(new THREE.BoxGeometry(w,1.78,.04),MAT.glass),(a+b)/2,1.85,8.65);gl.renderOrder=3;g.add(gl);
    const n=Math.round(w/2.6);for(let k=0;k<=n;k++)g.add(at(box(.07,1.8,.09,MAT.black),a+k*w/n,1.85,8.65));
    g.add(at(box(w,.07,.09,MAT.black),(a+b)/2,2.74,8.65))});
  g.add(at(box(.14,2.8,.16,MAT.black),1,1.4,8.65));g.add(at(box(.14,2.8,.16,MAT.black),4,1.4,8.65));g.add(at(box(3.14,.3,.16,MAT.black),2.5,2.65,8.65));
  const sc=document.createElement('canvas');sc.width=512;sc.height=96;const sx=sc.getContext('2d');const signTex=new THREE.CanvasTexture(sc);signTex.colorSpace=THREE.SRGBColorSpace;
  const drawSign=()=>{sx.fillStyle='#0f1420';sx.fillRect(0,0,512,96);sx.fillStyle='#f8fafc';sx.font='600 54px "Fira Sans","Noto Sans TC",sans-serif';sx.textAlign='center';sx.textBaseline='middle';sx.fillText('StoreGA',256,48);sx.fillStyle='#34C759';sx.fillRect(176,82,160,4);signTex.needsUpdate=true};
  drawSign();document.fonts?.ready.then(drawSign);
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.9,.54,.12),[MAT.black,MAT.black,MAT.black,MAT.black,new THREE.MeshBasicMaterial({map:signTex}),MAT.black]),2.5,3.12,8.74));
  for(let i=0;i<3;i++)g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.5,.04,.12),new THREE.MeshBasicMaterial({color:0xfff3d6})),1.6+i*.9,2.48,8.5));
  piece(g,.6,.09,1.6);
  piece(at(box(3,.02,1.4,M(0x262a31,.95),false),2.5,.07,7.75),.62,.05,.6);
}
function textTex(t1,t2,accent){const w=512,h=160,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const draw=()=>{x.fillStyle='#f8fafc';x.fillRect(0,0,w,h);x.fillStyle=accent;x.fillRect(0,0,14,h);x.fillStyle='#0f172a';x.textBaseline='middle';x.font=`700 ${h*.38}px "Fira Sans","Noto Sans TC",sans-serif`;x.fillText(t1,40,h*.38);
    x.fillStyle='#64748b';x.font=`500 ${h*.18}px "Fira Code",monospace`;x.fillText(t2,42,h*.76);tex.needsUpdate=true};draw();document.fonts?.ready.then(draw);return tex}
function wallSign(zd,x,z,rot){const m=at(new THREE.Mesh(new THREE.BoxGeometry(2.1,.66,.05),[MAT.white,MAT.white,MAT.white,MAT.white,new THREE.MeshBasicMaterial({map:textTex(`${zd.id} ${zd.name}`,`ZONE ${zd.id} · ${zd.node}`,zd.color)}),MAT.white]),x,2.25,z);m.rotation.y=rot;piece(m,.66,.06,1.5)}
wallSign(ZMAP.A,-7,-8.46,0);wallSign(ZMAP.B,5.8,-8.46,0);wallSign(ZMAP.C,-12.46,3.2,Math.PI/2);wallSign(ZMAP.D,12.46,2.4,-Math.PI/2);
for(let i=0;i<6;i++)piece(at(new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,.12),new THREE.MeshBasicMaterial({color:0xfff1d6})),-10+i*4,2.62,-8.43),.64,.05,1);

/* ---- fixtures, also registered as navigation obstacles ---- */
const OBST=[],SPOTS={A:[],B:[],C:[],D:[],corr:[]};
const ob=(cx,cz,w,d,zone,browse)=>OBST.push({x0:cx-w/2,x1:cx+w/2,z0:cz-d/2,z1:cz+d/2,zone,browse});
const prodCols=[0x5b7db1,0xd39b5f,0x6aa184,0xe0d6c3,0x8f7bb5,0xd8c27a,0xc56c6c,0x4d5b6e,0xa7b4c2];
const products=[];
const prod=(x,y,z,w,h,d,s,ci)=>products.push({pos:V(x,y+h/2,z),scl:V(w,h,d),c:C(prodCols[ci%prodCols.length]),s,d:.06,travel:1.4});
function legs(g,w,d,h){[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>g.add(at(box(.05,h,.05,MAT.black),a*(w/2-.08),h/2,b*(d/2-.08))))}
// A
[[-9.2,-5.2],[-4.6,-5.2]].forEach(([x,z],k)=>{const g=at(new THREE.Group(),x,0,z);legs(g,2.4,1.3,.74);g.add(at(box(2.4,.06,1.3,MAT.oak),0,.77,0));g.add(at(box(2.2,.04,1.1,MAT.black),0,.3,0));
  piece(g,.6+k*.02);for(let p=0;p<6;p++)prod(x-.9+p*.36,.8,z+(p%2?.28:-.28),.26,.16+((p*7)%3)*.09,.22,.68+k*.02,p+k*3);
  const card=at(box(.24,.16,.02,MAT.white),x+1,.88,z+.5);card.rotation.x=-.4;piece(card,.7,.05,1);ob(x,z,2.4,1.3,'A','all')});
{const g=at(new THREE.Group(),-6.9,0,-2.3);g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.85,.9,.24,40),MAT.white),0,.12,0));
  [[-.32,.1,0x2f3b52],[.34,-.08,0xc9a27e]].forEach(([dx,dz,c])=>{const mn=new THREE.Group();mn.add(at(box(.04,.9,.04,MAT.steel),0,.69,0));
    mn.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(.17,.42,4,12),M(c,.85)),0,1.3,0));mn.add(at(new THREE.Mesh(new THREE.SphereGeometry(.1,16,12),M(0xe8e4dc,.5)),0,1.68,0));
    mn.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.03,24),MAT.steel),0,.26,0));mn.position.set(dx,0,dz);g.add(mn)});
  piece(shadows(g),.66);ob(-6.9,-2.3,1.8,1.8,'A','all')}
{const g=at(new THREE.Group(),-7,0,-8.25);g.add(at(box(9.6,1.9,.06,MAT.walnut),0,.95,-.2));for(let l=0;l<4;l++)g.add(at(box(9.6,.04,.44,MAT.oakLight),0,.3+l*.45,0));piece(g,.58);
  for(let l=0;l<4;l++)for(let p=0;p<20;p++)if(hash(p,l)>.18)prod(-11.6+p*.47,.32+l*.45,-8.25,.3,.18+hash(l,p)*.18,.28,.64+l*.01,p+l);ob(-7,-8.25,9.6,.5,'A','z+')}
// B
[[3.8,-5.6],[7.4,-5.6],[5.6,-2.6]].forEach(([x,z],k)=>{const g=at(new THREE.Group(),x,0,z);
  [-1.35,1.35].forEach(dx=>{g.add(at(box(.05,1.55,.05,MAT.steel),dx,.78,0));g.add(at(box(.06,.04,.85,MAT.steel),dx,.02,0))});g.add(at(box(2.8,.04,.04,MAT.steel),0,1.55,0));
  for(let h=0;h<9;h++){const ln=.75+hash(h,k)*.35,c=prodCols[(h*2+k)%prodCols.length];g.add(at(box(.035,ln,.5,M(c,.95)),-1.15+h*.29,1.5-ln/2-.06,0));g.add(at(box(.02,.06,.36,MAT.steel),-1.15+h*.29,1.5,0))}
  piece(shadows(g),.6+k*.02);ob(x,z,2.8,.9,'B','both')});
{const g=at(new THREE.Group(),11.35,0,-7);for(let b=0;b<2;b++){const z=-.75+b*1.5;g.add(at(box(2.3,2.2,.06,MAT.white),0,1.1,z-.72));g.add(at(box(.06,2.2,1.5,MAT.white),1.12,1.1,z));
    g.add(at(box(.05,1.9,.9,MAT.fabric),-1.12,1.15,z+.25));g.add(at(box(.04,.04,1.5,MAT.steel),-1.12,2.12,z))}
  g.add(at(box(2.3,2.2,.06,MAT.white),0,1.1,1.47));piece(shadows(g),.62);ob(11.35,-7,2.3,3,'B','x-')}
{const g=at(new THREE.Group(),10.4,0,-2.4);legs(g,1.8,1,.74);g.add(at(box(1.8,.06,1,MAT.oak),0,.77,0));piece(g,.64);
  for(let s=0;s<4;s++)for(let y=0;y<3+s%2;y++)prod(9.8+s*.4,.8+y*.06,-2.4+(s%2?.15:-.15),.34,.055,.3,.7,s+3);ob(10.4,-2.4,1.8,1,'B','all')}
piece(at(box(.7,1.9,.05,M(0xdfe8f0,.05,.9)),9.6,.98,-8.44),.64,.06,1.2);
// C
[[-6.6,3],[-6.6,6.1]].forEach(([x,z],k)=>{const g=at(new THREE.Group(),x,0,z);g.add(at(box(7,1.6,.08,M(0x4b5260,.8)),0,.8,0));g.add(at(box(7,.12,.7,MAT.black),0,.06,0));
  [-3.5,3.5].forEach(dx=>g.add(at(box(.06,1.65,.72,MAT.black),dx,.82,0)));
  const strip=M(k?0x2b6cb0:0x2f855a,.6);
  for(let l=0;l<3;l++){g.add(at(box(7,.04,.7,MAT.white),0,.4+l*.5,0));g.add(at(box(7,.05,.02,strip),0,.4+l*.5,.36));g.add(at(box(7,.05,.02,strip),0,.4+l*.5,-.36))}
  piece(g,.6+k*.03);for(let l=0;l<3;l++)for(let p=0;p<14;p++){const side=(p%2?.18:-.18);prod(x-3.2+p*.48,.42+l*.5,z+side,.34,.14+hash(p,l+k)*.16,.24,.7+l*.01,p+l+k*2)}ob(x,z,7,.72,'C','both')});
{const g=at(new THREE.Group(),-12.25,0,4.5);g.add(at(box(.06,1.9,6.6,M(0xcfc9be,.8)),-.2,1.05,0));for(let l=0;l<4;l++)g.add(at(box(.4,.04,6.6,MAT.oakLight),0,.4+l*.42,0));piece(g,.62);
  for(let l=0;l<4;l++)for(let p=0;p<13;p++)if(hash(l,p+9)>.2)prod(-12.25,.42+l*.42,1.6+p*.48,.26,.16+hash(p,l)*.12,.3,.68,p+2*l);ob(-12.25,4.5,.5,6.6,'C','x+')}
const screens=[];
{const g=at(new THREE.Group(),-2.4,0,1.7);legs(g,1.5,.8,.86);g.add(at(box(1.5,.06,.8,MAT.white),0,.89,0));
  for(let i=0;i<3;i++){const ph=at(box(.16,.012,.3,MAT.chip),-.45+i*.45,.93,0);ph.rotation.x=-.2;g.add(ph);const sc=at(new THREE.Mesh(new THREE.PlaneGeometry(.13,.27),new THREE.MeshBasicMaterial({color:0x007AFF})),-.45+i*.45,.94,0);sc.rotation.x=-Math.PI/2-.2;g.add(sc);screens.push(sc)}
  piece(g,.68);ob(-2.4,1.7,1.5,.8,'C','all')}
// D
let rfidMat;
{const g=new THREE.Group();
  g.add(at(box(4.2,.96,1.1,MAT.white),9.4,.48,4.4));g.add(at(box(1.1,.96,2.4,MAT.white),10.95,.48,6.15));
  g.add(at(box(4.3,.06,1.2,MAT.oak),9.4,.99,4.4));g.add(at(box(1.2,.06,2.5,MAT.oak),10.95,.99,6.15));
  g.add(at(box(4.2,.18,.02,M(0x34C759,.5,0,{emissive:0x34C759,emissiveIntensity:.5})),9.4,.75,4.96));
  rfidMat=M(0x1e3a5f,.35,0,{emissive:0x007AFF,emissiveIntensity:.3});g.add(at(box(.42,.05,.42,rfidMat),8.05,1.05,4.6));
  const pos=at(box(.46,.32,.04,MAT.chip),8.9,1.3,4.15);pos.rotation.x=-.3;g.add(pos);
  const scr=at(new THREE.Mesh(new THREE.PlaneGeometry(.4,.26),new THREE.MeshBasicMaterial({color:0x0ea5e9})),8.9,1.3,4.175);scr.rotation.x=-.3;g.add(scr);
  g.add(at(box(.06,.25,.06,MAT.black),8.9,1.12,4.1));g.add(at(box(.22,.14,.26,MAT.white),9.6,1.09,4.2));g.add(at(box(.6,.3,.35,M(0xd8c3a0,.9)),10.9,1.17,6.6));
  piece(shadows(g),.7);
  ob(9.4,4.4,4.2,1.1,'D','none');ob(10.95,6.15,1.1,2.4,'D','none');ob(9.8,3.15,5.4,1.4,'D','none');
}
const QS=[[8.05,5.5],[7.15,6.2],[6.3,6.2],[5.45,6.2],[4.6,6.2],[4.6,5.35],[4.6,4.5]];
QS.forEach(([x,z],i)=>{const d=at(new THREE.Mesh(new THREE.CircleGeometry(.2,24),new THREE.MeshBasicMaterial({color:i?0x64748b:0x34C759,transparent:true,opacity:.75})),x,.065,z);d.rotation.x=-Math.PI/2;piece(d,.74,.05,.4)});
// entrance hardware
const beams=[];let gateArm,ledStrip,tmCanvas,tmTex,lastTM=-1,bigBtn;
{const g=new THREE.Group();
  [7.55,8.15].forEach(z=>{[1.1,3.9].forEach(x=>{g.add(at(box(.12,.95,.12,MAT.black),x,.48,z));g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color:0xef4444})),x+(x<2?.07:-.07),.62,z))});
    const bm=at(new THREE.Mesh(new THREE.BoxGeometry(2.66,.012,.012),new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:.25})),2.5,.62,z);g.add(bm);beams.push(bm)});
  g.add(at(box(.2,1,.2,MAT.steel),4.35,.5,7.85));g.add(at(box(.3,.2,.2,M(0x2563eb,.5)),4.35,1.1,7.85));
  gateArm=at(new THREE.Group(),4.22,.96,7.85);gateArm.add(at(box(2.85,.06,.06,M(0xf1f5f9,.4)),-1.42,0,0));for(let s=0;s<4;s++)gateArm.add(at(box(.28,.064,.064,M(0xef4444,.5)),-.4-s*.7,0,0));g.add(gateArm);
  tmCanvas=document.createElement('canvas');tmCanvas.width=256;tmCanvas.height=96;tmTex=new THREE.CanvasTexture(tmCanvas);tmTex.colorSpace=THREE.SRGBColorSpace;
  g.add(at(box(.08,1.3,.08,MAT.black),.3,.65,7.95));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.1,.4,.08),[MAT.black,MAT.black,MAT.black,MAT.black,new THREE.MeshBasicMaterial({map:tmTex}),MAT.black]),.3,1.45,7.95));
  g.add(at(box(.18,.26,.08,M(0x3b82f6,.6)),.98,1.4,7.95));
  g.add(at(box(.1,.82,.1,MAT.black),.3,.41,7.35));bigBtn=at(new THREE.Mesh(new THREE.CylinderGeometry(.14,.15,.08,28),M(0xdc2626,.45)),.3,.86,7.35);g.add(bigBtn);
  ledStrip=new THREE.InstancedMesh(new THREE.BoxGeometry(.24,.06,.05),new THREE.MeshBasicMaterial({color:0xffffff}),14);
  for(let i=0;i<14;i++){tm.makeTranslation(4.5+i*.3,.97,8.88);ledStrip.setMatrixAt(i,tm);ledStrip.setColorAt(i,C(0x34C759))}g.add(ledStrip);
  g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)o.castShadow=true});piece(g,.72,.08,1.8);
  [[1.1,7.55],[3.9,7.55],[1.1,8.15],[3.9,8.15]].forEach(([x,z])=>ob(x,z,.16,.16));ob(4.35,7.85,.24,.24);ob(.3,7.95,.3,.2);ob(.3,7.35,.2,.2);
}
function plant(x,z,s,t){const g=at(new THREE.Group(),x,0,z);g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.26,.2,.5,20),MAT.pot),0,.25,0));
  for(let i=0;i<7;i++){const r=.22+hash(i,x)*.18;const lf=at(new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),i%2?MAT.leaf:MAT.leaf2),(hash(i,z)-.5)*.4,.6+i*.12,(hash(z,i)-.5)*.4);lf.rotation.set(i,i*2,0);g.add(lf)}
  g.scale.setScalar(s);piece(shadows(g),t,.07,1.6);ob(x,z,.6*s,.6*s)}
plant(-.6,8.05,1,.82);plant(5.7,8.05,1,.83);plant(0,-8.05,1.1,.84);plant(12.05,-.1,1,.85);plant(-12.05,-.1,1,.86);
inst(new THREE.BoxGeometry(1,1,1),M(0xffffff,.6),products);

/* ---- ESP32 nodes ---- */
const nodeObj={};let nodeOrder=0;
function esp(id,pos,yaw,radarTo){
  const g=at(new THREE.Group(),pos.x,pos.y,pos.z);g.rotation.y=yaw;
  g.add(at(box(.6,.38,.04,MAT.pcb),0,0,0));g.add(at(box(.28,.2,.03,MAT.chip),.12,.04,.035));g.add(at(box(.2,.14,.02,MAT.shield),.12,.04,.055));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.5,8),MAT.black),-.22,.43,0));
  const led=new THREE.MeshBasicMaterial({color:0x007AFF});g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),led),-.18,-.11,.04));
  const halo=at(new THREE.Mesh(new THREE.RingGeometry(.42,.48,32),new THREE.MeshBasicMaterial({color:0xFF9500,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false})),0,0,.06);g.add(halo);
  if(radarTo)g.add(at(box(.26,.16,.04,MAT.white),.12,-.29,.02));
  piece(g,.78+(nodeOrder++)*.02,.07,1.4);
  let cone=null,cov=null;
  if(radarTo){const dir=new THREE.Vector3().subVectors(radarTo,pos).normalize(),h=pos.distanceTo(radarTo),cg=new THREE.ConeGeometry(h*.45,h,40,1,true);cg.translate(0,-h/2,0);
    cone=new THREE.Mesh(cg,new THREE.MeshBasicMaterial({color:0x007AFF,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    cone.position.copy(pos);cone.quaternion.setFromUnitVectors(V(0,-1,0),dir);scene.add(cone)}
  if(id!=='entry-01'){cov=at(new THREE.Mesh(new THREE.RingGeometry(5.6,5.66,96),new THREE.MeshBasicMaterial({color:0x007AFF,transparent:true,opacity:0,depthWrite:false})),pos.x,.08,pos.z);cov.rotation.x=-Math.PI/2;scene.add(cov)}
  nodeObj[id]={g,led,halo,cone,cov,pos:pos.clone()};
}
esp('zone-A',V(-10.8,2.25,-8.43),0,V(-7,0,-4));
esp('zone-B',V(2.6,2.25,-8.43),0,V(6,0,-4.5));
esp('zone-C',V(-12.43,2.25,7),Math.PI/2,null);
esp('zone-D',V(12.43,2.25,7.2),-Math.PI/2,V(8.6,0,5.6));
piece(at(box(.07,1.5,.07,MAT.black),5.05,.75,7.5),.8,.07,1.4);esp('entry-01',V(5.05,1.62,7.55),0,null);ob(5.05,7.5,.2,.2);

/* ---- zones: picking planes + dashed bounds ---- */
const zplanes=[],zlines={};
ZONES.forEach(zd=>{const w=zd.x1-zd.x0-.3,d=zd.z1-zd.z0-.3,cx=(zd.x0+zd.x1)/2,cz=(zd.z0+zd.z1)/2;
  const p=at(new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0x007AFF,transparent:true,opacity:0,depthWrite:false})),cx,.07,cz);p.rotation.x=-Math.PI/2;p.userData.zone=zd.id;scene.add(p);zplanes.push(p);
  const pts=[V(-w/2,0,-d/2),V(w/2,0,-d/2),V(w/2,0,d/2),V(-w/2,0,d/2),V(-w/2,0,-d/2)];
  const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:0x007AFF,dashSize:.35,gapSize:.25,transparent:true,opacity:0}));ln.computeLineDistances();ln.position.set(cx,.075,cz);scene.add(ln);zlines[zd.id]=ln});

/* ---- heatmap accumulated from where customers actually stand and walk ---- */
const HW=200,HH=136,HX0=-12.5,HZ0=-8.5,HS=8;
const heatI=new Float32Array(HW*HH);const hc=document.createElement('canvas');hc.width=HW;hc.height=HH;const hctx=hc.getContext('2d');const himg=hctx.createImageData(HW,HH);
const heatTex=new THREE.CanvasTexture(hc);heatTex.colorSpace=THREE.SRGBColorSpace;heatTex.minFilter=THREE.LinearFilter;
const heatMesh=at(new THREE.Mesh(new THREE.PlaneGeometry(25,17),new THREE.MeshBasicMaterial({map:heatTex,transparent:true,depthWrite:false,toneMapped:false})),0,.068,0);heatMesh.rotation.x=-Math.PI/2;heatMesh.renderOrder=1;scene.add(heatMesh);
const RAMP=(()=>{const st=[[0,[255,196,0,0]],[.15,[255,196,0,.3]],[.45,[245,130,20,.5]],[.75,[215,38,61,.62]],[1,[150,20,88,.74]]];const o=new Uint8ClampedArray(256*4);
  for(let i=0;i<256;i++){const t=i/255;let a=st[0],b=st.at(-1);for(let k=0;k<st.length-1;k++)if(t>=st[k][0]&&t<=st[k+1][0]){a=st[k];b=st[k+1];break}const u=(t-a[0])/((b[0]-a[0])||1);for(let c=0;c<3;c++)o[i*4+c]=lerp(a[1][c],b[1][c],u);o[i*4+3]=lerp(a[1][3],b[1][3],u)*255}return o})();
const KR=9,KER=[];for(let dy=-KR;dy<=KR;dy++)for(let dx=-KR;dx<=KR;dx++){const d2=dx*dx+dy*dy;if(d2<=KR*KR)KER.push([dx,dy,Math.exp(-d2/(2*(KR/2.2)**2))])}
let heatMax=1;
function splat(x,z,w){const cx=Math.round((x-HX0)*HS),cy=Math.round((z-HZ0)*HS);for(const [dx,dy,k] of KER){const px=cx+dx,py=cy+dy;if(px<0||py<0||px>=HW||py>=HH)continue;heatI[py*HW+px]+=k*w}}
function paintHeat(){let mx=0;for(let i=0;i<heatI.length;i++)if(heatI[i]>mx)mx=heatI[i];heatMax=Math.max(heatMax*.97,mx,1.2);const d=himg.data;
  for(let i=0;i<heatI.length;i++){const v=Math.min(255,Math.round(heatI[i]/heatMax*255));d[i*4]=RAMP[v*4];d[i*4+1]=RAMP[v*4+1];d[i*4+2]=RAMP[v*4+2];d[i*4+3]=RAMP[v*4+3]}
  hctx.putImageData(himg,0,0);heatTex.needsUpdate=true}

/* ---- navigation grid + A*: customers only walk where a body fits ---- */
const NAV={x0:-13.5,z0:-9.5,cs:.25};NAV.w=Math.round(27/NAV.cs);NAV.h=Math.round(25/NAV.cs);NAV.free=new Uint8Array(NAV.w*NAV.h);
const cxOf=i=>NAV.x0+((i%NAV.w)+.5)*NAV.cs,czOf=i=>NAV.z0+(Math.floor(i/NAV.w)+.5)*NAV.cs;
const cellOf=(x,z)=>{const i=Math.floor((x-NAV.x0)/NAV.cs),j=Math.floor((z-NAV.z0)/NAV.cs);return(i<0||j<0||i>=NAV.w||j>=NAV.h)?-1:j*NAV.w+i};
function mark(x0,x1,z0,z1,v){for(let j=0;j<NAV.h;j++)for(let i=0;i<NAV.w;i++){const x=NAV.x0+(i+.5)*NAV.cs,z=NAV.z0+(j+.5)*NAV.cs;if(x>=x0&&x<=x1&&z>=z0&&z<=z1)NAV.free[j*NAV.w+i]=v}}
const BODY=.3;
mark(-12.5+BODY,12.5-BODY,-8.5+BODY,8.5-BODY,1);mark(1.1+BODY,3.9-BODY,8.2,9.3,1);mark(-4,9,8.85+BODY,14.2,1);
OBST.forEach(o=>mark(o.x0-BODY,o.x1+BODY,o.z0-BODY,o.z1+BODY,0));
const walk=(x,z)=>{const c=cellOf(x,z);return c>=0&&NAV.free[c]===1};
function nearestFree(c){if(c>=0&&NAV.free[c])return c;const N=NAV.w*NAV.h,seen=new Uint8Array(N),q=[c<0?0:c];seen[q[0]]=1;
  for(let h=0;h<q.length;h++){const k=q[h];if(NAV.free[k])return k;const x=k%NAV.w,y=(k/NAV.w)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=NAV.w||ny>=NAV.h)continue;const n=ny*NAV.w+nx;if(!seen[n]){seen[n]=1;q.push(n)}}}return c}
function astar(s,g){const W=NAV.w,N=W*NAV.h,F=NAV.free,gs=new Float32Array(N).fill(1e9),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const gx=g%W,gy=(g/W)|0,h=i=>{const dx=Math.abs(i%W-gx),dy=Math.abs(((i/W)|0)-gy);return(dx+dy)+(1.4142-2)*Math.min(dx,dy)};
  const heap=[];const push=(i,f)=>{heap.push([f,i]);let k=heap.length-1;while(k){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m}}return top[1]};
  gs[s]=0;push(s,h(s));
  while(heap.length){const c=pop();if(c===g)break;if(closed[c])continue;closed[c]=1;const x=c%W,y=(c/W)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=NAV.h)continue;const n=ny*W+nx;if(!F[n]||closed[n])continue;
      if(dx&&dy&&(!F[y*W+nx]||!F[ny*W+x]))continue;const ng=gs[c]+(dx&&dy?1.4142:1);if(ng<gs[n]){gs[n]=ng;came[n]=c;push(n,ng+h(n))}}}
  if(s!==g&&came[g]<0)return null;const path=[g];let k=g;while(k!==s){k=came[k];path.push(k)}return path.reverse()}
function los(x0,z0,x1,z1){const d=Math.hypot(x1-x0,z1-z0),n=Math.ceil(d/.1);for(let k=1;k<=n;k++){const t=k/n;if(!walk(x0+(x1-x0)*t,z0+(z1-z0)*t))return false}return true}
function findPath(x0,z0,x1,z1){
  const s=nearestFree(cellOf(x0,z0)),g=nearestFree(cellOf(x1,z1));const cells=astar(s,g);
  if(!cells)return[{x:x1,z:z1}];
  const pts=cells.map(c=>({x:cxOf(c),z:czOf(c)}));
  const endFree=walk(x1,z1);pts.push({x:x1,z:z1});
  const out=[];let cur={x:x0,z:z0},k=0;
  // string-pulling: jump to the farthest waypoint that is in clear line of sight
  while(k<pts.length){let far=k;for(let m=pts.length-1;m>k;m--){const e=pts[m];const ok=(m===pts.length-1&&!endFree)?false:los(cur.x,cur.z,e.x,e.z);if(ok){far=m;break}}
    out.push(pts[far]);cur=pts[far];k=far+1}
  return out}

/* browse spots: standing points in front of each fixture, facing it */
OBST.forEach(o=>{if(!o.zone||!o.browse||o.browse==='none')return;const off=.5,step=.9,add=(x,z,yaw)=>{const c=nearestFree(cellOf(x,z));if(Math.hypot(cxOf(c)-x,czOf(c)-z)<.45)SPOTS[o.zone].push({x,z,yaw,taken:null})};
  const sides=o.browse==='all'?['z-','z+','x-','x+']:o.browse==='both'?['z-','z+']:[o.browse];
  for(const sd of sides){if(sd[0]==='z'){const z=sd==='z+'?o.z1+off:o.z0-off,yaw=sd==='z+'?Math.PI:0;for(let x=o.x0+.45;x<=o.x1-.3;x+=step)add(x,z,yaw)}
    else{const x=sd==='x+'?o.x1+off:o.x0-off,yaw=sd==='x+'?-Math.PI/2:Math.PI/2;for(let z=o.z0+.45;z<=o.z1-.3;z+=step)add(x,z,yaw)}}});
for(let i=0;i<15;i++){const x=-.3+(i%5)*1.3,z=1+Math.floor(i/5)*2.2;if(walk(x,z))SPOTS.corr.push({x,z,yaw:(i*1.7)%6.28,taken:null})}
const QSLOT=QS.map(([x,z],i)=>({x,z,yaw:i===0?Math.PI:i<5?Math.PI/2:Math.PI}));
const DOOR_IN={x:2.5,z:9.3},STREET=()=>({x:-3+Math.random()*11.5,z:14});

/* ---- people: articulated, instanced (torso, head, hair, 2 legs, 2 arms, shopping bag) ---- */
const MAXW=150;
const parts={
  torso:new THREE.InstancedMesh(new THREE.CapsuleGeometry(.17,.36,4,12).scale(1,1,.72),M(0xffffff,.75),MAXW),
  head:new THREE.InstancedMesh(new THREE.SphereGeometry(.115,16,12),M(0xffffff,.55),MAXW),
  hair:new THREE.InstancedMesh(new THREE.SphereGeometry(.122,16,12,0,Math.PI*2,0,Math.PI*.55),M(0xffffff,.8),MAXW),
  legL:new THREE.InstancedMesh(new THREE.BoxGeometry(.13,.8,.15).translate(0,-.4,0),M(0xffffff,.8),MAXW),
  legR:new THREE.InstancedMesh(new THREE.BoxGeometry(.13,.8,.15).translate(0,-.4,0),M(0xffffff,.8),MAXW),
  armL:new THREE.InstancedMesh(new THREE.BoxGeometry(.085,.58,.1).translate(0,-.29,0),M(0xffffff,.75),MAXW),
  armR:new THREE.InstancedMesh(new THREE.BoxGeometry(.085,.58,.1).translate(0,-.29,0),M(0xffffff,.75),MAXW),
  bag:new THREE.InstancedMesh(new THREE.BoxGeometry(.24,.28,.11).translate(0,-.2,0),M(0xffffff,.85),MAXW),
};
const col=new THREE.Color();
Object.values(parts).forEach(m=>{m.castShadow=true;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.setColorAt(0,col.setHex(0xffffff));m.count=0;scene.add(m)});
const SHIRT=[0xe2e8f0,0x334155,0x7c9cbf,0xb45309,0x9f1239,0x0f766e,0xf1f5f9,0x6d28d9,0xcbd5e1,0x475569,0xd97706,0x1e3a8a],PANTS=[0x1f2937,0x334155,0x374151,0x1e3a5f,0x78716c,0x0f172a],SKIN=[0xf1c7a5,0xe0ac85,0xc68863,0x8d5a3b,0xf5d6c0],HAIR=[0x1c1917,0x3f2a1d,0x6b4423,0x0f0f0f,0xa8a29e];
const walkers=new Map();let wseq=0;
function mkWalker(id,x,z,kind='customer'){const r=Math.random;
  return{id,kind,x,z,yaw:r()*6.28,tyaw:0,path:null,pi:0,speed:1.15+r()*.3,gait:r()*6,move:0,scale:reduceMotion?1:0,bag:false,
    shirt:kind==='staff'?0x15803d:SHIRT[(r()*SHIRT.length)|0],pants:PANTS[(r()*PANTS.length)|0],skin:SKIN[(r()*SKIN.length)|0],hair:HAIR[(r()*HAIR.length)|0],
    intent:{kind:'none'},spot:null,wait:0,slot:-1,out:false,dying:false,prevZ:z}}
function release(w){if(w.spot){w.spot.taken=null;w.spot=null}}
function goTo(w,x,z,then){w.path=findPath(w.x,w.z,x,z);w.pi=0;w.arrive=then}
function pickSpot(zone,w){const list=SPOTS[zone];if(!list||!list.length)return null;const free=list.filter(s=>!s.taken),pool=free.length?free:list;const s=pool[(Math.random()*pool.length)|0];s.taken=w.id;return s}
function toZone(w,zone,instant){release(w);const s=pickSpot(zone,w);if(!s)return;w.spot=s;
  if(instant){w.x=s.x;w.z=s.z;w.prevZ=s.z;w.yaw=w.tyaw=s.yaw;w.path=null;w.wait=2+Math.random()*8;return}
  goTo(w,s.x,s.z,()=>{w.tyaw=s.yaw;w.wait=4+Math.random()*9})}
function leaveStore(w){goTo(w,DOOR_IN.x+(Math.random()-.5)*.6,DOOR_IN.z,()=>{const s=STREET();goTo(w,s.x,s.z,()=>{w.dying=true})})}
function applyIntent(w,it,instant){
  const prev=w.intent.kind;w.intent=it;
  if(it.kind==='zone'||it.kind==='corr'){w.slot=-1;toZone(w,it.kind==='corr'?'corr':it.zone,instant)}
  else if(it.kind==='checkout'){release(w);w.coJoin=instant?-1e6+Math.random()*1e3:performance.now();w.slot=-1}
  else if(it.kind==='exit'){
    if(prev==='checkout'){w.bag=true;pay()}else if(it.paid)w.bag=true;
    release(w);w.slot=-1;w.out=true;
    if(instant){w.dying=true;return}
    leaveStore(w);
  }
}
function arrive(w){const nx=w.intent.kind==='arriving'?w.intent.next:w.intent;w.intent={kind:'none'};applyIntent(w,nx)}
function spawn(id,it,instant){
  if(instant){const w=mkWalker(id,0,0);w.scale=1;walkers.set(id,w);
    if(it.kind==='queue'){w.intent=it;w.x=DOOR_IN.x;w.z=10}else{if(it.kind==='checkout'){w.x=6;w.z=6}applyIntent(w,it,true)}
    w.prevZ=w.z;return w}
  const s=STREET(),w=mkWalker(id,s.x,s.z);walkers.set(id,w);
  if(it.kind==='queue'){w.intent=it;return w}
  w.intent={kind:'arriving',next:it};goTo(w,DOOR_IN.x,DOOR_IN.z,()=>arrive(w));return w}
let irFlash=0,rfidFlash=0;
function pay(){rfidFlash=1;floatChip('pay','RFID 結帳',V(8.05,1.4,4.6))}
const staff=[mkWalker('staff-1',8.05,3.3,'staff'),mkWalker('staff-2',9.6,-1.4,'staff')];
staff.forEach(s=>{s.scale=1;s.yaw=s.tyaw=0;s.wait=2});
function staffAI(s,dt){if(s.id==='staff-1'){s.tyaw=0;return}if(s.path)return;s.wait-=dt;if(s.wait<=0&&SPOTS.B.length){const sp=SPOTS.B[(Math.random()*SPOTS.B.length)|0];s.wait=9+Math.random()*10;goTo(s,sp.x,sp.z,()=>{s.tyaw=sp.yaw})}}

/* intents from the live model: what every person should be doing right now */
function gatherIntents(){
  const m=new Map();
  const sn=snap();
  if(sn&&sn.zones){let n=0;for(const zd of ZONES){const c=sn.zones[zd.id][0]||0;for(let k=0;k<c;k++){m.set('r'+zd.id+k,zd.id==='D'?{kind:'checkout'}:{kind:'zone',zone:zd.id});n++}}for(let k=0;k<Math.max(0,sn.occ-n);k++)m.set('rc'+k,{kind:'corr'});return m}
  if(!S.real){
    for(const a of S.agents){let it;
      if(a.phase==='leave')it={kind:'exit',paid:!!a.paid};
      else{const z=a.phase==='dwell'?a.zone:a.plan[a.i];it=z==='D'?{kind:'checkout'}:{kind:'zone',zone:z}}
      m.set('a'+a.id,it)}
  }else{
    let n=0;for(const zd of ZONES){const z=S.zones[zd.id],c=z.stale?0:z.est;for(let k=0;k<c;k++){m.set(zd.id+k,zd.id==='D'?{kind:'checkout'}:{kind:'zone',zone:zd.id});n++}}
    for(let k=0;k<Math.max(0,occ()-n);k++)m.set('c'+k,{kind:'corr'});
  }
  return m;
}
let firstSync=true;
function direct(){
  const want=gatherIntents(),instant=firstSync;firstSync=false;
  const qWalkers=[...walkers.values()].filter(w=>w.intent.kind==='queue'&&!w.out).sort((a,b)=>a.qT-b.qT);
  for(const [id,it] of want){
    let w=walkers.get(id);
    if(!w){
      if(it.kind==='exit')continue;
      if(!instant&&qWalkers.length){w=qWalkers.shift();walkers.delete(w.id);w.id=id;walkers.set(id,w);w.intent={kind:'arriving',next:it};goTo(w,DOOR_IN.x,8.4,()=>arrive(w));continue}
      spawn(id,it,instant);continue}
    if(w.intent.kind==='arriving'){w.intent.next=it;continue}
    const cur=w.intent;if(cur.kind!==it.kind||cur.zone!==it.zone)applyIntent(w,it);
  }
  for(const w of [...walkers.values()]){if(w.out||w.intent.kind==='queue')continue;if(!want.has(w.id)){if(w.intent.kind==='arriving'){w.out=true;w.intent={kind:'exit'};const s=STREET();goTo(w,s.x,s.z,()=>{w.dying=true})}else applyIntent(w,{kind:'exit'},instant)}}
  // queue outside the door
  const qn=Math.min(vQueue(),14);let qs=[...walkers.values()].filter(w=>w.intent.kind==='queue'&&!w.out);
  while(qs.length<qn){const w=spawn('q'+(++wseq),{kind:'queue'},instant);w.qT=performance.now()+qs.length;qs.push(w)}
  qs.sort((a,b)=>a.qT-b.qT);
  while(qs.length>qn){const w=qs.pop();w.out=true;w.intent={kind:'exit'};const s=STREET();goTo(w,s.x,s.z,()=>{w.dying=true})}
  qs.forEach((w,i)=>{const tx=DOOR_IN.x+(i%2?.42:-.42),tz=9.8+Math.floor(i/2)*.7;if(instant){w.x=tx;w.z=tz;w.prevZ=tz;w.yaw=w.tyaw=Math.PI;w.qx=tx;w.qz=tz}else if(w.qx!==tx||w.qz!==tz){w.qx=tx;w.qz=tz;goTo(w,tx,tz,()=>{w.tyaw=Math.PI})}});
  // checkout line: first in line stands at the RFID reader
  const co=[...walkers.values()].filter(w=>w.intent.kind==='checkout').sort((a,b)=>a.coJoin-b.coJoin);
  co.forEach((w,r)=>{if(w.slot===r)return;w.slot=r;const sl=QSLOT[Math.min(r,QSLOT.length-1)],ox=r>=QSLOT.length?(r-QSLOT.length+1)*.55:0;
    if(instant){w.x=sl.x+ox;w.z=sl.z;w.prevZ=w.z;w.yaw=w.tyaw=sl.yaw}else goTo(w,sl.x+ox,sl.z,()=>{w.tyaw=sl.yaw})});
}

/* ---- door counting + floating chips ---- */
const chipsEl=$('#zlabels'),chipList=[];
function floatChip(cls,text,pos){if(reduceMotion||chipList.length>5||view!=='live')return;const el=document.createElement('div');el.className='fchip '+cls;el.textContent=text;chipsEl.appendChild(el);const c={el,pos:pos.clone()};chipList.push(c);setTimeout(()=>{el.remove();chipList.splice(chipList.indexOf(c),1)},1400)}

/* ---- walker update + instancing ---- */
const mB=new THREE.Matrix4(),mL=new THREE.Matrix4(),mR=new THREE.Matrix4(),mT=new THREE.Matrix4(),mS=new THREE.Matrix4().makeScale(0,0,0),qq=new THREE.Quaternion(),vv=new THREE.Vector3(),ss=new THREE.Vector3(),UP=V(0,1,0);
const angLerp=(a,b,t)=>{const d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return a+d*t};
function stepWalker(w,dt,mul){
  if(w.dying){w.scale=Math.max(0,w.scale-dt*3);return}
  if(w.scale<1)w.scale=Math.min(1,w.scale+dt*3);
  let moving=false;
  if(w.path&&w.pi<w.path.length){const t=w.path[w.pi],dx=t.x-w.x,dz=t.z-w.z,d=Math.hypot(dx,dz);
    if(d<.06){w.pi++;if(w.pi>=w.path.length){w.path=null;const f=w.arrive;w.arrive=null;f&&f()}}
    else{const st=Math.min(d,w.speed*mul*dt);w.x+=dx/d*st;w.z+=dz/d*st;w.tyaw=Math.atan2(dx,dz);moving=true;w.gait+=st/.62*Math.PI}}
  else if(w.spot&&w.kind==='customer'&&(w.intent.kind==='zone'||w.intent.kind==='corr')){w.wait-=dt;if(w.wait<=0)toZone(w,w.intent.kind==='corr'?'corr':w.intent.zone)}
  w.yaw=angLerp(w.yaw,w.tyaw,1-Math.exp(-dt*9));w.move=lerp(w.move,moving?1:0,1-Math.exp(-dt*8));
  // the two IR beams see exactly what crosses the doorway
  if(w.kind==='customer'&&w.x>1&&w.x<4){if(w.prevZ>8.15&&w.z<=8.15&&!w.out){irFlash=1;floatChip('in','+1 進場',V(2.5,2,8.2))}else if(w.prevZ<7.55&&w.z>=7.55&&w.out){irFlash=1;floatChip('out','−1 離場',V(2.5,2,8.2))}}
  w.prevZ=w.z;
}
function separate(list){for(let i=0;i<list.length;i++){const a=list[i];for(let j=i+1;j<list.length;j++){const b=list[j],dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz;if(d2>.25||d2<1e-6)continue;
  const d=Math.sqrt(d2),p=(.5-d)*.25,nx=dx/d*p,nz=dz/d*p;if(a.path&&walk(a.x-nx,a.z-nz)){a.x-=nx;a.z-=nz}if(b.path&&walk(b.x+nx,b.z+nz)){b.x+=nx;b.z+=nz}}}}
function writePeople(list,t){
  let n=0;
  for(const w of list){if(w.scale<=0)continue;if(n>=MAXW)break;
    const sw=Math.sin(w.gait)*.55*w.move,bob=Math.abs(Math.sin(w.gait))*.035*w.move,idle=(1-w.move)*Math.sin(t*1.3+w.gait)*.04;
    qq.setFromAxisAngle(UP,w.yaw+idle);mB.compose(vv.set(w.x,bob,w.z),qq,ss.setScalar(w.scale));
    const P=(mesh,lx,ly,lz,rx)=>{mT.makeTranslation(lx,ly,lz);if(rx){mR.makeRotationX(rx);mT.multiply(mR)}mL.multiplyMatrices(mB,mT);mesh.setMatrixAt(n,mL)};
    P(parts.torso,0,1.16,0);P(parts.head,0,1.6,0);P(parts.hair,0,1.62,-.005);P(parts.legL,.085,.84,0,sw);P(parts.legR,-.085,.84,0,-sw);P(parts.armL,.235,1.4,0,-sw*.75);P(parts.armR,-.235,1.4,0,w.bag?sw*.3:sw*.75);
    if(w.bag)P(parts.bag,-.25,.84,0,sw*.3);else parts.bag.setMatrixAt(n,mS);
    col.setHex(w.shirt);parts.torso.setColorAt(n,col);parts.armL.setColorAt(n,col);parts.armR.setColorAt(n,col);
    parts.head.setColorAt(n,col.setHex(w.skin));parts.hair.setColorAt(n,col.setHex(w.hair));
    col.setHex(w.pants);parts.legL.setColorAt(n,col);parts.legR.setColorAt(n,col);parts.bag.setColorAt(n,col.setHex(0xf3e8d2));
    n++}
  Object.values(parts).forEach(m=>{m.count=n;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true});
}

/* ---- layers ---- */
const layers=Object.assign({heat:true,bounds:true,sensors:true,labels:true,people:true},store.get('layers',{}));
const LAYERS=[['heat','人流熱度圖','H'],['bounds','區域邊界',''],['sensors','感測範圍與訊號',''],['labels','區域標籤','L'],['people','顧客與店員','']];
function toggleLayer(k){layers[k]=!layers[k];store.set('layers',layers);$$(`[data-layer="${k}"]`).forEach(b=>b.setAttribute('aria-checked',layers[k]));announce(`${LAYERS.find(l=>l[0]===k)[1]}已${layers[k]?'開啟':'關閉'}`)}

/* ---- labels ---- */
const lblEls={};
ZONES.forEach(zd=>{const el=document.createElement('button');el.className='zlab';el.innerHTML=`<span class="lt" style="background:var(--z${zd.id})">${zd.id}</span><span>${zd.name}</span><span class="n">0</span>`;el.setAttribute('aria-label',`${zd.id} ${zd.name}，點選查看細節`);
  el.addEventListener('click',e=>{e.stopPropagation();selectZone(zd.id,true)});$('#zlabels').appendChild(el);lblEls[zd.id]=el});
const pv=new THREE.Vector3();
function project(v){pv.copy(v).project(camera);return{x:(pv.x+1)/2*host.clientWidth,y:(1-pv.y)/2*host.clientHeight,vis:pv.z<1}}
function updateLabels(){
  ZONES.forEach(zd=>{const el=lblEls[zd.id],z=S.zones[zd.id],h=heatOf(z),p=project(V((zd.x0+zd.x1)/2,3.1,(zd.z0+zd.z1)/2));
    el.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;el.style.visibility=p.vis?'visible':'hidden';
    const n=el.querySelector('.n'),tx=z.stale?'—':String(z.est);if(n.textContent!==tx)n.textContent=tx;
    el.classList.toggle('warm',h==='warm');el.classList.toggle('hot',h==='hot');el.classList.toggle('stale',h==='stale');el.classList.toggle('sel',selZone===zd.id)});
  const zl=$('#zlabels');zl.style.opacity=layerFade*(layers.labels?1:0);zl.style.visibility=layers.labels&&layerFade>0?'visible':'hidden';
  for(const c of chipList){const p=project(c.pos);c.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`}
}

/* ---- devices + overlays per frame ---- */
const HEXH={warm:0xD98E04,hot:0xD7263D,stale:0xA39B8F};
const rings=[],ringGeo=new THREE.TorusGeometry(1,.016,6,72),ringLast={};
function ring(id){const now=performance.now();if(reduceMotion||!layers.sensors||(ringLast[id]&&now-ringLast[id]<1100))return;ringLast[id]=now;const o=nodeObj[id];if(!o)return;
  const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x007AFF,transparent:true,opacity:.55,depthWrite:false}));m.position.copy(o.pos);m.userData.l=0;scene.add(m);rings.push(m)}
function drawTM(n){const c=tmCanvas.getContext('2d');c.fillStyle='#050505';c.fillRect(0,0,256,96);c.font='600 70px "Fira Code", ui-monospace, monospace';c.textAlign='right';c.textBaseline='middle';
  c.fillStyle='#2a0a0a';c.fillText('8888',238,52);c.fillStyle='#ff3b30';c.shadowColor='#ff3b30';c.shadowBlur=14;c.fillText(String(n).padStart(4,' '),238,52);c.shadowBlur=0;tmTex.needsUpdate=true}
let calPress=0;
const tmpC=new THREE.Color();
function updateDevices(dt,t){
  for(const e of S.fx.splice(0,40))if(e.type==='wifi')ring(e.node);
  irFlash=Math.max(0,irFlash-dt*2.4);rfidFlash=Math.max(0,rfidFlash-dt*1.4);
  beams.forEach(b=>{b.material.opacity=.22+irFlash*.78});rfidMat.emissiveIntensity=.3+rfidFlash*2.6;
  gateArm.rotation.y=angLerp(gateArm.rotation.y,vGate()?-Math.PI/2:0,1-Math.exp(-dt*5));
  const r=vOcc()/vCap(),lc=tmpC.setHex(r<.6?0x34C759:r<.85?0xFF9500:0xFF3B30).clone(),on=Math.max(1,Math.round(clamp(r,0,1)*14)),off=C(0xD1D1D6);
  for(let i=0;i<14;i++)ledStrip.setColorAt(i,i<on?lc:off);ledStrip.instanceColor.needsUpdate=true;
  const o=vOcc();if(o!==lastTM){lastTM=o;drawTM(o)}
  screens.forEach((s,i)=>s.material.color.setHSL(.55+.05*Math.sin(t*.7+i),.8,.45+.1*Math.sin(t*1.3+i*2)));
  const now=performance.now();
  for(const d of NODE_DEFS){const nd=nodeObj[d.id],n=S.nodes[d.id],bl=n.blinkUntil>now,rb=n.rebootUntil>now;
    nd.led.color.setHex(bl?((Math.floor(now/160)%2)?0xffffff:0xFF9500):rb?0xFF9500:n.online?0x007AFF:0xFF3B30);
    nd.halo.material.opacity=bl?.5+.4*Math.sin(now/90):0;nd.halo.scale.setScalar(bl?1+.25*Math.sin(now/120):1);
    const zone=S.zones[d.id.slice(-1)];
    if(nd.cone)nd.cone.material.opacity=layers.sensors&&n.online?(zone?.presence?.075:.03)*layerFade:0;
    if(nd.cov)nd.cov.material.opacity=layers.sensors&&n.online?.16*layerFade:0}
  for(let i=rings.length-1;i>=0;i--){const m=rings[i];m.userData.l+=dt/1.8;const l=m.userData.l;if(l>=1){scene.remove(m);m.material.dispose();rings.splice(i,1);continue}m.scale.setScalar(.3+l*5.4);m.material.opacity=.5*(1-l)}
  ZONES.forEach((zd,i)=>{const ln=zlines[zd.id],z=S.zones[zd.id],h=heatOf(z),sel=selZone===zd.id,hov=hoverZone===zd.id;
    ln.material.color.lerp(h==='cool'?tmpC.set(zd.color):tmpC.setHex(HEXH[h]),1-Math.exp(-dt*4));ln.material.opacity=layers.bounds?(sel?.95:hov?.75:.4)*layerFade:0;
    const p=zplanes[i];p.material.color.copy(ln.material.color);p.material.opacity=(sel?.1:hov?.06:0)*layerFade});
  heatMesh.visible=layers.heat;heatMesh.material.opacity=layerFade;
  bigBtn.position.y=.86-(calPress>0?.03:0);calPress=Math.max(0,calPress-dt);
}

/* ---- camera ---- */
let fly=null;
function flyTo(p,t,dur=1.1){fly={t:0,dur:reduceMotion?.01:dur,fp:camera.position.clone(),ft:controls.target.clone(),tp:V(...p),tt:V(...t)}}
function setCam(k){const c=CAMS[k];flyTo(c.p,c.t)}
function focusZone(id){const zd=ZMAP[id],cx=(zd.x0+zd.x1)/2,cz=(zd.z0+zd.z1)/2;flyTo([cx+7,11,cz+11],[cx,0,cz]);setSeg($('#camSeg'),()=>false)}
function focusNode(id){const n=nodeObj[id];if(!n)return;const p=n.pos,ins=V(-p.x,0,-p.z).normalize();flyTo([p.x+ins.x*6,p.y+3.2,p.z+ins.z*6+2],[p.x,p.y-.5,p.z]);setSeg($('#camSeg'),()=>false)}
let hoverZone=null;
const ray=new THREE.Raycaster(),ptr=new THREE.Vector2();let down=null;
function pick(e){const r=renderer.domElement.getBoundingClientRect();ptr.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ptr,camera);return ray.intersectObjects(zplanes,false)[0]?.object.userData.zone||null}
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];fly=null});
renderer.domElement.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5){const z=pick(e);if(z)selectZone(z,true);else if(selZone)selectZone(selZone)}down=null});
renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons)return;hoverZone=pick(e);renderer.domElement.style.cursor=hoverZone?'pointer':'grab'});
renderer.domElement.addEventListener('pointerleave',()=>hoverZone=null);

/* ---- day / night ---- */
const lamps=[];
[[-6.8,-4.6],[6.8,-4.6],[-6.8,4.6],[9.2,4.6],[2.5,3.5],[2.5,-4]].forEach(([x,z])=>{const l=new THREE.PointLight(0xffd29a,0,15,1.4);l.position.set(x,2.55,z);scene.add(l);lamps.push(l)});
function setTheme3D(dark){
  const T=dark?{bg:0x14120F,ground:0x1B1814,walk:0x26221C,curb:0x3A342C,lane:0x5E564A,slab:0x2C2722,hemi:[0x8d97b0,0x14120f,.22],key:[0xaebfff,.45],exp:1.08,env:.14,lamp:24,glass:[0xffd9a0,.16]}
              :{bg:0xEFE9DE,ground:0xE2DACC,walk:0xEAE4D8,curb:0xCFC6B6,lane:0xffffff,slab:0xC4BAA8,hemi:[0xfffaf0,0xd9cfbf,.85],key:[0xfff0dc,2.0],exp:1.0,env:.5,lamp:0,glass:[0xcfe3f5,.12]};
  scene.background.setHex(T.bg);scene.fog.color.setHex(T.bg);MAT.asphalt.color.setHex(T.ground);MAT.walk.color.setHex(T.walk);MAT.curb.color.setHex(T.curb);MAT.lane.color.setHex(T.lane);MAT.slab.color.setHex(T.slab);
  hemi.color.setHex(T.hemi[0]);hemi.groundColor.setHex(T.hemi[1]);hemi.intensity=T.hemi[2];key.color.setHex(T.key[0]);key.intensity=T.key[1];
  renderer.toneMappingExposure=T.exp;scene.environmentIntensity=T.env;lamps.forEach(l=>l.intensity=T.lamp);MAT.glass.color.setHex(T.glass[0]);MAT.glass.opacity=T.glass[1];
}

/* ---- build + loop ---- */
let buildP=1,building=false;
function startBuild(){if(reduceMotion){buildP=1;applyBuild(1);return}buildP=0;building=true}
function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.zoom=clamp(camera.aspect*.78,.55,1);camera.fov=w<600?42:34;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(host);resize();
let visible=true;new IntersectionObserver(es=>visible=es[0].isIntersecting).observe(host);
ZONES.forEach(zd=>{const n=S.zones[zd.id].truth||2;for(let k=0;k<n*60;k++){const s=SPOTS[zd.id][(Math.random()*SPOTS[zd.id].length)|0];if(s)splat(s.x,s.z,.12)}});
for(let k=0;k<200;k++){const s=SPOTS.corr[(Math.random()*SPOTS.corr.length)|0];if(s)splat(s.x,s.z,.06)}paintHeat();
let last=performance.now(),heatAcc=0,dirAcc=0;
setTheme3D(isDark());applyBuild(0);startBuild();
$('#twinLoad').classList.add('done');
function frame(now){
  requestAnimationFrame(frame);
  const rdt=Math.min(.25,(now-last)/1000),dt=Math.min(.05,rdt);last=now;if(view!=='live'||document.hidden||!visible)return;const t=now/1000;
  if(building){buildP=Math.min(1,buildP+dt/4.8);applyBuild(buildP);if(buildP>=1)building=false}
  if(fly){fly.t=Math.min(1,fly.t+dt/fly.dur);const e=fly.t<.5?4*fly.t**3:1-Math.pow(-2*fly.t+2,3)/2;camera.position.lerpVectors(fly.fp,fly.tp,e);controls.target.lerpVectors(fly.ft,fly.tt,e);if(fly.t>=1)fly=null}
  if(buildP>=.97){
    dirAcc+=dt;if(dirAcc>.25){dirAcc=0;direct()}
    const mul=!S.real?(S.speed>=60?2.2:S.speed>=10?1.35:1):1,wdt=S.paused?0:rdt;
    const list=[...walkers.values()];
    for(const w of list){stepWalker(w,wdt,mul);if(w.dying&&w.scale<=0){release(w);walkers.delete(w.id)}}
    staff.forEach(s=>{staffAI(s,wdt);stepWalker(s,wdt,1)});
    separate(list.filter(w=>!w.dying));
    heatAcc+=wdt;if(heatAcc>.25){const k=Math.pow(.996,heatAcc*4);for(let i=0;i<heatI.length;i++)heatI[i]*=k;for(const w of list)if(!w.out&&w.z<8.4&&w.scale>.5)splat(w.x,w.z,.05*heatAcc*4);heatAcc=0;paintHeat()}
    writePeople(layers.people?[...list,...staff]:[],t);
  }
  updateDevices(dt,t);controls.update();updateLabels();renderer.render(scene,camera);
}
requestAnimationFrame(frame);
return{layers,LAYERS,startBuild,setTheme:setTheme3D,resync:()=>{walkers.clear();firstSync=true;Object.values(SPOTS).forEach(l=>l.forEach(s=>s.taken=null))},resize,focusZone,camera:setCam,focusNode,toggleLayer,customers:()=>[...walkers.values()].filter(w=>!w.out&&w.intent.kind!=='queue').length,
  reset:()=>{walkers.clear();firstSync=true;heatI.fill(0);Object.values(SPOTS).forEach(l=>l.forEach(s=>s.taken=null))},walkers,walk,obst:OBST,
  gl:()=>({lost:renderer.getContext().isContextLost(),mem:renderer.info.memory,prog:renderer.info.programs.length,calls:renderer.info.render.calls})};
})() }catch(err){
  console.error(err);
  $('#twinLoad').innerHTML=`${icon('cube',28)}<b>3D 模型載入失敗</b><small>three.js 需要網路連線才能載入；其他功能不受影響。</small><button class="btn sec sm" onclick="location.reload()">${icon('reset',15)}重新載入</button>`;
}
onTwinReady();})();return twinLoading}
