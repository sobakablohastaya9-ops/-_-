from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW, CLEAN = ROOT / "data/raw", ROOT / "data/clean"
CLEAN.mkdir(parents=True, exist_ok=True)

DISTRICTS = [
    ("krg", 530, "Красногвардейский", "Красногв.", 1, 1, 45.85, 41.52),
    ("trn", 554, "Труновский", "Трунов.", 1, 2, 45.43, 41.96),
    ("ipt", 522, "Ипатовский", "Ипатов.", 1, 3, 45.72, 42.90),
    ("apn", 505, "Апанасенковский", "Апанас.", 1, 4, 45.91, 43.35),
    ("nal", 543, "Новоалександровский", "Новоал.", 2, 1, 45.49, 41.22),
    ("izb", 520, "Изобильненский", "Изобил.", 2, 2, 45.37, 41.71),
    ("ptr", 546, "Петровский", "Петров.", 2, 3, 45.33, 42.85),
    ("trk", 556, "Туркменский", "Туркм.", 2, 4, 45.50, 43.58),
    ("arz", 507, "Арзгирский", "Арзгир.", 2, 5, 45.37, 44.22),
    ("kch", 528, "Кочубеевский", "Кочуб.", 3, 1, 44.68, 41.82),
    ("shp", 558, "Шпаковский", "Шпаков.", 3, 2, 45.13, 42.03),
    ("grc", 517, "Грачевский", "Грачев.", 3, 3, 45.06, 42.47),
    ("blg", 510, "Благодарненский", "Благод.", 3, 4, 45.10, 43.43),
    ("bud", 512, "Буденновский", "Буден.", 3, 5, 44.78, 44.17),
    ("lvk", 536, "Левокумский", "Левок.", 3, 6, 44.82, 44.66),
    ("and", 503, "Андроповский", "Андроп.", 4, 1, 44.46, 42.51),
    ("nsl", 544, "Новоселицкий", "Новосел.", 4, 2, 44.75, 43.44),
    ("alx", 502, "Александровский", "Алекс.", 4, 3, 44.71, 43.00),
    ("sov", 550, "Советский", "Совет.", 4, 4, 44.41, 43.87),
    ("stp", 552, "Степновский", "Степн.", 4, 5, 44.27, 44.58),
    ("nft", 541, "Нефтекумский", "Нефтек.", 4, 6, 44.75, 44.99),
    ("prd", 548, "Предгорный", "Предг.", 5, 2, 44.03, 42.86),
    ("mvd", 539, "Минераловодский", "Минвод.", 5, 3, 44.21, 43.14),
    ("grg", 515, "Георгиевский", "Георг.", 5, 4, 44.15, 43.47),
    ("kir", 525, "Кировский", "Киров.", 5, 5, 43.96, 43.63),
    ("krs", 533, "Курский", "Курск.", 5, 6, 43.87, 44.88),
]
dim = pd.DataFrame(DISTRICTS, columns=["id", "oktmo3", "name", "short", "row", "col", "lat", "lon"])

YEARS = list(range(2008, 2026))
recs = []
for line in (RAW / "pmo_yields_by_district.txt").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#"):
        continue
    left, right = line.split("|")
    lf = left.split(",")
    code, aw, ag = int(lf[0]), lf[1], lf[2]
    yw, yg = lf[3:], right.split(",")
    for i, y in enumerate(YEARS):
        recs.append(dict(oktmo3=code, year=y,
                         y_wheat=float(yw[i]) if yw[i] else np.nan,
                         y_grain=float(yg[i]) if yg[i] else np.nan))
    dim.loc[dim.oktmo3 == code, "area_wheat_2025"] = float(aw)
    dim.loc[dim.oktmo3 == code, "area_grain_2025"] = float(ag)
yld = pd.DataFrame(recs).merge(dim[["id", "oktmo3"]], on="oktmo3")
bad = (yld.id == "grg") & yld.year.isin([2014, 2015, 2016, 2017, 2018, 2019])
yld.loc[bad, ["y_wheat", "y_grain"]] = np.nan
yld.loc[yld.y_grain > 120, "y_grain"] = np.nan
yld = yld.drop(columns="oktmo3")

WF = ["pMJ", "gtk", "frost", "heat", "pSO", "pWin", "tMJ"]
wrec = []
for f in sorted(RAW.glob("weather_part*.txt")):
    for line in f.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        did, rest = line.split(":", 1)
        for k, row in enumerate(rest.split(";")):
            vals = [float(v) if v != "" else np.nan for v in row.split(",")]
            wrec.append(dict(id=did, year=2004 + k, **dict(zip(WF, vals))))
wx = pd.DataFrame(wrec).drop_duplicates(["id", "year"], keep="last")

NF = ["pMJ", "tMJ10", "gtk", "frost", "heat", "pSO", "pWin", "pAJ", "tMJ"]
nrec = []
for line in (RAW / "weather_norms_1991_2020.txt").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#"):
        continue
    for chunk in line.split(";"):
        did, vals = chunk.split(":")
        nrec.append(dict(id=did, **{"n_" + k: float(v) for k, v in zip(NF, vals.split(","))}))
norms = pd.DataFrame(nrec).drop_duplicates("id", keep="last")
dim = dim.merge(norms, on="id", how="left")

def zone(g):
    if pd.isna(g): return None
    return ("крайне засушливая" if g < 0.9 else "засушливая" if g < 1.1
            else "неустойчивого увлажнения" if g < 1.4 else "достаточного увлажнения")
dim["zone"] = dim["n_gtk"].map(zone)

wx = wx.sort_values(["id", "year"])
wx["pSO_prev"] = wx.groupby("id")["pSO"].shift(1)

SF = ["pMarMay", "pAprMay", "pJun", "tApr", "tMarApr", "fr2", "hMay", "hJun", "gdd"]
srec = []
for line in (RAW / "weather_spring.txt").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#"):
        continue
    did, rest = line.split(":", 1)
    for k, row in enumerate(rest.split(";")):
        srec.append(dict(id=did, year=2004 + k, **dict(zip(SF, map(float, row.split(","))))))
sp = pd.DataFrame(srec).drop_duplicates(["id", "year"], keep="last")
wx = wx.merge(sp, on=["id", "year"], how="left")
sn = sp[sp.year <= 2025].groupby("id")[["pMarMay", "tMarApr", "pJun"]].mean().add_prefix("s_").reset_index()
dim = dim.merge(sn, on="id", how="left")

pr = pd.read_csv(RAW / "prices_wheat_sk_monthly.csv")
pr = pr[(pr.reg == "SK") & (pr["prod"] == "wheat")].melt(id_vars=["reg", "prod", "year"], var_name="m", value_name="price")
pr["month"] = pr.m.str[1:].astype(int)
pr = pr.dropna(subset=["price"])
pr = pr[pr.price > 0][["year", "month", "price"]].sort_values(["year", "month"])

ds = pd.read_csv(RAW / "diesel_retail_sk_monthly.csv").melt(id_vars="year", var_name="m", value_name="diesel")
ds["month"] = ds.m.str[1:].astype(int)
ds = ds.dropna(subset=["diesel"])[["year", "month", "diesel"]].sort_values(["year", "month"])

dim.to_csv(CLEAN / "dim_district.csv", index=False)
yld.to_csv(CLEAN / "fact_yield.csv", index=False)
wx.to_csv(CLEAN / "fact_weather_season.csv", index=False)
pr.to_csv(CLEAN / "fact_price_wheat_monthly.csv", index=False)
ds.to_csv(CLEAN / "fact_diesel_monthly.csv", index=False)
print("districts:", len(dim), "| yield rows:", yld.dropna(subset=["y_wheat"]).shape[0],
      "| weather districts:", wx.id.nunique(), "| prices:", len(pr), "| diesel:", len(ds))
