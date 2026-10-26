
import csv
import io
import logging
import asyncio
from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.config import settings
from app.elexon_client import fetch_actuals, fetch_forecasts
from app.analytics import run_accuracy_analysis, build_forecasts_df, select_decision_time_forecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=(
        "Analyses the accuracy of Elexon BMRS wind generation forecasts against "
        "actual generation for UK day-ahead market purchase decisions. "
        "Implements look-ahead bias prevention using a configurable decision cutoff."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/api/config")
async def get_config():
    """Return current configuration/assumptions to the UI."""
    return {
        "decision_cutoff_hour_utc": settings.DECISION_CUTOFF_HOUR_UTC,
        "decision_cutoff_minute_utc": settings.DECISION_CUTOFF_MINUTE_UTC,
        "default_date_from": settings.DEFAULT_DATE_FROM,
        "default_date_to": settings.DEFAULT_DATE_TO,
        "cutoff_description": (
            f"Documented assumption: forecasts published by {settings.DECISION_CUTOFF_HOUR_UTC:02d}:"
            f"{settings.DECISION_CUTOFF_MINUTE_UTC:02d} UTC on the day before delivery are considered available. "
            "In January 2026, 10:00 UTC is 10:00 GMT in the UK. This is configurable and is not an official market deadline."
        ),
    }


@app.get("/api/accuracy")
async def get_accuracy(
    date_from: str = Query(default=settings.DEFAULT_DATE_FROM, description="Delivery date from (YYYY-MM-DD)"),
    date_to: str = Query(default=settings.DEFAULT_DATE_TO, description="Delivery date to (YYYY-MM-DD)"),
    cutoff_hour: int = Query(
        default=settings.DECISION_CUTOFF_HOUR_UTC,
        ge=0, le=23,
        description="Decision cutoff hour in UTC (10:00 UTC is 10:00 GMT in the UK during January 2026)"
    ),
    cutoff_minute: int = Query(
        default=settings.DECISION_CUTOFF_MINUTE_UTC,
        ge=0, le=59,
        description="Decision cutoff minute in UTC"
    ),
):

    try:
        date.fromisoformat(date_from)
        date.fromisoformat(date_to)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {exc}")

    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be <= date_to")

    logger.info("Accuracy request: %s – %s, cutoff %02d:%02d UTC", date_from, date_to, cutoff_hour, cutoff_minute)

    try:
        actuals, forecasts = await asyncio.gather(
            fetch_actuals(date_from, date_to),
            fetch_forecasts(date_from, date_to),
        )
    except Exception as exc:
        logger.error("Data fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch data from Elexon: {str(exc)}")

    if not actuals:
        raise HTTPException(
            status_code=404,
            detail=f"No actual generation data found for {date_from} to {date_to}. "
                   "The Elexon FUELHH endpoint may not have data for this period yet."
        )

    result = run_accuracy_analysis(
        raw_actuals=actuals,
        raw_forecasts=forecasts,
        date_from=date_from,
        date_to=date_to,
        cutoff_hour=cutoff_hour,
        cutoff_minute=cutoff_minute,
    )

    return result


@app.get("/api/accuracy/csv")
async def get_accuracy_csv(
    date_from: str = Query(default=settings.DEFAULT_DATE_FROM),
    date_to: str = Query(default=settings.DEFAULT_DATE_TO),
    cutoff_hour: int = Query(default=settings.DECISION_CUTOFF_HOUR_UTC, ge=0, le=23),
    cutoff_minute: int = Query(default=settings.DECISION_CUTOFF_MINUTE_UTC, ge=0, le=59),
):

    try:
        actuals, forecasts = await asyncio.gather(
            fetch_actuals(date_from, date_to),
            fetch_forecasts(date_from, date_to),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = run_accuracy_analysis(
        raw_actuals=actuals,
        raw_forecasts=forecasts,
        date_from=date_from,
        date_to=date_to,
        cutoff_hour=cutoff_hour,
        cutoff_minute=cutoff_minute,
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["start_time", "actual_mw", "actual_interval_count", "forecast_mw", "publish_time",
                    "error_mw", "abs_error_mw", "pct_error", "unmatched_reason"],
    )
    writer.writeheader()
    writer.writerows(result["intervals"])

    output.seek(0)
    filename = f"wind_forecast_accuracy_{date_from}_{date_to}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/forecasts/latest")
async def get_latest_forecasts(
    date_from: str = Query(default=settings.DEFAULT_DATE_FROM),
    date_to: str = Query(default=settings.DEFAULT_DATE_TO),
    cutoff_hour: int = Query(default=settings.DECISION_CUTOFF_HOUR_UTC, ge=0, le=23),
    cutoff_minute: int = Query(default=settings.DECISION_CUTOFF_MINUTE_UTC, ge=0, le=59),
):

    try:
        forecasts = await fetch_forecasts(date_from, date_to)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    forecasts_df = build_forecasts_df(forecasts)


    from datetime import datetime, timezone
    from_dt = datetime.fromisoformat(date_from + "T00:00:00+00:00")
    to_dt = datetime.fromisoformat(date_to + "T23:59:59+00:00")

    if forecasts_df.empty:
        return {"forecasts": [], "total": 0}

    intervals = sorted(forecasts_df[
        (forecasts_df["start_time"] >= from_dt) &
        (forecasts_df["start_time"] <= to_dt)
    ]["start_time"].unique())

    results = []
    for st in intervals:
        best = select_decision_time_forecast(forecasts_df, st, cutoff_hour, cutoff_minute)
        if best:
            results.append({
                "start_time": st.isoformat(),
                "forecast_mw": best["forecast_mw"],
                "publish_time": best["publish_time"],
            })

    return {"forecasts": results, "total": len(results)}


@app.get("/api/actuals")
async def get_actuals(
    date_from: str = Query(default=settings.DEFAULT_DATE_FROM),
    date_to: str = Query(default=settings.DEFAULT_DATE_TO),
):
    
    try:
        actuals = await fetch_actuals(date_from, date_to)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    from datetime import datetime, timezone
    from_dt = datetime.fromisoformat(date_from + "T00:00:00+00:00")
    to_dt = datetime.fromisoformat(date_to + "T23:59:59+00:00")

    filtered = []
    for r in actuals:
        try:
            st = datetime.fromisoformat(r.get("startTime", "").replace("Z", "+00:00"))
            if from_dt <= st <= to_dt:
                filtered.append({
                    "start_time": r["startTime"],
                    "actual_mw": r["generation"],
                    "settlement_date": r.get("settlementDate"),
                    "settlement_period": r.get("settlementPeriod"),
                })
        except Exception:
            continue

    return {"actuals": sorted(filtered, key=lambda x: x["start_time"]), "total": len(filtered)}

