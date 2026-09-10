/* Anonymous analytics owner: optional Umami loader + persistent anonymous browser ID + small event queue. */
(() => {
  'use strict';
  const CONFIG_URL='data/analytics-config.json';
  const DEFAULT_VISITOR_STORAGE_KEY='yunnan-anonymous-visitor-v1';
  const isLocal=()=>location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
  const cleanString=value=>String(value??'').trim().slice(0,500);
  const cleanData=input=>{
    const out={};
    if(!input||typeof input!=='object')return out;
    for(const [key,value] of Object.entries(input)){
      if(value===undefined||value===null||value==='')continue;
      if(typeof value==='number'||typeof value==='boolean')out[key]=value;
      else out[key]=cleanString(value);
      if(Object.keys(out).length>=24)break;
    }
    return out;
  };

  function create({items={}}={}){
    let config=null,started=false,ready=false,loading=null,visitorIdentity=null;
    const queue=[];

    async function readConfig(){
      try{
        const response=await fetch(CONFIG_URL,{cache:'no-store'});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const value=await response.json();
        return value&&typeof value==='object'?value:null;
      }catch{return null;}
    }
    function validWebsiteId(value){return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||''));}
    function trackerReady(){return typeof window.umami?.track==='function';}
    function identifyReady(){return typeof window.umami?.identify==='function';}
    function visitorIdEnabled(){return config?.anonymousVisitorId?.enabled!==false;}
    function visitorStorageKey(){return cleanString(config?.anonymousVisitorId?.storageKey||DEFAULT_VISITOR_STORAGE_KEY)||DEFAULT_VISITOR_STORAGE_KEY;}
    function validVisitorId(value){return /^V-[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/i.test(String(value||''));}
    function newVisitorId(){
      const bytes=new Uint8Array(10);
      if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);
      else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
      return `V-${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}`;
    }
    function loadOrCreateVisitorId(){
      if(!visitorIdEnabled())return null;
      const key=visitorStorageKey();
      for(const storage of [window.localStorage,window.sessionStorage]){
        try{
          const existing=storage.getItem(key);
          if(validVisitorId(existing))return {id:existing,isNew:false,persistence:storage===window.localStorage?'local':'session'};
          const id=newVisitorId();
          storage.setItem(key,id);
          return {id,isNew:true,persistence:storage===window.localStorage?'local':'session'};
        }catch{}
      }
      return {id:newVisitorId(),isNew:true,persistence:'memory'};
    }
    function identifyVisitor(){
      if(!visitorIdentity||!identifyReady())return false;
      try{
        window.umami.identify(visitorIdentity.id);
        return true;
      }catch{return false;}
    }
    function sendInitialPageview(){
      if(!trackerReady())return false;
      try{window.umami.track();return true;}catch{return false;}
    }
    function sendVisitorCreated(){
      if(!visitorIdentity?.isNew||!trackerReady())return false;
      try{window.umami.track('anonymous_visitor_created',{persistence:visitorIdentity.persistence});return true;}catch{return false;}
    }
    function flush(){
      if(!trackerReady())return;
      ready=true;
      while(queue.length){const [name,data]=queue.shift();try{window.umami.track(name,data);}catch{}}
    }
    function injectTracker(){
      if(loading||!config?.enabled||!validWebsiteId(config.websiteId)||isLocal())return loading;
      visitorIdentity=loadOrCreateVisitorId();
      loading=new Promise(resolve=>{
        const script=document.createElement('script');
        script.src=cleanString(config.scriptUrl||'https://cloud.umami.is/script.js');
        script.defer=true;
        script.async=true;
        script.setAttribute('data-website-id',cleanString(config.websiteId));
        if(visitorIdentity)script.setAttribute('data-auto-pageview','false');
        if(config.privacy?.excludeSearch!==false)script.setAttribute('data-exclude-search','true');
        if(config.privacy?.excludeHash!==false)script.setAttribute('data-exclude-hash','true');
        if(config.privacy?.respectDoNotTrack!==false)script.setAttribute('data-do-not-track','true');
        script.addEventListener('load',()=>{
          let tries=0;
          const timer=setInterval(()=>{
            tries++;
            if((trackerReady()&&(!visitorIdentity||identifyReady()))||tries>=30){
              clearInterval(timer);
              if(trackerReady()){
                if(visitorIdentity){identifyVisitor();sendInitialPageview();sendVisitorCreated();}
                flush();
              }
              resolve(trackerReady());
            }
          },100);
        },{once:true});
        script.addEventListener('error',()=>resolve(false),{once:true});
        document.head.append(script);
      });
      return loading;
    }
    async function start(){
      if(started)return loading;
      started=true;
      config=await readConfig();
      if(!config?.enabled||!validWebsiteId(config.websiteId)||isLocal())return false;
      const ok=await injectTracker();
      if(ok)flush();
      return Boolean(ok);
    }
    function track(name,data={}){
      if(!name||isLocal())return false;
      const eventName=cleanString(name).slice(0,50);
      const payload=cleanData(data);
      if(ready||trackerReady()){
        try{window.umami.track(eventName,payload);ready=true;return true;}catch{return false;}
      }
      if(queue.length<80)queue.push([eventName,payload]);
      if(!started)start();
      return true;
    }
    function itemPayload(id,extra={}){
      const item=items[id]||{};
      return cleanData({id,label:item.name||id,type:item.type||'',...extra});
    }
    function trackItem(id,extra={}){if(id)track('item_open',itemPayload(id,extra));}
    function trackStory(id){if(id)track('story_open',{id});}
    function trackNavigation(id,provider){if(id)track('navigation_open',itemPayload(id,{provider}));}
    function trackControl(button){
      if(!button)return;
      if(button.dataset.save)track('favorite_click',itemPayload(button.dataset.save,{saved:button.getAttribute('aria-pressed')!=='true'}));
      else if(button.hasAttribute('data-geolocate'))track('map_geolocate');
      else if(button.hasAttribute('data-nearby'))track('nearby_open');
      else if(button.hasAttribute('data-weather-refresh'))track('weather_refresh');
      else if(button.hasAttribute('data-offline-prepare'))track('offline_prepare');
      else if(button.hasAttribute('data-timetable-download'))track('timetable_download');
    }
    function status(){return {configured:Boolean(config?.enabled&&validWebsiteId(config?.websiteId)),ready,visitorId:visitorIdentity?.id||null,visitorPersistence:visitorIdentity?.persistence||null};}
    return {start,track,trackItem,trackStory,trackNavigation,trackControl,status};
  }

  window.YunnanAnalyticsSystem=Object.freeze({create});
})();
