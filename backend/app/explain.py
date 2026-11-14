"""Turns the numbers for one month into a short plain-language explanation.

Design rule for the AI part: the model never invents numbers. We compute the facts from the data first (`build_facts`),
then either fill a template (`TemplateExplainer`, no key needed) or hand ONLY those facts to an LLM (`LlmExplainer`).
Every response returns the facts it was built from so the UI can show them.

AI teammates: implement `LlmExplainer.explain`, set EXPLAIN_PROVIDER=llm and put the API key in an environment variable.
Never send the key to the browser and never log it.
"""
from statistics import median
from typing import Any, Protocol

from .schemas import Bbox, ExplainRequest

MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


class Explainer(Protocol):
    name: str

    def explain(self, facts: dict[str, Any], lang: str) -> str: ...


def build_facts(monthly: list[dict[str, Any]], req: ExplainRequest) -> dict[str, Any] | None:
    """Value for the month, median of the same calendar month in other years, anomaly, and harmonization notes."""
    key = {"harmonized": "harmonized", "modis": "modis", "viirs": "viirs"}[req.source]
    row = next((r for r in monthly if r["yearMonth"] == req.year_month), None)
    if row is None or row[key] is None:
        return None
    others = [r[key] for r in monthly if r["month"] == row["month"] and r["year"] != row["year"] and r[key] is not None]
    med = median(others) if others else None
    anomaly = None if not med else round((row[key] - med) / med * 100, 1)
    return {
        "yearMonth": req.year_month,
        "month": row["month"],
        "year": row["year"],
        "source": req.source,
        "place": req.place,
        "value": round(row[key]),
        "historicalMedian": None if med is None else round(med),
        "anomalyPct": anomaly,
        "yearsCompared": len(others),
        "modisRaw": None if row["modis"] is None else round(row["modis"]),
        "viirsRaw": None if row["viirs"] is None else round(row["viirs"]),
        "methods": ",".join(row["methods"]),
        "scaleFactor": row["scaleFactor"],
        "inCalibration": row["allInCalibration"],
        "preliminary": row["anyNrt"],
        "cells": row["cells"],
    }


def _fmt(n: float | int | None) -> str:
    return "n/a" if n is None else f"{round(n):,}"


class TemplateExplainer:
    """Deterministic fallback: always available, never wrong about the numbers."""

    name = "template"

    def explain(self, facts: dict[str, Any], lang: str) -> str:
        vi = lang == "vi"
        m = facts["month"]
        month = f"tháng {m}/{facts['year']}" if vi else f"{MONTHS_EN[m - 1]} {facts['year']}"
        place = facts.get("place") or ("vùng này" if vi else "this area")
        a, med = facts["anomalyPct"], facts["historicalMedian"]

        if a is None or med is None:
            head = (f"{month} ở {place} có {_fmt(facts['value'])} ô-ngày có cháy; chưa có năm khác để so sánh."
                    if vi else f"{month} in {place} had {_fmt(facts['value'])} active cell-days; there are no other years to compare with.")
        elif abs(a) < 10:
            head = (f"{month} ở {place} có {_fmt(facts['value'])} ô-ngày có cháy, gần mức thông thường ({_fmt(med)})."
                    if vi else f"{month} in {place} had {_fmt(facts['value'])} active cell-days, close to the usual {_fmt(med)}.")
        else:
            word_vi, word_en = ("cao hơn", "above") if a > 0 else ("thấp hơn", "below")
            head = (f"{month} ở {place} có {_fmt(facts['value'])} ô-ngày có cháy, {word_vi} {abs(a):.0f}% so với trung vị {_fmt(med)} của cùng tháng ở {facts['yearsCompared']} năm khác."
                    if vi else f"{month} in {place} had {_fmt(facts['value'])} active cell-days, {abs(a):.0f}% {word_en} the median of {_fmt(med)} for the same month in {facts['yearsCompared']} other years.")

        methods = facts["methods"]
        f = facts["scaleFactor"]
        if "modis_scaled" in methods:
            how = (f"Số liệu MODIS được nhân với {f} để đưa về thang VIIRS, nên từng tháng kém chắc chắn hơn các năm gần đây."
                   if vi else f"MODIS was multiplied by {f} to bring it onto the VIIRS scale, so single months are less certain than recent ones.")
        else:
            how = ("VIIRS (S-NPP) là thang chuẩn nên số đếm được dùng nguyên."
                   if vi else "VIIRS (S-NPP) is the reference scale, so its count is used as is.")
        notes = []
        if facts["yearMonth"] <= "2002-06":
            notes.append("Trước tháng 7/2002 chỉ có vệ tinh Terra, thấy ít đám cháy hơn nhiều nên số này bị thấp." if vi
                         else "Before July 2002 only the Terra satellite was flying; it sees far fewer fires, so this count is too low.")
        if facts["preliminary"]:
            notes.append("Đây là dữ liệu sơ bộ (NRT), có thể thay đổi." if vi else "This is preliminary near-real-time data and may change.")
        return " ".join([head, how, *notes])


class LlmExplainer:
    """Hook for the AI teammates. Receives only `facts` (never raw user text beyond `place`) and must not add numbers."""

    name = "llm"

    def explain(self, facts: dict[str, Any], lang: str) -> str:
        raise NotImplementedError("LlmExplainer is not implemented yet. See the docstring at the top of app/explain.py.")


def get_explainer(provider: str) -> Explainer:
    if provider == "template":
        return TemplateExplainer()
    if provider == "llm":
        return LlmExplainer()
    raise ValueError(f"Unknown EXPLAIN_PROVIDER '{provider}' (use 'template' or 'llm')")


__all__ = ["Bbox", "Explainer", "TemplateExplainer", "LlmExplainer", "build_facts", "get_explainer"]
