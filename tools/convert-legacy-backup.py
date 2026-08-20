"""Convert the legacy `timestamp,body` journal backup to the CSV that
csvio.Import expects: date,body,created,updated.
"""

import csv, datetime, sys, collections

if len(sys.argv) != 3:
    sys.exit("usage: convert-legacy-backup.py <legacy.csv> <out.csv>")
SRC, DST = sys.argv[1], sys.argv[2]

def diary_date(t):
    # Timestamps are when the entry was written: evening = that day,
    # after-midnight = the day before. Exact midnight means a backfilled
    # entry, where the date is already the diary date.
    if (t.hour, t.minute, t.second) == (0, 0, 0):
        return t.date()
    return t.date() - datetime.timedelta(days=1) if t.hour < 12 else t.date()

merged = collections.OrderedDict()
for raw_ts, body in csv.reader(open(SRC, newline="", encoding="utf-8")):
    t = datetime.datetime.fromisoformat(raw_ts)
    d = diary_date(t)
    body = body.strip()
    u = t.astimezone(datetime.timezone.utc)
    if d in merged:
        prev = merged[d]
        merged[d] = (prev[0] + "\n\n" + body, min(prev[1], u), max(prev[2], u))
    else:
        merged[d] = (body, u, u)

w = csv.writer(open(DST, "w", newline="", encoding="utf-8"), lineterminator="\n")
w.writerow(["date", "body", "created", "updated"])
for d in sorted(merged):
    body, c, u = merged[d]
    fmt = lambda x: x.strftime("%Y-%m-%dT%H:%M:%SZ")
    w.writerow([d.isoformat(), body, fmt(c), fmt(u)])
print(f"{len(merged)} rows written")
