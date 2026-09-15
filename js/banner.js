(()=>{'use strict';
document.querySelectorAll('.yn-banner').forEach(root=>{
const canvas=root.querySelector('.yn-clouds'),button=root.querySelector('.yn-control'),caption=root.querySelector('.yn-caption'),cities=[...root.querySelectorAll('.yn-city')];
const PAUSE_KEY='yn-banner-animation-paused-v1';
function readPause(){try{return localStorage.getItem(PAUSE_KEY)==='1';}catch(_){return false;}}
let paused=readPause(),visible=true,frame=0,last=0,lastPaint=0,t=0,gl=null,program,ut,ur,um,ub,uc,mouse=[-10,-10],burst=[-10,-10],clearRadius=.001,nx=0,ny=0,dragX=0,dragY=0,focusX=0,dragging=false,moved=false,startX=0,startY=0,selected=null,captionTimer,pointerFrame=0,pendingPointer=null,resizeFrame=0,burstStart=0,initialOpeningPending=!paused;
function writePause(){try{localStorage.setItem(PAUSE_KEY,paused?'1':'0');}catch(_){}}
const BURST_OPEN=240,BURST_HOLD=3000,BURST_CLOSE=540,BURST_TOTAL=BURST_OPEN+BURST_HOLD+BURST_CLOSE,PAINT_STEP=40;
try{
 gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,powerPreference:'low-power'});
 if(gl){
  const vertex='attribute vec2 pos;void main(){gl_Position=vec4(pos,0.,1.);}';
  const fragment=`precision mediump float;uniform vec2 size;uniform vec2 cursor;uniform vec2 burst;uniform float clearRadius;uniform float clock;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(a),hash(a+vec2(1.,0.)),f.x),mix(hash(a+vec2(0.,1.)),hash(a+vec2(1.,1.)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.03+vec2(2.1,7.3);a*=.5;}return v;}
  void main(){vec2 uv=gl_FragCoord.xy/size;vec2 p=uv*vec2(6.,3.);p.x-=clock*.075;float n=fbm(p+vec2(fbm(p*.7+clock*.015),0.));float upper=smoothstep(.62,.94,uv.y)*smoothstep(.38,.82,uv.x);float lower=exp(-pow((uv.y-.22-sin(uv.x*5.+clock*.07)*.055)*9.,2.));float hoverAvoid=smoothstep(.11,.30,distance(uv,cursor));float burstAvoid=smoothstep(max(.001,clearRadius*.58),max(.002,clearRadius),distance(uv,burst));float avoid=min(hoverAvoid,burstAvoid);float fog=smoothstep(.52,.82,n)*(upper*.32+lower*.12)*avoid;gl_FragColor=vec4(.76,.84,.84,fog*.18);}`;
  const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader compile');return s};
  program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader link');gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);ut=gl.getUniformLocation(program,'clock');ur=gl.getUniformLocation(program,'size');um=gl.getUniformLocation(program,'cursor');ub=gl.getUniformLocation(program,'burst');uc=gl.getUniformLocation(program,'clearRadius');
 }
}catch(e){gl=null;canvas.hidden=true;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function easeOut(v){v=clamp(v,0,1);return 1-Math.pow(1-v,3);}
function easeIn(v){v=clamp(v,0,1);return v*v;}
function safeGL(){return gl&&!gl.isContextLost();}
function paint(){if(!safeGL())return;gl.uniform1f(ut,t);gl.uniform2f(um,mouse[0],mouse[1]);gl.uniform2f(ub,burst[0],burst[1]);gl.uniform1f(uc,clearRadius);gl.drawArrays(gl.TRIANGLES,0,6);}
function doResize(){resizeFrame=0;if(!safeGL())return;const rect=root.getBoundingClientRect();const scale=rect.width<=600?.48:.62;canvas.width=Math.max(1,Math.min(900,Math.round(rect.width*scale)));canvas.height=Math.max(1,Math.min(360,Math.round(rect.height*scale)));gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(ur,canvas.width,canvas.height);paint();}
function resize(){if(!resizeFrame)resizeFrame=requestAnimationFrame(doResize);}
function shouldDrift(){return !paused&&visible&&!document.hidden;}
function schedule(){if(!frame&&visible&&!document.hidden&&(shouldDrift()||burstStart))frame=requestAnimationFrame(tick);}
function tick(now){frame=0;let needsPaint=false;if(shouldDrift()&&now-last>=PAINT_STEP){t+=Math.min((now-last)/1000,.1);last=now;needsPaint=true;}
 if(burstStart){const elapsed=now-burstStart;if(elapsed>=BURST_TOTAL){burstStart=0;burst=[-10,-10];clearRadius=.001;root.classList.remove('yn-sunshine');needsPaint=true;}else{if(elapsed<BURST_OPEN)clearRadius=.06+1.02*easeOut(elapsed/BURST_OPEN);else if(elapsed<BURST_OPEN+BURST_HOLD)clearRadius=1.08;else clearRadius=.001+1.079*(1-easeIn((elapsed-BURST_OPEN-BURST_HOLD)/BURST_CLOSE));if(now-lastPaint>=33){lastPaint=now;needsPaint=true;}}}
 if(needsPaint)paint();schedule();}
function sync(){if(frame)cancelAnimationFrame(frame);frame=0;if(paused){burstStart=0;burst=[-10,-10];clearRadius=.001;mouse=[-10,-10];nx=0;ny=0;dragX=0;dragY=0;dragging=false;pendingPointer=null;root.classList.remove('yn-sunshine','yn-hovering','yn-dragging');paint();}root.classList.toggle('yn-paused',paused||!visible||document.hidden);root.classList.toggle('yn-user-paused',paused);button.textContent=paused?'▶':'Ⅱ';button.title=button.ariaLabel=paused?'播放動畫':'暫停動畫';button.setAttribute('aria-pressed',String(paused));last=performance.now();layers();schedule();}
button.addEventListener('click',e=>{e.stopPropagation();const wasPaused=paused;paused=!paused;writePause();sync();if(wasPaused&&!paused)playOpening();});
addEventListener('storage',e=>{if(e.key===PAUSE_KEY){const wasPaused=paused;paused=e.newValue==='1';sync();if(wasPaused&&!paused)playOpening();}});document.addEventListener('visibilitychange',()=>{sync();tryInitialOpening();},{passive:true});
function layers(){if(paused){root.style.setProperty('--yn-bg-x','0px');root.style.setProperty('--yn-bg-y','0px');root.style.setProperty('--yn-fg-x','0px');root.style.setProperty('--yn-fg-y','0px');return;}root.style.setProperty('--yn-bg-x',(focusX+nx*-7+dragX*.45)+'px');root.style.setProperty('--yn-bg-y',(ny*-4+dragY*.32)+'px');root.style.setProperty('--yn-fg-x',(focusX*1.55+nx*-17+dragX)+'px');root.style.setProperty('--yn-fg-y',(ny*-9+dragY*.62)+'px');}
function setCaption(text){clearTimeout(captionTimer);caption.classList.add('yn-changing');captionTimer=setTimeout(()=>{caption.textContent=text;caption.classList.remove('yn-changing');},120);}
function burstAt(clientX,clientY){if(paused)return false;const r=root.getBoundingClientRect(),px=clamp((clientX-r.left)/Math.max(1,r.width),0,1),py=clamp((clientY-r.top)/Math.max(1,r.height),0,1);burst=[px,1-py];burstStart=performance.now();clearRadius=.06;root.classList.add('yn-sunshine');schedule();return true;}
function playOpening(){if(paused||!visible||document.hidden)return false;const r=root.getBoundingClientRect();return burstAt(r.left+r.width*.74,r.top+r.height*.30);}
function tryInitialOpening(){if(!initialOpeningPending)return;if(playOpening())initialOpeningPending=false;}
cities.forEach((city,index)=>{
 city.addEventListener('pointerenter',()=>setCaption(city.dataset.caption));
 city.addEventListener('pointerleave',()=>setCaption(selected?selected.dataset.caption:'藍月谷 · 把日子留給山海'));
 city.addEventListener('focus',()=>setCaption(city.dataset.caption));
 city.addEventListener('blur',()=>setCaption(selected?selected.dataset.caption:'藍月谷 · 把日子留給山海'));
 city.addEventListener('click',e=>{e.stopPropagation();selected=city;cities.forEach(c=>c.setAttribute('aria-pressed',String(c===city)));focusX=[12,7,1,-9,-3,12][index];setCaption(city.dataset.caption);layers();const rr=root.getBoundingClientRect();burstAt(rr.left+rr.width*.72,rr.top+rr.height*.30);});
});
root.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')||paused)return;dragging=true;moved=false;startX=e.clientX-dragX;startY=e.clientY-dragY;root.classList.add('yn-dragging');try{root.setPointerCapture(e.pointerId);}catch(_){}});
function flushPointer(){pointerFrame=0;const p=pendingPointer;pendingPointer=null;if(!p)return;const r=root.getBoundingClientRect(),px=clamp((p.x-r.left)/Math.max(1,r.width),0,1),py=clamp((p.y-r.top)/Math.max(1,r.height),0,1);nx=px-.5;ny=py-.5;mouse=[px,1-py];root.style.setProperty('--yn-light-x',(px*100)+'%');root.style.setProperty('--yn-light-y',(py*100)+'%');root.classList.add('yn-hovering');if(dragging){const dx=p.x-startX,dy=p.y-startY;if(Math.abs(dx)>6||Math.abs(dy)>6)moved=true;dragX=clamp((p.x-startX)*.62,-38,38);dragY=clamp((p.y-startY)*.38,-15,15);}layers();if(!burstStart)paint();}
root.addEventListener('pointermove',e=>{if(paused)return;pendingPointer={x:e.clientX,y:e.clientY};if(!pointerFrame)pointerFrame=requestAnimationFrame(flushPointer);},{passive:true});
function release(e){if(!dragging)return;dragging=false;root.classList.remove('yn-dragging');try{if(e&&root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);}catch(_){}const wasTap=!moved;dragX=0;dragY=0;layers();if(wasTap&&e&&!e.target.closest('button'))burstAt(e.clientX,e.clientY);}
root.addEventListener('pointerup',release);root.addEventListener('pointercancel',e=>{moved=true;release(e);});
root.addEventListener('pointerleave',()=>{root.classList.remove('yn-hovering');mouse=[-10,-10];if(!dragging){nx=0;ny=0;layers();}if(!burstStart)paint();});
new ResizeObserver(resize).observe(root);
new IntersectionObserver(e=>{visible=!!(e[0]&&e[0].isIntersecting);sync();tryInitialOpening();},{threshold:0}).observe(root);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gl=null;canvas.hidden=true;});
resize();sync();requestAnimationFrame(tryInitialOpening);
});})();
