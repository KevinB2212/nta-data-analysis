from pathlib import Path

p = sorted(Path("data/raw").glob("gtfs_static_*.zip"))[-1]
print(p)
print(p.stat().st_size)
print(p.read_bytes()[:200])