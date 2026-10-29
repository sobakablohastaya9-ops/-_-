'use strict';

const FACT = {
  idx25: {alx:158.1,and:137.5,apn:129.7,arz:138.8,blg:160.1,bud:114.1,grg:102.5,grc:148.8,izb:110.2,ipt:124.3,kir:126.2,kch:127.0,krg:93.3,krs:98.3,lvk:125.0,mvd:136.8,nft:126.7,nal:100.8,nsl:151.9,ptr:166.5,prd:103.5,sov:102.1,stp:140.4,trn:116.1,trk:147.8,shp:121.7},
  vol: [[2017,100],[2018,92.9],[2019,89.8],[2020,68.7],[2021,101.8],[2022,106.0],[2023,105.8],[2024,94.8],[2025,113.6]],
  kpis: [
    {l:'Валовой сбор зерна, 2025', v:'10,03 млн т', n:'урожайность 44,2 ц/га'},
    {l:'Валовой сбор зерна, 2026', v:'9,3 млн т', n:'оперативные данные, -7% к 2025'},
    {l:'Валовой сбор зерна, 2020', v:'5,2 млн т', n:'индекс растениеводства 76,5%'},
    {l:'Продукция растениеводства, 2025', v:'260,4 млрд ₽', n:'индекс производства 119,8%'},
    {l:'Доля сельского хозяйства в ВРП', v:'14,3%', n:'в среднем по РФ 4,2% (2022)'}
  ]
};
const MON = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const SCEN = ['2010','2013','2019','2020','2021','2024','2025'];
const ZONES = ['крайне засушливая','засушливая','неустойчивого увлажнения','достаточного увлажнения'];
const ZSHORT = {'крайне засушливая':'крайне засушл.','засушливая':'засушливая','неустойчивого увлажнения':'неуст. увлажн.','достаточного увлажнения':'достат. увлажн.'};
const CL_COL = ['#2E6B3E','#C47F22','#3F6FA8','#8E4B8F'];

let D = null;
const S = {tab:'overview', d:'ptr', metric:'yld25', cmp:'2025', analog:'2020', dp:0, dy:0, dd:0, live:false, liveSO:null, liveStatus:''};

const $ = (s) => document.querySelector(s);
const ok = (n) => n != null && !isNaN(n);
const fmt = (n) => ok(n) ? Math.round(n).toLocaleString('ru-RU') : '-';
const f1 = (n) => ok(n) ? n.toLocaleString('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1}) : '-';
const f2 = (n) => ok(n) ? n.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
const f3 = (n) => ok(n) ? n.toLocaleString('ru-RU', {minimumFractionDigits:3, maximumFractionDigits:3}) : '-';
const sg = (n, f = fmt) => ok(n) ? (n > 0 ? '+' : n < 0 ? '-' : '') + f(Math.abs(n)) : '-';
const pct = (p) => ok(p) ? (p * 100).toLocaleString('ru-RU', {maximumFractionDigits:0}) + '%' : '-';
const pv = (p) => !ok(p) ? '-' : p < 0.001 ? '< 0,001' : f3(p);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hex = (c) => [1,3,5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b), tt = Math.max(0, Math.min(1, t)); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * tt).toString(16).padStart(2, '0')).join(''); };
const scale = (stops, t) => { const tt = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(tt)); return mix(stops[i], stops[i + 1], tt - i); };
const div = (v, m) => !ok(v) ? '#E3E5DE' : v < 0 ? mix('#F4F1EA', '#B23A2E', Math.min(1, -v / m)) : mix('#F4F1EA', '#1F5E36', Math.min(1, v / m));
const fg = (bg) => { const [r, g, b] = hex(bg); return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? '#FFFFFF' : '#18241C'; };
const dist = (id) => D.districts.find((x) => x.id === id);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; a.forEach((v, i) => { sab += (v - ma) * (b[i] - mb); saa += (v - ma) ** 2; sbb += (b[i] - mb) ** 2; }); return sab / Math.sqrt(saa * sbb); };
const quant = (a, q) => { const s = a.slice().sort((x, y) => x - y); const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
const W = 640;
const ysc = (lo, hi, H, pt, pb) => (v) => H - pb - (v - lo) / (hi - lo) * (H - pt - pb);
const xsc = (n, pl = 44, pr = 12) => (i) => pl + i * (W - pl - pr) / Math.max(1, n - 1);
const lin = (lo, hi, a, b) => (v) => a + (v - lo) / (hi - lo) * (b - a);
function niceRange(vals, step) { const v = vals.filter(ok); let lo = Math.floor(Math.min(...v) / step) * step, hi = Math.ceil(Math.max(...v) / step) * step; if (lo === hi) hi = lo + step; return [lo, hi]; }
function yAxis(lo, hi, n, H, pt, pb, f, x0 = 44, x1 = W - 12) { let s = ''; for (let k = 0; k <= n; k++) { const v = lo + (hi - lo) * k / n; const y = ysc(lo, hi, H, pt, pb)(v); s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${x0 - 4}" y="${y + 3.5}" class="axis mono" text-anchor="end">${f(v)}</text>`; } return s; }
const poly = (pts) => pts.filter((p) => ok(p[1])).map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const xlab = (x, y, t) => `<text x="${x}" y="${y}" class="axis" text-anchor="middle" style="font-size:11px;fill:var(--ink2)">${t}</text>`;
const ylab = (x, y, t) => `<text x="${x}" y="${y}" class="axis" text-anchor="middle" transform="rotate(-90 ${x} ${y})" style="font-size:11px;fill:var(--ink2)">${t}</text>`;
const svg = (h, body, label, w = W) => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const card = (title, body, extra = '') => `<div class="card${extra}"><h2>${title}</h2>${body}</div>`;
const minis = (items) => `<div class="minis">${items.map(([l, v, bg]) => `<div class="mini"${bg ? ` style="background:${bg}"` : ''}><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>`;
const legend = (items) => `<div class="legend">${items.map(([c, t, k]) => `<span><i class="${k || ''}" style="background:${c}"></i>${t}</span>`).join('')}</div>`;
function anomSeries(x) { return x.yld.map((v, i) => (ok(v) && ok(x.trend[i])) ? (v / x.trend[i] - 1) * 100 : null); }
function volatility(x) { return sd(anomSeries(x).filter(ok)); }
function regLine(xs, ys) { const mx = mean(xs), my = mean(ys); const b = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0); return [my - b * mx, b]; }

(window.__AGRO_DATA ? Promise.resolve(window.__AGRO_DATA) : fetch('data/agro.json').then((r) => r.json())).then((j) => {
  D = j;
  const url = new URL(location.href);
  if (url.searchParams.get('d') && D.districts.some((x) => x.id === url.searchParams.get('d'))) S.d = url.searchParams.get('d');
  if (url.searchParams.get('tab')) S.tab = url.searchParams.get('tab');
  let liveSaved = null; try { liveSaved = localStorage.getItem('liveWeather'); } catch (e) {}
  S.live = url.searchParams.get('live') === '0' ? false : url.searchParams.get('live') === '1' ? true : liveSaved === 'on';
  $('#live-toggle').checked = S.live;
  const sel = $('#district-select');
  sel.innerHTML = D.districts.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  sel.value = S.d;
  sel.addEventListener('change', () => { S.d = sel.value; render(); });
  $('#live-toggle').addEventListener('change', (e) => { S.live = e.target.checked; try { localStorage.setItem('liveWeather', S.live ? 'on' : 'off'); } catch (er) {} if (S.live) loadLive(); else { S.liveSO = null; S.liveStatus = ''; render(); } });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  if (S.live) loadLive();
  render();
}).catch((e) => { $('#app').innerHTML = `<div class="note bad">Не удалось загрузить данные: ${esc(e.message)}</div>`; });

const COORDS = {krg:[45.85,41.52],trn:[45.43,41.96],ipt:[45.72,42.90],apn:[45.91,43.35],nal:[45.49,41.22],izb:[45.37,41.71],ptr:[45.33,42.85],trk:[45.50,43.58],arz:[45.37,44.22],kch:[44.68,41.82],shp:[45.13,42.03],grc:[45.06,42.47],blg:[45.10,43.43],bud:[44.78,44.17],lvk:[44.82,44.66],and:[44.46,42.51],nsl:[44.75,43.44],alx:[44.71,43.00],sov:[44.41,43.87],stp:[44.27,44.58],nft:[44.75,44.99],prd:[44.03,42.86],mvd:[44.21,43.14],grg:[44.15,43.47],kir:[43.96,43.63],krs:[43.87,44.88]};
async function loadLive() {
  S.liveStatus = 'загрузка'; render();
  try {
    const ids = Object.keys(COORDS);
    const today = new Date(); const y = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
    const iso = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const end = iso(today);
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${ids.map((i) => COORDS[i][0]).join(',')}&longitude=${ids.map((i) => COORDS[i][1]).join(',')}&start_date=${y}-09-01&end_date=${end}&daily=precipitation_sum&timezone=Europe%2FMoscow`;
    const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status);
    let j = await r.json(); if (!Array.isArray(j)) j = [j];
    const days = j[0].daily.time.length;
    const out = {};
    ids.forEach((id, k) => { const sum = j[k].daily.precipitation_sum.reduce((s, v) => s + (v || 0), 0); const d = dist(id); out[id] = sum / (d.n_pSO * Math.min(1, days / 54)) * 100; });
    S.liveSO = out; const last = j[0].daily.time[days - 1].split('-').reverse().join('.');
    S.liveStatus = `осадки 01.09-${last}, обновлено ${today.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}`;
  } catch (e) { S.liveSO = null; S.liveStatus = 'нет связи с Open-Meteo'; }
  render();
}
const so26 = (d) => (S.live && S.liveSO && S.liveSO[d.id] != null) ? S.liveSO[d.id] : d.so26_pct;

function onClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, v = b.dataset.v;
  if (a === 'tab') S.tab = v; else if (a === 'd') S.d = v; else if (a === 'metric') S.metric = v;
  else if (a === 'cmp') S.cmp = v; else if (a === 'analog') S.analog = v; else if (a === 'reset') { S.dp = S.dy = S.dd = 0; }
  $('#district-select').value = S.d;
  render();
  if (a === 'tab') window.scrollTo({top: 0});
}
function onInput(e) { const k = e.target.dataset.s; if (!k) return; S[k] = Number(e.target.value); render(); }

function render() {
  if (!D) return;
  const tabs = [['overview','Обзор'],['crop','Урожайность и погода'],['market','Рынок и маржа'],['risk','Риски'],['model','Модель']];
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${l}</button>`).join('');
  $('#live-status').textContent = S.live ? S.liveStatus : `данные на ${D.meta.updated.split('-').reverse().join('.')}`;
  const v = {overview, crop, market, risk, model}[S.tab] || overview;
  $('#app').innerHTML = v();
}

function tilesMap(valueOf, colorOf, labelOf) {
  return `<div class="mapwrap"><div class="map">${D.districts.map((x) => { const v = valueOf(x); const bg = colorOf(v, x); return `<button class="tile ${x.id === S.d ? 'sel' : ''}" data-a="d" data-v="${x.id}" title="${esc(x.name)}" aria-label="${esc(x.name)}: ${esc(labelOf(v))}" style="grid-column:${x.col};grid-row:${x.row};background:${bg};color:${fg(bg)}"><span class="s">${esc(x.short)}</span><span class="x">${esc(labelOf(v))}</span></button>`; }).join('')}</div></div>`;
}
function heat({rows, cols, val, color, label, rowLab, colLab, rowW = 130, cellH = 20, w = 960, fs = 9, clickRow, minW = 720}) {
  const cw = (w - rowW - 8) / cols.length, H = 24 + rows.length * cellH;
  let s = cols.map((c, j) => `<text x="${rowW + j * cw + cw / 2}" y="14" class="axis" text-anchor="middle">${esc(colLab(c))}</text>`).join('');
  rows.forEach((r, i) => {
    const y = 20 + i * cellH;
    s += `<text x="${rowW - 6}" y="${y + cellH / 2 + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink);font-weight:${clickRow && r === S.d ? 700 : 400}">${esc(rowLab(r))}</text>`;
    cols.forEach((c, j) => { const v = val(r, c); const bg = color(v); s += `<rect x="${rowW + j * cw + 1}" y="${y + 1}" width="${cw - 2}" height="${cellH - 2}" rx="2" fill="${bg}"${clickRow ? ` data-a="d" data-v="${r}" style="cursor:pointer"` : ''}><title>${esc(rowLab(r))}, ${esc(colLab(c))}: ${esc(label(v))}</title></rect>${ok(v) ? `<text x="${rowW + j * cw + cw / 2}" y="${y + cellH / 2 + 3.5}" text-anchor="middle" class="mono" style="font-size:${fs}px;fill:${fg(bg)};pointer-events:none">${esc(label(v))}</text>` : ''}`; });
  });
  return `<div class="tblwrap">${svg(H + 4, s, 'Матрица', w).replace('class="chart"', `class="chart" style="min-width:${Math.min(w, minW)}px"`)}</div>`;
}
const gradLegend = (lo, hi, stops, f) => `<div class="glegend"><span class="num">${f(lo)}</span><span class="gradbar" style="background:linear-gradient(90deg,${stops.join(',')})"></span><span class="num">${f(hi)}</span></div>`;

function overview() {
  const d = dist(S.d);
  const metrics = {
    yld25: {l:'Урожайность 2025', title:'урожайность озимой пшеницы 2025, ц/га', val:(x) => x.yld[x.years.indexOf(2025)], stops:['#F3E7CF','#A9CDA9','#1F5E36'], lo:25, hi:65, lab:f1},
    idx25: {l:'Индекс 2025', title:'индекс производства растениеводства 2025, % к 2024', val:(x) => FACT.idx25[x.id], stops:['#C9672E','#EEF0EA','#8DBE96','#1F5E36'], lo:90, hi:170, lab:f1},
    vol: {l:'Волатильность', title:'σ отклонений урожайности от тренда, %', val:(x) => volatility(x), stops:['#EEF0EA','#E9A867','#A9461F'], lo:8, hi:28, lab:f1},
    anom20: {l:'2020 к тренду', title:'отклонение урожайности 2020 от тренда, %', val:(x) => x.anom2020, stops:['#B23A2E','#E9A867','#EEF0EA'], lo:-50, hi:0, lab:(v) => sg(v, Math.round)},
    so26: {l:'Осадки осени 2026', title:'осадки с 1 сентября 2026, % нормы', val:(x) => so26(x), stops:['#B4532A','#F3DCC6','#EEF0EA','#9CC3E6','#2F5F9E'], lo:0, hi:200, lab:(v) => Math.round(v)},
    ploss: {l:'P(убыток) 2027', title:'вероятность убыточного сезона 2027, Монте-Карло', val:(x) => x.mc ? x.mc.ploss : null, stops:['#EEF0EA','#E9A867','#B23A2E'], lo:0, hi:0.5, lab:pct}
  };
  const m = metrics[S.metric] || metrics.yld25;
  const kpis = FACT.kpis.map((k) => `<div class="kpi"><div class="l">${k.l}</div><div class="v">${k.v}</div><div class="n">${k.n}</div></div>`).join('');
  const an = anomSeries(d).filter(ok);
  const rows = [
    ['Агроклиматическая зона', d.zone],
    ['Площадь пшеницы 2025', f1(d.area) + ' тыс. га'],
    ['Норма ГТК мая-июня', f2(d.n_gtk)],
    ['Урожайность 2025 / тренд', `${f1(d.yld[d.years.indexOf(2025)])} / ${f1(d.trend[d.years.indexOf(2025)])} ц/га`],
    ['σ отклонений от тренда', f1(sd(an)) + '%'],
    ['Минимум к тренду', f1(Math.min(...an)) + '%'],
    ['Индекс растениеводства 2025', f1(FACT.idx25[d.id]) + '%'],
    ['Осадки осени 2026', ok(so26(d)) ? Math.round(so26(d)) + '% нормы' : '-'],
    ['P(убыток) 2027', pct(d.mc.ploss)],
    ['Маржа, квантиль 5%', fmt(d.mc.q05) + ' ₽/га']
  ];
  const as = anomSeries(d), AXs = xsc(d.years.length, 40, 16), AY = ysc(-60, 60, 150, 6, 20);
  const abars = svg(150, `${[-50, 0, 50].map((v) => `<line x1="40" x2="628" y1="${AY(v)}" y2="${AY(v)}" stroke="var(--grid)"/><text x="36" y="${AY(v) + 3.5}" class="axis mono" text-anchor="end">${sg(v)}</text>`).join('')}${as.map((v, i) => ok(v) ? `<rect x="${AXs(i) - 11}" y="${Math.min(AY(0), AY(Math.max(-60, v)))}" width="22" height="${Math.abs(AY(Math.max(-60, v)) - AY(0))}" fill="${v < 0 ? '#C47F22' : '#6E9C78'}"><title>${d.years[i]}: ${sg(v, f1)}%</title></rect>` : '').join('')}${d.years.map((y, i) => i % 2 === 0 || i === d.years.length - 1 ? `<text x="${AXs(i)}" y="146" class="axis" text-anchor="middle">${y}</text>` : '').join('')}`, 'Отклонения округа');
  const yrs = d.years.filter((y, i) => D.districts.some((x) => ok(x.yld[i])));
  const order = D.districts.slice().sort((a, b) => b.n_gtk - a.n_gtk).map((x) => x.id);
  const mat = heat({rows: order, cols: yrs, val: (r, y) => { const x = dist(r), i = x.years.indexOf(y); return ok(x.yld[i]) ? (x.yld[i] / x.trend[i] - 1) * 100 : null; },
    color: (v) => div(v, 45), label: (v) => ok(v) ? Math.round(v) : '-', rowLab: (r) => dist(r).name, colLab: String, clickRow: true});
  const vy = ysc(0, 125, 220, 18, 26), bw = (W - 44 - 12) / FACT.vol.length;
  const vol = FACT.vol.map(([y, v], i) => { const x = 44 + i * bw; return `<rect x="${x + bw * .18}" y="${vy(v)}" width="${bw * .64}" height="${vy(0) - vy(v)}" rx="3" fill="${v < 95 ? '#C47F22' : '#6E9C78'}"/><text x="${x + bw / 2}" y="${vy(v) - 6}" text-anchor="middle" class="axis mono" style="fill:var(--ink);font-weight:600;font-size:11px">${f1(v)}</text><text x="${x + bw / 2}" y="214" text-anchor="middle" class="axis" style="font-size:11px">${y}</text>`; }).join('');
  const zv = ZONES.map((z) => [z, D.districts.filter((x) => x.zone === z).flatMap((x) => anomSeries(x).filter(ok))]).filter((z) => z[1].length);
  const BY = ysc(-80, 80, 250, 12, 40), zb = (W - 56) / zv.length;
  const box = yAxis(-80, 80, 8, 250, 12, 40, (v) => sg(v, Math.round) + '%') + zv.map(([z, a], i) => {
    const q1 = quant(a, .25), q2 = quant(a, .5), q3 = quant(a, .75), iq = q3 - q1, lo = Math.min(...a.filter((v) => v >= q1 - 1.5 * iq)), hi = Math.max(...a.filter((v) => v <= q3 + 1.5 * iq));
    const cx = 50 + i * zb + zb / 2, bw2 = zb * .38;
    const outl = a.filter((v) => v < lo || v > hi).map((v) => `<circle cx="${cx}" cy="${BY(Math.max(-80, Math.min(80, v)))}" r="2.5" fill="none" stroke="var(--mute)"/>`).join('');
    return `<line x1="${cx}" x2="${cx}" y1="${BY(hi)}" y2="${BY(lo)}" stroke="var(--ink2)"/><rect x="${cx - bw2 / 2}" y="${BY(q3)}" width="${bw2}" height="${BY(q1) - BY(q3)}" fill="${scale(['#9CC3E6','#E9A867','#B4532A'], (3 - ZONES.indexOf(z)) / 3)}" stroke="var(--ink2)"/><line x1="${cx - bw2 / 2}" x2="${cx + bw2 / 2}" y1="${BY(q2)}" y2="${BY(q2)}" stroke="var(--ink)" stroke-width="2"/>${outl}<text x="${cx}" y="226" class="axis" text-anchor="middle" style="font-size:11px;fill:var(--ink2)">${ZSHORT[z]}</text><text x="${cx}" y="240" class="axis mono" text-anchor="middle">σ ${f1(sd(a))}%, n = ${a.length}</text>`;
  }).join('');
  const mv = D.districts.map((x) => m.val(x)).filter(ok);
  return `<section>
    <div class="grid-k">${kpis}</div>
    <div class="grid2">
      ${card(`Округа: ${m.title}`, `<div class="segs">${Object.entries(metrics).map(([k, x]) => `<button class="seg ${S.metric === k ? 'on' : ''}" data-a="metric" data-v="${k}">${x.l}</button>`).join('')}</div>
        ${tilesMap(m.val, (v) => ok(v) ? scale(m.stops, (v - m.lo) / (m.hi - m.lo)) : '#EEF0EA', (v) => ok(v) ? m.lab(v) : '-')}
        ${gradLegend(m.lo, m.hi, m.stops, m.lab)}
        ${minis([['Минимум', m.lab(Math.min(...mv))], ['Медиана', m.lab(quant(mv, .5))], ['Максимум', m.lab(Math.max(...mv))]])}`)}
      ${card(`${esc(d.name)} округ`, `<div>${rows.map(([k, v]) => `<div class="row-kv"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div><h3>Отклонение урожайности от тренда, %</h3>${abars}`)}
    </div>
    ${card('Отклонение урожайности от тренда по округам и годам, %', `${mat}${gradLegend(-45, 45, ['#B23A2E','#F4F1EA','#1F5E36'], (v) => sg(v, Math.round) + '%')}`)}
    <div class="grid2">
      ${card('Индекс физического объема продукции растениеводства, 2017 = 100', svg(220, `<line x1="44" x2="628" y1="${vy(100)}" y2="${vy(100)}" stroke="var(--grey)" stroke-dasharray="4 4"/>${vol}`, 'Индекс физического объема'))}
      ${card('Распределение отклонений урожайности по агроклиматическим зонам', svg(250, box, 'Боксплоты по зонам'))}
    </div></section>`;
}

function crop() {
  const d = dist(S.d);
  const n = d.years.length, X = xsc(n);
  let [lo, hi] = niceRange(d.yld.concat(d.trend), 5); lo = Math.max(0, lo - 5); hi += 5;
  const Y = ysc(lo, hi, 240, 12, 26);
  const yc = svg(240, `${yAxis(lo, hi, 4, 240, 12, 26, fmt)}${d.years.map((y, i) => i % 2 === 0 || i === n - 1 ? `<text x="${X(i)}" y="234" class="axis" text-anchor="middle">${y}</text>` : '').join('')}
    <polyline points="${poly(d.trend.map((v, i) => [X(i), ok(v) ? Y(v) : null]))}" fill="none" stroke="var(--grey)" stroke-width="1.6" stroke-dasharray="5 4"/>
    <polyline points="${poly(d.yld.map((v, i) => [X(i), ok(v) ? Y(v) : null]))}" fill="none" stroke="#2E6B3E" stroke-width="2.4"/>
    ${d.yld.map((v, i) => ok(v) ? `<circle cx="${X(i)}" cy="${Y(v)}" r="4.5" fill="${v < d.trend[i] * .85 ? '#B23A2E' : '#2E6B3E'}" stroke="var(--card)" stroke-width="1.5"><title>${d.years[i]}: ${f1(v)} ц/га</title></circle>` : '').join('')}`, 'Урожайность и тренд');
  const tr = d.trend.filter(ok); const slope = (tr[tr.length - 1] - tr[0]) / (d.years.length - 1);

  const sc = D.scatter;
  const ax = ysc(-60, 60, 260, 12, 40), sx = lin(-3, 4, 44, W - 12);
  const dots = (xf) => sc.slice().sort((a, b) => (a[0] === S.d) - (b[0] === S.d)).map((p) => { const xv = xf(p); if (!ok(xv)) return ''; return `<circle cx="${xv}" cy="${ax(Math.max(-60, Math.min(60, p[4])))}" r="${p[0] === S.d ? 5 : 3}" fill="${p[0] === S.d ? '#C47F22' : '#7E8A80'}" opacity="${p[0] === S.d ? 1 : .35}"><title>${esc(dist(p[0]).name)}, ${p[1]}</title></circle>`; }).join('');
  const grid = [-60,-30,0,30,60].map((v) => `<line x1="44" x2="628" y1="${ax(v)}" y2="${ax(v)}" stroke="var(--grid)"/><text x="40" y="${ax(v) + 3.5}" class="axis mono" text-anchor="end">${sg(v)}%</text>`).join('');
  const sl = D.slope_dt;
  const sc1 = svg(260, `${grid}${[-3,-2,-1,0,1,2,3,4].map((t) => `<text x="${sx(t)}" y="234" class="axis mono" text-anchor="middle">${sg(t)}</text>`).join('')}${xlab(336, 254, 'Температура мая-июня, отклонение от нормы, °C')}${dots((p) => ok(p[2]) ? sx(Math.max(-3, Math.min(4, p[2]))) : null)}<line x1="${sx(-3)}" y1="${ax(sl * -3)}" x2="${sx(4)}" y2="${ax(sl * 4)}" stroke="var(--ink)" stroke-width="2"/>`, 'Температура и отклонение урожайности');
  const ls = D.coefs.find((c) => c.key === 'lspr'), bsp = ls.b / Math.log(2);
  const lx = lin(Math.log(.25), Math.log(3), 44, W - 12);
  const sc2 = svg(260, `${grid}${[.25,.5,1,2,3].map((t) => `<text x="${lx(Math.log(t))}" y="234" class="axis mono" text-anchor="middle">${Math.round(t * 100)}%</text>`).join('')}${xlab(336, 254, 'Осадки марта-мая, % нормы (логарифмическая шкала)')}${dots((p) => ok(p[5]) ? lx(Math.max(Math.log(.25), Math.min(Math.log(3), p[5]))) : null)}<line x1="${lx(Math.log(.25))}" y1="${ax(bsp * Math.log(.25))}" x2="${lx(Math.log(3))}" y2="${ax(bsp * Math.log(3))}" stroke="var(--ink)" stroke-width="2"/>`, 'Осадки весны и отклонение урожайности');
  const spr = sc.filter((p) => ok(p[5]) && ok(p[4])), rS = corr(spr.map((p) => p[5]), spr.map((p) => p[4]));
  const tpr = sc.filter((p) => ok(p[2]) && ok(p[4])), rT = corr(tpr.map((p) => p[2]), tpr.map((p) => p[4]));

  const C = D.corr, k = C.labels.length;
  const cm = heat({rows: [...Array(k).keys()], cols: [...Array(k).keys()], val: (i, j) => C.m[i][j], color: (v) => div(v, 1), label: (v) => f2(v), rowLab: (i) => C.labels[i], colLab: (j) => ['Откл.','Темп.','ГТК','Весна','Осень','Зима','Замор.'][j], rowW: 128, cellH: 30, w: 600, fs: 10, minW: 520});
  const ef = D.effects;
  const em = Math.ceil(Math.max(...ef.map((e) => Math.max(Math.abs(e.lo ?? e.e), Math.abs(e.hi ?? e.e)))) / 5) * 5;
  const fx = lin(-em, em, 250, 560);
  const forest = svg(ef.length * 38 + 40, `<line x1="${fx(0)}" x2="${fx(0)}" y1="8" y2="${ef.length * 38 + 12}" stroke="var(--grey)"/>${[-em, -em / 2, 0, em / 2, em].map((v) => `<text x="${fx(v)}" y="${ef.length * 38 + 32}" class="axis mono" text-anchor="middle">${sg(v)}%</text>`).join('')}${ef.map((e, i) => { const y = 24 + i * 38; const sig = e.lo != null && (e.lo > 0 || e.hi < 0); const c = !sig ? '#9AA195' : e.e < 0 ? '#B23A2E' : '#2E6B3E'; return `<text x="236" y="${y + 4}" text-anchor="end" style="font-size:12px;fill:var(--ink)">${esc(e.label)}</text>${e.lo != null ? `<line x1="${fx(e.lo)}" x2="${fx(e.hi)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>` : ''}<circle cx="${fx(e.e)}" cy="${y}" r="6" fill="${c}" stroke="var(--card)" stroke-width="1.5"/><text x="632" y="${y + 4}" text-anchor="end" class="axis mono" style="font-size:11px;fill:var(--ink2)">${sg(e.e, f1)}%</text>`; }).join('')}`, 'Эффекты факторов');
  const vv = D.districts.map((x) => [x, x.n_gtk, volatility(x)]);
  const [a0, b0] = regLine(vv.map((v) => v[1]), vv.map((v) => v[2])), rV = corr(vv.map((v) => v[1]), vv.map((v) => v[2]));
  const vx = lin(.6, 2.7, 44, W - 12), vy = ysc(5, 30, 240, 12, 40);
  const volc = svg(240, `${[5,10,15,20,25,30].map((v) => `<line x1="44" x2="628" y1="${vy(v)}" y2="${vy(v)}" stroke="var(--grid)"/><text x="40" y="${vy(v) + 3.5}" class="axis mono" text-anchor="end">${v}%</text>`).join('')}${[.75,1,1.25,1.5,1.75,2,2.5].map((g) => `<text x="${vx(g)}" y="214" class="axis mono" text-anchor="middle">${f2(g)}</text>`).join('')}${xlab(336, 234, 'Норма ГТК мая-июня, 1991-2020')}<line x1="${vx(.6)}" y1="${vy(a0 + b0 * .6)}" x2="${vx(2.7)}" y2="${vy(a0 + b0 * 2.7)}" stroke="var(--ink)" stroke-dasharray="5 4"/>${vv.map(([x, g, s]) => `<circle cx="${vx(Math.min(2.7, g))}" cy="${vy(Math.min(30, s))}" r="${x.id === S.d ? 7 : 5}" fill="${x.id === S.d ? '#C47F22' : '#2E6B3E'}" opacity=".85" data-a="d" data-v="${x.id}" style="cursor:pointer"><title>${esc(x.name)}: ГТК ${f2(g)}, σ ${f1(s)}%</title></circle>`).join('')}`, 'Климат и волатильность');
  return `<section><div class="grid2">
    ${card(`Урожайность озимой пшеницы, ц/га: ${esc(d.name)}`, `${yc}${legend([['#2E6B3E', 'факт'], ['var(--grey)', 'линейный тренд'], ['#B23A2E', 'ниже тренда более чем на 15%', 'dot']])}${minis([['Тренд, ц/га в год', sg(slope, f2)], ['Среднее, ц/га', f1(mean(d.yld.filter(ok)))], ['σ к тренду, %', f1(volatility(d))]])}`)}
    ${card('Температура мая-июня и отклонение урожайности', `${sc1}${minis([['Наклон, % на 1 °C', sg(sl, f2)], ['r Пирсона', f2(rT)], ['n', String(tpr.length)]])}`)}
    ${card('Осадки весны и отклонение урожайности', `${sc2}${minis([['Эффект удвоения', sg(ls.b, f1) + '%'], ['r Пирсона', f2(rS)], ['p (кластер. по годам)', pv(ls.p)]])}`)}
    ${card('Норма увлажнения и волатильность урожайности по округам', `${volc}${minis([['r Пирсона', f2(rV)], ['Наклон, п.п. на 1,0 ГТК', sg(b0, f1)], ['n', '26']])}`)}
    ${card('Корреляционная матрица погодных факторов', cm)}
    ${card('Эффекты факторов, % к тренду (1σ, 95% ДИ)', forest)}
  </div></section>`;
}

function market() {
  const d = dist(S.d);
  const e = S.cmp, s0 = String(+e - 1);
  const p0 = d.margin_parts[s0], p1 = d.margin_parts[e];
  let wf = '';
  if (p0 && p1) {
    const [y0, pr0, c0] = p0, [y1, pr1, c1] = p1;
    const m0 = y0 / 10 * pr0 - c0, m1 = y1 / 10 * pr1 - c1;
    const dP = (pr1 - pr0) * y0 / 10, dY = (y1 - y0) / 10 * pr1;
    const steps = [[s0, 0, m0, 1], ['Цена', m0, m0 + dP], ['Урожайность', m0 + dP, m0 + dP + dY], ['Затраты', m0 + dP + dY, m1], [e, 0, m1, 1]];
    let lo = Math.min(0, ...steps.flatMap((s) => [s[1], s[2]])), hi = Math.max(0, ...steps.flatMap((s) => [s[1], s[2]])); const pad = (hi - lo) * .12; lo -= pad; hi += pad;
    const Y = ysc(lo, hi, 260, 22, 26), bw = (W - 52) / 5;
    wf = svg(260, `<line x1="40" x2="628" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--grey)"/>${steps.map(([l, a, b, tot], i) => { const t = Y(Math.max(a, b)), bt = Y(Math.min(a, b)), dd = b - a; const x = 40 + i * bw; return `<rect x="${x + bw * .15}" y="${t}" width="${bw * .7}" height="${Math.max(1.5, bt - t)}" rx="3" fill="${tot ? (b < 0 ? '#B23A2E' : '#3E4A42') : dd >= 0 ? '#2E7D4F' : '#C47F22'}"/><text x="${x + bw / 2}" y="${t - 6}" text-anchor="middle" class="axis mono" style="font-size:12px;fill:var(--ink);font-weight:600">${tot ? fmt(b) : sg(dd)}</text><text x="${x + bw / 2}" y="252" text-anchor="middle" class="axis" style="font-size:11px;fill:var(--ink2)">${l}</text>`; }).join('')}`, 'Каскад маржи');
  }
  const mc = d.mc; const yB = mc.trend, pB = D.meta.P0, cB = mc.cost;
  const yS = yB * (1 + S.dy / 100), pS = pB * (1 + S.dp / 100), cS = cB * (1 + 0.1 * S.dd / 100);
  const baseM = yB / 10 * pB - cB, scenM = yS / 10 * pS - cS;
  const pc = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v) + '%';
  const sliders = [['dp', 'Цена пшеницы', `${pc(S.dp)}, ${fmt(pS)} ₽/т`], ['dy', 'Урожайность', `${pc(S.dy)}, ${f1(yS)} ц/га`], ['dd', 'Цена дизеля', pc(S.dd)]].map(([k, l, t]) => `<div class="slider"><div class="t"><label for="sl-${k}">${l}</label><span class="num" style="font-weight:600">${t}</span></div><input type="range" id="sl-${k}" data-s="${k}" min="-30" max="30" step="1" value="${S[k]}"></div>`).join('');
  const tor = [['Цена пшеницы', yB / 10 * pB * .2], ['Урожайность', yB / 10 * pB * .2], ['Затраты кроме ГСМ', cB * .9 * .2], ['Цена дизеля', cB * .1 * .2]].sort((a, b) => b[1] - a[1]);
  const tm = tor[0][1], tx = lin(-tm, tm, 250, 570);
  const tornado = svg(tor.length * 34 + 30, `<line x1="${tx(0)}" x2="${tx(0)}" y1="4" y2="${tor.length * 34 + 4}" stroke="var(--grey)"/>${tor.map(([l, v], i) => { const y = 8 + i * 34; const up = l.startsWith('Затраты') || l.startsWith('Цена дизеля'); return `<text x="150" y="${y + 15}" text-anchor="end" style="font-size:12px;fill:var(--ink)">${l}</text><rect x="${tx(-v)}" y="${y}" width="${tx(0) - tx(-v)}" height="22" fill="#C47F22"/><rect x="${tx(0)}" y="${y}" width="${tx(v) - tx(0)}" height="22" fill="#2E7D4F"/><text x="${tx(-v) - 4}" y="${y + 15}" text-anchor="end" class="axis mono">${'-' + fmt(v)}</text><text x="${tx(v) + 4}" y="${y + 15}" class="axis mono">${'+' + fmt(v)}</text><title>${up ? 'рост на 20% снижает маржу' : 'рост на 20% повышает маржу'}</title>`; }).join('')}<text x="${tx(0)}" y="${tor.length * 34 + 24}" text-anchor="middle" class="axis mono">маржа ${fmt(baseM)} ₽/га</text>`, 'Чувствительность маржи');
  const pr = D.prices; const n = pr.length; const X = (i) => 44 + i * (W - 56) / (n - 1);
  const [plo, phi] = niceRange(pr.map((p) => p[1]), 2000);
  const PY = ysc(plo, phi, 230, 12, 26);
  const yearTicks = (arr, Xf, y) => arr.map((p, i) => p[0].endsWith('-01') ? `<text x="${Xf(i)}" y="${y}" class="axis" text-anchor="middle">${p[0].slice(0, 4)}</text>` : '').join('');
  const priceC = svg(230, `${yAxis(plo, phi, 4, 230, 12, 26, (v) => fmt(v))}${yearTicks(pr, X, 224)}<polyline points="${poly(pr.map((p, i) => [X(i), PY(p[1])]))}" fill="none" stroke="#2E6B3E" stroke-width="2.2"/><polyline points="${poly(D.stl.trend.map((v, i) => [X(i), PY(v)]))}" fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 4"/>`, 'Цена пшеницы');
  const st = D.stl, sn = st.t.length, SX = (i) => 44 + i * (W - 56) / (sn - 1);
  const panel = (vals, y0, h, title, bars) => { const [a, b] = niceRange(vals, bars ? 5 : 2); const Yp = ysc(a, b, y0 + h, y0 + 22, 0); return `<text x="48" y="${y0 + 10}" style="font-size:11px;fill:var(--ink2);font-weight:600">${title}</text>${[a, 0, b].filter((v, i, arr) => arr.indexOf(v) === i && v >= a && v <= b).map((v) => `<line x1="44" x2="628" y1="${Yp(v)}" y2="${Yp(v)}" stroke="var(--grid)"/><text x="40" y="${Yp(v) + 3.5}" class="axis mono" text-anchor="end">${sg(v, Math.round)}</text>`).join('')}${bars ? vals.map((v, i) => `<rect x="${SX(i) - 1.5}" y="${Math.min(Yp(0), Yp(v))}" width="3" height="${Math.abs(Yp(v) - Yp(0))}" fill="${Math.abs(v) > 2 * sd(vals) ? '#B23A2E' : '#9AA195'}"/>`).join('') : `<polyline points="${poly(vals.map((v, i) => [SX(i), Yp(v)]))}" fill="none" stroke="#2E6B3E" stroke-width="1.8"/>`}`; };
  const stl = svg(330, panel(st.seas, 0, 110, 'Сезонная компонента, %') + panel(st.resid, 118, 110, 'Остаток, % (красные: |e| > 2σ)', true) + yearTicks(st.t.map((t) => [t]), SX, 248) + `<text x="44" y="272" style="font-size:11px;fill:var(--ink2);font-weight:600">Тренд, ₽/т</text>` + (() => { const [a, b] = niceRange(st.trend, 2000); const Yt = ysc(a, b, 330, 278, 4); return `<polyline points="${poly(st.trend.map((v, i) => [SX(i), Yt(v)]))}" fill="none" stroke="var(--ink)" stroke-width="1.8"/><text x="40" y="${Yt(b) + 3.5}" class="axis mono" text-anchor="end">${fmt(b / 1000)}k</text><text x="40" y="${Yt(a) + 3.5}" class="axis mono" text-anchor="end">${fmt(a / 1000)}k</text>`; })(), 'STL-разложение цены');
  const se = D.season; const SY = ysc(-10, 10, 220, 10, 24), sbw = (W - 52) / 12;
  const seas = svg(220, `<line x1="40" x2="628" y1="${SY(0)}" y2="${SY(0)}" stroke="var(--grey)"/>${[-10,-5,0,5,10].map((v) => `<text x="36" y="${SY(v) + 3.5}" class="axis mono" text-anchor="end">${sg(v)}%</text>`).join('')}${se.map((s, i) => { const x = 40 + i * sbw; const a = SY(0), c = SY(s.idx); return `<rect x="${x + sbw * .18}" y="${Math.min(a, c)}" width="${sbw * .64}" height="${Math.max(1, Math.abs(c - a))}" rx="2" fill="${s.lo > 0 ? '#2E7D4F' : s.hi < 0 ? '#C47F22' : '#B7BDB1'}"/><line x1="${x + sbw / 2}" x2="${x + sbw / 2}" y1="${SY(s.hi)}" y2="${SY(s.lo)}" stroke="var(--ink)" stroke-width="1.2"/><text x="${x + sbw / 2}" y="214" class="axis" text-anchor="middle">${MON[s.m - 1]}</text>`; }).join('')}`, 'Сезонный индекс цены');
  const R = D.ret, rv = R.vals, rlo = -20, rhi = 20, nb = 20, hb = (rhi - rlo) / nb;
  const cnt = new Array(nb).fill(0); rv.forEach((v) => { const k = Math.min(nb - 1, Math.max(0, Math.floor((v - rlo) / hb))); cnt[k]++; });
  const cmx = Math.max(...cnt), HX = lin(rlo, rhi, 44, 628), HY = ysc(0, cmx * 1.1, 220, 10, 26);
  const npdf = (x) => rv.length * hb * Math.exp(-((x - R.mean) ** 2) / (2 * R.sd ** 2)) / (R.sd * Math.sqrt(2 * Math.PI));
  const curve = []; for (let x = rlo; x <= rhi; x += .5) curve.push([HX(x), HY(npdf(x))]);
  const hist = svg(220, `${cnt.map((c, k) => `<rect x="${HX(rlo + k * hb) + .6}" y="${HY(c)}" width="${HX(hb) - HX(0) - 1.2}" height="${HY(0) - HY(c)}" fill="#6E9C78"/>`).join('')}<polyline points="${poly(curve)}" fill="none" stroke="var(--ink)" stroke-width="1.6"/><line x1="44" x2="628" y1="${HY(0)}" y2="${HY(0)}" stroke="var(--grey)"/>${[-20,-10,0,10,20].map((v) => `<text x="${HX(v)}" y="214" class="axis mono" text-anchor="middle">${sg(v)}%</text>`).join('')}`, 'Распределение месячных изменений цены');
  const pa = D.parity; const pn = pa.length; const PX = (i) => 44 + i * (W - 56) / (pn - 1);
  const [alo, ahi] = niceRange(pa.map((p) => p[1]), 1);
  const AY = ysc(alo, ahi, 220, 10, 24);
  const parity = svg(220, `<rect x="44" y="${AY(D.meta.par_mean + D.meta.par_sd)}" width="584" height="${AY(D.meta.par_mean - D.meta.par_sd) - AY(D.meta.par_mean + D.meta.par_sd)}" fill="var(--line2)"/><line x1="44" x2="628" y1="${AY(D.meta.par_mean)}" y2="${AY(D.meta.par_mean)}" stroke="var(--grey)" stroke-dasharray="4 4"/>${yAxis(alo, ahi, 4, 220, 10, 24, f1)}${yearTicks(pa, PX, 214)}<polyline points="${poly(pa.map((p, i) => [PX(i), AY(p[1])]))}" fill="none" stroke="#B4532A" stroke-width="2.4"/>`, 'Паритет');
  const parNow = pa[pa.length - 1][1], parZ = (parNow - D.meta.par_mean) / D.meta.par_sd;
  const PYd = D.price_yield, pts = PYd.pts;
  const qx = lin(Math.min(...pts.map((p) => p[1])) - 3, Math.max(...pts.map((p) => p[1])) + 3, 54, 620);
  const [qlo, qhi] = niceRange(pts.map((p) => p[2]), 2000), QY = ysc(qlo, qhi, 240, 12, 40);
  const [ra, rb] = regLine(pts.map((p) => p[1]), pts.map((p) => p[2]));
  const xs = pts.map((p) => p[1]), x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2;
  const pyc = svg(240, `${yAxis(qlo, qhi, 4, 240, 12, 40, fmt, 54)}${[25, 30, 35, 40, 45, 50].filter((v) => v > x0 && v < x1).map((v) => `<text x="${qx(v)}" y="216" class="axis mono" text-anchor="middle">${v}</text>`).join('')}${xlab(336, 234, 'Урожайность пшеницы в крае, ц/га')}<line x1="${qx(x0)}" y1="${QY(ra + rb * x0)}" x2="${qx(x1)}" y2="${QY(ra + rb * x1)}" stroke="var(--ink)" stroke-dasharray="5 4"/>${pts.map(([y, a, b]) => `<circle cx="${qx(a)}" cy="${QY(b)}" r="5" fill="#3F6FA8"/><text x="${qx(a) + 8}" y="${QY(b) + 4}" class="axis mono">${y}</text>`).join('')}`, 'Цена и урожайность');
  return `<section><div class="grid2">
    ${card('Цена производителей на пшеницу, ₽/т', `${priceC}${legend([['#2E6B3E', 'цена'], ['var(--ink)', 'тренд STL']])}${minis([['Последнее значение', fmt(pr[n - 1][1]) + ' ₽/т'], ['Среднее за 12 мес.', fmt(D.meta.P0) + ' ₽/т'], ['Изменение за год', sg((pr[n - 1][1] / pr[n - 13][1] - 1) * 100, f1) + '%']])}`)}
    ${card('STL-разложение логарифма цены', stl)}
    ${card('Сезонный индекс цены по месяцам, % (95% ДИ)', `${seas}${minis([['Критерий Краскела-Уоллиса', 'H = ' + f1(D.meta.kw_h)], ['p', pv(D.meta.kw_p)], ['Амплитуда', f1(Math.max(...se.map((s) => s.idx)) - Math.min(...se.map((s) => s.idx))) + ' п.п.']])}`)}
    ${card('Распределение месячных изменений цены, %', `${hist}${minis([['Среднее', sg(R.mean, f2) + '%'], ['σ', f2(R.sd) + '%'], ['Асимметрия', f2(R.skew)], ['Эксцесс', f2(R.kurt)], ['Jarque-Bera, p', pv(R.jb_p)], ['Автокорр. лаг 1', f2(R.ac1)]])}`)}
    ${card('Паритет: тонн пшеницы за тонну дизельного топлива', `${parity}${legend([['#B4532A', 'паритет'], ['var(--line2)', 'среднее ± σ', 'box']])}${minis([['Текущее значение', f2(parNow)], ['Среднее ± σ', `${f2(D.meta.par_mean)} ± ${f2(D.meta.par_sd)}`], ['z-оценка', sg(parZ, f2)]])}`)}
    ${card('Урожайность края и цена сельхозгода, 2017-2025', `${pyc}${minis([['r Пирсона', f2(PYd.r)], ['p', pv(PYd.p)], ['n', String(pts.length)]])}`)}
    ${card(`Факторный анализ маржи, ₽/га: ${esc(d.name)}`, `<div class="segs">${['2024', '2025', '2026'].filter((y) => d.margin_parts[y] && d.margin_parts[String(+y - 1)]).map((y) => `<button class="seg ${S.cmp === y ? 'on' : ''}" data-a="cmp" data-v="${y}">${+y - 1}-${y}</button>`).join('')}</div>${wf}`)}
    ${card(`Маржа 2027, ₽/га: ${esc(d.name)}`, `${sliders}${minis([['Базовая маржа', fmt(baseM) + ' ₽/га'], ['Сценарий', fmt(scenM) + ' ₽/га', scenM < 0 ? 'var(--soft-bad)' : 'var(--soft-ok)'], ['Цена безубыточности', fmt(cS / (yS / 10)) + ' ₽/т']])}<button class="seg" data-a="reset" style="align-self:flex-start">Сбросить</button><h3>Чувствительность маржи к изменению фактора на ±20%</h3>${tornado}`)}
  </div></section>`;
}

function risk() {
  const d = dist(S.d);
  const key = S.analog;
  const src = key === '-1' ? D.normal : D.stress[key];
  const ms = {}; D.districts.forEach((x) => { if (src[x.id]) ms[x.id] = src[x.id].margin; });
  const loss = D.districts.filter((x) => ms[x.id] < 0);
  const A = D.districts.reduce((s, x) => s + (x.area || 0), 0);
  const areaLoss = loss.reduce((s, x) => s + x.area, 0) / A;
  const krM = D.districts.reduce((s, x) => s + (ms[x.id] || 0) * (x.area || 0) * 1000, 0) / 1e9;
  const yK = D.districts.reduce((s, x) => s + (src[x.id] ? src[x.id].yld * x.area : 0), 0) / A;
  const yN = D.districts.reduce((s, x) => s + (D.normal[x.id] ? D.normal[x.id].yld * x.area : 0), 0) / A;
  const MM = 40000;
  const map = tilesMap((x) => ms[x.id], (v) => div(v, MM * .7), (v) => ok(v) ? (v < 0 ? '-' : '') + f1(Math.abs(v) / 1000) + 'k' : '-');
  const order = D.districts.slice().sort((a, b) => b.n_gtk - a.n_gtk).map((x) => x.id);
  const scen = ['-1', ...SCEN];
  const smat = heat({rows: order, cols: scen, val: (r, c) => { const s = c === '-1' ? D.normal : D.stress[c]; return s[r] ? s[r].margin : null; }, color: (v) => div(v, MM * .7),
    label: (v) => ok(v) ? (v < 0 ? '-' : '') + f1(Math.abs(v) / 1000) : '-', rowLab: (r) => dist(r).name, colLab: (c) => c === '-1' ? 'тренд' : c, rowW: 140, cellH: 20, w: 760, fs: 10, clickRow: true});
  const q = d.mc.q; const all = D.districts.flatMap((x) => [x.mc.q[2], x.mc.q[197]]);
  const lo = Math.floor(Math.min(...all) / 10000) * 10000, hi = Math.ceil(Math.max(...all) / 10000) * 10000;
  const nb = 28, bw = (hi - lo) / nb; const cnt = new Array(nb).fill(0); q.forEach((v) => { const k = Math.floor((v - lo) / bw); if (k >= 0 && k < nb) cnt[k]++; });
  const cm = Math.max(...cnt); const hx = lin(lo, hi, 44, 628);
  const ticks = []; for (let v = lo; v <= hi; v += 20000) ticks.push(v);
  const tk = ticks.map((v) => `<text x="${hx(v)}" y="204" class="axis mono" text-anchor="middle">${(v < 0 ? '-' : '') + fmt(Math.abs(v) / 1000)}k</text>`).join('');
  const hist = svg(210, `<rect x="44" y="10" width="${Math.max(0, hx(0) - 44)}" height="176" fill="var(--soft-bad)"/>${cnt.map((c, k) => { const h = c / cm * 170; return `<rect x="${hx(lo + k * bw) + .6}" y="${186 - h}" width="${hx(bw) - hx(0) - 1.2}" height="${h}" fill="#2E6B3E"/>`; }).join('')}<line x1="${hx(d.mc.q05)}" x2="${hx(d.mc.q05)}" y1="10" y2="186" stroke="#B23A2E" stroke-width="2" stroke-dasharray="4 3"/><line x1="${hx(d.mc.mean)}" x2="${hx(d.mc.mean)}" y1="10" y2="186" stroke="var(--ink)" stroke-width="1.5"/><line x1="44" x2="628" y1="186" y2="186" stroke="var(--grey)"/>${tk}`, 'Распределение маржи 2027');
  const CY = ysc(0, 1, 210, 10, 24);
  const cdfK = (x) => x.mc.q.map((v, i) => [hx(Math.max(lo, Math.min(hi, v))), CY((i + .5) / 200)]);
  const cdf = svg(210, `${[0, .25, .5, .75, 1].map((p) => `<line x1="44" x2="628" y1="${CY(p)}" y2="${CY(p)}" stroke="var(--grid)"/><text x="40" y="${CY(p) + 3.5}" class="axis mono" text-anchor="end">${pct(p)}</text>`).join('')}<line x1="${hx(0)}" x2="${hx(0)}" y1="10" y2="186" stroke="#B23A2E" stroke-dasharray="4 3"/>${D.districts.filter((x) => x.id !== d.id).map((x) => `<polyline points="${poly(cdfK(x))}" fill="none" stroke="var(--grey)" stroke-width="1" opacity=".45"/>`).join('')}<polyline points="${poly(cdfK(d))}" fill="none" stroke="#C47F22" stroke-width="2.6"/>${tk}`, 'Функция распределения маржи');
  const ranked = D.districts.slice().sort((a, b) => b.mc.ploss - a.mc.ploss);
  const rMax = Math.max(ranked[0].mc.ploss, .01);
  const rank = ranked.map((x) => `<button class="rank" data-a="d" data-v="${x.id}"><span style="font-size:12px;font-weight:${x.id === S.d ? 700 : 400}">${esc(x.name)}</span><span class="bar"><span style="width:${x.mc.ploss / rMax * 100}%;background:${scale(['#9DBFA4','#E9A867','#B23A2E'], x.mc.ploss / .45)}"></span></span><span class="num" style="font-size:12px;text-align:right">${pct(x.mc.ploss)}</span></button>`).join('');
  const rr = D.districts.map((x) => [x, volatility(x), x.mc.mean, x.mc.q05]);
  const RX = lin(8, 26, 54, 620), [ylo, yhi] = niceRange(rr.map((v) => v[2]), 10000), RY = ysc(ylo, yhi, 260, 12, 40);
  const amax = Math.max(...D.districts.map((x) => x.area || 0));
  const rrc = svg(260, `${yAxis(ylo, yhi, Math.round((yhi - ylo) / 10000), 260, 12, 40, (v) => fmt(v / 1000) + 'k', 54)}${[10, 14, 18, 22, 26].map((v) => `<text x="${RX(v)}" y="236" class="axis mono" text-anchor="middle">${v}%</text>`).join('')}${xlab(336, 254, 'σ отклонений урожайности от тренда, %')}${rr.map(([x, s, mm]) => `<circle cx="${RX(Math.max(8, Math.min(26, s)))}" cy="${RY(mm)}" r="${4 + 10 * Math.sqrt((x.area || 0) / amax)}" fill="${x.id === S.d ? '#C47F22' : scale(['#9DBFA4','#E9A867','#B23A2E'], x.mc.ploss / .45)}" opacity=".8" stroke="var(--card)" data-a="d" data-v="${x.id}" style="cursor:pointer"><title>${esc(x.name)}: σ ${f1(s)}%, маржа ${fmt(mm)} ₽/га</title></circle>`).join('')}`, 'Риск и доходность');
  const zones = ZONES.map((z) => [z, D.districts.filter((x) => x.zone === z)]).filter((z) => z[1].length).map(([z, a]) => [z, mean(a.map((x) => x.mc.ploss)), a.length]);
  return `<section>
    ${card('Стресс-тест: повтор погоды исторического сезона в 2027 году', `<div class="segs">${scen.map((k) => `<button class="seg ${S.analog === k ? 'on' : ''}" data-a="analog" data-v="${k}">${k === '-1' ? 'Тренд' : k}</button>`).join('')}</div>
      ${minis([['Округов с убытком', `${loss.length} из 26`, loss.length > 5 ? 'var(--soft-bad)' : ''], ['Доля площади с убытком', pct(areaLoss)], ['Маржа края', f1(krM) + ' млрд ₽'], ['Урожайность края', f1(yK) + ' ц/га'], ['К тренду', sg((yK / yN - 1) * 100, f1) + '%']])}`)}
    <div class="grid2">
      ${card(`Маржа 2027 по округам, ₽/га: сценарий ${key === '-1' ? 'тренд' : key}`, `${map}${gradLegend(-MM, MM, ['#B23A2E','#F4F1EA','#1F5E36'], (v) => sg(v / 1000, Math.round) + 'k')}`)}
      ${card(`Монте-Карло, маржа 2027, ₽/га: ${esc(d.name)}`, `${hist}${legend([['var(--ink)', 'среднее'], ['#B23A2E', 'квантиль 5%'], ['var(--soft-bad)', 'зона убытка', 'box']])}${minis([['P(убыток)', pct(d.mc.ploss)], ['Квантиль 5%', fmt(d.mc.q05) + ' ₽'], ['Среднее', fmt(d.mc.mean) + ' ₽'], ['Медиана', fmt(q[99]) + ' ₽']])}`)}
    </div>
    ${card('Матрица стресс-теста: маржа 2027 по округам и сценариям, тыс. ₽/га', `${smat}${gradLegend(-MM, MM, ['#B23A2E','#F4F1EA','#1F5E36'], (v) => sg(v / 1000, Math.round))}`)}
    <div class="grid2">
      ${card('Функция распределения маржи 2027 по округам', `${cdf}${legend([['#C47F22', esc(d.name)], ['var(--grey)', 'остальные округа']])}${minis([['P(убыток) края', pct(D.krai_mc.ploss)], ['Маржа края, квантиль 5%', f1(D.krai_mc.q05) + ' млрд ₽'], ['Маржа края, среднее', f1(D.krai_mc.mean) + ' млрд ₽']])}`)}
      ${card('Риск и доходность по округам (размер: площадь пшеницы)', `${rrc}${minis(zones.map(([z, p, n]) => [`${z}, n = ${n}`, pct(p)]))}`)}
    </div>
    ${card('Вероятность убыточного сезона 2027 по округам', `<div class="ranks">${rank}</div>`)}
  </section>`;
}

function model() {
  const m = D.meta, G = D.diag;
  const coefs = D.coefs.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.unit)}</td><td class="r num"><b>${sg(c.b, f2)}</b></td><td class="r num">${f2(c.lo)}; ${f2(c.hi)}</td><td class="r num">${pv(c.p)}</td></tr>`).join('');
  const sp = D.specs, smax = Math.ceil(Math.max(...sp.map((s) => s.dist)) / 5) * 5, SX = lin(0, smax, 250, 600);
  const specs = svg(sp.length * 44 + 30, `${[0, 5, 10, 15, smax].filter((v, i, a) => a.indexOf(v) === i).map((v) => `<line x1="${SX(v)}" x2="${SX(v)}" y1="4" y2="${sp.length * 44}" stroke="var(--grid)"/><text x="${SX(v)}" y="${sp.length * 44 + 16}" class="axis mono" text-anchor="middle">${v}%</text>`).join('')}${sp.map((s, i) => { const y = 6 + i * 44; const best = i === sp.length - 1; return `<text x="240" y="${y + 16}" text-anchor="end" style="font-size:12px;fill:var(--ink);font-weight:${best ? 700 : 400}">${esc(s.name)}</text><rect x="${SX(0)}" y="${y}" width="${SX(s.krai) - SX(0)}" height="15" fill="${best ? '#2E6B3E' : '#9DBFA4'}"/><rect x="${SX(0)}" y="${y + 17}" width="${SX(s.dist) - SX(0)}" height="15" fill="${best ? '#C47F22' : '#E9C79A'}"/><text x="${SX(s.krai) + 4}" y="${y + 12}" class="axis mono">${f1(s.krai)}</text><text x="${SX(s.dist) + 4}" y="${y + 29}" class="axis mono">${f1(s.dist)}</text>`; }).join('')}`, 'Сравнение спецификаций');
  const bt = D.backtest; const nb = bt.length, BX = xsc(nb);
  const [blo, bhi] = niceRange(bt.flatMap((x) => [x.act, x.pred, x.naive]), 5);
  const BY = ysc(blo - 5, bhi + 5, 240, 12, 26);
  const btc = svg(240, `${yAxis(blo - 5, bhi + 5, 4, 240, 12, 26, fmt)}${bt.map((x, i) => `<text x="${BX(i)}" y="234" class="axis" text-anchor="middle">${x.year}</text>`).join('')}
    <polyline points="${poly(bt.map((x, i) => [BX(i), BY(x.naive)]))}" fill="none" stroke="var(--grey)" stroke-width="1.6" stroke-dasharray="5 4"/>
    <polyline points="${poly(bt.map((x, i) => [BX(i), BY(x.act)]))}" fill="none" stroke="var(--ink)" stroke-width="2.4"/>
    ${bt.map((x, i) => `<circle cx="${BX(i)}" cy="${BY(x.pred)}" r="5" fill="#C47F22" stroke="var(--card)" stroke-width="1.5"><title>${x.year}: факт ${f1(x.act)}, модель ${f1(x.pred)}, тренд ${f1(x.naive)}</title></circle>`).join('')}`, 'Ретропрогноз');
  const fr = G.fit_res, FX = lin(-40, 40, 44, 628), FY = ysc(-60, 60, 240, 12, 40);
  const resid = svg(240, `${yAxis(-60, 60, 4, 240, 12, 40, (v) => sg(v, Math.round))}${[-40, -20, 0, 20, 40].map((v) => `<text x="${FX(v)}" y="216" class="axis mono" text-anchor="middle">${sg(v)}</text>`).join('')}${xlab(336, 234, 'Прогноз модели, % к тренду')}${fr.map(([f, r]) => `<circle cx="${FX(Math.max(-40, Math.min(40, f)))}" cy="${FY(Math.max(-60, Math.min(60, r)))}" r="2.6" fill="#3F6FA8" opacity=".5"/>`).join('')}<line x1="44" x2="628" y1="${FY(0)}" y2="${FY(0)}" stroke="var(--ink)"/>`, 'Остатки против прогноза');
  const QX = lin(-3.5, 3.5, 44, 628), QY = ysc(-4, 4, 240, 12, 40);
  const qq = svg(240, `${yAxis(-4, 4, 4, 240, 12, 40, (v) => sg(v, Math.round))}${[-3, -2, -1, 0, 1, 2, 3].map((v) => `<text x="${QX(v)}" y="216" class="axis mono" text-anchor="middle">${sg(v)}</text>`).join('')}${xlab(336, 234, 'Теоретические квантили N(0, 1)')}<line x1="${QX(-3.5)}" y1="${QY(-3.5)}" x2="${QX(3.5)}" y2="${QY(3.5)}" stroke="var(--ink)" stroke-dasharray="5 4"/>${G.qq.map(([t, v]) => `<circle cx="${QX(t)}" cy="${QY(Math.max(-4, Math.min(4, v)))}" r="2.4" fill="#2E6B3E" opacity=".6"/>`).join('')}`, 'Q-Q plot');
  const ro = D.roll, RX = xsc(ro.length, 54, 20);
  const rpanel = (k, y0, title, col) => { const vals = ro.flatMap((r) => r[k]); const [a, b] = niceRange(vals.concat([0]), 5); const Yp = ysc(a, b, y0 + 130, y0 + 18, 4); return `<text x="54" y="${y0 + 12}" style="font-size:11px;fill:var(--ink2);font-weight:600">${title}</text>${[a, 0, b].map((v) => `<line x1="54" x2="620" y1="${Yp(v)}" y2="${Yp(v)}" stroke="${v === 0 ? 'var(--grey)' : 'var(--grid)'}"/><text x="50" y="${Yp(v) + 3.5}" class="axis mono" text-anchor="end">${sg(v, Math.round)}</text>`).join('')}<polygon points="${poly(ro.map((r, i) => [RX(i), Yp(r[k][2])]))} ${poly(ro.map((r, i) => [RX(i), Yp(r[k][1])]).reverse())}" fill="${col}" opacity=".18"/><polyline points="${poly(ro.map((r, i) => [RX(i), Yp(r[k][0])]))}" fill="none" stroke="${col}" stroke-width="2.2"/>`; };
  const rollc = svg(300, rpanel('dt', 0, 'Температура мая-июня, % на 1 °C', '#B23A2E') + rpanel('lspr', 140, 'Осадки весны, % на 1 ед. лог.', '#2E6B3E') + ro.map((r, i) => `<text x="${RX(i)}" y="294" class="axis" text-anchor="middle">${r.year}</text>`).join(''), 'Устойчивость коэффициентов');
  const CL = D.clusters, leaves = CL.leaves, nl = leaves.length;
  const maxH = Math.max(...CL.dcoord.flat());
  const DX = (v) => 30 + (v - 5) / (nl * 10 - 10) * 590, DY = ysc(0, maxH, 300, 10, 130);
  const clOf = {}; CL.ids.forEach((id, i) => { clOf[id] = CL.cl[i]; });
  const dend = svg(300, `${CL.icoord.map((ic, i) => { const dc = CL.dcoord[i]; return `<polyline points="${ic.map((x, j) => `${DX(x).toFixed(1)},${DY(dc[j]).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink2)" stroke-width="1.2"/>`; }).join('')}${leaves.map((id, i) => { const x = DX(5 + i * 10); return `<circle cx="${x}" cy="${DY(0) + 6}" r="4" fill="${CL_COL[(clOf[id] - 1) % 4]}"/><text x="${x + 3}" y="${DY(0) + 16}" transform="rotate(-90 ${x} ${DY(0) + 16})" text-anchor="end" style="font-size:10px;fill:var(--ink2)">${esc(dist(id).name)}</text>`; }).join('')}`, 'Дендрограмма');
  const clMap = tilesMap((x) => clOf[x.id], (v) => ok(v) ? mix(CL_COL[(v - 1) % 4], '#FFFFFF', .25) : '#EEF0EA', (v) => ok(v) ? 'кл. ' + v : '-');
  const clStats = [1, 2, 3, 4].map((c) => { const ds = D.districts.filter((x) => clOf[x.id] === c); return ds.length ? [`Кластер ${c}, n = ${ds.length}`, `σ ${f1(mean(ds.map(volatility)))}%`] : null; }).filter(Boolean);
  const tests = [
    ['R² (внутри округов)', f3(G.r2_within), ''],
    ['Шапиро-Уилк, нормальность остатков', f3(G.sw_stat), pv(G.sw_p)],
    ['Jarque-Bera, нормальность остатков', f2(G.jb_stat), pv(G.jb_p)],
    ['Бройша-Пагана, гетероскедастичность', f1(G.bp_stat), pv(G.bp_p)],
    ['Дарбина-Уотсона', f2(G.dw), ''],
    ['Асимметрия / эксцесс остатков', `${f2(G.skew)} / ${f2(G.kurt)}`, ''],
    ...Object.entries(G.vif).map(([k, v]) => [`VIF: ${{dt: 'температура', lspr: 'весна', so: 'осень', win: 'зима'}[k]}`, f2(v), '']),
    ['Индекс Морана: урожайность (тренд 2025)', f3(D.moran.yld.I), pv(D.moran.yld.p)],
    ['Индекс Морана: волатильность', f3(D.moran.vol.I), pv(D.moran.vol.p)],
    ['Индекс Морана: отклонение 2020', f3(D.moran.a2020.I), pv(D.moran.a2020.p)]
  ].map(([a, b, c]) => `<tr><td>${a}</td><td class="r num">${b}</td><td class="r num">${c}</td></tr>`).join('');
  return `<section><div class="grid2">
    ${card('Коэффициенты панельной модели (FE по округам, SE кластеризованы по годам)', `<div class="tblwrap"><table style="min-width:480px"><thead><tr><th>Фактор</th><th>Единица</th><th class="r">Эффект, %</th><th class="r">95% ДИ</th><th class="r">p</th></tr></thead><tbody>${coefs}</tbody></table></div>${minis([['Наблюдений', String(m.n_obs)], ['Округов', String(m.n_districts)], ['Годы', `${m.years[0]}-${m.years[1]}`]])}`)}
    ${card('Ошибка ретропрогноза (leave-one-year-out), MAPE, %', `${specs}${legend([['#2E6B3E', 'край', 'box'], ['#C47F22', 'округа', 'box']])}`)}
    ${card('Ретропрогноз урожайности края, ц/га', `${btc}${legend([['var(--ink)', 'факт'], ['#C47F22', 'модель', 'dot'], ['var(--grey)', 'тренд']])}${minis([['MAPE модели', f1(m.mape) + '%'], ['MAPE тренда', f1(m.mape_naive) + '%'], ['RMSE модели', f2(m.sd_bt) + ' ц/га'], ['Прогноз 2026', f1(m.nowcast26) + ' ц/га']])}`)}
    ${card('Остатки против прогноза', resid)}
    ${card('Q-Q plot стандартизированных остатков', qq)}
    ${card('Коэффициенты в расширяющемся окне (2008-год), 95% ДИ', rollc)}
    ${card('Иерархическая кластеризация округов по профилю отклонений (Уорд)', dend)}
    ${card('Кластеры на схеме края', `${clMap}${minis(clStats)}`)}
  </div>
  ${card('Статистические тесты', `<div class="tblwrap"><table style="min-width:420px"><thead><tr><th>Тест / показатель</th><th class="r">Статистика</th><th class="r">p</th></tr></thead><tbody>${tests}</tbody></table></div>`)}
  </section>`;
}
