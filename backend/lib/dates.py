"""Server-side date helpers. The pod clock is UTC — anchor "today" here, never in the browser.

O "dia" do estabelecimento segue APP_TZ (ex.: America/Sao_Paulo): o dia começa à
meia-noite local, não à meia-noite UTC (que no Brasil seria 21h do dia anterior).
"""

import os
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo


def app_tz(tz: str | None = None) -> ZoneInfo:
    return ZoneInfo(tz or os.environ.get("APP_TZ", "UTC"))


def today_iso(tz: str | None = None) -> str:
    """Today's date as YYYY-MM-DD in `tz` (default: APP_TZ env, else UTC)."""
    return datetime.now(app_tz(tz)).strftime("%Y-%m-%d")


def inicio_do_dia(data: Optional[str] = None) -> datetime:
    """Meia-noite local (APP_TZ, timezone-aware) de `data` (YYYY-MM-DD) ou de hoje."""
    tz = app_tz()
    if data:
        d = datetime.fromisoformat(data[:10])
        return datetime(d.year, d.month, d.day, tzinfo=tz)
    agora = datetime.now(tz)
    return datetime(agora.year, agora.month, agora.day, tzinfo=tz)


def dia_local(dt: datetime) -> str:
    """Data local (YYYY-MM-DD) de um instante salvo no banco (UTC)."""
    dt = dt if dt.tzinfo else dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(app_tz()).date().isoformat()
