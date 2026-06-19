'use strict';

(function exposeToolbarActions(global){
  async function run(button, task, options = {}){
    if(!button || typeof task !== 'function')return undefined;
    if(button.dataset?.uiBusy === 'true')return undefined;

    const originalDisabled=Boolean(button.disabled);
    const originalText=button.textContent;
    const originalMinWidth=button.style.minWidth;
    const measuredWidth=Math.ceil(button.getBoundingClientRect?.().width || 0);
    if(measuredWidth)button.style.minWidth=`${measuredWidth}px`;
    if(button.dataset)button.dataset.uiBusy='true';
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    if(options.loadingText)button.textContent=options.loadingText;

    try{
      return await task();
    }finally{
      button.disabled=originalDisabled;
      button.textContent=originalText;
      button.style.minWidth=originalMinWidth;
      if(button.dataset)delete button.dataset.uiBusy;
      button.removeAttribute('aria-busy');
    }
  }

  global.ToolbarActions=Object.freeze({ run });
})(window);
