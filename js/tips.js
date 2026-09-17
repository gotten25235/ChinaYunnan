/* Tips view owner: renders departure reminders and owns the isolated sun-wish interaction. */
(() => {
  'use strict';

  function create({$,tripData,esc,networkProfile,journeySystem,markRendered,isDev=false}){
    const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const HOLD_MS=8000,RISE_MS=3150,FADE_MS=1300;
    const COUNT_STORAGE_KEY='yunnan-2026-sun-wish-count-v1';

    function readCount(){
      try{
        const raw=localStorage.getItem(COUNT_STORAGE_KEY);
        if(raw===null)return 0;
        const value=Number(raw);
        return Number.isSafeInteger(value)&&value>=0?value:0;
      }catch{return 0;}
    }

    function saveCount(value){
      try{localStorage.setItem(COUNT_STORAGE_KEY,String(value));}catch{}
    }

    let count=readCount(),timer=null,phase='hidden',riseEndsAt=0;

    const card=()=>$('#sun-wish');
    const countLabel=()=>card()?.querySelector('[data-sun-wish-count]');
    const figure=()=>card()?.querySelector('.sun-wish__figure');
    const sun=()=>card()?.querySelector('.sun-wish__sun-symbol');

    function replay(element,className){
      if(!element)return;
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
    }

    function clearLifecycle(){if(timer!==null){clearTimeout(timer);timer=null;}}

    function holdThenFade(riseRemaining){
      clearLifecycle();
      timer=setTimeout(()=>{
        phase='shown';
        timer=setTimeout(()=>{
          const el=card();
          if(!el)return;
          phase='fading';
          el.classList.add('is-fading');
          timer=setTimeout(()=>{
            el.classList.remove('is-sunny','is-fading');
            sun()?.classList.remove('is-glowing');
            phase='hidden';
            timer=null;
          },reduceMotion.matches?0:FADE_MS);
        },HOLD_MS);
      },Math.max(0,riseRemaining));
    }

    function sunWishMarkup(){
      return `<section class="sun-wish" id="sun-wish" aria-label="晴天娃娃祈晴互動區">
        <div class="sun-wish__sky" aria-hidden="true">
          <svg class="sun-wish__cloud sun-wish__cloud--left" viewBox="0 0 120 44" focusable="false"><path d="M12 38C0 38 1 20 15 20C15 2 42 0 49 15C61 5 80 12 80 23C103 14 121 25 111 38Z"/></svg>
          <svg class="sun-wish__cloud sun-wish__cloud--right" viewBox="0 0 120 44" focusable="false"><path d="M12 38C0 38 1 20 15 20C15 2 42 0 49 15C61 5 80 12 80 23C103 14 121 25 111 38Z"/></svg>
          <div class="sun-wish__sun">
            <svg class="sun-wish__sun-symbol" viewBox="0 0 100 100" focusable="false">
              <circle cx="50" cy="50" r="24" fill="#fff"/>
              <g fill="#fff">
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(0 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(30 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(60 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(90 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(120 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(150 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(180 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(210 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(240 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(270 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(300 50 50)"/>
                <path d="M44.2 23L50 2L55.8 23Z" transform="rotate(330 50 50)"/>
              </g>
            </svg>
          </div>
        </div>
        <button class="sun-wish__button" type="button" data-sun-wish aria-label="點一下晴天娃娃祈晴" aria-describedby="sun-wish-count">
          <span class="sun-wish__float"><span class="sun-wish__figure">
            <svg class="sun-wish__doll" viewBox="0 0 88 116" aria-hidden="true" focusable="false">
              <path d="M35 46C31 57 30 76 20 99C24 105 30 100 35 104C40 110 46 103 52 106C58 108 62 101 68 101C59 80 56 60 52 46Z" fill="#fff" stroke="#84998c" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M36 57C34 73 31 88 29 97 M47 61C47 77 51 91 53 100 M55 76L60 96" fill="none" stroke="#d3ded4" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M53 55C54 73 61 93 65 99L58 102C54 83 51 68 50 57Z" fill="#edf1eb"/>
              <path d="M37 6C46 3 59 8 63 18C65 23 63 26 63 28C67 25 69 28 66 32C65 34 63 35 62 34C62 40 59 45 53 47C47 49 45 47 41 47C32 47 24 42 23 34C22 28 26 19 29 13C31 9 34 7 37 6Z" fill="#fff" stroke="#7f9084" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M30 13C32 5 41 3 48 5C60 7 66 15 65 25L62 35L59 35L60 23L58 17L54 18L52 14L47 16L45 12L40 14L39 10L35 12L34 8Z" fill="#373b39"/>
              <path d="M37 18Q40 15 43 18 M48 18Q51 21 55 17" fill="none" stroke="#424e46" stroke-width="1.2" stroke-linecap="round"/>
              <ellipse cx="39" cy="24" rx="3.1" ry="4.5" fill="#fff" stroke="#424e46" stroke-width="1.15" transform="rotate(15 39 24)"/>
              <ellipse cx="40" cy="25" rx="1.2" ry="1.7" fill="#343d36"/>
              <ellipse cx="51" cy="25" rx="1.8" ry="2.2" fill="#343d36"/>
              <ellipse cx="43" cy="32" rx="7.2" ry="4.6" fill="#fff" stroke="#424e46" stroke-width="1.2" transform="rotate(10 43 32)"/>
              <path d="M31 34Q29 37 34 40 M37 42Q45 45 54 40 M42 37L43 39" fill="none" stroke="#424e46" stroke-width="1.15" stroke-linecap="round"/>
              <path d="M35 47Q44 50 53 47" fill="none" stroke="#b65250" stroke-width="3" stroke-linecap="round"/>
              <path d="M48 49L53 56 M49 49L48 58" fill="none" stroke="#b65250" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span></span>
        </button>
        <div class="sun-wish__copy"><h3>一路放晴 ☀️</h3><p>雲散一點，陽光多一點。</p><p class="sun-wish__count" id="sun-wish-count" role="status" aria-live="polite" aria-atomic="true">點一下祈晴 · 已祈晴 <span data-sun-wish-count>${count}</span> 次</p></div>
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
      markRendered('tips');
    }

    function handleAction(button){
      if(!button?.hasAttribute('data-sun-wish'))return false;
      const el=card(),label=countLabel(),doll=figure(),sunSymbol=sun();
      if(!el||!label||!doll||!sunSymbol)return true;
      count+=1;
      saveCount(count);
      label.textContent=String(count);
      replay(doll,'is-praying');
      if(phase==='hidden'){
        void el.offsetWidth;
        el.classList.add('is-sunny');
        phase='rising';
        riseEndsAt=performance.now()+(reduceMotion.matches?0:RISE_MS);
      }else{
        replay(sunSymbol,'is-glowing');
        el.classList.remove('is-fading');
        if(phase==='fading')phase='shown';
      }
      holdThenFade(phase==='rising'?Math.max(0,riseEndsAt-performance.now()):0);
      return true;
    }

    function cleanup(){clearLifecycle();}

    return {render,handleAction,cleanup};
  }

  window.YunnanTipsSystem=Object.freeze({create});
})();
