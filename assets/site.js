/* medicare-cuts.skin — CY2027 final-rule V2. Static model, no external API or tracker. */
'use strict';
(() => {
  const VERSION = 'CY2027_FINAL_V2_SIM6_MAX80_2026-11-11';
  const FILES = {
    manifest: 'data/scenario_manifest_v2.json',
    national: 'data/national_scenarios_v2.json',
    index: 'data/providers_index_v2.json',
    legacyIdentity: 'data/provider_data.json', // Existing GitHub file; financial fields intentionally ignored.
  };
  const SCENARIO_LABELS = {
    '2027_phased': '2027 final rule · phased PE',
    'fully_implemented': 'Hypothetical fully implemented PE · current globals',
    'future_000_m25_only': 'Hypothetical LN2 zero-day conversion · no RVU reduction',
    'future_000_min20': 'Hypothetical LN2 zero-day conversion · minimum RVU reduction',
    'future_000_mid50': 'Hypothetical LN2 zero-day conversion · medium RVU reduction',
    'future_000_max80': 'Hypothetical LN2 zero-day conversion · maximum RVU reduction',
  };
  const FUTURE_MAP = {0:'future_000_m25_only',20:'future_000_min20',50:'future_000_mid50',80:'future_000_max80'};
  const SCENARIOS = ['2027_phased','fully_implemented','future_000_m25_only','future_000_min20','future_000_mid50','future_000_max80'];
  const SHORT_LABELS = ['2027 final','Full PE','LN2 zero-day · none','LN2 zero-day · min','LN2 zero-day · mid','LN2 zero-day · max'];
  const STATES = {'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia'};
  const state = {
    national: null, summaryById: new Map(), manifest: null,
    index: null, indexByNpi: new Map(), identities: null, namesByNpi: new Map(),
    directoryReady:false, activeMode:'phased', futureRate:50,
    scope:{kind:'national'}, scenarioCache:new Map(), pending:new Map(),
    display:'dollars', sliderCustomized:false, selectedRate:null, sliderDefault:null,
    providerSubsets:new Map(), aggregateCache:new Map(), stateMoreCount:12,
    lastRendered:null, searchResults:[], activeSuggestion:-1,
    error:null, warnings:[]
  };
  const $ = id => document.getElementById(id);
  const moneyFmt = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const moneyPreciseFmt = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  const intFmt = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
  const compactFmt = new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:2});
  const val = (v) => Number(v) || 0;
  const clean = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const safeName = (npi) => state.namesByNpi.get(npi)?.provider_name || `Dermatologist · NPI ${npi}`;
  const currentScenario = () => state.activeMode === 'phased' ? '2027_phased' : state.activeMode === 'full' ? 'fully_implemented' : FUTURE_MAP[state.futureRate];
  const isFuture = id => id.startsWith('future_000_');
  const fmtRate = v => Number.isFinite(v) ? `${Number(v).toFixed(2).replace(/0$/,'').replace(/\.$/,'')}%` : '—';
  const fmtPct = v => {if(!Number.isFinite(v))return '—'; const two=Math.round((Math.abs(v)+1e-9)*100)/100;return `${v<0?'-':v>0?'+':''}${two.toFixed(2)}%`;};
  const fmtMoney = v => Number.isFinite(v) ? moneyFmt.format(v) : '—';
  const fmtMoneyTight = (v,plus=true) => { if (!Number.isFinite(v)) return '—'; const n=Math.abs(v),sgn=v<0?'-':v>0&&plus?'+':''; if (n>=1e9) return `${sgn}$${(n/1e9).toFixed(2)}B`; if(n>=1e6) return `${sgn}$${(n/1e6).toFixed(2)}M`; if(n>=1e3) return `${sgn}$${(n/1e3).toFixed(2)}K`; return moneyPreciseFmt.format(v); };
  const fmtRemainingPct = v => Number.isFinite(v) ? `${v.toFixed(2)}%` : '—';
  const fmtNum = n => intFmt.format(n);
  function setText(id, value) { const n=$(id); if(n) n.textContent=String(value); }
  function showError(message) { state.error = message; const n=$('status-message'); n.textContent=message; n.hidden=false; }
  function clearError() {state.error=null; $('status-message').hidden=true;}
  function toast(message) {const box=$('toast');box.textContent=message;box.hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>box.hidden=true,3700);}
  async function readJSON(url) {
    const response=await fetch(url,{cache:'default'});
    if (!response.ok) throw new Error(`Could not load required model data: HTTP ${response.status}`);
    return await response.json();
  }
  function validateUnique(rows,label) {
    if(!Array.isArray(rows)||rows.length!==12477) throw new Error(`${label} has ${rows?.length??'invalid'} rows; expected 12,477.`);
    const s=new Set(rows.map(row=>String(row.npi)));
    if(s.size!==12477) throw new Error(`${label} has duplicate or missing NPIs.`);
    return s;
  }
  async function ensureScenario(id){
    if(state.scenarioCache.has(id)) return state.scenarioCache.get(id);
    if(state.pending.has(id)) return state.pending.get(id);
    const promise=(async()=>{
      const data=await readJSON(`data/providers_${id}_v2.json`);
      validateUnique(data,'Physician scenario data');
      const target=state.summaryById.get(id);
      if(target){
        const s=data.reduce((acc,r)=>acc+val(r.total_dollar_cut),0);
        if(Math.abs(s-val(target.total_dollar_cut))>75) throw new Error(`Physician-sum financial mismatch for ${id}. Expected ${target.total_dollar_cut}, received ${s}.`);
      }
      const mapped=new Map(data.map(r=>[String(r.npi),r]));
      if(state.index){
        const absent=state.index.filter(p=>!mapped.has(String(p.npi)));
        if(absent.length) throw new Error(`${absent.length} NPIs missing from ${id} physician data.`);
      }
      state.scenarioCache.set(id,mapped);
      return mapped;
    })().finally(()=>state.pending.delete(id));
    state.pending.set(id,promise);
    return promise;
  }
  async function activateScenario(id){
    clearError();
    render();
    if(state.scope.kind!=='national' && !state.scenarioCache.has(id)) setText('profile-subtitle','Loading selected scenario estimates…');
    try{await ensureScenario(id);if(currentScenario()===id) render();}
    catch(e){if(currentScenario()===id)showError(`Unable to display this scenario: ${e.message}`);}
  }
  function updateModeButtons(){
    document.querySelectorAll('[data-mode]').forEach(btn=>{const on=btn.dataset.mode===state.activeMode;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
    $('future-panel').hidden=state.activeMode!=='future';
    document.querySelectorAll('[data-rate]').forEach(btn=>{const on=Number(btn.dataset.rate)===state.futureRate;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
  }
  function switchMode(mode,rate){
    state.activeMode=mode;if(rate!==undefined)state.futureRate=rate;
    updateModeButtons();activateScenario(currentScenario());renderComparison();
  }
  function getStateMembers(code){
    if(state.providerSubsets.has(code))return state.providerSubsets.get(code);
    if(!state.index || !state.directoryReady) return [];
    const members=state.index.map(r=>String(r.npi)).filter(npi=>state.namesByNpi.get(npi)?.state===code);
    state.providerSubsets.set(code,members);return members;
  }
  function getAggregateForState(code,id){
    const cacheKey=`${code}/${id}`;
    if(state.aggregateCache.has(cacheKey)) return state.aggregateCache.get(cacheKey);
    const rows=state.scenarioCache.get(id);
    if(!rows || !state.directoryReady)return null;
    const members=getStateMembers(code);
    const out={scenario_id:id,providers:members.length,baseline_2026_dollars:0,cf_dollar_cut:0,rvu_dollar_cut:0,m25_dollar_cut:0,mppr_rerank_credit_dollars:0,total_dollar_cut:0,projected_revenue:0};
    let totalEM=0,totalSameDay=0;
    for(const npi of members){
      const p=rows.get(npi);const idx=state.indexByNpi.get(npi);
      if(!p)continue;
      out.baseline_2026_dollars+=val(p.rev_2026);
      for(const k of ['cf_dollar_cut','rvu_dollar_cut','m25_dollar_cut','mppr_rerank_credit_dollars','total_dollar_cut'])out[k]+=val(p[k]);
      totalEM+=val(idx?.total_ems);totalSameDay+=val(idx?.modeled_same_day_encounters);
    }
    out.projected_revenue=out.baseline_2026_dollars+out.total_dollar_cut;
    out.defaultPct=totalEM>0?Math.max(0,Math.min(100,totalSameDay/totalEM*100)):0;
    state.aggregateCache.set(cacheKey,out);return out;
  }
  function getScopeData(){
    const id=currentScenario(),scope=state.scope;
    if(scope.kind==='national'){
      const national=state.summaryById.get(id);if(!national)return null;
      let pct=null;
      if(state.index){const em=state.index.reduce((a,r)=>a+val(r.total_ems),0);const enc=state.index.reduce((a,r)=>a+val(r.modeled_same_day_encounters),0);pct=em?100*enc/em:0;}
      return {...national,defaultPct:pct,scopeTitle:'All U.S. Dermatology Practices',scopeSubtitle:'National Total · All modeled dermatology physicians',scopeCode:'NATIONAL',scopeType:'NATIONAL AGGREGATE'};
    }
    const table=state.scenarioCache.get(id);if(!table)return null;
    if(scope.kind==='provider'){
      const row=table.get(scope.npi);if(!row)return null;
      const meta=state.namesByNpi.get(scope.npi),idx=state.indexByNpi.get(scope.npi);
      return {...row,baseline_2026_dollars:val(row.rev_2026),providers:1,defaultPct:idx?val(idx.modeled_same_day_pct):0,scopeTitle:safeName(scope.npi),scopeSubtitle:meta?.practice_name||'Practice not listed in existing directory',scopeCode:scope.npi,scopeType:'INDIVIDUAL PHYSICIAN'};
    }
    if(scope.kind==='state'){
      const row=getAggregateForState(scope.code,id);if(!row)return null;
      return {...row,scopeTitle:`${STATES[scope.code]} Dermatology Practices`,scopeSubtitle:`Statewide Total · ${scope.code}`,scopeCode:scope.code,scopeType:'STATE AGGREGATE'};
    }
    return null;
  }
  function setScope(scope){
    state.scope=scope;
    state.sliderCustomized=false;state.selectedRate=null;state.sliderDefault=null;state.stateMoreCount=12;
    clearError();
    $('provider-search').value='';hideSearch();
    render();
    activateScenario(currentScenario());
    $('results-section')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function displayProfile(data){
    if(!data){setText('profile-type',state.scope.kind==='state'?'STATE AGGREGATE':state.scope.kind==='provider'?'INDIVIDUAL PHYSICIAN':'NATIONAL AGGREGATE');setText('profile-name','Loading estimates…');setText('baseline-amount','—');setText('total-impact-value','—');setText('total-impact-percent','—');return;}
    setText('profile-type',data.scopeType);setText('profile-name',data.scopeTitle);setText('profile-subtitle',data.scopeSubtitle);
    setText('provider-count',data.providers===1?`NPI: ${data.scopeCode}`:`${fmtNum(data.providers)} physicians`);
    const baseline=val(data.baseline_2026_dollars);
    setText('baseline-amount',state.display==='percent'?'100.00%':fmtMoneyTight(baseline,false));
    $('baseline-amount').title=state.display==='percent'?'':fmtMoney(baseline);
  }
  function setSliderDefault(data){
    const rate=data&&Number.isFinite(data.defaultPct)?data.defaultPct:null;
    if(rate===null){
      $('mod25-slider').disabled=true;$('reset-slider').disabled=true;
      setText('slider-value','—');setText('slider-default-value','Loading…');return null;
    }
    // When changing scenarios preserve an already customized rate for the same scope.
    if(state.sliderDefault===null || !state.sliderCustomized){state.selectedRate=rate;}
    state.sliderDefault=rate;
    const adjustable=rate>0 && data.providers>0;
    $('mod25-slider').disabled=!adjustable;$('reset-slider').disabled=!adjustable || !state.sliderCustomized;
    $('mod25-slider').value=String(Math.round((state.selectedRate??rate)*10)/10);
    setText('slider-default-value',fmtRate(rate));
    setText('slider-value',fmtRate(state.selectedRate));
    const note=$('slider-note');
    if(!adjustable){note.textContent='No modeled Modifier 25 exposure at the default rate. This physician has no usable per-encounter rate for a reliable slider adjustment.';}
    else if(state.sliderCustomized){note.textContent='Sensitivity estimate: the selected rate scales the precomputed Modifier 25 amount. CF, RVU and provisional MPPR amounts are unchanged.';}
    else{note.textContent='At the default rate the figures exactly reproduce the modeled result. Moving the slider changes Modifier 25 only; encounter combinations and procedure mix stay fixed.';}
    return rate;
  }
  function render(){
    updateModeButtons();const id=currentScenario(),data=getScopeData();
    setText('scenario-plain-label',SCENARIO_LABELS[id]);
    displayProfile(data);
    if(!data){state.lastRendered=null;for(const k of ['cf-impact','rvu-impact','m25-impact','total-impact-value','total-impact-percent','projected-revenue'])setText(k,'—');return;}
    const defaultRate=setSliderDefault(data),selectedRate=state.sliderCustomized ? state.selectedRate:defaultRate;
    const baseline=val(data.baseline_2026_dollars);
    const cf=val(data.cf_dollar_cut),rvu=val(data.rvu_dollar_cut),baseM25=val(data.m25_dollar_cut),mppr=val(data.mppr_rerank_credit_dollars);
    // The source summary stores full precision national totals. Do not recompute a default national
    // result from independently rounded provider JSON; that produces small dollar discrepancies.
    const m25=(defaultRate>0 && state.sliderCustomized) ? baseM25*selectedRate/defaultRate : baseM25;
    const total=val(data.total_dollar_cut)+(m25-baseM25),percent=baseline?total/baseline*100:0;
    const revenue=baseline+total;
    const displayedPercent=(!state.sliderCustomized && data.total_percent_cut!==undefined) ? Number(data.total_percent_cut) : percent;
    const percentDisplay=state.display==='percent';
    setText('total-impact-value',percentDisplay?fmtPct(displayedPercent):fmtMoneyTight(total));
    $('total-impact-value').title=percentDisplay?'':fmtMoney(total);
    setText('total-impact-percent',fmtPct(displayedPercent));
    setText('projected-revenue',percentDisplay?fmtRemainingPct(baseline?100+displayedPercent:0):fmtMoneyTight(revenue,false));
    $('projected-revenue').title=percentDisplay?'':fmtMoney(revenue);
    function component(prefix,amount){
      setText(`${prefix}-impact`,percentDisplay?fmtPct(baseline?amount/baseline*100:0):fmtMoneyTight(amount));
      setText(`${prefix}-share`,baseline?`${fmtPct(amount/baseline*100)} of baseline`:'No baseline');
      $(prefix+'-share').hidden=percentDisplay;
      $(prefix+'-impact').title=percentDisplay?'':fmtMoney(amount);
    }
    component('cf',cf);component('rvu',rvu);component('m25',m25);
    $('mppr-component').hidden=!isFuture(id);
    if(isFuture(id)){
      setText('mppr-impact',percentDisplay?fmtPct(baseline?mppr/baseline*100:0):fmtMoneyTight(mppr));
      setText('mppr-share',`${fmtPct(baseline?mppr/baseline*100:0)} of baseline · provisional`);
      $('mppr-share').hidden=percentDisplay;
      $('mppr-impact').title=percentDisplay?'':fmtMoney(mppr);
    }
    $('mppr-disclosure').hidden=!isFuture(id) || Math.abs(mppr)<.005;
    if(isFuture(id)){
      const noCreditTotal=total-mppr;
      setText('no-mppr-value',percentDisplay?fmtPct(baseline?100*noCreditTotal/baseline:0):fmtMoneyTight(noCreditTotal));
      setText('no-mppr-percent',percentDisplay?'':`(${fmtPct(baseline?100*noCreditTotal/baseline:0)})`);
    }
    $('state-directory').hidden=state.scope.kind!=='state';
    if(state.scope.kind==='state')renderStateDirectory();
    state.lastRendered={...data,cf,rvu,m25,baseM25,mppr,total,percent:displayedPercent,rawPercent:percent,revenue,selectedRate,scenarioId:id};
  }
  function renderComparison(){
    const box=$('scenario-comparison');if(!state.summaryById.size)return;
    box.replaceChildren();const active=currentScenario();
    SCENARIOS.forEach((id,i)=>{
      const sum=state.summaryById.get(id);if(!sum)return;
      const button=document.createElement('button');button.type='button';
      button.className='comparison-row'+(id===active?' active':'')+(isFuture(id)?' future':'');
      button.setAttribute('aria-label',`${SHORT_LABELS[i]}: ${fmtPct(val(sum.total_percent_cut))} national payment change; select scenario`);
      const label=document.createElement('span');label.className='comparison-label';label.textContent=SHORT_LABELS[i];
      const shell=document.createElement('span');shell.className='comparison-bar-shell';
      const bar=document.createElement('span');bar.className='comparison-bar';bar.style.width=`${Math.min(100,Math.abs(val(sum.total_percent_cut))/23*100)}%`;shell.appendChild(bar);
      const number=document.createElement('span');number.className='comparison-value';number.textContent=fmtPct(val(sum.total_percent_cut));
      button.append(label,shell,number);
      button.addEventListener('click',()=>{
        if(i===0)switchMode('phased');else if(i===1)switchMode('full');else switchMode('future',[0,20,50,80][i-2]);
        $('results-section')?.scrollIntoView({behavior:'smooth',block:'start'});
      });box.appendChild(button);
    });
  }
  function setDisplay(mode){state.display=mode;document.body.classList.toggle('percent-only',mode==='percent');for(const [id,choice] of [['show-dollars','dollars'],['show-percent','percent']]){const btn=$(id);btn.classList.toggle('active',choice===mode);btn.setAttribute('aria-pressed',String(choice===mode));}render();}
  function resetSlider(){state.sliderCustomized=false;state.selectedRate=null;render();}
  function normalizeLegacyRows(rows){
    if(!Array.isArray(rows))throw new Error('Existing physician directory must be a JSON array.');
    const mapped=new Map();
    for(const r of rows){
      const npi=String(r.npi??'').trim();
      if(!state.indexByNpi.has(npi))continue;
      mapped.set(npi,{npi,provider_name:String(r.provider_name??'').trim(),practice_name:String(r.practice_name??'').trim(),state:String(r.state??'').trim().toUpperCase()});
    }
    return mapped;
  }
  function buildSearchResults(query){
    const norm=clean(query),words=norm.split(/\s+/).filter(Boolean);if(!words.length)return [];
    const out=[];
    if('national'.includes(norm)||'united states'.includes(norm)||norm==='us'||norm==='usa'||norm==='all')out.push({kind:'national',label:'All U.S. Dermatology Practices',secondary:'National total · 12,477 physicians'});
    for(const [code,name] of Object.entries(STATES)){
      const nameNorm=clean(name);if(words.every(w=>nameNorm.includes(w)||code.toLowerCase()===w)){
        const count=getStateMembers(code).length;
        out.push({kind:'state',code,label:`${name} (${code})`,secondary:`Statewide aggregate · ${fmtNum(count)} modeled physicians`});
      }
    }
    if(state.index){
      const matches=[];
      for(const p of state.index){
        const npi=String(p.npi),m=state.namesByNpi.get(npi);
        const hay=clean(`${m?.provider_name||''} ${m?.practice_name||''}`);
        const isMatch=/^\d+$/.test(norm)?npi.includes(norm):words.every(w=>hay.includes(w)||npi.includes(w));
        if(isMatch){matches.push({kind:'provider',npi,label:m?.provider_name||`NPI ${npi}`,secondary:`${m?.practice_name||'Dermatologist'} · ${npi}${m?.state?' · '+m.state:''}`});}
        if(matches.length>=9)break;
      }
      out.push(...matches);
    }
    // An explicit NPI lookup is always available even when the identity directory is unavailable.
    if(!out.length && /^\d{10}$/.test(norm) && state.indexByNpi.has(norm)) out.push({kind:'provider',npi:norm,label:`NPI ${norm}`,secondary:'Open physician profile'});
    return out.slice(0,14);
  }
  function hideSearch(){$('search-results').hidden=true;$('provider-search').setAttribute('aria-expanded','false');state.activeSuggestion=-1;}
  function drawSearch(){
    const query=$('provider-search').value.trim();const root=$('search-results');
    if(!query){hideSearch();return;}
    const items=buildSearchResults(query);state.searchResults=items;state.activeSuggestion=-1;root.replaceChildren();
    if(!items.length){const empty=document.createElement('div');empty.className='result-empty';empty.textContent='No matching physicians or states found.';root.appendChild(empty);}
    items.forEach((item,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='search-result';btn.id=`suggestion-${i}`;btn.setAttribute('role','option');btn.setAttribute('aria-selected','false');
      const title=document.createElement('span');title.className='result-title';title.textContent=item.label;
      const type=document.createElement('span');type.className='tag';type.textContent=item.kind==='national'?'NATIONAL':item.kind==='state'?'STATE':'NPI';
      const sub=document.createElement('span');sub.className='result-sub';sub.textContent=item.secondary;
      btn.append(title,type,sub);btn.addEventListener('click',()=>selectSearchItem(item));root.appendChild(btn);
    });
    root.hidden=false;$('provider-search').setAttribute('aria-expanded','true');
  }
  function selectSearchItem(item){
    if(item.kind==='national')setScope({kind:'national'});
    if(item.kind==='state')setScope({kind:'state',code:item.code});
    if(item.kind==='provider')setScope({kind:'provider',npi:item.npi});
  }
  function renderStateDirectory(){
    const code=state.scope.code,members=getStateMembers(code);
    $('state-list-count').textContent=`${fmtNum(members.length)} physicians`;
    const list=$('state-list');list.replaceChildren();
    const sorted=members.slice().sort((a,b)=>safeName(a).localeCompare(safeName(b)));
    for(const npi of sorted.slice(0,state.stateMoreCount)){
      const b=document.createElement('button');b.type='button';
      const name=document.createElement('span');name.textContent=safeName(npi);
      const n=document.createElement('small');n.textContent=npi;
      b.append(name,n);b.addEventListener('click',()=>setScope({kind:'provider',npi}));list.appendChild(b);
    }
    const more=$('state-more');more.hidden=state.stateMoreCount>=members.length;
    more.textContent=`Show more (${fmtNum(Math.max(0,members.length-state.stateMoreCount))} remaining)`;
  }
  function roundedRect(ctx,x,y,w,h,r=10){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){
    const words=String(text).split(/\s+/),lines=[];let line='';
    for(const word of words){const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width>maxWidth && line){lines.push(line);line=word;}else line=test;}
    if(line)lines.push(line);
    for(const [i,l] of lines.slice(0,maxLines).entries()){
      const output=(i===maxLines-1 && lines.length>maxLines)?l.slice(0,-2)+'…':l;
      ctx.fillText(output,x,y+i*lineHeight);
    }
    return y+Math.min(lines.length,maxLines)*lineHeight;
  }
  function shareScenarioDetails(scenarioId){
    const details={
      '2027_phased':['CY 2027 final rule','Phased practice expense'],
      'fully_implemented':['Hypothetical fully implemented PE','Current global periods'],
      'future_000_m25_only':['Hypothetical LN2 zero-day conversion','No RVU reduction'],
      'future_000_min20':['Hypothetical LN2 zero-day conversion','Minimum RVU reduction'],
      'future_000_mid50':['Hypothetical LN2 zero-day conversion','Medium RVU reduction'],
      'future_000_max80':['Hypothetical LN2 zero-day conversion','Maximum RVU reduction'],
    };
    return details[scenarioId]||['Dermatology Medicare payment model',''];
  }
  function makeShareCanvas(model,onlyPercent){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;
    const ctx=canvas.getContext('2d');
    const back=ctx.createLinearGradient(0,0,1080,1080);
    back.addColorStop(0,'#101b30');back.addColorStop(1,'#0a1425');
    ctx.fillStyle=back;ctx.fillRect(0,0,1080,1080);
    // Inset, padded 1080x1080 border makes the square stand out on social feeds.
    ctx.strokeStyle='#5d829b';ctx.lineWidth=3;roundedRect(ctx,34,34,1012,1012,23);ctx.stroke();
    ctx.strokeStyle='#263e55';ctx.lineWidth=1;roundedRect(ctx,45,45,990,990,19);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='alphabetic';
    ctx.fillStyle='#7fded6';ctx.font='800 31px system-ui,sans-serif';ctx.fillText('medicare-cuts.skin',540,115);
    ctx.fillStyle='#97adc3';ctx.font='700 21px system-ui,sans-serif';ctx.fillText('CY 2027  •  DERMATOLOGY MEDICARE PAYMENT MODEL',540,167);
    ctx.strokeStyle='#36546b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(130,196);ctx.lineTo(950,196);ctx.stroke();
    ctx.fillStyle='#f3f8fc';ctx.font='800 49px system-ui,sans-serif';
    const nameBottom=wrapCanvasText(ctx,model.scopeTitle,540,270,895,60,2);
    ctx.fillStyle='#afc2d3';ctx.font='25px system-ui,sans-serif';
    wrapCanvasText(ctx,model.scopeSubtitle,540,Math.max(338,nameBottom+6),890,33,2);
    ctx.fillStyle='#172a43';roundedRect(ctx,86,466,908,289,23);ctx.fill();
    ctx.strokeStyle='#49637a';ctx.lineWidth=1.5;roundedRect(ctx,86,466,908,289,23);ctx.stroke();
    ctx.fillStyle='#e5bec8';ctx.font='750 21px system-ui,sans-serif';ctx.fillText('NET PAYMENT CHANGE',540,524);
    ctx.fillStyle='#ff9ba9';ctx.font='850 98px system-ui,sans-serif';ctx.fillText(fmtPct(model.percent),540,641);
    ctx.fillStyle='#e9f5fb';
    if(onlyPercent){
      ctx.font='550 29px system-ui,sans-serif';
      ctx.fillText(`${fmtRemainingPct(100+model.percent)} of 2026 baseline remains`,540,705);
    }else{
      ctx.font='650 39px system-ui,sans-serif';
      ctx.fillText(`Net impact: ${fmtMoneyTight(model.total)}`,540,705);
      ctx.font='23px system-ui,sans-serif';ctx.fillStyle='#abc3d7';
      ctx.fillText(`2026 modeled baseline: ${fmtMoneyTight(model.baseline_2026_dollars,false)}`,540,802);
    }
    const [scenarioLine,reductionLine]=shareScenarioDetails(model.scenarioId);
    ctx.fillStyle='#e4eef6';ctx.font='700 26px system-ui,sans-serif';
    ctx.fillText(scenarioLine,540,onlyPercent?837:863);
    ctx.fillStyle='#b5c7d8';ctx.font='24px system-ui,sans-serif';
    ctx.fillText(reductionLine,540,onlyPercent?889:911);
    ctx.fillStyle='#86d8d1';ctx.font='23px system-ui,sans-serif';
    ctx.fillText(`Modifier 25 same-day rate: ${fmtRate(model.selectedRate)}`,540,onlyPercent?952:968);
    return canvas;
  }
  async function copyShareGraphic(){
    const model=state.lastRendered;if(!model){toast('Financial results are still loading.');return;}
    const onlyPercent=state.display==='percent';
    const canvas=makeShareCanvas(model,onlyPercent);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob){toast('Could not create share image.');return;}
    if(navigator.clipboard&&window.ClipboardItem){
      try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('Graphic copied to clipboard.');return;}catch(_){/* download fallback */}
    }
    const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;
    a.download=`CMS_2027_${model.scopeCode}_${model.scenarioId}_${onlyPercent?'percent':'dollars'}.png`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
    toast('Graphic downloaded as PNG.');
  }
  function wire(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
    document.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>switchMode('future',Number(b.dataset.rate))));
    $('show-dollars').addEventListener('click',()=>setDisplay('dollars'));
    $('show-percent').addEventListener('click',()=>setDisplay('percent'));
    $('national-reset').addEventListener('click',()=>setScope({kind:'national'}));
    $('reset-slider').addEventListener('click',resetSlider);
    $('mod25-slider').addEventListener('input',ev=>{if(state.sliderDefault===null||state.sliderDefault<=0)return;state.selectedRate=Number(ev.target.value);state.sliderCustomized=true;render();});
    $('share-button').addEventListener('click',copyShareGraphic);
    $('state-more').addEventListener('click',()=>{state.stateMoreCount+=24;renderStateDirectory();});
    const search=$('provider-search');search.addEventListener('input',drawSearch);
    search.addEventListener('keydown',ev=>{
      const buttons=[...$('search-results').querySelectorAll('button.search-result')];
      if(ev.key==='Escape'){hideSearch();return;}
      if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
        ev.preventDefault();if($('search-results').hidden)drawSearch();
        if(buttons.length){state.activeSuggestion=(state.activeSuggestion+(ev.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===state.activeSuggestion)));buttons[state.activeSuggestion].scrollIntoView({block:'nearest'});}return;
      }
      if(ev.key==='Enter'){
        const item=state.searchResults[state.activeSuggestion>=0?state.activeSuggestion:0];if(item){ev.preventDefault();selectSearchItem(item);}
      }
    });
    document.addEventListener('click',e=>{if(!e.target.closest('.search-section'))hideSearch();});
  }
  async function boot(){
    wire();updateModeButtons();
    try{
      const [national,manifest]=await Promise.all([readJSON(FILES.national),readJSON(FILES.manifest)]);
      if(!Array.isArray(national)||national.length!==6)throw new Error('National summary requires exactly six scenarios.');
      if(!Array.isArray(manifest)||manifest.length!==6)throw new Error('Scenario manifest requires exactly six scenarios.');
      const expected=new Set(SCENARIOS),actual=new Set(manifest.map(x=>x.scenario_id));
      if(expected.size!==actual.size||[...expected].some(s=>!actual.has(s)))throw new Error('Unexpected scenario manifest; do not publish results.');
      if(manifest.some(x=>x.model_version!==VERSION))throw new Error('Scenario manifest version mismatch.');
      state.national=national;state.manifest=manifest;state.summaryById=new Map(national.map(x=>[x.scenario_id,x]));
      renderComparison();render();
      // National results render before large directory data is downloaded.
      activateScenario(currentScenario());
    }catch(err){showError(`Failed to load national model: ${err.message}`);return;}
    try{
      const index=await readJSON(FILES.index);validateUnique(index,'Physician index');
      state.index=index;state.indexByNpi=new Map(index.map(x=>[String(x.npi),x]));
      render();
      // Try the existing GitHub file. Never reuse its old financial or percentile fields.
      try{
        const legacy=await readJSON(FILES.legacyIdentity);
        state.namesByNpi=normalizeLegacyRows(legacy);
        state.directoryReady=true;
        const matched=state.namesByNpi.size;
        if(matched<index.length){console.warn(`${index.length-matched} model NPIs not in existing provider_data.json. State totals are incomplete until identities are supplied.`);
          showError(`${fmtNum(index.length-matched)} modeled NPIs have no state/name match in the existing website data. National numbers are complete; statewide totals exclude unmatched records.`);
        }
      }catch(err){
        state.directoryReady=false;
        showError('Physician directory could not be loaded. National and NPI results work, but name/state searches require retaining the original directory file.');
      }
      render();
    }catch(err){showError(`Could not load physician index: ${err.message}`);}
  }
  document.addEventListener('DOMContentLoaded',boot);
  // Stable, read-only hooks for browser-based QA. No model assumptions hidden in tests.
  window.__CMS2027_QA__={getSnapshot:()=>({scenario:currentScenario(),scope:state.scope,model:state.lastRendered,nationalReady:!!state.national,identitiesLinked:state.namesByNpi.size,cachedScenarios:[...state.scenarioCache.keys()],error:state.error}),getStateMembers,buildSearchResults,makeShareCanvas:()=>state.lastRendered?makeShareCanvas(state.lastRendered,state.display==='percent'):null};
})();
