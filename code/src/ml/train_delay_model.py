from __future__ import annotations

import os
import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv, find_dotenv


from sqlalchemy import text
from src.common.db import get_engine
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error
import numpy as np
from datetime import datetime, timezone

load_dotenv(find_dotenv())


def load_training_data(limit: int | None = None) -> pd.DataFrame:
    engine = get_engine()

    sql = """
    SELECT
      service_date,
      fetched_at,
      route_id,
      stop_sequence,
      prediction_lead_time_seconds,
      delay_seconds
    FROM analytics.trip_delay_events
    WHERE delay_seconds IS NOT NULL
      AND route_id IS NOT NULL
      AND stop_sequence IS NOT NULL
      AND service_date IS NOT NULL
      AND service_date >= CURRENT_DATE - INTERVAL '7 days'
    """
    if limit:
        sql += " ORDER BY fetched_at ASC LIMIT :limit"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), {"limit": limit} if limit else {}).fetchall()

    df = pd.DataFrame(rows, columns=[
        "service_date", "fetched_at", "route_id", "stop_sequence", "prediction_lead_time_seconds", "delay_seconds"
    ])

    df["service_date"] = pd.to_datetime(df["service_date"]).dt.date
    df["fetched_at"] = pd.to_datetime(df["fetched_at"], utc=True)

    df["hour"] = df["fetched_at"].dt.hour
    df["dow"] = df["fetched_at"].dt.dayofweek
    return df


def pct_within(y_true, y_pred, seconds: int) -> float:
    err = np.abs(y_pred - y_true)
    return float(np.mean(err <= seconds))

def save_metrics(mae, med, p60, p120, rows):
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO analytics.model_training_metrics (
                    trained_at,
                    rows_used,
                    mae_seconds,
                    median_abs_error_seconds,
                    pct_within_60,
                    pct_within_120
                )
                VALUES (
                    :trained_at,
                    :rows_used,
                    :mae,
                    :med,
                    :p60,
                    :p120
                )
            """),
            {
                "trained_at": datetime.now(timezone.utc),
                "rows_used": rows,
                "mae": mae,
                "med": med,
                "p60": p60,
                "p120": p120,
            },
        )


def main():
    df = load_training_data(limit=int(os.getenv("ML_LIMIT", "0")) or None)
    df = df[df["delay_seconds"].between(-1800, 3600)]

    dates = sorted(df["service_date"].unique())
    if len(dates) < 2:
        raise SystemExit("Not enough distinct service_date values to do time split yet.")

    split_idx = int(len(dates) * 0.8)
    train_dates = set(dates[:split_idx])
    test_dates = set(dates[split_idx:])

    train = df[df["service_date"].isin(train_dates)].copy()
    test = df[df["service_date"].isin(test_dates)].copy()

    X_train = train[["route_id", "stop_sequence", "prediction_lead_time_seconds", "hour", "dow"]]
    y_train = train["delay_seconds"].astype(int)

    X_test = test[["route_id", "stop_sequence", "prediction_lead_time_seconds", "hour", "dow"]]
    y_test = test["delay_seconds"].astype(int)

    pre = ColumnTransformer(
        transformers=[
            ("route", OneHotEncoder(handle_unknown="ignore"), ["route_id"]),
            ("num", "passthrough", ["stop_sequence", "prediction_lead_time_seconds", "hour", "dow"]),
        ]
    )

    model = xgb.XGBRegressor(
    n_estimators=800,
    max_depth=8,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    tree_method="hist",
    n_jobs=-1,
    random_state=42,
    )
    
    pipe = Pipeline([("pre", pre), ("model", model)])
    pipe.fit(X_train, y_train)

    pred = pipe.predict(X_test)

    mae = mean_absolute_error(y_test, pred)
    med = float(np.median(np.abs(pred - y_test)))
    p60 = pct_within(y_test.to_numpy(), pred, 60)
    p120 = pct_within(y_test.to_numpy(), pred, 120)

    print("Rows:", len(df))
    print("Train rows:", len(train), "Test rows:", len(test))
    print("MAE (s):", round(mae, 2))
    print("Median abs error (s):", round(med, 2))
    print("% within 60s:", round(p60 * 100, 2))
    print("% within 120s:", round(p120 * 100, 2))
    save_metrics(mae, med, p60, p120, len(df))


if __name__ == "__main__":
    main()
