/* Weather domain: AMap -> QWeather Grid -> Open-Meteo, one-hour cache, offline fallback and travel alerts. */
(() => {
  'use strict';

  function create(config){
    const {tripData,items,esc,toast,networkProfile}=config;
    const CACHE_KEY='yunnan-weather-cache-v1';
    const CONFIG_KEY='yunnan-weather-provider-config-v1';
    const CACHE_TTL=60*60*1000;
    const AMAP_SOURCE='https://lbs.amap.com/api/webservice/guide/api/weatherinfo';
    const QWEATHER_SOURCE='https://dev.qweather.com/docs/deprecated/';
    const QWEATHER_CURRENT_SOURCE='https://dev.qweather.com/docs/api/weather/weather-daily-forecast/';
    const OPEN_METEO_SOURCE='https://open-meteo.com/en/docs';
    const mainAnchorByDay={1:'hotel-kmg-airport',2:'dali-old',3:'lijiang-old',4:'lijiang-old',5:'dukezong',6:'lijiang-old',7:'plaza',8:'plaza'};
    const amapAdcodes={昆明:'530100',大理:'532901',麗江:'530700',香格里拉:'533401'};
    const qweatherPublicByAdcode={
      '530100':'kunming-101290101',
      '532901':'dali-prefecture-101290201',
      '530700':'lijiang-101291401',
      '530721':'yulong-101291406',
      '533401':'shangri-la-city-101291301'
    };
    const specialByDay={
      4:[{key:'yulong-spruce',itemId:'spruce',label:'玉龍雪山・雲杉坪',highAltitude:true,amapAdcode:'530721'}],
      6:[{key:'pudacuo',itemId:'pudacuo',label:'普達措國家公園',highAltitude:true,amapAdcode:'533401'}]
    };
    const highAltitudeCities=new Set(['香格里拉']);
    let cache={records:{}};
    let providerConfig={amapKey:'',qweatherHost:'',qweatherKey:''};
    let storageAvailable=true,refreshPromise=null,timer=null;

    const hasCoords=p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng));
    const dateLabel=date=>String(date||'').slice(5).replace('-','/');
    const fmt=v=>Number.isFinite(Number(v))?Math.round(Number(v)):null;
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const missing=v=>v===null||v===undefined||v==='';
    const formatUpdate=ms=>{try{return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tripData.timezone}).format(new Date(ms));}catch{return '';}};
    const combineText=(day,night)=>{day=String(day||'').trim();night=String(night||'').trim();if(day&&night&&day!==night)return `${day}轉${night}`;return day||night;};
    const maxFinite=(...values)=>{const nums=values.map(Number).filter(Number.isFinite);return nums.length?Math.max(...nums):null;};
    const minFinite=(...values)=>{const nums=values.map(Number).filter(Number.isFinite);return nums.length?Math.min(...nums):null;};
    const cleanHost=value=>String(value||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'');

    try{
      const raw=localStorage.getItem(CACHE_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&parsed.records)cache=parsed;}
      const configRaw=localStorage.getItem(CONFIG_KEY);if(configRaw){const parsed=JSON.parse(configRaw);if(parsed&&typeof parsed==='object')providerConfig={amapKey:String(parsed.amapKey||''),qweatherHost:cleanHost(parsed.qweatherHost),qweatherKey:String(parsed.qweatherKey||'')};}
    }catch{storageAvailable=false;}
    function saveCache(){if(!storageAvailable)return;try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch{storageAvailable=false;}}
    function saveProviderConfig(){if(!storageAvailable)return;try{localStorage.setItem(CONFIG_KEY,JSON.stringify(providerConfig));}catch{storageAvailable=false;}}
    const configSignature=()=>`amap:${providerConfig.amapKey?'1':'0'}|qw:${providerConfig.qweatherHost&&providerConfig.qweatherKey?'1':'0'}|host:${providerConfig.qweatherHost||'-'}`;

    function mainPointForDay(day){
      const itemId=mainAnchorByDay[day.day],item=items[itemId];
      if(!hasCoords(item))return null;
      return {key:`anchor-${itemId}`,itemId,label:day.city,lat:Number(item.lat),lng:Number(item.lng),highAltitude:highAltitudeCities.has(day.city),amapAdcode:amapAdcodes[day.city]||''};
    }
    function specialsForDay(day){return (specialByDay[day.day]||[]).map(def=>{const p=items[def.itemId];return hasCoords(p)?{...def,lat:Number(p.lat),lng:Number(p.lng)}:null;}).filter(Boolean);}
    function pointsForDay(day){const main=mainPointForDay(day);return [...(main?[main]:[]),...specialsForDay(day)];}
    function allPoints(){const out=new Map();tripData.days.forEach(day=>pointsForDay(day).forEach(p=>out.set(p.key,p)));return [...out.values()];}

    function normalizeAmap(json){
      const forecast=Array.isArray(json?.forecasts)?json.forecasts[0]:null,casts=forecast?.casts;if(String(json?.status)!=='1'||!Array.isArray(casts))return {};
      const out={};casts.forEach(entry=>{const date=String(entry?.date||'').slice(0,10);if(!date)return;const dayTemp=entry?.daytemp??entry?.dayTemp,nightTemp=entry?.nighttemp??entry?.nightTemp;out[date]={date,weatherText:combineText(entry?.dayweather??entry?.dayWeather,entry?.nightweather??entry?.nightWeather),max:maxFinite(dayTemp,nightTemp),min:minFinite(dayTemp,nightTemp),windText:[entry?.daywind??entry?.dayWind,entry?.daypower??entry?.dayPower].filter(Boolean).join(' '),source:'amap'};});return out;
    }
    async function fetchAmap(point){
      if(!providerConfig.amapKey||!point.amapAdcode)throw new Error('AMap not configured for this point');
      const url=new URL('https://restapi.amap.com/v3/weather/weatherInfo');url.searchParams.set('city',point.amapAdcode);url.searchParams.set('extensions','all');url.searchParams.set('output','JSON');url.searchParams.set('key',providerConfig.amapKey);
      const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`AMap HTTP ${response.status}`);const json=await response.json(),daily=normalizeAmap(json);if(!Object.keys(daily).length)throw new Error(json?.info||'AMap weather unavailable');return {provider:'amap',daily};
    }

    function qweatherV7Coords(point){const converted=networkProfile?.wgs84ToGcj02?.(point.lat,point.lng)||[point.lat,point.lng];return {lat:Number(converted[0]),lng:Number(converted[1])};}
    function normalizeQWeatherV7(json){
      const daily=json?.daily;if(String(json?.code)!=='200'||!Array.isArray(daily))return {};
      const out={};daily.forEach(entry=>{const date=String(entry?.fxDate||'').slice(0,10);if(!date)return;out[date]={date,weatherText:combineText(entry?.textDay,entry?.textNight),max:fmt(entry?.tempMax),min:fmt(entry?.tempMin),wind:maxFinite(entry?.windSpeedDay,entry?.windSpeedNight),windText:[entry?.windDirDay,entry?.windScaleDay?`${entry.windScaleDay}級`:null].filter(Boolean).join(' '),uv:fmt(entry?.uvIndex),source:'qweather-grid'};});return out;
    }
    function qweatherProbability(part){const p=Number(part?.precipitation?.probability);return Number.isFinite(p)?p*100:null;}
    function qweatherWindKmh(part){const speed=Number(part?.wind?.speed?.value),unit=String(part?.wind?.speed?.unit||'').toLowerCase();if(!Number.isFinite(speed))return null;return unit.includes('m/s')?speed*3.6:speed;}
    function normalizeQWeatherV1(json){
      const days=json?.days;if(!Array.isArray(days))return {};
      const out={};days.forEach(entry=>{const date=String(entry?.forecastStartTime||'').slice(0,10);if(!date)return;const daytime=entry?.daytime||{},nighttime=entry?.nighttime||{};out[date]={date,weatherText:combineText(daytime?.condition?.text,nighttime?.condition?.text),max:fmt(entry?.temperatureMax?.value),min:fmt(entry?.temperatureMin?.value),rain:maxFinite(qweatherProbability(daytime),qweatherProbability(nighttime)),wind:maxFinite(qweatherWindKmh(daytime),qweatherWindKmh(nighttime)),windText:String(daytime?.wind?.direction?.compass||'').toUpperCase(),uv:fmt(entry?.uvIndexMax),source:'qweather-grid'};});return out;
    }
    async function fetchQWeather(point){
      const host=cleanHost(providerConfig.qweatherHost),key=providerConfig.qweatherKey;if(!host||!key)throw new Error('QWeather not configured');
      const base=`https://${host}`,gcj=qweatherV7Coords(point);
      const legacy=new URL('/v7/grid-weather/7d',base);legacy.searchParams.set('location',`${gcj.lng.toFixed(2)},${gcj.lat.toFixed(2)}`);legacy.searchParams.set('lang','zh');legacy.searchParams.set('unit','m');legacy.searchParams.set('key',key);
      try{
        const response=await fetch(legacy.toString(),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`QWeather Grid HTTP ${response.status}`);const json=await response.json(),daily=normalizeQWeatherV7(json);if(Object.keys(daily).length)return {provider:'qweather-grid',daily};throw new Error(`QWeather Grid ${json?.code||'empty'}`);
      }catch(legacyError){
        // QWeather WebAPI v7 Grid Weather is deprecated and scheduled to stop in 2027; keep the same exact-coordinate provider as an automatic compatibility fallback.
        const current=new URL(`/weather/v1/daily/${Number(point.lat).toFixed(2)}/${Number(point.lng).toFixed(2)}`,base);current.searchParams.set('days','10');current.searchParams.set('localTime','true');current.searchParams.set('lang','zh');current.searchParams.set('key',key);
        const response=await fetch(current.toString(),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`QWeather current HTTP ${response.status}; legacy: ${legacyError.message}`);const json=await response.json(),daily=normalizeQWeatherV1(json);if(!Object.keys(daily).length)throw new Error(`QWeather exact-coordinate payload unavailable; legacy: ${legacyError.message}`);return {provider:'qweather-grid',daily};
      }
    }

    function openMeteoUrl(point){
      const url=new URL('https://api.open-meteo.com/v1/forecast');url.searchParams.set('latitude',String(point.lat));url.searchParams.set('longitude',String(point.lng));url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max');url.searchParams.set('timezone',tripData.timezone||'Asia/Shanghai');url.searchParams.set('forecast_days','16');return url.toString();
    }
    function normalizeOpenMeteo(json){const d=json?.daily;if(!d?.time)return {};const out={};d.time.forEach((date,i)=>{out[date]={date,code:d.weather_code?.[i],max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],apparentMax:d.apparent_temperature_max?.[i],apparentMin:d.apparent_temperature_min?.[i],rain:d.precipitation_probability_max?.[i],wind:d.wind_speed_10m_max?.[i],uv:d.uv_index_max?.[i],source:'open-meteo'};});return out;}
    async function fetchOpenMeteo(point){const response=await fetch(openMeteoUrl(point),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`);const json=await response.json();if(json?.error)throw new Error(json.reason||'Open-Meteo API error');return {provider:'open-meteo',daily:normalizeOpenMeteo(json)};}

    function mergePreferred(primary={},fallback={}){
      const out={};new Set([...Object.keys(primary),...Object.keys(fallback)]).forEach(date=>{const a=primary[date]||{},b=fallback[date]||{},merged={...a,date};for(const [key,value] of Object.entries(b)){if(key==='date'||key==='source')continue;if(missing(merged[key])&& !missing(value))merged[key]=value;}const sources=[...(Array.isArray(a.sources)?a.sources:(a.source?[a.source]:[])),...(Array.isArray(b.sources)?b.sources:(b.source?[b.source]:[]))];merged.sources=[...new Set(sources)];out[date]=merged;});return out;
    }
    async function fetchPoint(point){
      const fetchedAt=Date.now(),tasks=[providerConfig.amapKey&&point.amapAdcode?fetchAmap(point):Promise.reject(new Error('AMap skipped')),providerConfig.qweatherHost&&providerConfig.qweatherKey?fetchQWeather(point):Promise.reject(new Error('QWeather skipped')),fetchOpenMeteo(point)],results=await Promise.allSettled(tasks),fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if(!fulfilled.length)throw new Error('All weather providers failed');let daily={};const used=[];['amap','qweather-grid','open-meteo'].forEach(provider=>{const result=fulfilled.find(x=>x.provider===provider);if(result){daily=mergePreferred(daily,result.daily);used.push(provider);}});return {fetchedAt,lat:point.lat,lng:point.lng,label:point.label,provider:used.join('+'),providers:used,configSig:configSignature(),daily};
    }
    function isFresh(point){const r=cache.records?.[point.key],fetched=Number(r?.fetchedAt||0);return fetched>0&&r?.configSig===configSignature()&&Date.now()-fetched<CACHE_TTL;}

    async function refresh(force=false){
      if(refreshPromise)return refreshPromise;if(!navigator.onLine){hydrate();if(force)toast?.('目前離線，先顯示最後一次天氣快取');return false;}const targets=allPoints().filter(p=>force||!isFresh(p));if(!targets.length){hydrate();if(force)toast?.('天氣已是最新資料');return true;}
      refreshPromise=(async()=>{let success=0;for(const point of targets){try{cache.records[point.key]=await fetchPoint(point);success++;}catch(error){console.warn('Weather update failed',point.key,error);}await sleep(180);}if(success)saveCache();hydrate();if(force)toast?.(success?`天氣已更新（${success} 個區域）`:'天氣更新失敗，保留最後一次快取');return success>0;})().finally(()=>{refreshPromise=null;});return refreshPromise;
    }

    function codeInfo(code){const c=Number(code);if(c===0)return {icon:'☀️',label:'晴朗'};if(c===1)return {icon:'🌤️',label:'大致晴朗'};if(c===2)return {icon:'⛅',label:'局部多雲'};if(c===3)return {icon:'☁️',label:'陰天'};if(c===45||c===48)return {icon:'🌫️',label:'霧'};if([51,53,55,56,57].includes(c))return {icon:'🌦️',label:'毛毛雨'};if([61,63,65,66,67].includes(c))return {icon:'🌧️',label:'雨'};if([71,73,75,77].includes(c))return {icon:'🌨️',label:'雪'};if([80,81,82].includes(c))return {icon:'🌦️',label:'陣雨'};if([85,86].includes(c))return {icon:'🌨️',label:'陣雪'};if([95,96,99].includes(c))return {icon:'⛈️',label:'雷雨'};return {icon:'🌤️',label:'天氣'};}
    function weatherInfo(f){const text=String(f?.weatherText||'').trim();if(!text)return codeInfo(f?.code);const t=text.replace(/陰/g,'阴').replace(/雲/g,'云').replace(/霧/g,'雾');if(t.includes('雷'))return {icon:'⛈️',label:text};if(t.includes('雪'))return {icon:'🌨️',label:text};if(t.includes('雨'))return {icon:'🌧️',label:text};if(t.includes('雾'))return {icon:'🌫️',label:text};if(t.includes('阴'))return {icon:'☁️',label:text};if(t.includes('多云'))return {icon:'⛅',label:text};if(t.includes('晴'))return {icon:'☀️',label:text};return {icon:'🌤️',label:text};}
    function getForecast(point,date){return cache.records?.[point?.key]?.daily?.[date]||null;}
    function pointRecord(point){return cache.records?.[point?.key]||null;}
    function pointUpdate(point){return Number(pointRecord(point)?.fetchedAt||0);}
    function alertMessages(forecast,{highAltitude=false}={}){if(!forecast)return [];const out=[],rain=fmt(forecast.rain),cold=fmt(forecast.apparentMin??forecast.min),wind=fmt(forecast.wind),uv=fmt(forecast.uv);if(highAltitude)out.push('🏔 高海拔，天氣變化快；建議保暖並量力活動');if(rain!==null&&rain>=60)out.push('☂ 降雨機率高，建議準備折傘或雨衣');if(cold!==null&&cold<=8)out.push('🧥 體感偏冷，建議增加保暖與防風層');if(wind!==null&&wind>=30)out.push('🌬 風勢較強，帽子與隨身物請固定好');if(uv!==null&&uv>=6)out.push('☀ UV 偏高，建議防曬與遮陽');return [...new Set(out)];}
    function compactForecast(point,date){const f=getForecast(point,date);if(!f)return null;const info=weatherInfo(f),max=fmt(f.max),min=fmt(f.min),rain=fmt(f.rain);if(max===null||min===null)return null;return {f,info,max,min,rain};}

    function daySummaryPlaceholder(day){return `<span class="weather-inline" data-weather-day-summary="${day.day}" aria-live="polite">⌁ 天氣載入中</span>`;}
    function dayPanelPlaceholder(day){return `<section class="weather-panel journey-subcard" data-weather-day-panel="${day.day}" aria-live="polite"><div class="weather-loading">⌁ 正在取得 ${esc(day.city)} 天氣…</div></section>`;}
    function mapPlaceholder(place,dayValue='all'){return `<div class="map-weather-box" data-weather-map-place="${esc(place.id)}" data-weather-map-day="${esc(dayValue)}" aria-live="polite">⌁ 旅程日天氣載入中</div>`;}
    function noForecastText(date){const hasAny=Object.values(cache.records||{}).some(r=>r?.daily&&Object.keys(r.daily).length);return hasAny?`目前預報範圍尚未涵蓋 ${dateLabel(date)}`:'天氣資料尚未取得；連線後可更新';}
    function summaryHtml(day){const point=mainPointForDay(day),c=compactForecast(point,day.date);if(!point||!c)return `<span class="weather-inline-empty">⌁ ${esc(noForecastText(day.date))}</span>`;return `<span class="weather-inline-icon" aria-hidden="true">${c.info.icon}</span><strong>${c.max}° / ${c.min}°</strong><span>${esc(c.info.label)}</span>${c.rain!==null?`<span>降雨 ${c.rain}%</span>`:''}`;}
    function weatherRow(point,date,{primary=false}={}){const c=compactForecast(point,date);if(!c)return `<div class="weather-row ${primary?'primary':''}"><div><strong>${esc(point.label)}</strong><small>${esc(noForecastText(date))}</small></div></div>`;const apparentLow=fmt(c.f.apparentMin),wind=fmt(c.f.wind),uv=fmt(c.f.uv),windText=String(c.f.windText||'').trim();return `<div class="weather-row ${primary?'primary':''}"><div class="weather-row-main"><span class="weather-row-icon" aria-hidden="true">${c.info.icon}</span><div><strong>${esc(point.label)}</strong><small>${esc(c.info.label)} · ${esc(dateLabel(date))}</small></div></div><div class="weather-temps"><b>${c.max}°</b><span>/ ${c.min}°</span></div><div class="weather-metrics">${c.rain!==null?`<span>☂ ${c.rain}%</span>`:''}${apparentLow!==null?`<span>體感低 ${apparentLow}°</span>`:''}${wind!==null?`<span>風 ${wind} km/h</span>`:(windText?`<span>${esc(windText)}</span>`:'')}${uv!==null?`<span>UV ${uv}</span>`:''}</div></div>`;}
    const providerLabel=id=>id==='amap'?'高德天氣':id==='qweather-grid'?'QWeather Grid':id==='open-meteo'?'Open-Meteo':id;
    function amapPublicWeatherUrl(point){
      const converted=networkProfile?.wgs84ToGcj02?.(point.lat,point.lng)||[point.lat,point.lng],url=new URL('https://www.amap.com/regeo');
      url.searchParams.set('lat',Number(converted[0]).toFixed(6));url.searchParams.set('lng',Number(converted[1]).toFixed(6));url.searchParams.set('name',point.label||'雲南');return url.toString();
    }
    function qweatherPublicWeatherUrl(point){const slug=qweatherPublicByAdcode[String(point.amapAdcode||'')];return slug?`https://www.qweather.com/weather/${slug}.html`:'https://www.qweather.com/';}
    function openMeteoPublicWeatherUrl(point){const url=new URL('https://open-meteo.com/en/docs');url.searchParams.set('latitude',Number(point.lat).toFixed(4));url.searchParams.set('longitude',Number(point.lng).toFixed(4));url.searchParams.set('timezone',tripData.timezone||'Asia/Shanghai');url.searchParams.set('forecast_days','16');return url.toString();}
    function publicSourceLinks(point){const label=esc(point.label||'此地點');return `<span class="weather-source-location"><b>${label}</b><span class="weather-source-links"><a href="${esc(amapPublicWeatherUrl(point))}" target="_blank" rel="noopener noreferrer" title="在高德地圖查看 ${label} 天氣">高德 ↗</a><a href="${esc(qweatherPublicWeatherUrl(point))}" target="_blank" rel="noopener noreferrer" title="在 QWeather 查看 ${label} 天氣">QWeather ↗</a><a href="${esc(openMeteoPublicWeatherUrl(point))}" target="_blank" rel="noopener noreferrer" title="在 Open-Meteo 查看 ${label} 座標預報">Open-Meteo ↗</a></span></span>`;}
    function sourceFooter(points){const providers=[...new Set(points.flatMap(p=>pointRecord(p)?.providers||[]))];return `<span>${networkProfile?.name?.(networkProfile.get())||'國際版'} · 優先順序：高德 → QWeather Grid → Open-Meteo${providers.length?` · 本次 ${esc(providers.map(providerLabel).join(' + '))}`:''}</span><span class="weather-source-destinations">${points.map(publicSourceLinks).join('')}</span>`;}
    function panelHtml(day){const points=pointsForDay(day),main=points[0]||null;if(!main)return '<div class="weather-loading">此日沒有可用的天氣定位點。</div>';const rows=points.map((p,i)=>weatherRow(p,day.date,{primary:i===0})).join(''),alerts=points.flatMap(p=>alertMessages(getForecast(p,day.date),{highAltitude:p.highAltitude})),updateTimes=points.map(pointUpdate).filter(Boolean),last=updateTimes.length?Math.max(...updateTimes):0,alertHtml=alerts.length?`<div class="weather-alerts">${[...new Set(alerts)].map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';return `<header class="weather-panel-head"><div><span class="eyebrow">WEATHER · 天氣</span><h3>今日天氣</h3></div><button type="button" class="weather-refresh" data-weather-refresh>↻ 更新</button></header><div class="weather-grid">${rows}</div>${alertHtml}<footer class="weather-source"><span>${last?`最後更新 ${esc(formatUpdate(last))}`:'尚未取得預報'} · 每 1 小時最多更新一次</span>${sourceFooter(points)}</footer>`;}

    function associatedDay(place){const explicit=Array.isArray(place?.days)?place.days[0]:null;if(explicit)return tripData.days.find(d=>d.day===Number(explicit))||null;return tripData.days.find(d=>d.hotel===place?.id||d.itinerary.includes(place?.id)||d.nearby.includes(place?.id)||d.nightRecommendations.includes(place?.id))||tripData.days.find(d=>d.city===place?.city)||null;}
    function distanceSq(a,b){const x=(Number(a.lat)-Number(b.lat))*111,y=(Number(a.lng)-Number(b.lng))*111*Math.cos(Number(a.lat)*Math.PI/180);return x*x+y*y;}
    function pointForPlace(place,day){const candidates=pointsForDay(day);if(!candidates.length)return null;if(!hasCoords(place))return candidates[0];return candidates.slice().sort((a,b)=>distanceSq(place,a)-distanceSq(place,b))[0];}
    function mapHtml(place,dayValue){const selected=Number(dayValue),day=Number.isFinite(selected)&&selected>0?tripData.days.find(d=>d.day===selected):associatedDay(place);if(!day)return '<span>⌁ 此地點沒有對應旅程日天氣</span>';const point=pointForPlace(place,day),c=compactForecast(point,day.date);if(!point||!c)return `<span>⌁ ${esc(dateLabel(day.date))} · ${esc(noForecastText(day.date))}</span>`;return `<span class="map-weather-main">${c.info.icon} <strong>${esc(dateLabel(day.date))} · ${c.max}° / ${c.min}°</strong> · ${esc(c.info.label)}${c.rain!==null?` · 降雨 ${c.rain}%`:''}</span><small>${esc(point.label)}預報</small>`;}

    function settingsHtml(){
      const amapReady=Boolean(providerConfig.amapKey),qReady=Boolean(providerConfig.qweatherHost&&providerConfig.qweatherKey);
      return `<details class="weather-provider-settings utility-card utility-card--settings" data-weather-settings><summary><span><span class="eyebrow">WEATHER PROVIDERS</span><strong>天氣 API 設定</strong></span><small>高德 ${amapReady?'已設定':'未設定'} · QWeather ${qReady?'已設定':'未設定'} · Open-Meteo 免 Key</small></summary><div class="weather-provider-settings-body"><p class="small">固定優先順序：<b>1 高德天氣 → 2 QWeather Grid → 3 Open-Meteo</b>。未設定 Key、超出預報範圍或單一服務失敗時會自動往下一層補資料。設定只儲存在這台瀏覽器，不寫入 ZIP。</p><div class="weather-provider-form"><label><span>高德 Web Service Key</span><input type="password" value="${esc(providerConfig.amapKey)}" data-weather-config-field="amapKey" autocomplete="off" spellcheck="false" placeholder="未設定"></label><label><span>QWeather API Host</span><input type="text" value="${esc(providerConfig.qweatherHost)}" data-weather-config-field="qweatherHost" autocomplete="off" spellcheck="false" placeholder="xxxx.qweatherapi.com"></label><label><span>QWeather API Key</span><input type="password" value="${esc(providerConfig.qweatherKey)}" data-weather-config-field="qweatherKey" autocomplete="off" spellcheck="false" placeholder="未設定"></label></div><p class="small weather-provider-note">QWeather 的 WebAPI v7 Grid Weather 已列為棄用但目前仍可用；本版先呼叫 Grid Weather，若該端點停用會在同一 QWeather provider 內自動改用官方現行 1 km 經緯度每日預報。</p><div class="weather-provider-actions"><button type="button" class="primary" data-weather-settings-save>儲存並更新天氣</button><button type="button" class="action" data-weather-settings-clear>清除 API 設定</button><span data-weather-settings-status>${amapReady||qReady?'已啟用多來源模式':'目前由 Open-Meteo 提供資料'}</span></div><div class="weather-source-links"><a href="${AMAP_SOURCE}" target="_blank" rel="noopener noreferrer">高德天氣 API ↗</a><a href="${QWEATHER_SOURCE}" target="_blank" rel="noopener noreferrer">QWeather Grid 狀態 ↗</a><a href="${QWEATHER_CURRENT_SOURCE}" target="_blank" rel="noopener noreferrer">QWeather 1 km API ↗</a></div></div></details>`;
    }
    function syncSettingsStatus(root=document){const card=root?.closest?.('[data-weather-settings]')||root?.querySelector?.('[data-weather-settings]')||null;if(!card)return;const status=card.querySelector('[data-weather-settings-status]'),summary=card.querySelector('summary small'),amapReady=Boolean(providerConfig.amapKey),qReady=Boolean(providerConfig.qweatherHost&&providerConfig.qweatherKey);if(status)status.textContent=amapReady||qReady?'已啟用多來源模式':'目前由 Open-Meteo 提供資料';if(summary)summary.textContent=`高德 ${amapReady?'已設定':'未設定'} · QWeather ${qReady?'已設定':'未設定'} · Open-Meteo 免 Key`;}
    function saveSettings(button){const card=button.closest('[data-weather-settings]');if(!card)return false;const next={...providerConfig};card.querySelectorAll('[data-weather-config-field]').forEach(input=>{next[input.dataset.weatherConfigField]=input.value.trim();});next.qweatherHost=cleanHost(next.qweatherHost);providerConfig={amapKey:next.amapKey||'',qweatherHost:next.qweatherHost||'',qweatherKey:next.qweatherKey||''};saveProviderConfig();cache={records:{}};saveCache();syncSettingsStatus(card);toast?.('天氣 API 設定已儲存，正在依優先順序更新…');refresh(true);return true;}
    function clearSettings(button){const card=button.closest('[data-weather-settings]');providerConfig={amapKey:'',qweatherHost:'',qweatherKey:''};saveProviderConfig();cache={records:{}};saveCache();card?.querySelectorAll('[data-weather-config-field]').forEach(input=>{input.value='';});syncSettingsStatus(card);toast?.('已清除高德／QWeather 設定，改由 Open-Meteo');refresh(true);return true;}
    function clearCache({notify=true}={}){cache={records:{}};saveCache();hydrate();if(notify)toast?.('已清除天氣快取');return true;}

    function hydrate(root=document){const scope=root?.querySelectorAll?root:document,summaries=[];if(scope.matches?.('[data-weather-day-summary]'))summaries.push(scope);scope.querySelectorAll?.('[data-weather-day-summary]').forEach(el=>summaries.push(el));summaries.forEach(el=>{const day=tripData.days.find(d=>d.day===Number(el.dataset.weatherDaySummary));if(day)el.innerHTML=summaryHtml(day);});const panels=[];if(scope.matches?.('[data-weather-day-panel]'))panels.push(scope);scope.querySelectorAll?.('[data-weather-day-panel]').forEach(el=>panels.push(el));panels.forEach(el=>{const day=tripData.days.find(d=>d.day===Number(el.dataset.weatherDayPanel));if(day)el.innerHTML=panelHtml(day);});const mapNodes=[];if(scope.matches?.('[data-weather-map-place]'))mapNodes.push(scope);scope.querySelectorAll?.('[data-weather-map-place]').forEach(el=>mapNodes.push(el));mapNodes.forEach(el=>{const p=items[el.dataset.weatherMapPlace];if(p)el.innerHTML=mapHtml(p,el.dataset.weatherMapDay||'all');});}
    function handleAction(button){if(button?.hasAttribute('data-weather-settings-save'))return saveSettings(button);if(button?.hasAttribute('data-weather-settings-clear'))return clearSettings(button);if(!button?.hasAttribute('data-weather-refresh'))return false;button.disabled=true;refresh(true).finally(()=>{button.disabled=false;});return true;}
    function start(){hydrate();refresh(false);timer=setInterval(()=>refresh(false),CACHE_TTL);window.addEventListener('online',()=>refresh(false),{passive:true});}
    function cleanup(){if(timer)clearInterval(timer);timer=null;}
    return {daySummaryPlaceholder,dayPanelPlaceholder,mapPlaceholder,hydrate,handleAction,start,refresh,clearCache,cleanup,settingsHtml,isStorageAvailable:()=>storageAvailable};
  }

  window.YunnanWeatherSystem={create};
})();
