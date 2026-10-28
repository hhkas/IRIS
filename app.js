function start(D,KO,PASS){
KO=KO||{w:{},p:{}};
const R=D.R, S=D.S, V=D.V, N=D.N, C=D.C, P=D.P, U=D.U;
// row: [date,site,vendor,name,code,spec,unit,cur,qty,price,usd,recv,pr]
const isSAB=S.map(s=>/SAB/i.test(s));
// ===== 환율 · 기준 통화 =====
// 회사 시스템 환산 환율(연도별) + 2026-10-07 CBI 공식 환율 변경(1,320→1,520) 반영. [시작일, IQD per USD]
const FX=[[20150101,1166],[20160101,1182],[20210101,1458],[20220101,1450],[20230101,1300],[20250101,1320],[20261007,1520]];
const FX_FIX_FROM=20261007;
const EVENTS=[[20260228,'호르무즈 해협 봉쇄']]; // 차트에 표시할 주요 사건 // 이 날짜 이후 IQD 발주는 시스템 환율(1,320) 대신 1,520으로 USD 재환산
const fxAt=d=>{let v=FX[0][1];for(const [s,x] of FX){if(d>=s)v=x;else break}return v};
const n0=R.length, puU=new Float64Array(n0), puI=new Float64Array(n0), amU=new Float64Array(n0), amI=new Float64Array(n0), fxFix=new Uint8Array(n0);
R.forEach((r,i)=>{const q=r[8],fx=fxAt(r[0]);
  if(r[7]){ // IQD 발주: 원 단가 = IQD
    puI[i]=r[9]; amI[i]=r[9]*q;
    if(r[0]>=FX_FIX_FROM){amU[i]=amI[i]/fx;fxFix[i]=1}else amU[i]=r[10];
  }else{ // USD 발주: 원 단가 = USD, IQD는 발주 당시 환율로 환산
    amU[i]=r[10]; amI[i]=r[10]*fx; puI[i]=q>0?amI[i]/q:0;
  }
  puU[i]=q>0?amU[i]/q:0;
});
const BASE_KEY='bp-base';let CUR='IQD';try{const b=localStorage.getItem(BASE_KEY);if(b==='USD'||b==='IQD')CUR=b}catch(_){}
const pu=new Float64Array(n0); // 기준 통화 단가 (R[i][10]은 기준 통화 금액으로 덮어씀)
function setBase(c){CUR=c;const P_=c==='USD'?puU:puI,A_=c==='USD'?amU:amI;for(let i=0;i<n0;i++){pu[i]=P_[i];R[i][10]=A_[i]}}
setBase(CUR);
const isConv=i=>(R[i][7]?'IQD':'USD')!==CUR;
const yr=i=>Math.floor(R[i][0]/10000);
const minY=yr(0), maxY=yr(R.length-1);
const lastDate=R[R.length-1][0];
// searchable text per row (name|spec|code), cached by key
// ===== 한글 품명 (번역 사전: lib/ko_dict.json) =====
const koDisp=new Array(N.length).fill(''),koSrch=new Array(N.length).fill('');
N.forEach((n,i)=>{const low=n.toLowerCase().trim();const ph=KO.p[low];
  const ws=(low.match(/[a-z]{3,}/g)||[]).map(w=>KO.w[w]).filter(Boolean);
  const gloss=ws.map(s=>s.split(' ')[0]).join(' ');
  koDisp[i]=ph?ph.split(' ')[0]:(ws.length?gloss:'');
  koSrch[i]=[ph||'',ws.join(' '),gloss.replace(/\s+/g,''),ph?ph.replace(/\s+/g,''):''].join(' ').toLowerCase()});
const koName=i=>koDisp[i]||'';
const koTag=i=>koDisp[i]?` <span class="ko">${esc(koDisp[i])}</span>`:'';
const keyText=new Map(); const rowKey=new Array(R.length);
R.forEach((r,i)=>{const k=r[3]+'|'+r[5]+'|'+r[4]; rowKey[i]=k; if(!keyText.has(k)) keyText.set(k,(N[r[3]]+' '+P[r[5]]+' '+C[r[4]]+' '+koSrch[r[3]]).toLowerCase());});
const nameKey=N.map(n=>n.toLowerCase().replace(/\s+/g,' ').trim());

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtD=d=>{d=String(d);return d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)};
const f=(x,dg)=>{if(x==null||!isFinite(x))return '–';const a=Math.abs(x);if(dg==null)dg=a>=1000?0:a>=10?2:a>=1?2:3;return x.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:dg})};
const fUSD=x=>f(x,Math.abs(x)>=100?0:2);
const med=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
$('#meta').textContent=`${minY}–${maxY} · ${R.length.toLocaleString()}건 · 최종 ${fmtD(lastDate)}`;

/* ---------- routing ---------- */
const views=['search','vendors','quote','recurring','trend','spend','report','admin'];
function route(){let v=location.hash.slice(1);
  if(v.startsWith('item-')){const code=decodeURIComponent(v.slice(5));history.replaceState(null,'','#search');$('#q').value=code;y1.value=minY;y2.value=maxY;$('#sg').value='all';$('#cur').value='all';runSearch();v='search'}
  if(!views.includes(v))v='search';
  views.forEach(x=>{$('#v-'+x).hidden=x!==v});
  document.querySelectorAll('nav.tabs a').forEach(a=>a.setAttribute('aria-current',a.dataset.v===v?'page':'false'));$('#adminbtn').setAttribute('aria-current',v==='admin'?'page':'false');
  if(v==='vendors'&&!vInit){vInit=true;renderVendors()}
  if(v==='report'&&!rInit){rInit=true;renderReport()}
  if(v==='recurring'&&!rcInit){rcInit=true;renderRecurring()}
  if(v==='spend'&&!spInit){spInit=true;initSpend()}
  if(v==='trend'&&!tInit){tInit=true;renderTrend()}
}
window.addEventListener('hashchange',route);

/* ---------- shared: price chart ---------- */
function chart(idx,refMed){
  if(!idx.length)return '';
  const W=640,H=200,L=52,Rp=12,T=16,B=24;
  const ys=idx.map(i=>pu[i]).filter(v=>v>0); if(!ys.length)return '';
  let y0=0,y1=Math.max(...ys)*1.08; if(y1<=0)y1=1;
  const t0=Date.UTC(minY,0,1),t1=Date.UTC(maxY+1,0,1);
  const X=d=>{d=String(d);const t=Date.UTC(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6));return L+(t-t0)/(t1-t0)*(W-L-Rp)};
  const Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  const step=niceStep(y1/4); let g='';
  for(let v=0;v<=y1+1e-9;v+=step){const y=Y(v);g+=`<line class="grid" x1="${L}" x2="${W-Rp}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+3}" text-anchor="end">${f(v,step<1?2:0)}</text>`}
  for(let yy=minY;yy<=maxY;yy++){const x=X(yy*10000+101);g+=`<line class="grid" x1="${x}" x2="${x}" y1="${T}" y2="${H-B}"/>`;if((yy-minY)%(W<500?2:1)===0)g+=`<text x="${x+2}" y="${H-8}">${String(yy).slice(2)}</text>`}
  let m=''; if(isFinite(refMed)&&refMed>0){const y=Y(refMed);m=`<line class="med" x1="${L}" x2="${W-Rp}" y1="${y}" y2="${y}"/>`}
  let fxl='';FX.slice(1).forEach(([d,x],k)=>{const prev=FX[k][1];if(d<minY*10000||d>maxY*10000+1231)return;const xx=X(d);fxl+=`<line class="fxl" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"><title>${fmtD(d)} 환율 ${f(prev,0)}→${f(x,0)}</title></line><text class="fxt" x="${xx>W-Rp-30?xx-2:xx+2}" y="${T-4}" text-anchor="${xx>W-Rp-30?'end':'start'}">${f(x,0)}</text>`});
  EVENTS.forEach(([d,lb])=>{if(d<minY*10000||d>maxY*10000+1231)return;const xx=X(d);fxl+=`<line class="evl" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"><title>${fmtD(d)} ${lb}</title></line><text class="evt" x="${xx-2}" y="${H-B-4}" text-anchor="end">${lb}</text>`});
  let pts=''; idx.forEach(i=>{if(pu[i]<=0)return;const r=R[i];pts+=`<circle class="pt${isSAB[r[1]]?' sab':''}${isConv(i)?' cv':''}" cx="${X(r[0]).toFixed(1)}" cy="${Y(pu[i]).toFixed(1)}" r="3.6"><title>${fmtD(r[0])} · ${esc(V[r[2]])} · ${fUSD(pu[i])} ${CUR}${isConv(i)?' (환산)':''}</title></circle>`});
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="단가 추이">${g}<line class="axis" x1="${L}" x2="${W-Rp}" y1="${H-B}" y2="${H-B}"/>${fxl}${m}${pts}</svg>
  <div class="legend"><span><i style="background:var(--accent)"></i>SAB 외 현장</span><span><i style="background:var(--sab)"></i>SAB Airfield</span><span><i style="background:transparent;border:1.5px solid var(--accent)"></i>빈 점: ${CUR==='IQD'?'USD':'IQD'} 발주를 당시 환율로 환산</span><span>세로선: 환율 변경 · 주요 사건</span><span>단위: ${CUR} / 발주단위</span></div>`;
}
function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x||1)));const n=x/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}

/* ---------- shared: line table ---------- */
// flag: same code+unit+year, price >= 2x median of that year group
const yrMedKey=new Map();
function yearMedian(i){const r=R[i];const k=r[4]+'|'+r[6]+'|'+yr(i);if(yrMedKey.has(k))return yrMedKey.get(k);return NaN}
const prevOf=new Int32Array(R.length).fill(-1);{const lastIdx=new Map();R.forEach((r,i)=>{if(puU[i]<=0)return;const k=r[4]+'|'+r[6];if(lastIdx.has(k))prevOf[i]=lastIdx.get(k);lastIdx.set(k,i)})}
function buildYrMed(){yrMedKey.clear();const tmp=new Map();R.forEach((r,i)=>{if(pu[i]<=0)return;const k=r[4]+'|'+r[6]+'|'+yr(i);(tmp.get(k)||tmp.set(k,[]).get(k)).push(pu[i])});tmp.forEach((a,k)=>{if(a.length>=3)yrMedKey.set(k,med(a))})}
buildYrMed();

function lineTable(idx,opts={}){
  const lim=opts.limit||200; const rows=idx.slice(0,lim);
  let h=`<div class="tbl-wrap"><table><thead><tr><th>발주일</th><th>현장</th><th>거래처</th><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">발주수량</th><th class="r">발주단가 (원통화)</th><th class="r">${CUR} 단가</th><th class="r">입고</th><th>PR</th></tr></thead><tbody>`;
  rows.forEach(i=>{const r=R[i];const pv=prevOf[i];const hi=pv>=0&&puU[pv]>0&&puU[i]>=2*puU[pv];
    const rc=r[11]<r[8]?`<span class="chip warn" title="입고수량이 발주수량보다 적음">${f(r[11])}</span>`:f(r[11]);
    h+=`<tr><td class="num">${fmtD(r[0])}</td><td>${esc(S[r[1]])}${isSAB[r[1]]?' <span class="chip sab">SAB</span>':''}</td><td>${esc(V[r[2]])}</td><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(r[8])}</td><td class="r num">${f(r[9])} <span class="chip iqd">${r[7]?'IQD':'USD'}</span></td><td class="r num">${fUSD(pu[i])}${isConv(i)?' <span class="chip none" title="발주 당시 환율 '+f(fxAt(r[0]),0)+'로 환산">환산</span>':''}${fxFix[i]&&CUR==='USD'?' <span class="chip warn" title="회사 시스템은 1,320으로 환산. BP는 2026-10-07 이후 1,520 적용">1,520</span>':''}${hi?` <span class="chip chk" title="같은 해 같은 코드 직전 구매 단가의 2배 이상 (${fmtD(R[pv][0])}, ${esc(V[R[pv][2]])})">확인</span>`:''}</td><td class="r num">${rc}</td><td class="mono hint">${esc(r[12])}</td></tr>`});
  h+='</tbody></table></div>';
  if(idx.length>lim)h+=`<div class="more"><button class="ghost" type="button" data-more="${lim+300}">${(idx.length-lim).toLocaleString()}건 더 보기</button></div>`;
  return h;
}

/* ---------- 기준 통화 전환 ---------- */
function updMeta(){const age=Math.floor((Date.now()-Date.UTC(Math.floor(lastDate/10000),Math.floor(lastDate/100)%100-1,lastDate%100))/864e5);
  $('#meta').innerHTML=`${R.length.toLocaleString()}건 · 데이터 기준일 <b>${fmtD(lastDate)}</b>${age>45?`<span class="stale" title="마지막 구매 데이터가 ${age}일 전입니다. 최근 구매가 빠져 있을 수 있습니다.">${age}일 지남 · 갱신 필요</span>`:''}`;$('#base').value=CUR}
$('#base').addEventListener('change',()=>{setBase($('#base').value);try{localStorage.setItem(BASE_KEY,CUR)}catch(_){}
  buildYrMed();vStats=null;vSel=null;vInit=false;rcInit=false;spInit=false;
  const keepSel=sSel,keepCode=sCode;runSearch();if(sGroups[keepSel]){selectGroup(keepSel);if(keepCode!=null){sCode=keepCode;renderDetail()}}
  runQuote();route();});
/* ---------- 즐겨찾기 · 최근 검색 · 링크 ---------- */
const lsGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(_){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
let favs=lsGet('bp-fav',[]),recents=lsGet('bp-recent',[]);
const isFav=c=>favs.includes(c);
function toggleFav(c){favs=isFav(c)?favs.filter(x=>x!==c):[c,...favs].slice(0,40);lsSet('bp-fav',favs);renderChips()}
function addRecent(q){q=q.trim();if(q.length<2)return;recents=[q,...recents.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,8);lsSet('bp-recent',recents);renderChips()}
function renderChips(){
  const el=$('#qchips');if(!el)return;let h='';
  if(favs.length)h+=`<span class="hint">★ 즐겨찾기</span>`+favs.map(c=>{const ci=codeIdx.get(c.toLowerCase());const r=ci!=null?lastRowOf(ci):null;return r?`<button class="chipbtn" type="button" data-go="${esc(c)}" title="${esc(C[ci]+' · '+P[r[5]])}">${esc(N[r[3]])} <span class="hint">${esc(P[r[5]]).slice(0,18)}</span></button>`:''}).join('');
  if(recents.length)h+=`<span class="hint" style="margin-left:${favs.length?'10px':'0'}">최근 검색</span>`+recents.map(q=>`<button class="chipbtn" type="button" data-rq="${esc(q)}">${esc(q)}</button>`).join('');
  el.innerHTML=h;el.hidden=!h;
}
$('#qchips').addEventListener('click',ev=>{const g=ev.target.closest('[data-go]'),r=ev.target.closest('[data-rq]');if(g)gotoCode(g.dataset.go);if(r){$('#q').value=r.dataset.rq;runSearch()}});
function copyLink(code,btn){const url=location.origin+location.pathname+'#item-'+code;const done=()=>{const o=btn.textContent;btn.textContent='복사됨';setTimeout(()=>btn.textContent=o,1500)};
  if(navigator.clipboard)navigator.clipboard.writeText(url).then(done,()=>{prompt('링크',url)});else prompt('링크',url)}
/* ---------- 자동완성 · 오타 보정 ---------- */
const nameCnt=new Map();R.forEach(r=>nameCnt.set(r[3],(nameCnt.get(r[3])||0)+1));
const nameList=[...nameCnt.entries()].map(([ni,c])=>({ni,c,t:(N[ni]+' '+koSrch[ni]).toLowerCase()})).sort((a,b)=>b.c-a.c);
let sugSel=-1,sugItems=[];
function showSug(){const q=$('#q').value.toLowerCase().trim(),el=$('#qsug');const tk=q.split(/\s+/).filter(Boolean);
  if(!tk.length){el.hidden=true;return}
  const res=tk.map(w=>/[\uac00-\ud7a3]/.test(w)?null:new RegExp('(^|[^a-z0-9])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  sugItems=[];for(const x of nameList){if(tk.every((w,k)=>res[k]?res[k].test(x.t):x.t.includes(w))){sugItems.push(x);if(sugItems.length>=8)break}}
  if(!sugItems.length||(sugItems.length===1&&N[sugItems[0].ni].toLowerCase()===q)){el.hidden=true;return}
  sugSel=-1;el.innerHTML=sugItems.map((x,k)=>`<li role="option" data-s="${k}">${esc(N[x.ni])}${koTag(x.ni)}<span class="hint" style="float:right">${x.c}건</span></li>`).join('');el.hidden=false}
function pickSug(k){const x=sugItems[k];if(!x)return;$('#q').value=N[x.ni];$('#qsug').hidden=true;runSearch()}
$('#qsug').addEventListener('mousedown',ev=>{const li=ev.target.closest('li[data-s]');if(li){ev.preventDefault();pickSug(+li.dataset.s)}});
$('#q').addEventListener('keydown',ev=>{const el=$('#qsug');if(el.hidden)return;const lis=el.querySelectorAll('li');
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();sugSel=(sugSel+(ev.key==='ArrowDown'?1:-1)+lis.length)%lis.length;lis.forEach((li,k)=>li.classList.toggle('on',k===sugSel))}
  else if(ev.key==='Enter'&&sugSel>=0){ev.preventDefault();pickSug(sugSel)}else if(ev.key==='Escape')el.hidden=true});
$('#q').addEventListener('blur',()=>setTimeout(()=>{$('#qsug').hidden=true},150));
function correctTokens(tk){let changed=false;const out=tk.map(w=>{if(w.length<4||/\d/.test(w)||/[\uac00-\ud7a3]/.test(w))return w;const n=toks(w)[0]||w;if(tokCodes.has(n))return w;
  let best=null,bd=9;const lim=w.length>=7?2:1;for(const v of tokCodes.keys()){if(v[0]!==w[0]||Math.abs(v.length-w.length)>lim)continue;const d=lev(w,v);if(d<bd||(d===bd&&best&&tokCodes.get(v).length>tokCodes.get(best).length)){bd=d;best=v}}
  if(best&&bd<=lim){changed=true;return best}return w});return changed?out:null}
/* ---------- 통합 검색 ---------- */
const y1=$('#y1'),y2=$('#y2');
for(let y=minY;y<=maxY;y++){y1.add(new Option(y,y));y2.add(new Option(y,y))}
y1.value=minY;y2.value=maxY;
let sGroups=[],sSel=null,sCode=null,sLimit=200;
function filterRow(i,sg,cur,a,b){const r=R[i];const y=yr(i);if(y<a||y>b)return false;if(sg==='bncp'&&isSAB[r[1]])return false;if(sg==='sab'&&!isSAB[r[1]])return false;if(cur!=='all'&&String(r[7])!==cur)return false;return true}
let recT;
function runSearch(fix){
  let toks=fix||$('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  const a=+y1.value,b=+y2.value,sg=$('#sg').value,cur=$('#cur').value;
  const okKey=new Map();const g=new Map();
  if(toks.length){
    for(let i=0;i<R.length;i++){
      const k=rowKey[i];let ok=okKey.get(k);if(ok===undefined){const t=keyText.get(k);ok=toks.every(x=>t.includes(x));okKey.set(k,ok)}
      if(!ok||!filterRow(i,sg,cur,a,b))continue;
      const nk=nameKey[R[i][3]];let e=g.get(nk);if(!e){e={name:N[R[i][3]],ni:R[i][3],idx:[],codes:new Set(),vend:new Set()};g.set(nk,e)}
      e.idx.push(i);e.codes.add(R[i][4]);e.vend.add(R[i][2]);
    }
  }
  sGroups=[...g.values()].sort((x,y)=>y.idx.length-x.idx.length);
  const tot=sGroups.reduce((s,e)=>s+e.idx.length,0);
  if(!sGroups.length&&toks.length&&!fix){const fx2=correctTokens(toks);if(fx2){runSearch(fx2);$('#gcount').textContent+=` · "${toks.join(' ')}" → "${fx2.join(' ')}"로 찾음`;return}}
  $('#gcount').textContent=toks.length?`${sGroups.length}개 품명 · ${tot.toLocaleString()}건`:'';
  clearTimeout(recT);if(sGroups.length)recT=setTimeout(()=>addRecent($('#q').value),1500);
  const ul=$('#glist');
  if(!toks.length){ul.innerHTML='<li class="empty" style="display:block;cursor:default">검색어를 입력하세요.</li>';$('#detail').innerHTML='<div class="pb"><div class="empty">검색어를 입력하세요.</div></div>';return}
  if(!sGroups.length){ul.innerHTML='<li class="empty" style="display:block;cursor:default">결과가 없습니다. 철자나 조건을 바꿔 보세요.</li>';$('#detail').innerHTML='<div class="pb"><div class="empty">결과 없음</div></div>';return}
  ul.innerHTML=sGroups.slice(0,400).map((e,k)=>{const last=e.idx[e.idx.length-1];return `<li role="option" tabindex="0" data-k="${k}"><span class="gn">${esc(e.name)}${koTag(e.ni)}</span><span class="gp num">${fUSD(pu[last])}</span><span class="gm">${e.idx.length}건 · 코드 ${e.codes.size} · 업체 ${e.vend.size} · 최근 ${fmtD(R[last][0])}</span></li>`}).join('');
  selectGroup(0);
}
function selectGroup(k){
  sSel=k;sCode=null;sLimit=200;
  document.querySelectorAll('#glist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.k===k)));
  renderDetail();
}
function renderDetail(){
  const e=sGroups[sSel];if(!e)return;
  // by code+spec+unit
  const m=new Map();e.idx.forEach(i=>{const r=R[i];const k=r[4]+'|'+r[5]+'|'+r[6];let x=m.get(k);if(!x){x={code:r[4],spec:r[5],unit:r[6],idx:[]};m.set(k,x)}x.idx.push(i)});
  const subs=[...m.values()].sort((a,b)=>b.idx.length-a.idx.length);
  const show=sCode==null?e.idx:subs[sCode].idx;
  const prices=show.map(i=>pu[i]).filter(v=>v>0);const md=med(prices);
  const last=show[show.length-1];
  const vend=new Map();show.forEach(i=>{const v=R[i][2];const x=vend.get(v)||{n:0,usd:0,p:[],last:0};x.n++;x.usd+=R[i][10];if(pu[i]>0)x.p.push(pu[i]);x.last=Math.max(x.last,R[i][0]);vend.set(v,x)});
  const vrows=[...vend.entries()].sort((a,b)=>b[1].n-a[1].n);
  const ord=[...show].reverse();
  const shareCode=sCode!=null?subs[sCode].code:subs[0].code;
  let h=`<div class="ph"><h3>${esc(e.name)}${koTag(e.ni)}</h3><div class="row" style="gap:6px"><span class="hint">${sCode==null?'전체 규격':esc(C[subs[sCode].code])+' · '+esc(P[subs[sCode].spec])+' · '+esc(U[subs[sCode].unit])}</span><button class="ghost sm" type="button" id="sharebtn" data-code="${esc(C[shareCode])}" title="이 품목을 바로 여는 링크를 복사합니다">링크 복사</button></div></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">`;
  if(sCode==null&&subs.length>1)h+=`<div class="note"><b>규격·단위가 ${subs.length}가지</b> 섞여 있습니다. 단가는 아래 표에서 규격을 하나 골라서 비교하세요.</div>`;
  h+=`<div class="stats">
    <div class="stat"><div class="k">발주 건수</div><div class="v">${show.length.toLocaleString()}</div><div class="s">${fmtD(R[show[0]][0]).slice(0,7)} ~ ${fmtD(R[last][0]).slice(0,7)}</div></div>
    <div class="stat"><div class="k">최근 구매 단가</div><div class="v">${fUSD(pu[last])}</div><div class="s">${fmtD(R[last][0])} · ${esc(V[R[last][2]]).slice(0,22)}</div></div>
    ${(()=>{const pv=show.length>1?show[show.length-2]:-1;if(pv<0||sCode==null&&subs.length>1)return `<div class="stat"><div class="k">직전 구매 대비</div><div class="v">–</div><div class="s">${sCode==null&&subs.length>1?'규격을 하나 고르면 표시':'직전 구매 없음'}</div></div>`;const ch=(pu[last]/pu[pv]-1)*100;return `<div class="stat"><div class="k">직전 구매 대비</div><div class="v">${ch>0?'+':''}${f(ch,1)}%</div><div class="s">직전 ${fUSD(pu[pv])} · ${fmtD(R[pv][0])}</div></div>`})()}
    <div class="stat"><div class="k">최저 / 최고</div><div class="v">${fUSD(Math.min(...prices))} / ${fUSD(Math.max(...prices))}</div><div class="s">${CUR} 기준</div></div>
    <div class="stat"><div class="k">총 발주액</div><div class="v">${fUSD(show.reduce((s,i)=>s+R[i][10],0))}</div><div class="s">${CUR} 기준</div></div>
  </div>`;
  h+=chart(show,NaN);
  h+=`<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>규격별</b>${sCode!=null?'<button class="ghost" type="button" id="allspec">전체 규격 보기</button>':''}</div><div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>규격</th><th>단위</th><th class="r">건수</th><th class="r">최저</th><th class="r">최고</th><th class="r">최근 단가</th><th>최근 업체</th><th>최근 발주</th><th>★</th></tr></thead><tbody>`;
  subs.forEach((s,k)=>{const p=s.idx.map(i=>pu[i]).filter(v=>v>0);const l=s.idx[s.idx.length-1];h+=`<tr class="click${sCode===k?' sel':''}" data-sub="${k}" tabindex="0"><td class="mono">${esc(C[s.code])}</td><td class="wrap-cell">${esc(P[s.spec])}</td><td>${esc(U[s.unit])}</td><td class="r num">${s.idx.length}</td><td class="r num">${fUSD(Math.min(...p))}</td><td class="r num">${fUSD(Math.max(...p))}</td><td class="r num">${fUSD(pu[l])}</td><td>${esc(V[R[l][2]])}</td><td class="num">${fmtD(R[l][0])}</td><td><button class="star${isFav(C[s.code])?' on':''}" type="button" data-fav="${esc(C[s.code])}" title="즐겨찾기" aria-label="즐겨찾기">${isFav(C[s.code])?'★':'☆'}</button></td></tr>`});
  h+=`</tbody></table></div></div>`;
  h+=`<div><b style="display:block;margin-bottom:6px">거래처별</b><div class="tbl-wrap"><table><thead><tr><th>거래처</th><th class="r">건수</th><th class="r">중앙 단가</th><th class="r">발주액 (${CUR})</th><th>최근 거래</th></tr></thead><tbody>`;
  vrows.forEach(([v,x])=>{h+=`<tr><td>${esc(V[v])}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(med(x.p))}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${fmtD(x.last)}</td></tr>`});
  h+=`</tbody></table></div></div>`;
  h+=`<div><b style="display:block;margin-bottom:6px">발주 내역 <span class="hint">최신순</span></b>${lineTable(ord,{limit:sLimit})}</div></div>`;
  const el=$('#detail');el.innerHTML=h;
  el.querySelectorAll('[data-fav]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();toggleFav(b.dataset.fav);renderDetail()});
  const sb=el.querySelector('#sharebtn');if(sb)sb.onclick=()=>copyLink(sb.dataset.code,sb);
  el.querySelectorAll('tr[data-sub]').forEach(tr=>{const go=()=>{sCode=+tr.dataset.sub;sLimit=200;renderDetail()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const ab=el.querySelector('#allspec');if(ab)ab.onclick=()=>{sCode=null;renderDetail()};
  const mb=el.querySelector('[data-more]');if(mb)mb.onclick=()=>{sLimit=+mb.dataset.more;renderDetail()};
}
$('#glist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-k]');if(li)selectGroup(+li.dataset.k)});
$('#glist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-k]');if(li&&ev.key==='Enter')selectGroup(+li.dataset.k)});
let st;$('#q').addEventListener('input',()=>{showSug();clearTimeout(st);st=setTimeout(()=>runSearch(),220)});
['#y1','#y2','#sg','#cur'].forEach(s=>$(s).addEventListener('change',runSearch));

/* ---------- 거래처 ---------- */
let vInit=false,vStats=null,vSel=null,vLimit=200;
let vTot=1;
function buildV(){vTot=R.reduce((s,r)=>s+r[10],0)||1;vStats=V.map((name,id)=>({id,name,n:0,usd:0,first:99999999,last:0,idx:[],codes:new Set(),years:{}}));
  R.forEach((r,i)=>{const s=vStats[r[2]];s.n++;s.usd+=r[10];s.first=Math.min(s.first,r[0]);s.last=Math.max(s.last,r[0]);s.idx.push(i);s.codes.add(r[4]);const y=yr(i);s.years[y]=(s.years[y]||0)+r[10]})}
function renderVendors(){
  if(!vStats)buildV();
  const q=$('#vq').value.toLowerCase().trim();const so=$('#vsort').value;
  let L=vStats.filter(s=>!q||s.name.toLowerCase().includes(q));
  L.sort((a,b)=>so==='n'?b.n-a.n:so==='last'?b.last-a.last:b.usd-a.usd);
  $('#vcount').textContent=`${L.length}개사`;
  $('#vlist').innerHTML=L.map(s=>`<li role="option" tabindex="0" data-v="${s.id}" aria-selected="${s.id===vSel}"><span class="gn">${esc(s.name)}</span><span class="gp num">${fUSD(s.usd)}</span><span class="gm">${s.n.toLocaleString()}건 · 품목 ${s.codes.size} · ${String(s.first).slice(0,4)}–${String(s.last).slice(0,4)} · 전체의 ${f(s.usd/vTot*100,1)}%</span></li>`).join('')||'<li class="empty" style="display:block">해당 업체가 없습니다.</li>';
  if(vSel==null&&L.length)selectVendor(L[0].id);
}
function selectVendor(id){vSel=id;vLimit=200;document.querySelectorAll('#vlist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.v===id)));renderVDetail()}
function renderVDetail(){
  const s=vStats[vSel];const mx=Math.max(...Object.values(s.years),1);
  const items=new Map();s.idx.forEach(i=>{const r=R[i];const k=r[4]+'|'+r[6];let x=items.get(k);if(!x){x={i0:i,n:0,usd:0,p:[],last:0};items.set(k,x)}x.n++;x.usd+=r[10];if(pu[i]>0)x.p.push(pu[i]);x.last=r[0]});
  const top=[...items.values()].sort((a,b)=>b.usd-a.usd).slice(0,40);
  const sites=new Map();s.idx.forEach(i=>{const k=R[i][1];sites.set(k,(sites.get(k)||0)+R[i][10])});
  const ts=[...sites.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  let h=`<div class="ph"><h3>${esc(s.name)}</h3><span class="hint">${fmtD(s.first)} ~ ${fmtD(s.last)}</span></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">
  <div class="stats"><div class="stat"><div class="k">발주 라인</div><div class="v">${s.n.toLocaleString()}</div></div><div class="stat"><div class="k">품목(코드)</div><div class="v">${s.codes.size}</div></div><div class="stat"><div class="k">총 발주액</div><div class="v">${fUSD(s.usd)}</div><div class="s">${CUR} 기준</div></div><div class="stat"><div class="k">주요 현장</div><div class="v" style="font-size:13px;font-family:var(--font-body)">${esc(S[ts[0][0]])}</div><div class="s">${ts.length>1?'외 '+(sites.size-1)+'곳':''}</div></div></div>
  <div><b style="display:block;margin-bottom:6px">연도별 발주액 (${CUR})</b><div class="ybars">`;
  for(let y=minY;y<=maxY;y++){const v=s.years[y]||0;h+=`<div title="${y}: ${fUSD(v)} ${CUR}"><span class="b" style="height:${v?Math.max(2,v/mx*70):0}px"></span><span class="l">${String(y).slice(2)}</span></div>`}
  h+=`</div></div><div><b style="display:block;margin-bottom:6px">주요 품목 <span class="hint">발주액 상위 40 · 행을 누르면 통합 검색으로 이동</span></b><div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">건수</th><th class="r">중앙 단가</th><th class="r">발주액</th><th>최근</th></tr></thead><tbody>`;
  top.forEach(x=>{const r=R[x.i0];h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(med(x.p))}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${fmtD(x.last)}</td></tr>`});
  h+=`</tbody></table></div></div><div><b style="display:block;margin-bottom:6px">발주 내역 <span class="hint">최신순</span></b>${lineTable([...s.idx].reverse(),{limit:vLimit})}</div></div>`;
  const el=$('#vdetail');el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>{$('#q').value=tr.dataset.code;location.hash='search';runSearch()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const mb=el.querySelector('[data-more]');if(mb)mb.onclick=()=>{vLimit=+mb.dataset.more;renderVDetail()};
}
$('#vlist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-v]');if(li)selectVendor(+li.dataset.v)});
$('#vlist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-v]');if(li&&ev.key==='Enter')selectVendor(+li.dataset.v)});
$('#vq').addEventListener('input',()=>{vSel=null;renderVendors()});
$('#vsort').addEventListener('change',renderVendors);

/* ---------- 견적 체크 ---------- */
const codeIdx=new Map();C.forEach((c,i)=>codeIdx.set(c.toLowerCase(),i));
// --- 자재코드 유사도 매칭 (품명 + 규격 토큰, IDF 가중) ---
const STOP=new Set(['size','type','pcs','pc','ea','with','for','and','the','of','made','color','colour','new','original','x','no','item','model','brand','qty','unit','per','each','set','piece','pieces','local','general']);
const AR_DIG='٠١٢٣٤٥٦٧٨٩',FA_DIG='۰۱۲۳۴۵۶۷۸۹';
const normDigits=s=>String(s).replace(/[٠-٩]/g,d=>AR_DIG.indexOf(d)).replace(/[۰-۹]/g,d=>FA_DIG.indexOf(d)).replace(/٫/g,'.').replace(/٬/g,',');
function toks(s){
  s=normDigits(s).toLowerCase().replace(/(\d)\s+(mm|cm|m|w|v|kg|g|l|ltr|inch|in|a|ah|kw|hp|ton|mm2)\b/g,'$1$2');
  return s.split(/[^a-z0-9\u0600-\u06ff\uac00-\ud7a3.]+/).map(t=>t.replace(/^\.+|\.+$/g,'')).filter(t=>t&&!STOP.has(t)&&!(t.length<2&&!/\d/.test(t))).map(t=>t.length>3&&/[a-z]s$/.test(t)&&!/ss$/.test(t)?t.slice(0,-1):t);
}
const codeTok=new Map(),codeCnt=new Map(),tokCodes=new Map();
R.forEach(r=>{const c=r[4];codeCnt.set(c,(codeCnt.get(c)||0)+1);let s=codeTok.get(c);if(!s){s=new Set();codeTok.set(c,s)}toks(N[r[3]]+' '+P[r[5]]+' '+koSrch[r[3]]).forEach(t=>s.add(t))});
codeTok.forEach((s,c)=>s.forEach(t=>{let a=tokCodes.get(t);if(!a){a=[];tokCodes.set(t,a)}a.push(c)}));
const nCodes=codeTok.size,idf=t=>{const a=tokCodes.get(t);return Math.log(1+nCodes/((a?a.length:0)+1))};
function suggest(text,k=4){
  const q=[...new Set(toks(text))];if(!q.length)return [];
  const tot=q.reduce((s,t)=>s+idf(t),0);const sc=new Map();
  q.forEach(t=>{const w=idf(t);(tokCodes.get(t)||[]).forEach(c=>sc.set(c,(sc.get(c)||0)+w))});
  return [...sc.entries()].map(([c,s])=>{const dl=codeTok.get(c).size;return {c,s:s/tot,p:s/tot-0.004*Math.max(0,dl-q.length)}})
    .filter(x=>x.s>=0.34).sort((a,b)=>b.p-a.p||(codeCnt.get(b.c)-codeCnt.get(a.c))).slice(0,k);
}
const lastRowOf=c=>{for(let i=R.length-1;i>=0;i--)if(R[i][4]===c)return R[i];return null};
const codeLabel=c=>{let best=null;for(let i=R.length-1;i>=0;i--){if(R[i][4]===c){best=R[i];break}}return best?`${C[c]} · ${N[best[3]]} · ${P[best[5]]} · ${U[best[6]]}`:C[c]};
const lblCache=new Map();const lbl=c=>{if(!lblCache.has(c))lblCache.set(c,codeLabel(c));return lblCache.get(c)};

// --- 견적 품목 모델 ---
let qItems=[];
const UNIT_MAP={pcs:'EA',pc:'EA',piece:'EA',pieces:'EA',ea:'EA',each:'EA',nos:'EA',no:'EA',set:'SET',sets:'SET',roll:'ROLL',rolls:'ROLL',box:'BOX',boxes:'BOX',kg:'KG',m:'M',mtr:'M',meter:'M',l:'L',ltr:'L',liter:'L',litre:'L',ton:'TON',tons:'TON',bag:'BAG',bags:'BAG',drum:'DRUM',can:'CAN',pack:'PACK',pkt:'PACK',btl:'BTL',bottle:'BTL',m3:'M3',lot:'LOT',pair:'PAIR',prs:'PAIR'};
function mkItem(o){
  const it={use:true,item:'',price:NaN,cur:'IQD',unit:'',qty:'',vendor:'',src:'',code:null,cands:[],...o};
  const m=it.item.match(/\b([0-9]{10}|[A-Z]{3}[A-Z0-9]{3}\d{4})\b/);
  const ci=m?codeIdx.get(m[1].toLowerCase()):codeIdx.get(it.item.trim().toLowerCase());
  if(ci!=null){it.cands=[{c:ci,s:1}];it.code=ci;if(/^\s*[A-Za-z0-9]{10}\s*$/.test(it.item)){const r=lastRowOf(ci);if(r)it.item=`${N[r[3]]} ${P[r[5]]}`.trim()}}else{it.cands=suggest(it.item);it.code=it.cands.length?it.cands[0].c:-1}
  return it;
}
function parseTextLines(text){
  return text.split(/\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    let parts=l.split('\t');if(parts.length<2){const m=l.match(/^(.*?)[\s,]+([\d.,]+)\s*(usd|iqd)?\s*(\S+)?$/i);parts=m?[m[1],m[2],m[3]||'',m[4]||'']:[l]}
    const cur=(parts[2]||'').trim().toUpperCase(),price=parseFloat(String(parts[1]||'').replace(/,/g,''));
    return mkItem({item:(parts[0]||'').trim(),price,cur:cur==='USD'||cur==='IQD'?cur:(price>=250?'IQD':'USD'),unit:(parts[3]||'').trim().toUpperCase(),qty:(parts[4]||'').trim(),vendor:($('#qvendor')&&$('#qvendor').value.trim())||'직접 입력',src:'직접 입력'});
  });
}
// 견적서 줄 → 품목 (OCR · PDF 텍스트 공통)
const SKIP=/(\bco\.|company|trading|\bltd\b|\bllc\b|شركة|sub\s*-?total|grand\s*total|^total|total\s*amount|net\s*amount|vat|tax|discount|validity|payment|delivery|tel|phone|mobile|e-?mail|www\.|p\.?o\.?\s*box|quotation\s*no|date|المجموع|الاجمالي|الإجمالي|المبلغ|الخصم|التاريخ|هاتف)/i;
function docCurrency(text){const t=text.toLowerCase();const m=t.match(/currency\s*[:：]?\s*(iqd|usd|dinar|dollar)/);if(m)return /iqd|dinar/.test(m[1])?'IQD':'USD';
  const iq=(t.match(/iqd|i\.q\.d|dinar|دينار|د\.ع/g)||[]).length,us=(t.match(/usd|us\s*\$|dollar|دولار/g)||[]).length;return iq>us?'IQD':us>iq?'USD':null}
const lev=(a,b)=>{const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[b.length]};
const UNIT_FUZZ=['pcs','pair','roll','rolls','set','box','bag','kg','ltr','pc','ea','nos','drum','pack','each'];
function parseQuoteLines(lines,fname){
  const all=lines.join('\n'),dc=docCurrency(all),out=[];
  const NUM=/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const UNITW=/\b(pcs|pc|pieces?|ea|each|nos|sets?|rolls?|box(?:es)?|kg|mtr|meter|ltr|liter|litre|tons?|bags?|drums?|can|pack|pkt|btl|bottle|m3|lot|pairs?|prs)\b/i;
  lines.forEach(raw=>{
    let l=normDigits(raw).replace(/[|¦\[\]{}]/g,' ').replace(/\s+/g,' ').trim();
    if(l.length<4||SKIP.test(l))return;
    const nums=[];let m;NUM.lastIndex=0;while((m=NUM.exec(l))){nums.push({v:parseFloat(m[0].replace(/,/g,'')),s:m[0],off:m.index,end:m.index+m[0].length})}
    if(!nums.length||(l.match(/[A-Za-z؀-ۿ]/g)||[]).length<3)return;
    // 사양 숫자(36W, 8mm, 2" 등)는 가격 후보에서 제외
    let cand=nums.filter(n=>{const after=l.slice(n.end,n.end+4),before=l.slice(Math.max(0,n.off-2),n.off);return !(/^\s?(mm|cm|w\b|v\b|kg\b|kw|hp|ah\b|a\b|ltr\b|l\b|m\b|m2|m3|"|inch|t\b|x\b|×|\*)/i.test(after)||/[x×*]\s?$/.test(before)||/[A-Za-z]$/.test(before))});
    let start=0;
    if(cand.length>=2&&cand[0].off<4&&Number.isInteger(cand[0].v)&&cand[0].v<=300){start=cand[0].end;cand=cand.slice(1)} // 순번
    if(!cand.length)return;
    const alt=n=>/^\d{1,3}\.\d{3}$/.test(n.s)?[n.v,n.v*1000]:[n.v]; // OCR이 3,500을 3.500으로 읽는 경우
    let qty='',price=NaN,first=null;
    const ok=(a,b,c)=>c>0&&Math.abs(a*b-c)/c<0.02;
    outer:for(let i=0;i<cand.length;i++)for(let j=i+1;j<cand.length;j++)for(let k=j+1;k<cand.length;k++){
      for(const a of alt(cand[i]))for(const b of alt(cand[j]))for(const c of alt(cand[k])){
        if(ok(a,b,c)){qty=a;price=b;first=cand[i];break outer}
        if(ok(a,b*1000,c)){qty=a;price=b*1000;first=cand[i];break outer}}} // OCR이 4,200을 4.2로 읽은 경우
    if(isNaN(price)){
      if(cand.length>=3){price=cand[cand.length-2].v;qty=cand[cand.length-3].v;first=cand[cand.length-3]}
      else if(cand.length===2){const [a,b]=cand;if(Number.isInteger(a.v)&&a.v<=b.v){qty=a.v;price=b.v;first=a}else{price=a.v;first=a}}
      else{price=cand[0].v;first=cand[0]}
    }
    let desc=l.slice(start,first.off);
    let unit='';const um=desc.match(UNITW)||l.slice(first.off).match(UNITW);
    if(um){unit=UNIT_MAP[um[1].toLowerCase()]||um[1].toUpperCase();desc=desc.replace(new RegExp('\\b'+um[1]+'\\b\\s*$','i'),'')}
    desc=desc.replace(/^[\s.\-:#)]+|[\s.\-:,(»«>]+$/g,'').replace(/\s+/g,' ').trim();
    // OCR로 깨진 단위 단어(Paw, pes, Rol 등)가 품명 끝에 붙은 경우 제거
    for(let g=0;g<2;g++){const mm=desc.match(/(?:^|\s)[»>|]*\s*([A-Za-z]{2,5})$/);if(!mm)break;const w0=mm[1],w=w0.toLowerCase();if(/^[A-Z]{2,4}$/.test(w0)&&!UNIT_FUZZ.includes(w))break;
      const hit=UNIT_FUZZ.find(u=>u===w||lev(w,u)<=1&&Math.abs(w.length-u.length)<=1||(w.length<=3&&u.length>=4&&w[0]===u[0]&&lev(w,u)<=2));
      if(!hit)break;if(!unit)unit=UNIT_MAP[hit]||hit.toUpperCase();desc=desc.slice(0,desc.length-mm[0].length).replace(/[\s»>|]+$/,'').trim()}
    if((desc.match(/[A-Za-z؀-ۿ]/g)||[]).length<3)return;
    const lc=/iqd|دينار/i.test(l)?'IQD':/usd|\$/i.test(l)?'USD':null;
    out.push({item:desc,price,lc,unit,qty,src:fname+' · '+raw.trim().slice(0,90)});
  });
  // 문서 통화: 명시값 → 없으면 단가 크기로 다수결
  const dcur=dc||(out.filter(x=>x.price>=250).length>=out.length/2?'IQD':'USD');
  const withQty=out.filter(x=>x.qty!=='').length;
  return out.filter(x=>!(withQty>=2&&x.qty===''))
    .map(x=>{const cur=x.lc||dcur;const it=mkItem({item:x.item,price:x.price,cur,unit:x.unit,qty:x.qty,src:x.src});if(cur==='IQD'&&x.price<100)it.warn='IQD 단가가 너무 작습니다. 천 단위 구분이 잘못 읽혔는지 확인하세요.';return it});
}
// 엑셀 시트 → 품목
function parseSheet(rows,fname){
  rows=rows.map(r=>r.map(c=>c==null?'':normDigits(String(c)).trim()));
  let hi=-1,col={};
  for(let i=0;i<Math.min(rows.length,30);i++){const r=rows[i].map(c=>c.toLowerCase());
    const d=r.findIndex(c=>/(desc|item|material|name|product|البيان|المادة|الوصف|المواد)/.test(c)&&!/(no\.?$|code)/.test(c));
    const p=r.findIndex(c=>/(unit\s*price|u\.?\s*price|price|rate|سعر|السعر)/.test(c)&&!/total|amount|اجمالي|الإجمالي/.test(c));
    if(d>=0&&p>=0){hi=i;col={d,p,q:r.findIndex(c=>/(qty|quantity|الكمية|العدد)/.test(c)),u:r.findIndex(c=>/(^unit$|uom|الوحدة)/.test(c)),c:r.findIndex(c=>/(currency|cur|العملة)/.test(c))};break}}
  if(hi<0)return parseQuoteLines(rows.map(r=>r.filter(Boolean).join('  ')),fname);
  const dc=docCurrency(rows.slice(0,hi+1).flat().join(' ')+' '+rows.slice(hi).map(r=>r[col.p]).join(' '));
  const out=[];
  rows.slice(hi+1).forEach(r=>{const item=r[col.d];const price=parseFloat((r[col.p]||'').replace(/[^0-9.\-]/g,''));if(!item||!isFinite(price)||price<=0||SKIP.test(item))return;
    const cs=col.c>=0?r[col.c].toUpperCase():'';const cur=/IQD|دينار/.test(cs+r[col.p])?'IQD':/USD|\$/.test(cs+r[col.p])?'USD':(dc||(price>=250?'IQD':'USD'));
    const u=col.u>=0?(UNIT_MAP[r[col.u].toLowerCase()]||r[col.u].toUpperCase()):'';
    out.push(mkItem({item,price,cur,unit:u,qty:col.q>=0?r[col.q]:'',src:fname+' · '+rows[hi][col.d]+' 열'}))});
  return out;
}
// --- 라이브러리 지연 로드 ---
const abs=p=>new URL(p,location.href).href;
const loaded={};
function loadScript(src){if(!loaded[src])loaded[src]=new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error(src+' 를 불러오지 못했습니다.'));document.head.appendChild(s)});return loaded[src]}
let tessWorker=null,tessLang='';
// OCR 전처리: 확대 · 적응형 이진화(조명 얼룩 보정) · 표 테두리 선 제거
async function prepImg(src){
  let img=src;
  if(!(src instanceof HTMLCanvasElement)){const url=URL.createObjectURL(src);img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('이미지를 열 수 없습니다.'));i.src=url})}
  let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;const s=Math.min(3,Math.max(1,2200/Math.max(w,h)));
  w=Math.round(w*s);h=Math.round(h*s);const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d',{willReadFrequently:true});
  g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
  const d=g.getImageData(0,0,w,h),px=d.data,gray=new Float32Array(w*h),I=new Float64Array((w+1)*(h+1));
  for(let i=0;i<w*h;i++)gray[i]=0.299*px[i*4]+0.587*px[i*4+1]+0.114*px[i*4+2];
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=gray[y*w+x];I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+row}}
  const r=Math.max(8,Math.round(Math.min(w,h)/60)),bin=new Uint8Array(w*h);
  for(let y=0;y<h;y++){const y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1);
    const mean=(I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0])/((x1-x0)*(y1-y0));bin[y*w+x]=gray[y*w+x]<mean*0.88&&gray[y*w+x]<200?1:0}}
  const minH=Math.round(w*0.15),minV=Math.round(h*0.04),kill=new Uint8Array(w*h);
  for(let y=0;y<h;y++){let run=0;for(let x=0;x<=w;x++){if(x<w&&bin[y*w+x])run++;else{if(run>=minH)for(let k=x-run;k<x;k++)kill[y*w+k]=1;run=0}}}
  for(let x=0;x<w;x++){let run=0;for(let y=0;y<=h;y++){if(y<h&&bin[y*w+x])run++;else{if(run>=minV)for(let k=y-run;k<y;k++)kill[k*w+x]=1;run=0}}}
  for(let i=0;i<w*h;i++){const v=bin[i]&&!kill[i]?0:255;px[i*4]=px[i*4+1]=px[i*4+2]=v;px[i*4+3]=255}
  g.putImageData(d,0,0);if(img!==src&&img.src)URL.revokeObjectURL(img.src);return cv;
}
async function ocr(img,label){
  await loadScript('lib/tess/tesseract.min.js');
  const lang=$('#qara').checked?'eng+ara':'eng';
  if(!tessWorker||tessLang!==lang){if(tessWorker)await tessWorker.terminate();
    tessWorker=await Tesseract.createWorker(lang,1,{workerPath:abs('lib/tess/worker.min.js'),corePath:abs('lib/tess/core'),langPath:abs('lib/tess/lang'),gzip:true,
      logger:m=>{if(m.status)qStatus(`${label} · ${m.status==='recognizing text'?'글자 인식 중':m.status} ${m.progress?Math.round(m.progress*100)+'%':''}`)}});tessLang=lang}
  await tessWorker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
  qStatus(`${label} · 이미지 정리 중`);
  const {data}=await tessWorker.recognize(await prepImg(img));
  return data.text.split(/\n/);
}
async function readPdf(file){
  await loadScript('lib/pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc=abs('lib/pdf.worker.min.js');
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let lines=[],chars=0;
  for(let pg=1;pg<=pdf.numPages;pg++){const page=await pdf.getPage(pg);const tc=await page.getTextContent();
    const rows=new Map();tc.items.forEach(it=>{if(!it.str.trim())return;const y=Math.round(it.transform[5]/3);const a=rows.get(y)||[];a.push({x:it.transform[4],s:it.str});rows.set(y,a);chars+=it.str.length});
    [...rows.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,a])=>lines.push(a.sort((p,q)=>p.x-q.x).map(o=>o.s).join('  ')));}
  if(chars>=30)return lines;
  lines=[];for(let pg=1;pg<=pdf.numPages;pg++){qStatus(`${file.name} · 스캔 PDF ${pg}/${pdf.numPages}쪽 이미지 인식`);const page=await pdf.getPage(pg);const vp=page.getViewport({scale:2.2});
    const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;lines=lines.concat(await ocr(cv,`${file.name} ${pg}쪽`))}
  return lines;
}
function detectVendor(lines,fname){
  for(const l0 of lines.slice(0,15)){const l=String(l0).replace(/\s+/g,' ').trim();
    if(/(\bco\b\.?|company|trading|\bllc\b|\bltd\b|\best\b\.?|enterprise|group|شركة|مؤسسة)/i.test(l)&&!/(hanwha|bncp|quotation\s*no|to\s*:)/i.test(l)){
      const en=l.replace(/[\u0600-\u06ff]+/g,' ').replace(/[^A-Za-z0-9&.,()\-' ]/g,' ').replace(/\s+/g,' ').trim();return (en.length>=4?en:l).slice(0,40)}}
  return fname.replace(/\.[^.]+$/,'').slice(0,40);
}
async function readFile(file){
  const n=file.name.toLowerCase();let items=[],lines=[];
  if(/\.(xlsx|xls|csv)$/.test(n)){await loadScript('lib/xlsx.full.min.js');const wb=XLSX.read(await file.arrayBuffer());wb.SheetNames.forEach(s=>{const rows=XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1,raw:false});lines=lines.concat(rows.map(r=>r.filter(Boolean).join(' ')));items=items.concat(parseSheet(rows,file.name))})}
  else if(n.endsWith('.pdf')||file.type==='application/pdf'){lines=await readPdf(file);items=parseQuoteLines(lines,file.name)}
  else if(file.type.startsWith('image/')){lines=await ocr(file,file.name);items=parseQuoteLines(lines,file.name)}
  else throw new Error(file.name+': 지원하지 않는 형식입니다.');
  const vd=detectVendor(lines,file.name);items.forEach(it=>it.vendor=vd);return items;
}
const qStatus=s=>{$('#qstatus').textContent=s};
async function handleFiles(files){
  files=[...files];if(!files.length)return;let added=[],errs=[];
  for(const f of files){qStatus(`${f.name} 읽는 중…`);try{added=added.concat(await readFile(f))}catch(e){errs.push(e.message||String(e))}}
  if(added.length){if(qItems.length&&qItems[0].sample)qItems=[];qItems=qItems.concat(added)}
  qStatus(added.length?`${added.length}개 품목을 읽었습니다. 표에서 품명·단가·매칭 코드를 확인하세요.`+(errs.length?' 실패: '+errs.join(', '):''):(errs.length?errs.join(', '):'품목을 찾지 못했습니다. 사진이 흐리거나 표가 아닌 경우 직접 입력을 써 주세요.'));
  renderReview();if(added.length)runQuote();
}
const qf=$('#qfile'),qd=$('#qdrop');
qf.addEventListener('change',()=>{handleFiles(qf.files);qf.value=''});
['dragenter','dragover'].forEach(e=>qd.addEventListener(e,ev=>{ev.preventDefault();qd.classList.add('over')}));
['dragleave','drop'].forEach(e=>qd.addEventListener(e,ev=>{ev.preventDefault();qd.classList.remove('over')}));
qd.addEventListener('drop',ev=>handleFiles(ev.dataTransfer.files));
document.addEventListener('paste',ev=>{if(location.hash!=='#quote')return;const fs=[...(ev.clipboardData||{}).files||[]].filter(f=>f.type.startsWith('image/'));if(fs.length){ev.preventDefault();handleFiles(fs)}});
$('#qparse').onclick=()=>{const items=parseTextLines($('#qt').value);if(qItems.length&&qItems[0].sample)qItems=[];qItems=qItems.concat(items);renderReview();runQuote()};

// --- 확인 표 ---
function renderReview(){
  $('#qrcount').textContent=qItems.length?`${qItems.filter(x=>x.use).length} / ${qItems.length}개 사용`+(qItems[0]&&qItems[0].sample?' · 예시 데이터':''):'';
  if(!qItems.length){$('#qreview').innerHTML='<div class="empty">견적서 파일을 올리거나 직접 입력하면 품목이 여기에 표시됩니다.</div>';return}
  let h=`<div class="tbl-wrap"><table class="rv nosort"><thead><tr><th>사용</th><th>업체</th><th>견적 품명</th><th>수량</th><th>단가</th><th>통화</th><th>단위</th><th>매칭 자재코드</th><th></th></tr></thead><tbody>`;
  qItems.forEach((it,k)=>{
    const opts=it.cands.map(x=>`<option value="${x.c}"${x.c===it.code?' selected':''}>${esc(lbl(x.c))}${x.s<1?` (${Math.round(x.s*100)}%)`:''}</option>`).join('');
    h+=`<tr data-k="${k}"${it.use?'':' class="off"'}><td><input type="checkbox" data-f="use"${it.use?' checked':''} aria-label="사용"></td>
      <td style="width:150px"><input type="text" data-f="vendor" value="${esc(it.vendor)}" aria-label="업체"></td>
      <td class="w-item"><input type="text" data-f="item" value="${esc(it.item)}" aria-label="견적 품명">${it.src?`<div class="src">${esc(it.src)}</div>`:''}</td>
      <td style="width:70px"><input type="text" data-f="qty" value="${esc(it.qty)}" aria-label="수량"></td>
      <td style="width:110px"><input type="number" data-f="price" value="${isFinite(it.price)?it.price:''}" step="any" aria-label="단가"${it.warn?` class="warnin" title="${esc(it.warn)}"`:''}>${it.warn?'<div class="src" style="color:var(--warn)">단가 확인</div>':''}</td>
      <td style="width:80px"><select data-f="cur" aria-label="통화"><option${it.cur==='IQD'?' selected':''}>IQD</option><option${it.cur==='USD'?' selected':''}>USD</option></select></td>
      <td style="width:80px"><input type="text" data-f="unit" value="${esc(it.unit)}" aria-label="단위"></td>
      <td class="w-match"><select data-f="code" aria-label="매칭 자재코드">${opts}<option value="-1"${it.code===-1?' selected':''}>— 품명 키워드로 검색 —</option></select></td>
      <td><button class="ghost" type="button" data-del="${k}" title="행 삭제" aria-label="행 삭제">✕</button></td></tr>`});
  h+=`</tbody></table></div><div class="row" style="margin-top:8px"><button class="ghost" type="button" id="qadd">행 추가</button><button class="ghost" type="button" id="qclear">모두 지우기</button><span class="hint">품명을 고치면 매칭 후보를 다시 찾습니다. 퍼센트는 품명 일치도입니다.</span></div>`;
  $('#qreview').innerHTML=h;
}
let rvT;
$('#qreview').addEventListener('change',ev=>{const tr=ev.target.closest('tr[data-k]');if(!tr)return;const it=qItems[+tr.dataset.k],f=ev.target.dataset.f;
  if(f==='use')it.use=ev.target.checked;else if(f==='price'){it.price=parseFloat(ev.target.value);it.warn=''}else if(f==='code')it.code=+ev.target.value;else if(f==='unit')it.unit=ev.target.value.trim().toUpperCase();else if(f==='cur')it.cur=ev.target.value;else if(f==='qty')it.qty=ev.target.value;else if(f==='vendor')it.vendor=ev.target.value.trim();
  else if(f==='item'){Object.assign(it,mkItem({...it,item:ev.target.value}))}
  renderReview();runQuote()});
$('#qreview').addEventListener('click',ev=>{const d=ev.target.closest('[data-del]');if(d){qItems.splice(+d.dataset.del,1);renderReview();runQuote()}
  if(ev.target.id==='qadd'){qItems.push(mkItem({item:'',price:NaN}));renderReview()}
  if(ev.target.id==='qclear'){qItems=[];renderReview();runQuote()}});

// 예시
$('#qt').value=['Safety Shoes Labor 42\t25000\tIQD\tEA\t50','Fluorescent Lamp 36W\t5500\tIQD\tEA\t100','PP Rope 8mm\t36000\tIQD\tROLL\t15'].join('\n');
{const sa=[['Safety Shoes Labor 42',25000,50],['Fluorescent Lamp 36W',5500,100],['PP Rope 8mm',36000,15]],sb=[['Safety Shoes Labor 42',23500,50],['Fluorescent Lamp 36W',4800,100],['PP Rope 8mm',38000,15]];
 qItems=[...sa.map(([i,p,q])=>mkItem({item:i,price:p,qty:q,cur:'IQD',vendor:'예시 A업체',src:'예시'})),...sb.map(([i,p,q])=>mkItem({item:i,price:p,qty:q,cur:'IQD',vendor:'예시 B업체',src:'예시'}))].map(x=>({...x,sample:true}))}

let qCmp=null; // 마지막 비교 결과 (엑셀 내보내기용)
function lastPurchase(ci,unit,useUnit){
  const sg=$('#qsg').value,cmp=$('#qcmp').value;
  for(let i=R.length-1;i>=0;i--){const r=R[i];if(r[4]!==ci)continue;if(sg==='bncp'&&isSAB[r[1]])continue;if(sg==='sab'&&!isSAB[r[1]])continue;
    if(useUnit&&unit&&U[r[6]]!==unit)continue;if(cmp!=='all'&&r[7]!==(cmp==='IQD'?1:0))continue;if(pu[i]<=0)continue;return i}
  return -1;
}
function runQuote(){
  const fx=+$('#qfx').value||1520;
  const items=qItems.filter(x=>x.use&&x.item&&isFinite(x.price));
  if(!items.length){$('#qout').innerHTML='<div class="empty">체크할 품목이 없습니다. 견적서를 올리거나 직접 입력하세요.</div>';qCmp=null;return}
  const vendors=[...new Set(items.map(x=>x.vendor||'업체 미상'))];
  const toBase=(p,cur)=>cur===CUR?p:(cur==='IQD'?p/fx:p*fx);
  // 품목 묶기: 매칭 코드 우선, 없으면 품명
  const groups=new Map();
  items.forEach(it=>{const key=it.code!=null&&it.code>=0?'c'+it.code:'n'+toks(it.item).join(' ');let g=groups.get(key);
    if(!g){g={key,code:it.code>=0?it.code:null,item:it.item,unit:it.unit,qty:it.qty,q:{}};groups.set(key,g)}
    if(!g.unit&&it.unit)g.unit=it.unit;if(!g.qty&&it.qty)g.qty=it.qty;
    const v=it.vendor||'업체 미상',bp=toBase(it.price,it.cur);if(!g.q[v]||bp<g.q[v].bp)g.q[v]={bp,price:it.price,cur:it.cur}});
  const rows=[...groups.values()].map(g=>{
    let li=-1;if(g.code!=null){li=lastPurchase(g.code,(g.unit||'').toUpperCase(),false)}
    const last=li>=0?{i:li,p:pu[li],vendor:V[R[li][2]],date:R[li][0],orig:R[li][9],ocur:R[li][7]?'IQD':'USD',unit:U[R[li][6]]}:null;
    const qs=vendors.map(v=>g.q[v]||null);const best=Math.min(...qs.filter(Boolean).map(x=>x.bp));
    return {...g,last,qs,best,bestV:vendors[qs.findIndex(x=>x&&x.bp===best)]};
  });
  qCmp={vendors,rows,fx,cur:CUR,date:new Date()};
  const pct=(a,b)=>b>0?(a/b-1)*100:NaN;
  const pctHtml=v=>isFinite(v)?`<span class="chip ${v>10?'bad':v>0?'warn':'ok'}">${v>0?'+':''}${f(v,0)}%</span>`:'';
  let h=`<div class="tbl-wrap"><table><thead><tr><th>품목</th><th>단위</th><th class="r">수량</th><th>최근 구매 업체</th><th class="r">최근 구매 단가 (${CUR})</th><th>최근 구매일</th>${vendors.map(v=>`<th class="r">${esc(v)}<br><span class="hint">단가 (${CUR}) · 최근 구매 대비</span></th>`).join('')}<th>최저 견적</th></tr></thead><tbody>`;
  const tot=vendors.map(()=>0),totCnt=vendors.map(()=>0);
  rows.forEach(r=>{
    const lr=r.code!=null?lastRowOf(r.code):null;
    const name=r.code!=null&&lr?`<b>${esc(N[lr[3]])}</b> <span class="hint">${esc(P[lr[5]])}</span>${koName(lr[3])?`<br><span class="ko">${esc(koName(lr[3]))}</span>`:''}<br><span class="mono hint">${esc(C[r.code])}</span>`:`<b>${esc(r.item)}</b><br><span class="chip none">매칭 코드 없음</span>`;
    const L=r.last;
    h+=`<tr><td class="wrap-cell">${name}</td><td>${esc(r.unit||(L?L.unit:''))}${L&&r.unit&&L.unit!==r.unit?` <span class="chip warn" title="최근 구매 단위 ${esc(L.unit)}">단위 다름</span>`:''}</td><td class="r num">${esc(r.qty||'')}</td>
      <td>${L?esc(L.vendor):'<span class="chip none">구매 이력 없음</span>'}</td>
      <td class="r num">${L?fUSD(L.p):'–'}${L&&L.ocur!==CUR?`<br><span class="hint">${f(L.orig)} ${L.ocur}</span>`:''}</td>
      <td class="num">${L?fmtD(L.date):''}</td>
      ${r.qs.map((q,k)=>{if(!q)return '<td class="r hint">–</td>';const v=pct(q.bp,L?L.p:NaN);const isB=q.bp===r.best&&r.qs.filter(Boolean).length>1;
        const qn=parseFloat(String(r.qty).replace(/,/g,''));if(isFinite(qn)){tot[k]+=qn*q.bp;totCnt[k]++}
        return `<td class="r num${isB?' bestq':''}">${fUSD(q.bp)}${isB?' ✓':''}${q.cur!==CUR?`<br><span class="hint">${f(q.price)} ${q.cur}</span>`:''}<br>${pctHtml(v)}</td>`}).join('')}
      <td>${r.qs.filter(Boolean).length>1?esc(r.bestV):''}</td></tr>`;
  });
  if(totCnt.some(x=>x))h+=`<tr class="totrow"><td colspan="6"><b>합계</b> <span class="hint">수량이 있는 품목만</span></td>${tot.map((s,k)=>`<td class="r num"><b>${totCnt[k]?fUSD(s):'–'}</b></td>`).join('')}<td></td></tr>`;
  h+=`</tbody></table></div><p class="hint" style="margin:10px 0 0">최근 구매 단가는 같은 자재코드의 가장 최근 실제 발주 단가입니다 (${CUR} 기준, 다른 통화 발주는 발주 당시 환율로 환산). 변동 %는 각 견적 단가가 최근 구매 단가보다 얼마나 높거나 낮은지입니다. 견적 통화가 ${CUR}가 아니면 환율 ${f(fx,0)}로 바꿔 비교합니다. 매칭 코드는 품명 유사도로 고른 후보이니 확인 표에서 꼭 확인하세요.</p>`;
  $('#qout').innerHTML=h;
}
async function exportQuote(){
  if(!qCmp){qStatus('내보낼 비교 결과가 없습니다.');return}
  await loadScript('lib/xlsx.full.min.js');
  const {vendors,rows,fx,cur}=qCmp;const today=new Date().toISOString().slice(0,10);
  const head=['No','자재코드','품명','규격','단위','수량','최근 구매 업체','최근 구매일',`최근 구매 단가(${cur})`];
  vendors.forEach(v=>{head.push(`${v} 단가(${cur})`);head.push(`${v} 변동%`)});head.push('최저 견적 업체');
  const aoa=[[`견적 비교표 · BP Bismaya Purchase`],[`작성일 ${today} · 기준 통화 ${cur} · 견적 환산 환율 1 USD = ${fx} IQD · 구매이력 기준일 ${fmtD(lastDate)}`],[],head];
  rows.forEach((r,k)=>{const lr=r.code!=null?lastRowOf(r.code):null;const L=r.last;
    const line=[k+1,r.code!=null?C[r.code]:'',lr?N[lr[3]]:r.item,lr?P[lr[5]]:'',r.unit||(L?L.unit:''),r.qty||'',L?L.vendor:'이력 없음',L?fmtD(L.date):'',L?Math.round(L.p*100)/100:''];
    r.qs.forEach(q=>{line.push(q?Math.round(q.bp*100)/100:'');line.push(q&&L&&L.p>0?Math.round((q.bp/L.p-1)*1000)/10:'')});
    line.push(r.qs.filter(Boolean).length>1?r.bestV:'');aoa.push(line)});
  const raw=[['업체','견적 품명','수량','단가','통화','단위','매칭 자재코드','출처']].concat(qItems.filter(x=>x.use).map(x=>[x.vendor,x.item,x.qty,x.price,x.cur,x.unit,x.code>=0?C[x.code]:'',x.src]));
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=head.map((h,i)=>({wch:i===2?34:i===3?24:i>=8?14:12}));
  XLSX.utils.book_append_sheet(wb,ws,'견적비교');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(raw),'견적원문');
  XLSX.writeFile(wb,`견적비교_${today}.xlsx`);qStatus('엑셀 파일을 저장했습니다.');
}
$('#qexport').onclick=exportQuote;
$('#qrun').onclick=runQuote;['#qsg','#qcmp'].forEach(s=>$(s).addEventListener('change',runQuote));
renderReview();

/* ---------- 표 머리글 클릭 정렬 (모든 탭 공통) ---------- */
function cellKey(td){
  if(!td)return {t:2,v:''};
  const s=(td.innerText||'').trim();
  if(!s||s==='–')return {t:2,v:''};
  if(/^\d{4}-\d{2}(-\d{2})?/.test(s))return {t:1,v:s.slice(0,10)};
  const m=s.replace(/,/g,'').match(/^[+\-]?\d*\.?\d+/);
  if(m)return {t:0,v:parseFloat(m[0])};
  return {t:1,v:s.toLowerCase()};
}
document.addEventListener('click',ev=>{
  const th=ev.target.closest('main th');if(!th)return;
  const table=th.closest('table');if(!table||table.classList.contains('nosort'))return;
  const tb=table.tBodies[0];if(!tb)return;
  const col=th.cellIndex,rows=[...tb.rows].filter(r=>r.cells.length>col);
  if(rows.length<2)return;
  const firstNum=rows.some(r=>cellKey(r.cells[col]).t===0);
  const cur=th.dataset.sort;const dir=cur?(cur==='asc'?'desc':'asc'):(firstNum?'desc':'asc');
  table.querySelectorAll('th[data-sort]').forEach(x=>delete x.dataset.sort);th.dataset.sort=dir;
  const k=rows.map(r=>[r,cellKey(r.cells[col])]);
  k.sort((a,b)=>{const x=a[1],y=b[1];if(x.t===2&&y.t!==2)return 1;if(y.t===2&&x.t!==2)return -1;
    let c=x.t!==y.t?x.t-y.t:(x.t===0?x.v-y.v:String(x.v).localeCompare(String(y.v),'ko'));return dir==='asc'?c:-c});
  k.forEach(([r])=>tb.appendChild(r));
});

/* ---------- 고가 구매 리포트 ---------- */
let rInit=false,rRes=null,rSel=null;
const rc=$('#rcut');for(let y=minY;y<maxY-1;y++)rc.add(new Option(y+'년',y));rc.value=2016;
const GEN=/order product article|^sample$|^general$|^-$|^$/i;
function renderReport(){
  const cut=+rc.value,mul=+$('#rmul').value,minN=+$('#rmin').value,ex=$('#rex').value==='1';
  // 기준 = 기준 구간 이후 같은 코드·단위의 첫 실제 구매 단가 (R은 날짜순)
  const later=new Map();R.forEach((r,i)=>{if(yr(i)<=cut||puU[i]<=0)return;const k=r[4]+'|'+r[6];(later.get(k)||later.set(k,[]).get(k)).push(i)});
  const lm=new Map(),lfi=new Map();later.forEach((a,k)=>{if(a.length>=minN){lm.set(k,puU[a[0]]);lfi.set(k,a[0])}});
  const early=new Map();R.forEach((r,i)=>{if(yr(i)>cut||puU[i]<=0)return;if(ex&&GEN.test(P[r[5]].trim()))return;const k=r[4]+'|'+r[6];if(!lm.has(k))return;(early.get(k)||early.set(k,[]).get(k)).push(i)});
  const vend=new Map();let totPaid=0,totEx=0,nCodes=0;
  early.forEach((idx,k)=>{const em=med(idx.map(i=>puU[i]));const L=lm.get(k);if(em<mul*L)return;nCodes++;
    idx.forEach(i=>{const r=R[i];const exc=Math.max(0,puU[i]-L)*r[8];let v=vend.get(r[2]);if(!v){v={id:r[2],lines:0,codes:new Map(),paid:0,ex:0};vend.set(r[2],v)}
      v.lines++;v.paid+=amU[i];v.ex+=exc;totPaid+=amU[i];totEx+=exc;
      let c=v.codes.get(k);if(!c){c={i0:i,later:L,li:lfi.get(k),nl:later.get(k).length,q:0,paid:0,ex:0,p:[],idx:[]};v.codes.set(k,c)}c.q+=r[8];c.paid+=amU[i];c.ex+=exc;c.p.push(puU[i]);c.idx.push(i)})});
  rRes=[...vend.values()].sort((a,b)=>b.ex-a.ex);
  $('#rsum').textContent=`${nCodes}개 품목 · 초과 ${fUSD(totEx)} USD · USD 기준`;
  $('#rlist').innerHTML=rRes.map(v=>`<li role="option" tabindex="0" data-r="${v.id}" aria-selected="${v.id===rSel}"><span class="gn">${esc(V[v.id])}</span><span class="gp num">${fUSD(v.ex)}</span><span class="gm">${v.codes.size}개 품목 · ${v.lines}건 · 지급 ${fUSD(v.paid)} · 비중 ${f(v.ex/totEx*100,1)}%</span></li>`).join('')||'<li class="empty" style="display:block">조건에 맞는 품목이 없습니다.</li>';
  const keep=rRes.find(v=>v.id===rSel);selectR(keep?keep.id:(rRes[0]&&rRes[0].id));
}
function selectR(id){rSel=id;document.querySelectorAll('#rlist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.r===id)));
  const v=rRes&&rRes.find(x=>x.id===id);const el=$('#rdetail');if(!v){el.innerHTML='<div class="pb"><div class="empty">조건에 맞는 품목이 없습니다.</div></div>';return}
  const items=[...v.codes.values()].sort((a,b)=>b.ex-a.ex);
  let h=`<div class="ph"><h3>${esc(V[id])}</h3><span class="hint">~${rc.value}년 구매분</span></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">
  <div class="stats"><div class="stat"><div class="k">대상 품목</div><div class="v">${v.codes.size}</div></div><div class="stat"><div class="k">발주 라인</div><div class="v">${v.lines}</div></div><div class="stat"><div class="k">지급액 (USD)</div><div class="v">${fUSD(v.paid)}</div></div><div class="stat"><div class="k">초과 추정 (USD)</div><div class="v" style="color:var(--bad)">${fUSD(v.ex)}</div></div></div>
  <div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">수량</th><th class="r">당시 단가</th><th class="r">이후 첫 구매 단가</th><th class="r">배수</th><th class="r">이후 건수</th><th class="r">초과 추정</th></tr></thead><tbody>`;
  items.forEach(c=>{const r=R[c.i0];const em=med(c.p);h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(c.q)}</td><td class="r num">${fUSD(em)}</td><td class="r num">${fUSD(c.later)}<br><span class="hint">${fmtD(R[c.li][0])} · ${esc(V[R[c.li][2]]).slice(0,18)}</span></td><td class="r num">${f(em/c.later,1)}×</td><td class="r num">${c.nl}</td><td class="r num">${fUSD(c.ex)}</td></tr>`});
  h+=`</tbody></table></div><p class="hint" style="margin:0">행을 누르면 통합 검색에서 그 코드의 전체 이력과 단가 추이를 봅니다. 배수가 지나치게 크면(예: 10배 이상) 규격 혼용이나 단위 오입력일 수 있으니 이력에서 확인하세요.</p></div>`;
  el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>{$('#q').value=tr.dataset.code;y1.value=minY;y2.value=maxY;$('#sg').value='all';$('#cur').value='all';location.hash='search';runSearch()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
}
$('#rlist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-r]');if(li)selectR(+li.dataset.r)});
$('#rlist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-r]');if(li&&ev.key==='Enter')selectR(+li.dataset.r)});
['#rcut','#rmul','#rmin','#rex'].forEach(s=>$(s).addEventListener('change',renderReport));

/* ---------- 반복 구매 · 소요 예측 ---------- */
let rcInit=false,rcLimit=200;
const dnum=d=>{d=String(d);return Date.UTC(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6))/864e5};
const lastDay=dnum(lastDate);
const yearsAll=[];for(let y=minY;y<=maxY;y++)yearsAll.push(y);
function renderRecurring(){
  const toks=$('#rq').value.toLowerCase().split(/\s+/).filter(Boolean);
  const minYrs=+$('#rcy').value,sg=$('#rsg').value,rec=$('#rrec').value,so=$('#rso').value;
  const m=new Map();
  for(let i=0;i<R.length;i++){
    const r=R[i];if(sg==='bncp'&&isSAB[r[1]])continue;if(sg==='sab'&&!isSAB[r[1]])continue;
    if(toks.length){const t=keyText.get(rowKey[i]);if(!toks.every(x=>t.includes(x)))continue}
    const k=r[4]+'|'+r[6];let x=m.get(k);
    if(!x){x={i0:i,yq:{},yrs:new Set(),n:0,q12:0,q24:0,o12:0,usd12:0,last:-1,days:[],p3:[]};m.set(k,x)}
    const y=yr(i),age=lastDay-dnum(r[0]);
    x.yq[y]=(x.yq[y]||0)+r[8];x.yrs.add(y);x.n++;x.last=i;
    if(age<365){x.q12+=r[8];x.o12++;x.usd12+=r[10]}
    if(age<730)x.q24+=r[8];
    if(age<1095){x.days.push(dnum(r[0]));if(pu[i]>0)x.p3.push(pu[i])}
  }
  let L=[];
  m.forEach(x=>{
    if(x.yrs.size<minYrs)return;
    const age=lastDay-dnum(R[x.last][0]);
    if(rec!=='any'&&age>=(+rec)*30.5)return;
    const ds=[...new Set(x.days)].sort((a,b)=>a-b);let gap=NaN;
    if(ds.length>=2)gap=(ds[ds.length-1]-ds[0])/(ds.length-1);
    x.gap=gap;x.lp=pu[x.last];x.est=x.q12*x.lp;
    x.consec=[2024,2025,2026].every(y=>x.yrs.has(y));
    L.push(x);
  });
  L.sort((a,b)=>so==='yrs'?(b.yrs.size-a.yrs.size)||(b.est-a.est):so==='ord'?(b.o12-a.o12)||(b.est-a.est):(b.est-a.est));
  const totEst=L.reduce((s,x)=>s+x.est,0),consec=L.filter(x=>x.consec).length;
  const bq=(+$('#bq').value||0)/100,bpp=(+$('#bp').value||0)/100,bfx=+$('#bfx').value||1520;
  L.forEach(x=>x.bud=x.q12*(1+bq)*x.lp*(1+bpp));const totBud=L.reduce((s,x)=>s+x.bud,0);
  const budOther=CUR==='IQD'?`${fUSD(totBud/bfx)} USD`:`${fUSD(totBud*bfx)} IQD`;
  $('#rcstats').innerHTML=`<div class="stat"><div class="k">대상 품목</div><div class="v">${L.length.toLocaleString()}</div><div class="s">${minYrs}개 연도 이상 구매</div></div>
   <div class="stat"><div class="k">2024–26 연속 구매</div><div class="v">${consec.toLocaleString()}</div><div class="s">단가계약 우선 후보</div></div>
   <div class="stat"><div class="k">최근 12개월 발주액</div><div class="v">${fUSD(L.reduce((s,x)=>s+x.usd12,0))}</div><div class="s">${CUR} · 대상 품목 합계</div></div>
   <div class="stat"><div class="k">연간 예상 금액</div><div class="v">${fUSD(totEst)}</div><div class="s">최근 12개월 수량 × 최근 단가</div></div>
   <div class="stat"><div class="k">내년 예산 (시뮬레이션)</div><div class="v">${fUSD(totBud)}</div><div class="s">${CUR} · ≈ ${budOther}</div></div>`;
  $('#rccount').textContent=`${fmtD(lastDate)} 기준 최근 12개월`;
  const show=L.slice(0,rcLimit);
  let h=`<div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th>연도별 수량 <span class="hint">${String(minY).slice(2)}–${String(maxY).slice(2)}</span></th><th class="r">구매 연도</th><th class="r">최근12개월 수량</th><th class="r">직전 12개월</th><th class="r">12개월 발주횟수</th><th class="r">평균 발주간격</th><th class="r">최근 단가</th><th class="r">직전 구매 단가</th><th class="r">직전 대비</th><th class="r">연간 예상 (${CUR})</th><th class="r">내년 예산 (${CUR})</th></tr></thead><tbody>`;
  show.forEach(x=>{const r=R[x.i0];const mx=Math.max(...Object.values(x.yq),1);
    const sp=yearsAll.map(y=>{const q=x.yq[y]||0;return q?`<i style="height:${Math.max(2,q/mx*22)}px" title="${y}: ${f(q)}"></i>`:`<i class="z" title="${y}: 0"></i>`}).join('');
    const prev=x.q24-x.q12;
    h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td><span class="spark">${sp}</span></td><td class="r num">${x.yrs.size}${x.consec?' <span class="chip ok" title="2024·2025·2026 모두 구매">연속</span>':''}</td><td class="r num">${f(x.q12)}</td><td class="r num">${f(prev)}</td><td class="r num">${x.o12}</td><td class="r num">${isFinite(x.gap)?f(x.gap,0)+'일':'–'}</td><td class="r num">${fUSD(x.lp)}</td>${(()=>{const pv=prevOf[x.last];if(pv<0)return '<td class="r hint">–</td><td></td>';const ch=(puU[x.last]/puU[pv]-1)*100;return `<td class="r num">${fUSD(pu[pv])}<br><span class="hint">${fmtD(R[pv][0])}</span></td><td class="r num">${ch>0?'+':''}${f(ch,0)}%</td>`})()}<td class="r num"><b>${fUSD(x.est)}</b></td><td class="r num">${fUSD(x.bud)}</td></tr>`});
  h+='</tbody></table></div>';
  if(L.length>rcLimit)h+=`<div class="more"><button class="ghost" type="button" id="rcmore">${(L.length-rcLimit).toLocaleString()}개 더 보기</button></div>`;
  h+=`<p class="hint" style="margin:10px 0 0">평균 발주간격은 최근 3년 안의 발주일 기준입니다. 공사 물량이 많던 2015–2020년과 지금은 소요량 차이가 크니, 예측은 최근 12개월과 직전 12개월을 비교해서 보세요.</p>`;
  if(!L.length)h='<div class="empty">조건에 맞는 품목이 없습니다. 최소 구매 연도 수나 최근 구매 조건을 줄여 보세요.</div>';
  const el=$('#rcout');el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>gotoCode(tr.dataset.code);tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const mb=el.querySelector('#rcmore');if(mb)mb.onclick=()=>{rcLimit+=300;renderRecurring()};
}
function gotoCode(code){$('#q').value=code;y1.value=minY;y2.value=maxY;$('#sg').value='all';$('#cur').value='all';location.hash='search';runSearch()}
let rcT;$('#rq').addEventListener('input',()=>{clearTimeout(rcT);rcT=setTimeout(()=>{rcLimit=200;renderRecurring()},250)});
['#bq','#bp','#bfx'].forEach(s=>$(s).addEventListener('input',()=>{clearTimeout(rcT);rcT=setTimeout(renderRecurring,300)}));
['#rcy','#rsg','#rrec','#rso'].forEach(s=>$(s).addEventListener('change',()=>{rcLimit=200;renderRecurring()}));

/* ---------- 데이터 갱신 (엑셀 → 암호화 data.enc) ---------- */
let aFiles=[];
const af=$('#afile'),ad=$('#adrop');
const setAFiles=fs=>{aFiles=[...fs].filter(f=>/\.xlsx?$/i.test(f.name));$('#afiles').textContent=aFiles.length?aFiles.map(f=>f.name).join(', '):'선택된 파일 없음'};
af.addEventListener('change',()=>setAFiles(af.files));
['dragenter','dragover'].forEach(e=>ad.addEventListener(e,ev=>{ev.preventDefault();ad.classList.add('over')}));
['dragleave','drop'].forEach(e=>ad.addEventListener(e,ev=>{ev.preventDefault();ad.classList.remove('over')}));
ad.addEventListener('drop',ev=>setAFiles(ev.dataTransfer.files));
async function buildData(files){
  await loadScript('lib/xlsx.full.min.js');
  const recs=[],skipped=[];
  for(const file of files){
    const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});let got=0;
    for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null});
      const hi=rows.findIndex(r=>r&&String(r[0]).trim()==='순번');if(hi<0)continue;
      const H=rows[hi].map(x=>String(x||'').trim());const col=n=>H.indexOf(n);
      const need=['현장명','거래처명','품명','자재 코드','규격','단위','PR번호','통화','발주일자','발주수량','발주단가','발주금액(USD)','입고수량'];
      if(need.some(n=>col(n)<0))throw new Error(`${file.name}: 열 이름이 다릅니다 (${need.filter(n=>col(n)<0).join(', ')} 없음).`);
      for(const r of rows.slice(hi+1)){if(!r||r[0]==null||!isFinite(parseFloat(r[0])))continue; // 소계 행 제외
        let d=r[col('발주일자')];if(!(d instanceof Date)){d=new Date(String(d));}if(isNaN(d))continue;
        const s=k=>{const v=r[col(k)];return v==null?'':String(v).trim()},n=k=>{const v=parseFloat(String(r[col(k)]??'').replace(/,/g,''));return isFinite(v)?v:0};
        recs.push({d:d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(),site:s('현장명'),ven:s('거래처명'),name:s('품명'),code:s('자재 코드'),spec:s('규격'),unit:s('단위').toUpperCase(),
          cur:s('통화')==='IQD'?1:0,q:n('발주수량'),p:n('발주단가'),usd:n('발주금액(USD)'),rc:n('입고수량'),pr:s('PR번호').replace(/\.0$/,'')});got++}}
    if(!got)skipped.push(file.name);
  }
  recs.sort((a,b)=>a.d-b.d);
  const dict=k=>{const vals=[...new Set(recs.map(x=>x[k]))].sort();const m=new Map(vals.map((v,i)=>[v,i]));return [vals,m]};
  const [S_,sm]=dict('site'),[V_,vm]=dict('ven'),[N_,nm]=dict('name'),[C_,cm]=dict('code'),[P_,pm]=dict('spec'),[U_,um]=dict('unit');
  const r4=(x,k)=>Math.round(x*10**k)/10**k;
  const out={S:S_,V:V_,N:N_,C:C_,P:P_,U:U_,R:recs.map(x=>[x.d,sm.get(x.site),vm.get(x.ven),nm.get(x.name),cm.get(x.code),pm.get(x.spec),um.get(x.unit),x.cur,r4(x.q,3),r4(x.p,4),r4(x.usd,2),r4(x.rc,3),x.pr]),gen:new Date().toISOString().slice(0,10)};
  return {out,skipped};
}
async function encryptData(obj,pass){
  const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iter=250000;
  const base=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj))));
  const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
  return JSON.stringify({v:1,iter,salt:b64(salt),iv:b64(iv),ct:b64(ct)});
}
$('#abuild').onclick=async()=>{
  const o=$('#aout');const p1=$('#apw').value,p2=$('#apw2').value;
  if(!aFiles.length){o.innerHTML='<div class="empty">구매내역 엑셀 파일을 먼저 선택하세요.</div>';return}
  if(p1&&p1!==p2){o.innerHTML='<div class="empty" style="color:var(--bad)">비밀번호 확인이 일치하지 않습니다.</div>';return}
  if(p1&&p1.length<8){o.innerHTML='<div class="empty" style="color:var(--bad)">비밀번호는 8자 이상으로 정하세요 (12자 이상 권장).</div>';return}
  const pass=p1||PASS;$('#abuild').disabled=true;o.innerHTML='<div class="empty">엑셀을 읽고 암호화하는 중…</div>';
  try{const {out,skipped}=await buildData(aFiles);if(!out.R.length)throw new Error('구매내역 행을 찾지 못했습니다. 회사 시스템의 "구매내역(자재 기준)" 엑셀인지 확인하세요.');
    const blob=new Blob([await encryptData(out,pass)],{type:'application/octet-stream'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='data.enc';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    const d0=out.R[0][0],d1=out.R[out.R.length-1][0];const newer=out.R.filter(r=>r[0]>lastDate).length;
    o.innerHTML=`<div class="stats"><div class="stat"><div class="k">구매내역</div><div class="v">${out.R.length.toLocaleString()}건</div><div class="s">현재 ${R.length.toLocaleString()}건</div></div><div class="stat"><div class="k">기간</div><div class="v" style="font-size:14px">${fmtD(d0)} ~ ${fmtD(d1)}</div><div class="s">현재 기준일 ${fmtD(lastDate)}</div></div><div class="stat"><div class="k">새로 들어온 건</div><div class="v">${newer.toLocaleString()}</div><div class="s">현재 기준일 이후</div></div><div class="stat"><div class="k">비밀번호</div><div class="v" style="font-size:14px">${p1?'새 비밀번호':'지금과 동일'}</div></div></div>
      <p style="margin:10px 0 0"><b>data.enc</b> 파일이 저장되었습니다. GitHub 저장소에 올려 덮어쓰세요.${out.R.length<R.length?' <span class="chip warn">현재보다 건수가 적습니다. 빠진 연도 파일이 없는지 확인하세요.</span>':''}${skipped.length?` <span class="chip none">구매 행이 없는 파일: ${esc(skipped.join(', '))}</span>`:''}</p>`;
  }catch(e){o.innerHTML=`<div class="empty" style="color:var(--bad)">${esc(e.message||String(e))}</div>`}
  $('#abuild').disabled=false;
};

/* ---------- 단가 동향 ---------- */
let tInit=false,tLimit=200;
const qOf=d=>Math.floor(d/10000)+'-Q'+(Math.floor((Math.floor(d/100)%100-1)/3)+1);
function renderTrend(){
  const from=+$('#tfrom').value,th=+$('#tth').value/100,sg=$('#tsg').value,anom=$('#tanom').value;
  // 재구매 비율 계산 (USD 기준, 코드+단위)
  const hist=new Map(),ev=[];
  for(let i=0;i<R.length;i++){const r=R[i];if(puU[i]<=0)continue;if(sg==='bncp'&&isSAB[r[1]])continue;if(sg==='sab'&&!isSAB[r[1]])continue;
    const k=r[4]+'|'+r[6];const h=hist.get(k)||[];
    if(h.length&&r[0]>=from){const pj=h[h.length-1];const pm=puU[pj];const ratio=puU[i]/pm;
      ev.push({i,ratio,pm,pj,q:qOf(r[0]),vch:R[pj][2]!==r[2]})}
    h.push(i);hist.set(k,h)}
  const norm=ev.filter(e=>e.ratio<5&&e.ratio>0.2);
  const qm=new Map();norm.forEach(e=>{(qm.get(e.q)||qm.set(e.q,[]).get(e.q)).push(e.ratio)});
  const qIdx=new Map([...qm.entries()].map(([q,a])=>[q,{m:med(a),n:a.length}]));
  // 분기 지수 막대
  const qs=[...qIdx.keys()].sort();const mx=Math.max(...qs.map(q=>Math.abs(qIdx.get(q).m-1)),0.05);
  $('#tidx').innerHTML=qs.length?`<div class="qbars">${qs.map(q=>{const x=qIdx.get(q),v=(x.m-1)*100;return `<div title="${q}: 중앙 ${v>0?'+':''}${f(v,1)}% · ${x.n}건"><span class="v">${v>0?'+':''}${f(v,0)}%</span><span class="b ${v<0?'neg':''}" style="height:${Math.max(2,Math.abs(x.m-1)/mx*70)}px"></span><span class="l">${q.slice(2)}</span><span class="hint">${x.n}건</span></div>`}).join('')}</div><p class="hint" style="margin:8px 0 0">재구매 건수가 적은 분기(10건 미만)는 평균이 크게 흔들립니다.</p>`:'<div class="empty">재구매 데이터가 없습니다.</div>';
  // 시장 대비 초과
  let list=(anom==='only'?ev.filter(e=>e.ratio>=5||e.ratio<=0.2):norm.filter(e=>{const m=qIdx.get(e.q).m;e.mk=m;e.ex=e.ratio/m-1;return e.ex>=th}));
  list.forEach(e=>{e.mk=e.mk||qIdx.get(e.q)?.m||1;e.ex=e.ratio/e.mk-1});
  list.sort((a,b)=>b.ex-a.ex);
  $('#tcount').textContent=`${list.length.toLocaleString()}건 / 재구매 ${ev.length.toLocaleString()}건`;
  const vs=new Map();list.forEach(e=>{const v=R[e.i][2];const x=vs.get(v)||{n:0,ex:[],codes:new Set()};x.n++;x.ex.push(e.ex);x.codes.add(R[e.i][4]);vs.set(v,x)});
  const vl=[...vs.entries()].sort((a,b)=>b[1].n-a[1].n);
  $('#tvc').textContent=`${vl.length}개사`;
  $('#tvend').innerHTML=vl.length?`<div class="tbl-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>업체</th><th class="r">건수</th><th class="r">품목</th><th class="r">시장 대비 초과 (중앙)</th></tr></thead><tbody>${vl.map(([v,x])=>`<tr><td>${esc(V[v])}</td><td class="r num">${x.n}</td><td class="r num">${x.codes.size}</td><td class="r num">+${f(med(x.ex)*100,0)}%</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">해당 없음</div>';
  let h=`<div class="tbl-wrap"><table><thead><tr><th>발주일</th><th>품목</th><th>단위</th><th>이번 업체</th><th class="r">이번 단가 (USD)</th><th>직전 업체</th><th class="r">직전 구매 단가 (USD)</th><th class="r">변동</th><th class="r">시장 평균</th><th class="r">시장 대비 초과</th></tr></thead><tbody>`;
  list.slice(0,tLimit).forEach(e=>{const r=R[e.i],pr=R[e.pj];
    h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="num">${fmtD(r[0])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])} · ${esc(C[r[4]])}</span></td><td>${esc(U[r[6]])}</td><td>${esc(V[r[2]])}${e.vch?' <span class="chip none">업체 변경</span>':''}</td><td class="r num">${fUSD(puU[e.i])}</td><td>${esc(V[pr[2]])}</td><td class="r num">${fUSD(e.pm)}</td><td class="r num">${e.ratio>=1?'+':''}${f((e.ratio-1)*100,0)}%</td><td class="r num">${e.mk>=1?'+':''}${f((e.mk-1)*100,0)}%</td><td class="r num"><span class="chip ${anom==='only'?'warn':e.ex>=0.5?'bad':'warn'}">${anom==='only'?'단위·규격 확인':'+'+f(e.ex*100,0)+'%'}</span></td></tr>`});
  h+='</tbody></table></div>';if(list.length>tLimit)h+=`<div class="more"><button class="ghost" type="button" id="tmore">${(list.length-tLimit).toLocaleString()}건 더 보기</button></div>`;
  if(!list.length)h='<div class="empty">조건에 맞는 구매가 없습니다.</div>';
  const el=$('#tout');el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{tr.onclick=()=>gotoCode(tr.dataset.code)});
  const mb=el.querySelector('#tmore');if(mb)mb.onclick=()=>{tLimit+=300;renderTrend()};
  // 환율 변경 영향: 10/7 전후 IQD 구매 비교
  const before=new Map(),after=new Map();
  R.forEach((r,i)=>{if(r[7]!==1||r[9]<=0)return;const k=r[4]+'|'+r[6];if(r[0]<FX_FIX_FROM)before.set(k,i);else if(!after.has(k))after.set(k,i)});
  const pairs=[...after.entries()].filter(([k])=>before.has(k)).map(([k,ai])=>{const bi=before.get(k);return {bi,ai,ch:(R[ai][9]/R[bi][9]-1)*100}});
  const fxp=(1520/1320-1)*100;
  $('#tfx').innerHTML=pairs.length?`<div class="stats" style="margin-bottom:10px"><div class="stat"><div class="k">비교 가능 품목</div><div class="v">${pairs.length}</div><div class="s">10/7 전·후 모두 IQD로 구매</div></div><div class="stat"><div class="k">IQD 단가 변동 (중앙)</div><div class="v">${f(med(pairs.map(x=>x.ch)),1)}%</div><div class="s">환율 변동분 +${f(fxp,1)}%</div></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>품목</th><th class="r">10/7 이전 (IQD)</th><th class="r">이후 (IQD)</th><th class="r">변동</th><th class="r">환율분 대비</th></tr></thead><tbody>${pairs.sort((a,b)=>b.ch-a.ch).map(x=>{const r=R[x.ai];return `<tr class="click" data-code="${esc(C[r[4]])}"><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td class="r num">${fUSD(R[x.bi][9])}<br><span class="hint">${fmtD(R[x.bi][0])}</span></td><td class="r num">${fUSD(r[9])}<br><span class="hint">${fmtD(r[0])}</span></td><td class="r num">${x.ch>0?'+':''}${f(x.ch,0)}%</td><td class="r num">${x.ch-fxp>0?'+':''}${f(x.ch-fxp,0)}%p</td></tr>`}).join('')}</tbody></table></div>
    <p class="hint" style="margin:8px 0 0">10/7 이후 데이터가 아직 적습니다. 구매내역이 갱신될수록 정확해집니다. "환율분 대비"가 +이면 환율 변동보다 더 올린 것입니다.</p>`:'<div class="empty">10/7 이후 IQD 재구매가 아직 없습니다.</div>';
  $('#tfx').querySelectorAll('tr[data-code]').forEach(tr=>{tr.onclick=()=>gotoCode(tr.dataset.code)});
}
['#tfrom','#tth','#tsg','#tanom'].forEach(s=>$(s).addEventListener('change',()=>{tLimit=200;renderTrend()}));

/* ---------- 지출 현황 ---------- */
let spInit=false;
const CAT={'10':'시멘트·철강·구조재','11':'유류·가스','19':'설치·용역','20':'토목·도로자재','30':'건축 철물·가설','31':'도료·합판','32':'양생·필름','33':'방수·화학','34':'접착·앵커','35':'유리·기타 건자재','40':'설비·밸브·공조','41':'펌프','50':'전기자재','51':'전기 제어','60':'소방·수처리','70':'장비·기계','71':'공구·소모품','79':'장비 임대','80':'잡자재·소모품','89':'기타','90':'안전·일반 소모품'};
function catOf(code){const p=code.slice(0,2);if(CAT[p])return p+' '+CAT[p];const c=code[0];if(c==='A')return 'A* 장비 부품';if(c==='E')return 'E* 캠프 생활용품';if(c==='P')return 'P* 공장 소모품';if(c==='B')return 'B* 식자재';return p+' 기타'}
const rowCat=new Array(R.length);const catNames=new Map();
R.forEach((r,i)=>{const c=catOf(C[r[4]]);rowCat[i]=c});
function initSpend(){
  const a=$('#sy1'),b=$('#sy2');if(a.options.length){renderSpend();return}for(let y=minY;y<=maxY;y++){a.add(new Option(y,y));b.add(new Option(y,y))}a.value=minY;b.value=maxY;
  const st=$('#ssite');st.add(new Option('전체','-1'));const tot=new Map();R.forEach(r=>tot.set(r[1],(tot.get(r[1])||0)+r[10]));
  [...tot.entries()].sort((x,y)=>y[1]-x[1]).forEach(([s])=>st.add(new Option(S[s]||'(현장명 없음)',s)));
  const sc=$('#scat');sc.add(new Option('전체',''));[...new Set(rowCat)].sort().forEach(c=>sc.add(new Option(c,c)));
  ['#sy1','#sy2','#ssite','#scat'].forEach(s=>$(s).addEventListener('change',renderSpend));
  $('#sreset').onclick=()=>{a.value=minY;b.value=maxY;st.value='-1';sc.value='';renderSpend()};
  renderSpend();
}
function renderSpend(){
  const a=+$('#sy1').value,b=+$('#sy2').value,site=+$('#ssite').value,cat=$('#scat').value;
  const years={},sites=new Map(),cats=new Map(),items=new Map();let tot=0,n=0;const vend=new Set();
  for(let i=0;i<R.length;i++){const r=R[i],y=yr(i);if(y<a||y>b)continue;if(site>=0&&r[1]!==site)continue;if(cat&&rowCat[i]!==cat)continue;
    const u=r[10];tot+=u;n++;vend.add(r[2]);years[y]=(years[y]||0)+u;
    const s=sites.get(r[1])||{usd:0,n:0,yrs:new Set()};s.usd+=u;s.n++;s.yrs.add(y);sites.set(r[1],s);
    const c=cats.get(rowCat[i])||{usd:0,n:0,codes:new Set()};c.usd+=u;c.n++;c.codes.add(r[4]);cats.set(rowCat[i],c);
    const k=r[4]+'|'+r[6];const it=items.get(k)||{i0:i,usd:0,q:0,n:0};it.usd+=u;it.q+=r[8];it.n++;items.set(k,it)}
  $('#sstats').innerHTML=`<div class="stat"><div class="k">발주액 (${CUR})</div><div class="v">${fUSD(tot)}</div><div class="s">${a}–${b}</div></div><div class="stat"><div class="k">발주 라인</div><div class="v">${n.toLocaleString()}</div></div><div class="stat"><div class="k">현장·부서</div><div class="v">${sites.size}</div></div><div class="stat"><div class="k">거래처</div><div class="v">${vend.size}</div></div>`;
  const mx=Math.max(...Object.values(years),1);let yb='<div class="vbars">';
  for(let y=a;y<=b;y++){const v=years[y]||0;const lbl=v>=1e6?f(v/1e6,1)+'M':v>=1e3?f(v/1e3,0)+'K':v?f(v,0):'–';yb+=`<div title="${y}: ${fUSD(v)} ${CUR}"><span class="v">${lbl}</span><span class="b" style="height:${v?Math.max(2,v/mx*110):0}px"></span><span class="l">${y}</span></div>`}
  $('#syears').innerHTML=yb+'</div>';
  const sl=[...sites.entries()].sort((x,y)=>y[1].usd-x[1].usd);
  $('#ssitec').textContent=`${sl.length}곳`;
  $('#ssites').innerHTML=`<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>현장·부서</th><th class="r">발주액</th><th>비중</th><th class="r">라인</th><th>기간</th></tr></thead><tbody>${sl.map(([s,x])=>{const ys=[...x.yrs].sort();const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-site="${s}"><td>${esc(S[s]||'(없음)')}${isSAB[s]?' <span class="chip sab">SAB</span>':''}</td><td class="r num">${fUSD(x.usd)}</td><td class="num"><span class="share" style="width:${Math.max(1,sh*0.8)}px"></span>${f(sh,1)}%</td><td class="r num">${x.n.toLocaleString()}</td><td class="num">${ys[0]}–${String(ys[ys.length-1]).slice(2)}</td></tr>`}).join('')}</tbody></table></div>`;
  const cl=[...cats.entries()].sort((x,y)=>y[1].usd-x[1].usd);
  $('#scatc').textContent=`${cl.length}개 군`;
  $('#scats').innerHTML=`<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>품목군</th><th class="r">발주액</th><th>비중</th><th class="r">라인</th><th class="r">품목</th></tr></thead><tbody>${cl.map(([c,x])=>{const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-cat="${esc(c)}"><td>${esc(c)}</td><td class="r num">${fUSD(x.usd)}</td><td class="num"><span class="share" style="width:${Math.max(1,sh*0.8)}px"></span>${f(sh,1)}%</td><td class="r num">${x.n.toLocaleString()}</td><td class="r num">${x.codes.size}</td></tr>`}).join('')}</tbody></table></div>`;
  const il=[...items.values()].sort((x,y)=>y.usd-x.usd).slice(0,25);
  $('#sitems').innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">수량</th><th class="r">라인</th><th class="r">발주액 (${CUR})</th><th>비중</th></tr></thead><tbody>${il.map(x=>{const r=R[x.i0];const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}${koTag(r[3])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(x.q)}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${f(sh,1)}%</td></tr>`}).join('')}</tbody></table></div>`;
  const bind=(sel,fn)=>document.querySelectorAll(sel).forEach(tr=>{tr.onclick=()=>fn(tr);tr.onkeydown=ev=>{if(ev.key==='Enter')fn(tr)}});
  bind('#ssites tr[data-site]',tr=>{$('#ssite').value=tr.dataset.site;renderSpend()});
  bind('#scats tr[data-cat]',tr=>{$('#scat').value=tr.dataset.cat;renderSpend()});
  bind('#sitems tr[data-code]',tr=>gotoCode(tr.dataset.code));
}

updMeta();renderChips();runSearch();runQuote();route();
}
/* ---------- 로그인 · 복호화 ---------- */
(function(){
  const KEY='bp-pw';
  const lerr=document.getElementById('lerr'),pw=document.getElementById('pw'),btn=document.getElementById('lbtn');
  let encP=null;
  const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function getEnc(){if(!encP)encP=fetch('data.enc',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('데이터 파일(data.enc)을 불러오지 못했습니다.');return r.json()});return encP}
  async function decrypt(pass){
    const e=await getEnc();
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(e.salt),iterations:e.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
    const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},key,b64(e.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function open(pass,remember){
    btn.disabled=true;btn.textContent='여는 중…';lerr.textContent='';
    try{
      const D=await decrypt(pass);let KO=null;try{KO=await fetch('lib/ko_dict.json').then(r=>r.ok?r.json():null)}catch(_){}
      try{if(remember)localStorage.setItem(KEY,pass);}catch(_){}
      document.getElementById('login').hidden=true;
      start(D,KO,pass);
    }catch(err){
      lerr.textContent=err&&err.name==='OperationError'?'비밀번호가 맞지 않습니다.':(err.message||'열 수 없습니다.');
      try{localStorage.removeItem(KEY)}catch(_){}
      btn.disabled=false;btn.textContent='열기';pw.select();
    }
  }
  document.getElementById('lform').addEventListener('submit',ev=>{ev.preventDefault();if(pw.value)open(pw.value,document.getElementById('remember').checked)});
  document.getElementById('logout').addEventListener('click',()=>{try{localStorage.removeItem(KEY)}catch(_){}location.hash='';location.reload()});
  if(!window.crypto||!crypto.subtle){lerr.textContent='이 브라우저는 암호 해제를 지원하지 않습니다. https 주소로 열어 주세요.';btn.disabled=true;return}
  let saved=null;try{saved=localStorage.getItem(KEY)}catch(_){}
  if(saved){document.getElementById('remember').checked=true;open(saved,true)}else pw.focus();
})();


/* ---------- 화면 언어 (한국어 / English) ---------- */
(function(){
  const LKEY='bp-lang';let pairs=null,obs=null,busy=false;const done=new Set();
  const HAN=/[가-힣]/;
  function tr(s){if(!HAN.test(s))return s;for(const [k,v] of pairs){if(s.includes(k))s=s.split(k).join(v)}for(const [re,v] of window.BP_EN_RX)s=s.replace(re,v);return s}
  function trNode(n){const v=n.nodeValue;if(n._en===v)return;const nv=tr(v);n._ko=v;n._en=nv;if(nv!==v)n.nodeValue=nv;done.add(n)}
  function walk(root){
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>HAN.test(n.nodeValue)&&n.parentNode&&!/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)&&!n.parentNode.closest('.ko,.src,#qreview input')?1:2});
    const list=[];while(w.nextNode())list.push(w.currentNode);
    list.forEach(trNode);
    const els=root.querySelectorAll?root.querySelectorAll('[placeholder],[title],[aria-label]'):[];
    els.forEach(el=>['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute(a);if(v&&HAN.test(v)){if(!el._koA)el._koA={};if(el._koA[a]==null)el._koA[a]=v;el.setAttribute(a,tr(v));done.add(el)}}));
    root.querySelectorAll&&root.querySelectorAll('option').forEach(o=>{if(HAN.test(o.text)){if(o._ko==null)o._ko=o.text;o.text=tr(o.text);done.add(o)}});
  }
  async function apply(lang){
    document.documentElement.lang=lang==='en'?'en':'ko';
    if(lang==='en'){
      if(!window.BP_EN)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='lib/i18n_en.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)});
      pairs=pairs||window.BP_EN.slice().sort((a,b)=>b[0].length-a[0].length);
      walk(document.body);
      if(!obs){obs=new MutationObserver(ms=>{if(busy)return;busy=true;ms.forEach(m=>{if(m.type==='characterData'){const n=m.target;if(HAN.test(n.nodeValue))trNode(n)}else m.addedNodes.forEach(n=>{if(n.nodeType===3){if(HAN.test(n.nodeValue))trNode(n)}else if(n.nodeType===1)walk(n)})});busy=false});
        obs.observe(document.body,{childList:true,subtree:true,characterData:true})}
    }else{
      if(obs){obs.disconnect();obs=null}
      done.forEach(n=>{if(n.nodeType===3&&n._ko!=null){if(n.nodeValue===n._en)n.nodeValue=n._ko;n._en=null}else if(n.nodeName==='OPTION'&&n._ko!=null)n.text=n._ko;if(n._koA)Object.entries(n._koA).forEach(([a,v])=>n.setAttribute(a,v))});done.clear();
    }
  }
  const sel=document.getElementById('lang');let cur='ko';try{cur=localStorage.getItem(LKEY)||'ko'}catch(_){}
  sel.value=cur;if(cur==='en')apply('en');
  sel.addEventListener('change',()=>{try{localStorage.setItem(LKEY,sel.value)}catch(_){}apply(sel.value)});
})();
