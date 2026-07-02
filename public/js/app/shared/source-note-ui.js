(function(){
  'use strict';

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function joinValue(value){
    if(Array.isArray(value)) return value.filter(Boolean).join(', ');
    if(value && typeof value==='object') return JSON.stringify(value);
    return String(value ?? '');
  }

  function ensureStyle(){
    if(document.getElementById('sourceNoteUiStyle')) return;
    const style=document.createElement('style');
    style.id='sourceNoteUiStyle';
    style.textContent='.source-note{margin:8px 0;padding:8px 10px;border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;font-size:12px;color:#1e293b}.source-note[data-source-status="WARNING"]{border-color:#fbbf24;background:#fffbeb}.source-note[data-source-status="ERROR"]{border-color:#f87171;background:#fef2f2}.source-note__summary{font-weight:700}.source-note details{margin-top:4px}.source-note summary{cursor:pointer;color:#1d4ed8;font-weight:700}.source-note__grid{display:grid;grid-template-columns:145px minmax(0,1fr);gap:4px 10px;margin:6px 0 0}.source-note__grid dt{font-weight:800;color:#475569}.source-note__grid dd{margin:0;word-break:break-word}.source-note--compact{padding:6px 8px}.source-note--tooltip{display:inline-flex;margin:0 0 0 6px;padding:2px 6px;border-radius:999px;vertical-align:middle}.source-note__status{font-weight:900}';
    document.head.appendChild(style);
  }

  function renderSourceNote(sourceNote, options){
    const opts=Object.assign({compact:true,collapsible:true,defaultOpen:false,showTechnicalFields:false,debug:false},options||{});
    if(!sourceNote || (!sourceNote.visibleOnUi && !opts.debug)) return '';
    ensureStyle();
    const status=String(sourceNote.sourceStatus||'OK').toUpperCase();
    const primary=joinValue(sourceNote.primaryCollections)||'—';
    const service=sourceNote.service||'—';
    const label=sourceNote.sourceLabel||sourceNote.ssotRule||'';
    const summary='Nguồn: '+primary+' · Service: '+service+' · '+status;
    const rows=[
      ['Mã/contract',sourceNote.code||sourceNote.contractCode||sourceNote.reportCode||''],
      ['Module',sourceNote.module||sourceNote.category||''],
      ['Endpoint',sourceNote.endpoint||sourceNote.runEndpoint||''],
      ['Nguồn chính',primary],
      ['Nguồn phụ',joinValue(sourceNote.secondaryCollections)||'—'],
      ['Nguồn bị cấm',joinValue(sourceNote.forbiddenCollections)||'—'],
      ['Quy tắc SSoT',sourceNote.ssotRule||label],
      ['Bộ lọc',joinValue(sourceNote.filters||{})],
      ['Sinh lúc',sourceNote.generatedAt||''],
      ['Người chạy',sourceNote.generatedBy||''],
      ['Cảnh báo',joinValue([].concat(sourceNote.sourceWarnings||[],sourceNote.dataQualityWarnings||[]))||'Không có']
    ];
    const grid='<dl class="source-note__grid">'+rows.map(function(row){return '<dt>'+escapeHtml(row[0])+'</dt><dd>'+escapeHtml(row[1])+'</dd>';}).join('')+'</dl>';
    const detail=opts.collapsible?'<details '+(opts.defaultOpen?'open':'')+'><summary>Chi tiết nguồn</summary>'+grid+'</details>':grid;
    return '<div class="source-note '+(opts.compact?'source-note--compact':'')+'" data-source-status="'+escapeHtml(status)+'"><div class="source-note__summary">'+escapeHtml(summary)+'</div>'+detail+'</div>';
  }

  window.SourceNoteUi={renderSourceNote:renderSourceNote,joinValue:joinValue};
})();
