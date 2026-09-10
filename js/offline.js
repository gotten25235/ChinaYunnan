/* Offline/PWA domain: selective offline preparation, cache verification, connectivity UI, install prompt and user-data backup. */
(() => {
  'use strict';

  let deferredInstallPrompt=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;window.dispatchEvent(new CustomEvent('yunnan:pwa-install-available'));});
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;window.dispatchEvent(new CustomEvent('yunnan:pwa-installed'));});

  function create({toast,weatherSystem,showView}={}){
    const STATE_KEY='yunnan-offline-prep-state-v1';
    const USER_DATA_KEYS=[
      'yunnan-2026-favorites-v1',
      'yunnan-2026-map-provider-v1',
      'yunnan-2026-network-profile-v1',
      'yunnan-2026-ui-layout-v1',
      'yunnan-2026-network-profile-default-intl-20260910',
      'yunnan-2026-custom-map-v1',
      'yunnan-2026-custom-map-snow-migration-v1'
    ];
    let state={lastPreparedAt:0,lastCheck:null,selections:{photos:true,weather:true}};
    try{const raw=localStorage.getItem(STATE_KEY);if(raw){const saved=JSON.parse(raw);state={...state,...saved,selections:{...state.selections,...(saved?.selections||{})}};}}catch{}

    const fmtTime=value=>{if(!value)return '尚未完成';try{return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return new Date(value).toLocaleString('zh-TW');}};
    const escHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
    const escAttr=value=>escHtml(value);
    const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
    const canUseServiceWorker=()=>('serviceWorker' in navigator)&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname));
    const selections=()=>({photos:state.selections?.photos!==false,weather:state.selections?.weather!==false});
    function save(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch{}}

    function weatherCacheReady(){try{const raw=localStorage.getItem('yunnan-weather-cache-v1');if(!raw)return false;const parsed=JSON.parse(raw);return Boolean(parsed?.records&&Object.keys(parsed.records).length);}catch{return false;}}
    function coreMissing(result){return Number(result?.coreMissing??-1);}
    function photoMissing(result){
      if(Number.isFinite(Number(result?.photoMissing)))return Number(result.photoMissing);
      const local=Number(result?.photoLocalMissing??0),remote=Number(result?.remoteMissing??0);return local+remote;
    }
    function selectedReady(result=state.lastCheck){
      const selected=selections(),core=coreMissing(result);
      if(core!==0)return false;
      if(selected.photos&&photoMissing(result)!==0)return false;
      if(selected.weather&&!weatherCacheReady())return false;
      return true;
    }
    function syncShortcut(result=state.lastCheck,{working=false}={}){
      const button=document.querySelector('[data-offline-jump]');if(!button)return;
      const ready=selectedReady(result),online=navigator.onLine;
      let wide='⇩ 離線準備',compact='⇩ 離線',mode='idle',title='前往離線準備';
      if(working){wide='… 準備中';compact='… 離線';mode='working';title='正在準備已選取的離線內容，點此查看進度';}
      else if(ready&&online){wide='✓ 離線已備妥';compact='✓ 離線';mode='ready';title='目前選取的離線內容已準備完成';}
      else if(ready&&!online){wide='✓ 離線可用';compact='✓ 離線';mode='ready';title='目前離線，已選取的離線內容可使用';}
      else if(!online){wide='! 離線未備妥';compact='! 離線';mode='partial';title='目前離線且已選內容尚未完整';}
      button.dataset.state=mode;button.title=title;button.setAttribute('aria-label',title);
      const wideEl=button.querySelector('[data-offline-shortcut-label]'),compactEl=button.querySelector('[data-offline-shortcut-compact]');
      if(wideEl)wideEl.textContent=wide;if(compactEl)compactEl.textContent=compact;
    }
    function syncConnection(){
      const online=navigator.onLine;
      document.documentElement.dataset.connection=online?'online':'offline';
      const badge=document.querySelector('#connection-badge');
      if(badge){badge.textContent=online?'● 線上':'● 離線';badge.classList.toggle('is-offline',!online);badge.classList.toggle('is-online',online);badge.title=online?'目前可連線；即時天氣與線上地圖可更新':'目前離線；使用已下載的旅程資料與最後一次天氣快取';}
      document.querySelectorAll('[data-offline-connection]').forEach(el=>{el.textContent=online?'線上，可下載／更新已選內容':'目前離線，使用已準備的資料';el.dataset.state=online?'online':'offline';});
      syncShortcut();
    }

    function settingsHtml(){
      const selected=selections();
      return `<article class="offline-ready-card utility-card utility-card--settings" data-offline-card><div class="offline-ready-head"><div><span class="eyebrow">OFFLINE PWA</span><h3>離線準備</h3><p class="small">出發前保持網路，先選擇要帶走的離線內容，再按「下載已選內容」。網頁核心與行程資料固定保留；旅行照片與天氣可分開決定。預設全部選取。</p></div><span class="offline-ready-badge" data-offline-ready-badge>尚未檢查</span></div><section class="offline-select-panel" aria-label="離線下載內容"><div class="offline-select-head"><div><strong>下載內容</strong><small>預設全選；網頁核心為必要項目</small></div><div class="offline-select-actions"><button type="button" class="action" data-offline-select-all>全選</button><button type="button" class="action" data-offline-select-none>清除選取</button></div></div><div class="offline-select-grid"><label class="offline-select-item is-required"><input type="checkbox" checked disabled><span><strong>網頁核心與其他資料 <em>必要</em></strong><small>行程、飯店、地標、美食、故事、介面與 PWA 基礎</small></span></label><label class="offline-select-item"><input type="checkbox" data-offline-select-photos ${selected.photos?'checked':''}><span><strong>旅行照片</strong><small data-offline-photo-choice-meta>景點、飯店、活動、食物與文化照片</small></span></label><label class="offline-select-item"><input type="checkbox" data-offline-select-weather ${selected.weather?'checked':''}><span><strong>天氣離線資料</strong><small>下載時先更新一次；離線後沿用最後成功預報</small></span></label></div></section><div class="offline-progress" aria-live="polite"><div class="offline-progress-track"><span data-offline-progress-bar></span></div><div class="offline-progress-copy"><strong data-offline-progress-label>等待檢查</strong><span data-offline-progress-count></span></div></div><div class="offline-check-grid offline-check-grid--selective"><span><b data-offline-local-status>○</b><span data-offline-local-label>網頁核心與其他資料</span></span><span><b data-offline-photo-status>○</b><span data-offline-photo-label>旅行照片</span></span><span><b data-offline-weather-status>○</b><span data-offline-weather-label>天氣離線資料</span></span></div><p class="small offline-connection-line"><span data-offline-connection>${navigator.onLine?'線上，可下載／更新已選內容':'目前離線，使用已準備的資料'}</span> · 最近準備：<span data-offline-last>${fmtTime(state.lastPreparedAt)}</span></p><div class="offline-ready-actions"><button type="button" class="primary" data-offline-prepare>↓ 下載已選內容</button><button type="button" class="action" data-offline-retry-missing hidden>↻ 只重試未下載照片</button><button type="button" class="action" data-offline-check>重新檢查</button><button type="button" class="action" data-offline-install ${isStandalone()?'hidden':''}>＋ 安裝到主畫面</button></div><details class="offline-missing-tools" data-offline-missing hidden><summary data-offline-missing-summary>查看未下載項目</summary><p class="small">只列出目前選取內容真正缺少的檔案／照片；未勾選的旅行照片不會被判定成離線未完成。</p><div class="offline-missing-list" data-offline-missing-list></div></details><details class="offline-clear-tools"><summary>清除離線資料</summary><p class="small">可分開清除照片或天氣，也可清除全部離線下載。這些操作不會刪除收藏、自定義地標、介面版面、連網模式、導航偏好或高德／QWeather API Key；核心 App Shell 會保留。</p><div class="offline-clear-actions"><button type="button" class="action offline-clear-button" data-offline-clear-photos>清除照片快取</button><button type="button" class="action offline-clear-button" data-offline-clear-weather>清除天氣快取</button><button type="button" class="action offline-clear-button offline-clear-button--all" data-offline-clear-all>清除全部離線下載</button></div></details><details class="offline-data-tools"><summary>備份我的收藏與自定義</summary><p class="small">匯出只包含收藏、自定義地標、介面版面、連網模式與導航偏好；不包含高德／QWeather API Key。</p><div class="offline-ready-actions"><button type="button" class="action" data-offline-export>匯出我的資料</button><button type="button" class="action" data-offline-import-pick>匯入我的資料</button><input type="file" accept="application/json,.json" data-offline-import hidden></div></details><p class="small offline-install-note" data-offline-install-note>${isStandalone()?'已以主畫面 App 模式開啟。':'若手機沒有顯示安裝按鈕：iPhone / iPad 請用 Safari 的「分享 → 加入主畫面」；Android Chrome 可從瀏覽器選單安裝。'}</p></article>`;
    }

    async function swRequest(type,payload={},onProgress=null){
      if(!canUseServiceWorker())throw new Error('此網址環境不支援 Service Worker');
      const registration=await navigator.serviceWorker.ready;
      const worker=navigator.serviceWorker.controller||registration.active||registration.waiting;
      if(!worker)throw new Error('離線服務尚未啟動');
      return await new Promise((resolve,reject)=>{
        const channel=new MessageChannel();let timer=setTimeout(()=>reject(new Error('離線服務回應逾時')),180000);
        channel.port1.onmessage=event=>{const msg=event.data||{};if(msg.type==='OFFLINE_PROGRESS'){onProgress?.(msg);return;}if(msg.type==='OFFLINE_ERROR'){clearTimeout(timer);reject(new Error(msg.error||'離線準備失敗'));return;}if(msg.type==='OFFLINE_RESULT'){clearTimeout(timer);resolve(msg.result||{});}};
        worker.postMessage({type,...payload},[channel.port2]);
      });
    }

    function paint(result=state.lastCheck){
      const card=document.querySelector('[data-offline-card]');if(!card)return;
      const selected=selections();
      const coreMiss=coreMissing(result),coreTotal=Number(result?.coreTotal??0),coreChecked=coreMiss>=0;
      const photoLocalMiss=Number(result?.photoLocalMissing??0),photoLocalTotal=Number(result?.photoLocalTotal??0),remoteMiss=Number(result?.remoteMissing??0),remoteTotal=Number(result?.remoteTotal??0);
      const photosMiss=photoMissing(result),photosTotal=Number(result?.photoTotal??(photoLocalTotal+remoteTotal)),photosChecked=coreChecked&&Number.isFinite(photosMiss);
      const weatherReady=weatherCacheReady(),ready=selectedReady(result),checked=coreChecked;
      const localMissingItems=Array.isArray(result?.coreMissingItems)?result.coreMissingItems:[];
      const photoLocalMissingItems=Array.isArray(result?.photoLocalMissingItems)?result.photoLocalMissingItems:[];
      const remoteMissingItems=Array.isArray(result?.remoteMissingItems)?result.remoteMissingItems:[];

      const badge=card.querySelector('[data-offline-ready-badge]');
      if(badge){badge.textContent=ready?'✓ 已選內容準備完成':checked?'尚未完整':'尚未檢查';badge.dataset.state=ready?'ready':checked?'partial':'idle';}

      const coreStatus=card.querySelector('[data-offline-local-status]'),photoStatus=card.querySelector('[data-offline-photo-status]'),weatherStatus=card.querySelector('[data-offline-weather-status]');
      const coreLabel=card.querySelector('[data-offline-local-label]'),photoLabel=card.querySelector('[data-offline-photo-label]'),weatherLabel=card.querySelector('[data-offline-weather-label]'),photoChoice=card.querySelector('[data-offline-photo-choice-meta]');
      if(coreStatus)coreStatus.textContent=checked?(coreMiss===0?'✓':'!'):'○';
      if(coreLabel)coreLabel.textContent=checked?`網頁核心與其他資料 · ${Math.max(0,coreTotal-coreMiss)} / ${coreTotal}`:'網頁核心與其他資料';
      if(photoStatus)photoStatus.textContent=!selected.photos?'—':photosChecked?(photosMiss===0?'✓':'!'):'○';
      if(photoLabel)photoLabel.textContent=!selected.photos?'旅行照片 · 未選取':photosChecked?`旅行照片 · ${Math.max(0,photosTotal-photosMiss)} / ${photosTotal}`:'旅行照片';
      if(photoChoice&&photosTotal)photoChoice.textContent=`景點、飯店、活動、食物與文化照片 · ${photosTotal} 張`;
      if(weatherStatus)weatherStatus.textContent=!selected.weather?'—':weatherReady?'✓':'○';
      if(weatherLabel)weatherLabel.textContent=!selected.weather?'天氣離線資料 · 未選取':weatherReady?'天氣離線資料 · 已有最後快取':'天氣離線資料 · 尚無快取';

      const label=card.querySelector('[data-offline-progress-label]'),count=card.querySelector('[data-offline-progress-count]'),bar=card.querySelector('[data-offline-progress-bar]');
      if(checked){
        const coreCached=Math.max(0,coreTotal-coreMiss),photoCached=Math.max(0,photosTotal-photosMiss),weatherTotal=selected.weather?1:0,weatherCached=selected.weather&&weatherReady?1:0;
        const total=coreTotal+(selected.photos?photosTotal:0)+weatherTotal;
        const cached=coreCached+(selected.photos?photoCached:0)+weatherCached;
        const pct=total?Math.max(0,Math.min(100,cached/total*100)):100;
        if(label){
          if(ready)label.textContent='目前選取的離線內容已準備完成';
          else if(coreMiss>0)label.textContent=`網頁核心仍缺 ${coreMiss} 項`;
          else if(selected.photos&&photosMiss>0)label.textContent=`旅行照片尚缺 ${photosMiss} 張`;
          else if(selected.weather&&!weatherReady)label.textContent='天氣快取尚未取得';
          else label.textContent='仍有已選內容尚未完成';
        }
        if(count)count.textContent=`${cached} / ${total}`;
        if(bar)bar.style.width=`${pct}%`;
      }else{
        if(label)label.textContent='等待檢查';if(count)count.textContent='';if(bar)bar.style.width='0%';
      }

      const selectedCoreMissing=checked?Math.max(0,coreMiss):0;
      const selectedPhotoMissing=selected.photos&&photosChecked?Math.max(0,photosMiss):0;
      const missingCount=selectedCoreMissing+selectedPhotoMissing;
      const missingDetails=card.querySelector('[data-offline-missing]'),missingSummary=card.querySelector('[data-offline-missing-summary]'),missingList=card.querySelector('[data-offline-missing-list]'),retryButton=card.querySelector('[data-offline-retry-missing]');
      if(missingDetails){missingDetails.hidden=!checked||missingCount===0;if(!missingDetails.hidden&&missingCount<=3)missingDetails.open=true;}
      if(missingSummary)missingSummary.textContent=`查看未下載項目${checked&&missingCount?`（${missingCount}）`:''}`;
      if(retryButton)retryButton.hidden=!selected.photos||!photosChecked||photosMiss===0||!navigator.onLine;
      if(missingList){
        const coreRows=localMissingItems.map(item=>`<div class="offline-missing-item"><div><b>核心檔案</b><span>${escHtml(item.label||item.asset||'未知檔案')}</span></div></div>`);
        const localPhotoRows=selected.photos?photoLocalMissingItems.map(item=>`<div class="offline-missing-item"><div><b>本地照片未下載</b><span>${escHtml(item.label||item.asset||'未知照片')}</span><small>${escHtml(item.asset||'')}</small></div></div>`):[];
        const remoteRows=selected.photos?remoteMissingItems.map(item=>`<div class="offline-missing-item"><div><b>遠端照片未下載</b><span>${escHtml(item.label||item.id||'未命名照片')}</span><small>${escHtml(item.url||'')}</small></div>${item.source?`<a href="${escAttr(item.source)}" target="_blank" rel="noopener noreferrer">來源頁 ↗</a>`:''}</div>`):[];
        missingList.innerHTML=[...coreRows,...localPhotoRows,...remoteRows].join('')||'<p class="small">目前選取內容沒有缺少項目。</p>';
      }
      const last=card.querySelector('[data-offline-last]');if(last)last.textContent=fmtTime(state.lastPreparedAt);
      const photoInput=card.querySelector('[data-offline-select-photos]'),weatherInput=card.querySelector('[data-offline-select-weather]');if(photoInput)photoInput.checked=selected.photos;if(weatherInput)weatherInput.checked=selected.weather;
      syncConnection();
    }

    async function check({quiet=false}={}){
      const card=document.querySelector('[data-offline-card]');
      try{const result=await swRequest('CHECK_OFFLINE');state.lastCheck=result;save();paint(result);if(!quiet)toast?.(selectedReady(result)?'目前選取的離線內容完整':'仍有已選內容尚未下載');return result;}
      catch(error){console.warn(error);if(card){const label=card.querySelector('[data-offline-progress-label]');if(label)label.textContent='離線服務尚未就緒';}if(!quiet)toast?.('離線服務尚未就緒，請重新整理後再試');return null;}
    }

    function progress(msg){syncShortcut(state.lastCheck,{working:true});const card=document.querySelector('[data-offline-card]');if(!card)return;const done=Number(msg.done||0),total=Number(msg.total||0),pct=total?done/total*100:0;const label=card.querySelector('[data-offline-progress-label]'),count=card.querySelector('[data-offline-progress-count]'),bar=card.querySelector('[data-offline-progress-bar]');if(label)label.textContent=msg.label||'正在下載已選內容…';if(count)count.textContent=`${done} / ${total}`;if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}
    function setWorkingLabel(text){const card=document.querySelector('[data-offline-card]'),label=card?.querySelector('[data-offline-progress-label]');if(label)label.textContent=text;syncShortcut(state.lastCheck,{working:true});}

    async function prepare(button){
      if(!navigator.onLine){toast?.('目前沒有網路，無法新增離線資料');await check({quiet:true});return;}
      const selected=selections();button.disabled=true;const original=button.textContent;button.textContent='下載中…';syncShortcut(state.lastCheck,{working:true});
      try{
        if(navigator.storage?.persist){try{await navigator.storage.persist();}catch{}}
        if(selected.weather){setWorkingLabel('正在更新天氣離線資料…');try{await weatherSystem?.refresh?.(true);}catch(error){console.warn('Weather preflight failed',error);}}
        const result=await swRequest('PREPARE_OFFLINE',{includePhotos:selected.photos},progress);state.lastCheck=result;
        const ready=selectedReady(result);if(ready)state.lastPreparedAt=Date.now();save();paint(result);
        if(ready)toast?.('已選內容準備完成；可開飛航模式測試');
        else if(selected.photos&&photoMissing(result)>0){const first=result.remoteMissingItems?.[0]?.label||result.photoLocalMissingItems?.[0]?.label||'';toast?.(`旅行照片尚缺 ${photoMissing(result)} 張${first?`（${first}）`:''}`);}
        else if(selected.weather&&!weatherCacheReady())toast?.('核心資料已完成，但天氣快取尚未取得');
        else toast?.('仍有已選內容尚未完成');
      }catch(error){console.error(error);toast?.(`離線準備失敗：${error.message}`);await check({quiet:true});}
      finally{button.disabled=false;button.textContent=original;syncShortcut();}
    }

    async function retryMissing(button){
      if(!navigator.onLine){toast?.('目前沒有網路，無法重試照片');return;}
      button.disabled=true;const original=button.textContent;button.textContent='重試中…';syncShortcut(state.lastCheck,{working:true});
      try{const result=await swRequest('RETRY_OFFLINE_PHOTOS',{},progress);state.lastCheck=result;if(selectedReady(result))state.lastPreparedAt=Date.now();save();paint(result);if(photoMissing(result)===0)toast?.('未下載照片已補齊');else toast?.(`仍有 ${photoMissing(result)} 張照片未下載：${result.remoteMissingItems?.[0]?.label||result.photoLocalMissingItems?.[0]?.label||''}`);}
      catch(error){console.error(error);toast?.(`重試照片失敗：${error.message}`);}
      finally{button.disabled=false;button.textContent=original;syncShortcut();}
    }

    function setSelections(next){state.selections={photos:next.photos!==false,weather:next.weather!==false};save();paint();}
    function install(){
      if(isStandalone()){toast?.('目前已是主畫面 App 模式');return;}
      if(deferredInstallPrompt){deferredInstallPrompt.prompt();deferredInstallPrompt.userChoice.catch(()=>{}).finally(()=>{deferredInstallPrompt=null;hydrate();});return;}
      toast?.('iPhone / iPad：Safari 分享 → 加入主畫面；Android：瀏覽器選單 → 安裝');
    }

    async function clearPhotos(){
      if(!confirm('要清除已下載的旅行照片快取嗎？之後可重新勾選「旅行照片」再下載。'))return;
      try{const result=await swRequest('CLEAR_OFFLINE_PHOTOS');state.lastCheck=result;state.lastPreparedAt=0;save();paint(result);toast?.('已清除旅行照片快取');}
      catch(error){console.error(error);toast?.(`清除照片快取失敗：${error.message}`);}
    }
    function clearWeather(){
      if(!confirm('要清除最後成功取得的天氣快取嗎？API Key 與天氣來源設定會保留。'))return;
      try{if(weatherSystem?.clearCache)weatherSystem.clearCache({notify:false});else localStorage.removeItem('yunnan-weather-cache-v1');state.lastPreparedAt=0;save();paint();toast?.('已清除天氣快取');}
      catch(error){console.error(error);toast?.('清除天氣快取失敗');}
    }
    async function clearAllOffline(){
      if(!confirm('要清除全部可選離線下載嗎？會清除旅行照片、額外快取與天氣快取；網頁核心、收藏、自定義地標、偏好及 API Key 都會保留。'))return;
      try{
        const result=await swRequest('CLEAR_OFFLINE_DOWNLOADS');
        if(weatherSystem?.clearCache)weatherSystem.clearCache({notify:false});else localStorage.removeItem('yunnan-weather-cache-v1');
        state={...state,lastPreparedAt:0,lastCheck:result};save();paint(result);toast?.('已清除可選離線下載；網頁核心仍可使用');
      }catch(error){console.error(error);toast?.(`清除離線資料失敗：${error.message}`);}
    }

    function exportUserData(){
      const values={};for(const key of USER_DATA_KEYS){try{const value=localStorage.getItem(key);if(value!==null)values[key]=value;}catch{}}
      const payload={schema:'yunnan-user-data-v1',exportedAt:new Date().toISOString(),values};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yunnan-my-data-v1.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast?.('已匯出收藏與偏好');
    }
    async function importUserData(input){
      const file=input?.files?.[0];if(!file)return false;
      try{const data=JSON.parse(await file.text());if(data?.schema!=='yunnan-user-data-v1'||!data.values||typeof data.values!=='object')throw new Error('檔案格式不符');let count=0;for(const key of USER_DATA_KEYS){if(Object.prototype.hasOwnProperty.call(data.values,key)&&typeof data.values[key]==='string'){localStorage.setItem(key,data.values[key]);count++;}}toast?.(`已匯入 ${count} 項設定，正在重新載入…`);setTimeout(()=>location.reload(),350);return true;}catch(error){console.error(error);toast?.('匯入失敗：不是有效的雲南 V1 備份檔');input.value='';return false;}
    }

    function jumpToOffline(){
      showView?.('settings',false);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const card=document.querySelector('[data-offline-card]');if(!card)return;
        card.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
        card.classList.remove('is-jump-target');void card.offsetWidth;card.classList.add('is-jump-target');setTimeout(()=>card.classList.remove('is-jump-target'),1300);
      }));
    }

    function handleAction(button){
      if(button?.hasAttribute('data-offline-jump')){jumpToOffline();return true;}
      if(button?.hasAttribute('data-offline-prepare')){prepare(button);return true;}
      if(button?.hasAttribute('data-offline-retry-missing')){retryMissing(button);return true;}
      if(button?.hasAttribute('data-offline-check')){check();return true;}
      if(button?.hasAttribute('data-offline-install')){install();return true;}
      if(button?.hasAttribute('data-offline-select-all')){setSelections({photos:true,weather:true});toast?.('已全選離線內容');return true;}
      if(button?.hasAttribute('data-offline-select-none')){setSelections({photos:false,weather:false});toast?.('已清除可選項目；核心資料仍固定保留');return true;}
      if(button?.hasAttribute('data-offline-clear-photos')){clearPhotos();return true;}
      if(button?.hasAttribute('data-offline-clear-weather')){clearWeather();return true;}
      if(button?.hasAttribute('data-offline-clear-all')){clearAllOffline();return true;}
      if(button?.hasAttribute('data-offline-export')){exportUserData();return true;}
      if(button?.hasAttribute('data-offline-import-pick')){button.closest('[data-offline-card]')?.querySelector('[data-offline-import]')?.click();return true;}
      return false;
    }
    function handleChange(target){
      if(target?.matches?.('[data-offline-select-photos]')){state.selections={...selections(),photos:target.checked};save();paint();return true;}
      if(target?.matches?.('[data-offline-select-weather]')){state.selections={...selections(),weather:target.checked};save();paint();return true;}
      if(!target?.matches?.('[data-offline-import]'))return false;importUserData(target);return true;
    }
    function hydrate(){syncConnection();paint();setTimeout(()=>check({quiet:true}),350);const installButton=document.querySelector('[data-offline-install]');if(installButton)installButton.hidden=isStandalone();const note=document.querySelector('[data-offline-install-note]');if(note&&isStandalone())note.textContent='已以主畫面 App 模式開啟。';}
    function start(){syncConnection();window.addEventListener('online',()=>{syncConnection();toast?.('已恢復連線');window.dispatchEvent(new CustomEvent('yunnan:connection-change',{detail:{online:true}}));});window.addEventListener('offline',()=>{syncConnection();toast?.('目前離線，改用已下載資料');window.dispatchEvent(new CustomEvent('yunnan:connection-change',{detail:{online:false}}));});window.addEventListener('yunnan:pwa-install-available',hydrate);window.addEventListener('yunnan:pwa-installed',hydrate);}

    return {settingsHtml,hydrate,start,handleAction,handleChange,check,prepare,isStandalone};
  }
  window.YunnanOfflineSystem={create};
})();
