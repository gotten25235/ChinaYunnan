/* UI logic. Trip content is loaded from data/trip-data.json. */
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  let tripData;
  try {
    const response = await fetch('data/trip-data.json');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    tripData = await response.json();
  } catch (error) {
    console.error('Unable to load trip data:', error);
    document.body.insertAdjacentHTML('afterbegin', '<div class="data-load-error"><strong>行程資料載入失敗。</strong> 此 JSON 版本需要透過 HTTP/HTTPS 開啟；本機預覽可在網站資料夾執行 <code>python -m http.server 8000</code>。</div>');
    return;
  }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const items = {...tripData.places, ...Object.fromEntries([...tripData.foods,...tripData.shopping,...tripData.photoSpots].map(p=>[p.id,p]))};
  const storageKey = 'yunnan-2026-favorites-v1';
  const customMapStorageKey = 'yunnan-2026-custom-map-v1';
  const mapProviderStorageKey = 'yunnan-2026-map-provider-v1';
  let mapProvider = tripData.navigation?.defaultProvider === 'google' ? 'google' : 'amap';
  let favorites = new Set(), customMapPlaces = new Set(), storageAvailable = true, currentView='itinerary', itineraryExpanded=false, itineraryDayReturnState=null, map=null, layer=null, markers=new Map(), markerGroups=new Map(), selectedMapId=null, selectedMarkerId=null, mapFilters=new Set(), activeMapTab='scheduled', foodCity='all', cultureFilter='all', toastTimer;
  const renderedViews=new Set(['itinerary']);
  // Popup readers own their return state; main-tab navigation deliberately does not.
  // One shared implementation is used by the map detail reader and the general Content Reader.
  const contentReaderState={entry:null,stack:[],returnState:null,afterClose:null};
  function captureReaderReturnState(opener=null,{view=null,horizontal=[]}={}){
    const activeView=view || document.querySelector('.view.is-active');
    const openerEl=opener instanceof HTMLElement?opener:(document.activeElement instanceof HTMLElement?document.activeElement:null);
    const scrollers=new Set((horizontal||[]).filter(el=>el instanceof HTMLElement));
    const nearest=openerEl?.closest?.('.itinerary-day-strip,.map-place-strip,.map-date-rail,.day-story-strip,.chips,.route-list,.content-grid,.culture-grid');
    if(nearest)scrollers.add(nearest);
    return {
      windowX:window.scrollX||0,
      windowY:window.scrollY||0,
      view:activeView instanceof HTMLElement?activeView:null,
      viewScrollTop:activeView?.scrollTop||0,
      horizontal:[...scrollers].map(el=>({el,left:el.scrollLeft||0})),
      opener:openerEl
    };
  }
  function restoreReaderReturnState(state){
    if(!state)return;
    if(state.view)state.view.scrollTop=state.viewScrollTop||0;
    (state.horizontal||[]).forEach(entry=>{if(entry?.el)entry.el.scrollLeft=entry.left||0;});
    window.scrollTo({left:state.windowX||0,top:state.windowY||0,behavior:'auto'});
    try{state.opener?.focus?.({preventScroll:true});}catch(_){/* optional */}
  }
  function restoreReaderReturnStateStable(state,after=null){
    // Native dialog focus restoration can move Chromium/WebKit after close. Restore across
    // two frames, then run any deferred navigation only after the position is stable.
    restoreReaderReturnState(state);
    requestAnimationFrame(()=>{
      restoreReaderReturnState(state);
      requestAnimationFrame(()=>{restoreReaderReturnState(state);if(typeof after==='function')after();});
    });
  }
  try { const saved=JSON.parse(localStorage.getItem(storageKey) || '[]'); if(Array.isArray(saved)) favorites=new Set(saved.filter(id=>typeof id==='string' && items[id])); } catch { storageAvailable=false; }
  try { const raw=localStorage.getItem(customMapStorageKey); const saved=raw===null?(Array.isArray(tripData.customMapDefault)?tripData.customMapDefault:[]):JSON.parse(raw||'[]'); if(Array.isArray(saved)) customMapPlaces=new Set(saved.filter(id=>typeof id==='string' && items[id])); } catch { storageAvailable=false; }
  const hotelNightMigrationKey = 'yunnan-2026-custom-hotel-night-v1';
  try {
    const hotelNightIds=tripData.customResearch?.hotelNightBatch?.defaultCustomIds;
    if(Array.isArray(hotelNightIds) && localStorage.getItem(hotelNightMigrationKey)!=='1'){
      hotelNightIds.filter(id=>typeof id==='string' && items[id]).forEach(id=>customMapPlaces.add(id));
      localStorage.setItem(customMapStorageKey,JSON.stringify([...customMapPlaces]));
      localStorage.setItem(hotelNightMigrationKey,'1');
    }
  } catch { storageAvailable=false; }
  try { const saved=localStorage.getItem(mapProviderStorageKey); if(saved==='amap'||saved==='google') mapProvider=saved; } catch { storageAvailable=false; }
  const dateInZone = date => new Intl.DateTimeFormat('en-CA',{timeZone:tripData.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const todayDay = tripData.days.find(d=>d.date===dateInZone(new Date()));
  let nightDay = 'all';
  const category = p => tripData.categories[p.type];
  const mapFilterIsAll = () => mapFilters.size===0;
  const mapFilterMatches = p => mapFilterIsAll() || mapFilters.has(p.type);
  function resetMapFilters(){ mapFilters.clear(); }
  function toggleMapFilter(type){
    if(type==='all'){ resetMapFilters(); return; }
    if(mapFilters.has(type)) mapFilters.delete(type); else mapFilters.add(type);
    // An empty selection means "全部" so the map never becomes an accidental blank state.
    if(mapFilters.size===0) resetMapFilters();
  }
  const hasCoords = p => Number.isFinite(p.lat) && Number.isFinite(p.lng);
  const stars = n => n ? '★'.repeat(n)+'☆'.repeat(5-n) : '既定安排';
  const saveButton = p => `<button class="save-btn" data-save="${esc(p.id)}" aria-pressed="${favorites.has(p.id)}" aria-label="${favorites.has(p.id)?'取消收藏':'收藏'}${esc(p.name)}">${favorites.has(p.id)?'♥':'♡'}</button>`;
  const navProviderName = provider => provider==='google' ? 'Google 地圖' : '高德地圖';
  const navLinkFor = (p, provider=mapProvider) => {
    const keyword=String(p.address || `${p.city||''} ${p.name||''}`).trim();
    if(provider==='google') return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(keyword);
    const params=new URLSearchParams({keyword,view:'map',src:'yunnan-slow-trip',callnative:'1'});
    if(p.city)params.set('city',p.city);
    return 'https://uri.amap.com/search?'+params.toString();
  };
  const navLink = p => navLinkFor(p,mapProvider);
  const navAnchorAttrs = p => `href="${esc(navLink(p))}" data-nav-id="${esc(p.id)}" data-nav-provider="${esc(mapProvider)}" target="_blank" rel="noopener noreferrer"`;
  function syncNavigationProviderControls(){
    document.querySelectorAll('[data-map-provider-select]').forEach(select=>{select.value=mapProvider;});
    document.querySelectorAll('[data-nav-id]').forEach(link=>{
      const p=items[link.dataset.navId];if(!p)return;
      link.href=navLink(p);link.dataset.navProvider=mapProvider;
      const label=link.querySelector('[data-nav-label]');if(label)label.textContent=navProviderName(mapProvider)+'導航';
      link.title=`使用${navProviderName(mapProvider)}開啟`;
    });
  }
  function setMapProvider(provider,{announce=true}={}){
    if(provider!=='amap'&&provider!=='google')return;
    mapProvider=provider;
    try{localStorage.setItem(mapProviderStorageKey,mapProvider);}catch{storageAvailable=false;}
    syncNavigationProviderControls();
    if(announce)toast(`預設導航已切換為${navProviderName(mapProvider)}`);
  }
  const actions = (p, includeSave=false) => `<div class="actions"><button class="action" data-focus="${esc(p.id)}">◎ 地圖看位置</button><a class="action" ${navAnchorAttrs(p)}>↗ <span data-nav-label>${esc(navProviderName(mapProvider))}導航</span></a><button class="action" data-copy="${esc(p.id)}">${p.addressVerified?'複製中文地址':'複製中文地址／搜尋詞'}</button>${includeSave?saveButton(p):''}</div>`;
  const mapIconSvg = type => ({
    itinerary:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19.5h17M5.5 18l3.2-7 2.3 4 3.5-9 4 11.5M7 8.5l2-2 1.5 1.5"/></svg>',
    hotel:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5V9.5h16v9M4 14h16M7 9.5V6h4.5a2 2 0 0 1 2 2v1.5M6.5 18.5v2M17.5 18.5v2"/></svg>',
    night:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 15.5A8 8 0 0 1 8.5 5a7 7 0 1 0 10.5 10.5Z"/></svg>',
    food:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v7M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 10v11M16 3v18M16 3c3 2 3 7 0 9"/></svg>',
    shopping:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h14l-1 12H6l-1-12ZM9 9V7a3 3 0 0 1 6 0v2"/></svg>',
    photo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l1.3-2h5.4L16 8h4v11H4V8Z"/><circle cx="12" cy="13.5" r="3.2"/></svg>'
  }[type] || '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>');
  function mapMarkerIcon(group, selected=false) {
    const p=group[0],cat=category(p),mixed=group.some(x=>x.type!==p.type);
    return L.divIcon({className:'custom-marker',html:`<div class="map-symbol-marker${selected?' selected':''}" style="--marker-color:${cat.color}" title="${esc(group.map(x=>x.name).join('、'))}"><span class="map-symbol-icon">${mixed?'<span class="map-mixed">＋</span>':mapIconSvg(p.type)}</span>${group.length>1?`<b class="map-marker-count">${group.length}</b>`:''}</div>`,iconSize:[44,44],iconAnchor:[22,22]});
  }
  function mapCardPhoto(p) {
    const ph=tripData.photos[p.photoId];
    if(!ph)return `<div class="map-card-photo map-card-photo-empty"><span class="photo-missing-label">無此圖</span></div>`;
    return `<div class="map-card-photo"><img data-photo-managed="1" src="${esc(ph.src)}" alt="${esc(ph.alt)}" loading="lazy" decoding="async" draggable="false" width="${ph.width}" height="${ph.height}"><span class="map-card-photo-credit">Photo · ${esc(ph.author)}</span></div>`;
  }
  function mapStripHours(p) {
    let value=p.openingHours || '';
    // Night entries already carry a planned time range. Use it only when it is a clear clock range.
    if(!value && p.type==='night' && /^\s*\d{1,2}:\d{2}\s*[–—~-]\s*\d{1,2}:\d{2}\s*$/.test(p.time||'')) value=p.time;
    value=String(value||'').trim();
    if(!value || /^(24\s*(hr|hrs|h|小時)|全天|24\/7)$/i.test(value)) return '';
    return value.replace(/[–—-]/g,'~').replace(/\s+/g,'');
  }
  function mapStripGroup(p) {
    if(p.group) return String(p.group);
    if(Array.isArray(p.days) && p.days.length) return p.days.map(d=>`Day ${d}`).join(' · ');
    const days=tripData.days.filter(d=>[...d.itinerary,...d.nightRecommendations,...(d.nightCandidates||[]),...d.foods,...d.shopping,...(d.hotel?[d.hotel]:[])].includes(p.id)).map(d=>d.day);
    return days.length ? days.map(d=>`Day ${d}`).join(' · ') : (customMapPlaces.has(p.id)?'自定義':'未分組');
  }
  function mapAnchorFor(p) {
    if(hasCoords(p)) return p;
    return items[p.mapPlaceId] || items[tripData.mapAreas[p.city]] || null;
  }
  let userLocationPoint=null;
  function userDistanceKm(p) {
    if(!userLocationPoint || !map) return null;
    const anchor=mapAnchorFor(p);
    if(!anchor || !hasCoords(anchor)) return null;
    return map.distance(userLocationPoint,[anchor.lat,anchor.lng])/1000;
  }
  function mapStripDistanceMarkup(p) {
    const km=userDistanceKm(p);
    return `<span class="map-strip-distance" data-map-distance="${esc(p.id)}"${km===null?' hidden':''}>${km===null?'':`距離 ${km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km'}`}</span>`;
  }
  function updateMapStripDistances() {
    document.querySelectorAll('[data-map-distance]').forEach(el=>{
      const p=items[el.dataset.mapDistance],km=p?userDistanceKm(p):null;
      el.hidden=km===null;
      if(km!==null) el.textContent=`距離 ${km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km'}`;
    });
  }
  function mapStripCard(p) {
    const ph=tripData.photos[p.photoId],cat=category(p),hours=mapStripHours(p),groupLabel=mapStripGroup(p);
    const visual=ph?`<span class="map-strip-photo"><img data-photo-managed="1" src="${esc(ph.src)}" alt="${esc(ph.alt)}" loading="lazy" decoding="async" draggable="false" width="${ph.width}" height="${ph.height}"></span>`:`<span class="map-strip-photo map-strip-photo-empty"><span class="photo-missing-label">無此圖</span></span>`;
    return `<article class="map-strip-card compact-card compact-card--map" data-map-strip="${esc(p.id)}" role="button" tabindex="0" aria-pressed="${p.id===selectedMapId?'true':'false'}" aria-label="${esc(p.name)}；點一下查看附近有什麼可玩，長按查看完整內容" title="點一下看附近 · 長按看完整內容"><span class="map-strip-card-top"><span class="map-strip-type" style="--marker-color:${cat.color}"><i>${mapIconSvg(p.type)}</i>${esc(cat.name)}</span><span class="map-strip-hours">${hours?esc(hours):'&nbsp;'}</span></span>${visual}<span class="map-strip-card-body"><strong>${esc(p.name)}</strong><small class="map-strip-place-meta">${esc(p.city)}${p.duration?` · ${esc(p.duration)}`:''}</small><span class="map-strip-bottom-meta"><span class="map-strip-group"><b>GROUP</b> ${esc(groupLabel)}</span>${mapStripDistanceMarkup(p)}</span></span></article>`;
  }
  function mapDetailValue(label, value, wide=false) {
    if(value===undefined || value===null || value==='') return '';
    return `<div class="map-detail-row${wide?' wide':''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }
  function mapDetailDialogContent(p) {
    const cat=category(p),ph=tripData.photos[p.photoId],hours=mapStripHours(p),groupLabel=mapStripGroup(p);
    const photo=ph?`<div class="map-detail-photo"><img data-photo-managed="1" src="${esc(ph.src)}"${ph.fallbackSrc?` data-fallback-src="${esc(ph.fallbackSrc)}"`:''} alt="${esc(ph.alt)}" loading="eager" decoding="async" width="${ph.width}" height="${ph.height}"><span class="map-detail-photo-credit">Photo · ${esc(ph.author)}</span></div>`:`<div class="map-detail-photo map-strip-photo-empty"><span class="photo-missing-label">無此圖</span></div>`;
    let extra='';
    if(p.type==='night') extra += mapDetailValue('建議時段',p.time)+mapDetailValue('熱鬧程度',p.crowd?stars(p.crowd):'')+mapDetailValue('適合',p.suitable)+mapDetailValue('飯店 → 景點',hotelDistanceValue(p),true)+mapDetailValue('交通',p.transport,true);
    if(p.type==='food') extra += mapDetailValue('口味',p.taste)+mapDetailValue('用餐類型',p.meal);
    if(p.type==='shopping') extra += mapDetailValue('購物分類',p.group);
    if(p.type==='photo') extra += mapDetailValue('怎麼拍',p.shot,true)+mapDetailValue('光線／時段',p.bestTime,true)+(p.drama?mapDetailValue('取景資訊','《去有風的地方》取景相關'): '');
    if(p.marketKind) extra += mapDetailValue('類型',p.marketKind,true);
    const liveDistance=userDistanceKm(p);
    const distanceText=liveDistance===null?'':(liveDistance<1?`${Math.round(liveDistance*1000)} m`:`${liveDistance.toFixed(1)} km`);
    const sourceLink=p.source?`<a class="map-detail-source" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.sourceLabel||'資料來源')} ↗</a>`:'';
    return `<button type="button" class="map-detail-close" data-map-detail-close aria-label="關閉完整內容">×</button>${photo}<div class="map-detail-content"><div class="map-detail-top"><span class="map-strip-type" style="--marker-color:${cat.color}"><i>${mapIconSvg(p.type)}</i>${esc(cat.name)}</span>${hours?`<span class="map-detail-hours">${esc(hours)}</span>`:''}</div><h2>${esc(p.name)}</h2><p class="map-detail-description">${esc(p.description)}</p><div class="map-detail-grid">${mapDetailValue('城市',p.city)}${mapDetailValue('GROUP',groupLabel)}${mapDetailValue('停留時間',p.duration)}${p.rating?mapDetailValue('推薦度',stars(p.rating)):''}${distanceText?mapDetailValue('目前距離',distanceText):''}${p.pdfScheduled===true?mapDetailValue('行程狀態','PDF 已安排'):''}${extra}${mapDetailValue('地址／搜尋詞',p.address,true)}${mapDetailValue('座標說明',p.coordinateNote,true)}</div>${sourceLink}<div class="map-detail-actions"><a ${navAnchorAttrs(p)}>↗ <span data-nav-label>${esc(navProviderName(mapProvider))}導航</span></a><button type="button" data-copy="${esc(p.id)}">複製地址</button></div></div>`;
  }
  function mapDetailSequence() {
    const list=activeMapTab==='custom'?customMapItems():(activeMapTab==='all'?allMapItems():scheduledMapItems());
    return list.filter(Boolean);
  }
  // Explore Map detail uses the same return-state and swipe controller as every other reader.
  let mapDetailReturnState=null;
  function ensureMapDetailDialog() {
    let dialog=$('#map-detail-dialog');
    if(dialog)return dialog;
    document.body.insertAdjacentHTML('beforeend','<dialog id="map-detail-dialog" class="map-detail-dialog" aria-label="地點完整內容"><button type="button" class="map-detail-nav map-detail-prev" data-map-detail-nav="prev" aria-label="上一張完整內容">‹</button><div class="map-detail-shell"></div><button type="button" class="map-detail-nav map-detail-next" data-map-detail-nav="next" aria-label="下一張完整內容">›</button><div class="map-detail-position" aria-live="polite"></div></dialog>');
    dialog=$('#map-detail-dialog');
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{const state=mapDetailReturnState;mapDetailReturnState=null;restoreReaderReturnStateStable(state);});
    bindPopupReaderNavigation(dialog,{surfaceSelector:'.map-detail-shell',navigate:navigateMapDetail});
    return dialog;
  }
  function setMapDetailDialogPlace(id,{direction=''}={}) {
    const p=items[id];if(!p)return false;
    const dialog=ensureMapDetailDialog(),shell=dialog.querySelector('.map-detail-shell');
    const sequence=mapDetailSequence();
    const index=sequence.findIndex(x=>x.id===id);
    shell.classList.remove('slide-from-left','slide-from-right');
    shell.innerHTML=mapDetailDialogContent(p);
    shell.scrollTop=0;
    if(direction){
      // Force a fresh animation even when users navigate quickly.
      void shell.offsetWidth;
      shell.classList.add(direction==='prev'?'slide-from-left':'slide-from-right');
    }
    dialog.dataset.placeId=id;
    const prev=dialog.querySelector('[data-map-detail-nav="prev"]'),next=dialog.querySelector('[data-map-detail-nav="next"]'),position=dialog.querySelector('.map-detail-position');
    const valid=index>=0;
    if(prev) prev.disabled=!valid||index<=0;
    if(next) next.disabled=!valid||index>=sequence.length-1;
    if(position) position.textContent=valid?`${index+1} / ${sequence.length} · 左右滑動`:'完整內容';
    return true;
  }
  function navigateMapDetail(direction) {
    const dialog=$('#map-detail-dialog');if(!dialog?.open)return;
    const sequence=mapDetailSequence(),current=dialog.dataset.placeId;
    const index=sequence.findIndex(x=>x.id===current);if(index<0)return;
    const nextIndex=index+(direction==='prev'?-1:1);
    if(nextIndex<0||nextIndex>=sequence.length)return;
    setMapDetailDialogPlace(sequence[nextIndex].id,{direction});
  }
  function openMapDetailDialog(id,opener=null) {
    const dialog=ensureMapDetailDialog();
    if(!setMapDetailDialogPlace(id))return;
    if(!dialog.open)mapDetailReturnState=captureReaderReturnState(opener,{view:$('#view-map'),horizontal:[$('#map-list')]});
    if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}
    else dialog.setAttribute('open','');
  }
  function setMapFeatureCardHidden(hidden=true) {
    const el=$('#map-feature-card');if(!el)return;
    el.hidden=Boolean(hidden);
    el.setAttribute('aria-hidden',String(Boolean(hidden)));
  }
  function renderMapFeatureCard(p, group=[p]) {
    const el=$('#map-feature-card');if(!el)return;
    // Never leave an empty floating panel over the map. A real marker click is what
    // opens the card; when there is no place content the panel disappears entirely.
    if(!p){el.innerHTML='';setMapFeatureCardHidden(true);return;}
    const cat=category(p),siblings=group.filter(x=>x.id!==p.id);
    const inCustom=customMapPlaces.has(p.id);
    el.innerHTML=`<button class="map-card-close" data-map-card-close aria-label="收起地點小卡">×</button>${mapCardPhoto(p)}<div class="map-card-body"><div class="map-card-kicker"><span class="map-card-kind" style="--marker-color:${cat.color}">${mapIconSvg(p.type)} ${esc(p.city)} · ${esc(cat.name)}</span>${saveButton(p)}</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="map-card-meta"><span>${p.rating?stars(p.rating)+' · 網路推薦':'既定安排'}</span>${p.duration?`<span>停留 ${esc(p.duration)}</span>`:''}</div>${p.coordinateNote?`<p class="map-card-note">${esc(p.coordinateNote)}</p>`:''}${siblings.length?`<div class="map-card-siblings"><span>同一座標還有 ${siblings.length} 個提案</span><div class="map-card-sibling-buttons">${group.map(x=>`<button data-map-pick="${esc(x.id)}" class="${x.id===p.id?'active':''}">${esc(x.name)}</button>`).join('')}</div></div>`:''}<div class="map-card-actions"><a class="map-card-primary" ${navAnchorAttrs(p)}>↗ <span data-nav-label>${esc(navProviderName(mapProvider))}導航</span></a><button data-map-scroll="${esc(p.id)}">下方卡片 ↓</button><button class="map-custom-toggle ${inCustom?'active':''}" data-map-custom="${esc(p.id)}" aria-pressed="${inCustom}" aria-label="${inCustom?'從自定義移除':'加入自定義'}${esc(p.name)}">${inCustom?'✓ 自定義':'＋ 自定義'}</button></div></div>`;
  }
  function syncMapStripSelection(keepVisible=false) {
    const strip=$('#map-list');if(!strip)return;
    strip.querySelectorAll('[data-map-strip]').forEach(card=>{
      const active=card.dataset.mapStrip===selectedMapId;
      card.classList.toggle('active',active);
      card.setAttribute('aria-pressed',String(active));
    });
    if(keepVisible&&selectedMapId){
      const card=strip.querySelector(`[data-map-strip="${CSS.escape(selectedMapId)}"]`);
      if(card){
        const left=card.offsetLeft-(strip.clientWidth-card.offsetWidth)/2;
        strip.scrollTo({left:Math.max(0,left),behavior:'smooth'});
      }
    }
  }
  function refreshMarkerSelection() {
    const seen=new Set();
    markers.forEach(marker=>{
      if(seen.has(marker))return;seen.add(marker);
      const group=markerGroups.get(marker)||[];
      const selected=group.some(x=>x.id===selectedMarkerId||x.id===selectedMapId);
      marker.setIcon(mapMarkerIcon(group,selected));
      marker.setZIndexOffset(selected?1000:0);
    });
  }
  function focusMapOnPlace(anchor) {
    if(!map||!hasCoords(anchor))return;
    const mobile=window.matchMedia('(max-width: 760px)').matches;
    // A strip-card click is a deliberate focus action, not a day-wide fit.
    // Zoom in enough that nearby but distinct places (for example Dali Ancient
    // City and Foreigner Street) separate into their own readable markers.
    const targetZoom=mobile?15:16;
    const point=L.latLng(anchor.lat,anchor.lng);
    map.stop();
    map.setView(point,targetZoom,{animate:true});
    requestAnimationFrame(()=>{
      const featureCard=$('#map-feature-card');
      const cardVisible=Boolean(featureCard && !featureCard.hidden);
      const desktop=!mobile;
      map.panInside(point,{
        paddingTopLeft:desktop&&cardVisible?[390,44]:[44,44],
        paddingBottomRight:[44,44],
        animate:true
      });
    });
  }
  function selectMapPlace(id,{anchorId=id,nearby=true,pan=false,focus=false}={}) {
    const p=items[id];if(!p)return;
    selectedMapId=id;selectedMarkerId=anchorId;
    const marker=markers.get(anchorId)||markers.get(id),group=markerGroups.get(marker)||[p];
    renderMapFeatureCard(p,group.includes(p)?group:[p]);
    refreshMarkerSelection();
    syncMapStripSelection(true);
    const anchor=items[anchorId]||p;
    if(map&&hasCoords(anchor)){
      if(focus)focusMapOnPlace(anchor);
      else if(pan)map.panTo([anchor.lat,anchor.lng],{animate:true,duration:.35});
      if(nearby)showNearby(L.latLng(anchor.lat,anchor.lng),false);
    }
  }
  function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000); }
  function hotelDistanceValue(p,d=null) {
    if(!p || p.type!=='night') return '';
    const byDay=p.hotelDistanceByDay||{};
    const dayKey=d?.day!==undefined&&d?.day!==null?String(d.day):'';
    if(dayKey && byDay[dayKey]) return byDay[dayKey];
    const entries=Object.entries(byDay);
    if(entries.length===1) return entries[0][1];
    if(entries.length>1){
      const unique=[...new Set(entries.map(([,value])=>value))];
      if(unique.length===1) return unique[0];
      return entries.map(([day,value])=>`Day ${day}：${value}`).join('；');
    }
    if(p.hotelDistance) return p.hotelDistance;
    if(p.distanceNote){
      return String(p.distanceNote).replace(/^住宿(?:附近|旁|門口)?[：:]?\s*/,'') || p.distanceNote;
    }
    const hotel=items[d?.hotel];
    if(hotel && hasCoords(hotel) && hasCoords(p)){
      const rad=n=>n*Math.PI/180, a=Math.sin(rad(p.lat-hotel.lat)/2)**2+Math.cos(rad(hotel.lat))*Math.cos(rad(p.lat))*Math.sin(rad(p.lng-hotel.lng)/2)**2;
      return `直線約 ${(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1)} km（非步行距離）`;
    }
    return '待確認';
  }
  function hotelDistanceCardValue(p,d=null) {
    const raw=String(hotelDistanceValue(p,d)||'').trim();
    if(!raw)return '待確認';
    const normalized=raw.replace(/,/g,'').replace(/[－—~～至]/g,'–');
    const range=normalized.match(/(\d+(?:\.\d+)?)\s*–\s*(\d+(?:\.\d+)?)\s*(km|公里|m|米)?/i);
    if(range){
      let a=Number(range[1]),b=Number(range[2]);
      const unit=(range[3]||'').toLowerCase();
      if(unit==='m'||unit==='米'){a/=1000;b/=1000;}
      return `約 ${a.toFixed(2)}–${b.toFixed(2)}km`;
    }
    const single=normalized.match(/(\d+(?:\.\d+)?)\s*(km|公里|m|米)/i);
    if(single){
      let value=Number(single[1]);
      const unit=single[2].toLowerCase();
      if(unit==='m'||unit==='米')value/=1000;
      return `約 ${value.toFixed(2)}km`;
    }
    return /待確認/.test(raw)?'待確認':raw;
  }
  function distance(p,d) {
    return `飯店 → 景點：${hotelDistanceValue(p,d)}`;
  }
  function itemThumbnail(p, className='item-thumbnail') {
    if(!p)return '';
    const classes=[...new Set(['item-thumbnail',...(className||'').split(/\s+/).filter(Boolean)])].join(' ');
    const ph=tripData.photos[p.photoId];
    if(!ph)return `<span class="${classes} item-thumbnail-empty" aria-label="無此圖"><span class="photo-missing-label">無此圖</span></span>`;
    return `<span class="${classes}"><img data-photo-managed="1" src="${esc(ph.src)}" alt="" loading="lazy" decoding="async" width="${ph.width}" height="${ph.height}"></span>`;
  }
  function photoFigure(id, className='card-photo') {
    const p=tripData.photos[id];
    if(!p)return `<figure class="${className} photo-missing"><div class="photo-missing-box"><span>無此圖</span></div><figcaption>無此圖</figcaption></figure>`;
    return `<figure class="${className}"><img data-photo-managed="1" src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="${p.width}" height="${p.height}"><figcaption>${esc(p.caption)} · Photo by <a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.author)}</a> / <a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.license)}</a>（縮圖／裁切）</figcaption></figure>`;
  }
  function cardPhotoFigure(id, className='card-photo') {
    const p=tripData.photos[id];
    if(!p)return `<figure class="${className} card-photo-visual photo-missing"><div class="photo-missing-box"><span>無此圖</span></div></figure>`;
    return `<figure class="${className} card-photo-visual"><img data-photo-managed="1" src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="${p.width}" height="${p.height}"></figure>`;
  }
  document.addEventListener('error', e=>{
    const img=e.target;
    if(!(img instanceof HTMLImageElement)||!img.dataset.photoManaged)return;
    const fallback=img.dataset.fallbackSrc;
    if(fallback&&!img.dataset.fallbackTried){img.dataset.fallbackTried='1';img.src=fallback;return;}
    const slot=img.parentElement;if(!slot)return;
    img.remove();
    slot.querySelectorAll('.map-card-photo-credit,.map-detail-photo-credit,small').forEach(el=>el.remove());
    if(slot.classList.contains('content-reader-media-frame')){
      slot.classList.add('photo-load-error');
      if(!slot.querySelector('.photo-missing-label'))slot.insertAdjacentHTML('afterbegin','<span class="photo-missing-label">無此圖</span>');
      const figure=slot.closest('figure');
      if(figure){figure.classList.add('photo-missing');const cap=figure.querySelector('figcaption');if(cap)cap.textContent='無此圖';}
    }else if(slot.tagName==='FIGURE'){
      slot.classList.add('photo-missing');
      if(!slot.querySelector('.photo-missing-box'))slot.insertAdjacentHTML('afterbegin','<div class="photo-missing-box"><span>無此圖</span></div>');
      const cap=slot.querySelector('figcaption');if(cap)cap.textContent='無此圖';
    }else{
      slot.classList.add('photo-load-error');
      if(!slot.querySelector('.photo-missing-label'))slot.insertAdjacentHTML('afterbegin','<span class="photo-missing-label">無此圖</span>');
    }
  },true);
  function renderCulture() {
    const filters=[['all','全部故事'],['republic','民國時期'],['custom','風俗與禮節'],['tales','文學與傳說']];
    $('#culture-filters').innerHTML=filters.map(([id,label])=>`<button data-culture-filter="${id}" class="${id===cultureFilter?'active':''}" aria-pressed="${id===cultureFilter}">${label}</button>`).join('');
    const stories=tripData.culture.filter(s=>cultureFilter==='all'||cultureFilter==='republic'&&s.republic||cultureFilter==='custom'&&['習俗','文化','禮節'].includes(s.kind)||cultureFilter==='tales'&&['文學','傳說'].includes(s.kind));
    $('#culture-list').innerHTML=stories.map(contentStoryCard).join('');
    $('#photo-sources').innerHTML=Object.values(tripData.photos).map(p=>`<p><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.alt)}</a> — ${esc(p.author)} · <a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.license)}</a>。${esc(p.changes)}</p>`).join('');
    renderedViews.add('culture');
  }
  function storyReadMinutes(s) {
    const chars=`${s.intro||''}${s.body||''}${s.look||''}`.replace(/\s+/g,'').length;
    return Math.max(1,Math.ceil(chars/260));
  }
  function dayStoryThumb(s) {
    const ph=tripData.photos[s.photoId];
    if(!ph)return `<span class="day-story-photo day-story-photo-empty"><span class="photo-missing-label">無此圖</span></span>`;
    return `<span class="day-story-photo"><img data-photo-managed="1" src="${esc(ph.src)}" alt="${esc(ph.alt)}" loading="lazy" decoding="async" width="${ph.width}" height="${ph.height}"><small>Photo · ${esc(ph.author)}</small></span>`;
  }
  function dayCulture(d){
    const stories=tripData.culture.filter(st=>Array.isArray(st.days)&&st.days.includes(d.day));
    if(!stories.length)return '';
    return `<section class="day-culture" aria-label="Day ${d.day} 風俗與故事"><div class="day-culture-head"><div><span class="eyebrow">STORIES ALONG THE WAY</span><h3>風俗與故事</h3></div><span class="day-culture-count">${stories.length} 篇</span></div><div class="day-story-strip">${stories.map(st=>`<button type="button" class="day-story-card compact-card compact-card--story" data-content-reader-story="${esc(st.id)}" data-reader-day="${d.day}" aria-label="閱讀完整故事：${esc(st.title)}">${dayStoryThumb(st)}<span class="day-story-copy"><small>${esc(st.city)} · ${esc(st.kind)} · ${esc(st.period)}</small><strong>${esc(st.title)}</strong><em>閱讀完整故事 →</em></span></button>`).join('')}</div><div class="day-culture-actions"><button type="button" class="day-culture-library" data-view="culture">查看全部風俗與故事 →</button></div></section>`;
  }
  function contentReaderItemSequence(p,day=null,kind='') {
    const d=tripData.days.find(x=>x.day===Number(day));
    if(kind==='favorites')return [...favorites].map(id=>items[id]).filter(Boolean);
    if(kind==='photo')return tripData.photoSpots.filter(x=>photoFilter==='all'||x.drama);
    if(kind==='food'&&d)return d.foods.map(id=>items[id]).filter(Boolean);
    if(kind==='shopping'&&d)return d.shopping.map(id=>items[id]).filter(Boolean);
    if(kind==='night'&&d)return d.nightRecommendations.map(id=>items[id]).filter(Boolean);
    if((kind==='itinerary'||kind==='hotel')&&d)return [...d.itinerary,...(d.hotel?[d.hotel]:[])].map(id=>items[id]).filter(Boolean);
    if(d&&[...d.itinerary,...d.foods,...d.shopping,...d.nightRecommendations,...(d.hotel?[d.hotel]:[])].includes(p.id)){
      if(p.type==='food')return d.foods.map(id=>items[id]).filter(Boolean);
      if(p.type==='shopping')return d.shopping.map(id=>items[id]).filter(Boolean);
      if(p.type==='night')return d.nightRecommendations.map(id=>items[id]).filter(Boolean);
      return [...d.itinerary,...(d.hotel?[d.hotel]:[])].map(id=>items[id]).filter(Boolean);
    }
    if(p.type==='food')return tripData.foods.filter(x=>foodCity==='all'||x.city===foodCity);
    if(p.type==='shopping')return tripData.shopping;
    if(p.type==='photo')return tripData.photoSpots.filter(x=>photoFilter==='all'||x.drama);
    return [p];
  }
  function contentReaderPhoto(photoId,className='content-reader-photo') {
    const ph=tripData.photos[photoId];
    if(!ph)return `<figure class="${className} photo-missing"><div class="content-reader-media-frame photo-missing-box"><span>無此圖</span></div><figcaption>無此圖</figcaption></figure>`;
    const source=ph.source?`<a href="${esc(ph.source)}" target="_blank" rel="noopener noreferrer">${esc(ph.author||'圖片來源')}</a>`:esc(ph.author||'圖片來源');
    const license=ph.licenseUrl?`<a href="${esc(ph.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(ph.license||'授權')}</a>`:esc(ph.license||'');
    return `<figure class="${className}"><div class="content-reader-media-frame"><img data-photo-managed="1" src="${esc(ph.src)}"${ph.fallbackSrc?` data-fallback-src="${esc(ph.fallbackSrc)}"`:''} alt="${esc(ph.alt)}" loading="eager" decoding="async" width="${ph.width}" height="${ph.height}"></div><figcaption>${esc(ph.caption)}${source?` · Photo by ${source}`:''}${license?` / ${license}`:''}${ph.changes?` · ${esc(ph.changes)}`:''}</figcaption></figure>`;
  }
  function contentReaderItemBody(p,day=null) {
    const d=tripData.days.find(x=>x.day===Number(day)),cat=category(p),hours=mapStripHours(p);
    let extra='';
    if(p.type==='food')extra+=mapDetailValue('口味',p.taste)+mapDetailValue('用餐類型',p.meal);
    if(p.type==='shopping')extra+=mapDetailValue('購物分類',p.group);
    if(p.type==='night')extra+=mapDetailValue('建議時段',p.time)+mapDetailValue('適合',p.suitable)+mapDetailValue('飯店 → 景點',hotelDistanceValue(p,d),true)+mapDetailValue('交通',p.transport,true);
    if(p.type==='photo')extra+=mapDetailValue('怎麼拍',p.shot,true)+mapDetailValue('光線／時段',p.bestTime,true);
    if(d?.flight && (p.id==='arrival'||p.id==='return')){
      const direction=d.flight;
      const flightText=tripData.flights.map(g=>`${g.name}：${(g[direction]||[]).map(f=>`${flightLabelText(f)} ${f.route} ${f.time}`).join('；')}`).join(' ｜ ');
      extra+=mapDetailValue('航空公司／航班',flightText,true);
    }
    const dayLabel=d?`Day ${d.day} · ${d.city}`:mapStripGroup(p);
    return `<article class="content-reader-article">${contentReaderPhoto(p.photoId)}<div class="content-reader-copy"><div class="content-reader-kicker"><span class="map-strip-type" style="--marker-color:${cat.color}"><i>${mapIconSvg(p.type)}</i>${esc(cat.name)}</span>${hours?`<span>${esc(hours)}</span>`:''}</div><h2>${esc(p.name)}</h2><p class="content-reader-intro">${esc(p.description)}</p><div class="map-detail-grid">${mapDetailValue('城市',p.city)}${mapDetailValue('GROUP',dayLabel)}${mapDetailValue('停留時間',p.duration)}${p.rating?mapDetailValue('推薦度',stars(p.rating)):''}${p.pdfScheduled===true?mapDetailValue('行程狀態','PDF 已安排'):''}${extra}${mapDetailValue('地址／搜尋詞',p.address,true)}${mapDetailValue('座標說明',p.coordinateNote,true)}</div><div class="content-reader-actions"><button type="button" data-content-reader-focus="${esc(p.id)}">◎ 地圖看位置</button><a ${navAnchorAttrs(p)}>↗ <span data-nav-label>${esc(navProviderName(mapProvider))}導航</span></a><button type="button" data-copy="${esc(p.id)}">複製地址</button><button type="button" data-content-reader-save="${esc(p.id)}">${favorites.has(p.id)?'♥ 已收藏':'♡ 收藏'}</button></div></div></article>`;
  }
  function contentReaderStoryBody(story,day=null) {
    const d=tripData.days.find(x=>x.day===Number(day));
    return `<article class="content-reader-article story-mode">${contentReaderPhoto(story.photoId)}<div class="content-reader-copy"><div class="culture-meta"><span class="badge">${esc(story.city)} · ${esc(story.kind)}</span><span>${esc(story.period)}</span><span>約 ${storyReadMinutes(story)} 分鐘閱讀</span></div><h2>${esc(story.title)}</h2><p class="content-reader-story-intro">${esc(story.intro)}</p><p class="content-reader-story-body">${esc(story.body)}</p><div class="content-reader-story-look"><span>旅途中可以留意</span>${esc(story.look)}</div><div class="content-reader-story-source"><span>${d?`Day ${d.day} · ${esc(d.city)}`:story.days.map(x=>'Day '+x).join(' / ')}</span><a href="${esc(story.source)}" target="_blank" rel="noopener noreferrer">${esc(story.sourceLabel)} ↗</a></div></div></article>`;
  }
  function currentContentReaderEntry(){return contentReaderState.entry;}
  function contentReaderHeader(entry) {
    const canBack=contentReaderState.stack.length>0;
    let title='完整內容',sub='';
    if(entry.kind==='story'){const st=tripData.culture.find(x=>x.id===entry.ids[entry.index]);title='旅途故事';sub=st?`${st.kind} · ${st.period}`:'';}
    else {const p=items[entry.ids[entry.index]];title=p?.name||'完整內容';sub=p?category(p).name:'';}
    return `<header class="content-reader-header"><button type="button" class="content-reader-back" data-content-reader-back>${canBack?'← 回上一層':'← 關閉'}</button><div><span class="eyebrow">DETAIL READER</span><strong>${esc(title)}</strong><small>${esc(sub)}</small></div><button type="button" class="content-reader-x" data-content-reader-close aria-label="關閉完整內容">×</button></header>`;
  }
  function renderContentReader(direction='') {
    const dialog=ensureContentReaderDialog(),entry=currentContentReaderEntry();if(!dialog||!entry)return;
    let body='',count=1,index=0;
    if(entry.kind==='story'){const seq=entry.ids.map(id=>tripData.culture.find(x=>x.id===id)).filter(Boolean);const st=seq[entry.index];if(!st)return;body=contentReaderStoryBody(st,entry.day);count=seq.length;index=entry.index;}
    else {const seq=entry.ids.map(id=>items[id]).filter(Boolean);const p=seq[entry.index];if(!p)return;body=contentReaderItemBody(p,entry.day);count=seq.length;index=entry.index;}
    const shell=dialog.querySelector('.content-reader-shell');
    shell.innerHTML=`${contentReaderHeader(entry)}<div class="content-reader-scroll">${body}</div><footer class="content-reader-footer"><button type="button" data-content-reader-nav="prev">← 上一個</button><span class="content-reader-position">${index+1} / ${count} · 左右滑動</span><button type="button" data-content-reader-nav="next">下一個 →</button></footer>`;
    if(direction){const article=shell.querySelector('.content-reader-article');article?.classList.add(direction==='prev'?'reader-from-left':'reader-from-right');}
    const prev=shell.querySelector('[data-content-reader-nav="prev"]'),next=shell.querySelector('[data-content-reader-nav="next"]');if(prev)prev.disabled=index<=0;if(next)next.disabled=index>=count-1;
  }
  // Single popup navigation controller for every reader. Horizontal swipes use one
  // engine only. Pointer Events are primary; Touch Events provide the same engine's completion
  // path when a mobile browser cancels Pointer delivery. A duplicate guard guarantees one
  // physical swipe can navigate at most once.
  function bindPopupReaderNavigation(dialog,{surfaceSelector,navigate}) {
    if(!dialog || typeof navigate!=='function')return;
    const readyKey='popupNav_'+surfaceSelector.replace(/[^a-z0-9]/gi,'_');
    if(dialog.dataset[readyKey]==='1')return;
    dialog.dataset[readyKey]='1';
    const INTERACTIVE='a,button,input,select,textarea,label';
    const MIN_X=58,RATIO=1.25,DUPLICATE_MS=260;
    let pointerGesture=null,touchGesture=null,lastNavigateAt=-Infinity;
    const eligibleSurface=target=>{const surface=target?.closest?.(surfaceSelector);return surface&&dialog.contains(surface)?surface:null;};
    const shouldNavigate=(g,x,y)=>{if(!g||g.ignore)return null;const dx=x-g.x,dy=y-g.y;return Math.abs(dx)>=MIN_X&&Math.abs(dx)>Math.abs(dy)*RATIO?(dx<0?'next':'prev'):null;};
    const navigateOnce=direction=>{if(!direction||performance.now()-lastNavigateAt<DUPLICATE_MS)return false;lastNavigateAt=performance.now();navigate(direction);return true;};

    dialog.addEventListener('pointerdown',event=>{
      if(!['touch','pen'].includes(event.pointerType)||event.isPrimary===false)return;
      const surface=eligibleSurface(event.target);if(!surface)return;
      pointerGesture={id:event.pointerId,x:event.clientX,y:event.clientY,surface,ignore:Boolean(event.target.closest?.(INTERACTIVE))};
    },{passive:true});
    dialog.addEventListener('pointerup',event=>{
      if(!pointerGesture||event.pointerId!==pointerGesture.id)return;
      const g=pointerGesture;pointerGesture=null;
      if(eligibleSurface(event.target)!==g.surface)return;
      navigateOnce(shouldNavigate(g,event.clientX,event.clientY));
    },{passive:true});
    dialog.addEventListener('pointercancel',event=>{if(pointerGesture&&event.pointerId===pointerGesture.id)pointerGesture=null;},{passive:true});

    dialog.addEventListener('touchstart',event=>{
      if(event.touches.length!==1)return;
      const touch=event.touches[0],surface=eligibleSurface(event.target);if(!surface)return;
      touchGesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,surface,ignore:Boolean(event.target.closest?.(INTERACTIVE))};
    },{passive:true});
    dialog.addEventListener('touchend',event=>{
      if(!touchGesture)return;
      const touch=[...event.changedTouches].find(t=>t.identifier===touchGesture.id);if(!touch)return;
      const g=touchGesture;touchGesture=null;
      // If Pointer Events already completed this physical swipe, navigateOnce blocks the
      // duplicate. If Pointer delivery was cancelled, touchend can complete the same swipe.
      navigateOnce(shouldNavigate(g,touch.clientX,touch.clientY));
    },{passive:true});
    dialog.addEventListener('touchcancel',()=>{touchGesture=null;},{passive:true});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'){event.preventDefault();navigate('prev');}
      else if(event.key==='ArrowRight'){event.preventDefault();navigate('next');}
    });
  }

  function ensureContentReaderDialog() {
    let dialog=$('#content-reader-dialog');if(dialog)return dialog;
    document.body.insertAdjacentHTML('beforeend','<dialog id="content-reader-dialog" class="content-reader-dialog" aria-label="內容完整閱讀視窗"><div class="content-reader-shell"></div></dialog>');
    dialog=$('#content-reader-dialog');
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    bindPopupReaderNavigation(dialog,{surfaceSelector:'.content-reader-scroll',navigate:navigateContentReader});
    dialog.addEventListener('close',()=>{const after=contentReaderState.afterClose,state=contentReaderState.returnState;contentReaderState.afterClose=null;contentReaderState.returnState=null;contentReaderState.entry=null;contentReaderState.stack=[];restoreReaderReturnStateStable(state,after);});
    return dialog;
  }
  function openContentReaderEntry(entry,opener=null,{push=false}={}) {
    const dialog=ensureContentReaderDialog();if(!dialog)return;
    if(!dialog.open){contentReaderState.returnState=captureReaderReturnState(opener,{horizontal:[$('#itinerary-strip')]});contentReaderState.stack=[];}
    else if(push&&contentReaderState.entry)contentReaderState.stack.push(JSON.parse(JSON.stringify(contentReaderState.entry)));
    contentReaderState.entry=entry;renderContentReader();
    if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
  }
  function openContentReaderItem(id,{day=null,kind='',opener=null,push=false}={}){const p=items[id];if(!p)return;const seq=contentReaderItemSequence(p,day,kind);let index=seq.findIndex(x=>x.id===id);if(index<0)index=0;openContentReaderEntry({kind:'item',ids:seq.map(x=>x.id),index,day:Number(day)||null},opener,{push});}
  function openContentReaderStory(id,{day=null,opener=null,push=false}={}){const hasDay=day!==null&&day!==undefined&&String(day).trim()!=='';const n=hasDay?Number(day):NaN,seq=tripData.culture.filter(st=>Number.isFinite(n)?st.days.includes(n):true);let index=seq.findIndex(st=>st.id===id);if(index<0)index=0;if(seq.length)openContentReaderEntry({kind:'story',ids:seq.map(st=>st.id),index,day:Number.isFinite(n)?n:null},opener,{push});}
  function contentReaderBack(){const dialog=$('#content-reader-dialog');if(!dialog?.open)return;if(contentReaderState.stack.length){contentReaderState.entry=contentReaderState.stack.pop();renderContentReader('prev');}else dialog.close();}
  function closeContentReaderThen(action){const dialog=$('#content-reader-dialog');if(!dialog?.open){if(typeof action==='function')action();return;}contentReaderState.afterClose=action;dialog.close();}
  function navigateContentReader(direction){const e=contentReaderState.entry;if(!e)return;const count=e.ids.length,ni=e.index+(direction==='prev'?-1:1);if(ni<0||ni>=count)return;e.index=ni;renderContentReader(direction);}

  function contentCardVariant(p) {
    if(p.type==='night')return 'night';
    if(p.type==='food')return 'food';
    if(p.type==='shopping')return 'shopping';
    if(p.type==='photo')return 'photo';
    return 'place';
  }
  function contentCardCell(label,value,{placeholder=false}={}) {
    const safe=value===undefined||value===null||value===''?'—':value;
    return `<div class="content-card-info-cell${placeholder?' is-placeholder':''}"><span>${esc(label)}</span><strong>${esc(safe)}</strong></div>`;
  }
  function contentCardDetails(p,d=null) {
    const status=p.pdfScheduled===true?'PDF 已安排':'自由探索';
    let cells=[],emphasisLabel='',emphasisValue='';
    if(p.type==='night'){
      cells=[
        ['建議時段',p.time],['停留時間',p.duration],['熱鬧程度',p.crowd?stars(p.crowd):'—'],['適合',p.suitable]
      ];
      emphasisLabel='⌂ 飯店距離';emphasisValue=hotelDistanceCardValue(p,d);
    }else if(p.type==='food'){
      cells=[['口味',p.taste],['適合',p.meal],['建議停留',p.duration],['安排',status]];
      emphasisLabel='料理形式';emphasisValue='料理推薦 · 非指定餐廳';
    }else if(p.type==='shopping'){
      cells=[['購物分類',p.group],['選購時間',p.duration],['類型',p.marketKind||'在地選購'],['安排',status]];
      emphasisLabel='選購建議';emphasisValue=p.group||'自由選購';
    }else if(p.type==='photo'){
      cells=[['行程',Array.isArray(p.days)?p.days.map(x=>'Day '+x).join(' / '):'—'],['停留時間',p.duration],['光線／時段',p.bestTime],['取景',p.drama?'《去有風的地方》':'沿途旅拍']];
      emphasisLabel='拍攝提示';emphasisValue='完整構圖與拍攝建議請點開查看';
    }else{
      cells=[['城市',p.city],['停留時間',p.duration],['類型',category(p).name],['安排',status]];
      emphasisLabel='完整資訊';emphasisValue='地址、交通與來源請點開查看';
    }
    return `<div class="content-card-details"><div class="content-card-info-grid">${cells.map(([label,value])=>contentCardCell(label,value)).join('')}</div><div class="content-card-emphasis"><span>${esc(emphasisLabel)}</span><strong>${esc(emphasisValue||'—')}</strong></div></div>`;
  }
  function contentCardActions(p) {
    const night=p.type==='night';
    return `<div class="content-card-footer"><div class="content-card-actions content-card-actions--${night?'2':'3'}"><button class="action" data-focus="${esc(p.id)}">◎ 地圖看位置</button><a class="action" ${navAnchorAttrs(p)}>↗ <span data-nav-label>${esc(navProviderName(mapProvider))}導航</span></a>${night?'':`<button class="action" data-copy="${esc(p.id)}">${p.addressVerified?'複製地址':'複製地址／搜尋詞'}</button>`}</div></div>`;
  }
  function contentCard(p,d,{readerKind=''}={}) {
    const variant=contentCardVariant(p);
    const rating=p.rating?`${stars(p.rating)} · 網路推薦`:'尚無評分';
    return `<article class="content-card content-card--${variant} content-openable" data-item="${esc(p.id)}"${d?.day?` data-reader-day="${d.day}"`:''}${readerKind?` data-reader-kind="${esc(readerKind)}"`:''} title="點一下查看完整內容">${cardPhotoFigure(p.photoId,'content-card-media')}<div class="content-card-body"><header class="content-card-head"><div class="content-card-heading"><span class="badge">${category(p).symbol} ${esc(p.city)} · ${category(p).name}</span><h3>${esc(p.name)}</h3><span class="content-card-rating">${rating}</span></div>${saveButton(p)}</header><p class="content-card-summary">${esc(p.description)}</p>${contentCardDetails(p,d)}${contentCardActions(p)}</div></article>`;
  }
  function contentStoryCard(s) {
    const days=Array.isArray(s.days)?s.days.map(d=>'Day '+d).join(' / '):'—';
    const cells=[['時期',s.period],['行程',days],['類型',s.kind],['閱讀',`約 ${storyReadMinutes(s)} 分鐘`]];
    return `<article class="content-card content-card--story" id="story-${esc(s.id)}" data-culture-story="${esc(s.id)}" role="button" tabindex="0" aria-label="閱讀故事：${esc(s.title)}">${cardPhotoFigure(s.photoId,'content-card-media')}<div class="content-card-body"><header class="content-card-head"><div class="content-card-heading"><span class="badge">${esc(s.city)} · ${esc(s.kind)}</span><h3>${esc(s.title)}</h3><span class="content-card-rating">${esc(s.period)}</span></div></header><p class="content-card-summary">${esc(s.intro)}</p><div class="content-card-details"><div class="content-card-info-grid">${cells.map(([label,value])=>contentCardCell(label,value)).join('')}</div><div class="content-card-emphasis"><span>旅途閱讀</span><strong>完整故事與旅途觀察請點開查看</strong></div></div><div class="content-card-footer"><button type="button" class="content-card-read" data-story="${esc(s.id)}" aria-label="閱讀完整故事：${esc(s.title)}">閱讀完整故事 →</button></div></div></article>`;
  }
  function hotelPanel(d) {
    if(!d.hotel)return '<div class="hotel-panel journey-subcard journey-subcard--stay"><span class="eyebrow">HOME SWEET HOME</span><h3>溫暖的家</h3><p class="small">今日返程，無當晚飯店。</p></div>';
    const p=items[d.hotel];return `<div class="hotel-panel day-stay-card journey-subcard journey-subcard--stay content-openable" data-item="${esc(p.id)}" data-reader-day="${d.day}" title="點一下查看完整住宿資訊">${itemThumbnail(p,'stay-thumb')}<div class="day-stay-copy"><span class="eyebrow">⌂ TONIGHT’S STAY · 今晚住宿</span><h3>${esc(p.name)}</h3><p class="small">${p.addressVerified?esc(p.address):'完整地址與分店待確認；可先複製飯店名稱搜尋。'}</p>${actions(p)}</div></div>`;
  }
  function flightAirlineLabel(f) {
    const name=f.airline || (String(f.flight||'').startsWith('CX')?'國泰航空':String(f.flight||'').startsWith('MU')?'中國東方航空':'航空公司');
    return name==='中國東方航空'?'東方航空':name;
  }
  function flightDisplayNo(f){ return f.flightNo || f.flight || ''; }
  function flightLabelText(f){ return `${flightAirlineLabel(f)} ${flightDisplayNo(f)}`.trim(); }
  function flightBlock(direction) {
    return `<h3 class="subheading">✈ ${direction==='outbound'?'去程':'回程'}航班</h3><p class="small">PDF 兩組航班，請核對自己的機票；班表非即時資訊。</p><div class="flight-grid">${tripData.flights.map(g=>`<div class="flight-group utility-card utility-card--flight"><h3>${g.name}</h3>${g[direction].map(f=>`<div class="flight-row"><div class="flight-row-copy"><strong><span class="airline-label">${esc(flightAirlineLabel(f))}</span>${esc(flightDisplayNo(f))} · ${esc(f.route)}</strong><span>${esc(f.time)}</span></div></div>`).join('')}</div>`).join('')}</div>`;
  }
  function itineraryDayVisual(d) {
    const photoId=d.photoId;
    return photoId&&tripData.photos[photoId]?tripData.photos[photoId]:null;
  }
  function itineraryDayDate(d) {
    try{return new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',weekday:'short',timeZone:tripData.timezone}).format(new Date(d.date+'T12:00:00'));}
    catch{return d.date.slice(5).replace('-','/');}
  }
  function flightSpanSummary(direction) {
    if(!direction)return '';
    return tripData.flights.map((group,index)=>{
      const legs=group[direction]||[];if(!legs.length)return '';
      const first=(legs[0].time.match(/\d{1,2}:\d{2}/g)||[])[0];
      const lastTimes=(legs[legs.length-1].time.match(/\d{1,2}:\d{2}/g)||[]);
      const last=lastTimes[lastTimes.length-1];
      const carriers=[...new Set(legs.map(f=>flightAirlineLabel(f)).filter(Boolean))].join('→');
      return first&&last?`${index===0?'第一組':'第二組'} ${carriers?carriers+' ':''}${first}→${last}`:'';
    }).filter(Boolean).join(' · ');
  }
  function itineraryEventMeta(d,p) {
    if((p.id==='arrival'||p.id==='return')&&d.flight)return flightSpanSummary(d.flight);
    if(p.id==='train')return '手冊參考 1251 / 1707 · 以實際票券為準';
    return '時間依領隊公告';
  }
  function itineraryEventKind(p) {
    return ['arrival','return','train'].includes(p.id)||/(→|機場|動車|航班)/.test(p.name)?'transport':'activity';
  }
  function itineraryTimetable() {
    const maxStops=Math.max(...tripData.days.map(d=>d.itinerary.length));
    const labels=Array.from({length:maxStops},(_,i)=>`第 ${i+1} 站`);
    const axis=`<aside class="itinerary-time-axis" aria-hidden="true"><div class="itinerary-axis-head"><strong>8 DAYS</strong><span>站序</span></div>${labels.map(label=>`<div class="itinerary-axis-slot">${label}</div>`).join('')}<div class="itinerary-axis-slot hotel">住宿</div></aside>`;
    const columns=tripData.days.map(d=>{
      const slots=Array.from({length:maxStops},(_,i)=>{
        const p=items[d.itinerary[i]];
        if(!p)return '<div class="itinerary-table-slot empty" aria-hidden="true"></div>';
        const kind=itineraryEventKind(p),meta=itineraryEventMeta(d,p);
        return `<div class="itinerary-table-slot"><button type="button" class="itinerary-table-event utility-card utility-card--timetable ${kind}" data-reader-item="${esc(p.id)}" data-reader-day="${d.day}" data-reader-kind="itinerary" title="點一下查看 ${esc(p.name)} 完整內容"><span>${kind==='transport'?'✈':'⌖'} ${esc(p.name)}</span><small>${esc(meta)}</small></button></div>`;
      }).join('');
      const hotel=d.hotel?`<button type="button" class="itinerary-table-event utility-card utility-card--timetable hotel" data-reader-item="${esc(d.hotel)}" data-reader-day="${d.day}" data-reader-kind="hotel" title="點一下查看 ${esc(items[d.hotel].name)} 完整住宿資訊"><span>▰ ${esc(items[d.hotel].name)}</span><small>${esc(d.city)} · 住宿一晚</small></button>`:'<div class="itinerary-table-home">⌂ 溫暖的家</div>';
      return `<article class="itinerary-day-column"><header><div><strong>${esc(itineraryDayDate(d))}</strong><span>Day ${d.day}</span></div><b>${esc(d.city)}</b></header>${slots}<div class="itinerary-table-slot hotel-slot">${hotel}</div></article>`;
    }).join('');
    $('#itinerary-timetable').innerHTML=`<div class="itinerary-timetable-inner">${axis}<div id="itinerary-timetable-scroll" class="itinerary-timetable-scroll" tabindex="0" aria-label="八天行程時刻表，可左右滑動"><div class="itinerary-day-columns">${columns}</div></div></div>`;
  }
  function timetableRenderTheme(){
    return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  }
  function timetableImageSvg(theme=timetableRenderTheme()) {
    const maxStops=Math.max(...tripData.days.map(d=>d.itinerary.length));
    const axisW=112,dayW=286,headerH=92,rowH=76,pad=24,titleH=78;
    const width=pad*2+axisW+dayW*tripData.days.length;
    const height=pad*2+titleH+headerH+rowH*(maxStops+1)+34;
    const x0=pad,y0=pad+titleH;
    const light={bg:'#f7f3ea',ink:'#182a31',muted:'#66766f',dark:'#17313a',line:'#d5d6cf',axis:'#efe9dc',axisHotel:'#f5eddc',cell:'#fbfaf6',activity:'#e5f6ef',activityStroke:'#55b48f',transport:'#f0e7fb',transportStroke:'#b763de',hotelBg:'#f8f2e5',hotel:'#faefd8',hotelStroke:'#d49b35',home:'#796d4a',cityBg:'#f7f3ea',cityInk:'#182a31',date:'#ffffff',day:'#b8c6c3',footer:'#829087'};
    const dark={bg:'#46413d',ink:'#eef3ef',muted:'#b5bfba',dark:'#18333c',line:'#5b5b55',axis:'#4c463b',axisHotel:'#514a3b',cell:'#4a4743',activity:'#3d4e46',activityStroke:'#66c39f',transport:'#493d50',transportStroke:'#bc91d6',hotelBg:'#514b3f',hotel:'#625c4e',hotelStroke:'#e0b568',home:'#d5c6a2',cityBg:'#d9d3c4',cityInk:'#263d3a',date:'#ffffff',day:'#b9c8c5',footer:'#a8b4ae'};
    const colors=theme==='dark'?dark:light;
    const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const clip=(v,n=18)=>{v=String(v??'');return v.length>n?v.slice(0,n-1)+'…':v;};
    const text=(x,y,value,size=18,weight=600,fill=colors.ink,anchor='start')=>`<text x="${x}" y="${y}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans TC','Microsoft JhengHei',Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${xml(value)}</text>`;
    let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="22" fill="${colors.bg}"/>`;
    out+=text(pad,pad+25,'INTERACTIVE ITINERARY',16,800,theme==='dark'?'#e3bd75':'#a76f26');
    out+=text(pad,pad+56,`${tripData.title || '雲南慢時光'} · 八天完整行程時刻表`,30,850,colors.ink);
    out+=text(width-pad,pad+54,`${tripData.start || ''} — ${tripData.end || ''}`,16,650,colors.muted,'end');
    out+=`<rect x="${x0}" y="${y0}" width="${axisW}" height="${headerH}" fill="${colors.axis}" stroke="${colors.line}"/>`;
    out+=text(x0+axisW/2,y0+36,'8 DAYS',17,850,theme==='dark'?'#e2bd76':'#a87525','middle')+text(x0+axisW/2,y0+62,'站序',14,650,colors.muted,'middle');
    for(let r=0;r<=maxStops;r++){
      const yy=y0+headerH+r*rowH;
      out+=`<rect x="${x0}" y="${yy}" width="${axisW}" height="${rowH}" fill="${r===maxStops?colors.axisHotel:colors.axis}" stroke="${colors.line}"/>`;
      out+=text(x0+axisW/2,yy+46,r===maxStops?'住宿':`第 ${r+1} 站`,15,760,r===maxStops?(theme==='dark'?'#e0c28b':'#886929'):colors.muted,'middle');
    }
    tripData.days.forEach((d,di)=>{
      const x=x0+axisW+di*dayW;
      out+=`<rect x="${x}" y="${y0}" width="${dayW}" height="${headerH}" fill="${colors.dark}" stroke="${theme==='dark'?'#496068':'#506068'}"/>`;
      out+=text(x+14,y0+32,itineraryDayDate(d),17,800,colors.date);
      out+=text(x+14,y0+58,`Day ${d.day}`,14,600,colors.day);
      out+=`<rect x="${x+dayW-82}" y="${y0+27}" rx="7" width="68" height="30" fill="${colors.cityBg}"/>`+text(x+dayW-48,y0+48,clip(d.city,5),14,800,colors.cityInk,'middle');
      for(let r=0;r<maxStops;r++){
        const yy=y0+headerH+r*rowH,p=items[d.itinerary[r]];
        out+=`<rect x="${x}" y="${yy}" width="${dayW}" height="${rowH}" fill="${colors.cell}" stroke="${colors.line}"/>`;
        if(!p)continue;
        const kind=itineraryEventKind(p),transport=kind==='transport';
        const fill=transport?colors.transport:colors.activity,stroke=transport?colors.transportStroke:colors.activityStroke;
        out+=`<rect x="${x+9}" y="${yy+8}" width="${dayW-18}" height="${rowH-16}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/><rect x="${x+9}" y="${yy+8}" width="5" height="${rowH-16}" rx="2.5" fill="${stroke}"/>`;
        out+=text(x+23,yy+34,`${transport?'✈':'⌖'} ${clip(p.name,17)}`,15,820,colors.ink);
        out+=text(x+23,yy+56,clip(itineraryEventMeta(d,p),25),12,600,colors.muted);
      }
      const hy=y0+headerH+maxStops*rowH;
      out+=`<rect x="${x}" y="${hy}" width="${dayW}" height="${rowH}" fill="${colors.hotelBg}" stroke="${colors.line}"/>`;
      if(d.hotel){const p=items[d.hotel];out+=`<rect x="${x+9}" y="${hy+8}" width="${dayW-18}" height="${rowH-16}" rx="9" fill="${colors.hotel}" stroke="${colors.hotelStroke}" stroke-width="1.3"/><rect x="${x+9}" y="${hy+8}" width="5" height="${rowH-16}" rx="2.5" fill="${colors.hotelStroke}"/>`;out+=text(x+23,hy+34,`▰ ${clip(p.name,17)}`,15,820,colors.ink)+text(x+23,hy+56,`${clip(d.city,7)} · 住宿一晚`,12,600,colors.muted);}else out+=text(x+dayW/2,hy+45,'⌂ 溫暖的家',15,720,colors.home,'middle');
    });
    out+=text(width-pad,height-14,'雲南慢時光 · 完整時刻表',12,600,colors.footer,'end')+'</svg>';
    return {svg:out,width,height,theme};
  }
  async function timetablePngBlob(built=timetableImageSvg()){
    const svgUrl=URL.createObjectURL(new Blob([built.svg],{type:'image/svg+xml;charset=utf-8'}));
    try{
      const image=new Image();const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});image.src=svgUrl;await loaded;
      const scale=Math.max(1,Math.min(2,3200/built.width));const canvas=document.createElement('canvas');canvas.width=Math.round(built.width*scale);canvas.height=Math.round(built.height*scale);
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle=built.theme==='dark'?'#46413d':'#f7f3ea';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);ctx.drawImage(image,0,0,built.width,built.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));if(!blob)throw new Error('PNG export failed');
      return {blob,width:built.width,height:built.height,theme:built.theme};
    }finally{URL.revokeObjectURL(svgUrl);}
  }
  let timetablePreviewUrl='',timetablePreviewBlob=null,timetablePreviewTheme='';
  function revokeTimetablePreview(){if(timetablePreviewUrl){URL.revokeObjectURL(timetablePreviewUrl);timetablePreviewUrl='';}}
  async function openTimetablePreview(){
    const dialog=$('#timetable-preview-dialog'),img=$('#timetable-preview-image'),size=$('#timetable-image-size');if(!dialog||!img)return;
    if(size)size.textContent='產生與下載完全相同的預覽中…';
    try{
      const built=timetableImageSvg(),rendered=await timetablePngBlob(built);
      revokeTimetablePreview();timetablePreviewBlob=rendered.blob;timetablePreviewTheme=rendered.theme;timetablePreviewUrl=URL.createObjectURL(rendered.blob);img.src=timetablePreviewUrl;
      if(size)size.textContent=`完整尺寸 ${rendered.width} × ${rendered.height}px · 預覽與下載使用同一張 PNG`;
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    }catch(e){console.error(e);if(size)size.textContent='完整時刻表預覽產生失敗';toast('完整時刻表預覽產生失敗');}
  }
  async function downloadTimetablePng(){
    try{
      const theme=timetableRenderTheme();let blob=timetablePreviewBlob;
      if(!blob||timetablePreviewTheme!==theme){const rendered=await timetablePngBlob(timetableImageSvg(theme));blob=rendered.blob;timetablePreviewBlob=blob;timetablePreviewTheme=theme;}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`雲南慢時光_八天完整行程時刻表_${tripData.start || ''}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('完整時刻表 PNG 已下載');
    }catch(e){console.error(e);toast('圖片產生失敗，請稍後再試');}
  }
  function itineraryStripCard(d) {
    const photo=itineraryDayVisual(d);
    const visual=photo?`<div class="itinerary-slide-photo"><img data-photo-managed="1" src="${esc(photo.src)}"${photo.fallbackSrc?` data-fallback-src="${esc(photo.fallbackSrc)}"`:''} alt="${esc(photo.alt)}" loading="lazy" decoding="async" width="${photo.width}" height="${photo.height}"><span>DAY ${String(d.day).padStart(2,'0')}</span></div>`:`<div class="itinerary-slide-photo empty"><em class="photo-missing-label">無此圖</em><span>DAY ${String(d.day).padStart(2,'0')}</span></div>`;
    const preview=d.itinerary.slice(0,4).map((id,i)=>`<li><b>${String(i+1).padStart(2,'0')}</b>${esc(items[id].name)}</li>`).join('');
    const hotelSlot=d.hotel?`▰ ${esc(items[d.hotel].name)}`:'<span class="itinerary-slide-hotel-placeholder" aria-hidden="true">&nbsp;</span>';
    const moreCount=Math.max(0,d.itinerary.length-4);
    const moreSlot=`<small class="itinerary-more${moreCount?'':' is-empty'}"${moreCount?'':' aria-hidden="true"'}>${moreCount?`＋${moreCount} 個行程`:'＋0 個行程'}</small>`;
    return `<article class="itinerary-slide-card journey-card journey-card--summary" data-itinerary-card="${d.day}" aria-label="Day ${d.day} ${esc(d.city)}">${visual}<div class="itinerary-slide-body"><div class="itinerary-slide-meta"><span>${esc(itineraryDayDate(d))}</span><b>${esc(d.city)}</b></div><h3>${esc(d.title)}</h3><p>${esc(d.route)}</p><ol>${preview}</ol>${moreSlot}<div class="itinerary-slide-hotel${d.hotel?'':' is-empty'}">${hotelSlot}</div><button type="button" class="itinerary-slide-open" data-itinerary-open="${d.day}">展開這一天 →</button></div></article>`;
  }
  function setItineraryExpanded(expanded,{scroll=false}={}) {
    itineraryExpanded=!!expanded;
    const days=$('#days'),carousel=$('#itinerary-carousel-section'),strip=$('#itinerary-strip'),toggle=$('[data-itinerary-toggle]');
    if(days){
      days.hidden=!itineraryExpanded;
      days.setAttribute('aria-hidden',String(!itineraryExpanded));
    }
    if(carousel){
      carousel.hidden=false;
      carousel.classList.toggle('is-expanded',itineraryExpanded);
      carousel.setAttribute('data-journal-mode',itineraryExpanded?'expanded':'cards');
    }
    if(strip){
      strip.hidden=itineraryExpanded;
      strip.setAttribute('aria-hidden',String(itineraryExpanded));
    }
    if(toggle){
      toggle.setAttribute('aria-expanded',String(itineraryExpanded));
      toggle.innerHTML=itineraryExpanded?'<span>▤</span> 收合成滑動卡片':'<span>▦</span> 展開完整行程';
    }
    if(scroll){
      const target=itineraryExpanded?days:carousel;
      requestAnimationFrame(()=>target?.scrollIntoView({block:'start',behavior:'smooth'}));
    }
  }
  function openItineraryDay(day) {
    const dayNumber=Number(day),el=$(`#day-${dayNumber}`);if(!el)return;
    const existing=itineraryDayReturnState;
    itineraryDayReturnState={
      day:dayNumber,
      expanded:existing?existing.expanded:itineraryExpanded,
      stripScrollLeft:existing?existing.stripScrollLeft:($('#itinerary-strip')?.scrollLeft||0)
    };
    // A single-day request is unambiguous: reveal the full journal, collapse any other
    // open day, then open and focus the requested day.  This avoids a visually "silent"
    // tap when another details element happened to be open already.
    $$('#days details.day-card').forEach(card=>{if(card!==el)card.open=false;});
    setItineraryExpanded(true);
    el.open=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>el.scrollIntoView({block:'start',behavior:'smooth'})));
  }
  // DAILY JOURNAL has one control path only. Native scrolling decides tap vs swipe; the
  // explicit CTA receives a normal click and never participates in the document action delegate.
  function bindItineraryExpansionController(){
    const section=$('#itinerary-carousel-section');
    if(!section||section.dataset.itineraryExpansionController==='1')return;
    section.dataset.itineraryExpansionController='1';
    section.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-itinerary-toggle],[data-itinerary-open]');
      if(!button||!section.contains(button))return;
      // This control is locally owned; do not pass the same click into the document router.
      event.stopPropagation();
      if(button.hasAttribute('data-itinerary-toggle')){
        itineraryDayReturnState=null;
        setItineraryExpanded(!itineraryExpanded,{scroll:true});
      }else openItineraryDay(button.dataset.itineraryOpen);
    });
  }

  function bindItineraryDayReturnMode() {
    const days=$('#days');if(!days||days.dataset.dayReturnController==='1')return;
    days.dataset.dayReturnController='1';
    days.addEventListener('toggle',event=>{
      const el=event.target?.closest?.('details.day-card');
      if(!el||!days.contains(el)||el.open||!itineraryDayReturnState)return;
      const dayNumber=Number(el.id.replace('day-',''));
      if(dayNumber!==itineraryDayReturnState.day)return;
      const state=itineraryDayReturnState;itineraryDayReturnState=null;
      // A day launched from the slider closes back to the slider. If the full journal
      // was already open, native <details> simply remains in full-journal mode.
      if(!state.expanded){
        setItineraryExpanded(false);
        requestAnimationFrame(()=>{
          const strip=$('#itinerary-strip');if(strip)strip.scrollLeft=state.stripScrollLeft;
          $('#itinerary-carousel-section')?.scrollIntoView({block:'start',behavior:'smooth'});
        });
      }
    },true);
  }
  function renderDays() {
    itineraryTimetable();
    $('#itinerary-strip').innerHTML=tripData.days.map(itineraryStripCard).join('');
    $('#days').innerHTML=tripData.days.map(d=>`<details class="day-card journey-card journey-card--day" id="day-${d.day}"><summary><div class="day-number"><small>DAY</small>${String(d.day).padStart(2,'0')}</div><div class="day-summary"><div class="day-meta">${d.date.slice(5).replace('-',' / ')} · ${esc(d.route)}</div><h3>${esc(d.title)}</h3><p>${d.itinerary.slice(0,3).map(id=>esc(items[id].name)).join(' · ')}</p><div class="day-hotel">⌂ ${d.hotel?esc(items[d.hotel].name):'溫暖的家'}</div><div class="day-counts"><span>☾ ${d.nightRecommendations.length} 個夜遊提案</span><span>♨ ${d.foods.length} 道必吃</span></div></div><span class="expand" aria-hidden="true">＋</span></summary><div class="day-detail day-detail-flow"><section class="day-plan-section">${photoFigure(d.photoId,'day-photo day-detail-photo')}<span class="eyebrow">THE DAY’S PLAN · 既定行程</span><ol class="timeline">${d.itinerary.map(id=>{const p=items[id];return `<li class="content-openable timeline-with-thumb" data-item="${esc(p.id)}" data-reader-day="${d.day}" title="點一下查看完整內容"><div class="timeline-copy"><div class="timeline-head"><h3>${esc(p.name)}</h3>${saveButton(p)}</div><p>${esc(p.description)}</p>${actions(p)}</div>${itemThumbnail(p,'timeline-thumb')}</li>`;}).join('')}</ol></section><section class="day-stay-section">${hotelPanel(d)}</section><section class="day-after-section"><div class="meal-list">${d.meals.map((m,i)=>`<div><span>${['早餐','午餐','晚餐'][i]}</span>${esc(m)}</div>`).join('')}</div><div class="note">${esc(d.note)}</div><h3>住宿附近散步／夜遊</h3><p class="small">${d.nearby.length?d.nearby.map(id=>esc(items[id].name)).join(' · '):'今晚休息，或視體力在住宿附近活動。'}${d.nearby.length?'。以高德當晚即時導航與現場狀況為準。':''}</p><div class="actions"><button class="primary" data-reader-night-day="${d.day}">☾ 看這晚的提案</button><button class="action" data-map-day="${d.day}">◇ 今日地圖</button></div>${d.foods.length?`<h3 class="subheading">這一站必吃</h3><div class="chips">${d.foods.map(id=>`<button data-food-id="${id}">${esc(items[id].name)}</button>`).join('')}</div>`:''}${d.shopping.length?`<h3>順路選購</h3><div class="chips">${d.shopping.map(id=>`<button type="button" data-reader-item="${esc(id)}" data-reader-day="${d.day}" data-reader-kind="shopping">${esc(items[id].name)}</button>`).join('')}</div>`:''}${dayCulture(d)}${d.flight?flightBlock(d.flight):''}</section></div></details>`).join('');
    bindItineraryDayReturnMode();
    setItineraryExpanded(itineraryExpanded);
    bindItineraryExpansionController();
  }
  function renderNight() {
    const select=$('#night-day');if(select)select.value=String(nightDay);
    const content=$('#night-content');if(!content)return;
    if(String(nightDay)==='all'){
      const groups=tripData.days.map(d=>{
        const cards=d.nightRecommendations.map(id=>items[id]).filter(Boolean);
        if(!cards.length)return '';
        return `<section class="night-day-group"><div class="night-day-group-head"><div><span class="eyebrow">DAY ${String(d.day).padStart(2,'0')} · ${esc(d.date.slice(5).replace('-','/'))}</span><h3>${esc(d.city)} · 今晚住宿附近</h3></div><button type="button" class="action" data-night-date="${d.day}">只看這晚 →</button></div><div class="content-grid">${cards.map(p=>contentCard(p,d)).join('')}</div></section>`;
      }).filter(Boolean).join('');
      content.innerHTML=`<div class="note">八天夜間提案總覽。住宿附近步行優先；需要打車時，以高德當晚顯示 20 分鐘內為原則。</div>${groups||'<div class="empty"><h3>目前沒有夜間提案</h3></div>'}`;
    }else{
      const d=tripData.days.find(d=>d.day===Number(nightDay));if(!d)return;
      content.innerHTML=`${hotelPanel(d)}<div class="note">今晚以住宿地點為中心，優先安排步行或短程打車可到的活動，尤其是夜景、夜市與在地文化；打車以高德當晚顯示 20 分鐘內為原則。${esc(d.note)}</div>${d.nightRecommendations.length?`<div class="content-grid">${d.nightRecommendations.map(id=>contentCard(items[id],d)).join('')}</div>`:`<div class="empty"><h3>${[1,8].includes(d.day)?'今晚以休息／返程為主':'這晚先不安排住宿附近夜遊'}</h3><p>${esc(tripData.walkNotes[d.day] || '沒有額外夜遊安排。')}</p></div>`}${d.nightCandidates.length?`<details class="walk-pending"><summary>其他住宿附近候選</summary><p>${d.nightCandidates.filter(id=>!d.nightRecommendations.includes(id)).map(id=>esc(items[id].name)).join('、') || '無'}</p><p>這些沒有列入今晚優先順序；若高德當晚顯示 20 分鐘內且體力允許，仍可臨時加入。</p></details>`:''}`;
    }
    syncNightDateRail(false);
    renderedViews.add('night');
  }
  function renderFood() {
    $('#food-filters').innerHTML=['all',...tripData.cities].map(c=>`<button data-city="${c}" class="${c===foodCity?'active':''}" aria-pressed="${c===foodCity}">${c==='all'?'全部城市':c}</button>`).join('');
    $('#food-list').innerHTML=tripData.foods.filter(p=>foodCity==='all'||p.city===foodCity).map(p=>contentCard(p)).join('');
    renderedViews.add('food');
  }
  function renderShopping() {
    $('#shopping-content').innerHTML=`<div class="note warm">${esc(tripData.customsNotice)} <a href="${tripData.customsUrl}" target="_blank" rel="noopener noreferrer">查詢官方規定 ↗</a><br><span class="small">「可以買」是購物建議，並不代表所有品項均可攜帶入境。檢查成分、產地與包裝。</span></div>${['可以買','建議當地吃'].map(group=>`<h3 class="subheading">${group}</h3><div class="content-grid">${tripData.shopping.filter(p=>p.group===group).map(p=>contentCard(p)).join('')}</div>`).join('')}`;
    renderedViews.add('shopping');
  }
  function renderFavorites() {
    $('#favorite-list').innerHTML=favorites.size?[...favorites].map(id=>contentCard(items[id],tripData.days.find(d=>d.day===nightDay),{readerKind:'favorites'})).join(''):'<div class="empty"><div class="big">♡</div><h3>下一個喜歡的地方，留在這裡。</h3><p>點一下景點、美食或伴手禮旁的愛心，就能隨時找回。</p><button class="primary" data-view="itinerary">去看看行程</button></div>';
    renderedViews.add('favorites');
  }
  function syncSaved() {
    document.querySelectorAll('[data-save]').forEach(b=>{const p=items[b.dataset.save],saved=favorites.has(p.id);b.setAttribute('aria-pressed',String(saved));b.setAttribute('aria-label',(saved?'取消收藏':'收藏')+p.name);b.textContent=saved?'♥':'♡';});
    document.querySelectorAll('.fav-count').forEach(el=>el.textContent=favorites.size);
  }
  function toggleSaved(id) {
    if(!items[id])return;
    if(favorites.has(id))favorites.delete(id);else favorites.add(id);
    try{localStorage.setItem(storageKey,JSON.stringify([...favorites]));storageAvailable=true;}catch{storageAvailable=false;}
    renderedViews.delete('favorites');
    syncSaved();if(currentView==='favorites')renderFavorites();
    toast(storageAvailable?(favorites.has(id)?'已加入口袋清單':'已取消收藏'):'無法寫入瀏覽器儲存空間；收藏僅保留至本頁關閉');
  }
  function mapDateWeekday(d) {
    try{return new Intl.DateTimeFormat('zh-TW',{weekday:'short',timeZone:tripData.timezone}).format(new Date(d.date+'T12:00:00')).replace('週','');}
    catch{return '';}
  }
  function mapDateValues(){return ['all',...tripData.days.map(d=>String(d.day))];}
  const dateRailStates=new WeakMap();
  const dataAttr=name=>name.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
  function buildDateRail({railSelector,key,navKey,allSmall,getValue,setValue,step}){
    const rail=$(railSelector);if(!rail)return;
    let state=dateRailStates.get(rail);
    if(!state){
      state={key,navKey,allSmall,getValue,setValue,step,timer:null,programmaticUntil:0};
      dateRailStates.set(rail,state);
      rail.addEventListener('scroll',()=>{
        if(performance.now()<state.programmaticUntil)return;
        clearTimeout(state.timer);
        state.timer=setTimeout(()=>{
          if(performance.now()<state.programmaticUntil)return;
          const attr=dataAttr(state.key),cards=[...rail.querySelectorAll(`[data-${attr}]`)];if(!cards.length)return;
          const center=rail.scrollLeft+rail.clientWidth/2;let nearest=cards[0],distance=Infinity;
          cards.forEach(card=>{const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-center);if(delta<distance){distance=delta;nearest=card;}});
          const value=nearest.dataset[state.key];
          if(value!==String(state.getValue()))state.setValue(value,{center:true,behavior:'smooth'});else syncDateRail(rail,true,'smooth');
        },150);
      },{passive:true});
      rail.addEventListener('wheel',event=>{
        if(rail.scrollWidth<=rail.clientWidth||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
        const max=rail.scrollWidth-rail.clientWidth;if((event.deltaY<0&&rail.scrollLeft<=1)||(event.deltaY>0&&rail.scrollLeft>=max-1))return;
        event.preventDefault();rail.scrollLeft+=event.deltaY;
      },{passive:false});
      rail.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();state.step(event.key==='ArrowLeft'?-1:1);});
      const control=rail.closest('.map-date-control');
      control?.addEventListener('click',event=>{
        const attr=dataAttr(state.key),navAttr=dataAttr(state.navKey);
        const card=event.target.closest?.(`[data-${attr}]`);
        const nav=event.target.closest?.(`[data-${navAttr}]`);
        if(!(card&&rail.contains(card))&&!(nav&&control.contains(nav)))return;
        // Date Rail is locally owned; keep its click out of the document action router.
        event.stopPropagation();
        if(card&&rail.contains(card)){state.setValue(card.dataset[state.key],{center:true,behavior:'smooth'});return;}
        state.step(nav.dataset[state.navKey]==='prev'?-1:1);
      });
    }else{
      clearTimeout(state.timer);
      Object.assign(state,{key,navKey,allSmall,getValue,setValue,step,programmaticUntil:0});
    }
    const attr=dataAttr(state.key);
    rail.innerHTML=`<button type="button" class="map-date-card utility-card utility-card--date" data-${attr}="all" role="option"><strong>全部</strong><b>8 DAYS</b><small>${esc(allSmall)}</small></button>`+tripData.days.map(d=>`<button type="button" class="map-date-card utility-card utility-card--date" data-${attr}="${d.day}" role="option"><strong>${esc(d.date.slice(5).replace('-','/'))}<i>${esc(mapDateWeekday(d))}</i></strong><b>DAY ${String(d.day).padStart(2,'0')}</b><small>${esc(d.city)}${todayDay?.day===d.day?' · 今天':''}</small></button>`).join('');
    syncDateRail(rail,false);
  }
  function syncDateRail(railOrSelector,center=false,behavior='auto'){
    const rail=typeof railOrSelector==='string'?$(railOrSelector):railOrSelector,state=rail?dateRailStates.get(rail):null;if(!rail||!state)return;
    const value=String(state.getValue()),attr=dataAttr(state.key);
    rail.querySelectorAll(`[data-${attr}]`).forEach(card=>{const active=card.dataset[state.key]===value;card.classList.toggle('active',active);card.setAttribute('aria-selected',String(active));if(active)card.setAttribute('aria-current','date');else card.removeAttribute('aria-current');});
    if(!center)return;const card=rail.querySelector(`[data-${attr}="${CSS.escape(value)}"]`);if(!card)return;
    state.programmaticUntil=performance.now()+380;const left=card.offsetLeft-(rail.clientWidth-card.offsetWidth)/2;
    rail.scrollTo({left:Math.max(0,Math.min(rail.scrollWidth-rail.clientWidth,left)),behavior});
  }
  function buildMapDateRail(){buildDateRail({railSelector:'#map-date-rail',key:'mapDate',navKey:'mapDateNav',allSmall:'完整旅程',getValue:()=>$('#map-day')?.value||'all',setValue:setMapDayValue,step:stepMapDate});}
  function syncMapDateRail(center=false,behavior='auto'){syncDateRail('#map-date-rail',center,behavior);}
  function buildNightDateRail(){buildDateRail({railSelector:'#night-date-rail',key:'nightDate',navKey:'nightDateNav',allSmall:'全部夜晚',getValue:()=>String(nightDay),setValue:setNightDayValue,step:stepNightDate});}
  function syncNightDateRail(center=false,behavior='auto'){syncDateRail('#night-date-rail',center,behavior);}
  function setSharedTripDayState(value){
    value=String(value);if(!mapDateValues().includes(value))return false;
    nightDay=value==='all'?'all':Number(value);const mapSelect=$('#map-day'),nightSelect=$('#night-day');
    if(mapSelect)mapSelect.value=value;if(nightSelect)nightSelect.value=value;syncMapDateRail(false);syncNightDateRail(false);return true;
  }
  function setMapDayValue(value,{fit=true,center=true,behavior='smooth'}={}){
    if(!setSharedTripDayState(value))return;renderMap(fit);renderNight();if(center)requestAnimationFrame(()=>{syncMapDateRail(true,behavior);syncNightDateRail(true,behavior);});
  }
  function stepMapDate(direction){const values=mapDateValues(),current=$('#map-day')?.value||'all';let index=Math.max(0,values.indexOf(current));index=Math.max(0,Math.min(values.length-1,index+direction));setMapDayValue(values[index],{fit:true,center:true,behavior:'smooth'});}
  function setNightDayValue(value,{center=true,behavior='smooth'}={}){
    if(!setSharedTripDayState(value))return;renderNight();if(currentView==='map')renderMap(true);if(center)requestAnimationFrame(()=>{syncNightDateRail(true,behavior);syncMapDateRail(true,behavior);});
  }
  function stepNightDate(direction){const values=mapDateValues(),current=String(nightDay);let index=Math.max(0,values.indexOf(current));index=Math.max(0,Math.min(values.length-1,index+direction));setNightDayValue(values[index],{center:true,behavior:'smooth'});}

  function normalizedPlaceName(name='') {
    return String(name)
      .replace(/[·・\s（）()\-—／/「」【】]/g,'')
      .replace(/(?:夜遊|夜間|晚上|夜景|散步)$/g,'')
      .trim();
  }
  function isScheduledDuplicate(p) {
    if(!p)return false;
    if(p.pdfScheduled===true)return true;
    const city=String(p.city||'').trim();
    const name=normalizedPlaceName(p.name);
    if(!name)return false;
    return Object.values(items).some(s=>{
      if(!s||s===p||s.pdfScheduled!==true)return false;
      if(city && s.city && String(s.city).trim()!==city)return false;
      const scheduledName=normalizedPlaceName(s.name);
      if(!scheduledName)return false;
      if(name===scheduledName)return true;
      return Math.min(name.length,scheduledName.length)>=4 && (name.includes(scheduledName)||scheduledName.includes(name));
    });
  }
  function customMapItems() {
    const dayValue=$('#map-day')?.value||'all';
    const dayNumber=dayValue==='all'?null:Number(dayValue);
    return [...customMapPlaces].map(id=>items[id]).filter(Boolean)
      .filter(p=>!isScheduledDuplicate(p))
      .filter(p=>dayNumber===null||!Array.isArray(p.days)||p.days.includes(dayNumber))
      .filter(mapFilterMatches);
  }
  function allMapItems() {
    const seen=new Set(),result=[];
    [...mapItems(),...customMapItems()].forEach(p=>{if(p&&!seen.has(p.id)){seen.add(p.id);result.push(p);}});
    return result;
  }
  function renderMapTabs() {
    const tabs=$('#map-strip-tabs');if(!tabs)return;
    const allCount=allMapItems().length;
    const scheduledCount=scheduledMapItems().length;
    const customCount=customMapItems().length;
    tabs.innerHTML=`<button type="button" role="tab" data-map-tab="all" aria-selected="${activeMapTab==='all'}" class="${activeMapTab==='all'?'active':''}">全部 <b>${allCount}</b></button><button type="button" role="tab" data-map-tab="scheduled" aria-selected="${activeMapTab==='scheduled'}" class="${activeMapTab==='scheduled'?'active':''}">已安排 <b>${scheduledCount}</b></button><button type="button" role="tab" data-map-tab="custom" aria-selected="${activeMapTab==='custom'}" class="${activeMapTab==='custom'?'active':''}">自定義 <b>${customCount}</b></button>`;
  }
  function renderMapStrip() {
    const strip=$('#map-list');if(!strip)return;
    renderMapTabs();
    const ps=activeMapTab==='custom'?customMapItems():(activeMapTab==='all'?allMapItems():scheduledMapItems());
    if(ps.length){
      strip.innerHTML=ps.map(mapStripCard).join('');
    }else if(activeMapTab==='custom'){
      strip.innerHTML='<div class="map-strip-empty"><h3>還沒有自定義地點</h3><p>點地圖座標，再從左側小卡按「＋ 自定義」。</p></div>';
    }else{
      strip.innerHTML='<div class="map-strip-empty"><h3>這一天沒有此類項目</h3><p>試試其他日期或「全部」。</p></div>';
    }
    syncMapStripSelection(false);updateMapStripDistances();
  }
  function toggleCustomMap(id) {
    const p=items[id];if(!p)return;
    if(customMapPlaces.has(id))customMapPlaces.delete(id);else customMapPlaces.add(id);
    try{localStorage.setItem(customMapStorageKey,JSON.stringify([...customMapPlaces]));storageAvailable=true;}catch{storageAvailable=false;}
    const marker=markers.get(selectedMarkerId)||markers.get(id),group=markerGroups.get(marker)||[p];
    if(selectedMapId===id)renderMapFeatureCard(p,group.includes(p)?group:[p]);
    renderMapStrip();
    toast(storageAvailable?(customMapPlaces.has(id)?'已加入自定義地點':'已從自定義移除'):'無法寫入瀏覽器儲存空間；自定義僅保留至本頁關閉');
  }
  function scheduledMapItems() {
    return mapItems().filter(p=>p.pdfScheduled===true);
  }
  function mapItems() {
    const dayValue=$('#map-day').value;
    const ds=dayValue==='all'?tripData.days:tripData.days.filter(d=>String(d.day)===dayValue);
    const ids=new Set(ds.flatMap(d=>[...d.itinerary,...d.nightRecommendations,...(d.nightCandidates||[]),...d.foods,...d.shopping,...(d.hotel?[d.hotel]:[])]));
    tripData.photoSpots.filter(p=>dayValue==='all'||p.days.includes(Number(dayValue))).forEach(p=>ids.add(p.id));
    if(dayValue==='all')tripData.shopping.forEach(p=>ids.add(p.id));
    return [...ids].map(id=>items[id]).filter(mapFilterMatches);
  }
  function popup(p) {
    const day=tripData.days.find(d=>String(d.day)===$('#map-day').value);
    return `<h3>${esc(p.name)}</h3><p>${category(p).name} · ${stars(p.rating)}<br>停留：${esc(p.duration)}</p><p>${esc(p.description)}</p><p class="small">${esc(p.coordinateNote)}<br>${day?esc(distance(p,day)):'選擇日期以查看與當晚飯店的距離'}</p>${actions(p,true)}`;
  }
  function resolveMarkerOverlaps() {
    if(!map||!window.L||!markerGroups.size)return;
    const entries=[];
    markerGroups.forEach((group,marker)=>{
      const p=group?.[0];
      if(!p||!hasCoords(p))return;
      const trueLatLng=L.latLng(p.lat,p.lng);
      marker.setLatLng(trueLatLng);
      entries.push({marker,trueLatLng,point:map.latLngToContainerPoint(trueLatLng)});
    });
    if(entries.length<2)return;
    const threshold=46;
    const visited=new Set();
    for(let i=0;i<entries.length;i++){
      if(visited.has(i))continue;
      const cluster=[];
      const queue=[i];visited.add(i);
      while(queue.length){
        const a=queue.shift();cluster.push(a);
        for(let j=0;j<entries.length;j++){
          if(visited.has(j))continue;
          const dx=entries[a].point.x-entries[j].point.x,dy=entries[a].point.y-entries[j].point.y;
          if(Math.hypot(dx,dy)<threshold){visited.add(j);queue.push(j);}
        }
      }
      if(cluster.length<2)continue;
      const cx=cluster.reduce((sum,k)=>sum+entries[k].point.x,0)/cluster.length;
      const cy=cluster.reduce((sum,k)=>sum+entries[k].point.y,0)/cluster.length;
      const radius=Math.min(34,24+cluster.length*2);
      cluster.forEach((k,pos)=>{
        const angle=-Math.PI/2+(Math.PI*2*pos/cluster.length);
        const pt=L.point(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius);
        entries[k].marker.setLatLng(map.containerPointToLatLng(pt));
      });
    }
  }

  function fitMapToVisiblePlaces(places) {
    if(!map||!window.L)return;
    // Use only unique coordinate points; several cards can intentionally share one marker.
    const unique=[];
    const seen=new Set();
    places.filter(hasCoords).forEach(p=>{
      const key=`${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;
      if(seen.has(key))return;
      seen.add(key);unique.push([p.lat,p.lng]);
    });
    if(!unique.length)return;

    const desktop=window.matchMedia('(min-width: 761px)').matches;
    const featureCard=$('#map-feature-card');
    const cardVisible=Boolean(featureCard && !featureCard.hidden);
    // On desktop the detail card floats over the left side of the map. Reserve that
    // space only while the card is actually visible. Once the user closes it, use
    // the full map width for day/category auto-fit until a marker is clicked again.
    const paddingTopLeft=desktop&&cardVisible?[390,52]:[44,44];
    const paddingBottomRight=desktop?[52,52]:[44,44];
    map.stop();
    map.invalidateSize({pan:false});
    map.fitBounds(L.latLngBounds(unique),{
      paddingTopLeft,
      paddingBottomRight,
      maxZoom:14,
      animate:false
    });
  }
  function renderMap(fitView=true) {
    syncMapDateRail(false);
    $('#map-filters').innerHTML=['all','itinerary','hotel','night','food','shopping','photo'].map(type=>{
      const active=type==='all'?mapFilterIsAll():mapFilters.has(type);
      return `<button data-filter="${type}" class="${active?'active':''}" aria-pressed="${active}">${type==='all'?'<span class="filter-map-icon">⌖</span>全部':`<span class="filter-map-icon" style="--marker-color:${tripData.categories[type].color}">${mapIconSvg(type)}</span>${tripData.categories[type].name}`}</button>`;
    }).join('');
    const ps=mapItems(), known=ps.filter(hasCoords), missing=ps.length-known.length;
    $('#map-status').textContent=`${ps.length} 筆地點／項目 · ${known.length} 筆有參考座標 · ${missing} 筆待定位（仍可在下方導航與收藏）`;
    renderMapStrip();
    if(!window.L){$('#map').innerHTML='<div class="empty"><h3>地圖暫時無法載入</h3><p>請連線後重新整理。下方地點清單、地址複製與收藏仍可使用。</p><button class="action" data-reload>重新載入</button></div>';renderMapFeatureCard(null);return;}
    if(!map){
      map=L.map('map',{scrollWheelZoom:false,zoomControl:false}).setView([26.25,101.1],7);
      // Keep the map canvas clear on mobile: navigation controls live together at bottom-right.
      const LocateControl=L.Control.extend({
        options:{position:'bottomright'},
        onAdd(){
          const wrap=L.DomUtil.create('div','leaflet-bar leaflet-control map-locate-control');
          const button=L.DomUtil.create('button','map-locate-button',wrap);
          button.type='button';
          button.title='定位到我的位置';
          button.setAttribute('aria-label','定位到我的位置');
          button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.disableScrollPropagation(wrap);
          L.DomEvent.on(button,'click',e=>{
            L.DomEvent.stop(e);
            if(watchId!==null&&userLocationPoint){
              map.stop();map.setView(userLocationPoint,Math.max(map.getZoom(),15),{animate:false});
            }else startLocation();
          });
          return wrap;
        }
      });
      new LocateControl().addTo(map);
      L.control.zoom({position:'bottomright'}).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{$('#map-status').textContent='底圖連線不穩；標記與下方清單仍可使用。'}).addTo(map);
      map.createPane('userLocation').style.zIndex=625;
      layer=L.layerGroup().addTo(map);
      map.on('click',e=>showNearby(e.latlng,true));
      map.on('zoomend',()=>requestAnimationFrame(resolveMarkerOverlaps));
    }
    layer.clearLayers();markers.clear();markerGroups.clear();
    const groups=new Map();known.forEach(p=>{const key=`${p.lat},${p.lng}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
    const visibleIds=new Set(ps.map(p=>p.id));
    if(!selectedMapId||!visibleIds.has(selectedMapId))selectedMapId=known[0]?.id||null;
    if(!selectedMarkerId||!visibleIds.has(selectedMarkerId))selectedMarkerId=selectedMapId;
    groups.forEach(group=>{
      const p=group[0],selected=group.some(x=>x.id===selectedMarkerId||x.id===selectedMapId);
      const marker=L.marker([p.lat,p.lng],{title:group.map(x=>x.name).join('、'),icon:mapMarkerIcon(group,selected),riseOnHover:true}).addTo(layer);
      markerGroups.set(marker,group);group.forEach(x=>markers.set(x.id,marker));
      marker.on('click',()=>{
        // A map marker is the explicit way to reopen the floating detail card after
        // the user has dismissed it with ×. Other interactions keep it collapsed.
        setMapFeatureCardHidden(false);
        const current=group.find(x=>x.id===selectedMapId);
        const target=current||group[0];
        selectMapPlace(target.id,{anchorId:target.id,nearby:true,pan:false});
      });
    });
    requestAnimationFrame(resolveMarkerOverlaps);
    const selected=items[selectedMapId];
    if(selected){const marker=markers.get(selectedMarkerId)||markers.get(selectedMapId);renderMapFeatureCard(selected,markerGroups.get(marker)||[selected]);}
    else renderMapFeatureCard(null);
    syncMapStripSelection(false);
    map.invalidateSize({pan:false});
    if(fitView!==false&&known.length)fitMapToVisiblePlaces(known);
    requestAnimationFrame(()=>requestAnimationFrame(resolveMarkerOverlaps));
  }
  function ensureViewRendered(name) {
    // Shopping is cheap to render and is a primary content tab. Rebuild it whenever the
    // user enters the tab so a stale/emptied DOM can never leave「雲南必買」blank.
    if(name==='shopping'){renderShopping();return;}
    if(renderedViews.has(name))return;
    if(name==='photos')renderPhotos();
    else if(name==='culture')renderCulture();
    else if(name==='night')renderNight();
    else if(name==='food')renderFood();
    else if(name==='favorites')renderFavorites();
  }
  function usesMobileDocumentFlow(){ return window.matchMedia('(max-width:600px)').matches; }
  function workspaceDocumentTop(){ const el=$('.workspace');return el?(el.getBoundingClientRect().top+(window.scrollY||0)):0; }
  function stickyMainTabHeight(){
    const nav=$('.section-nav');
    return nav?Math.ceil(nav.getBoundingClientRect().height):0;
  }
  function scrollMobileViewToTop(){
    if(!usesMobileDocumentFlow())return;
    // The sticky main-tab bar overlays document content. Position the workspace itself
    // one tab-bar height below the viewport top so headings such as AFTER THE SUN SETS
    // remain completely visible instead of being hidden behind the sticky navigation.
    const place=()=>{
      const target=Math.max(0,workspaceDocumentTop()-stickyMainTabHeight());
      window.scrollTo({left:window.scrollX||0,top:target,behavior:'auto'});
    };
    requestAnimationFrame(()=>{place();requestAnimationFrame(place);});
  }
  function centerActiveNavButton(name) {
    const nav=$('.section-nav'),button=nav?.querySelector(`[data-view="${CSS.escape(name)}"]`);
    if(!nav||!button)return;
    const left=button.offsetLeft-(nav.clientWidth-button.offsetWidth)/2;
    nav.scrollTo({left:Math.max(0,left),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function syncAppStageMetrics() {
    const nav=$('.section-nav'),bottom=$('.bottom-nav');
    const root=document.documentElement;
    if(nav)root.style.setProperty('--app-nav-height',`${Math.ceil(nav.getBoundingClientRect().height)}px`);
    const bottomVisible=bottom&&getComputedStyle(bottom).display!=='none';
    root.style.setProperty('--app-bottom-nav-height',`${bottomVisible?Math.ceil(bottom.getBoundingClientRect().height):0}px`);
  }
  function ensureAppStageVisible() {
    const nav=$('.section-nav');
    if(!nav)return;
    const rect=nav.getBoundingClientRect();
    // When a shortcut above the hero changes tabs, bring the app stage into view once.
    // Normal tab changes happen while the sticky nav is already at the top and do not move the page.
    if(rect.top>2 || rect.bottom<0)nav.scrollIntoView({block:'start',behavior:'auto'});
  }
  function showView(name,scroll=true,fitMap=null) {
    if(!['itinerary','map','night','food','shopping','favorites','tips','culture','photos'].includes(name))name='itinerary';
    const previous=currentView,changing=previous!==name;
    currentView=name;
    ensureViewRendered(name);

    // Desktop keeps mounted panels inside the app stage. Mobile uses one document scroll;
    // inactive views stay mounted but only the active view participates in document flow.
    document.querySelectorAll('.view').forEach(el=>{
      const active=el.id===`view-${name}`;
      if(el.hidden)el.hidden=false;
      el.classList.toggle('is-active',active);
      el.setAttribute('aria-hidden',String(!active));
      try{el.inert=!active;}catch{/* inert is progressive enhancement */}
    });
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});

    if(name==='map'){
      // The Leaflet container is never display:none, so its center/zoom/selection survive.
      // Explicit day/filter actions may still request a fresh fitBounds.
      if(!map)renderMap(true);
      else if(fitMap===true||fitMap===false)renderMap(fitMap);
      else requestAnimationFrame(()=>map?.invalidateSize({pan:false}));
    }
    try{history.replaceState(null,'','#'+name);}catch{/* file providers may restrict history; navigation still works. */}
    centerActiveNavButton(name);
    syncAppStageMetrics();
    if(scroll){
      if(usesMobileDocumentFlow()){
        // Mobile main-tab changes never restore the previous tab's scroll position.
        // Re-entering any tab always starts at that tab's top, offset for the sticky bar.
        if(changing)scrollMobileViewToTop();
      }else ensureAppStageVisible();
    }
    if(changing&&!usesMobileDocumentFlow())requestAnimationFrame(()=>document.getElementById(`view-${name}`)?.focus?.({preventScroll:true}));
    syncSaved();
  }
  async function copyAddress(id) {
    const text=items[id]?.address;if(!text)return;
    try { if(!navigator.clipboard?.writeText)throw new Error('no clipboard');await navigator.clipboard.writeText(text);toast(items[id].addressVerified?'已複製中文地址':'已複製地點搜尋詞；完整地址待核實'); }
    catch { const el=$('#copy-value');el.value=text;$('#copy-dialog').showModal();el.focus();el.select(); }
  }

  let photoFilter='all',watchId=null,userMarker=null,accuracyCircle=null,selectedCircle=null,nearbyOrigin=null;
  function renderPhotos(){
    document.querySelectorAll('[data-photo-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.photoFilter===photoFilter);b.setAttribute('aria-pressed',String(b.dataset.photoFilter===photoFilter));});
    $('#photo-list').innerHTML=tripData.photoSpots.filter(p=>photoFilter==='all'||p.drama).map(p=>contentCard(p,null,{readerKind:'photo'})).join('');
    renderedViews.add('photos');
  }
  function showNearby(point,openPopup=false){
    nearbyOrigin=point;
    // Nearby is intentionally all eight days, independent of the marker filters.
    const near=Object.values(items).filter(p=>hasCoords(p)&&p.type!=='hotel').map(p=>({p,km:map.distance(point,[p.lat,p.lng])/1000})).filter(x=>x.km<=3).sort((a,b)=>a.km-b.km).filter((x,i,all)=>all.findIndex(y=>y.p.name===x.p.name&&y.p.lat===x.p.lat&&y.p.lng===x.p.lng)===i);
    const rows=near.map(({p,km})=>`<button class="nearby-row" data-focus="${esc(p.id)}">${itemThumbnail(p,'nearby-thumb')}<span class="nearby-copy"><strong>${esc(p.name)}</strong><small>${category(p).name} · ${esc(p.description)}</small></span><span class="nearby-distance">${km.toFixed(1)} km →</span></button>`).join('');
    $('#nearby-panel').innerHTML=`<h3>這附近有什麼可玩？</h3><p class="small">全部八天 · 直線 3 公里內 ${near.length} 筆旅程提案。地區參考點不是店址；距離非步行路線。</p>${rows||'<p>附近尚無已定位的景點，試試點選其他標記；下方仍可按名稱導航。</p>'}`;
    if(selectedCircle)selectedCircle.remove();selectedCircle=L.circle(point,{radius:3000,color:'#bc7945',weight:1,fillOpacity:0.035,interactive:false}).addTo(map);
    if(openPopup)L.popup().setLatLng(point).setContent(`<strong>附近 ${near.length} 筆提案</strong><p>${near.slice(0,4).map(x=>esc(x.p.name)).join('、')||'此處尚無已定位項目'}</p><button class="action" data-nearby>查看附近清單 ↓</button>`).openOn(map);
  }
  function focusPlace(id){
    const p=items[id];if(!p)return;
    setSharedTripDayState('all');resetMapFilters();showView('map',false,false);requestAnimationFrame(()=>{syncMapDateRail(true,'smooth');syncNightDateRail(true,'smooth');});if(!map)return;
    const anchor=hasCoords(p)?p:items[p.mapPlaceId]||items[tripData.mapAreas[p.city]];
    if(!anchor||!hasCoords(anchor)){renderMapFeatureCard(p,[p]);toast('尚無可用參考座標，請用卡片的中文名稱導航');return;}
    map.stop();map.invalidateSize({pan:false});
    map.setView([anchor.lat,anchor.lng],16,{animate:false});
    selectMapPlace(p.id,{anchorId:anchor.id,nearby:true,pan:false});
    $('#map').scrollIntoView({block:'start',behavior:'auto'});
  }
  function stopLocation(message='已停止定位並移除位置標記。'){
    if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
    if(userMarker)userMarker.remove();if(accuracyCircle)accuracyCircle.remove();userMarker=accuracyCircle=null;
    userLocationPoint=null;updateMapStripDistances();
    $('[data-stop-location]').hidden=true;$('#location-status').textContent=message;
  }
  function startLocation(){
    if(!map){$('#location-status').textContent='請先連線載入地圖後再試定位。';return;}
    if(!window.isSecureContext||!navigator.geolocation){$('#location-status').textContent='此瀏覽器環境不支援定位。手機請以 HTTPS 網址開啟，並使用 Safari 或 Chrome 允許位置權限。';return;}
    stopLocation('正在取得位置，請允許瀏覽器定位…');$('[data-stop-location]').hidden=false;
    let first=true;
    watchId=navigator.geolocation.watchPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy))return;
      const point=[latitude,longitude];
      userLocationPoint=L.latLng(latitude,longitude);updateMapStripDistances();
      if(!userMarker){userMarker=L.circleMarker(point,{pane:'userLocation',radius:8,color:'#fff',weight:3,fillColor:'#2375df',fillOpacity:1}).addTo(map).bindPopup('我的位置');accuracyCircle=L.circle(point,{radius:accuracy,color:'#2375df',weight:1,fillOpacity:0.09,interactive:false}).addTo(map);}
      else{userMarker.setLatLng(point);accuracyCircle.setLatLng(point).setRadius(accuracy);}
      $('#location-status').textContent=`定位中 · 精度約 ±${Math.round(accuracy)} 公尺 · ${new Date(position.timestamp).toLocaleTimeString('zh-TW')} 更新。藍點為裝置位置；不儲存定位紀錄。`;
      if(first){map.setView(point,15);showNearby(L.latLng(point));first=false;}
    },error=>stopLocation(({1:'定位遭拒：請在瀏覽器網站設定允許位置，並確認手機定位服務已開啟；使用 HTTPS 網頁後重試。',2:'暫時無法取得位置，請確認手機定位服務及網路後重試。',3:'定位逾時，請移到訊號較好的地方再按「我的位置」。'})[error.code]||'定位失敗，請重試。'),{enableHighAccuracy:true,timeout:20000,maximumAge:10000});
  }
  window.addEventListener('pagehide',()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId);revokeTimetablePreview();});

  function activateMapStripCard(id){
    const p=items[id];if(!p)return;
    const anchor=hasCoords(p)?p:items[p.mapPlaceId]||items[tripData.mapAreas[p.city]];
    setMapFeatureCardHidden(false);
    if(!anchor||!hasCoords(anchor)){
      selectedMapId=p.id;selectedMarkerId=p.id;renderMapFeatureCard(p,[p]);refreshMarkerSelection();syncMapStripSelection(true);
      const panel=$('#nearby-panel');if(panel)panel.innerHTML=`<h3>這附近有什麼可玩？</h3><p class="small">${esc(p.name)} 尚無可用參考座標，因此暫時無法計算 3 公里內提案。</p>`;
      toast('這張卡片尚無可用參考座標');return;
    }
    if(!map){selectedMapId=p.id;selectedMarkerId=anchor.id;renderMapFeatureCard(p,[p]);syncMapStripSelection(true);toast('地圖尚未完成載入');return;}
    selectMapPlace(p.id,{anchorId:anchor.id,nearby:true,focus:true});
  }

  // One document click delegate remains for dynamic content actions. Components with local
  // gesture/control ownership (journal expansion, date rails, map-strip cards, popup swipe)
  // stop at their own controller boundary and never enter this router.
  function handleItineraryUiButton(b){
    if(b.dataset.itineraryStripNav){const strip=$('#itinerary-strip'),dir=b.dataset.itineraryStripNav==='prev'?-1:1;strip?.scrollBy({left:dir*Math.max(300,strip.clientWidth*.78),behavior:'smooth'});return true;}
    if(b.dataset.timetableNav){
      const board=$('#itinerary-timetable-scroll');if(!board)return true;
      const dir=b.dataset.timetableNav==='prev'?-1:1,step=Math.max(300,board.clientWidth*.78),max=Math.max(0,board.scrollWidth-board.clientWidth);
      const target=dir<0?(board.scrollLeft<=step+12?0:Math.max(0,board.scrollLeft-step)):(max-board.scrollLeft<=step+12?max:Math.min(max,board.scrollLeft+step));
      board.scrollTo({left:target,behavior:'smooth'});return true;
    }
    if(b.hasAttribute('data-timetable-preview')){openTimetablePreview();return true;}
    if(b.hasAttribute('data-timetable-download')){downloadTimetablePng();return true;}
    if(b.hasAttribute('data-timetable-preview-close')){$('#timetable-preview-dialog')?.close();return true;}
    return false;
  }
  function handleReaderUiButton(b){
    if(b.hasAttribute('data-content-reader-close')){$('#content-reader-dialog')?.close();return true;}
    if(b.hasAttribute('data-content-reader-back')){contentReaderBack();return true;}
    if(b.dataset.contentReaderNav){navigateContentReader(b.dataset.contentReaderNav);return true;}
    if(b.dataset.contentReaderItem){openContentReaderItem(b.dataset.contentReaderItem,{day:b.dataset.readerDay,kind:b.dataset.readerKind,opener:b,push:$('#content-reader-dialog')?.open});return true;}
    if(b.dataset.contentReaderStory){openContentReaderStory(b.dataset.contentReaderStory,{day:b.dataset.readerDay,opener:b,push:$('#content-reader-dialog')?.open});return true;}
    if(b.dataset.contentReaderFocus){const id=b.dataset.contentReaderFocus;closeContentReaderThen(()=>focusPlace(id));return true;}
    if(b.dataset.contentReaderSave){const id=b.dataset.contentReaderSave;toggleSaved(id);b.textContent=favorites.has(id)?'♥ 已收藏':'♡ 收藏';return true;}
    if(b.dataset.readerItem){openContentReaderItem(b.dataset.readerItem,{day:b.dataset.readerDay,kind:b.dataset.readerKind,opener:b});return true;}
    if(b.dataset.readerNightDay){const d=tripData.days.find(x=>x.day===Number(b.dataset.readerNightDay));if(d?.nightRecommendations?.length)openContentReaderItem(d.nightRecommendations[0],{day:d.day,kind:'night',opener:b});else toast('這晚沒有額外夜遊提案');return true;}
    if(b.hasAttribute('data-map-detail-close')){$('#map-detail-dialog')?.close();return true;}
    if(b.dataset.mapDetailNav){navigateMapDetail(b.dataset.mapDetailNav);return true;}
    return false;
  }
  function handleMapUiButton(b){
    if(b.hasAttribute('data-nearby')){$('#nearby-panel').scrollIntoView({block:'start'});return true;}
    if(b.hasAttribute('data-map-card-close')){setMapFeatureCardHidden(true);return true;}
    if(b.dataset.mapTab){activeMapTab=['all','custom','scheduled'].includes(b.dataset.mapTab)?b.dataset.mapTab:'scheduled';renderMapStrip();return true;}
    if(b.dataset.mapCustom){toggleCustomMap(b.dataset.mapCustom);return true;}
    if(b.dataset.mapStripNav){const strip=$('#map-list'),dir=b.dataset.mapStripNav==='prev'?-1:1;strip?.scrollBy({left:dir*Math.max(260,strip.clientWidth*.72),behavior:'smooth'});return true;}
    if(b.dataset.mapPick){selectMapPlace(b.dataset.mapPick,{anchorId:b.dataset.mapPick,nearby:true,pan:true});return true;}
    if(b.dataset.mapScroll){
      const strip=$('#map-list');let target=strip?.querySelector(`[data-map-strip="${CSS.escape(b.dataset.mapScroll)}"]`);
      if(!target&&activeMapTab==='custom'){activeMapTab='scheduled';renderMapStrip();target=strip?.querySelector(`[data-map-strip="${CSS.escape(b.dataset.mapScroll)}"]`);}
      if(target&&strip){const left=target.offsetLeft-(strip.clientWidth-target.offsetWidth)/2;strip.scrollTo({left:Math.max(0,left),behavior:'smooth'});document.querySelector('.map-strip-section')?.scrollIntoView({block:'nearest',behavior:'smooth'});}else toast('這個地點目前不在下方清單');
      return true;
    }
    if(b.dataset.focus){focusPlace(b.dataset.focus);return true;}
    if(b.hasAttribute('data-geolocate')){startLocation();return true;}
    if(b.hasAttribute('data-stop-location')){stopLocation();return true;}
    if(b.dataset.mapDay){setSharedTripDayState(b.dataset.mapDay);resetMapFilters();showView('map',true,true);requestAnimationFrame(()=>{syncMapDateRail(true,'smooth');syncNightDateRail(true,'smooth');});return true;}
    if(b.dataset.filter){toggleMapFilter(b.dataset.filter);renderMap();return true;}
    if(b.dataset.locate){focusPlace(b.dataset.locate);return true;}
    return false;
  }
  function handleLibraryUiButton(b){
    if(b.dataset.photoFilter){photoFilter=b.dataset.photoFilter;renderPhotos();return true;}
    if(b.dataset.cultureFilter){cultureFilter=b.dataset.cultureFilter;renderCulture();return true;}
    if(b.dataset.story){openContentReaderStory(b.dataset.story,{day:b.dataset.storyDay,opener:b});return true;}
    if(b.dataset.save){toggleSaved(b.dataset.save);return true;}
    if(b.dataset.copy){copyAddress(b.dataset.copy);return true;}
    if(b.dataset.view){showView(b.dataset.view);return true;}
    if(b.dataset.nightDay){setNightDayValue(b.dataset.nightDay,{center:true,behavior:'smooth'});showView('night');return true;}
    if(b.dataset.city){foodCity=b.dataset.city;renderFood();return true;}
    if(b.dataset.foodId){const dayEl=b.closest('.day-card');const day=dayEl?Number(dayEl.id.replace('day-','')):null;openContentReaderItem(b.dataset.foodId,{day,kind:'food',opener:b});return true;}
    if(b.hasAttribute('data-reload')){location.reload();return true;}
    return false;
  }
  document.addEventListener('click',event=>{
    const cultureCard=event.target.closest('[data-culture-story]');
    if(cultureCard&&!event.target.closest('a,button,input,select,textarea,label')){openContentReaderStory(cultureCard.dataset.cultureStory,{opener:cultureCard});return;}
    const b=event.target.closest('button');
    if(!b){const card=event.target.closest('[data-item]');if(card&&!event.target.closest('a,input,select,textarea'))openContentReaderItem(card.dataset.item,{day:card.dataset.readerDay,kind:card.dataset.readerKind||'',opener:card});return;}
    if(handleItineraryUiButton(b))return;
    if(handleReaderUiButton(b))return;
    if(handleMapUiButton(b))return;
    handleLibraryUiButton(b);
  });
  document.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const card=event.target.closest?.('[data-culture-story]');
    if(!card||event.target.closest('a,button,input,select,textarea,label'))return;
    event.preventDefault();
    openContentReaderStory(card.dataset.cultureStory,{opener:card});
  });

  // Mobile main-view swipe. One controller owns page-level horizontal dragging.
  // Ordinary text, footer copy and links may start the gesture; components that already own
  // horizontal gestures (cards/rails/map/timetable/etc.) remain protected. Once horizontal
  // intent is clear, a visual clone of the current and adjacent tabs follows the finger.
  function bindMainViewSwipeController(){
    if(document.documentElement.dataset.mainViewSwipeReady==='1')return;
    document.documentElement.dataset.mainViewSwipeReady='1';
    const VIEW_ORDER=['itinerary','map','night','food','shopping','favorites','photos','culture','tips'];
    const INTENT=9,RATIO=1.3,DISTANCE_RATIO=.28,FLICK_VELOCITY=.45;
    const blockedSelector=[
      'button:not(.credit-link)','input','select','textarea','label','summary','dialog','[contenteditable="true"]',
      '.section-nav','.bottom-nav',
      '.content-card','.journey-card','.compact-card','.utility-card',
      '.content-grid','.compact-grid','.culture-grid',
      '.itinerary-day-strip','.itinerary-timetable-frame','.itinerary-timetable-scroll',
      '.day-story-strip','.route-list','.chips',
      '.map-date-control','.map-date-rail','.map-explorer','#map','.leaflet-container',
      '.map-strip-section','.map-place-strip','.map-strip-card','.map-feature-card',
      '.nearby-panel','.location-controls'
    ].join(',');
    let gesture=null,swipeLayer=null,suppressClickUntil=0;

    const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inSwipeRegion=target=>!!target.closest?.('.workspace,footer');
    const isBlockedStart=target=>!!target.closest?.(blockedSelector);
    const activeDialog=()=>!!document.querySelector('dialog[open]');
    const changedTouch=(event,id)=>[...event.changedTouches].find(t=>t.identifier===id);
    const liveTouch=(event,id)=>[...event.touches].find(t=>t.identifier===id);

    function cloneMainDocument(viewName){
      ensureViewRendered(viewName);
      const sourceWorkspace=$('.workspace');
      if(!sourceWorkspace)return null;
      const workspaceClone=sourceWorkspace.cloneNode(true);
      workspaceClone.classList.add('main-tab-swipe-workspace-clone');
      workspaceClone.querySelectorAll('.view').forEach(view=>{
        if(view.id!==`view-${viewName}`){view.remove();return;}
        view.classList.add('is-active');
        view.setAttribute('aria-hidden','false');
        view.removeAttribute('inert');
        view.hidden=false;
      });
      const doc=document.createElement('div');
      doc.className='main-tab-swipe-document';
      doc.append(workspaceClone);
      const footer=document.querySelector('footer');
      if(footer)doc.append(footer.cloneNode(true));
      return doc;
    }

    function makeSwipePane(viewName,{current=false,top=0}={}){
      const pane=document.createElement('div');
      pane.className=`main-tab-swipe-pane${current?' is-current':' is-target'}`;
      const doc=cloneMainDocument(viewName);
      if(!doc)return null;
      if(current){
        const workspaceTop=workspaceDocumentTop();
        const visibleDocumentY=(window.scrollY||0)+top;
        const offset=Math.max(0,visibleDocumentY-workspaceTop);
        doc.style.transform=`translate3d(0,${-offset}px,0)`;
      }else doc.style.transform='translate3d(0,0,0)';
      pane.append(doc);
      return pane;
    }

    function buildSwipeLayer(nextName,step){
      const nav=$('.section-nav'),bottom=$('.bottom-nav');
      if(!nav)return null;
      const navRect=nav.getBoundingClientRect();
      const top=Math.max(0,Math.min(window.innerHeight,Math.ceil(navRect.bottom)));
      const bottomVisible=bottom&&getComputedStyle(bottom).display!=='none';
      const bottomTop=bottomVisible?bottom.getBoundingClientRect().top:window.innerHeight;
      const bottomInset=Math.max(0,Math.ceil(window.innerHeight-bottomTop));
      const layer=document.createElement('div');
      layer.className='main-tab-swipe-layer';
      layer.setAttribute('aria-hidden','true');
      layer.style.top=`${top}px`;
      layer.style.bottom=`${bottomInset}px`;
      const currentPane=makeSwipePane(currentView,{current:true,top});
      const targetPane=makeSwipePane(nextName,{current:false,top});
      if(!currentPane||!targetPane)return null;
      layer.append(currentPane,targetPane);
      document.body.append(layer);
      document.documentElement.classList.add('main-tab-swipe-active');
      const width=Math.max(1,layer.getBoundingClientRect().width||window.innerWidth);
      return {layer,currentPane,targetPane,nextName,step,width};
    }

    function setSwipePosition(dx,{transition=false,duration=0}={}){
      if(!swipeLayer)return;
      const {currentPane,targetPane,step,width}=swipeLayer;
      const base=step===1?width:-width;
      const clamped=step===1?Math.min(0,Math.max(-width,dx)):Math.max(0,Math.min(width,dx));
      const timing=transition?`transform ${duration}ms cubic-bezier(.22,.72,.2,1)`:'none';
      currentPane.style.transition=timing;
      targetPane.style.transition=timing;
      currentPane.style.transform=`translate3d(${clamped}px,0,0)`;
      targetPane.style.transform=`translate3d(${clamped+base}px,0,0)`;
    }

    function removeSwipeLayer(){
      swipeLayer?.layer.remove();
      swipeLayer=null;
      document.documentElement.classList.remove('main-tab-swipe-active');
    }

    function settleSwipe(commit,dx){
      if(!swipeLayer){gesture=null;return;}
      const layer=swipeLayer;
      const duration=reducedMotion()?0:(commit?250:200);
      suppressClickUntil=performance.now()+Math.max(360,duration+120);
      const destination=commit?(layer.step===1?-layer.width:layer.width):0;
      requestAnimationFrame(()=>setSwipePosition(destination,{transition:true,duration}));
      const finish=()=>{
        if(swipeLayer!==layer)return;
        if(!commit){removeSwipeLayer();gesture=null;return;}
        // Switch through the existing single tab router while the completed preview still
        // covers the viewport. showView() performs the established mobile scroll-to-top rule.
        showView(layer.nextName,true);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          if(swipeLayer===layer)removeSwipeLayer();
          gesture=null;
        }));
      };
      if(duration===0)finish();
      else setTimeout(finish,duration+36);
    }

    function cancelActiveSwipe(){
      if(!gesture?.active){gesture=null;removeSwipeLayer();return;}
      settleSwipe(false,gesture.dx||0);
    }

    document.addEventListener('touchstart',event=>{
      if(!usesMobileDocumentFlow()||event.touches.length!==1||activeDialog())return;
      const target=event.target;
      if(!inSwipeRegion(target)||isBlockedStart(target))return;
      const touch=event.touches[0],now=performance.now();
      gesture={
        identifier:touch.identifier,view:currentView,startX:touch.clientX,startY:touch.clientY,
        lastX:touch.clientX,lastT:now,startT:now,velocityX:0,dx:0,active:false,step:0,nextName:null
      };
    },{passive:true});

    document.addEventListener('touchmove',event=>{
      if(!gesture)return;
      const touch=liveTouch(event,gesture.identifier);if(!touch)return;
      const dx=touch.clientX-gesture.startX,dy=touch.clientY-gesture.startY;
      gesture.dx=dx;
      const now=performance.now(),dt=Math.max(1,now-gesture.lastT);
      gesture.velocityX=(touch.clientX-gesture.lastX)/dt;
      gesture.lastX=touch.clientX;gesture.lastT=now;
      if(!gesture.active){
        if(Math.max(Math.abs(dx),Math.abs(dy))<INTENT)return;
        if(Math.abs(dx)<=Math.abs(dy)*RATIO){gesture=null;return;}
        const index=VIEW_ORDER.indexOf(currentView);if(index<0){gesture=null;return;}
        const step=dx<0?1:-1,nextIndex=index+step;
        if(nextIndex<0||nextIndex>=VIEW_ORDER.length){gesture=null;return;}
        gesture.active=true;gesture.step=step;gesture.nextName=VIEW_ORDER[nextIndex];
        swipeLayer=buildSwipeLayer(gesture.nextName,step);
        if(!swipeLayer){gesture=null;return;}
      }
      // Horizontal intent is now owned by the tab pager. Before this point the listener is
      // effectively passive, so ordinary vertical document scrolling remains native.
      event.preventDefault();
      setSwipePosition(dx);
    },{passive:false});

    document.addEventListener('touchend',event=>{
      if(!gesture)return;
      const touch=changedTouch(event,gesture.identifier);if(!touch)return;
      if(!gesture.active){gesture=null;return;}
      const now=performance.now();
      const dt=Math.max(1,now-gesture.lastT);
      if(now-gesture.lastT<90)gesture.velocityX=(touch.clientX-gesture.lastX)/dt;
      const dx=touch.clientX-gesture.startX;
      gesture.dx=dx;
      const towardVelocity=gesture.step===1?-gesture.velocityX:gesture.velocityX;
      const distanceReady=Math.abs(dx)>=swipeLayer.width*DISTANCE_RATIO;
      const flickReady=towardVelocity>=FLICK_VELOCITY&&Math.abs(dx)>=INTENT*2;
      settleSwipe(distanceReady||flickReady,dx);
    },{passive:true});

    document.addEventListener('touchcancel',()=>cancelActiveSwipe(),{passive:true});
    window.addEventListener('resize',()=>{if(gesture||swipeLayer){gesture=null;removeSwipeLayer();}});
    document.addEventListener('click',event=>{
      if(performance.now()>=suppressClickUntil)return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
  }
  bindMainViewSwipeController();

  // JOURNEY OVERVIEW expansion controls are handled only by bindItineraryExpansionController().

  // One idempotent controller for horizontal scrollers. Touch/pen are always native;
  // desktop mouse can drag, and vertical mouse-wheel input is translated horizontally.
  function bindHorizontalScroller(el,{mouseDrag=true,wheel=true}={}){
    if(!el||el.dataset.horizontalScrollerReady==='1')return;
    el.dataset.horizontalScrollerReady='1';
    let pointerId=null,startX=0,startY=0,startLeft=0,dragging=false,suppressClickUntil=0;
    const finish=()=>{
      if(pointerId===null)return;
      if(dragging){suppressClickUntil=performance.now()+260;el.classList.remove('is-dragging');try{if(el.hasPointerCapture?.(pointerId))el.releasePointerCapture(pointerId);}catch{}}
      pointerId=null;dragging=false;
    };
    if(wheel)el.addEventListener('wheel',event=>{
      if(el.scrollWidth<=el.clientWidth||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
      const max=el.scrollWidth-el.clientWidth;if((event.deltaY<0&&el.scrollLeft<=1)||(event.deltaY>0&&el.scrollLeft>=max-1))return;
      event.preventDefault();el.scrollLeft+=event.deltaY;
    },{passive:false});
    if(!mouseDrag)return;
    el.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'||event.pointerType==='pen'||(event.button!==undefined&&event.button!==0))return;
      pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;startLeft=el.scrollLeft;dragging=false;
    },{passive:true});
    el.addEventListener('pointermove',event=>{
      if(pointerId===null||event.pointerId!==pointerId)return;
      const dx=event.clientX-startX,dy=event.clientY-startY;
      if(!dragging){if(Math.abs(dx)<8||Math.abs(dx)<=Math.abs(dy)*1.08)return;dragging=true;el.classList.add('is-dragging');try{el.setPointerCapture?.(pointerId);}catch{}}
      event.preventDefault();el.scrollLeft=startLeft-dx;
    },{passive:false});
    el.addEventListener('pointerup',finish,{passive:true});
    el.addEventListener('pointercancel',finish,{passive:true});
    el.addEventListener('lostpointercapture',finish,{passive:true});
    el.addEventListener('click',event=>{if(performance.now()>suppressClickUntil)return;suppressClickUntil=0;event.preventDefault();event.stopPropagation();},true);
  }
  // Explore Map Rail uses the same native mobile scrolling contract as Content Rails.
  // Long-press is a minimal passive add-on: time + movement only; native scrolling owns swipes.
  // Hold-progress feedback is visual-only and never captures or drags the pointer.
  function bindMapCardInteractionController(mapStrip){
    if(!mapStrip||mapStrip.dataset.mapCardInteractionReady==='1')return;
    mapStrip.dataset.mapCardInteractionReady='1';
    const HOLD_MS=520,VISUAL_MS=180,TOUCH_MOVE_CANCEL=12,MOUSE_MOVE_CANCEL=8;
    let gesture=null,visualTimer=0,holdTimer=0,suppressClickUntil=0;
    const clearTimers=()=>{
      if(visualTimer){clearTimeout(visualTimer);visualTimer=0;}
      if(holdTimer){clearTimeout(holdTimer);holdTimer=0;}
    };
    const clearVisual=card=>{
      card?.classList.remove('long-pressing','long-press-ready');
      card?.style.removeProperty('--map-hold-remaining');
    };
    const resetGesture=()=>{
      clearTimers();
      if(gesture?.card)clearVisual(gesture.card);
      gesture=null;
    };
    const movedTooFar=(event,g)=>Math.hypot(event.clientX-g.startX,event.clientY-g.startY)>(g.pointerType==='mouse'?MOUSE_MOVE_CANCEL:TOUCH_MOVE_CANCEL);
    mapStrip.addEventListener('pointerdown',event=>{
      const pointerType=event.pointerType||'mouse';
      if(event.isPrimary===false||(pointerType==='mouse'&&event.button!==0))return;
      const card=event.target.closest?.('[data-map-strip]');
      if(!card||!mapStrip.contains(card))return;
      resetGesture();
      gesture={
        pointerId:event.pointerId,
        pointerType,
        card,
        startX:event.clientX,
        startY:event.clientY,
        armed:false
      };
      visualTimer=setTimeout(()=>{
        if(!gesture||gesture.pointerId!==event.pointerId||gesture.armed)return;
        gesture.card.style.setProperty('--map-hold-remaining',`${HOLD_MS-VISUAL_MS}ms`);
        gesture.card.classList.add('long-pressing');
      },VISUAL_MS);
      holdTimer=setTimeout(()=>{
        if(!gesture||gesture.pointerId!==event.pointerId)return;
        gesture.armed=true;
        clearVisual(gesture.card);
        gesture.card.classList.add('long-press-ready');
        if(pointerType!=='mouse'&&navigator.vibrate){try{navigator.vibrate(22);}catch{}}
      },HOLD_MS);
    },{passive:true});
    mapStrip.addEventListener('pointermove',event=>{
      if(!gesture||event.pointerId!==gesture.pointerId)return;
      if(movedTooFar(event,gesture))resetGesture();
    },{passive:true});
    mapStrip.addEventListener('pointercancel',event=>{
      if(gesture&&event.pointerId===gesture.pointerId)resetGesture();
    },{passive:true});
    mapStrip.addEventListener('pointerup',event=>{
      if(!gesture||event.pointerId!==gesture.pointerId)return;
      const g=gesture;
      const currentCard=event.target.closest?.('[data-map-strip]');
      const longPressed=g.armed&&currentCard===g.card;
      resetGesture();
      if(!longPressed)return;
      suppressClickUntil=performance.now()+450;
      openMapDetailDialog(g.card.dataset.mapStrip,g.card);
    },{passive:true});
    mapStrip.addEventListener('click',event=>{
      const card=event.target.closest?.('[data-map-strip]');
      if(!card||!mapStrip.contains(card))return;
      if(performance.now()<suppressClickUntil){
        suppressClickUntil=0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      activateMapStripCard(card.dataset.mapStrip);
    });
    mapStrip.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest?.('[data-map-strip]');
      if(!card||!mapStrip.contains(card))return;
      event.preventDefault();
      event.stopPropagation();
      activateMapStripCard(card.dataset.mapStrip);
    });
  }


  const mapStrip=$('#map-list');
  bindMapCardInteractionController(mapStrip);
  // Explore Map desktop: match the timetable interaction — left-button drag moves the rail.
  // Touch/pen remain fully native; vertical mouse-wheel translation stays disabled.
  bindHorizontalScroller(mapStrip,{mouseDrag:true,wheel:false});

  // DAY 01–08 stay in-place: native carousel swipe + explicit expansion CTA + native <details>.

  $('#night-day').insertAdjacentHTML('beforeend',tripData.days.map(d=>`<option value="${d.day}">Day ${d.day} · ${d.date.slice(5)} · ${d.city}</option>`).join(''));
  $('#map-day').insertAdjacentHTML('beforeend',tripData.days.map(d=>`<option value="${d.day}">Day ${d.day} · ${d.city}</option>`).join(''));
  buildMapDateRail();buildNightDateRail();setSharedTripDayState('all');
  // Date Rail/API changes are the only day-change path. Hidden selects mirror state only;
  // they do not own listeners or dispatch a second rendering path.
  document.addEventListener('change',event=>{const select=event.target.closest('[data-map-provider-select]');if(select)setMapProvider(select.value);});
  window.addEventListener('hashchange',()=>showView(location.hash.slice(1),false));
  window.addEventListener('resize',()=>{syncAppStageMetrics();if(currentView==='map')requestAnimationFrame(()=>map?.invalidateSize({pan:false}));},{passive:true});
  if('ResizeObserver' in window){const stageObserver=new ResizeObserver(syncAppStageMetrics);stageObserver.observe($('.section-nav'));stageObserver.observe($('.bottom-nav'));}
  $('#header-date').textContent=tripData.dateLabel+' · 8 DAYS';$('#hero-date').textContent=tripData.dateLabel;
  $('.hero').style.backgroundImage=`url("${tripData.heroImage}")`;
  $('#journey-strip').innerHTML=tripData.route.map(c=>`<span class="route-stop">${esc(c)}</span>`).join('');
  const credit=tripData.imageCredit;$('#credits').innerHTML=`照片：<a href="${esc(credit.url)}" target="_blank" rel="noopener noreferrer">${esc(credit.title)} · ${esc(credit.author)}</a> / <a href="${credit.licenseUrl}" target="_blank" rel="noopener noreferrer">${credit.license}</a>（版面裁切）<br>行程依手冊整理 · 資料查核 ${tripData.checkedAt}`;
  $('#tips-content').innerHTML=`<article class="nav-provider-card utility-card utility-card--settings"><div><span class="eyebrow">MAP NAVIGATION</span><h3>預設導航地圖</h3><p class="small">所有「導航」按鈕都會使用這個設定。預設高德地圖；偏好只儲存在此瀏覽器。</p></div><label>導航服務<select data-map-provider-select aria-label="預設導航地圖"><option value="amap">高德地圖（預設）</option><option value="google">Google 地圖</option></select></label></article><div class="content-grid">${tripData.tips.map(t=>`<article class="utility-card utility-card--tip"><h3>${esc(t.title)}</h3><p class="description">${esc(t.text)}</p>${t.source?`<a class="small" href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">官方說明 ↗</a>`:''}</article>`).join('')}</div>${flightBlock('outbound')}${flightBlock('inbound')}<details class="tips-sources-disclosure utility-card utility-card--sources" open><summary><span class="subheading">內容來源與查核</span><span class="tips-disclosure-meta">展開 / 收合</span></summary><ul class="source-list">${tripData.sources.map(s=>`<li>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:esc(s.title)}${s.note?`<p class="small">${esc(s.note)}</p>`:''}</li>`).join('')}</ul></details>`;
  syncNavigationProviderControls();
  renderDays();bindHorizontalScroller($('#itinerary-timetable-scroll'));bindHorizontalScroller($('#itinerary-strip'));renderShopping();renderNight();renderFood();renderPhotos();renderCulture();renderFavorites();
  $('#credits').insertAdjacentHTML('beforeend','<br><button class="credit-link" data-view="culture">實拍照片與故事來源 →</button>');
  if(todayDay){$('#today').hidden=false;$('#today').innerHTML=`<span class="eyebrow">TODAY</span><h3>Day ${todayDay.day} · ${todayDay.city}</h3><p>今天：${todayDay.itinerary.map(id=>esc(items[id].name)).join(' → ')}<br>今晚：${todayDay.nightRecommendations.length?esc(items[todayDay.nightRecommendations[0]].name):'休息／返程'}</p><button class="primary" data-night-day="${todayDay.day}">查看今晚安排</button>`;$('#day-'+todayDay.day).open=true;}
  syncNavigationProviderControls();
  showView(location.hash.slice(1)||'itinerary',false);
  if(!storageAvailable)toast('瀏覽器儲存功能受限；收藏可能無法保留');
})();
