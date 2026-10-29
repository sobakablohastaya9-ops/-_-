"""CSV для Yandex DataLens. Кодировка UTF-8, разделитель запятая."""
from pathlib import Path
import json
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = json.loads((ROOT / "docs/data/agro.json").read_text(encoding="utf-8"))
OUT = ROOT / "datalens"; OUT.mkdir(exist_ok=True)
IDX25 = {"alx":158.1,"and":137.5,"apn":129.7,"arz":138.8,"blg":160.1,"bud":114.1,"grg":102.5,"grc":148.8,"izb":110.2,"ipt":124.3,"kir":126.2,"kch":127.0,"krg":93.3,"krs":98.3,"lvk":125.0,"mvd":136.8,"nft":126.7,"nal":100.8,"nsl":151.9,"ptr":166.5,"prd":103.5,"sov":102.1,"stp":140.4,"trn":116.1,"trk":147.8,"shp":121.7}

rows, longy = [], []
for d in D["districts"]:
    a = [(v / t - 1) * 100 for v, t in zip(d["yld"], d["trend"]) if v is not None and t is not None]
    y25 = d["yld"][d["years"].index(2025)] if 2025 in d["years"] else None
    rows.append({"округ": d["name"], "зона": d["zone"], "площадь_пшеницы_2025_тыс_га": d["area"], "норма_ГТК": d["n_gtk"],
                 "урожайность_2025_ц_га": y25, "индекс_растениеводства_2025": IDX25[d["id"]],
                 "волатильность_проц": round(float(np.std(a, ddof=1)), 1), "провал_2020_проц": d["anom2020"],
                 "влага_осени_2026_проц_нормы": d["so26_pct"], "P_убытка_2027": d["mc"]["ploss"],
                 "маржа_худшие5_руб_га": d["mc"]["q05"], "маржа_ожидаемая_руб_га": d["mc"]["mean"]})
    for y, v, t in zip(d["years"], d["yld"], d["trend"]):
        longy.append({"округ": d["name"], "зона": d["zone"], "год": y, "урожайность_ц_га": v, "тренд_ц_га": t,
                      "отклонение_проц": None if v is None or t is None else round((v / t - 1) * 100, 1)})
pd.DataFrame(rows).to_csv(OUT / "01_okruga.csv", index=False)
pd.DataFrame(longy).to_csv(OUT / "02_urozhaj_po_godam.csv", index=False)
pd.DataFrame(D["krai_margin"]).rename(columns={"year": "год", "yld": "урожайность_ц_га", "price": "цена_руб_т", "cost": "затраты_руб_га",
                                               "margin": "маржа_руб_га", "loss_share": "доля_площади_в_убытке"}).to_csv(OUT / "03_marzha_kraja.csv", index=False)
pr = pd.DataFrame(D["prices"], columns=["месяц", "цена_пшеницы_руб_т"]).merge(pd.DataFrame(D["parity"], columns=["месяц", "паритет_т_пшеницы_за_т_дизеля"]), on="месяц", how="left")
pr["месяц"] = pd.to_datetime(pr["месяц"] + "-01").dt.date
pr.to_csv(OUT / "04_ceny_mesyac.csv", index=False)
names = {d["id"]: d["name"] for d in D["districts"]}
st = [{"сценарий": f"повтор {y}", "округ": names[k], "урожайность_ц_га": v["yld"], "маржа_руб_га": v["margin"]} for y, s in D["stress"].items() for k, v in s.items()]
st += [{"сценарий": "норма", "округ": names[k], "урожайность_ц_га": v["yld"], "маржа_руб_га": v["margin"]} for k, v in D["normal"].items()]
pd.DataFrame(st).to_csv(OUT / "05_stress_test.csv", index=False)
print(sorted(p.name for p in OUT.glob("*.csv")))
