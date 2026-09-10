/* Settings domain: UI layout preference and settings-page ownership. */
(() => {
  'use strict';

  function create({toast}={}){
    const STORAGE_KEY='yunnan-2026-ui-layout-v1';
    const VALID=new Set(['mobile','desktop']);
    let storageAvailable=true;

    function read(){
      try{
        const value=localStorage.getItem(STORAGE_KEY);
        if(VALID.has(value))return value;
        localStorage.setItem(STORAGE_KEY,'mobile');
        return 'mobile';
      }catch{
        storageAvailable=false;
        return 'mobile';
      }
    }
    let mode=read();

    function save(value){
      try{localStorage.setItem(STORAGE_KEY,value);return true;}
      catch{storageAvailable=false;return false;}
    }
    function sync(){
      document.documentElement.dataset.uiLayout=mode;
      document.querySelectorAll('[data-ui-layout-select]').forEach(select=>{select.value=mode;});
    }
    function set(value){
      if(!VALID.has(value)||value===mode){sync();return false;}
      mode=value;
      save(mode);
      sync();
      return true;
    }
    function settingsHtml(){
      return `<article class="layout-mode-card utility-card utility-card--settings"><div><span class="eyebrow">INTERFACE LAYOUT</span><h3>介面版面</h3><p class="small">手機版為預設：手機使用觸控與窄版排版，電腦仍會依螢幕寬度正常顯示。選「電腦版」時，手機會以完整桌面寬度自動縮放到螢幕內，保留桌面版比例；同時仍可左右滑動切換主要 Tab。線上、離線與 PWA 都共用同一設定。</p></div><label>版面<select data-ui-layout-select aria-label="介面版面"><option value="mobile">手機版（預設）</option><option value="desktop">電腦版</option></select></label></article>`;
    }
    function handleChange(target){
      const select=target?.closest?.('[data-ui-layout-select]');
      if(!select)return false;
      if(set(select.value)){
        toast?.(`介面已切換為${mode==='desktop'?'電腦版':'手機版'}，正在重新載入…`);
        setTimeout(()=>location.reload(),180);
      }
      return true;
    }
    sync();
    return {settingsHtml,handleChange,sync,get:()=>mode,isStorageAvailable:()=>storageAvailable,storageKey:STORAGE_KEY};
  }

  window.YunnanSettingsSystem={create};
})();
