/* App shell: loads trip data, wires shared services, initializes domains and owns page-level navigation. */
(async () => {
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
  let tripData;
  try{const response=await fetch('data/trip-data.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);tripData=await response.json();}
  catch(error){console.error('Unable to load trip data:',error);document.body.insertAdjacentHTML('afterbegin','<div class="data-load-error"><strong>行程資料載入失敗。</strong> 請用 HTTP/HTTPS 開啟；Windows 本機版請直接執行 <code>START.bat</code>，不要雙擊 index.html。</div>');return;}

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!window.YunnanNetworkSystem||!window.YunnanCore||!window.YunnanWeatherSystem||!window.YunnanOfflineSystem||!window.YunnanReaderSystem||!window.YunnanJourneySystem||!window.YunnanMapSystem||!window.YunnanLibrarySystem)throw new Error('UI module bootstrap failed');
  const networkProfile=YunnanNetworkSystem.create();
  const leafletReady=networkProfile.loadLeaflet();

  const items={...tripData.places,...Object.fromEntries([...tripData.foods,...tripData.shopping,...tripData.photoSpots].map(p=>[p.id,p]))};
  const photoSystem=YunnanCore.createPhotoSystem({photos:tripData.photos,esc,networkProfile});photoSystem.installErrorHandler();
  const travelUtils=YunnanCore.createTravelUtils({tripData,items,esc});
  const favoritesStore=YunnanCore.createFavoritesStore({items});
  const navigation=YunnanCore.createNavigationService({tripData,items,esc});
  if(networkProfile.isMainland()&&navigation.get()==='google')navigation.set('amap');
  const dateInZone=date=>new Intl.DateTimeFormat('en-CA',{timeZone:tripData.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const todayDay=tripData.days.find(d=>d.date===dateInZone(new Date()));
  const dateRail=YunnanCore.createDateRailController({tripData,esc,$,todayDay});
  const readerInteraction=YunnanReaderSystem.createInteraction({$});
  const renderedViews=new Set();
  let currentView='itinerary',toastTimer,mapSystem,librarySystem,readerSystem,journeySystem,weatherSystem,offlineSystem;

  const markRendered=name=>renderedViews.add(name);
  const toast=message=>{const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);};

  function setSharedDay(value,{source='app',fitMap=true,center=true,behavior='smooth',renderMap=true,renderNight=true}={}){
    value=String(value);const allowed=['all',...tripData.days.map(d=>String(d.day))];if(!allowed.includes(value))return false;
    mapSystem?.setDayState(value);librarySystem?.setNightDayState(value);
    if(renderNight&&librarySystem&&(source==='library'||renderedViews.has('night')))librarySystem.renderNight();
    if(renderMap&&mapSystem&&(source==='map'||currentView==='map'))mapSystem.render(fitMap);
    if(center)requestAnimationFrame(()=>{mapSystem?.syncDate(true,behavior);librarySystem?.syncNightDate(true,behavior);});
    return true;
  }

  function toggleFavorite(id){
    const result=favoritesStore.toggle(id);if(!result.changed)return false;
    librarySystem?.renderFavorites();librarySystem?.syncSaved();
    toast(result.storageAvailable?(result.saved?'已加入口袋清單':'已取消收藏'):'無法寫入瀏覽器儲存空間；收藏僅保留至本頁關閉');
    return true;
  }
  async function copyAddress(id){const text=items[id]?.address;if(!text)return;try{if(!navigator.clipboard?.writeText)throw new Error('no clipboard');await navigator.clipboard.writeText(text);toast(items[id].addressVerified?'已複製中文地址':'已複製地點搜尋詞；完整地址待核實');}catch{const el=$('#copy-value');el.value=text;$('#copy-dialog').showModal();el.focus();el.select();}}

  // Domain modules own their own state and renderers. Cross-domain calls go through public APIs.
  weatherSystem=YunnanWeatherSystem.create({tripData,items,esc,toast,networkProfile});
  offlineSystem=YunnanOfflineSystem.create({toast,weatherSystem,showView});
  mapSystem=YunnanMapSystem.create({$,tripData,items,esc,photoSystem,travelUtils,favoritesStore,navigation,readerInteraction,dateRail,bindHorizontalScroller:YunnanCore.bindHorizontalScroller,toast,showView,setSharedDay,toggleFavorite,markRendered,weatherSystem,networkProfile});
  librarySystem=YunnanLibrarySystem.create({$,tripData,items,esc,photoSystem,travelUtils,favoritesStore,navigation,dateRail,markRendered,setSharedDay,getJourney:()=>journeySystem,getReader:()=>readerSystem,showView});
  readerSystem=YunnanReaderSystem.create({$,tripData,items,esc,photoSystem,travelUtils,favoritesStore,navigation,interaction:readerInteraction,getLibrary:()=>librarySystem,getMap:()=>mapSystem,toggleFavorite,toast});
  journeySystem=YunnanJourneySystem.create({$,$$,tripData,items,esc,photoSystem,travelUtils,favoritesStore,navigation,bindHorizontalScroller:YunnanCore.bindHorizontalScroller,toast,getLibrary:()=>librarySystem,markRendered,weatherSystem});

  // Populate mirrored hidden selects before date-rail controllers build their cards.
  $('#night-day')?.insertAdjacentHTML('beforeend',tripData.days.map(d=>`<option value="${d.day}">Day ${d.day} · ${d.date.slice(5)} · ${esc(d.city)}</option>`).join(''));
  $('#map-day')?.insertAdjacentHTML('beforeend',tripData.days.map(d=>`<option value="${d.day}">Day ${d.day} · ${esc(d.city)}</option>`).join(''));
  mapSystem.init();librarySystem.init();setSharedDay('all',{renderMap:false,renderNight:false,center:false});
  leafletReady.then(ok=>{if(ok&&currentView==='map')mapSystem.render(false);});

  function renderTips(){
    const mainland=networkProfile.isMainland();
    $('#tips-content').innerHTML=`${offlineSystem.settingsHtml()}<article class="network-profile-card utility-card utility-card--settings"><div><span class="eyebrow">NETWORK PROFILE</span><h3>連網模式</h3><p class="small">預設為國際版。國際版使用 OpenStreetMap 與原始外部實拍；大陸版改用高德底圖、GCJ-02 座標校正與本地照片策略，降低無 VPN 時的失敗率。天氣則兩個模式都採相同優先順序：高德 → QWeather Grid → Open-Meteo。切換連網模式後會重新整理一次套用。</p></div><label>連網<select data-network-profile-select aria-label="連網模式"><option value="international">國際版（預設）</option><option value="mainland">大陸版</option></select></label></article><article class="nav-provider-card utility-card utility-card--settings"><div><span class="eyebrow">MAP NAVIGATION</span><h3>預設導航地圖</h3><p class="small">所有「導航」按鈕都會使用這個設定。${mainland?'大陸版建議使用高德地圖；Google 在中國大陸通常無法使用。':'預設高德地圖，也可切換 Google。'}偏好只儲存在此瀏覽器。</p></div><label>導航服務<select data-map-provider-select aria-label="預設導航地圖"><option value="amap">高德地圖（預設）</option><option value="google">Google 地圖</option></select></label></article>${weatherSystem.settingsHtml()}<div class="content-grid">${tripData.tips.map(t=>`<article class="utility-card utility-card--tip"><h3>${esc(t.title)}</h3><p class="description">${esc(t.text)}</p>${t.source?`<a class="small" href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">官方說明 ↗</a>`:''}</article>`).join('')}</div>${journeySystem.flightBlock('outbound')}${journeySystem.flightBlock('inbound')}<details class="photo-sources tips-sources-disclosure"><summary>內容來源與查核</summary>${mainland?'<p class="small network-source-note">大陸版仍保留原始來源 URL 作查核紀錄；Google、Instagram、Wikimedia 等外部來源在中國大陸可能無法直接開啟，但不影響已打包的主要行程內容。</p>':''}<ul class="source-list">${tripData.sources.map(s=>`<li>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:esc(s.title)}${s.note?`<p class="small">${esc(s.note)}</p>`:''}</li>`).join('')}</ul></details>`;
    markRendered('tips');offlineSystem.hydrate();networkProfile.sync();navigation.sync();
  }
  function openTodayDayIfPresent(){if(!todayDay)return;const dayEl=$('#day-'+todayDay.day);if(dayEl)dayEl.open=true;}
  const VIEW_REGISTRY=Object.freeze({
    itinerary:{bootstrap:()=>{journeySystem.renderDays();openTodayDayIfPresent();}},
    map:{onShow:({fitMap})=>{requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!mapSystem.isCreated())mapSystem.render(fitMap!==false);else if(fitMap===true||fitMap===false)mapSystem.render(fitMap);else mapSystem.invalidate();}));}},
    night:{bootstrap:()=>librarySystem.renderNight()},
    food:{bootstrap:()=>librarySystem.renderFood()},
    shopping:{bootstrap:()=>librarySystem.renderShopping()},
    favorites:{bootstrap:()=>librarySystem.renderFavorites()},
    photos:{bootstrap:()=>librarySystem.renderPhotos()},
    culture:{bootstrap:()=>librarySystem.renderCulture()},
    tips:{bootstrap:renderTips}
  });
  const VIEW_ORDER=Object.freeze(Object.keys(VIEW_REGISTRY));
  function bootstrapStaticViews(){
    VIEW_ORDER.forEach(name=>{const view=VIEW_REGISTRY[name];if(!view.bootstrap)return;view.bootstrap();if(!renderedViews.has(name))markRendered(name);});
  }
  const usesMobileDocumentFlow=()=>window.matchMedia('(max-width:600px)').matches;
  const workspaceDocumentTop=()=>{const el=$('.workspace');return el?(el.getBoundingClientRect().top+(window.scrollY||0)):0;};
  const stickyMainTabHeight=()=>{const nav=$('.section-nav');return nav?Math.ceil(nav.getBoundingClientRect().height):0;};
  function scrollMobileViewToTop(){if(!usesMobileDocumentFlow())return;const place=()=>window.scrollTo({left:window.scrollX||0,top:Math.max(0,workspaceDocumentTop()-stickyMainTabHeight()),behavior:'auto'});requestAnimationFrame(()=>{place();requestAnimationFrame(place);});}
  function centerActiveNavButton(name){const nav=$('.section-nav'),button=nav?.querySelector(`[data-view="${CSS.escape(name)}"]`);if(!nav||!button)return;const left=button.offsetLeft-(nav.clientWidth-button.offsetWidth)/2;nav.scrollTo({left:Math.max(0,left),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function syncAppStageMetrics(){const nav=$('.section-nav'),bottom=$('.bottom-nav'),root=document.documentElement;if(nav)root.style.setProperty('--app-nav-height',`${Math.ceil(nav.getBoundingClientRect().height)}px`);const bottomVisible=bottom&&getComputedStyle(bottom).display!=='none';root.style.setProperty('--app-bottom-nav-height',`${bottomVisible?Math.ceil(bottom.getBoundingClientRect().height):0}px`);}
  function ensureAppStageVisible(){const nav=$('.section-nav');if(!nav)return;const rect=nav.getBoundingClientRect();if(rect.top>2||rect.bottom<0)nav.scrollIntoView({block:'start',behavior:'auto'});}
  function showView(name,scroll=true,fitMap=null){
    if(!VIEW_REGISTRY[name])name='itinerary';
    const previous=currentView,changing=previous!==name;currentView=name;
    document.querySelectorAll('.view').forEach(el=>{const active=el.id===`view-${name}`;if(el.hidden)el.hidden=false;el.classList.toggle('is-active',active);el.setAttribute('aria-hidden',String(!active));try{el.inert=!active;}catch{}});
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    VIEW_REGISTRY[name].onShow?.({fitMap});
    try{history.replaceState(null,'','#'+name);}catch{}
    centerActiveNavButton(name);syncAppStageMetrics();
    if(scroll){if(usesMobileDocumentFlow()){if(changing)scrollMobileViewToTop();}else ensureAppStageVisible();}
    if(changing&&!usesMobileDocumentFlow())requestAnimationFrame(()=>document.getElementById(`view-${name}`)?.focus?.({preventScroll:true}));
    librarySystem.syncSaved();navigation.sync();
  }

  // Single app-level action router. Each domain gets first refusal for the data-* actions it owns.
  document.addEventListener('click',event=>{
    const cultureCard=event.target.closest('[data-culture-story]');
    if(cultureCard&&!event.target.closest('a,button,input,select,textarea,label')){readerSystem.openStory(cultureCard.dataset.cultureStory,{opener:cultureCard});return;}
    const b=event.target.closest('button');
    if(!b){const card=event.target.closest('[data-item]');if(card&&!event.target.closest('a,input,select,textarea'))readerSystem.openItem(card.dataset.item,{day:card.dataset.readerDay,kind:card.dataset.readerKind||'',opener:card});return;}
    if(offlineSystem.handleAction(b))return;
    if(weatherSystem.handleAction(b))return;
    if(journeySystem.handleAction(b))return;
    if(readerSystem.handleAction(b))return;
    if(mapSystem.handleAction(b))return;
    if(librarySystem.handleAction(b))return;
    if(b.dataset.save){toggleFavorite(b.dataset.save);return;}
    if(b.dataset.copy){copyAddress(b.dataset.copy);return;}
    if(b.dataset.view){showView(b.dataset.view);return;}
    if(b.hasAttribute('data-reload')){location.reload();return;}
  });
  document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const card=event.target.closest?.('[data-culture-story]');if(!card||event.target.closest('a,button,input,select,textarea,label'))return;event.preventDefault();readerSystem.openStory(card.dataset.cultureStory,{opener:card});});
  document.addEventListener('change',event=>{
    if(offlineSystem.handleChange(event.target))return;
    const networkSelect=event.target.closest('[data-network-profile-select]');
    if(networkSelect){if(networkProfile.set(networkSelect.value)){if(networkProfile.isMainland())navigation.set('amap');toast(`已切換為${networkProfile.name(networkProfile.get())}，正在重新載入…`);setTimeout(()=>location.reload(),180);}return;}
    const select=event.target.closest('[data-map-provider-select]');if(!select)return;if(navigation.set(select.value))toast(`預設導航已切換為${navigation.name(navigation.get())}`);
  });

  function bindMainViewSwipeController(){
    if(document.documentElement.dataset.mainViewSwipeReady==='1')return;document.documentElement.dataset.mainViewSwipeReady='1';
    const INTENT=9,RATIO=1.3,DISTANCE_RATIO=.28,FLICK_VELOCITY=.45;
    const blockedSelector=['button:not(.credit-link)','input','select','textarea','label','summary','dialog','[contenteditable="true"]','.section-nav','.bottom-nav','.content-card','.journey-card','.compact-card','.utility-card','.content-grid','.compact-grid','.culture-grid','.itinerary-day-strip','.itinerary-timetable-frame','.itinerary-timetable-scroll','.day-story-strip','.route-list','.chips','.map-date-control','.map-date-rail','.map-explorer','#map','.leaflet-container','.map-strip-section','.map-place-strip','.map-strip-card','.map-feature-card','.nearby-panel','.location-controls'].join(',');
    let gesture=null,swipeLayer=null,suppressClickUntil=0;
    const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,inSwipeRegion=target=>!!target.closest?.('.workspace,footer'),isBlockedStart=target=>!!target.closest?.(blockedSelector),activeDialog=()=>!!document.querySelector('dialog[open]'),changedTouch=(event,id)=>[...event.changedTouches].find(t=>t.identifier===id),liveTouch=(event,id)=>[...event.touches].find(t=>t.identifier===id);
    function cloneMainDocument(viewName){const sourceWorkspace=$('.workspace');if(!sourceWorkspace)return null;const workspaceClone=sourceWorkspace.cloneNode(true);workspaceClone.classList.add('main-tab-swipe-workspace-clone');workspaceClone.querySelectorAll('.view').forEach(view=>{if(view.id!==`view-${viewName}`){view.remove();return;}view.classList.add('is-active');view.setAttribute('aria-hidden','false');view.removeAttribute('inert');view.hidden=false;});const doc=document.createElement('div');doc.className='main-tab-swipe-document';doc.append(workspaceClone);const footer=document.querySelector('footer');if(footer)doc.append(footer.cloneNode(true));return doc;}
    function makeSwipePane(viewName,{current=false,top=0}={}){const pane=document.createElement('div');pane.className=`main-tab-swipe-pane${current?' is-current':' is-target'}`;const doc=cloneMainDocument(viewName);if(!doc)return null;if(current){const offset=Math.max(0,(window.scrollY||0)+top-workspaceDocumentTop());doc.style.transform=`translate3d(0,${-offset}px,0)`;}else doc.style.transform='translate3d(0,0,0)';pane.append(doc);return pane;}
    function buildSwipeLayer(nextName,step){const nav=$('.section-nav'),bottom=$('.bottom-nav');if(!nav)return null;const navRect=nav.getBoundingClientRect(),top=Math.max(0,Math.min(window.innerHeight,Math.ceil(navRect.bottom))),bottomVisible=bottom&&getComputedStyle(bottom).display!=='none',bottomTop=bottomVisible?bottom.getBoundingClientRect().top:window.innerHeight,bottomInset=Math.max(0,Math.ceil(window.innerHeight-bottomTop)),layer=document.createElement('div');layer.className='main-tab-swipe-layer';layer.setAttribute('aria-hidden','true');layer.style.top=`${top}px`;layer.style.bottom=`${bottomInset}px`;const currentPane=makeSwipePane(currentView,{current:true,top}),targetPane=makeSwipePane(nextName,{current:false,top});if(!currentPane||!targetPane)return null;layer.append(currentPane,targetPane);document.body.append(layer);document.documentElement.classList.add('main-tab-swipe-active');return {layer,currentPane,targetPane,nextName,step,width:Math.max(1,layer.getBoundingClientRect().width||window.innerWidth)};}
    function setSwipePosition(dx,{transition=false,duration=0}={}){if(!swipeLayer)return;const {currentPane,targetPane,step,width}=swipeLayer,base=step===1?width:-width,clamped=step===1?Math.min(0,Math.max(-width,dx)):Math.max(0,Math.min(width,dx)),timing=transition?`transform ${duration}ms cubic-bezier(.22,.72,.2,1)`:'none';currentPane.style.transition=timing;targetPane.style.transition=timing;currentPane.style.transform=`translate3d(${clamped}px,0,0)`;targetPane.style.transform=`translate3d(${clamped+base}px,0,0)`;}
    function removeSwipeLayer(){swipeLayer?.layer.remove();swipeLayer=null;document.documentElement.classList.remove('main-tab-swipe-active');}
    function settleSwipe(commit,dx){if(!swipeLayer){gesture=null;return;}const layer=swipeLayer,duration=reducedMotion()?0:(commit?250:200);suppressClickUntil=performance.now()+Math.max(360,duration+120);const destination=commit?(layer.step===1?-layer.width:layer.width):0;requestAnimationFrame(()=>setSwipePosition(destination,{transition:true,duration}));const finish=()=>{if(swipeLayer!==layer)return;if(!commit){removeSwipeLayer();gesture=null;return;}showView(layer.nextName,true);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(swipeLayer===layer)removeSwipeLayer();gesture=null;}));};if(duration===0)finish();else setTimeout(finish,duration+36);}
    function cancelActiveSwipe(){if(!gesture?.active){gesture=null;removeSwipeLayer();return;}settleSwipe(false,gesture.dx||0);}
    document.addEventListener('touchstart',event=>{if(!usesMobileDocumentFlow()||event.touches.length!==1||activeDialog())return;const target=event.target;if(!inSwipeRegion(target)||isBlockedStart(target))return;const touch=event.touches[0],now=performance.now();gesture={identifier:touch.identifier,view:currentView,startX:touch.clientX,startY:touch.clientY,lastX:touch.clientX,lastT:now,startT:now,velocityX:0,dx:0,active:false,step:0,nextName:null};},{passive:true});
    document.addEventListener('touchmove',event=>{if(!gesture)return;const touch=liveTouch(event,gesture.identifier);if(!touch)return;const dx=touch.clientX-gesture.startX,dy=touch.clientY-gesture.startY;gesture.dx=dx;const now=performance.now(),dt=Math.max(1,now-gesture.lastT);gesture.velocityX=(touch.clientX-gesture.lastX)/dt;gesture.lastX=touch.clientX;gesture.lastT=now;if(!gesture.active){if(Math.max(Math.abs(dx),Math.abs(dy))<INTENT)return;if(Math.abs(dx)<=Math.abs(dy)*RATIO){gesture=null;return;}const index=VIEW_ORDER.indexOf(currentView);if(index<0){gesture=null;return;}const step=dx<0?1:-1,nextIndex=index+step;if(nextIndex<0||nextIndex>=VIEW_ORDER.length){gesture=null;return;}gesture.active=true;gesture.step=step;gesture.nextName=VIEW_ORDER[nextIndex];swipeLayer=buildSwipeLayer(gesture.nextName,step);if(!swipeLayer){gesture=null;return;}}event.preventDefault();setSwipePosition(dx);},{passive:false});
    document.addEventListener('touchend',event=>{if(!gesture)return;const touch=changedTouch(event,gesture.identifier);if(!touch)return;if(!gesture.active){gesture=null;return;}const now=performance.now(),dt=Math.max(1,now-gesture.lastT);if(now-gesture.lastT<90)gesture.velocityX=(touch.clientX-gesture.lastX)/dt;const dx=touch.clientX-gesture.startX;gesture.dx=dx;const towardVelocity=gesture.step===1?-gesture.velocityX:gesture.velocityX,distanceReady=Math.abs(dx)>=swipeLayer.width*DISTANCE_RATIO,flickReady=towardVelocity>=FLICK_VELOCITY&&Math.abs(dx)>=INTENT*2;settleSwipe(distanceReady||flickReady,dx);},{passive:true});
    document.addEventListener('touchcancel',()=>cancelActiveSwipe(),{passive:true});window.addEventListener('resize',()=>{if(gesture||swipeLayer){gesture=null;removeSwipeLayer();}});document.addEventListener('click',event=>{if(performance.now()>=suppressClickUntil)return;event.preventDefault();event.stopImmediatePropagation();},true);
  }
  // Build stable non-map DOM before gesture binding. Image elements remain lazy-loaded; Leaflet is created only after the Map view is visible.

  // Static shell content.
  $('#header-date').textContent=tripData.dateLabel+' · 8 DAYS';$('#hero-date').textContent=tripData.dateLabel;$('.hero').style.backgroundImage=`url("${tripData.heroImage}")`;
  $('#journey-strip').innerHTML=tripData.route.map(c=>`<span class="route-stop">${esc(c)}</span>`).join('');
  const credit=tripData.imageCredit;$('#credits').innerHTML=`照片：<a href="${esc(credit.url)}" target="_blank" rel="noopener noreferrer">${esc(credit.title)} · ${esc(credit.author)}</a> / <a href="${esc(credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(credit.license)}</a>（版面裁切）<br>行程依手冊整理 · 資料查核 ${esc(tripData.checkedAt)}`;
  $('#credits').insertAdjacentHTML('beforeend','<br><button class="credit-link" data-view="culture">實拍照片與故事來源 →</button>');
  if(todayDay){$('#today').hidden=false;$('#today').innerHTML=`<span class="eyebrow">TODAY</span><h3>Day ${todayDay.day} · ${esc(todayDay.city)}</h3><p>今天：${todayDay.itinerary.map(id=>esc(items[id].name)).join(' → ')}<br>今晚：${todayDay.nightRecommendations.length?esc(items[todayDay.nightRecommendations[0]].name):'休息／返程'}</p><button class="primary" data-night-day="${todayDay.day}">查看今晚安排</button>`;}
  bootstrapStaticViews();
  networkProfile.sync();
  offlineSystem.start();
  weatherSystem.start();
  bindMainViewSwipeController();
  navigation.sync();librarySystem.syncSaved();

  window.addEventListener('hashchange',()=>showView(location.hash.slice(1),false));
  window.addEventListener('resize',()=>{syncAppStageMetrics();if(currentView==='map')requestAnimationFrame(()=>mapSystem.invalidate());},{passive:true});
  window.addEventListener('yunnan:connection-change',()=>{if(currentView!=='map')return;networkProfile.loadLeaflet().finally(()=>requestAnimationFrame(()=>mapSystem.render(false)));});
  window.addEventListener('pagehide',()=>{mapSystem.cleanup();journeySystem.cleanup();weatherSystem.cleanup();});
  if('ResizeObserver' in window){const observer=new ResizeObserver(syncAppStageMetrics);const top=$('.section-nav'),bottom=$('.bottom-nav');if(top)observer.observe(top);if(bottom)observer.observe(bottom);}
  showView(location.hash.slice(1)||'itinerary',false);
  if(!favoritesStore.isStorageAvailable()||!navigation.isStorageAvailable()||!mapSystem.isStorageAvailable()||!weatherSystem.isStorageAvailable()||!networkProfile.isStorageAvailable())toast('瀏覽器儲存功能受限；部分偏好或天氣快取可能無法保留');
})();
