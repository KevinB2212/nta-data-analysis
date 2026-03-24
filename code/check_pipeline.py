python - <<EOF
import requests
r = requests.get("$env:NTA_GTFS_STATIC_URL")
print(r.status_code)
print(r.headers.get("Content-Type"))
print(len(r.content))
print(r.content[:4])
EOF