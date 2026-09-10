/* Offline/PWA domain: explicit offline preparation, cache verification, connectivity UI, install prompt and user-data backup. */
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
      'yunnan-2026-network-profile-default-intl-20260910',
      'yunnan-2026-custom-map-v1',
      'yunnan-2026-custom-map-snow-migration-v1'
    ];
    let state={lastPreparedAt:0,lastCheck:null};
    try{const raw=localStorage.getItem(STATE_KEY);if(raw)state={...state,...JSON.parse(raw)};}catch{}

    const fmtTime=value=>{if(!value)return '尚未完成';try{return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return new Date(value).toLocaleString('zh-TW');}};
    const escHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]||ch));
    const escAttr=value=>escHtml(value);
    const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
    const canUseServiceWorker=()=>('serviceWorker' in navigator)&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname));
    function save(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch{}}

    function offlineReady(result=state.lastCheck){return Number(result?.localMissing??-1)===0&&Number(result?.remoteMissing??-1)===0;}
    function syncShortcut(result=state.lastCheck,{working=false}={}){
      const button=document.querySelector('[data-offline-jump]');if(!button)return;
      const ready=offlineReady(result),online=navigator.onLine;
      let wide='⇩ 離線準備',compact='⇩ 離線',mode='idle',title='前往離線準備';
      if(working){wide='… 準備中';compact='… 離線';mode='working';title='離線資料正在準備中，點此查看進度';}
      else if(ready&&online){wide='✓ 離線已備妥';compact='✓ 離線';mode='ready';title='離線版已準備完成，點此查看狀態';}
      else if(ready&&!online){wide='✓ 離線可用';compact='✓ 離線';mode='ready';title='目前離線，已準備的資料可使用';}
      else if(!online){wide='! 離線未備妥';compact='! 離線';mode='partial';title='目前離線且資料尚未完整，點此查看狀態';}
      button.dataset.state=mode;button.title=title;button.setAttribute('aria-label',title);
      const wideEl=button.querySelector('[data-offline-shortcut-label]'),compactEl=button.querySelector('[data-offline-shortcut-compact]');if(wideEl)wideEl.textContent=wide;if(compactEl)compactEl.textContent=compact;
    }
    function syncConnection(){
      const online=navigator.onLine;
      document.documentElement.dataset.connection=online?'online':'offline';
      const badge=document.querySelector('#connection-badge');
      if(badge){badge.textContent=online?'● 線上':'● 離線';badge.classList.toggle('is-offline',!online);badge.classList.toggle('is-online',online);badge.title=online?'目前可連線；即時天氣與線上地圖可更新':'目前離線；使用已下載的旅程資料與最後一次天氣快取';}
      document.querySelectorAll('[data-offline-connection]').forEach(el=>{el.textContent=online?'線上，可下載／更新離線資料':'目前離線，使用已準備的資料';el.dataset.state=online?'online':'offline';});
      syncShortcut();
    }

    function settingsHtml(){
      return `<article class="offline-ready-card utility-card utility-card--settings" data-offline-card><div class="offline-ready-head"><div><span class="eyebrow">OFFLINE PWA</span><h3>離線準備</h3><p class="small">出發前保持網路，按一次「下載離線資料」。完成後，行程、飯店、景點、照片、美食、故事與收藏可在沒網路時開啟；天氣沿用最後成功資料，線上地圖底圖與導航仍需網路／地圖 App。</p></div><span class="offline-ready-badge" data-offline-ready-badge>尚未檢查</span></div><div class="offline-progress" aria-live="polite"><div class="offline-progress-track"><span data-offline-progress-bar></span></div><div class="offline-progress-copy"><strong data-offline-progress-label>等待檢查</strong><span data-offline-progress-count></span></div></div><div class="offline-check-grid"><span><b data-offline-local-status>○</b> 網頁核心與本地資料</span><span><b data-offline-photo-status>○</b> 全部旅程照片</span><span><b>✓</b> 地標／行程資料</span><span><b data-offline-weather-status>○</b> 最後天氣快取</span></div><p class="small offline-connection-line"><span data-offline-connection>${navigator.onLine?'線上，可下載／更新離線資料':'目前離線，使用已準備的資料'}</span> · 上次完成：<span data-offline-last>${fmtTime(state.lastPreparedAt)}</span></p><div class="offline-ready-actions"><button type="button" class="primary" data-offline-prepare>↓ 下載離線資料</button><button type="button" class="action" data-offline-retry-missing hidden>↻ 只重試未下載照片</button><button type="button" class="action" data-offline-check>重新檢查</button><button type="button" class="action" data-offline-install ${isStandalone()?'hidden':''}>＋ 安裝到主畫面</button></div><details class="offline-missing-tools" data-offline-missing hidden><summary data-offline-missing-summary>查看未下載項目</summary><p class="small">這裡會直接列出真正缺少的檔案／照片，不再只顯示 115 / 116。</p><div class="offline-missing-list" data-offline-missing-list></div></details><details class="offline-clear-tools"><summary>清除離線資料</summary><p class="small">可分開清除照片或天氣，也可清除全部離線下載。這些操作不會刪除收藏、自定義地標、連網模式、導航偏好或高德／QWeather API Key；核心 App Shell 會保留。</p><div class="offline-clear-actions"><button type="button" class="action offline-clear-button" data-offline-clear-photos>清除照片快取</button><button type="button" class="action offline-clear-button" data-offline-clear-weather>清除天氣快取</button><button type="button" class="action offline-clear-button offline-clear-button--all" data-offline-clear-all>清除全部離線下載</button></div></details><details class="offline-data-tools"><summary>備份我的收藏與自定義</summary><p class="small">匯出只包含收藏、自定義地標、連網模式與導航偏好；不包含高德／QWeather API Key。</p><div class="offline-ready-actions"><button type="button" class="action" data-offline-export>匯出我的資料</button><button type="button" class="action" data-offline-import-pick>匯入我的資料</button><input type="file" accept="application/json,.json" data-offline-import hidden></div></details><p class="small offline-install-note" data-offline-install-note>${isStandalone()?'已以主畫面 App 模式開啟。':'若手機沒有顯示安裝按鈕：iPhone / iPad 請用 Safari 的「分享 → 加入主畫面」；Android Chrome 可從瀏覽器選單安裝。'}</p></article>`;
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

    function weatherCacheReady(){try{const raw=localStorage.getItem('yunnan-weather-cache-v1');if(!raw)return false;const parsed=JSON.parse(raw);return Boolean(parsed?.records&&Object.keys(parsed.records).length);}catch{return false;}}
    function paint(result=state.lastCheck){
      const card=document.querySelector('[data-offline-card]');if(!card)return;
      const localMissing=Number(result?.localMissing??-1),remoteMissing=Number(result?.remoteMissing??-1),localTotal=Number(result?.localTotal??0),remoteTotal=Number(result?.remoteTotal??0),checked=localMissing>=0&&remoteMissing>=0,ready=checked&&localMissing===0&&remoteMissing===0;
      const localMissingItems=Array.isArray(result?.localMissingItems)?result.localMissingItems:[],remoteMissingItems=Array.isArray(result?.remoteMissingItems)?result.remoteMissingItems:[];
      const badge=card.querySelector('[data-offline-ready-badge]');if(badge){badge.textContent=ready?'✓ 離線版已準備完成':checked?'尚未完整':'尚未檢查';badge.dataset.state=ready?'ready':checked?'partial':'idle';}
      const local=card.querySelector('[data-offline-local-status]'),photo=card.querySelector('[data-offline-photo-status]'),weather=card.querySelector('[data-offline-weather-status]');
      if(local)local.textContent=checked?(localMissing===0?'✓':'!'):'○';if(photo)photo.textContent=checked?(remoteMissing===0?'✓':'!'):'○';if(weather)weather.textContent=weatherCacheReady()?'✓':'○';
      const label=card.querySelector('[data-offline-progress-label]'),count=card.querySelector('[data-offline-progress-count]'),bar=card.querySelector('[data-offline-progress-bar]');
      if(checked){const cached=(localTotal-localMissing)+(remoteTotal-remoteMissing),total=localTotal+remoteTotal,pct=total?Math.max(0,Math.min(100,cached/total*100)):100;if(label)label.textContent=ready?'所有必要資料已存在此瀏覽器':remoteMissing===1&&localMissing===0?`只差 1 張照片：${remoteMissingItems[0]?.label||'未命名照片'}`:'仍有資料尚未下載';if(count)count.textContent=`${cached} / ${total}`;if(bar)bar.style.width=`${pct}%`;}
      const missingDetails=card.querySelector('[data-offline-missing]'),missingSummary=card.querySelector('[data-offline-missing-summary]'),missingList=card.querySelector('[data-offline-missing-list]'),retryButton=card.querySelector('[data-offline-retry-missing]');
      const missingCount=Math.max(0,localMissing)+Math.max(0,remoteMissing);
      if(missingDetails){missingDetails.hidden=!checked||missingCount===0;if(!missingDetails.hidden&&missingCount<=3)missingDetails.open=true;}
      if(missingSummary)missingSummary.textContent=`查看未下載項目${checked&&missingCount?`（${missingCount}）`:''}`;
      if(retryButton)retryButton.hidden=!checked||remoteMissing===0||!navigator.onLine;
      if(missingList){
        const localRows=localMissingItems.map(item=>`<div class="offline-missing-item"><div><b>本地檔案</b><span>${escHtml(item.label||item.asset||'未知檔案')}</span></div></div>`);
        const remoteRows=remoteMissingItems.map(item=>`<div class="offline-missing-item"><div><b>照片未下載</b><span>${escHtml(item.label||item.id||'未命名照片')}</span><small>${escHtml(item.url||'')}</small></div>${item.source?`<a href="${escAttr(item.source)}" target="_blank" rel="noopener noreferrer">來源頁 ↗</a>`:''}</div>`);
        missingList.innerHTML=[...localRows,...remoteRows].join('')||'<p class="small">沒有缺少項目。</p>';
      }
      const last=card.querySelector('[data-offline-last]');if(last)last.textContent=fmtTime(state.lastPreparedAt);
      syncConnection();
    }

    async function check({quiet=false}={}){
      const card=document.querySelector('[data-offline-card]');
      try{const result=await swRequest('CHECK_OFFLINE');state.lastCheck=result;save();paint(result);if(!quiet)toast?.(result.localMissing===0&&result.remoteMissing===0?'離線資料完整':'仍有資料尚未下載');return result;}
      catch(error){console.warn(error);if(card){const label=card.querySelector('[data-offline-progress-label]');if(label)label.textContent='離線服務尚未就緒';}if(!quiet)toast?.('離線服務尚未就緒，請重新整理後再試');return null;}
    }

    function progress(msg){syncShortcut(state.lastCheck,{working:true});const card=document.querySelector('[data-offline-card]');if(!card)return;const done=Number(msg.done||0),total=Number(msg.total||0),pct=total?done/total*100:0;const label=card.querySelector('[data-offline-progress-label]'),count=card.querySelector('[data-offline-progress-count]'),bar=card.querySelector('[data-offline-progress-bar]');if(label)label.textContent=msg.label||'正在下載離線資料…';if(count)count.textContent=`${done} / ${total}`;if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}

    async function prepare(button){
      if(!navigator.onLine){toast?.('目前沒有網路，無法新增離線資料');await check({quiet:true});return;}
      button.disabled=true;const original=button.textContent;button.textContent='下載中…';syncShortcut(state.lastCheck,{working:true});
      try{
        if(navigator.storage?.persist){try{await navigator.storage.persist();}catch{}}
        try{await weatherSystem?.refresh?.(true);}catch(error){console.warn('Weather preflight failed',error);}
        const result=await swRequest('PREPARE_OFFLINE',{},progress);state.lastCheck=result;if(result.localMissing===0&&result.remoteMissing===0)state.lastPreparedAt=Date.now();save();paint(result);
        if(result.localMissing===0&&result.remoteMissing===0)toast?.('離線版已準備完成；可開飛航模式測試');
        else {const first=result.remoteMissingItems?.[0]?.label||result.localMissingItems?.[0]?.label||'';toast?.(`離線資料未完整：還有 ${result.localMissing+result.remoteMissing} 項未下載${first?`（${first}）`:''}`);}
      }catch(error){console.error(error);toast?.(`離線準備失敗：${error.message}`);await check({quiet:true});}
      finally{button.disabled=false;button.textContent=original;syncShortcut();}
    }

    async function retryMissing(button){
      if(!navigator.onLine){toast?.('目前沒有網路，無法重試照片');return;}
      button.disabled=true;const original=button.textContent;button.textContent='重試中…';syncShortcut(state.lastCheck,{working:true});
      try{const result=await swRequest('RETRY_OFFLINE_PHOTOS',{},progress);state.lastCheck=result;if(result.localMissing===0&&result.remoteMissing===0)state.lastPreparedAt=Date.now();save();paint(result);if(result.remoteMissing===0)toast?.('未下載照片已補齊');else toast?.(`仍有 ${result.remoteMissing} 張照片未下載：${result.remoteMissingItems?.[0]?.label||''}`);}
      catch(error){console.error(error);toast?.(`重試照片失敗：${error.message}`);}
      finally{button.disabled=false;button.textContent=original;syncShortcut();}
    }

    async function install(){
      if(isStandalone()){toast?.('目前已是主畫面 App 模式');return;}
      if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice;}catch{}deferredInstallPrompt=null;hydrate();return;}
      toast?.('iPhone / iPad：Safari 分享 → 加入主畫面；Android：瀏覽器選單 → 安裝');
    }


    async function clearPhotos(){
      if(!confirm('要清除已下載的旅程照片快取嗎？之後可再按「下載離線資料」重新下載。'))return;
      try{const result=await swRequest('CLEAR_OFFLINE_PHOTOS');state.lastCheck=result;state.lastPreparedAt=0;save();paint(result);toast?.('已清除照片快取');}
      catch(error){console.error(error);toast?.(`清除照片快取失敗：${error.message}`);}
    }

    function clearWeather(){
      if(!confirm('要清除最後成功取得的天氣快取嗎？API Key 與天氣來源設定會保留。'))return;
      try{if(weatherSystem?.clearCache)weatherSystem.clearCache({notify:false});else localStorage.removeItem('yunnan-weather-cache-v1');paint();toast?.('已清除天氣快取');}
      catch(error){console.error(error);toast?.('清除天氣快取失敗');}
    }

    async function clearAllOffline(){
      if(!confirm('要清除全部離線下載嗎？會清除離線照片、額外快取與天氣快取；收藏、自定義地標、偏好及 API Key 都會保留。'))return;
      try{
        const result=await swRequest('CLEAR_OFFLINE_DOWNLOADS');
        if(weatherSystem?.clearCache)weatherSystem.clearCache({notify:false});else localStorage.removeItem('yunnan-weather-cache-v1');
        state={lastPreparedAt:0,lastCheck:result};save();paint(result);toast?.('已清除全部離線下載；核心網頁仍可使用');
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
      showView?.('tips',false);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const card=document.querySelector('[data-offline-card]');if(!card)return;
        card.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
        card.classList.remove('is-jump-target');void card.offsetWidth;card.classList.add('is-jump-target');
        setTimeout(()=>card.classList.remove('is-jump-target'),1300);
      }));
    }

    function handleAction(button){
      if(button?.hasAttribute('data-offline-jump')){jumpToOffline();return true;}
      if(button?.hasAttribute('data-offline-prepare')){prepare(button);return true;}
      if(button?.hasAttribute('data-offline-retry-missing')){retryMissing(button);return true;}
      if(button?.hasAttribute('data-offline-check')){check();return true;}
      if(button?.hasAttribute('data-offline-install')){install();return true;}
      if(button?.hasAttribute('data-offline-clear-photos')){clearPhotos();return true;}
      if(button?.hasAttribute('data-offline-clear-weather')){clearWeather();return true;}
      if(button?.hasAttribute('data-offline-clear-all')){clearAllOffline();return true;}
      if(button?.hasAttribute('data-offline-export')){exportUserData();return true;}
      if(button?.hasAttribute('data-offline-import-pick')){button.closest('[data-offline-card]')?.querySelector('[data-offline-import]')?.click();return true;}
      return false;
    }
    function handleChange(target){if(!target?.matches?.('[data-offline-import]'))return false;importUserData(target);return true;}
    function hydrate(){syncConnection();paint();setTimeout(()=>check({quiet:true}),350);const installButton=document.querySelector('[data-offline-install]');if(installButton)installButton.hidden=isStandalone();const note=document.querySelector('[data-offline-install-note]');if(note&&isStandalone())note.textContent='已以主畫面 App 模式開啟。';}
    function start(){syncConnection();window.addEventListener('online',()=>{syncConnection();toast?.('已恢復連線');window.dispatchEvent(new CustomEvent('yunnan:connection-change',{detail:{online:true}}));});window.addEventListener('offline',()=>{syncConnection();toast?.('目前離線，改用已下載資料');window.dispatchEvent(new CustomEvent('yunnan:connection-change',{detail:{online:false}}));});window.addEventListener('yunnan:pwa-install-available',hydrate);window.addEventListener('yunnan:pwa-installed',hydrate);}

    return {settingsHtml,hydrate,start,handleAction,handleChange,check,prepare,isStandalone};
  }
  window.YunnanOfflineSystem={create};
})();
