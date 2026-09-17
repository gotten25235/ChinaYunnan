/* Settings domain: UI layout + appearance preferences and settings-page ownership. */
(() => {
  'use strict';

  function create({toast}={}){
    const LAYOUT_STORAGE_KEY='yunnan-2026-ui-layout-v1';
    const THEME_STORAGE_KEY='yunnan-2026-color-theme-v1';
    const VALID_LAYOUTS=new Set(['mobile','desktop']);
    const VALID_THEMES=new Set(['system','light','dark']);
    const darkScheme=window.matchMedia?.('(prefers-color-scheme: dark)');
    let storageAvailable=true;

    function readLayout(){
      try{
        const value=localStorage.getItem(LAYOUT_STORAGE_KEY);
        if(VALID_LAYOUTS.has(value))return value;
        localStorage.setItem(LAYOUT_STORAGE_KEY,'mobile');
        return 'mobile';
      }catch{
        storageAvailable=false;
        return 'mobile';
      }
    }
    function readTheme(){
      try{
        const value=localStorage.getItem(THEME_STORAGE_KEY);
        if(VALID_THEMES.has(value))return value;
        localStorage.setItem(THEME_STORAGE_KEY,'system');
        return 'system';
      }catch{
        storageAvailable=false;
        return 'system';
      }
    }

    let mode=readLayout();
    let theme=readTheme();

    function save(key,value){
      try{localStorage.setItem(key,value);return true;}
      catch{storageAvailable=false;return false;}
    }

    function resolvedTheme(){
      if(theme==='dark'||theme==='light')return theme;
      return darkScheme?.matches?'dark':'light';
    }

    function syncTheme(){
      const resolved=resolvedTheme();
      const root=document.documentElement;
      const cssScheme=resolved==='dark'?'dark':'only light';
      const metaScheme=resolved==='dark'?'dark':'light';
      root.dataset.themePreference=theme;
      root.dataset.theme=resolved;
      root.style.colorScheme=cssScheme;
      document.querySelectorAll('[data-color-theme-select]').forEach(select=>{select.value=theme;});
      const schemeMeta=document.querySelector('meta[name="color-scheme"]');
      if(schemeMeta)schemeMeta.setAttribute('content',metaScheme);
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content',resolved==='dark'?'#121916':'#f7f6f1');
      const appleStatusMeta=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if(appleStatusMeta)appleStatusMeta.setAttribute('content',resolved==='dark'?'black-translucent':'default');
      window.dispatchEvent(new CustomEvent('yunnan:theme-change',{detail:{preference:theme,resolved}}));
    }

    function syncLayout(){
      document.documentElement.dataset.uiLayout=mode;
      document.querySelectorAll('[data-ui-layout-select]').forEach(select=>{select.value=mode;});
    }
    function sync(){syncTheme();syncLayout();}

    function setLayout(value){
      if(!VALID_LAYOUTS.has(value)||value===mode){syncLayout();return false;}
      mode=value;save(LAYOUT_STORAGE_KEY,mode);syncLayout();return true;
    }
    function setTheme(value){
      if(!VALID_THEMES.has(value)||value===theme){syncTheme();return false;}
      theme=value;save(THEME_STORAGE_KEY,theme);syncTheme();return true;
    }

    function settingsHtml(){
      return `<article class="layout-mode-card utility-card utility-card--settings"><div><span class="eyebrow">INTERFACE LAYOUT</span><h3>介面版面</h3><p class="small">手機版為預設：手機使用觸控與窄版排版，電腦仍會依螢幕寬度正常顯示。選「電腦版」時，手機會以完整桌面寬度自動縮放到螢幕內，保留桌面版比例；同時仍可左右滑動切換主要 Tab。線上、離線與 PWA 都共用同一設定。</p></div><label>版面<select data-ui-layout-select aria-label="介面版面"><option value="mobile">手機版（預設）</option><option value="desktop">電腦版</option></select></label></article><article class="theme-mode-card utility-card utility-card--settings"><div><span class="eyebrow">APPEARANCE</span><h3>顯示主題</h3><p class="small">系統預設會跟隨裝置的淺色／深色外觀；固定淺色或深色時，網站內容、原生表單與網站可控制的瀏覽器／PWA 色彩都以所選主題為準，不再受系統外觀切換影響。系統導覽列、鍵盤等裝置介面仍由手機系統控制。偏好只儲存在此瀏覽器，線上、離線與 PWA 共用。</p></div><label>主題<select data-color-theme-select aria-label="顯示主題"><option value="system">系統預設</option><option value="light">淺色主題</option><option value="dark">深色主題</option></select></label></article>`;
    }

    function handleChange(target){
      const themeSelect=target?.closest?.('[data-color-theme-select]');
      if(themeSelect){
        if(setTheme(themeSelect.value)){
          const label=theme==='system'?'系統預設':theme==='light'?'淺色主題':'深色主題';
          toast?.(`主題已切換為${label}`);
        }
        return true;
      }
      const layoutSelect=target?.closest?.('[data-ui-layout-select]');
      if(!layoutSelect)return false;
      if(setLayout(layoutSelect.value)){
        toast?.(`介面已切換為${mode==='desktop'?'電腦版':'手機版'}，正在重新載入…`);
        setTimeout(()=>location.reload(),180);
      }
      return true;
    }

    const onSystemThemeChange=()=>{if(theme==='system')syncTheme();};
    try{darkScheme?.addEventListener?.('change',onSystemThemeChange);}catch{try{darkScheme?.addListener?.(onSystemThemeChange);}catch{}}

    sync();
    return {
      settingsHtml,handleChange,sync,
      get:()=>mode,getTheme:()=>theme,getResolvedTheme:()=>resolvedTheme(),
      isStorageAvailable:()=>storageAvailable,
      storageKey:LAYOUT_STORAGE_KEY,themeStorageKey:THEME_STORAGE_KEY
    };
  }

  window.YunnanSettingsSystem={create};
})();
