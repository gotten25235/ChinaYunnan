/* Tips view owner: renders departure reminders and owns the isolated sun-wish interaction. */
(() => {
  'use strict';

  function create({$,tripData,esc,networkProfile,journeySystem,markRendered,isDev=false}){
    const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const COUNT_STORAGE_KEY='yunnan-2026-sun-wish-count-v1';
    const CYCLE_LENGTH=7n;

    function cycleStep(taps){
      return taps>0n?Number(((taps-1n)%CYCLE_LENGTH)+1n):0;
    }

    function readCounter(key){
      try{
        const raw=localStorage.getItem(key);
        return /^\d+$/.test(raw||'')?BigInt(raw):0n;
      }catch{return 0n;}
    }

    function saveCounter(key,value){
      try{localStorage.setItem(key,String(value));}catch{}
    }

    let count=readCounter(COUNT_STORAGE_KEY);
    let sceneTaps=0n;
    let sunTimer=null,effectTimer=null,frame=null,segment=null;
    let sunState='hidden',progress=0,sunOpacity=0;
    const feedback=new Map();

    const card=()=>$('#sun-wish');
    const countLabel=()=>card()?.querySelector('[data-sun-wish-count]');
    const statusLabel=()=>card()?.querySelector('.sun-wish__stats');
    const button=()=>card()?.querySelector('[data-sun-wish]');
    const sun=()=>card()?.querySelector('.sun-wish__sun');
    const sunFigure=()=>card()?.querySelector('.sun-wish__sun-symbol');
    const skyResponse=()=>card()?.querySelector('.sun-wish__sky-response');

    function updateStats(){
      const countNode=countLabel(),stats=statusLabel();
      if(countNode)countNode.textContent=String(count);
      if(stats)stats.setAttribute('aria-label',`祈晴紀錄 ${count} 次；純趣味計數`);
    }

    function renderSun(){
      const el=card(),sunNode=sun();
      if(!el||!sunNode)return;
      sunNode.style.visibility=sunState==='hidden'?'hidden':'visible';
      sunNode.style.opacity=String(sunOpacity);
      sunNode.style.transform=`translateY(${reduceMotion.matches?0:240*(1-progress)}px)`;
      el.style.setProperty('--sunlight',String(progress*sunOpacity));
      el.style.setProperty('--light-reach',`${36+progress*54}%`);
      const tapsForWhiteout=sceneTaps>=20n?1:Number(sceneTaps)/20;
      const whiteout=tapsForWhiteout*progress*sunOpacity;
      el.style.setProperty('--whiteout',String(whiteout));
      el.classList.toggle('is-bright',whiteout>.45);
    }

    function finishScene(){
      const el=card();
      sunState='hidden';
      sceneTaps=0n;
      clearTimeout(effectTimer);
      effectTimer=null;
      el?.classList.remove('wish-active','is-happy','is-full-sun','clouds-cleared','is-bright');
      el?.style.setProperty('--push-distance','0px');
      renderSun();
    }

    function holdSun(){
      sunState='holding';
      clearTimeout(sunTimer);
      sunTimer=setTimeout(()=>animateSun('fade',1,0,1000),3000);
    }

    function sampleSun(now){
      if(!segment)return;
      const active=segment;
      const t=Math.max(0,Math.min(1,(now-active.start)/active.duration));
      const eased=1-Math.pow(1-t,2);
      progress=active.fromProgress+(active.toProgress-active.fromProgress)*eased;
      sunOpacity=active.fromOpacity+(active.toOpacity-active.fromOpacity)*eased;
      if(t===1){
        segment=null;
        if(active.kind==='fade')finishScene();
        else holdSun();
      }
      renderSun();
    }

    function tick(now){
      frame=null;
      sampleSun(now);
      if(segment)frame=requestAnimationFrame(tick);
    }

    function animateSun(kind,toProgress,toOpacity,duration){
      if(frame!==null)cancelAnimationFrame(frame);
      frame=null;
      clearTimeout(sunTimer);
      sunTimer=null;
      sunState=kind==='fade'?'fading':kind==='rise'?'rising':'restoring';
      if(reduceMotion.matches){
        segment=null;
        progress=toProgress;
        sunOpacity=toOpacity;
        if(kind==='fade')finishScene();
        else holdSun();
        renderSun();
        return;
      }
      segment={kind,fromProgress:progress,fromOpacity:sunOpacity,toProgress,toOpacity,start:performance.now(),duration};
      renderSun();
      frame=requestAnimationFrame(tick);
    }

    function showSun(){
      const now=performance.now();
      sampleSun(now);
      if(sunState==='rising'&&segment){
        const remaining=Math.max(1,segment.start+segment.duration-now);
        animateSun('rise',1,1,Math.min(remaining,Math.max(120,remaining*.58)));
      }else if(sunState==='hidden'){
        progress=0;
        sunOpacity=0;
        animateSun('rise',1,1,2000);
      }else if(sunState==='fading'||sunState==='restoring'){
        animateSun('restore',1,1,240);
      }else{
        holdSun();
      }
    }

    function playFeedback(key,node,keyframes,duration){
      const previous=feedback.get(key);
      if(previous){previous.cancel();feedback.delete(key);}
      if(reduceMotion.matches||!node||typeof node.animate!=='function')return;
      const animation=node.animate(keyframes,{duration,easing:'ease-out'});
      feedback.set(key,animation);
      animation.onfinish=()=>{if(feedback.get(key)===animation)feedback.delete(key);};
    }

    function clearScene(){
      clearTimeout(sunTimer);
      clearTimeout(effectTimer);
      sunTimer=effectTimer=null;
      if(frame!==null)cancelAnimationFrame(frame);
      frame=null;
      segment=null;
      feedback.forEach(animation=>animation.cancel());
      feedback.clear();
      sunState='hidden';
      progress=0;
      sunOpacity=0;
      sceneTaps=0n;
      const el=card();
      el?.classList.remove('wish-active','is-happy','is-full-sun','clouds-cleared','is-bright');
      el?.style.setProperty('--push-distance','0px');
      renderSun();
    }

    function sunWishMarkup(){
      return `<section class="sun-wish" id="sun-wish" aria-label="晴天娃娃祈晴互動區">
        <div class="sun-wish__sky" aria-hidden="true">
          <div class="sun-wish__cloud sun-wish__cloud--one"></div>
          <div class="sun-wish__cloud sun-wish__cloud--two"></div>
          <div class="sun-wish__cloud sun-wish__cloud--three"></div>
          <div class="sun-wish__sky-response"></div>
          <div class="sun-wish__sun">
            <svg class="sun-wish__sun-symbol" viewBox="0 0 100 100" focusable="false">
              <circle cx="50" cy="50" r="24" fill="#fff"/>
              <g fill="#fff">
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(0 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(30 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(60 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(90 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(120 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(150 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(180 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(210 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(240 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(270 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(300 50 50)"/><path d="M44.2 23L50 2L55.8 23Z" transform="rotate(330 50 50)"/>
              </g>
            </svg>
          </div>
        </div>
        <button class="sun-wish__button" type="button" data-sun-wish aria-label="點一下晴天娃娃祈晴" aria-describedby="sun-wish-message sun-wish-stats">
          <span class="sun-wish__float"><span class="sun-wish__figure">
            <svg class="sun-wish__doll" viewBox="0 0 88 116" aria-hidden="true" focusable="false">
              <path d="M35 46C31 57 30 76 20 99C24 105 30 100 35 104C40 110 46 103 52 106C58 108 62 101 68 101C59 80 56 60 52 46Z" fill="#fff" stroke="var(--sun-wish-figure-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M36 57C34 73 31 88 29 97 M47 61C47 77 51 91 53 100 M55 76L60 96" fill="none" stroke="var(--sun-wish-figure-fold)" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M53 55C54 73 61 93 65 99L58 102C54 83 51 68 50 57Z" fill="#edf1eb"/>
              <path d="M37 6C46 3 59 8 63 18C65 23 63 26 63 28C67 25 69 28 66 32C65 34 63 35 62 34C62 40 59 45 53 47C47 49 45 47 41 47C32 47 24 42 23 34C22 28 26 19 29 13C31 9 34 7 37 6Z" fill="#fff" stroke="var(--sun-wish-face-stroke)" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M30 13C32 5 41 3 48 5C60 7 66 15 65 25L62 35L59 35L60 23L58 17L54 18L52 14L47 16L45 12L40 14L39 10L35 12L34 8Z" fill="var(--sun-wish-hair)"/>
              <g class="sun-wish__normal-face">
                <ellipse cx="39" cy="24" rx="3.1" ry="4.5" fill="#fff" stroke="var(--sun-wish-detail)" stroke-width="1.15" transform="rotate(15 39 24)"/>
                <ellipse cx="40" cy="25" rx="1.2" ry="1.7" fill="#343d36"/>
                <ellipse cx="51" cy="25" rx="1.8" ry="2.2" fill="#343d36"/>
                <ellipse cx="43" cy="32" rx="7.2" ry="4.6" fill="#fff" stroke="var(--sun-wish-detail)" stroke-width="1.2" transform="rotate(10 43 32)"/>
                <path d="M31 34Q29 37 34 40 M37 42Q45 45 54 40 M42 37L43 39" fill="none" stroke="var(--sun-wish-detail)" stroke-width="1.15" stroke-linecap="round"/>
              </g>
              <g class="sun-wish__happy-face" fill="none" stroke="var(--sun-wish-detail)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M35.5 25Q39 20 42.5 25M47.5 25Q51 20 54.5 25"/>
                <path d="M38.5 35Q45 42.5 52 35"/>
              </g>
              <path d="M35 47Q44 50 53 47" fill="none" stroke="var(--sun-wish-accent)" stroke-width="3" stroke-linecap="round"/>
              <path d="M48 49L53 56 M49 49L48 58" fill="none" stroke="var(--sun-wish-accent)" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span></span>
        </button>
        <div class="sun-wish__copy">
          <h3>一路放晴 ☀️</h3>
          <p id="sun-wish-message">雲散一點，陽光多一點。</p>
        </div>
        <div class="sun-wish__stats" id="sun-wish-stats" role="status" aria-live="polite" aria-atomic="true" aria-label="祈晴紀錄 ${count} 次；純趣味計數">
          <span class="sun-wish__stat" title="祈晴紀錄（純趣味）"><span aria-hidden="true">🙏</span><strong data-sun-wish-count>${count}</strong></span>
        </div>
        <div class="sun-wish__credit" aria-label="晴天娃娃圖片來源"><a href="https://media.teepr.com/wp-content/uploads/2022/02/DfKZUI4V4AA97g-.jpg" target="_blank" rel="noopener noreferrer">圖片參考 ↗</a>${isDev?' <span aria-hidden="true">·</span> <a href="https://www.teepr.com/514733/sharonlian/%E6%99%B4%E5%A4%A9%E5%A8%83%E5%A8%83/" target="_blank" rel="noopener noreferrer">來源頁 ↗</a>':''}</div>
      </section>`;
    }

    function sourceMarkup(source){
      const title=source.url?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`:esc(source.title);
      return `<li>${title}${source.note?`<p class="small">${esc(source.note)}</p>`:''}</li>`;
    }

    function render(){
      const mainland=networkProfile.isMainland();
      const root=$('#tips-content');
      if(!root)return;
      root.innerHTML=`${sunWishMarkup()}<div class="content-grid">${tripData.tips.map(t=>`<article class="utility-card utility-card--tip"><h3>${esc(t.title)}</h3><p class="description">${esc(t.text)}</p>${t.source?`<a class="small" href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">官方說明 ↗</a>`:''}</article>`).join('')}</div>${journeySystem.flightBlock('outbound')}${journeySystem.flightBlock('inbound')}<details class="photo-sources tips-sources-disclosure"><summary>內容來源與查核</summary>${mainland?'<p class="small network-source-note">大陸版仍保留原始來源 URL 作查核紀錄；Google、Instagram、Wikimedia 等外部來源在中國大陸可能無法直接開啟，但不影響已打包的主要行程內容。</p>':''}<ul class="source-list">${tripData.sources.filter(source=>isDev||!source.devOnly).map(sourceMarkup).join('')}</ul></details>`;
      updateStats();
      renderSun();
      markRendered('tips');
    }

    function handleAction(actionButton){
      if(!actionButton?.hasAttribute('data-sun-wish'))return false;
      const el=card(),wishButton=button(),sunSymbol=sunFigure(),response=skyResponse();
      if(!el||!wishButton||!sunSymbol)return true;

      sampleSun(performance.now());
      if(sunState==='hidden')clearScene();

      count+=1n;
      sceneTaps+=1n;
      const step=cycleStep(count);
      saveCounter(COUNT_STORAGE_KEY,count);
      updateStats();
      showSun();
      renderSun();
      el.classList.add('wish-active');

      clearTimeout(effectTimer);
      effectTimer=null;
      el.classList.remove('is-happy','is-full-sun','clouds-cleared');
      let effectDuration=0;
      if(step===3){
        el.classList.add('is-happy');
        effectDuration=2200;
      }else if(step===5){
        el.classList.add('is-happy','is-full-sun');
        effectDuration=2500;
      }else if(step===7){
        el.classList.add('is-happy','is-full-sun','clouds-cleared');
        effectDuration=3000;
      }
      if(effectDuration){
        effectTimer=setTimeout(()=>{
          el.classList.remove('is-happy','is-full-sun','clouds-cleared');
          effectTimer=null;
        },effectDuration);
      }

      el.style.setProperty('--push-distance',`${sceneTaps>=30n?120:Number(sceneTaps)*4}px`);

      playFeedback('doll',wishButton,[
        {transform:'translateY(0) rotate(0deg)'},
        {transform:'translateY(-7px) rotate(-4deg)',offset:.3},
        {transform:'translateY(-2px) rotate(3deg)',offset:.65},
        {transform:'translateY(0) rotate(0deg)'}
      ],720);
      const sunPulse=step===1?1.18:step===5||step===7?1.13:step===3?1.09:1.055;
      playFeedback('sun',sunSymbol,[
        {transform:'scale(1)'},
        {transform:`translateY(-3px) scale(${sunPulse})`,offset:.35},
        {transform:'scale(1)'}
      ],step===1?720:step===7?620:440);
      const skyFlash=step===7?.3:step===5?.26:step===1?.18:step===3?.14:.09;
      playFeedback('sky',response,[
        {opacity:0},{opacity:skyFlash,offset:.35},{opacity:0}
      ],step===7?1100:step===5?900:step===1?820:650);
      return true;
    }

    function cleanup(){
      clearTimeout(sunTimer);
      clearTimeout(effectTimer);
      if(frame!==null)cancelAnimationFrame(frame);
      feedback.forEach(animation=>animation.cancel());
      feedback.clear();
      sunTimer=effectTimer=null;
      frame=null;
      segment=null;
    }

    return {render,handleAction,cleanup};
  }

  window.YunnanTipsSystem=Object.freeze({create});
})();
