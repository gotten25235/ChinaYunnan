/* Anonymous analytics owner: optional Umami loader + a small event queue. No UI and no identity collection. */
(() => {
  'use strict';
  const CONFIG_URL='data/analytics-config.json';
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
    let config=null,started=false,ready=false,loading=null;
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
    function flush(){
      if(!trackerReady())return;
      ready=true;
      while(queue.length){const [name,data]=queue.shift();try{window.umami.track(name,data);}catch{}}
    }
    function injectTracker(){
      if(loading||!config?.enabled||!validWebsiteId(config.websiteId)||isLocal())return loading;
      loading=new Promise(resolve=>{
        const script=document.createElement('script');
        script.src=cleanString(config.scriptUrl||'https://cloud.umami.is/script.js');
        script.defer=true;
        script.async=true;
        script.setAttribute('data-website-id',cleanString(config.websiteId));
        if(config.privacy?.excludeSearch!==false)script.setAttribute('data-exclude-search','true');
        if(config.privacy?.excludeHash!==false)script.setAttribute('data-exclude-hash','true');
        if(config.privacy?.respectDoNotTrack!==false)script.setAttribute('data-do-not-track','true');
        script.addEventListener('load',()=>{let tries=0;const timer=setInterval(()=>{tries++;if(trackerReady()||tries>=20){clearInterval(timer);flush();resolve(trackerReady());}},100);},{once:true});
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
    function status(){return {configured:Boolean(config?.enabled&&validWebsiteId(config?.websiteId)),ready};}
    return {start,track,trackItem,trackStory,trackNavigation,trackControl,status};
  }

  window.YunnanAnalyticsSystem=Object.freeze({create});
})();
