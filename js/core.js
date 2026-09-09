/* Core services shared by domain modules: photos, preferences, favorites, date rails and utilities. */
(() => {
  'use strict';

  function createPhotoSystem({photos, esc, networkProfile=null}){
    const get=id=>{const base=id&&photos[id]?photos[id]:null;return base||null;};
    const badgeFor=item=>{const match=item?.photoMatch||'';if(match==='representative'||match==='illustrative')return '示意圖';if(match==='context')return '背景圖';return '';};
    const img=(photo,{alt=null,loading='lazy',className='',draggable=false}={})=>{
      if(!photo)return '';
      const klass=className?` class="${esc(className)}"`:'';
      const drag=draggable===false?' draggable="false"':'';
      const fetchPriority=loading==='eager'?'high':'low';
      return `<img data-photo-managed="1" src="${esc(photo.src)}"${klass} alt="${esc(alt===null?photo.alt:alt)}" loading="${esc(loading)}" fetchpriority="${fetchPriority}" decoding="async"${drag} width="${photo.width}" height="${photo.height}">`;
    };
    const thumbnail=(place,className='item-thumbnail')=>{
      if(!place)return '';
      const classes=[...new Set(['item-thumbnail',...(className||'').split(/\s+/).filter(Boolean)])].join(' ');
      const photo=get(place.photoId);
      if(!photo)return `<span class="${classes} item-thumbnail-empty" aria-label="無此圖"><span class="photo-missing-label">無此圖</span></span>`;
      return `<span class="${classes}">${img(photo,{alt:''})}${badgeFor(place)?`<span class="photo-type-badge">${esc(badgeFor(place))}</span>`:''}</span>`;
    };
    const figure=(id,className='card-photo')=>{
      const photo=get(id);
      if(!photo)return `<figure class="${className} photo-missing"><div class="photo-missing-box"><span>無此圖</span></div><figcaption>無此圖</figcaption></figure>`;
      const source=photo.source?`<a href="${esc(photo.source)}" target="_blank" rel="noopener noreferrer">${esc(photo.author||'來源')}</a>`:esc(photo.author||'');
      const license=photo.licenseUrl?`<a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license||'授權')}</a>`:esc(photo.license||'');
      return `<figure class="${className}">${img(photo)}<figcaption>${esc(photo.caption)}${source?` · ${source}`:''}${license?` / ${license}`:''}${photo.changes?` · ${esc(photo.changes)}`:''}</figcaption></figure>`;
    };
    const cardFigure=(id,className='card-photo',badge='')=>{
      const photo=get(id);
      if(!photo)return `<figure class="${className} card-photo-visual photo-missing"><div class="photo-missing-box"><span>無此圖</span></div></figure>`;
      return `<figure class="${className} card-photo-visual">${img(photo)}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}</figure>`;
    };
    const readerFigure=(id,className='content-reader-photo',badge='')=>{
      const photo=get(id);
      if(!photo)return `<figure class="${className} photo-missing"><div class="content-reader-media-frame photo-missing-box"><span>無此圖</span></div><figcaption>無此圖</figcaption></figure>`;
      const source=photo.source?`<a href="${esc(photo.source)}" target="_blank" rel="noopener noreferrer">${esc(photo.author||'來源')}</a>`:esc(photo.author||'');
      const license=photo.licenseUrl?`<a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license||'授權')}</a>`:esc(photo.license||'');
      return `<figure class="${className}"><div class="content-reader-media-frame">${img(photo,{loading:'eager'})}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}</div><figcaption>${esc(photo.caption)}${source?` · ${source}`:''}${license?` / ${license}`:''}${photo.changes?` · ${esc(photo.changes)}`:''}</figcaption></figure>`;
    };
    const mapCard=(id,badge='')=>{const photo=get(id);return photo?`<div class="map-card-photo">${img(photo)}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}<span class="map-card-photo-credit">Photo · ${esc(photo.author)}</span></div>`:`<div class="map-card-photo map-card-photo-empty"><span class="photo-missing-label">無此圖</span></div>`;};
    const mapStrip=(id,badge='')=>{const photo=get(id);return photo?`<span class="map-strip-photo">${img(photo)}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}</span>`:`<span class="map-strip-photo map-strip-photo-empty"><span class="photo-missing-label">無此圖</span></span>`;};
    const mapDetail=(id,badge='')=>{const photo=get(id);return photo?`<div class="map-detail-photo">${img(photo,{loading:'eager'})}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}<span class="map-detail-photo-credit">Photo · ${esc(photo.author)}</span></div>`:`<div class="map-detail-photo map-strip-photo-empty"><span class="photo-missing-label">無此圖</span></div>`;};
    const storyThumb=(id,badge='')=>{const photo=get(id);return photo?`<span class="day-story-photo">${img(photo)}${badge?`<span class="photo-type-badge">${esc(badge)}</span>`:''}<small>Photo · ${esc(photo.author)}</small></span>`:`<span class="day-story-photo day-story-photo-empty"><span class="photo-missing-label">無此圖</span></span>`;};
    const itineraryVisual=id=>get(id);
    const installErrorHandler=()=>{
      if(document.documentElement.dataset.photoErrorHandlerReady==='1')return;
      document.documentElement.dataset.photoErrorHandlerReady='1';
      document.addEventListener('error', e=>{
        const image=e.target;if(!(image instanceof HTMLImageElement)||!image.dataset.photoManaged)return;
        const slot=image.parentElement;if(!slot)return;image.remove();slot.querySelectorAll('.map-card-photo-credit,.map-detail-photo-credit,small').forEach(el=>el.remove());
        if(slot.classList.contains('content-reader-media-frame')){slot.classList.add('photo-load-error');if(!slot.querySelector('.photo-missing-label'))slot.insertAdjacentHTML('afterbegin','<span class="photo-missing-label">無此圖</span>');const figureEl=slot.closest('figure');if(figureEl){figureEl.classList.add('photo-missing');const cap=figureEl.querySelector('figcaption');if(cap)cap.textContent='無此圖';}}
        else if(slot.tagName==='FIGURE'){slot.classList.add('photo-missing');if(!slot.querySelector('.photo-missing-box'))slot.insertAdjacentHTML('afterbegin','<div class="photo-missing-box"><span>無此圖</span></div>');const cap=slot.querySelector('figcaption');if(cap)cap.textContent='無此圖';}
        else{slot.classList.add('photo-load-error');if(!slot.querySelector('.photo-missing-label'))slot.insertAdjacentHTML('afterbegin','<span class="photo-missing-label">無此圖</span>');}
      },true);
    };
    return {get,img,badgeFor,thumbnail,figure,cardFigure,readerFigure,mapCard,mapStrip,mapDetail,storyThumb,itineraryVisual,installErrorHandler};
  }

  function createTravelUtils({tripData,items,esc=v=>String(v??'')}){
    const category=p=>tripData.categories[p.type];
    const hasCoords=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng);
    const stars=n=>n?'★'.repeat(n)+'☆'.repeat(5-n):'既定安排';
    const hotelGradeLabel=p=>p?.type==='hotel'?(p.hotelGrade||'手冊未註明星級'):'';
    const iconSvg=type=>({
      itinerary:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19.5h17M5.5 18l3.2-7 2.3 4 3.5-9 4 11.5M7 8.5l2-2 1.5 1.5"/></svg>',hotel:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5V9.5h16v9M4 14h16M7 9.5V6h4.5a2 2 0 0 1 2 2v1.5M6.5 18.5v2M17.5 18.5v2"/></svg>',night:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 15.5A8 8 0 0 1 8.5 5a7 7 0 1 0 10.5 10.5Z"/></svg>',food:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v7M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 10v11M16 3v18M16 3c3 2 3 7 0 9"/></svg>',shopping:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h14l-1 12H6l-1-12ZM9 9V7a3 3 0 0 1 6 0v2"/></svg>',photo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l1.3-2h5.4L16 8h4v11H4V8Z"/><circle cx="12" cy="13.5" r="3.2"/></svg>'
    }[type]||'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>');
    const placeHours=p=>{let value=p?.openingHours||'';if(!value&&p?.type==='night'&&/^\s*\d{1,2}:\d{2}\s*[–—~-]\s*\d{1,2}:\d{2}\s*$/.test(p.time||''))value=p.time;value=String(value||'').trim();if(!value||/^(24\s*(hr|hrs|h|小時)|全天|24\/7)$/i.test(value))return '';return value.replace(/[–—-]/g,'~').replace(/\s+/g,'');};
    const detailValue=(label,value,wide=false)=>value===undefined||value===null||value===''?'':`<div class="map-detail-row${wide?' wide':''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    const hotelDistanceValue=(p,d=null)=>{
      if(!p||p.type!=='night')return '';
      const byDay=p.hotelDistanceByDay||{},dayKey=d?.day!==undefined&&d?.day!==null?String(d.day):'';
      if(dayKey&&byDay[dayKey])return byDay[dayKey];const entries=Object.entries(byDay);
      if(entries.length===1)return entries[0][1];if(entries.length>1){const unique=[...new Set(entries.map(([,value])=>value))];if(unique.length===1)return unique[0];return entries.map(([day,value])=>`Day ${day}：${value}`).join('；');}
      if(p.hotelDistance)return p.hotelDistance;if(p.distanceNote)return String(p.distanceNote).replace(/^住宿(?:附近|旁|門口)?[：:]?\s*/,'')||p.distanceNote;
      const hotel=items[d?.hotel];if(hotel&&hasCoords(hotel)&&hasCoords(p)){const rad=n=>n*Math.PI/180,a=Math.sin(rad(p.lat-hotel.lat)/2)**2+Math.cos(rad(hotel.lat))*Math.cos(rad(p.lat))*Math.sin(rad(p.lng-hotel.lng)/2)**2;return `直線約 ${(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1)} km（非步行距離）`;}
      return '待確認';
    };
    const hotelDistanceCardValue=(p,d=null)=>{const raw=String(hotelDistanceValue(p,d)||'').trim();if(!raw)return '待確認';const normalized=raw.replace(/,/g,'').replace(/[－—~～至]/g,'–');const range=normalized.match(/(\d+(?:\.\d+)?)\s*–\s*(\d+(?:\.\d+)?)\s*(km|公里|m|米)?/i);if(range){let a=Number(range[1]),b=Number(range[2]);const unit=(range[3]||'').toLowerCase();if(unit==='m'||unit==='米'){a/=1000;b/=1000;}return `約 ${a.toFixed(2)}–${b.toFixed(2)}km`;}const single=normalized.match(/(\d+(?:\.\d+)?)\s*(km|公里|m|米)/i);if(single){let value=Number(single[1]);const unit=single[2].toLowerCase();if(unit==='m'||unit==='米')value/=1000;return `約 ${value.toFixed(2)}km`;}return /待確認/.test(raw)?'待確認':raw;};
    const flightAirlineLabel=f=>{const name=f.airline||(String(f.flight||'').startsWith('CX')?'國泰航空':String(f.flight||'').startsWith('MU')?'中國東方航空':'航空公司');return name==='中國東方航空'?'東方航空':name;};
    const flightDisplayNo=f=>f.flightNo||f.flight||'';
    const flightLabelText=f=>`${flightAirlineLabel(f)} ${flightDisplayNo(f)}`.trim();
    return {category,hasCoords,stars,hotelGradeLabel,iconSvg,placeHours,detailValue,hotelDistanceValue,hotelDistanceCardValue,flightAirlineLabel,flightDisplayNo,flightLabelText};
  }

  function createFavoritesStore({items,storageKey='yunnan-2026-favorites-v1'}){
    let ids=new Set(),storageAvailable=true;
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))ids=new Set(saved.filter(id=>typeof id==='string'&&items[id]));}catch{storageAvailable=false;}
    const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify([...ids]));storageAvailable=true;}catch{storageAvailable=false;}return storageAvailable;};
    return {has:id=>ids.has(id),values:()=>[...ids],size:()=>ids.size,toggle(id){if(!items[id])return {changed:false,saved:false,storageAvailable};if(ids.has(id))ids.delete(id);else ids.add(id);persist();return {changed:true,saved:ids.has(id),storageAvailable};},isStorageAvailable:()=>storageAvailable};
  }

  function createNavigationService({tripData,items,esc,storageKey='yunnan-2026-map-provider-v1'}){
    let provider=tripData.navigation?.defaultProvider==='google'?'google':'amap',storageAvailable=true;
    try{const saved=localStorage.getItem(storageKey);if(saved==='amap'||saved==='google')provider=saved;}catch{storageAvailable=false;}
    const name=value=>value==='google'?'Google 地圖':'高德地圖';
    const linkFor=(p,value=provider)=>{const keyword=String(p.address||`${p.city||''} ${p.name||''}`).trim();if(value==='google')return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(keyword);const params=new URLSearchParams({keyword,view:'map',src:'yunnan-slow-trip',callnative:'1'});if(p.city)params.set('city',p.city);return 'https://uri.amap.com/search?'+params.toString();};
    const attrs=p=>`href="${esc(linkFor(p))}" data-nav-id="${esc(p.id)}" data-nav-provider="${esc(provider)}" target="_blank" rel="noopener noreferrer"`;
    const sync=()=>{document.querySelectorAll('[data-map-provider-select]').forEach(select=>{select.value=provider;});document.querySelectorAll('[data-nav-id]').forEach(link=>{const p=items[link.dataset.navId];if(!p)return;link.href=linkFor(p);link.dataset.navProvider=provider;const label=link.querySelector('[data-nav-label]');if(label)label.textContent=name(provider)+'導航';link.title=`使用${name(provider)}開啟`;});};
    const set=(value)=>{if(value!=='amap'&&value!=='google')return false;provider=value;try{localStorage.setItem(storageKey,provider);storageAvailable=true;}catch{storageAvailable=false;}sync();return true;};
    return {get:()=>provider,name,linkFor,attrs,sync,set,isStorageAvailable:()=>storageAvailable};
  }

  function createDateRailController({tripData,esc,$,todayDay}){
    const states=new WeakMap(),dataAttr=name=>name.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
    const weekday=d=>{try{const wd=new Intl.DateTimeFormat('zh-TW',{weekday:'short',timeZone:tripData.timezone}).format(new Date(d.date+'T12:00:00')).replace(/^週|^星期/,'');return wd?`(${wd})`:'';}catch{return '';}};
    const sync=(railOrSelector,center=false,behavior='auto')=>{const rail=typeof railOrSelector==='string'?$(railOrSelector):railOrSelector,state=rail?states.get(rail):null;if(!rail||!state)return;const value=String(state.getValue()),attr=dataAttr(state.key);rail.querySelectorAll(`[data-${attr}]`).forEach(card=>{const active=card.dataset[state.key]===value;card.classList.toggle('active',active);card.setAttribute('aria-selected',String(active));if(active)card.setAttribute('aria-current','date');else card.removeAttribute('aria-current');});if(!center)return;const card=rail.querySelector(`[data-${attr}="${CSS.escape(value)}"]`);if(!card)return;state.programmaticUntil=performance.now()+380;const left=card.offsetLeft-(rail.clientWidth-card.offsetWidth)/2;rail.scrollTo({left:Math.max(0,Math.min(rail.scrollWidth-rail.clientWidth,left)),behavior});};
    const build=({railSelector,key,navKey,allSmall,getValue,setValue,step})=>{const rail=$(railSelector);if(!rail)return;let state=states.get(rail);if(!state){state={key,navKey,allSmall,getValue,setValue,step,timer:null,programmaticUntil:0};states.set(rail,state);rail.addEventListener('scroll',()=>{if(performance.now()<state.programmaticUntil)return;clearTimeout(state.timer);state.timer=setTimeout(()=>{if(performance.now()<state.programmaticUntil)return;const attr=dataAttr(state.key),cards=[...rail.querySelectorAll(`[data-${attr}]`)];if(!cards.length)return;const center=rail.scrollLeft+rail.clientWidth/2;let nearest=cards[0],distance=Infinity;cards.forEach(card=>{const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-center);if(delta<distance){distance=delta;nearest=card;}});const value=nearest.dataset[state.key];if(value!==String(state.getValue()))state.setValue(value,{center:true,behavior:'smooth'});else sync(rail,true,'smooth');},150);},{passive:true});rail.addEventListener('wheel',event=>{if(rail.scrollWidth<=rail.clientWidth||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;const max=rail.scrollWidth-rail.clientWidth;if((event.deltaY<0&&rail.scrollLeft<=1)||(event.deltaY>0&&rail.scrollLeft>=max-1))return;event.preventDefault();rail.scrollLeft+=event.deltaY;},{passive:false});rail.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();state.step(event.key==='ArrowLeft'?-1:1);});const control=rail.closest('.map-date-control');control?.addEventListener('click',event=>{const attr=dataAttr(state.key),navAttr=dataAttr(state.navKey),card=event.target.closest?.(`[data-${attr}]`),nav=event.target.closest?.(`[data-${navAttr}]`);if(!(card&&rail.contains(card))&&!(nav&&control.contains(nav)))return;event.stopPropagation();if(card&&rail.contains(card)){state.setValue(card.dataset[state.key],{center:true,behavior:'smooth'});return;}state.step(nav.dataset[state.navKey]==='prev'?-1:1);});}else{clearTimeout(state.timer);Object.assign(state,{key,navKey,allSmall,getValue,setValue,step,programmaticUntil:0});}const attr=dataAttr(state.key);rail.innerHTML=`<button type="button" class="map-date-card utility-card utility-card--date" data-${attr}="all" role="option"><strong>全部</strong><b>8 DAYS</b><small>${esc(allSmall)}</small></button>`+tripData.days.map(d=>`<button type="button" class="map-date-card utility-card utility-card--date" data-${attr}="${d.day}" role="option"><strong>${esc(d.date.slice(5).replace('-','/'))}<i>${esc(weekday(d))}</i></strong><b>DAY ${String(d.day).padStart(2,'0')}</b><small>${esc(d.city)}${todayDay?.day===d.day?' · 今天':''}</small></button>`).join('');sync(rail,false);};
    return {build,sync};
  }

  function bindHorizontalScroller(el,{mouseDrag=true,wheel=true}={}){
    if(!el||el.dataset.horizontalScrollerReady==='1')return;el.dataset.horizontalScrollerReady='1';let pointerId=null,startX=0,startY=0,startLeft=0,dragging=false,suppressClickUntil=0;
    const finish=()=>{if(pointerId===null)return;if(dragging){suppressClickUntil=performance.now()+260;el.classList.remove('is-dragging');try{if(el.hasPointerCapture?.(pointerId))el.releasePointerCapture(pointerId);}catch{}}pointerId=null;dragging=false;};
    if(wheel)el.addEventListener('wheel',event=>{if(el.scrollWidth<=el.clientWidth||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;const max=el.scrollWidth-el.clientWidth;if((event.deltaY<0&&el.scrollLeft<=1)||(event.deltaY>0&&el.scrollLeft>=max-1))return;event.preventDefault();el.scrollLeft+=event.deltaY;},{passive:false});
    if(!mouseDrag)return;el.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.pointerType==='pen'||(event.button!==undefined&&event.button!==0))return;pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;startLeft=el.scrollLeft;dragging=false;},{passive:true});el.addEventListener('pointermove',event=>{if(pointerId===null||event.pointerId!==pointerId)return;const dx=event.clientX-startX,dy=event.clientY-startY;if(!dragging){if(Math.abs(dx)<8||Math.abs(dx)<=Math.abs(dy)*1.08)return;dragging=true;el.classList.add('is-dragging');try{el.setPointerCapture?.(pointerId);}catch{}}event.preventDefault();el.scrollLeft=startLeft-dx;},{passive:false});el.addEventListener('pointerup',finish,{passive:true});el.addEventListener('pointercancel',finish,{passive:true});el.addEventListener('lostpointercapture',finish,{passive:true});el.addEventListener('click',event=>{if(performance.now()>suppressClickUntil)return;suppressClickUntil=0;event.preventDefault();event.stopPropagation();},true);
  }

  window.YunnanCore={createPhotoSystem,createTravelUtils,createFavoritesStore,createNavigationService,createDateRailController,bindHorizontalScroller};
})();
