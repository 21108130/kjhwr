
import asyncio
import logging
import time
from datetime import datetime, date, timedelta
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


_cache: dict[str, tuple[float, Any]] = {}


def _cache_key(*args) -> str:
    return "|".join(str(a) for a in args)


def _cache_get(key: str) -> Any | None:
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < settings.CACHE_TTL_SECONDS:
            return data
        del _cache[key]
    return None


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = (time.time(), data)


async def _fetch_with_retry(url: str, params: dict) -> list[dict]:

    last_exc = None
    for attempt in range(settings.HTTP_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "data" in data:
                    return data["data"]
                elif isinstance(data, dict) and "items" in data:
                    return data["items"]
                else:
                    logger.warning("Unexpected response format: %s", type(data))
                    return []
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt < settings.HTTP_MAX_RETRIES - 1:
                wait = settings.HTTP_RETRY_DELAY * (attempt + 1)
                logger.warning("Attempt %d failed (%s). Retrying in %.1fs…", attempt + 1, exc, wait)
                await asyncio.sleep(wait)
    logger.error("All %d attempts failed: %s", settings.HTTP_MAX_RETRIES, last_exc)
    raise last_exc


async def fetch_actuals(date_from: str, date_to: str) -> list[dict]:

    cache_key = _cache_key("actuals", date_from, date_to)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info("Cache hit for actuals %s – %s", date_from, date_to)
        return cached

    url = f"{settings.ELEXON_BASE_URL}/datasets/FUELHH/stream"
    all_records: list[dict] = []


    start = date.fromisoformat(date_from)
    end = date.fromisoformat(date_to)
    chunk_days = 7

    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        params = {
            "settlementDateFrom": current.isoformat(),
            "settlementDateTo": chunk_end.isoformat(),
            "fuelType": "WIND",
        }
        logger.info("Fetching FUELHH %s – %s", current.isoformat(), chunk_end.isoformat())
        records = await _fetch_with_retry(url, params)
        all_records.extend(records)
        current = chunk_end + timedelta(days=1)


    seen: set[tuple] = set()
    deduped: list[dict] = []
    for r in all_records:
        key = (r.get("startTime"), r.get("publishTime"))
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    logger.info("Actuals: %d raw, %d deduped records", len(all_records), len(deduped))
    _cache_set(cache_key, deduped)
    return deduped


async def fetch_forecasts(date_from: str, date_to: str) -> list[dict]:

    cache_key = _cache_key("forecasts", date_from, date_to)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info("Cache hit for forecasts %s – %s", date_from, date_to)
        return cached

    url = f"{settings.ELEXON_BASE_URL}/datasets/WINDFOR/stream"
    all_records: list[dict] = []


    first_publish_day = date.fromisoformat(date_from) - timedelta(days=1)
    last_publish_day = date.fromisoformat(date_to) - timedelta(days=1)
    pub_start = first_publish_day.isoformat() + "T00:00:00Z"
    pub_end_exclusive = last_publish_day.isoformat() + "T00:00:00Z"
    pub_end_exclusive = (datetime.fromisoformat(pub_end_exclusive.replace("Z", "+00:00")) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")


    start_dt = datetime.fromisoformat(pub_start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(pub_end_exclusive.replace("Z", "+00:00"))
    chunk = timedelta(days=1)

    current = start_dt
    while current < end_dt:
        chunk_end = min(current + chunk, end_dt)
        params = {
            "publishDateTimeFrom": current.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        logger.info("Fetching WINDFOR published %s – %s", params["publishDateTimeFrom"], params["publishDateTimeTo"])
        records = await _fetch_with_retry(url, params)
        all_records.extend(records)
        current = chunk_end


    seen: set[tuple] = set()
    deduped: list[dict] = []
    for r in all_records:
        key = (r.get("startTime"), r.get("publishTime"))
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    logger.info("Forecasts: %d raw, %d deduped records", len(all_records), len(deduped))
    _cache_set(cache_key, deduped)
    return deduped
