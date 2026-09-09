/* Reader domain: popup navigation, content rendering, stack and return-state ownership. */
(() => {
  'use strict';

  function createInteraction({$}){
    function captureReturnState(opener=null,{view=null,horizontal=[]}={}){
      const activeView=view||document.querySelector('.view.is-active');
      const openerEl=opener instanceof HTMLElement?opener:(document.activeElement instanceof HTMLElement?document.activeElement:null);
      const scrollers=new Set((horizontal||[]).filter(el=>el instanceof HTMLElement));
      const nearest=openerEl?.closest?.('.itinerary-day-strip,.map-place-strip,.map-date-rail,.day-story-strip,.chips,.route-list,.content-grid,.culture-grid,.rail');
      if(nearest)scrollers.add(nearest);
      return {windowX:window.scrollX||0,windowY:window.scrollY||0,view:activeView instanceof HTMLElement?activeView:null,viewScrollTop:activeView?.scrollTop||0,horizontal:[...scrollers].map(el=>({el,left:el.scrollLeft||0})),opener:openerEl};
    }
    function restoreReturnState(state){if(!state)return;if(state.view)state.view.scrollTop=state.viewScrollTop||0;(state.horizontal||[]).forEach(entry=>{if(entry?.el)entry.el.scrollLeft=entry.left||0;});window.scrollTo({left:state.windowX||0,top:state.windowY||0,behavior:'auto'});try{state.opener?.focus?.({preventScroll:true});}catch{}}
    function restoreReturnStateStable(state,after=null){restoreReturnState(state);requestAnimationFrame(()=>{restoreReturnState(state);requestAnimationFrame(()=>{restoreReturnState(state);if(typeof after==='function')after();});});}
    function bindPopupNavigation(dialog,{surfaceSelector,navigate}){
      if(!dialog||typeof navigate!=='function')return;const readyKey='popupNav_'+surfaceSelector.replace(/[^a-z0-9]/gi,'_');if(dialog.dataset[readyKey]==='1')return;dialog.dataset[readyKey]='1';
      const INTERACTIVE='a,button,input,select,textarea,label',MIN_X=58,RATIO=1.25,DUPLICATE_MS=260;let pointerGesture=null,touchGesture=null,lastNavigateAt=-Infinity;
      const eligibleSurface=target=>{const surface=target?.closest?.(surfaceSelector);return surface&&dialog.contains(surface)?surface:null;};
      const shouldNavigate=(g,x,y)=>{if(!g||g.ignore)return null;const dx=x-g.x,dy=y-g.y;return Math.abs(dx)>=MIN_X&&Math.abs(dx)>Math.abs(dy)*RATIO?(dx<0?'next':'prev'):null;};
      const navigateOnce=direction=>{if(!direction||performance.now()-lastNavigateAt<DUPLICATE_MS)return false;lastNavigateAt=performance.now();navigate(direction);return true;};
      dialog.addEventListener('pointerdown',event=>{if(!['touch','pen'].includes(event.pointerType)||event.isPrimary===false)return;const surface=eligibleSurface(event.target);if(!surface)return;pointerGesture={id:event.pointerId,x:event.clientX,y:event.clientY,surface,ignore:Boolean(event.target.closest?.(INTERACTIVE))};},{passive:true});
      dialog.addEventListener('pointerup',event=>{if(!pointerGesture||event.pointerId!==pointerGesture.id)return;const g=pointerGesture;pointerGesture=null;if(eligibleSurface(event.target)!==g.surface)return;navigateOnce(shouldNavigate(g,event.clientX,event.clientY));},{passive:true});
      dialog.addEventListener('pointercancel',event=>{if(pointerGesture&&event.pointerId===pointerGesture.id)pointerGesture=null;},{passive:true});
      dialog.addEventListener('touchstart',event=>{if(event.touches.length!==1)return;const touch=event.touches[0],surface=eligibleSurface(event.target);if(!surface)return;touchGesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,surface,ignore:Boolean(event.target.closest?.(INTERACTIVE))};},{passive:true});
      dialog.addEventListener('touchend',event=>{if(!touchGesture)return;const touch=[...event.changedTouches].find(t=>t.identifier===touchGesture.id);if(!touch)return;const g=touchGesture;touchGesture=null;navigateOnce(shouldNavigate(g,touch.clientX,touch.clientY));},{passive:true});
      dialog.addEventListener('touchcancel',()=>{touchGesture=null;},{passive:true});
      dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();navigate('prev');}else if(event.key==='ArrowRight'){event.preventDefault();navigate('next');}});
    }
    return {captureReturnState,restoreReturnState,restoreReturnStateStable,bindPopupNavigation};
  }

  function create(config){
    const {$,tripData,items,esc,photoSystem,travelUtils,favoritesStore,navigation,interaction,getLibrary,getMap,toggleFavorite,toast}=config;
    const {category,stars,hotelGradeLabel,placeHours,detailValue,hotelDistanceValue,iconSvg,flightLabelText}=travelUtils;
    const state={entry:null,stack:[],returnState:null,afterClose:null};
    const storyReadMinutes=s=>getLibrary()?.storyReadMinutes(s)||1;
    const groupLabel=p=>getMap()?.groupLabel(p)||p.group||(Array.isArray(p.days)?p.days.map(d=>'Day '+d).join(' · '):'未分組');
    const foodCity=()=>getLibrary()?.getFoodCity?.()||'all';
    const photoFilter=()=>getLibrary()?.getPhotoFilter?.()||'all';

    function itemSequence(p,day=null,kind=''){
      const d=tripData.days.find(x=>x.day===Number(day));
      if(kind==='favorites')return favoritesStore.values().map(id=>items[id]).filter(Boolean);
      if(kind==='photo')return tripData.photoSpots.filter(x=>photoFilter()==='all'||x.drama);
      if(kind==='food'&&d)return d.foods.map(id=>items[id]).filter(Boolean);
      if(kind==='shopping'&&d)return d.shopping.map(id=>items[id]).filter(Boolean);
      if(kind==='night'&&d)return d.nightRecommendations.map(id=>items[id]).filter(Boolean);
      if((kind==='itinerary'||kind==='hotel')&&d)return [...d.itinerary,...(d.hotel?[d.hotel]:[])].map(id=>items[id]).filter(Boolean);
      if(d&&[...d.itinerary,...d.foods,...d.shopping,...d.nightRecommendations,...(d.hotel?[d.hotel]:[])].includes(p.id)){
        if(p.type==='food')return d.foods.map(id=>items[id]).filter(Boolean);if(p.type==='shopping')return d.shopping.map(id=>items[id]).filter(Boolean);if(p.type==='night')return d.nightRecommendations.map(id=>items[id]).filter(Boolean);return [...d.itinerary,...(d.hotel?[d.hotel]:[])].map(id=>items[id]).filter(Boolean);
      }
      if(p.type==='food')return tripData.foods.filter(x=>foodCity()==='all'||x.city===foodCity());if(p.type==='shopping')return tripData.shopping;if(p.type==='photo')return tripData.photoSpots.filter(x=>photoFilter()==='all'||x.drama);return [p];
    }
    function itemBody(p,day=null){
      const d=tripData.days.find(x=>x.day===Number(day)),cat=category(p),hours=placeHours(p);let extra='';
      if(p.type==='food')extra+=(p.priority?detailValue('旅程優先級',p.priority):'')+detailValue('口味',p.taste)+detailValue('用餐類型',p.meal);if(p.type==='shopping')extra+=(p.priority?detailValue('旅程優先級',p.priority):'')+detailValue('購物分類',p.group);if(p.type==='night')extra+=detailValue('建議時段',p.time)+detailValue('適合',p.suitable)+detailValue('飯店 → 景點',hotelDistanceValue(p,d),true)+detailValue('交通',p.transport,true);if(p.type==='photo')extra+=detailValue('怎麼拍',p.shot,true)+detailValue('光線／時段',p.bestTime,true);
      if(d?.flight&&(p.id==='arrival'||p.id==='return')){const direction=d.flight;const flightText=tripData.flights.map(g=>`${g.name}：${(g[direction]||[]).map(f=>`${flightLabelText(f)} ${f.route} ${f.time}`).join('；')}`).join(' ｜ ');extra+=detailValue('航空公司／航班',flightText,true);}
      const dayLabel=d?`Day ${d.day} · ${d.city}`:groupLabel(p);
      return `<article class="content-reader-article">${photoSystem.readerFigure(p.photoId,'content-reader-photo',photoSystem.badgeFor(p))}<div class="content-reader-copy"><div class="content-reader-kicker"><span class="map-strip-type" style="--marker-color:${cat.color}"><i>${iconSvg(p.type)}</i>${esc(cat.name)}</span>${hours?`<span>${esc(hours)}</span>`:''}</div><h2>${esc(p.name)}</h2><p class="content-reader-intro">${esc(p.description)}</p><div class="map-detail-grid">${detailValue('城市',p.city)}${detailValue('GROUP',dayLabel)}${detailValue('停留時間',p.duration)}${p.type==='hotel'?detailValue('手冊星級',hotelGradeLabel(p)):''}${p.rating?detailValue('推薦度',stars(p.rating)):''}${p.pdfScheduled===true?detailValue('行程狀態','PDF 已安排'):''}${extra}${detailValue('地址／搜尋詞',p.address,true)}${detailValue('座標說明',p.coordinateNote,true)}</div><div class="content-reader-actions"><button type="button" data-content-reader-focus="${esc(p.id)}">◎ 地圖看位置</button><a ${navigation.attrs(p)}>↗ <span data-nav-label>${esc(navigation.name(navigation.get()))}導航</span></a><button type="button" data-copy="${esc(p.id)}">複製地址</button><button type="button" data-content-reader-save="${esc(p.id)}">${favoritesStore.has(p.id)?'♥ 已收藏':'♡ 收藏'}</button></div></div></article>`;
    }
    function storyBody(story,day=null){const d=tripData.days.find(x=>x.day===Number(day));return `<article class="content-reader-article story-mode">${photoSystem.readerFigure(story.photoId)}<div class="content-reader-copy"><div class="culture-meta"><span class="badge">${esc(story.city)} · ${esc(story.kind)}</span><span>${esc(story.period)}</span><span>約 ${storyReadMinutes(story)} 分鐘閱讀</span></div><h2>${esc(story.title)}</h2><p class="content-reader-story-intro">${esc(story.intro)}</p><p class="content-reader-story-body">${esc(story.body)}</p><div class="content-reader-story-look"><span>旅途中可以留意</span>${esc(story.look)}</div><div class="content-reader-story-source"><span>${d?`Day ${d.day} · ${esc(d.city)}`:story.days.map(x=>'Day '+x).join(' / ')}</span><a href="${esc(story.source)}" target="_blank" rel="noopener noreferrer">${esc(story.sourceLabel)} ↗</a></div></div></article>`;}
    function header(entry){const canBack=state.stack.length>0;let title='完整內容',sub='';if(entry.kind==='story'){const st=tripData.culture.find(x=>x.id===entry.ids[entry.index]);title='旅途故事';sub=st?`${st.kind} · ${st.period}`:'';}else{const p=items[entry.ids[entry.index]];title=p?.name||'完整內容';sub=p?category(p).name:'';}return `<header class="content-reader-header"><button type="button" class="content-reader-back" data-content-reader-back>${canBack?'← 回上一層':'← 關閉'}</button><div><span class="eyebrow">DETAIL READER</span><strong>${esc(title)}</strong><small>${esc(sub)}</small></div><button type="button" class="content-reader-x" data-content-reader-close aria-label="關閉完整內容">×</button></header>`;}
    function render(direction=''){const dialog=ensureDialog(),entry=state.entry;if(!dialog||!entry)return;let body='',count=1,index=0;if(entry.kind==='story'){const seq=entry.ids.map(id=>tripData.culture.find(x=>x.id===id)).filter(Boolean),st=seq[entry.index];if(!st)return;body=storyBody(st,entry.day);count=seq.length;index=entry.index;}else{const seq=entry.ids.map(id=>items[id]).filter(Boolean),p=seq[entry.index];if(!p)return;body=itemBody(p,entry.day);count=seq.length;index=entry.index;}const shell=dialog.querySelector('.content-reader-shell');shell.innerHTML=`${header(entry)}<div class="content-reader-scroll">${body}</div><footer class="content-reader-footer"><button type="button" data-content-reader-nav="prev">← 上一個</button><span class="content-reader-position">${index+1} / ${count} · 左右滑動</span><button type="button" data-content-reader-nav="next">下一個 →</button></footer>`;if(direction){const article=shell.querySelector('.content-reader-article');article?.classList.add(direction==='prev'?'reader-from-left':'reader-from-right');}const prev=shell.querySelector('[data-content-reader-nav="prev"]'),next=shell.querySelector('[data-content-reader-nav="next"]');if(prev)prev.disabled=index<=0;if(next)next.disabled=index>=count-1;navigation.sync();}
    function ensureDialog(){let dialog=$('#content-reader-dialog');if(dialog)return dialog;document.body.insertAdjacentHTML('beforeend','<dialog id="content-reader-dialog" class="content-reader-dialog" aria-label="內容完整閱讀視窗"><div class="content-reader-shell"></div></dialog>');dialog=$('#content-reader-dialog');dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});interaction.bindPopupNavigation(dialog,{surfaceSelector:'.content-reader-scroll',navigate});dialog.addEventListener('close',()=>{const after=state.afterClose,returnState=state.returnState;state.afterClose=null;state.returnState=null;state.entry=null;state.stack=[];interaction.restoreReturnStateStable(returnState,after);});return dialog;}
    function openEntry(entry,opener=null,{push=false}={}){const dialog=ensureDialog();if(!dialog)return;if(!dialog.open){state.returnState=interaction.captureReturnState(opener,{horizontal:[$('#itinerary-strip')]});state.stack=[];}else if(push&&state.entry)state.stack.push(JSON.parse(JSON.stringify(state.entry)));state.entry=entry;render();if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}}
    function openItem(id,{day=null,kind='',opener=null,push=false}={}){const p=items[id];if(!p)return;const seq=itemSequence(p,day,kind);let index=seq.findIndex(x=>x.id===id);if(index<0)index=0;openEntry({kind:'item',ids:seq.map(x=>x.id),index,day:Number(day)||null},opener,{push});}
    function openStory(id,{day=null,opener=null,push=false}={}){const hasDay=day!==null&&day!==undefined&&String(day).trim()!=='',n=hasDay?Number(day):NaN,seq=tripData.culture.filter(st=>Number.isFinite(n)?st.days.includes(n):true);let index=seq.findIndex(st=>st.id===id);if(index<0)index=0;if(seq.length)openEntry({kind:'story',ids:seq.map(st=>st.id),index,day:Number.isFinite(n)?n:null},opener,{push});}
    function back(){const dialog=$('#content-reader-dialog');if(!dialog?.open)return;if(state.stack.length){state.entry=state.stack.pop();render('prev');}else dialog.close();}
    function closeThen(action){const dialog=$('#content-reader-dialog');if(!dialog?.open){if(typeof action==='function')action();return;}state.afterClose=action;dialog.close();}
    function navigate(direction){const e=state.entry;if(!e)return;const ni=e.index+(direction==='prev'?-1:1);if(ni<0||ni>=e.ids.length)return;e.index=ni;render(direction);}
    function handleAction(b){
      if(b.hasAttribute('data-content-reader-close')){$('#content-reader-dialog')?.close();return true;}if(b.hasAttribute('data-content-reader-back')){back();return true;}if(b.dataset.contentReaderNav){navigate(b.dataset.contentReaderNav);return true;}if(b.dataset.contentReaderItem){openItem(b.dataset.contentReaderItem,{day:b.dataset.readerDay,kind:b.dataset.readerKind,opener:b,push:$('#content-reader-dialog')?.open});return true;}if(b.dataset.contentReaderStory){openStory(b.dataset.contentReaderStory,{day:b.dataset.readerDay,opener:b,push:$('#content-reader-dialog')?.open});return true;}if(b.dataset.contentReaderFocus){const id=b.dataset.contentReaderFocus;closeThen(()=>getMap()?.focusPlace(id));return true;}if(b.dataset.contentReaderSave){const id=b.dataset.contentReaderSave;toggleFavorite(id);b.textContent=favoritesStore.has(id)?'♥ 已收藏':'♡ 收藏';return true;}if(b.dataset.readerItem){openItem(b.dataset.readerItem,{day:b.dataset.readerDay,kind:b.dataset.readerKind,opener:b});return true;}if(b.dataset.readerNightDay){const d=tripData.days.find(x=>x.day===Number(b.dataset.readerNightDay));if(d?.nightRecommendations?.length)openItem(d.nightRecommendations[0],{day:d.day,kind:'night',opener:b});else toast('這晚沒有額外夜遊提案');return true;}return false;
    }
    return {openItem,openStory,closeThen,handleAction,navigate,isOpen:()=>Boolean($('#content-reader-dialog')?.open)};
  }

  window.YunnanReaderSystem={createInteraction,create};
})();
