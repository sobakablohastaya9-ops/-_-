"""Выгрузка весенней погоды по округам из Open-Meteo (архив ERA5).

Для каждого округа берется суточная погода в центре округа за 2004-2026 и считается по годам:
  pMarMay, pAprMay, pJun - осадки марта-мая, апреля-мая, июня, мм
  tApr, tMarApr          - средняя температура апреля и марта-апреля, °C
  fr2                    - дни с минимумом <= -2 °C с 1 апреля по 15 мая (заморозки)
  hMay, hJun             - дни с максимумом >= 30 °C в мае и июне
  gdd                    - сумма эффективных температур выше 5 °C, март-июнь

Запуск:  python scripts/00_fetch_spring.py          - все 26 округов (~30-40 минут из-за лимита API)
         python scripts/00_fetch_spring.py krg ipt  - только выбранные округа (для проверки)
Результат печатается и сохраняется в data/raw/weather_spring_fetched.txt
"""
import json, sys, time, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CENTERS = {  # центр округа: широта, долгота (как в 01_prepare.py)
    "alx": (44.71, 43.00), "and": (44.46, 42.51), "apn": (45.91, 43.35), "arz": (45.37, 44.22),
    "blg": (45.10, 43.43), "bud": (44.78, 44.17), "grc": (45.06, 42.47), "grg": (44.15, 43.47),
    "ipt": (45.72, 42.90), "izb": (45.37, 41.71), "kch": (44.68, 41.82), "kir": (43.96, 43.63),
    "krg": (45.85, 41.52), "krs": (43.87, 44.88), "lvk": (44.82, 44.66), "mvd": (44.21, 43.14),
    "nal": (45.49, 41.22), "nft": (44.75, 44.99), "nsl": (44.75, 43.44), "prd": (44.03, 42.86),
    "ptr": (45.33, 42.85), "shp": (45.13, 42.03), "sov": (44.41, 43.87), "stp": (44.27, 44.58),
    "trk": (45.50, 43.58), "trn": (45.43, 41.96),
}
URL = ("https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}"
       "&start_date=2004-01-01&end_date=2026-10-20"
       "&daily=precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=Europe%2FMoscow")


def download(lat, lon):
    for attempt in range(12):
        try:
            with urllib.request.urlopen(URL.format(lat=lat, lon=lon), timeout=120) as r:
                return json.load(r)["daily"]
        except urllib.error.HTTPError as e:
            if e.code == 429:  # лимит запросов в минуту - ждем
                print("  лимит API, жду минуту...")
                time.sleep(65)
            else:
                raise
    raise RuntimeError("не удалось скачать")


def season(d):
    rows = []
    for y in range(2004, 2027):
        s = defaultdict(float); tA, tMA = [], []
        for i, t in enumerate(d["time"]):
            if int(t[:4]) != y:
                continue
            m, dd = int(t[5:7]), int(t[8:10])
            p = d["precipitation_sum"][i] or 0
            tm, tx, tn = d["temperature_2m_mean"][i], d["temperature_2m_max"][i], d["temperature_2m_min"][i]
            if 3 <= m <= 5: s["pMarMay"] += p
            if 4 <= m <= 5: s["pAprMay"] += p
            if m == 6: s["pJun"] += p
            if m == 4 and tm is not None: tA.append(tm)
            if 3 <= m <= 4 and tm is not None: tMA.append(tm)
            if (m == 4 or (m == 5 and dd <= 15)) and tn is not None and tn <= -2: s["fr2"] += 1
            if m == 5 and tx is not None and tx >= 30: s["hMay"] += 1
            if m == 6 and tx is not None and tx >= 30: s["hJun"] += 1
            if 3 <= m <= 6 and tm is not None: s["gdd"] += max(tm - 5, 0)
        avg = lambda a: round(sum(a) / len(a), 1) if a else ""
        rows.append(",".join(str(v) for v in [round(s["pMarMay"]), round(s["pAprMay"]), round(s["pJun"]),
                                              avg(tA), avg(tMA), int(s["fr2"]), int(s["hMay"]), int(s["hJun"]), round(s["gdd"])]))
    return ";".join(rows)


if __name__ == "__main__":
    ids = sys.argv[1:] or list(CENTERS)
    out = ROOT / "data/raw/weather_spring_fetched.txt"
    lines = []
    for k in ids:
        print("качаю", k)
        lines.append(f"{k}:{season(download(*CENTERS[k]))}")
        print(" ", lines[-1][:80], "...")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("сохранено:", out)
