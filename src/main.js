import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const ui = {
  speed: $('speedValue'), arcSpeed: $('arcSpeed'), score: $('scoreValue'), coins: $('coinValue'),
  route: $('routeName'), gear: $('gearValue'), pause: $('pauseButton'), left: $('leftButton'), right: $('rightButton'),
  brake: $('brakeButton'), nitro: $('nitroButton'), steering: $('steeringRange'), quality: $('qualitySelect'),
  sound: $('soundToggle'), arrowControls: $('arrowControls'), wheelControls: $('wheelControls'), tiltHint: $('tiltHint'),
  loading: $('loading'), toast: $('toast')
};

const routes = {
  riyadh: { name: 'RIYADH RING ROAD', sky: 0x9dc8e5, fog: 0x9bbad0, ground: 0x9c9c96, sun: 0xffe2bb, road: 0x252c39, glow: 0x4a9cff },
  coast: { name: 'COASTAL HIGHWAY', sky: 0x82c9e5, fog: 0xadd4df, ground: 0x9ab9a7, sun: 0xffedcf, road: 0x242d38, glow: 0x57c5ff },
  desert: { name: 'DESERT PASS', sky: 0xe6b98d, fog: 0xd4a97c, ground: 0xb78a5b, sun: 0xffd38b, road: 0x292b31, glow: 0xffa04b }
};
let selectedRoute = 'riyadh';
let controlMode = 'arrows';
let qualityMode = 'auto';
let scene, camera, renderer, clock, bikeRoot, bikePaintParts = [], riderRoot, worldRoot, roadChunks = [], traffic = [], coins3D = [], garagePlatform;
let gameState = 'menu';
let speed = 0, score = 0, runCoins = 0, distance = 0, totalCoins = Number(localStorage.getItem('alaminCoins') || 0), bestScore = Number(localStorage.getItem('alaminBest') || 0), totalDistance = Number(localStorage.getItem('alaminDistance') || 0);
let targetX = 0, steering = 0, steerInput = 0, brakeInput = false, nitroInput = false, elapsed = 0, nitroTime = 0, invulnerable = 0;
let lastToast = 0, audioCtx = null, engineOsc = null, engineGain = null, tiltBase = null, tiltValue = 0, frameCount = 0, fpsTimer = 0, measuredFps = 60, adaptiveScale = 1;
const laneX = [-3.55, 0, 3.55];
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

function mat(color, roughness=0.55, metalness=0, extra={}) { return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); }
function addMesh(parent, geo, material, x=0,y=0,z=0) { const m = new THREE.Mesh(geo,material); m.position.set(x,y,z); parent.add(m); return m; }
function cylinderBetween(parent, a, b, r1, r2, material, radial=16) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B,A);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,d.length(),radial,1,false),material);
  mesh.position.copy(A).add(B).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); parent.add(mesh);
  return mesh;
}
function roundedBox(parent,w,h,d,r,material,x,y,z) {
  const shape = new THREE.Shape();
  const rr = Math.min(r,w/2-.001,h/2-.001);
  shape.moveTo(-w/2+rr,-h/2); shape.lineTo(w/2-rr,-h/2); shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+rr);
  shape.lineTo(w/2,h/2-rr); shape.quadraticCurveTo(w/2,h/2,w/2-rr,h/2); shape.lineTo(-w/2+rr,h/2); shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-rr); shape.lineTo(-w/2,-h/2+rr); shape.quadraticCurveTo(-w/2,-h/2,-w/2+rr,-h/2);
  const g = new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:Math.min(rr*.18,d*.12),bevelThickness:Math.min(rr*.18,d*.12),curveSegments:8});
  g.translate(0,0,-d/2);
  return addMesh(parent,g,material,x,y,z);
}
function makeTextTexture(text, sub='') {
  const c=document.createElement('canvas'); c.width=1024;c.height=256; const x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height); x.fillStyle='rgba(0,0,0,0.03)';x.fillRect(0,0,c.width,c.height);
  x.fillStyle='#f8fbff';x.font='900 130px Inter, sans-serif';x.textAlign='center';x.fillText(text,512,145);
  if(sub){x.fillStyle='#5fb2ff';x.font='700 42px Inter, sans-serif';x.fillText(sub,512,220)}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makeRoadTexture(){
  const c=document.createElement('canvas');c.width=512;c.height=512;const x=c.getContext('2d');x.fillStyle='#343b48';x.fillRect(0,0,512,512);
  let seed=37; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<24000;i++){const a=.025+rnd()*.12;x.fillStyle=`rgba(${rnd()>.5?255:0},${rnd()>.5?255:0},${rnd()>.5?255:0},${a})`;const s=rnd()*2.1;x.fillRect(rnd()*512,rnd()*512,s,s)}
  for(let i=0;i<24;i++){x.strokeStyle='rgba(10,15,24,.12)';x.lineWidth=.5;x.beginPath();x.moveTo(rnd()*512,rnd()*512);x.lineTo(rnd()*512,rnd()*512);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,8);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

function makeWheel(parent, z, paintMaterial, scale=1) {
  const wheel = new THREE.Group(); wheel.position.set(0,.39,z); parent.add(wheel); wheel.userData.spin=0;
  const tire = addMesh(wheel,new THREE.CylinderGeometry(.365*scale,.365*scale,.19*scale,48,1),mat(0x090d13,.88),0,0,0); tire.rotation.z=Math.PI/2;
  const tread = addMesh(wheel,new THREE.TorusGeometry(.358*scale,.012*scale,6,56),mat(0x202a34,.9),0,0,0); tread.rotation.y=Math.PI/2;
  for(const side of [-1,1]){
    const rim=addMesh(wheel,new THREE.CylinderGeometry(.265*scale,.265*scale,.198*scale,40,1),mat(0x0757d5,.32,.72),0,0,0);rim.rotation.z=Math.PI/2;
    const outer=addMesh(wheel,new THREE.TorusGeometry(.286*scale,.018*scale,8,48),mat(0x68aaff,.28,.85),side*.104*scale,0,0);outer.rotation.y=Math.PI/2;
    const disc=addMesh(wheel,new THREE.CylinderGeometry(.205*scale,.205*scale,.018*scale,40),mat(0x9ca8b6,.32,.8),side*.118*scale,0,0);disc.rotation.z=Math.PI/2;
    const hub=addMesh(wheel,new THREE.CylinderGeometry(.075*scale,.075*scale,.23*scale,24),mat(0x495568,.34,.8),0,0,0);hub.rotation.z=Math.PI/2;
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7; cylinderBetween(wheel,[side*.11*scale,Math.cos(a)*.075*scale,Math.sin(a)*.075*scale],[side*.11*scale,Math.cos(a+.18)*.255*scale,Math.sin(a+.18)*.255*scale],.009*scale,.009*scale,mat(0x9eacbf,.32,.82),8)}
    for(let i=0;i<10;i++){const a=i*Math.PI*2/10;const h=addMesh(wheel,new THREE.CylinderGeometry(.010*scale,.010*scale,.028*scale,8),mat(0x343b45,.5,.6),side*.13*scale,Math.cos(a)*.17*scale,Math.sin(a)*.17*scale);h.rotation.z=Math.PI/2}
  }
  return wheel;
}

function buildBike(){
  const root=new THREE.Group();root.name='ALAMIN R-15 APEX';
  const black=mat(0x07101b,.3,.62), carbon=mat(0x111a25,.32,.55), blue=mat(0x075bdf,.26,.72), blueLight=mat(0x188cff,.22,.68), silver=mat(0xaab5c3,.32,.8), gold=mat(0xc99a26,.27,.72), rubber=mat(0x080c12,.9), red=mat(0xe52f42,.25,.42), seatMat=mat(0x11151c,.82), glass=mat(0x173f69,.16,.72,{transparent:true,opacity:.72}), white=mat(0xf2f5fa,.34,.08);
  const rearWheel=makeWheel(root,.98,blue);const frontPivot=new THREE.Group();frontPivot.position.set(0,.82,-.73);root.add(frontPivot);const frontWheel=makeWheel(frontPivot,-.26,blue,.98);frontWheel.position.y=-.43;
  // Chassis and swingarm
  cylinderBetween(root,[-.22,.72,.72],[.18,.86,-.32],.065,.055,silver);cylinderBetween(root,[.22,.72,.72],[-.18,.86,-.32],.065,.055,silver);
  cylinderBetween(root,[-.24,.56,.86],[.22,.56,.86],.035,.035,black);
  cylinderBetween(root,[0,.58,.76],[0,.87,-.32],.055,.055,black);
  // Rear suspension spring and monoshock
  cylinderBetween(root,[0,.60,.78],[0,1.04,.22],.05,.05,gold);
  for(let i=0;i<9;i++){const t=i/8;const y=.63+t*.34,z=.73-t*.43;const ring=addMesh(root,new THREE.TorusGeometry(.064,.012,5,16),gold,0,y,z);ring.rotation.x=.35}
  // Engine assembly
  roundedBox(root,.55,.5,.56,.12,black,0,.72,.16);
  roundedBox(root,.42,.38,.34,.09,mat(0x2d3743,.43,.78),0,.68,.18);
  for(let side of [-1,1]){
    const cover=addMesh(root,new THREE.CylinderGeometry(.16,.16,.05,32),mat(0x6b7786,.34,.8),side*.29,.72,.17);cover.rotation.z=Math.PI/2;
    const ring=addMesh(root,new THREE.TorusGeometry(.14,.012,8,36),blue,side*.321,.72,.17);ring.rotation.y=Math.PI/2;
    cylinderBetween(root,[side*.28,.68,.44],[side*.4,.56,.58],.045,.045,black);
  }
  // Main tank and seat
  const tank=addMesh(root,new THREE.SphereGeometry(1,40,28),blue,0,1.12,-.13);tank.scale.set(.36,.25,.52);bikePaintParts.push(tank);
  const tankTop=addMesh(root,new THREE.SphereGeometry(1,32,20),black,0,1.28,-.2);tankTop.scale.set(.285,.085,.39);
  const tankStripe=addMesh(root,new THREE.BoxGeometry(.025,.012,.65),blueLight,0,1.30,-.2);tankStripe.rotation.x=.1;
  const seat=addMesh(root,new THREE.SphereGeometry(1,32,20),seatMat,0,1.02,.58);seat.scale.set(.28,.105,.52);
  const tail=addMesh(root,new THREE.SphereGeometry(1,32,20),blue,.0,1.14,.91);tail.scale.set(.31,.16,.36);bikePaintParts.push(tail);
  const rearCowl=addMesh(root,new THREE.SphereGeometry(1,32,20),black,0,1.17,1.03);rearCowl.scale.set(.275,.12,.31);
  // Side fairings — sculpted silhouette extrusions
  function fairing(side, material, shift=0){
    const s=new THREE.Shape();s.moveTo(-.82,.62);s.quadraticCurveTo(-.48,.48,-.08,.50);s.lineTo(.47,.55);s.quadraticCurveTo(.83,.77,.96,1.02);s.lineTo(.52,1.13);s.lineTo(.02,1.06);s.lineTo(-.48,.96);s.quadraticCurveTo(-.75,.82,-.82,.62);
    const g=new THREE.ExtrudeGeometry(s,{depth:.11,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.035,bevelThickness:.026,curveSegments:14});
    const m=new THREE.Mesh(g,material);m.rotation.y=side*Math.PI/2;m.position.x=side*(.31+shift);m.position.z=0;root.add(m);if(material===blue)bikePaintParts.push(m);return m;
  }
  fairing(1,black);fairing(-1,black);
  fairing(1,blue,.025);fairing(-1,blue,.025);
  // Blue lower panels and vents
  for(const s of [-1,1]){
    const p=roundedBox(root,.025,.09,.55,.03,blueLight,s*.425,.68,-.05);p.rotation.x=-.12;
    const vent=roundedBox(root,.02,.06,.22,.02,black,s*.435,.78,.25);vent.rotation.x=-.2;
    cylinderBetween(root,[s*.34,.88,-.36],[s*.48,.77,-.12],.018,.018,silver);
    // frame sliders
    const slider=addMesh(root,new THREE.CylinderGeometry(.055,.07,.1,16),black,s*.39,.66,.15);slider.rotation.z=Math.PI/2;
  }
  // Front nose, windscreen and headlight cluster
  const nose=addMesh(root,new THREE.SphereGeometry(1,36,24),blue,0,1.08,-.78);nose.scale.set(.37,.24,.38);bikePaintParts.push(nose);
  const cowl=addMesh(root,new THREE.SphereGeometry(1,32,24),black,0,1.18,-.86);cowl.scale.set(.32,.16,.28);
  const screen=addMesh(root,new THREE.SphereGeometry(1,32,20),glass,0,1.39,-.73);screen.scale.set(.29,.28,.20);screen.rotation.x=-.28;
  const headShell=roundedBox(root,.52,.15,.06,.05,black,0,.95,-1.04);
  for(let s of [-1,1]){
    const lamp=addMesh(root,new THREE.SphereGeometry(1,20,14),mat(0xeffaff,.16,.25,{emissive:0xb8eaff,emissiveIntensity:1.4}),s*.19,1.0,-1.01);lamp.scale.set(.13,.045,.03);
    const lampLine=addMesh(root,new THREE.BoxGeometry(.20,.014,.018),mat(0x76d7ff,.15,.1,{emissive:0x2daaff,emissiveIntensity:1.5}),s*.19,.91,-1.02);lampLine.rotation.z=s*.18;
  }
  // Tail light
  const tailLamp=addMesh(root,new THREE.SphereGeometry(1,24,14),mat(0xff2948,.2,.1,{emissive:0xea102e,emissiveIntensity:1.1}),0,1.14,1.3);tailLamp.scale.set(.2,.038,.04);
  // Front forks and brakes
  for(let s of [-1,1]){
    cylinderBetween(frontPivot,[s*.19,-.04,.0],[s*.16,-.46,-.25],.045,.035,gold,20);
    cylinderBetween(frontPivot,[s*.19,-.46,-.25],[s*.19,-.58,-.26],.03,.03,silver,16);
    const caliper=roundedBox(frontPivot,.13,.18,.10,.035,mat(0x242c37,.4,.68),s*.22,-.44,-.25);
    // mirrors and indicators
    cylinderBetween(frontPivot,[s*.22,.36,-.04],[s*.40,.55,.03],.018,.014,black,12);
    const mirror=addMesh(frontPivot,new THREE.SphereGeometry(1,20,12),black,s*.43,.57,.02);mirror.scale.set(.13,.06,.10);
    const indicator=addMesh(frontPivot,new THREE.SphereGeometry(1,16,10),mat(0xffa34d,.22,.1,{emissive:0xff8b2c,emissiveIntensity:.4}),s*.39,.0,-.24);indicator.scale.set(.04,.03,.035);
  }
  // Handlebar, grips and controls
  cylinderBetween(frontPivot,[-.43,.30,-.02],[.43,.30,-.02],.022,.022,silver,16);
  for(const s of [-1,1]){
    const grip=addMesh(frontPivot,new THREE.CylinderGeometry(.045,.04,.22,18),rubber,s*.42,.30,-.02);grip.rotation.z=Math.PI/2;
    const end=addMesh(frontPivot,new THREE.SphereGeometry(.045,12,8),black,s*.54,.30,-.02);
  }
  // Exhaust, pegs, chain and rear details
  cylinderBetween(root,[.31,.60,.44],[.43,.56,1.02],.075,.10,mat(0x9aa7b6,.28,.8),24);
  const exhaustTip=addMesh(root,new THREE.CylinderGeometry(.08,.09,.08,24),black,.43,.56,1.02);exhaustTip.rotation.x=Math.PI/2;
  cylinderBetween(root,[-.3,.56,.4],[-.5,.54,.75],.04,.04,silver);
  for(const s of [-1,1]){cylinderBetween(root,[s*.2,.62,.3],[s*.43,.56,.42],.018,.018,silver);const peg=addMesh(root,new THREE.CylinderGeometry(.035,.035,.22,16),black,s*.44,.57,.43);peg.rotation.z=Math.PI/2}
  // Chain and rear sprocket
  const sprocket=addMesh(root,new THREE.CylinderGeometry(.17,.17,.024,36),silver,-.22,.39,.98);sprocket.rotation.z=Math.PI/2;
  cylinderBetween(root,[-.24,.39,.98],[-.24,.39,.26],.012,.012,mat(0x818b99,.4,.85),8);
  // ALAMIN decals
  const logoTex=makeTextTexture('ALAMIN','R-15 APEX');
  for(const s of [-1,1]){const decal=new THREE.Mesh(new THREE.PlaneGeometry(.48,.12),new THREE.MeshBasicMaterial({map:logoTex,transparent:true,side:THREE.DoubleSide}));decal.rotation.y=s*Math.PI/2;decal.position.set(s*.452,.81,-.23);root.add(decal)}
  root.userData.frontPivot=frontPivot;root.userData.wheels=[rearWheel,frontWheel];root.userData.paint= bikePaintParts;
  return root;
}

function buildRider(){
  const rig=new THREE.Group();rig.name='ALAMIN RIDER RIG';
  const skin=mat(0xb87954,.78,0), skinLight=mat(0xd69a70,.75,0), hair=mat(0x11151c,.72,.02), hairHi=mat(0x202630,.55,.05), jacket=mat(0x090f19,.48,.12), jacketPanel=mat(0x172537,.4,.16), white=mat(0xf1f3f6,.62,.02), pants=mat(0x111821,.73,.04), shoes=mat(0xe7edf5,.56,.02), sole=mat(0x252c38,.75), glove=mat(0x171e29,.6,.15), red=mat(0x125ee0,.32,.3);
  // Pelvis and torso are overlapping sculpted volumes for a continuous silhouette
  const pelvis=addMesh(rig,new THREE.SphereGeometry(1,28,20),pants,0,1.07,.35);pelvis.scale.set(.27,.24,.24);
  const torsoGroup=new THREE.Group();torsoGroup.position.set(0,1.25,.26);torsoGroup.rotation.x=-.24;rig.add(torsoGroup);
  const torso=addMesh(torsoGroup,new THREE.CapsuleGeometry(.255,.44,8,20),jacket,0,.19,0);torso.scale.set(1.0,1.08,.86);
  const chest=addMesh(torsoGroup,new THREE.SphereGeometry(1,28,18),jacketPanel,0,.27,-.045);chest.scale.set(.245,.24,.22);
  const tshirt=addMesh(torsoGroup,new THREE.SphereGeometry(1,24,16),white,0,.20,-.205);tshirt.scale.set(.11,.31,.018);
  // Back patch / ALAMIN lettering sits visibly on the rider's jacket
  const backCanvas=document.createElement('canvas');backCanvas.width=512;backCanvas.height=256;const bx=backCanvas.getContext('2d');bx.fillStyle='#f4f7fc';bx.font='900 82px Inter';bx.textAlign='center';bx.fillText('ALAMIN',256,120);bx.fillStyle='#4e9dff';bx.font='700 28px Inter';bx.fillText('APEX RIDER',256,168);const backTex=new THREE.CanvasTexture(backCanvas);backTex.colorSpace=THREE.SRGBColorSpace;
  const backDecal=new THREE.Mesh(new THREE.PlaneGeometry(.34,.17),new THREE.MeshBasicMaterial({map:backTex,transparent:true,side:THREE.DoubleSide}));backDecal.position.set(0,.28,.222);torsoGroup.add(backDecal);
  // White jacket shoulder piping and cuffs
  for(const s of [-1,1]){
    const stripe=addMesh(torsoGroup,new THREE.CapsuleGeometry(.014,.27,4,8),white,s*.235,.28,-.01);stripe.rotation.z=s*.35;
    const shoulder=addMesh(torsoGroup,new THREE.SphereGeometry(1,18,12),jacket,s*.245,.35,0);shoulder.scale.set(.11,.14,.14);
  }
  // Neck and head, with recognizable hair silhouette and subtle facial features
  const neck=addMesh(rig,new THREE.CylinderGeometry(.09,.105,.18,20),skin,0,1.66,.06);
  const headGroup=new THREE.Group();headGroup.position.set(0,1.83,.035);rig.add(headGroup);
  const face=addMesh(headGroup,new THREE.SphereGeometry(1,36,28),skinLight,0,0,0);face.scale.set(.16,.205,.145);
  // Jaw and beard edge
  const beard=addMesh(headGroup,new THREE.SphereGeometry(1,28,18),mat(0x25201f,.9),0,-.09,-.004);beard.scale.set(.153,.112,.148);
  const faceFront=addMesh(headGroup,new THREE.SphereGeometry(1,30,20),skinLight,0,-.015,-.018);faceFront.scale.set(.151,.165,.142);
  // ears
  for(const s of [-1,1]){const ear=addMesh(headGroup,new THREE.SphereGeometry(1,16,12),skin,s*.158,-.01,0);ear.scale.set(.035,.065,.035)}
  // eyes looking ahead (-Z)
  for(const s of [-1,1]){
    const eye=addMesh(headGroup,new THREE.SphereGeometry(1,16,12),mat(0xf8f4ed,.28),s*.063,.035,-.132);eye.scale.set(.027,.017,.009);
    const iris=addMesh(headGroup,new THREE.SphereGeometry(1,14,10),mat(0x4a362b,.25),s*.063,.034,-.141);iris.scale.set(.011,.012,.006);
    const brow=addMesh(headGroup,new THREE.CapsuleGeometry(.012,.055,4,8),hair,s*.063,.073,-.131);brow.rotation.z=s*.13;
  }
  const nose=addMesh(headGroup,new THREE.SphereGeometry(1,16,12),skin,0,-.005,-.151);nose.scale.set(.024,.04,.026);
  const mouth=addMesh(headGroup,new THREE.CapsuleGeometry(.008,.044,3,8),mat(0x6e3933,.8),0,-.065,-.139);mouth.rotation.z=Math.PI/2;
  // Thick swept-up dark hair, matching the supplied reference silhouette
  const hairCap=addMesh(headGroup,new THREE.SphereGeometry(1,32,20),hair,0,.14,.012);hairCap.scale.set(.17,.125,.15);
  const quiff=addMesh(headGroup,new THREE.SphereGeometry(1,32,22),hairHi,0,.19,-.042);quiff.scale.set(.145,.11,.12);quiff.rotation.x=-.25;
  for(let i=0;i<9;i++){const a=(i/8)*Math.PI*1.35-.65;const tuft=addMesh(headGroup,new THREE.SphereGeometry(1,12,8),i%2?hair:hairHi,Math.sin(a)*.09,.21+Math.cos(a)*.035,-.075);tuft.scale.set(.045,.07,.045);tuft.rotation.z=-a*.35}
  // articulated arms: shoulder -> elbow -> wrist, positioned onto the clip-ons
  const limbMeshes=[];
  function limb(a,b,rA,rB,material,parent){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=new THREE.Vector3().subVectors(B,A);const m=new THREE.Mesh(new THREE.CylinderGeometry(rB,rA,d.length(),20,1),material);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(m);const j1=addMesh(parent,new THREE.SphereGeometry(rA,16,12),material,...a);const j2=addMesh(parent,new THREE.SphereGeometry(rB,16,12),material,...b);limbMeshes.push(m,j1,j2);return m}
  for(const s of [-1,1]){
    const shoulder=[s*.245,1.52,.16], elbow=[s*.32,1.36,-.10], wrist=[s*.36,1.18,-.58];
    limb(shoulder,elbow,.105,.083,jacket,rig);limb(elbow,wrist,.078,.052,jacketPanel,rig);
    const cuff=addMesh(rig,new THREE.SphereGeometry(1,18,12),blackMat(),s*.36,1.18,-.55);cuff.scale.set(.065,.06,.07);
    const gloveMesh=addMesh(rig,new THREE.SphereGeometry(1,18,12),glove,s*.39,1.17,-.66);gloveMesh.scale.set(.075,.052,.08);
    // jeans: thigh and lower leg bent around the tank
    const hip=[s*.18,1.06,.36], knee=[s*.30,.82,.59], ankle=[s*.32,.54,.76];
    limb(hip,knee,.135,.115,pants,rig);limb(knee,ankle,.105,.075,pants,rig);
    const shoe=addMesh(rig,new THREE.SphereGeometry(1,22,16),shoes,s*.32,.49,.70);shoe.scale.set(.115,.075,.19);shoe.rotation.y=s*.08;
    const soleMesh=addMesh(rig,new THREE.SphereGeometry(1,18,12),sole,s*.32,.445,.70);soleMesh.scale.set(.118,.026,.195);
    // sleeve logo patch and white stripe at shoulder
    const patch=addMesh(rig,new THREE.SphereGeometry(1,16,12),white,s*.30,1.48,.12);patch.scale.set(.075,.07,.012);
    const patchInner=addMesh(rig,new THREE.SphereGeometry(1,12,8),blue,s*.30,1.48,.103);patchInner.scale.set(.052,.048,.01);
  }
  // watch on left wrist
  const watch=addMesh(rig,new THREE.CylinderGeometry(.046,.046,.022,24),mat(0xadb9c7,.3,.8),-.37,1.18,-.58);watch.rotation.z=Math.PI/2;
  rig.userData.torso=torsoGroup;rig.userData.head=headGroup;return rig;
}
function blackMat(){return mat(0x111a27,.55,.12)}

function buildCar(color=0xdbe2eb,type='sedan'){
  const root=new THREE.Group();root.userData.wheels=[];const paint=mat(color,.26,.48);const glass=mat(0x13283b,.14,.62,{transparent:true,opacity:.93});const dark=mat(0x080d14,.88,.08);const rimMat=mat(0x8f9cab,.28,.82);const chrome=mat(0x536476,.32,.72);
  const isSUV=type==='suv';const len=isSUV?4.55:4.2;const height=isSUV?1.13:.92;
  // Sculpted lower body, bonnet and rear deck read as a single automotive silhouette.
  roundedBox(root,1.88,height,len,.25,paint,0,.58,0);
  const cabin=roundedBox(root,1.56,isSUV?.72:.62,isSUV?2.18:1.92,.22,paint,0,1.14,-.05);
  const windshield=roundedBox(root,1.42,.43,.045,.09,glass,0,1.18,-1.02);windshield.rotation.x=-.22;
  const rearGlass=roundedBox(root,1.40,.39,.045,.08,glass,0,1.17,.91);rearGlass.rotation.x=.22;
  // Side glazing: two long dark windows, visually continuous with the roof line.
  for(const side of [-1,1]){
    roundedBox(root,.035,.40,.72,.07,glass,side*.79,1.15,-.45);
    roundedBox(root,.035,.40,.69,.07,glass,side*.79,1.15,.39);
    const mirror=addMesh(root,new THREE.SphereGeometry(1,12,8),paint,side*.99,1.02,-.86);mirror.scale.set(.09,.05,.13);
    for(const z of [-1.28,1.27]){
      const wheel=addMesh(root,new THREE.CylinderGeometry(.34,.34,.17,28),dark,side*.91,.37,z);wheel.rotation.z=Math.PI/2;root.userData.wheels.push(wheel);
      const rim=addMesh(root,new THREE.CylinderGeometry(.205,.205,.18,24),rimMat,side*.92,.37,z);rim.rotation.z=Math.PI/2;root.userData.wheels.push(rim);
      const hub=addMesh(root,new THREE.CylinderGeometry(.07,.07,.19,16),chrome,side*.93,.37,z);hub.rotation.z=Math.PI/2;
    }
  }
  // Wide lamp signatures and bumpers instead of disconnected toy-like cubes.
  roundedBox(root,1.14,.17,.075,.045,mat(0x172534,.36,.7),0,.59,-len/2-.015);
  roundedBox(root,1.90,.11,.11,.04,mat(0x303c49,.4,.58),0,.36,-len/2+.03);
  roundedBox(root,1.90,.11,.11,.04,mat(0x303c49,.4,.58),0,.36,len/2-.03);
  for(const side of [-1,1]){
    const head=addMesh(root,new THREE.SphereGeometry(1,16,10),mat(0xe7f8ff,.18,.08,{emissive:0x9edcff,emissiveIntensity:.85}),side*.66,.73,-len/2+.025);head.scale.set(.22,.065,.025);
    const tail=addMesh(root,new THREE.BoxGeometry(.36,.07,.035),mat(0xff263f,.22,.1,{emissive:0xd60029,emissiveIntensity:.9}),side*.62,.73,len/2-.018);
  }
  root.userData.wheels=[];root.traverse(o=>{if(o.geometry?.type==='CylinderGeometry' && o.geometry.parameters?.radiusTop>.30)root.userData.wheels.push(o)});
  return root;
}

function makeBuilding(parent,x,z,w,h,d){
  // A single textured building mesh keeps the skyline inexpensive on mobile.
  if(!window.__buildingMap){
    const c=document.createElement('canvas');c.width=256;c.height=512;const g=c.getContext('2d');
    const grad=g.createLinearGradient(0,0,256,512);grad.addColorStop(0,'#50677b');grad.addColorStop(1,'#26384b');g.fillStyle=grad;g.fillRect(0,0,256,512);
    for(let y=18;y<500;y+=36){for(let xx=15;xx<248;xx+=34){g.fillStyle=((xx+y)%3===0)?'rgba(246,205,137,.72)':'rgba(119,177,212,.46)';g.fillRect(xx,y,17,22);}}
    window.__buildingMap=new THREE.CanvasTexture(c);window.__buildingMap.colorSpace=THREE.SRGBColorSpace;
  }
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({map:window.__buildingMap,color:0xffffff,roughness:.82,metalness:.08}));m.position.set(x,h/2,z);parent.add(m);return m;
}
function makeLamp(parent,x,z){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);const poleMat=mat(0x27394a,.42,.65),lightMat=mat(0xd8efff,.22,.1,{emissive:0x8fcaff,emissiveIntensity:.75});
  cylinderBetween(g,[0,0,0],[0,5.0,0],.045,.04,poleMat,10);cylinderBetween(g,[0,4.96,0],[x>0?-.72:.72,5.08,0],.035,.025,poleMat,10);addMesh(g,new THREE.BoxGeometry(.36,.09,.18),lightMat,x>0?-.85:.85,5.03,0);return g;
}
function createEnvironmentChunk(index){
  const chunk=new THREE.Group();chunk.position.z=-index*78;worldRoot.add(chunk);
  const asphalt=makeRoadTexture();const road=addMesh(chunk,new THREE.PlaneGeometry(12.5,78),new THREE.MeshStandardMaterial({map:asphalt,color:0xffffff,roughness:.95,metalness:.015}),0,0,-39);road.rotation.x=-Math.PI/2;road.position.y=.012;
  const ground=addMesh(chunk,new THREE.PlaneGeometry(78,78),mat(0x778779,.98),0,0,-39);ground.rotation.x=-Math.PI/2;ground.position.y=-.13;
  // Lane dashes batched into a single draw call per road segment.
  const dashGeo=new THREE.BoxGeometry(.085,.018,3.4);const dashMat=mat(0xe1e8ef,.78);const dashes=new THREE.InstancedMesh(dashGeo,dashMat,18);const dummy=new THREE.Object3D();let n=0;
  for(let z=-5;z>-78;z-=8.5){for(const x of [-2.08,2.08]){dummy.position.set(x,.03,z);dummy.updateMatrix();dashes.setMatrixAt(n++,dummy.matrix)}}dashes.count=n;chunk.add(dashes);
  for(const x of [-5.94,5.94])addMesh(chunk,new THREE.BoxGeometry(.09,.02,78),mat(0xe6edf3,.72),x,.027,-39);
  for(const side of [-1,1]){
    addMesh(chunk,new THREE.BoxGeometry(.62,.10,78),mat(0x87919b,.82),side*6.42,-.025,-39);
    for(const y of [.38,1.0])cylinderBetween(chunk,[side*6.34,y,-78],[side*6.34,y,0],y>.5?.038:.03,y>.5?.038:.03,mat(0x8c9eae,.36,.76),10);
    const postGeo=new THREE.CylinderGeometry(.035,.045,.72,8);const posts=new THREE.InstancedMesh(postGeo,mat(0x657889,.48,.58),11);let k=0;
    for(let z=-3;z>-78;z-=7.3){dummy.position.set(side*6.34,.63,z);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();posts.setMatrixAt(k++,dummy.matrix)}posts.count=k;chunk.add(posts);
    // Instanced trunks and canopy clusters: dozens of trees in just two draw calls.
    const treeZ=[];for(let z=-8;z>-78;z-=15.5)treeZ.push(z);
    const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.15,1.55,10),mat(0x4d3c2e,.94),treeZ.length);
    const leafMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),mat(0x285c49,.9),treeZ.length*2);
    let ti=0,li=0;for(const z of treeZ){const tx=side*(8.3+Math.random()*1.0);dummy.position.set(tx,.78,z);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunkMesh.setMatrixAt(ti++,dummy.matrix);
      for(let j=0;j<2;j++){dummy.position.set(tx+(j===0?-.20:.20),1.85+(j===0?.15:0),z+(j===0?0:.12));dummy.scale.set(.48,.58,.48);dummy.rotation.set(0,j*.7,0);dummy.updateMatrix();leafMesh.setMatrixAt(li++,dummy.matrix)}}trunkMesh.count=ti;leafMesh.count=li;chunk.add(trunkMesh,leafMesh);
    makeLamp(chunk,side*7.05,-28);
    makeBuilding(chunk,side*(15+Math.random()*5),-43,3.8+Math.random()*2.5,12+Math.random()*13,3.8);
  }
  return chunk;
}
function makeCoin(){const g=new THREE.Group();const gold=mat(0xffca4b,.22,.68,{emissive:0x7d4b00,emissiveIntensity:.18});const tor=addMesh(g,new THREE.TorusGeometry(.31,.075,10,28),gold,0,0,0);tor.rotation.y=Math.PI/2;const core=addMesh(g,new THREE.CylinderGeometry(.20,.20,.075,20),gold,0,0,0);core.rotation.z=Math.PI/2;const shine=addMesh(g,new THREE.SphereGeometry(.055,12,8),mat(0xfff2b6,.15,.1,{emissive:0xffd56b,emissiveIntensity:.6}),-.03,.20,0);return g}
function resetTrafficCar(car,zOverride){const lanes=[-3.55,0,3.55];const lane=lanes[Math.floor(Math.random()*lanes.length)];car.position.set(lane,0,zOverride??(-92-Math.random()*65));car.userData.lane=lane;car.userData.speed=.45+Math.random()*.65;}
function createTraffic(){const colors=[0xe5e9ef,0xb62131,0x202d43,0x9d9fa5,0x1b6ca8,0xa5a9ad,0x263b32];for(let i=0;i<6;i++){const car=buildCar(colors[i%colors.length],i%4===0?'suv':'sedan');const scale=i%4===0?1.04:.98;car.scale.setScalar(scale);worldRoot.add(car);resetTrafficCar(car,-28-i*25-Math.random()*10);traffic.push(car)}
  for(let i=0;i<9;i++){const c=makeCoin();worldRoot.add(c);c.position.set(laneX[Math.floor(Math.random()*3)],1.35,-18-i*17);coins3D.push(c)}
}

function initThree(){
  scene=new THREE.Scene();scene.background=new THREE.Color(routes[selectedRoute].sky);scene.fog=new THREE.Fog(routes[selectedRoute].fog,28,185);
  camera=new THREE.PerspectiveCamera(56,innerWidth/innerHeight,.1,260);camera.position.set(0,3.2,7.4);camera.lookAt(0,1,-5);
  const lowPower=mobile;renderer=new THREE.WebGLRenderer({antialias:!lowPower,alpha:false,powerPreference:'high-performance',stencil:false,depth:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1.25:1.55));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;renderer.shadowMap.enabled=!lowPower;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
  const hemi=new THREE.HemisphereLight(0xd5e9ff,0x4d443b,2.0);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe4c3,2.5);sun.position.set(-8,16,6);sun.castShadow=!lowPower;sun.shadow.mapSize.set(768,768);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun);
  const fill=new THREE.DirectionalLight(0x5ca9ff,.9);fill.position.set(8,7,-13);scene.add(fill);
  worldRoot=new THREE.Group();scene.add(worldRoot);for(let i=0;i<5;i++)roadChunks.push(createEnvironmentChunk(i));
  bikeRoot=buildBike();scene.add(bikeRoot);riderRoot=buildRider();bikeRoot.add(riderRoot);
  // Add a subtle non-shadow ground contact under the player
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const sx=shadowCanvas.getContext('2d');const grad=sx.createRadialGradient(64,64,4,64,64,62);grad.addColorStop(0,'rgba(0,0,0,.32)');grad.addColorStop(1,'rgba(0,0,0,0)');sx.fillStyle=grad;sx.fillRect(0,0,128,128);const shadowTex=new THREE.CanvasTexture(shadowCanvas);const shadow=addMesh(scene,new THREE.PlaneGeometry(3.2,4.4),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}),0,.028,.2);shadow.rotation.x=-Math.PI/2;shadow.position.z=.4;
  createTraffic();
  // Garage platform (hidden until garage mode)
  garagePlatform=new THREE.Group();const disk=addMesh(garagePlatform,new THREE.CylinderGeometry(4.8,5.0,.22,64),mat(0x111f31,.46,.42),0,-.13,0);const ring=addMesh(garagePlatform,new THREE.TorusGeometry(4.7,.035,8,100),mat(0x148cff,.2,.6,{emissive:0x0755b8,emissiveIntensity:.4}),0,.01,0);ring.rotation.x=Math.PI/2;garagePlatform.visible=false;scene.add(garagePlatform);
  clock=new THREE.Clock();
  window.addEventListener('resize',onResize,{passive:true});
}
function onResize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const max=qualityMode==='low'?1:qualityMode==='medium'?1.1:mobile?1.25:1.55;renderer.setPixelRatio(Math.min(devicePixelRatio||1,max));renderer.setSize(innerWidth,innerHeight)}

function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(lastToast);lastToast=setTimeout(()=>ui.toast.classList.remove('show'),1900)}
function setRoute(route){selectedRoute=route;const r=routes[route];ui.route.textContent=r.name;scene.background.setHex(r.sky);scene.fog.color.setHex(r.fog);scene.children.forEach(o=>{if(o.isHemisphereLight)o.groundColor.setHex(r.ground)});showToast(`${r.name} SELECTED`)}
function setMode(mode){controlMode=mode;document.querySelectorAll('.mode-option').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));ui.arrowControls.classList.toggle('hidden',mode!=='arrows');ui.wheelControls.classList.toggle('hidden',mode!=='wheel');ui.tiltHint.classList.toggle('hidden',mode!=='tilt');if(mode==='tilt')enableTilt();else tiltValue=0;showToast(`${mode.toUpperCase()} STEERING`)}
function setQuality(value){qualityMode=value;const max=value==='low'?1:value==='medium'?1.1:value==='high'?1.45:(mobile?1.25:1.55);renderer.setPixelRatio(Math.min(devicePixelRatio||1,max));renderer.shadowMap.enabled=value==='high'&&!mobile;renderer.setSize(innerWidth,innerHeight);showToast(`${value.toUpperCase()} GRAPHICS`)}
function openModal(id){document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active'));$(id).classList.add('active');if(id==='garageMenu'){gameState='garage';garagePlatform.visible=true;worldRoot.visible=false;traffic.forEach(t=>t.visible=false);camera.position.set(4.8,2.65,4.8);camera.lookAt(0,1.0,0);bikeRoot.position.set(0,0,0);bikeRoot.rotation.y=-.7;}else if(id==='profileMenu'||id==='settingsMenu'){if(gameState!=='menu')gameState='paused';}else if(id==='mainMenu'){gameState='menu';garagePlatform.visible=false;worldRoot.visible=true;traffic.forEach(t=>t.visible=true);bikeRoot.position.set(0,0,0);bikeRoot.rotation.set(0,0,0);camera.position.set(0,3.2,7.4);camera.lookAt(0,1,-5)}}
function closeModal(){document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active'));if(gameState==='garage'){gameState='menu';garagePlatform.visible=false;worldRoot.visible=true;traffic.forEach(t=>t.visible=true);bikeRoot.rotation.set(0,0,0);camera.position.set(0,3.2,7.4);camera.lookAt(0,1,-5)}}
function setPlaying(){document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active'));garagePlatform.visible=false;worldRoot.visible=true;traffic.forEach(t=>t.visible=true);gameState='playing';speed=72;score=0;runCoins=0;distance=0;targetX=0;steering=0;elapsed=0;nitroTime=0;invulnerable=0;traffic.forEach((c,i)=>resetTrafficCar(c,-28-i*23-Math.random()*10));coins3D.forEach((c,i)=>{c.visible=true;c.position.set(laneX[Math.floor(Math.random()*3)],1.3,-20-i*20)});bikeRoot.position.set(0,0,0);bikeRoot.rotation.set(0,0,0);camera.fov=56;camera.updateProjectionMatrix();setAudio(true);}
function endRide(){gameState='crashed';speed=0;bestScore=Math.max(bestScore,Math.floor(score));totalDistance+=distance/1000;localStorage.setItem('alaminCoins',String(totalCoins));localStorage.setItem('alaminBest',String(bestScore));localStorage.setItem('alaminDistance',String(totalDistance));$('finalScore').textContent=Math.floor(score).toLocaleString();$('finalCoins').textContent=runCoins;$('profileBest').textContent=bestScore.toLocaleString();$('profileCoins').textContent=totalCoins.toLocaleString();$('profileDistance').textContent=totalDistance.toFixed(1);openModal('gameOverMenu');setAudio(false)}
function startBrake(v){brakeInput=v;ui.brake.classList.toggle('pressed',v)}
function startNitro(v){nitroInput=v;ui.nitro.classList.toggle('pressed',v)}
function bindHold(button,down,up){button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);down()});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>button.addEventListener(ev,e=>{e.preventDefault();up()}))}
bindHold(ui.left,()=>steerInput=-1,()=>{if(steerInput<0)steerInput=0});bindHold(ui.right,()=>steerInput=1,()=>{if(steerInput>0)steerInput=0});bindHold(ui.brake,()=>startBrake(true),()=>startBrake(false));bindHold(ui.nitro,()=>startNitro(true),()=>startNitro(false));
ui.steering.addEventListener('input',()=>{if(controlMode==='wheel')steerInput=Number(ui.steering.value)/100});
const wheelPad=$('wheelPad');let wheelPointerX=null;wheelPad.addEventListener('pointerdown',e=>{e.preventDefault();wheelPointerX=e.clientX;wheelPad.setPointerCapture(e.pointerId)});wheelPad.addEventListener('pointermove',e=>{if(wheelPointerX===null)return;const dx=e.clientX-wheelPointerX;wheelPointerX=e.clientX;const value=THREE.MathUtils.clamp(Number(ui.steering.value)+dx*2.1,-100,100);ui.steering.value=String(value);ui.steering.dispatchEvent(new Event('input'));wheelPad.querySelector('.wheel-ring').style.transform=`rotate(${value*.8}deg)`});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>wheelPad.addEventListener(ev,()=>{wheelPointerX=null;ui.steering.value='0';ui.steering.dispatchEvent(new Event('input'));wheelPad.querySelector('.wheel-ring').style.transform='rotate(0deg)'}));

async function enableTilt(){
  if(typeof DeviceOrientationEvent==='undefined'){showToast('TILT SENSOR NOT AVAILABLE — USE ARROWS');return}
  try{if(typeof DeviceOrientationEvent.requestPermission==='function'){const res=await DeviceOrientationEvent.requestPermission();if(res!=='granted')throw new Error('permission denied')}
    tiltBase=null;window.addEventListener('deviceorientation',onTilt,{passive:true});showToast('TILT STEERING ENABLED');
  }catch(e){showToast('MOTION PERMISSION NOT GRANTED — USE ARROWS')}
}
function onTilt(e){if(controlMode!=='tilt')return;const raw=e.gamma??0;if(tiltBase===null)tiltBase=raw;tiltValue=THREE.MathUtils.clamp((raw-tiltBase)/22,-1,1)}
function updateControls(dt){let input=controlMode==='tilt'?tiltValue:controlMode==='wheel'?Number(ui.steering.value)/100:steerInput;steering=THREE.MathUtils.damp(steering,input,6.5,dt);targetX=THREE.MathUtils.clamp(targetX+steering*dt*(speed/70)*3.2,-4.15,4.15);if(controlMode==='wheel'&&Math.abs(Number(ui.steering.value))<4)steering=THREE.MathUtils.damp(steering,0,7,dt)}

function updateWorld(dt){const worldMove=(speed/58)*dt;for(const c of roadChunks){c.position.z+=worldMove*34;if(c.position.z>78)c.position.z-=roadChunks.length*78}
  for(const car of traffic){car.position.z+=worldMove*34*car.userData.speed;car.userData.wheels?.forEach(w=>{w.rotation.x-=speed/220*dt*1.4});if(car.position.z>9){resetTrafficCar(car,-105-Math.random()*75);car.visible=true;car.rotation.y=0}car.rotation.z=Math.sin(elapsed*2+car.position.z*.03)*.004;
    if(invulnerable<=0&&Math.abs(car.position.z)<1.45&&Math.abs(car.position.x-bikeRoot.position.x)<1.15){endRide();break}
    if(car.position.z>-.9&&car.position.z<.9&&Math.abs(car.position.x-bikeRoot.position.x)<1.85&&Math.abs(car.position.x-bikeRoot.position.x)>1.05)score+=.25;
  }
  for(const c of coins3D){if(!c.visible)continue;c.position.z+=worldMove*34*1.08;c.rotation.y+=dt*2.4;c.position.y=1.27+Math.sin(elapsed*3+c.position.z)*.09;if(c.position.z>6){c.position.z=-100-Math.random()*60;c.position.x=laneX[Math.floor(Math.random()*3)]}
    if(Math.abs(c.position.z)<1.5&&Math.abs(c.position.x-bikeRoot.position.x)<1.05){c.visible=false;runCoins++;score+=125;totalCoins++;ui.coins.textContent=String(runCoins).padStart(3,'0');showToast('+1 APEX COIN')}
  }
}
function updateBike(dt){bikeRoot.position.x=THREE.MathUtils.damp(bikeRoot.position.x,targetX,5.8,dt);bikeRoot.rotation.z=THREE.MathUtils.damp(bikeRoot.rotation.z,-steering*.22,5,dt);bikeRoot.rotation.y=THREE.MathUtils.damp(bikeRoot.rotation.y,-steering*.07,4,dt);bikeRoot.userData.frontPivot.rotation.y=steering*.16;
  for(const w of bikeRoot.userData.wheels)w.rotation.x-=speed/170*dt*2.8;
  riderRoot.rotation.z=THREE.MathUtils.damp(riderRoot.rotation.z,-steering*.06,4,dt);riderRoot.userData.torso.rotation.x=THREE.MathUtils.damp(riderRoot.userData.torso.rotation.x,-.24-Math.max(0,speed-100)*.0008-(nitroTime>0?.06:0),4,dt);
  bikeRoot.position.y=.018*Math.sin(elapsed*9)*(speed/160);}
function updateCamera(dt){const desired=new THREE.Vector3(bikeRoot.position.x*.47,3.02+(speed/240)*.42,7.0+(speed/240)*.5);camera.position.lerp(desired,1-Math.exp(-dt*3.2));const look=new THREE.Vector3(bikeRoot.position.x*.24,1.06,-4.2-(speed/240)*1.4);camera.lookAt(look);const fov=56+Math.max(0,speed-100)*.045+(nitroTime>0?4:0);camera.fov=THREE.MathUtils.damp(camera.fov,fov,2.8,dt);camera.updateProjectionMatrix();}
function updateHUD(){const v=Math.round(speed);ui.speed.textContent=String(v);ui.arcSpeed.textContent=String(v);ui.score.textContent=String(Math.floor(score)).padStart(4,'0');ui.coins.textContent=String(runCoins).padStart(3,'0');ui.gear.textContent=speed>185?'5':speed>145?'4':speed>110?'3':speed>75?'2':'1';}
function updateGame(dt){if(gameState!=='playing')return;elapsed+=dt;if(invulnerable>0)invulnerable-=dt;if(nitroTime>0)nitroTime-=dt;updateControls(dt);
  let targetSpeed=88+Math.min(95,elapsed*2.6);if(brakeInput)targetSpeed=32;if(nitroInput&&nitroTime<=0)nitroTime=1.3;if(nitroTime>0)targetSpeed=Math.max(targetSpeed,205);targetSpeed=Math.min(targetSpeed,238);
  speed=THREE.MathUtils.damp(speed,targetSpeed,brakeInput?4.8:nitroTime>0?2.9:1.0,dt);score+=dt*(speed*.55);distance+=speed/3.6*dt;updateWorld(dt);if(gameState!=='playing')return;updateBike(dt);updateCamera(dt);updateHUD();
  if(Math.floor(elapsed)%15===0&&Math.abs(elapsed-Math.floor(elapsed))<dt)showToast('KEEP IT CLEAN — NEAR MISSES BONUS');
  if(engineOsc&&engineGain){engineOsc.frequency.setTargetAtTime(45+speed*.75+(nitroTime>0?25:0),audioCtx.currentTime,.08);engineGain.gain.setTargetAtTime(ui.sound.checked?.018:0,audioCtx.currentTime,.15)}
}
function setAudio(on){if(!on){if(engineGain&&audioCtx)engineGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);return;}if(!ui.sound.checked)return;if(on){try{if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();engineOsc=audioCtx.createOscillator();engineGain=audioCtx.createGain();const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350;engineOsc.type='sawtooth';engineOsc.connect(filter);filter.connect(engineGain);engineGain.connect(audioCtx.destination);engineOsc.start()}audioCtx.resume();engineGain.gain.setTargetAtTime(.018,audioCtx.currentTime,.2)}catch(e){}}else if(engineGain&&audioCtx)engineGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1)}

// Menu and UI actions
action('startButton',()=>{setPlaying();showToast('RIDE STARTED — AUTO SPEED ACTIVE')});action('pauseButton',()=>{if(gameState==='playing'){gameState='paused';openModal('pauseMenu');setAudio(false)}});action('resumeButton',()=>{closeModal();gameState='playing';setAudio(true)});action('restartButton',()=>{setPlaying();showToast('NEW RIDE STARTED')});action('againButton',()=>{setPlaying();showToast('RIDE AGAIN')});action('pauseHomeButton',()=>openModal('mainMenu'));action('gameOverHomeButton',()=>openModal('mainMenu'));action('openProfile',()=>openModal('profileMenu'));
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.open+'Menu')));document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{closeModal();if(gameState==='paused')gameState='playing'}));
document.querySelectorAll('.mode-option').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));ui.quality.addEventListener('change',()=>setQuality(ui.quality.value));ui.sound.addEventListener('change',()=>{if(!ui.sound.checked)setAudio(false);else if(gameState==='playing')setAudio(true)});
document.querySelectorAll('.swatch').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');const c={blue:0x075bdf,red:0xd5263a,pearl:0xe9edf4,cyan:0x0eafb9}[b.dataset.paint];for(const p of bikePaintParts)p.material.color.setHex(c);showToast(`${b.dataset.paint.toUpperCase()} FAIRING SELECTED`)}));
action('garageRideButton',()=>{closeModal();setPlaying()});
function action(id,fn){$(id).addEventListener('click',fn)}
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')steerInput=-1;if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')steerInput=1;if(e.key===' '||e.key==='ArrowDown')startBrake(true);if(e.key==='Shift')startNitro(true);if(e.key==='Escape'&&gameState==='playing'){gameState='paused';openModal('pauseMenu')}});window.addEventListener('keyup',e=>{if(['ArrowLeft','a','A','ArrowRight','d','D'].includes(e.key))steerInput=0;if(e.key===' '||e.key==='ArrowDown')startBrake(false);if(e.key==='Shift')startNitro(false)});


// Route chips are generated here so the menu remains compact on narrow screens.
const routePicker=document.createElement('div');routePicker.className='route-picker';routePicker.innerHTML='<button class="route-chip active" data-route="riyadh">RIYADH RING</button><button class="route-chip" data-route="coast">COASTAL</button><button class="route-chip" data-route="desert">DESERT PASS</button>';
const menuActions=document.querySelector('.menu-actions');menuActions.parentNode.insertBefore(routePicker,menuActions);routePicker.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{routePicker.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');setRoute(b.dataset.route)}));

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);if(gameState==='playing'){updateGame(dt)}else if(gameState==='garage'){elapsed+=dt;bikeRoot.rotation.y+=dt*.22;}
  else if(gameState==='menu'){bikeRoot.rotation.y=THREE.MathUtils.damp(bikeRoot.rotation.y,0,.8,dt);}
  renderer.render(scene,camera);frameCount++;fpsTimer+=dt;if(fpsTimer>=2){measuredFps=frameCount/fpsTimer;frameCount=0;fpsTimer=0;if(qualityMode==='auto'&&mobile&&measuredFps<42){adaptiveScale=Math.max(.78,adaptiveScale-.08);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25)*adaptiveScale);renderer.setSize(innerWidth,innerHeight)}else if(qualityMode==='auto'&&measuredFps>56&&adaptiveScale<1){adaptiveScale=Math.min(1,adaptiveScale+.04);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25)*adaptiveScale);renderer.setSize(innerWidth,innerHeight)}}
}

async function boot(){try{initThree();updateHUD();$('profileBest').textContent=bestScore.toLocaleString();$('profileCoins').textContent=totalCoins.toLocaleString();$('profileDistance').textContent=totalDistance.toFixed(1);setRoute(selectedRoute);animate();setTimeout(()=>ui.loading.classList.add('done'),650);}catch(e){console.error(e);ui.loading.innerHTML='<b>Unable to start 3D engine</b><small>Please use a current browser with WebGL enabled.</small>'}}
boot();
