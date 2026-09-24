# Owned performance test endpoint (hm-perf v1)

Heat Mapper Live measures performance against an endpoint you run, never a third-party service. Run one on the local network (for the local test) and one on a server you control (for the internet test):

```
node tools/perf-endpoint/server.js 8787
```

Enter `http://<host>:8787` under Performance survey → Endpoints.

| Request | Response |
|---|---|
| `GET /hm/v1/info` | `{ "protocol": "hm-perf", "version": 1, "endpointId": "<name>" }` |
| `GET /hm/v1/ping?seq=N` | `pong` (latency, jitter and loss come from 10 HTTP round trips) |
| `GET /hm/v1/download?bytes=N` | exactly N bytes of random ASCII, with `Content-Length` |
| `POST /hm/v1/upload` | `{ "received": <bytes> }` |

The app splits the byte cap (set on the Performance survey screen, default 20 MB, at most 100 MB) between download and upload and refuses a download whose declared length is larger than requested. Latency is HTTP round-trip time, not ICMP. Bodies are random so transparent compression cannot inflate throughput. Use plain HTTP only on a network you trust.
