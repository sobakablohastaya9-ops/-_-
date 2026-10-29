"""Анализ: тренды, панельная модель погода-урожай, ретропрогноз, цены, маржа, Монте-Карло, стресс-тест.
Результат: docs/data/agro.json
"""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from statsmodels.tsa.seasonal import STL
from scipy import stats
import warnings
warnings.filterwarnings("ignore")  # служебные предупреждения statsmodels

ROOT = Path(__file__).resolve().parents[1]
CLEAN, OUT = ROOT / "data/clean", ROOT / "docs/data"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261028)

dim = pd.read_csv(CLEAN / "dim_district.csv")
yld = pd.read_csv(CLEAN / "fact_yield.csv")
wx = pd.read_csv(CLEAN / "fact_weather_season.csv")
price_m = pd.read_csv(CLEAN / "fact_price_wheat_monthly.csv")
diesel_m = pd.read_csv(CLEAN / "fact_diesel_monthly.csv")

SEED_YEARS = {2020, 2025, 2026}       # активные воздействия на облака (Росгидромет), по открытым публикациям
area = dim.set_index("id")["area_wheat_2025"]

# 1. Тренд и аномалии
panel = yld.merge(wx, on=["id", "year"], how="left").merge(
    dim[["id", "n_gtk", "n_pSO", "n_pWin", "n_heat", "n_frost", "n_tMJ", "s_pMarMay"]], on="id")
panel = panel.dropna(subset=["y_wheat", "gtk"]).copy()

def fit_trend(df):
    b = np.polyfit(df.year, df.y_wheat, 1)
    return b
trends = {d: fit_trend(g) for d, g in panel.groupby("id")}
panel["trend"] = [np.polyval(trends[d], y) for d, y in zip(panel.id, panel.year)]
panel["anom"] = panel.y_wheat - panel.trend
panel["anom_pct"] = panel.anom / panel.trend * 100

# признаки относительно климатической нормы округа
def features(df):
    df = df.copy()
    df["r"] = df.gtk / df.n_gtk                       # ГТК в долях нормы
    df["lr"] = np.log(df.r.clip(lower=0.05))          # лог: равные проценты отклонения - равный эффект
    df["dt"] = df.tMJ - df.n_tMJ                      # аномалия температуры мая-июня, °C
    df["so"] = df.pSO_prev / df.n_pSO                  # осадки осени (сев) в долях нормы
    df["win"] = df.pWin / df.n_pWin                    # зимние осадки в долях нормы
    df["seed"] = df.year.isin(SEED_YEARS).astype(int)
    df["lspr"] = np.log((df.pMarMay / df.s_pMarMay).clip(lower=0.05))   # весенние осадки (март-май), лог доли нормы
    return df
panel = features(panel)

FORMULA = "anom_pct ~ dt + lr + lspr + so + win + frost + seed + C(id)"   # для вывода (контроль искусственных осадков)
FORMULA_PRED = "anom_pct ~ dt + lspr + so + win"   # для прогноза: отобрана по ретропрогнозу (LOYO), без дамми редких лет
model = smf.ols(FORMULA, data=panel).fit(cov_type="cluster", cov_kwds={"groups": panel.year})
pmodel = smf.ols(FORMULA_PRED, data=panel).fit()
print(model.summary().tables[1])

coef_names = {"dt": "Температура мая-июня выше нормы", "lr": "Увлажнение мая-июня (ГТК, лог)", "lspr": "Осадки весны, март-май (лог)",
              "so": "Осадки осени при севе", "win": "Зимние осадки", "frost": "Дни заморозков (апрель-май)",
              "seed": "Активные воздействия на облака"}
units = {"dt": "+1 °C", "lr": "ГТК x2", "lspr": "осадки x2", "so": "+10% нормы", "win": "+10% нормы", "frost": "+1 день", "seed": "да / нет"}
scale = {"dt": 1, "lr": np.log(2), "lspr": np.log(2), "so": 0.1, "win": 0.1, "frost": 1, "seed": 1}
ci = model.conf_int()
coefs = []
for k in coef_names:
    s = scale[k]
    coefs.append(dict(key=k, name=coef_names[k], unit=units[k], b=model.params[k] * s, lo=ci.loc[k, 0] * s,
                      hi=ci.loc[k, 1] * s, p=float(model.pvalues[k])))
r_opt = None
within_r2 = 1 - (model.resid ** 2).sum() / ((panel.anom_pct - panel.groupby("id").anom_pct.transform("mean")) ** 2).sum()

# эффект для "типичного сдвига": стандартное отклонение признака
eff = []
for k, nm in [("dt", "Жарче нормы, +1σ"), ("lr", "Влажнее нормы, +1σ"), ("lspr", "Дождливая весна, +1σ"), ("so", "Осень при севе, +1σ"),
              ("win", "Зимние осадки, +1σ"), ("frost", "Заморозки, +1σ"), ("seed", "Искусств. осадки, да")]:
    sd = panel[k].std() if k != "seed" else 1
    eff.append(dict(label=nm, e=model.params[k] * sd, lo=ci.loc[k, 0] * sd, hi=ci.loc[k, 1] * sd, sd=float(sd)))

# 2. Ретропрогноз (leave-one-year-out)
bt = []
for Y in sorted(panel.year.unique()):
    if Y < 2011:
        continue
    tr = panel[panel.year != Y]
    te = panel[panel.year == Y].copy()
    tr_trends = {d: fit_trend(g) for d, g in tr.groupby("id")}
    m = smf.ols(FORMULA_PRED, data=tr).fit()
    te = te[te.id.isin(tr_trends)]
    te["trend_x"] = [np.polyval(tr_trends[d], y) for d, y in zip(te.id, te.year)]
    te["pred"] = te.trend_x * (1 + m.predict(te) / 100)
    w = te.id.map(area)
    bt.append(dict(year=int(Y), act=float(np.average(te.y_wheat, weights=w)),
                   pred=float(np.average(te.pred, weights=w)), naive=float(np.average(te.trend_x, weights=w)),
                   n=int(len(te))))
bt = pd.DataFrame(bt)
mape = float((abs(bt.pred - bt.act) / bt.act).mean() * 100)
mape_naive = float((abs(bt.naive - bt.act) / bt.act).mean() * 100)
sd_bt = float(np.sqrt(((bt.pred - bt.act) ** 2).mean()))
print(f"MAPE model {mape:.1f}% vs trend-only {mape_naive:.1f}%")

# 3. Прогноз 2026 по погоде (урожай еще не опубликован Росстатом)
w26 = features(wx[wx.year == 2026].merge(dim[["id", "n_gtk", "n_pSO", "n_pWin", "n_tMJ", "s_pMarMay"]], on="id"))
w26 = w26[w26.id.isin(trends)]
w26["trend"] = [np.polyval(trends[d], 2026) for d in w26.id]
w26["pred_pct"] = pmodel.predict(w26)
w26["pred"] = w26.trend * (1 + w26.pred_pct / 100)
nowcast26 = float(np.average(w26.pred, weights=w26.id.map(area)))
trend26 = float(np.average(w26.trend, weights=w26.id.map(area)))

# 4. Цены: сезонность и паритет
pm = price_m.copy()
pm["date"] = pd.to_datetime(dict(year=pm.year, month=pm.month, day=1))
pm = pm.set_index("date").asfreq("MS")
pm["price"] = pm.price.interpolate()
stl = STL(np.log(pm.price), period=12, robust=True).fit()
pm["seas"] = np.exp(stl.seasonal) * 100 - 100
season = []
groups = []
for mth in range(1, 13):
    v = pm.seas[pm.index.month == mth].dropna()
    groups.append(v.values)
    h = stats.t.ppf(0.975, len(v) - 1) * v.std(ddof=1) / np.sqrt(len(v))
    season.append(dict(m=mth, idx=float(v.mean()), lo=float(v.mean() - h), hi=float(v.mean() + h)))
kw = stats.kruskal(*groups)

dm = diesel_m.copy()
dm["date"] = pd.to_datetime(dict(year=dm.year, month=dm.month, day=1))
par = pm[["price"]].join(dm.set_index("date")[["diesel"]], how="inner")
par["diesel_t"] = par.diesel * 1190          # руб/л -> руб/т (плотность ~0,84)
par["parity"] = par.diesel_t / par.price
par_mean, par_sd = float(par.parity.mean()), float(par.parity.std())

# годовая цена урожая: среднее июль(t) - июнь(t+1), что есть
def harvest_price(y):
    s = pm.price[(pm.index >= f"{y}-07-01") & (pm.index <= f"{y+1}-06-01")]
    return float(s.mean()) if len(s) else np.nan
hp = {y: harvest_price(y) for y in range(2017, 2027)}

# 5. Модель затрат и маржа
# Структура - техкарта озимой пшеницы 2023 (direct.farm, 60,8 тыс. ₽/га при 54,3 ц/га) без амортизации:
# переменные (удобрения 13,1 + СЗР 4,85 + семена 4,73) масштабируются интенсивностью (урожай тренда / 54,3),
# ГСМ 4,21 - интенсивностью и ценой дизеля, ФОТ+прочие (23,8) - 75% как постоянная часть.
diesel_y = dm.groupby("year").diesel.mean().to_dict()
diesel_y[2027] = float(dm.diesel.iloc[-1])
def general_index(y):      # неэнергетические затраты: +7% в год к 2023 (допущение)
    return 1.07 ** (y - 2023)
def cost(trend_yield, y):
    k = trend_yield / 54.3
    return (22_680 * k + 17_850 * (0.4 + 0.6 * k)) * general_index(y) + 4_213 * k * diesel_y[y] / diesel_y[2023]

mg = []
for d, g in yld.groupby("id"):
    if d not in trends:
        continue
    for _, r in g.iterrows():
        y = int(r.year)
        if y < 2017 or y > 2025 or pd.isna(r.y_wheat):
            continue
        t = np.polyval(trends[d], y)
        mg.append(dict(id=d, year=y, yld=r.y_wheat, price=hp[y], cost=cost(t, y),
                       margin=r.y_wheat / 10 * hp[y] - cost(t, y)))
for _, r in w26.iterrows():     # 2026: урожай - прогноз модели, цена - июль-сентябрь 2026
    mg.append(dict(id=r.id, year=2026, yld=r.pred, price=hp[2026], cost=cost(r.trend, 2026),
                   margin=r.pred / 10 * hp[2026] - cost(r.trend, 2026)))
mg = pd.DataFrame(mg)
krai_m = mg.groupby("year").apply(lambda t: pd.Series(dict(
    yld=np.average(t.yld, weights=t.id.map(area)), price=t.price.iloc[0],
    cost=np.average(t.cost, weights=t.id.map(area)), margin=np.average(t.margin, weights=t.id.map(area)),
    loss_share=float((t.id.map(area) * (t.margin < 0)).sum() / t.id.map(area).sum())))).reset_index()

# 6. Монте-Карло и стресс-тест на 2027
# Исторический подход: к тренду урожайности 2027 года применяются фактические отклонения урожайности
# реальных сезонов (по каждому округу), чтобы сохранить пространственную корреляцию - сезон берется целиком.
P0 = float(pm.price.iloc[-12:].mean())                                  # средняя цена за последние 12 мес.
ann = pd.Series(hp).dropna()
price_shocks = (ann / ann.shift(1) - 1).dropna().values                 # исторические годовые изменения цены
an = panel.pivot_table(index="year", columns="id", values="anom_pct")
an = an.apply(lambda r: r.fillna(r.mean()), axis=1)                     # пропуск округа -> среднее по краю за год
seasons = an.index.tolist()
so26 = wx[wx.year == 2026].set_index("id").pSO
dims_i = dim.set_index("id")
so_adj = {d: float(model.params["so"] * (so26.get(d, np.nan) / dims_i.loc[d, "n_pSO"] - 1)) for d in trends}  # поправка на осень 2026, %
N = 4000
ks = rng.integers(0, len(seasons), N)
noise = rng.normal(0, 3, (N,))
pshock = price_shocks[rng.integers(0, len(price_shocks), N)]
mc = {}
for d in trends:
    t27 = np.polyval(trends[d], 2027)
    c27 = cost(t27, 2027)
    a = an[d].values[ks] + noise
    yld27 = np.maximum(3, t27 * (1 + a / 100))
    pr27 = P0 * (1 + pshock)
    m27 = yld27 / 10 * pr27 - c27
    mc[d] = dict(trend=t27, cost=c27, mean=float(m27.mean()), q05=float(np.quantile(m27, 0.05)),
                 ploss=float((m27 < 0).mean()), draws=np.quantile(m27, np.linspace(0.005, 0.995, 200)).round(0).tolist(),
                 yld_mean=float(yld27.mean()), so_adj=so_adj[d])
# распределение маржи края целиком (сезон для всех округов один и тот же)
krai_draw = np.zeros(N); A_tot = sum(area[d] for d in trends)
for d in trends:
    t27 = mc[d]["trend"]; a = an[d].values[ks] + noise
    krai_draw += (np.maximum(3, t27 * (1 + a / 100)) / 10 * P0 * (1 + pshock) - mc[d]["cost"]) * area[d] * 1000
krai_mc = dict(mean=float(krai_draw.mean() / 1e9), q05=float(np.quantile(krai_draw, 0.05) / 1e9), ploss=float((krai_draw < 0).mean()))

stress = {}
for y in [2010, 2013, 2019, 2020, 2021, 2024, 2025]:
    res = {}
    for d in trends:
        pct = float(an.loc[y, d])
        yy = mc[d]["trend"] * (1 + pct / 100)
        res[d] = dict(yld=yy, pct=pct, margin=yy / 10 * P0 - mc[d]["cost"])
    stress[y] = res
normal = {d: dict(yld=mc[d]["trend"], margin=mc[d]["trend"] / 10 * P0 - mc[d]["cost"]) for d in mc}

# 6b. Дополнительная статистика
from scipy.cluster.hierarchy import linkage, dendrogram, fcluster
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson, jarque_bera
from statsmodels.stats.outliers_influence import variance_inflation_factor

# корреляционная матрица факторов и отклика
CM_KEYS = ["anom_pct", "dt", "lr", "lspr", "so", "win", "frost"]
CM_LAB = ["Отклонение урожая", "Темп. май-июнь", "ГТК май-июнь", "Осадки весны", "Осадки осени", "Осадки зимы", "Заморозки"]
cm = panel[CM_KEYS].dropna().corr().round(2).values.tolist()

# диагностика панельной модели
res_df = pd.DataFrame(dict(fit=model.fittedvalues, res=model.resid))
z = (res_df.res - res_df.res.mean()) / res_df.res.std()
qq_t = stats.norm.ppf((np.arange(1, len(z) + 1) - 0.5) / len(z))
jb = jarque_bera(model.resid)
sw = stats.shapiro(model.resid)
bp = het_breuschpagan(model.resid, model.model.exog)
Xv = panel[["dt", "lspr", "so", "win"]].dropna()
Xv = (Xv - Xv.mean()) / Xv.std()
Xv.insert(0, "const", 1.0)
vif = {c: float(variance_inflation_factor(Xv.values, i)) for i, c in enumerate(Xv.columns) if c != "const"}
diag = dict(
    fit_res=[[round(float(f), 1), round(float(r), 1)] for f, r in zip(res_df.fit, res_df.res)],
    qq=[[round(float(t), 2), round(float(v), 2)] for t, v in zip(qq_t, np.sort(z.values))],
    jb_stat=float(jb[0]), jb_p=float(jb[1]), skew=float(jb[2]), kurt=float(jb[3]),
    sw_stat=float(sw.statistic), sw_p=float(sw.pvalue), bp_stat=float(bp[0]), bp_p=float(bp[1]),
    dw=float(durbin_watson(model.resid)), vif=vif, r2=float(model.rsquared), r2_within=float(within_r2),
    f_p=float(model.f_pvalue) if model.f_pvalue is not None else None,
)

# сравнение спецификаций прогноза по ретропрогнозу (leave-one-year-out)
def loyo(formula):
    e_k, e_d = [], []
    for Y in sorted(panel.year.unique()):
        if Y < 2011:
            continue
        tr, te = panel[panel.year != Y], panel[panel.year == Y].copy()
        tt = {d: fit_trend(g) for d, g in tr.groupby("id")}
        te = te[te.id.isin(tt)]
        te["tx"] = [np.polyval(tt[d], y) for d, y in zip(te.id, te.year)]
        te["pr"] = te.tx * (1 + (smf.ols(formula, data=tr).fit().predict(te) / 100 if formula else 0))
        te = te.dropna(subset=["pr"])
        w = te.id.map(area)
        a = np.average(te.y_wheat, weights=w)
        e_k.append(abs(np.average(te.pr, weights=w) - a) / a * 100)
        e_d.append(float((abs(te.pr - te.y_wheat) / te.y_wheat).mean() * 100))
    return float(np.mean(e_k)), float(np.mean(e_d))
SPECS = [("Только тренд", None), ("Температура", "anom_pct ~ dt"), ("Темп. + ГТК", "anom_pct ~ dt + lr"),
         ("Темп. + осень + зима", "anom_pct ~ dt + so + win"), ("Полная (все факторы)", "anom_pct ~ dt + lr + lspr + so + win + frost"),
         ("Темп. + весна + осень + зима", FORMULA_PRED)]
specs = [dict(name=n, krai=round(a, 1), dist=round(b, 1)) for n, f in SPECS for a, b in [loyo(f)]]

# устойчивость коэффициентов: расширяющееся окно
roll = []
for Y in range(2016, int(panel.year.max()) + 1):
    sub = panel[panel.year <= Y]
    mm = smf.ols("anom_pct ~ dt + lspr + so + win + C(id)", data=sub).fit(cov_type="cluster", cov_kwds={"groups": sub.year})
    ci_ = mm.conf_int()
    roll.append(dict(year=Y, **{k: [round(float(mm.params[k]), 2), round(float(ci_.loc[k, 0]), 2), round(float(ci_.loc[k, 1]), 2)] for k in ["dt", "lspr"]}))

# кластеризация округов по профилю отклонений (Уорд, корреляционное расстояние)
prof = an.T.loc[sorted(trends)]
prof_z = prof.sub(prof.mean(axis=1), axis=0).div(prof.std(axis=1), axis=0)
L = linkage(prof_z.values, method="ward")
cl = fcluster(L, 4, criterion="maxclust")
dg = dendrogram(L, no_plot=True, labels=prof.index.tolist())
clusters = dict(ids=prof.index.tolist(), cl=[int(c) for c in cl], leaves=dg["ivl"],
                icoord=[[round(v, 1) for v in a] for a in dg["icoord"]], dcoord=[[round(v, 2) for v in a] for a in dg["dcoord"]])

# индекс Морана: пространственная автокорреляция (вес = 1/расстояние)
coords = dims_i.loc[sorted(trends), ["lat", "lon"]].values
dd_ = np.sqrt((((coords[:, None, :] - coords[None, :, :]) * [1, np.cos(np.radians(45))]) ** 2).sum(-1)) * 111  # км
Wm = np.where(dd_ > 0, 1 / np.where(dd_ > 0, dd_, 1), 0); Wm = Wm / Wm.sum()
def moran(x):
    x = np.asarray(x, float); zz = x - x.mean()
    I = len(x) * (zz @ Wm @ zz) / (zz @ zz)
    perm = [len(x) * ((p := rng.permutation(zz)) @ Wm @ p) / (zz @ zz) for _ in range(999)]
    return dict(I=round(float(I), 3), E=round(-1 / (len(x) - 1), 3), p=round(float((np.sum(np.array(perm) >= I) + 1) / 1000), 3))
vol_ = prof.std(axis=1).values
moran_res = dict(vol=moran(vol_), a2020=moran(prof[2020].values), yld=moran([np.polyval(trends[d], 2025) for d in sorted(trends)]))

# STL-компоненты цены и распределение месячных изменений
stl_out = dict(t=[f"{i:%Y-%m}" for i in pm.index], trend=[round(float(np.exp(v))) for v in stl.trend],
               seas=[round(float((np.exp(v) - 1) * 100), 2) for v in stl.seasonal], resid=[round(float((np.exp(v) - 1) * 100), 2) for v in stl.resid])
ret = (np.log(pm.price).diff().dropna() * 100)
ret_stats = dict(vals=[round(float(v), 2) for v in ret], mean=float(ret.mean()), sd=float(ret.std()), skew=float(stats.skew(ret)),
                 kurt=float(stats.kurtosis(ret)), jb_p=float(stats.jarque_bera(ret).pvalue), ac1=float(ret.autocorr(1)))
# цена урожая и урожайность края по годам
py = krai_m[krai_m.year <= 2025][["year", "yld", "price"]]
py_r = stats.pearsonr(py.yld, py.price)
price_yield = dict(pts=[[int(a), round(float(b), 1), round(float(c))] for a, b, c in py.values], r=float(py_r.statistic), p=float(py_r.pvalue))

# 7. Сборка JSON для дашборда
def r1(x): return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 1)
def r2_(x): return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 2)

dims = []
for _, r in dim.iterrows():
    d = r.id
    g = panel[panel.id == d].sort_values("year")
    yrs = yld[yld.id == d].sort_values("year")
    dims.append(dict(
        id=d, name=r["name"], short=r["short"], row=int(r.row), col=int(r.col), zone=r.zone,
        area=r1(r.area_wheat_2025), n_gtk=r2_(r.n_gtk), n_pSO=r1(r.n_pSO),
        years=yrs.year.tolist(), yld=[r1(v) for v in yrs.y_wheat],
        trend=[r1(np.polyval(trends[d], y)) if d in trends else None for y in yrs.year],
        anom2020=r1(g.loc[g.year == 2020, "anom_pct"].iloc[0]) if (g.year == 2020).any() else None,
        gtk=[r2_(v) for v in wx[wx.id == d].sort_values("year").gtk],
        so26_pct=r1(so26.get(d, np.nan) / r.n_pSO * 100) if d in so26 else None,
        gtk26_pct=r1(wx[(wx.id == d) & (wx.year == 2026)].gtk.iloc[0] / r.n_gtk * 100) if ((wx.id == d) & (wx.year == 2026)).any() else None,
        nowcast26=r1(w26.set_index("id").pred.get(d)) if d in set(w26.id) else None,
        mc=dict(mean=r1(mc[d]["mean"]), q05=r1(mc[d]["q05"]), ploss=r2_(mc[d]["ploss"]), trend=r1(mc[d]["trend"]),
                cost=r1(mc[d]["cost"]), yld=r1(mc[d]["yld_mean"]), so_adj=r1(mc[d]["so_adj"]), q=mc[d]["draws"]) if d in mc else None,
        margin={str(int(t.year)): r1(t.margin) for t in mg[mg.id == d].itertuples()},
        margin_parts={str(int(t.year)): [r1(t.yld), r1(t.price), r1(t.cost)] for t in mg[mg.id == d].itertuples()},
    ))

wx_years = sorted(wx.year.unique().tolist())
scatter = [[d, int(y), r2_(t), r2_(r), r1(a), r2_(sp_)] for d, y, t, r, a, sp_ in zip(panel.id, panel.year, panel.dt, panel.r, panel.anom_pct, panel.lspr)]
out = dict(
    meta=dict(updated=pd.Timestamp.now().strftime("%Y-%m-%d"), price_last=f"{pm.index[-1]:%m.%Y}",
              n_obs=int(model.nobs), n_districts=int(panel.id.nunique()), years=[int(panel.year.min()), int(panel.year.max())],
              within_r2=r2_(within_r2), r_opt=r2_(r_opt), mape=r1(mape), mape_naive=r1(mape_naive),
              sd_bt=r2_(sd_bt), P0=round(P0), kw_p=float(kw.pvalue), kw_h=r2_(kw.statistic),
              nowcast26=r1(nowcast26), trend26=r1(trend26), par_mean=r2_(par_mean), par_sd=r2_(par_sd),
              cost_note="Техкарта озимой пшеницы (direct.farm, 2023) без амортизации; интенсивность по тренду урожайности округа; ГСМ по цене дизеля; прочее +7%/год"),
    districts=dims,
    coefs=[dict(c, b=r2_(c["b"]), lo=r2_(c["lo"]), hi=r2_(c["hi"]), p=float(c["p"])) for c in coefs],
    effects=[dict(e, e=r1(e["e"]), lo=r1(e["lo"]) if e["lo"] is not None else None, hi=r1(e["hi"]) if e["hi"] is not None else None) for e in eff],
    slope_dt=float(model.params["dt"]),
    pred_formula=FORMULA_PRED,
    scatter=scatter,
    backtest=[dict(year=int(r.year), act=r1(r.act), pred=r1(r.pred), naive=r1(r.naive)) for r in bt.itertuples()],
    season=[dict(m=s["m"], idx=r2_(s["idx"]), lo=r2_(s["lo"]), hi=r2_(s["hi"])) for s in season],
    prices=[[f"{i:%Y-%m}", round(v)] for i, v in pm.price.items()],
    parity=[[f"{i:%Y-%m}", r2_(v)] for i, v in par.parity.items()],
    diesel=[[f"{i:%Y-%m}", r1(v)] for i, v in dm.set_index("date").diesel.items() if i.year >= 2017],
    krai_margin=[dict(year=int(r.year), yld=r1(r.yld), price=round(r.price), cost=round(r.cost), margin=round(r.margin),
                      loss_share=r2_(r.loss_share)) for r in krai_m.itertuples()],
    stress={str(y): {d: dict(yld=r1(v["yld"]), pct=r1(v["pct"]), margin=round(v["margin"])) for d, v in res.items()} for y, res in stress.items()},
    normal={d: dict(yld=r1(v["yld"]), margin=round(v["margin"])) for d, v in normal.items()},
    price_shocks=[r2_(x) for x in price_shocks],
    krai_mc={k: round(v, 3) for k, v in krai_mc.items()},
    corr=dict(keys=CM_KEYS, labels=CM_LAB, m=cm), diag=diag, specs=specs, roll=roll, clusters=clusters, moran=moran_res,
    stl=stl_out, ret=ret_stats, price_yield=price_yield,
    harvest_price={str(k): (round(v) if not np.isnan(v) else None) for k, v in hp.items()},
)
(OUT / "agro.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("saved", OUT / "agro.json", round((OUT / "agro.json").stat().st_size / 1024), "KB")
print(f"within_R2={within_r2:.2f} nowcast26={nowcast26:.1f} (trend {trend26:.1f}) P0={P0:.0f}")
print(krai_m.round(2).to_string())
print({d: round(mc[d]['ploss'], 2) for d in mc})
