
import pytest
from datetime import datetime, timezone
from app.analytics import (
    build_actuals_df,
    build_forecasts_df,
    compute_decision_cutoff,
    select_decision_time_forecast,
    run_accuracy_analysis,
)



RAW_ACTUALS = [
    {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-05T00:30:00Z",
     "settlementDate": "2026-01-05", "settlementPeriod": 1, "fuelType": "WIND", "generation": 8000},
    {"startTime": "2026-01-05T00:30:00Z", "publishTime": "2026-01-05T01:00:00Z",
     "settlementDate": "2026-01-05", "settlementPeriod": 2, "fuelType": "WIND", "generation": 7800},
    {"startTime": "2026-01-05T01:00:00Z", "publishTime": "2026-01-05T01:30:00Z",
     "settlementDate": "2026-01-05", "settlementPeriod": 3, "fuelType": "WIND", "generation": 7600},
]

RAW_FORECASTS = [

    {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-04T02:30:00Z", "generation": 8200},

    {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-04T09:30:00Z", "generation": 8100},

    {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-04T10:30:00Z", "generation": 7950},

    {"startTime": "2026-01-05T00:30:00Z", "publishTime": "2026-01-04T09:30:00Z", "generation": 7900},

    {"startTime": "2026-01-05T01:00:00Z", "publishTime": "2026-01-04T11:00:00Z", "generation": 7500},
]




class TestDecisionCutoff:
    def test_cutoff_is_day_before(self):
        delivery = datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc)
        cutoff = compute_decision_cutoff(delivery, cutoff_hour=10, cutoff_minute=0)
        assert cutoff.date().isoformat() == "2026-01-04"

    def test_cutoff_at_correct_time(self):
        delivery = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)
        cutoff = compute_decision_cutoff(delivery, cutoff_hour=10, cutoff_minute=0)
        assert cutoff.hour == 10
        assert cutoff.minute == 0

    def test_custom_cutoff_hour(self):
        delivery = datetime(2026, 1, 15, 0, 0, tzinfo=timezone.utc)
        cutoff = compute_decision_cutoff(delivery, cutoff_hour=12, cutoff_minute=30)
        assert cutoff.hour == 12
        assert cutoff.minute == 30
        assert cutoff.date().isoformat() == "2026-01-14"


\

class TestLookAheadBias:
    def test_selects_latest_eligible_forecast(self):
        """Must pick the 09:30 forecast (latest before 10:00 cutoff), NOT the 10:30 one."""
        forecasts_df = build_forecasts_df(RAW_FORECASTS)
        delivery = datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc)
        result = select_decision_time_forecast(forecasts_df, delivery, 10, 0)

        assert result is not None
        assert result["forecast_mw"] == 8100

        pub_time = datetime.fromisoformat(result["publish_time"])
        cutoff = datetime(2026, 1, 4, 10, 0, tzinfo=timezone.utc)
        assert pub_time <= cutoff

    def test_excludes_post_cutoff_forecast(self):
        """01:00 interval has only a post-cutoff forecast — must return None."""
        forecasts_df = build_forecasts_df(RAW_FORECASTS)
        delivery = datetime(2026, 1, 5, 1, 0, tzinfo=timezone.utc)
        result = select_decision_time_forecast(forecasts_df, delivery, 10, 0)
        assert result is None

    def test_returns_none_when_no_forecasts(self):
        """No forecasts at all — must return None."""
        from app.analytics import build_forecasts_df
        empty_df = build_forecasts_df([])
        delivery = datetime(2026, 1, 5, 0, 0, tzinfo=timezone.utc)
        result = select_decision_time_forecast(empty_df, delivery, 10, 0)
        assert result is None




class TestAccuracyMetrics:
    def test_mae_calculation(self):
        """MAE should equal mean absolute error of paired intervals."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )
        metrics = result["metrics"]

        assert metrics["mae_mw"] == pytest.approx(200.0, abs=0.5)
        assert metrics["sample_size"] == 1

    def test_bias_calculation(self):
        """Bias = mean(forecast - actual). Both forecasts over-predict here."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )

        assert result["metrics"]["bias_mw"] == pytest.approx(200.0, abs=0.5)

    def test_coverage_counts(self):
        """Coverage is reported at hourly forecast resolution, with raw half-hours separately counted."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )
        cov = result["coverage"]
        assert cov["total_intervals"] == 48
        assert cov["actual_intervals"] == 3
        assert cov["comparison_periods"] == 24
        assert cov["eligible_forecast_intervals"] == 1
        assert cov["paired_intervals"] == 1
        assert cov["unmatched_intervals"] == 23
        assert cov["coverage_pct"] == pytest.approx(4.2)

    def test_rmse_greater_than_or_equal_mae(self):
        """RMSE >= MAE always."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )
        m = result["metrics"]
        assert m["rmse_mw"] >= m["mae_mw"]

    def test_intervals_in_result(self):
        """Result must include per-interval data."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )
        assert len(result["intervals"]) == 24
        assert result["intervals"][0]["actual_interval_count"] == 2

    def test_cutoff_assumption_documented(self):
        """Cutoff assumption must be present and documented in response."""
        result = run_accuracy_analysis(
            RAW_ACTUALS, RAW_FORECASTS, "2026-01-05", "2026-01-05", 10, 0
        )
        assert "cutoff_assumption" in result
        assert result["cutoff_assumption"]["hour_utc"] == 10

    def test_official_stream_resolution_and_hourly_match(self):
        """WINDFOR startTime is hourly; FUELHH maps to it via the UTC hour."""
        actuals = [
            {"startTime": "2026-01-01T00:00:00Z", "publishTime": "2026-01-01T00:30:00Z",
             "settlementDate": "2026-01-01", "settlementPeriod": 1, "generation": 1000},
            {"startTime": "2026-01-01T00:30:00Z", "publishTime": "2026-01-01T01:00:00Z",
             "settlementDate": "2026-01-01", "settlementPeriod": 2, "generation": 1200},
        ]
        forecasts = [
            {"dataset": "WINDFOR", "startTime": "2026-01-01T00:00:00Z",
             "publishTime": "2025-12-31T09:30:00Z", "generation": 1300},
            {"dataset": "WINDFOR", "startTime": "2026-01-01T00:00:00Z",
             "publishTime": "2025-12-31T10:00:00Z", "generation": 1400},
            # A later publication must not replace the cutoff-eligible vintage.
            {"dataset": "WINDFOR", "startTime": "2026-01-01T00:00:00Z",
             "publishTime": "2025-12-31T10:01:00Z", "generation": 9999},
        ]

        assert all(datetime.fromisoformat(f["startTime"].replace("Z", "+00:00")).minute == 0 for f in forecasts)
        assert all("settlementPeriod" not in f for f in forecasts)
        assert [a["settlementPeriod"] for a in actuals] == [1, 2]

        result = run_accuracy_analysis(actuals, forecasts, "2026-01-01", "2026-01-01", 10, 0)
        row = result["intervals"][0]
        assert row["start_time"] == "2026-01-01T00:00:00+00:00"
        assert row["actual_interval_count"] == 2
        assert row["actual_mw"] == pytest.approx(1100)
        assert row["forecast_mw"] == 1400
        assert row["publish_time"] == "2025-12-31T10:00:00+00:00"

    def test_missing_half_hour_does_not_create_hourly_match(self):
        actuals = [
            {"startTime": "2026-01-01T00:00:00Z", "publishTime": "2026-01-01T00:30:00Z", "generation": 1000},
        ]
        forecasts = [
            {"startTime": "2026-01-01T00:00:00Z", "publishTime": "2025-12-31T09:30:00Z", "generation": 1300},
        ]
        result = run_accuracy_analysis(actuals, forecasts, "2026-01-01", "2026-01-01", 10, 0)
        row = result["intervals"][0]
        assert row["forecast_mw"] == 1300
        assert row["error_mw"] is None
        assert "Both half-hour actual records are required" in row["unmatched_reason"]
        assert result["coverage"]["paired_intervals"] == 0




class TestDataParsing:
    def test_actuals_deduplication(self):
        """Duplicate startTime records should be deduplicated."""
        duped = RAW_ACTUALS + RAW_ACTUALS
        df = build_actuals_df(duped)
        assert len(df) == len(RAW_ACTUALS)

    def test_actuals_keep_latest_published_revision(self):
        """A later FUELHH revision wins even when the API returns it first."""
        revisions = [
            {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-05T02:00:00Z", "generation": 8100},
            {"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-05T01:00:00Z", "generation": 8000},
        ]
        df = build_actuals_df(revisions)
        assert df.iloc[0]["actual_mw"] == 8100

    def test_half_hour_actuals_are_aggregated_only_as_complete_hour_pairs(self):
        from app.analytics import build_hourly_actuals_df
        actuals = build_actuals_df(RAW_ACTUALS)
        hourly, incomplete = build_hourly_actuals_df(actuals)
        assert hourly.iloc[0]["actual_mw"] == pytest.approx(7900)
        assert hourly.iloc[0]["actual_interval_count"] == 2
        assert len(hourly) == 1
        assert incomplete == 1

    def test_handles_null_generation(self):
        """Records with null generation should be skipped."""
        bad = [{"startTime": "2026-01-05T00:00:00Z", "publishTime": "2026-01-05T00:30:00Z", "generation": None}]
        df = build_actuals_df(bad)
        assert len(df) == 0

    def test_handles_malformed_timestamp(self):
        """Records with malformed timestamps should be skipped gracefully."""
        bad = [{"startTime": "not-a-date", "publishTime": "also-bad", "generation": 5000}]
        df = build_actuals_df(bad)
        assert len(df) == 0

    def test_forecast_deduplication(self):
        """Duplicate (startTime, publishTime) forecast records should be deduplicated."""
        duped = RAW_FORECASTS + RAW_FORECASTS
        df = build_forecasts_df(duped)
        assert len(df) == len(RAW_FORECASTS)
