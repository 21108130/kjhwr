
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)

LONDON_TZ = "Europe/London"


def _parse_utc(ts_str: str) -> Optional[datetime]:
    """Parse ISO-8601 timestamp to UTC-aware datetime."""
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def compute_decision_cutoff(delivery_date_utc: datetime, cutoff_hour: int, cutoff_minute: int) -> datetime:
    """
    Decision cutoff for a given delivery date.
    Documented default assumption: 10:00 UTC on the day BEFORE delivery.
    e.g. for delivery 2026-01-05 → cutoff = 2026-01-04T10:00:00Z
    """
    day_before = delivery_date_utc.date() - timedelta(days=1)
    cutoff = datetime(
        day_before.year, day_before.month, day_before.day,
        cutoff_hour, cutoff_minute, 0, tzinfo=timezone.utc
    )
    return cutoff


def build_actuals_df(raw_actuals: list[dict]) -> pd.DataFrame:
    """Build a clean actuals DataFrame from raw API records."""
    rows = []
    for r in raw_actuals:
        st = _parse_utc(r.get("startTime", ""))
        pt = _parse_utc(r.get("publishTime", ""))
        gen = r.get("generation")
        if st is None or gen is None:
            continue
        try:
            gen_val = float(gen)
        except (ValueError, TypeError):
            continue
        rows.append({"start_time": st, "publish_time": pt or datetime.min.replace(tzinfo=timezone.utc), "actual_mw": gen_val})

    if not rows:
        return pd.DataFrame(columns=["start_time", "actual_mw"])

    df = pd.DataFrame(rows)
    df = df.sort_values(["start_time", "publish_time"]).drop_duplicates(subset=["start_time"], keep="last")
    df = df.drop(columns=["publish_time"])
    df = df.set_index("start_time").sort_index()
    return df


def build_forecasts_df(raw_forecasts: list[dict]) -> pd.DataFrame:
    """Build a clean forecasts DataFrame from raw API records."""
    rows = []
    for r in raw_forecasts:
        st = _parse_utc(r.get("startTime", ""))
        pt = _parse_utc(r.get("publishTime", ""))
        gen = r.get("generation")
        if st is None or pt is None or gen is None:
            continue
        try:
            gen_val = float(gen)
        except (ValueError, TypeError):
            continue
        rows.append({
            "start_time": st,
            "publish_time": pt,
            "forecast_mw": gen_val,
        })

    if not rows:
        return pd.DataFrame(columns=["start_time", "publish_time", "forecast_mw"])

    df = pd.DataFrame(rows)
    df = df.drop_duplicates(subset=["start_time", "publish_time"])
    return df


def build_hourly_actuals_df(actuals_df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
   
    if actuals_df.empty:
        return pd.DataFrame(columns=["actual_mw", "actual_interval_count"]), 0

    frame = actuals_df.copy()
    frame["hour"] = frame.index.floor("h")
    frame["minute"] = frame.index.minute
    complete = []
    incomplete = 0
    for hour, group in frame.groupby("hour"):
        minutes = set(group["minute"].tolist())
        if minutes == {0, 30} and len(group) == 2:
            complete.append({
                "start_time": hour,
                "actual_mw": float(group["actual_mw"].mean()),
                "actual_interval_count": 2,
            })
        else:
            incomplete += 1

    if not complete:
        return pd.DataFrame(columns=["actual_mw", "actual_interval_count"]), incomplete
    result = pd.DataFrame(complete).set_index("start_time").sort_index()
    return result, incomplete


def select_decision_time_forecast(
    forecasts_df: pd.DataFrame,
    delivery_start_time: datetime,
    cutoff_hour: int,
    cutoff_minute: int,
) -> Optional[dict]:
    """
    For a given delivery interval, return the latest forecast published
    at or before the decision cutoff. Returns None if no eligible forecast exists.
    """
    cutoff = compute_decision_cutoff(delivery_start_time, cutoff_hour, cutoff_minute)


    interval_forecasts = forecasts_df[forecasts_df["start_time"] == delivery_start_time]
    eligible = interval_forecasts[interval_forecasts["publish_time"] <= cutoff]

    if eligible.empty:
        return None


    best = eligible.loc[eligible["publish_time"].idxmax()]
    return {
        "forecast_mw": float(best["forecast_mw"]),
        "publish_time": best["publish_time"].isoformat(),
        "cutoff": cutoff.isoformat(),
    }


def run_accuracy_analysis(
    raw_actuals: list[dict],
    raw_forecasts: list[dict],
    date_from: str,
    date_to: str,
    cutoff_hour: int,
    cutoff_minute: int,
) -> dict:
    """Compare hourly WINDFOR forecasts with complete hourly FUELHH means."""
    actuals_df = build_actuals_df(raw_actuals)
    forecasts_df = build_forecasts_df(raw_forecasts)
    from_dt = datetime.fromisoformat(date_from + "T00:00:00+00:00")
    first_hour = from_dt
    last_hour = datetime.fromisoformat(date_to + "T23:00:00+00:00")
    expected_hours = pd.date_range(first_hour, last_hour, freq="h", tz="UTC")


    to_exclusive = datetime.fromisoformat(date_to + "T00:00:00+00:00") + timedelta(days=1)
    actuals_df = actuals_df[(actuals_df.index >= from_dt) & (actuals_df.index < to_exclusive)]
    actual_intervals = len(actuals_df)
    hourly_actuals, incomplete_hourly_actuals = build_hourly_actuals_df(actuals_df)

    forecast_groups = {
        start: group for start, group in forecasts_df.groupby("start_time")
    } if not forecasts_df.empty else {}
    hourly_rows = []
    unmatched_reasons: dict[str, int] = {}
    eligible_forecast_count = 0
    no_eligible_forecast_count = 0
    matched_numeric = []
    total_expected_half_hours = len(expected_hours) * 2

    for start_time in expected_hours:
        actual_row = hourly_actuals.loc[start_time] if start_time in hourly_actuals.index else None
        interval_forecasts = forecast_groups.get(start_time)
        cutoff = compute_decision_cutoff(start_time.to_pydatetime(), cutoff_hour, cutoff_minute)
        eligible = interval_forecasts[interval_forecasts["publish_time"] <= cutoff] if interval_forecasts is not None else pd.DataFrame()
        selected = eligible.loc[eligible["publish_time"].idxmax()] if not eligible.empty else None
        if selected is not None:
            eligible_forecast_count += 1

        reason_parts = []
        if actual_row is None:
            reason_parts.append("Both half-hour actual records are required for the hourly mean.")
        if selected is None:
            no_eligible_forecast_count += 1
            if interval_forecasts is not None and not interval_forecasts.empty:
                reason_parts.append("Forecast records exist, but all were published after the decision cutoff.")
            else:
                reason_parts.append("No WINDFOR record exists for this hourly delivery start time.")
        reason = "; ".join(reason_parts) or None

        actual_mw = float(actual_row["actual_mw"]) if actual_row is not None else None
        forecast_mw = float(selected["forecast_mw"]) if selected is not None else None
        error = forecast_mw - actual_mw if actual_mw is not None and forecast_mw is not None else None
        pct_error = error / actual_mw * 100 if error is not None and actual_mw != 0 else None
        row = {
            "start_time": start_time.isoformat(),
            "actual_mw": actual_mw,
            "actual_interval_count": int(actual_row["actual_interval_count"]) if actual_row is not None else 0,
            "forecast_mw": forecast_mw,
            "publish_time": selected["publish_time"].isoformat() if selected is not None else None,
            "error_mw": round(error, 1) if error is not None else None,
            "abs_error_mw": round(abs(error), 1) if error is not None else None,
            "pct_error": round(pct_error, 2) if pct_error is not None else None,
            "unmatched_reason": reason,
        }
        hourly_rows.append(row)
        if error is not None:
            matched_numeric.append({"start_time": start_time, "actual_mw": actual_mw, "forecast_mw": forecast_mw, "error": error, "pct_error": pct_error})
        elif reason_parts:
            for reason_part in reason_parts:
                unmatched_reasons[reason_part] = unmatched_reasons.get(reason_part, 0) + 1

    actual_values = np.array([r["actual_mw"] for r in matched_numeric], dtype=float)
    forecast_values = np.array([r["forecast_mw"] for r in matched_numeric], dtype=float)
    errors = np.array([r["error"] for r in matched_numeric], dtype=float)
    abs_pct = [abs(r["pct_error"]) for r in matched_numeric if r["pct_error"] is not None]
    sample_size = len(matched_numeric)
    mean_actual = float(np.mean(actual_values)) if sample_size else None
    rmse = float(np.sqrt(np.mean(errors ** 2))) if sample_size else None
    correlation = None
    if sample_size > 1 and np.std(actual_values) > 0 and np.std(forecast_values) > 0:
        correlation = float(np.corrcoef(actual_values, forecast_values)[0, 1])
    metrics = {
        "sample_size": sample_size,
        "mape_sample_size": len(abs_pct),
        "mae_mw": round(float(np.mean(np.abs(errors))), 1) if sample_size else None,
        "rmse_mw": round(rmse, 1) if rmse is not None else None,
        "bias_mw": round(float(np.mean(errors)), 1) if sample_size else None,
        "mape_pct": round(float(np.mean(abs_pct)), 2) if abs_pct else None,
        "nrmse_pct": round(rmse / mean_actual * 100, 2) if rmse is not None and mean_actual and mean_actual > 0 else None,
        "correlation": round(correlation, 4) if correlation is not None else None,
        "mean_actual_mw": round(mean_actual, 1) if mean_actual is not None else None,
        "mean_forecast_mw": round(float(np.mean(forecast_values)), 1) if sample_size else None,
    }

    paired_rows = [r for r in hourly_rows if r["error_mw"] is not None]
    paired_df = pd.DataFrame(matched_numeric)
    daily_rows = []
    if not paired_df.empty:
        paired_df["date"] = pd.to_datetime(paired_df["start_time"], utc=True).dt.date
        daily = paired_df.groupby("date").agg(
            mae=("error", lambda x: float(np.mean(np.abs(x)))),
            rmse=("error", lambda x: float(np.sqrt(np.mean(x ** 2)))),
            bias=("error", "mean"),
            count=("actual_mw", "count"),
            mean_actual=("actual_mw", "mean"),
            mean_forecast=("forecast_mw", "mean"),
        ).reset_index()
        daily_rows = [{
            "date": str(r["date"]), "mae_mw": round(r["mae"], 1),
            "rmse_mw": round(r["rmse"], 1), "bias_mw": round(r["bias"], 1),
            "count": int(r["count"]), "mean_actual_mw": round(r["mean_actual"], 1),
            "mean_forecast_mw": round(r["mean_forecast"], 1),
        } for _, r in daily.iterrows()]

    matched_count = len(paired_rows)
    expected_count = len(expected_hours)
    coverage = {
        "total_intervals": total_expected_half_hours,
        "actual_intervals": actual_intervals,
        "comparison_periods": expected_count,
        "eligible_forecast_intervals": eligible_forecast_count,
        "paired_intervals": matched_count,
        "unmatched_intervals": expected_count - matched_count,
        "no_forecast_intervals": no_eligible_forecast_count,
        "coverage_pct": round(matched_count / expected_count * 100, 1) if expected_count else 0,
    }
    data_quality = {
        "actual_interval_minutes": 30,
        "forecast_interval_minutes": 60,
        "comparison_interval_minutes": 60,
        "complete_hourly_actual_intervals": len(hourly_actuals),
        "incomplete_hourly_actual_intervals": incomplete_hourly_actuals,
        "forecast_records_retrieved": len(raw_forecasts),
        "forecast_delivery_start_times": int(forecasts_df["start_time"].nunique()) if not forecasts_df.empty else 0,
        "hourly_actual_method": "Arithmetic mean of the two real FUELHH half-hour average-MW values for each UTC hour; hours missing either source interval are not paired.",
        "unmatched_reasons": unmatched_reasons,
    }

    return {
        "metrics": metrics,
        "coverage": coverage,
        "data_quality": data_quality,
        "intervals": hourly_rows,
        "daily_summary": daily_rows,
        "cutoff_assumption": {
            "hour_utc": cutoff_hour,
            "minute_utc": cutoff_minute,
            "description": (
                f"Documented assumption: forecasts published by {cutoff_hour:02d}:{cutoff_minute:02d} UTC on the day before delivery are considered available. "
                "This is configurable and is not represented as an official market deadline."
            ),
        },
        "date_range": {"from": date_from, "to": date_to},
    }
