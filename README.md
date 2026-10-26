# WindIQ

WindIQ is a wind-generation forecast accuracy dashboard for energy procurement and planning teams. It compares the forecast available before a delivery day with realized Great Britain wind generation, helping teams understand forecast error, systematic bias, and data coverage when planning procurement and balancing exposure.

**Analysis period:** January 1–31, 2026 (UTC)  
**Default decision cutoff:** 10:00 UTC on the calendar day before delivery  
**Deployment:** No live deployment has been configured or verified.

## Data sources and comparison method

WindIQ retrieves real records from the [Elexon BMRS FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) and [WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream). FUELHH supplies actual generation by fuel type at half-hour settlement resolution; the application requests `fuelType=WIND`. WINDFOR supplies wind generation forecasts with a delivery `startTime` and `publishTime`.

The raw January 2026 response showed WINDFOR delivery starts on the hour (minute and second `00`) and no `settlementPeriod` field. FUELHH has half-hourly records. Therefore each hourly WINDFOR forecast is compared with the arithmetic mean of the two corresponding actual FUELHH half-hours (`HH:00` and `HH:30`). An hour is paired only when both actual records and an eligible forecast are present. The calculation does not duplicate forecasts, interpolate data, or fill missing values.

For each delivery hour, WindIQ selects the latest forecast publication whose `publishTime` is at or before **10:00 UTC on the preceding calendar day**. This is a documented, configurable analytical assumption, not an official market deadline. In January 2026, 10:00 UTC is 10:00 GMT in the UK. For January 1 delivery, the analysis includes December 31, 2025 publication records.

## Audited January 2026 results

The audit of retrieved API records found 1,488 unique FUELHH half-hours and 744 distinct hourly WINDFOR delivery starts. All 744 delivery hours had a complete pair of actual half-hours and an eligible forecast. There were no duplicate or missing expected hourly delivery timestamps in this analysis and no selected forecast violated its day-before cutoff. Coverage is **744 matched hourly periods out of 744 eligible hourly forecasts** (744/744); it is not 1,488 half-hour forecasts.

| Measure | Audited result | Interpretation |
| --- | ---: | --- |
| MAE | 2,122.8 MW | Mean absolute forecast error; lower is better. |
| RMSE | 2,616.7 MW | Root mean squared error; gives larger errors more weight. |
| Bias | +1,840.3 MW | Mean forecast minus actual; positive indicates over-forecasting. |
| MAPE | 22.06% | Mean absolute error as a percentage of actual generation. |
| nRMSE | 22.60% | RMSE divided by mean actual generation. |
| Correlation | 0.9280 | Pearson correlation of hourly forecasts and actuals; 1 indicates perfect linear tracking. |

All metrics use the same **744 matched hourly records** (mean actual 11,580.7 MW). The audit retrieved 18,104 WINDFOR records in the December 31–January 30 publication window, including 17,688 records with January delivery starts. For January 1 delivery hours, 192 records published on December 31 were included. Across the 744 hours the selection used the latest retrieved version at or before the configured cutoff.

**Historical archive limitation:** This audit validates the publication history returned by the current API query, including each record's `publishTime`; it cannot independently establish that the current API response is an immutable historical archive of exactly what was available to market participants at each past cutoff. Results should be understood with this limitation.

## Project layout

```text
backend/       FastAPI service, Elexon client, hourly analytics, pytest suite
frontend/      React + Vite dashboard, charts and interval CSV export
docker-compose.yml
docs/demo-script.md
```

## Required submission video

The evaluation starts with a video, so record and include one before submitting. The [demo script](docs/demo-script.md) is designed for a single video of no more than 10 minutes: a customer-facing pilot presentation of up to five minutes, followed by a technical lead walkthrough of up to five minutes. The script is presenter guidance only; no video recording is included in this repository.

## Requirements

- Python 3.12 or newer
- Node.js 22 LTS (Node 18+ may work for local Vite development)
- npm
- Optional: Docker Engine/Desktop with the Docker Compose plugin

The backend calls the public Elexon BMRS API; internet access is required when the cache is cold. No API key is required by this application.

## Run locally

Run backend and frontend in separate terminals from the project root.

### Backend (Windows PowerShell)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks virtual-environment activation, run `Set-ExecutionPolicy -Scope Process Bypass` in that terminal and activate again. The API is at <http://localhost:8000>, interactive docs at <http://localhost:8000/docs>, and health check at <http://localhost:8000/health>.

### Frontend (second terminal)

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. Vite proxies API requests to the backend at `http://localhost:8000`.

### Linux/macOS equivalent

From the project root, create and activate a virtual environment (`python3.12 -m venv .venv` then `source .venv/bin/activate`), install `python -m pip install -r backend/requirements.txt`, and run `python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000`. In a second terminal run `cd frontend && npm ci && npm run dev`.

## Tests and production build

From the project root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
cd frontend
npm ci
npm run lint
npm run build
```

On Linux/macOS replace the Python path with `.venv/bin/python` and use `backend/tests` as the test path. The frontend build output is `frontend/dist/` and is generated; it is not committed.

## Docker Compose

From the project root, with Docker running:

```powershell
docker compose config
docker compose up --build
```

The dashboard is served at <http://localhost:3000>; the backend is available at <http://localhost:8000>, with API documentation at <http://localhost:8000/docs>. The frontend container's Nginx proxy routes `/api` and `/health` to the Compose backend service. Stop the stack with `Ctrl+C`; remove the stopped containers with `docker compose down`.

## Configuration

Backend settings may be provided as environment variables. If using a local `.env`, put it in the project root when following the run commands below and keep it untracked. The main configurable assumptions are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DECISION_CUTOFF_HOUR_UTC` | `10` | Assumed day-before forecast cutoff hour, UTC. |
| `DECISION_CUTOFF_MINUTE_UTC` | `0` | Assumed cutoff minute. |
| `CACHE_TTL_SECONDS` | `300` | In-memory Elexon response cache duration. |
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon API base URL. |

The UI can also change the cutoff for an analysis request. The January audited figures correspond to the default cutoff of 10:00 UTC.

## Deployment

No deployment credentials, provider configuration, repository remote, or live URL are present in this checkout; deployment has not been performed or verified. To deploy on a Docker host, install Docker Engine and the Compose plugin, copy the project to the host, review the cutoff/cache environment settings, then run `docker compose up -d --build`. Publish the frontend container through the host's supported container ingress or a TLS-enabled reverse proxy. The frontend image uses relative API paths; Nginx routes them to the backend over the Compose network, so the backend port does not need to be public. Confirm the deployed frontend loads, `/health` responds through the backend, and a January analysis can fetch Elexon data before describing the service as live. Provider-specific domain, firewall, TLS, and secret settings must be supplied by the deployer.

## AI assistance disclosure

Development used Antigravity IDE and ChatGPT (including Codex coding assistance) for implementation support, code review, debugging, and documentation. The project was also described in earlier project notes as Gemini-assisted in Antigravity; no separate model-usage logs are included here to independently attribute particular changes. The submitted implementation and reported audit results should be reviewed by the project team.
