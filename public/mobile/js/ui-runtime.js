/* GENERATED FILE - DO NOT EDIT.
 * Canonical source: public/mobile/js/ui-runtime.source.js
 * Build: npm run build:source-bundles
 */
!function(global){"use strict";function createLifecycle(){var cleanups=[];function add(cleanup){return"function"==typeof cleanup&&cleanups.push(cleanup),cleanup}
function listen(target,type,handler,options){return target&&target.addEventListener?(target.addEventListener(type,handler,options),add(function(){
target.removeEventListener(type,handler,options)})):function(){}}return{add:add,listen:listen,delegate:function(target,type,selector,handler,options){
return listen(target,type,function(event){var node=event.target&&event.target.closest?event.target.closest(selector):null;node&&target.contains(node)&&handler(event,node)},options)
},destroy:function(){cleanups.splice(0).reverse().forEach(function(cleanup){try{cleanup()}catch(_){}})}}}function debounce(fn,wait){var timer=null,lastArgs=null,lastThis=null
;function invoke(){timer=null,fn.apply(lastThis,lastArgs||[]),lastArgs=lastThis=null}function wrapped(){lastArgs=arguments,lastThis=this,timer&&global.clearTimeout(timer),
timer=global.setTimeout(invoke,Number(wait||0))}return wrapped.cancel=function(){timer&&global.clearTimeout(timer),timer=lastArgs=lastThis=null},wrapped.flush=function(){
timer&&(global.clearTimeout(timer),invoke())},wrapped}function appendTrustedHtml(container,html){var template=document.createElement("template")
;template.innerHTML=String(html||""),container.appendChild(template.content.cloneNode(!0))}global.MobileUiRuntime=Object.freeze({createLifecycle:createLifecycle,debounce:debounce,
createRequestGate:function(){var sequence=0,controller=null;return{begin:function(){return sequence+=1,controller&&controller.abort&&controller.abort(),
controller="function"==typeof global.AbortController?new global.AbortController:null,{sequence:sequence,signal:controller?controller.signal:void 0}},isCurrent:function(token){
return!!token&&token.sequence===sequence},cancel:function(){sequence+=1,controller&&controller.abort&&controller.abort(),controller=null},currentSequence:function(){return sequence
}}},createChunkedHtmlRenderer:function(container,options){options=options||{};var generation=0,scheduled=null,scheduler=global.requestIdleCallback?function(callback){
return global.requestIdleCallback(callback,{timeout:50})}:function(callback){return global.setTimeout(callback,0)},cancelScheduler=global.cancelIdleCallback?function(handle){
global.cancelIdleCallback(handle)}:function(handle){global.clearTimeout(handle)};function cancel(){generation+=1,null!=scheduled&&cancelScheduler(scheduled),scheduled=null}return{
render:function(rows,renderItem,renderOptions){renderOptions=renderOptions||{},cancel()
;var current=generation,list=Array.isArray(rows)?rows:[],initialCount=Math.max(1,Number(renderOptions.initialCount||options.initialCount||60)),chunkSize=Math.max(1,Number(renderOptions.chunkSize||options.chunkSize||80))
;if(container.replaceChildren(),renderOptions.className&&(container.className=renderOptions.className),
!list.length)return"function"==typeof renderOptions.renderEmpty&&renderOptions.renderEmpty(container),"function"==typeof renderOptions.onComplete&&renderOptions.onComplete({
rendered:0,total:0}),{rendered:0,total:0,cancel:cancel};var index=0;function appendUntil(limit){if(current===generation){
for(var end=Math.min(list.length,limit),html="";index<end;index+=1)html+=renderItem(list[index],index);appendTrustedHtml(container,html)}}return appendUntil(initialCount),
index<list.length?scheduled=scheduler(function appendNext(){scheduled=null,current===generation&&(appendUntil(index+chunkSize),
index<list.length?scheduled=scheduler(appendNext):"function"==typeof renderOptions.onComplete&&renderOptions.onComplete({rendered:index,total:list.length}))
}):"function"==typeof renderOptions.onComplete&&renderOptions.onComplete({rendered:index,total:list.length}),{rendered:index,total:list.length,cancel:cancel}},cancel:cancel}},
renderState:function(container,options){if(container){
options=options||{},container.className=String(options.className||options.baseClass||"mobile-list-state")+" mobile-list-state "+String(options.state||"empty"),
container.replaceChildren();var content=document.createElement("div");if(content.className="loading"===options.state?"mobile-skeleton":"mobile-state-content",
"loading"!==options.state){var title=document.createElement("strong");if(title.textContent=String(options.title||""),content.appendChild(title),options.detail){
var detail=document.createElement("span");detail.textContent=String(options.detail),content.appendChild(detail)}if(options.retryAction){var retry=document.createElement("button")
;retry.type="button",retry.className=String(options.retryClass||"ghost-btn"),retry.dataset.mobileRetry=String(options.retryAction),
retry.textContent=String(options.retryLabel||"Thử lại"),content.appendChild(retry)}container.appendChild(content)}else{
content.setAttribute("aria-label",String(options.title||"Đang tải dữ liệu"));for(var i=0;i<3;i+=1)content.appendChild(document.createElement("span"));container.appendChild(content)
}}},bindDebouncedInput:function(lifecycle,input,handler,options){if(options=options||{},!input)return function(){};var debounced=debounce(function(event){handler(event,input.value)
},Number(options.wait||250)),cleanup=(lifecycle||createLifecycle()).listen(input,"input",debounced);return function(){debounced.cancel(),cleanup()}},
appendTrustedHtml:appendTrustedHtml})}(window);
//# sourceMappingURL=ui-runtime.js.map
