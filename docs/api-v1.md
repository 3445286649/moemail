# MoeMail OTP API v1

MoeMail v1 API uses a stable envelope for every JSON response.

```json
{
  "success": true,
  "data": {},
  "meta": {
    "version": "v1",
    "request_id": "..."
  }
}
```

Errors use the same shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email 不能为空"
  },
  "meta": {
    "version": "v1",
    "request_id": "..."
  }
}
```

## Auth

Pass your API key in the `X-API-Key` header.

```bash
export MOEMAIL_BASE_URL="https://mail.loucer.cn"
export MOEMAIL_API_KEY="mk_xxx"
```

## OpenAPI

```bash
curl "$MOEMAIL_BASE_URL/api/v1/openapi.json"
```

## Create Inboxes

```bash
curl -X POST "$MOEMAIL_BASE_URL/api/v1/otp/create" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MOEMAIL_API_KEY" \
  -d '{
    "count": 3,
    "domain": "intereloucer.com",
    "prefix": "openai",
    "mode": "human",
    "batch_name": "0427-openai-01",
    "tags": ["openai"]
  }'
```

## List Inboxes

```bash
curl "$MOEMAIL_BASE_URL/api/v1/otp/emails?recentHours=24&limit=50" \
  -H "X-API-Key: $MOEMAIL_API_KEY"
```

## Get Latest Code

```bash
curl "$MOEMAIL_BASE_URL/api/v1/otp/latest?email=test@intereloucer.com" \
  -H "X-API-Key: $MOEMAIL_API_KEY"
```

## Wait For Code

```bash
curl "$MOEMAIL_BASE_URL/api/v1/otp/wait?email=test@intereloucer.com&timeout=60&interval=3" \
  -H "X-API-Key: $MOEMAIL_API_KEY"
```

## Export mail.txt Content

```bash
curl -X POST "$MOEMAIL_BASE_URL/api/v1/otp/export" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MOEMAIL_API_KEY" \
  -d '{ "batchId": "batch_id_here", "locale": "zh-CN" }'
```

## Error Codes

- `UNAUTHORIZED`: missing or invalid authentication.
- `FORBIDDEN`: authenticated but lacks permission.
- `VALIDATION_ERROR`: invalid request input.
- `NOT_FOUND`: resource does not exist or cannot be accessed.
- `CONFLICT`: generated address already exists or conflicts.
- `WAIT_TIMEOUT`: no OTP arrived before timeout.
- `UPSTREAM_ERROR`: dependency failed.
- `INTERNAL_ERROR`: unexpected server error.
