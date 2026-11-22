var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../cod-staging/security.mjs
var Fault = class extends Error {
  static {
    __name(this, "Fault");
  }
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
};
var enc = new TextEncoder();
var hex = /* @__PURE__ */ __name((b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var random = /* @__PURE__ */ __name((n) => hex(crypto.getRandomValues(new Uint8Array(n))), "random");
var hash = /* @__PURE__ */ __name(async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s))), "hash");
async function key(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(key, "key");
async function sign(secret, text) {
  return hex(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(text)));
}
__name(sign, "sign");

// order-push.mjs
var keyPath = "admin_push_config/signing";
var devicesPath = "admin_push_config/devices";
var encode = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "encode");
var bytes = /* @__PURE__ */ __name((s) => new TextEncoder().encode(s), "bytes");
async function pushKeys(store) {
  const existing = await store.get(keyPath);
  if (existing) return existing.data;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = { privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey), publicKey: encode(await crypto.subtle.exportKey("raw", pair.publicKey)) };
  try {
    await store.commit([store.write(keyPath, keys, { exists: false })]);
    return keys;
  } catch (e) {
    if (e.message !== "write_conflict") throw e;
    return (await store.get(keyPath)).data;
  }
}
__name(pushKeys, "pushKeys");
function endpointUrl(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || endpoint.length > 2048 || !(url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname === "web.push.apple.com")) throw new Fault("unsupported_push_service", 400);
  return url;
}
__name(endpointUrl, "endpointUrl");
async function updateDevices(store, change) {
  for (let i = 0; i < 4; i++) {
    const row = await store.get(devicesPath), list = row?.data.endpoints || [], next = change(list);
    if (next.length === list.length && next.every((x, i2) => x === list[i2])) return;
    if (next.length > 24) throw new Fault("device_limit", 409);
    try {
      await store.commit([store.write(devicesPath, { endpoints: next }, row ? { updateTime: row.version } : { exists: false })]);
      return;
    } catch (e) {
      if (e.message !== "write_conflict") throw e;
    }
  }
  throw new Fault("database_busy", 503);
}
__name(updateDevices, "updateDevices");
async function enroll(store, endpoint) {
  endpointUrl(endpoint);
  await updateDevices(store, (list) => [.../* @__PURE__ */ new Set([...list, endpoint])]);
}
__name(enroll, "enroll");
async function sendOrderPush(store, net = fetch) {
  const endpoints = (await store.get(devicesPath))?.data.endpoints || [];
  if (!endpoints.length) return;
  const keys = (await store.get(keyPath)).data;
  const key2 = await crypto.subtle.importKey("jwk", keys.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const expired = [];
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const u = endpointUrl(endpoint), head = encode(bytes(JSON.stringify({ alg: "ES256", typ: "JWT" })));
    const claims = encode(bytes(JSON.stringify({ aud: u.origin, exp: Math.floor(Date.now() / 1e3) + 3600, sub: "https://kandorty.online/admin.html" })));
    const token = head + "." + claims;
    const sig = encode(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key2, bytes(token)));
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await net(endpoint, { method: "POST", body: new Uint8Array(), redirect: "manual", headers: { TTL: "3600", Urgency: "high", Authorization: "vapid t=" + token + "." + sig + ", k=" + keys.publicKey }, signal: AbortSignal.timeout(7e3) });
      if (response.ok) return;
      if ([404, 410].includes(response.status)) {
        expired.push(endpoint);
        return;
      }
      if (response.status < 500) break;
    }
    throw Error("push_delivery_failed");
  }));
  if (expired.length) await updateDevices(store, (list) => list.filter((e) => !expired.includes(e)));
  if (results.some((r) => r.status === "rejected")) throw Error("push_delivery_failed");
}
__name(sendOrderPush, "sendOrderPush");
async function requireOrderReader(request, cfg, net = fetch) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer [^\s]{1,12000}$/.test(authorization)) throw new Fault("admin_authorization_required", 403);
  let response;
  try {
    response = await net(
      "https://firestore.googleapis.com/v1/projects/" + cfg.projectId + "/databases/(default)/documents/orders?pageSize=1&mask.fieldPaths=id",
      { headers: { Authorization: authorization }, redirect: "manual", signal: AbortSignal.timeout(8e3) }
    );
  } catch {
    throw new Fault("admin_reader_unavailable", 503);
  }
  try {
    await response.body?.cancel();
  } catch {
  }
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) throw new Fault("admin_authorization_required", 403);
  throw new Fault("admin_reader_unavailable", 503);
}
__name(requireOrderReader, "requireOrderReader");

// native-push.mjs
var devicesPath2 = "admin_native_push_config/devices";
var TOKEN_PATTERN = /^[A-Za-z0-9_:\-]{40,512}$/;
var UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
var MAX_DEVICES = 16;
var EXPIRE_MS = 7 * 24 * 60 * 60 * 1e3;
var GOOGLE_OAUTH = "https://oauth2.googleapis.com/token";
var enc2 = new TextEncoder();
var b64 = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "b64");
function nativePushUserId(authorization, cfg) {
  if (typeof authorization !== "string" || !/^Bearer [^\s]{1,12000}$/.test(authorization))
    throw new Fault("admin_authorization_required", 403);
  try {
    const parts = authorization.slice(7).split(".");
    if (parts.length !== 3) throw Error();
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    )));
    if (claims.aud !== cfg.projectId || claims.iss !== "https://securetoken.google.com/" + cfg.projectId || !UID_PATTERN.test(claims.sub || "") || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1e3) throw Error();
    return claims.sub;
  } catch {
    throw new Fault("admin_authorization_required", 403);
  }
}
__name(nativePushUserId, "nativePushUserId");
async function nativePushDevice(store, uid, token, action = "register", now = Date.now()) {
  if (!UID_PATTERN.test(uid || "") || typeof token !== "string" || !TOKEN_PATTERN.test(token))
    throw new Fault("invalid_native_push_device", 400);
  if (!["register", "remove"].includes(action)) throw new Fault("invalid_native_push_action", 400);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await store.get(devicesPath2), previous = Array.isArray(row?.data?.devices) ? row.data.devices : [];
    const active = previous.filter((d) => d?.expiresAt > now && TOKEN_PATTERN.test(d.token || "") && UID_PATTERN.test(d.uid || ""));
    const cleaned = active.filter((d) => d.token !== token);
    if (action === "register") cleaned.push({ token, uid, expiresAt: now + EXPIRE_MS });
    const next = cleaned.slice(-MAX_DEVICES);
    if (action === "remove" && next.length === previous.length && next.every((d, i) => d.token === previous[i].token)) return { enabled: false };
    try {
      await store.commit([store.write(
        devicesPath2,
        { devices: next },
        row ? { updateTime: row.version } : { exists: false }
      )]);
      return { enabled: action === "register" };
    } catch (error) {
      if (error?.message !== "write_conflict") throw error;
    }
  }
  throw new Fault("database_busy", 503);
}
__name(nativePushDevice, "nativePushDevice");
var accessToken = null;
var accessTokenExpires = 0;
async function firebaseMessagingAccess(env, net = fetch, now = Date.now()) {
  if (accessToken && accessTokenExpires > now + 6e4) return accessToken;
  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "");
  } catch {
    throw new Fault("native_push_signing_unavailable", 503);
  }
  if (sa.project_id !== "kandorty-9378a" || !sa.client_email?.endsWith(".iam.gserviceaccount.com") || typeof sa.private_key !== "string") throw new Fault("native_push_signing_unavailable", 503);
  const t = Math.floor(now / 1e3);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: GOOGLE_OAUTH,
    iat: t,
    exp: t + 3600
  };
  const part = b64(enc2.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) + "." + b64(enc2.encode(JSON.stringify(payload)));
  let der, key2;
  try {
    der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
    key2 = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch {
    throw new Fault("native_push_signing_unavailable", 503);
  }
  const jwt = part + "." + b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key2, enc2.encode(part)));
  const resp = await net(GOOGLE_OAUTH, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(12e3)
  });
  if (!resp.ok) throw new Fault("native_push_oauth_failed", 503);
  const data = await resp.json();
  if (!data.access_token || typeof data.access_token !== "string")
    throw new Fault("native_push_oauth_failed", 503);
  accessToken = data.access_token;
  accessTokenExpires = now + Math.min(Number(data.expires_in) || 3600, 3600) * 1e3;
  return accessToken;
}
__name(firebaseMessagingAccess, "firebaseMessagingAccess");
async function sendNativeOrderPush(store, env, net = fetch, now = Date.now()) {
  const row = await store.get(devicesPath2);
  const devices = Array.isArray(row?.data?.devices) ? row.data.devices : [];
  const active = devices.filter((d) => TOKEN_PATTERN.test(d?.token || "") && UID_PATTERN.test(d?.uid || "") && d.expiresAt > now);
  if (!active.length) return { sent: 0 };
  const access = await firebaseMessagingAccess(env, net, now);
  const url = "https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send";
  const statuses = await Promise.allSettled(active.map(async (d) => {
    const response = await net(url, {
      method: "POST",
      redirect: "manual",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token: d.token,
        // Notification payload makes Android display the alert while the
        // standalone admin app is backgrounded; the data signal is used by
        // FirebaseMessagingService when it is foregrounded.
        notification: {
          title: "\u{1F514} \u0637\u0644\u0628 \u062C\u062F\u064A\u062F - \u0643\u0646\u062F\u0648\u0631\u062A\u064A",
          body: "\u0648\u0635\u0644 \u0637\u0644\u0628 \u062C\u062F\u064A\u062F. \u0627\u0641\u062A\u062D\u064A \u0625\u062F\u0627\u0631\u0629 \u0643\u0646\u062F\u0648\u0631\u062A\u064A."
        },
        data: { kind: "kandorty_new_order" },
        android: {
          priority: "high",
          ttl: "120s",
          notification: {
            channel_id: "kandorty_admin_orders_v2",
            notification_priority: "PRIORITY_HIGH",
            sound: "default"
          }
        }
      } }),
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok) throw new Fault("native_push_provider_http_" + response.status, 503);
    return true;
  }));
  const sent = statuses.filter((x) => x.status === "fulfilled").length;
  if (sent === 0) throw new Fault("native_push_delivery_failed", 503);
  return { sent };
}
__name(sendNativeOrderPush, "sendNativeOrderPush");
async function nativeFcmFailure(resp) {
  let err;
  try {
    err = (await resp.json())?.error;
  } catch {
  }
  const detail = Array.isArray(err?.details) ? err.details : [];
  const fcm = detail.find((v) => v?.["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError")?.errorCode;
  const info = detail.find((v) => v?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo")?.reason;
  if (info === "SERVICE_DISABLED") return new Fault("native_push_fcm_api_disabled", 503);
  if (info === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") return new Fault("native_push_fcm_scope_insufficient", 503);
  if (fcm === "SENDER_ID_MISMATCH") return new Fault("native_push_fcm_sender_mismatch", 403);
  if (fcm === "UNREGISTERED") return new Fault("native_push_fcm_token_expired", 409);
  if (resp.status === 403) return new Fault("native_push_fcm_permission_denied", 403);
  if (resp.status === 401) return new Fault("native_push_fcm_credentials_rejected", 503);
  if (resp.status === 400) return new Fault("native_push_fcm_invalid_argument", 400);
  if (resp.status === 404) return new Fault("native_push_fcm_not_found", 503);
  if (resp.status === 429) return new Fault("native_push_fcm_quota_exceeded", 503);
  return new Fault("native_push_fcm_http_" + Number(resp.status), 503);
}
__name(nativeFcmFailure, "nativeFcmFailure");
async function sendNativeTestPush(store, env, uid, deviceToken, net = fetch, now = Date.now()) {
  if (!UID_PATTERN.test(uid || "") || !TOKEN_PATTERN.test(deviceToken || ""))
    throw new Fault("invalid_native_push_device", 400);
  const row = await store.get(devicesPath2);
  const list = Array.isArray(row?.data?.devices) ? row.data.devices : [];
  if (!list.some((d) => d?.uid === uid && d?.token === deviceToken && d?.expiresAt > now))
    throw new Fault("native_push_device_not_registered", 409);
  const access = await firebaseMessagingAccess(env, net, now);
  const endpoint = "https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send";
  const resp = await net(endpoint, {
    method: "POST",
    redirect: "manual",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token: deviceToken,
      notification: { title: "\u{1F514} \u0627\u062E\u062A\u0628\u0627\u0631 \u0625\u0634\u0639\u0627\u0631 \u0643\u0646\u062F\u0648\u0631\u062A\u064A", body: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0625\u0634\u0639\u0627\u0631 Firebase \u0644\u0644\u062C\u0647\u0627\u0632" },
      data: { kind: "kandorty_push_test" },
      android: {
        priority: "high",
        ttl: "120s",
        notification: {
          channel_id: "kandorty_admin_orders_v2",
          notification_priority: "PRIORITY_HIGH",
          sound: "default"
        }
      }
    } }),
    signal: AbortSignal.timeout(12e3)
  });
  if (!resp.ok) throw await nativeFcmFailure(resp);
  return { sent: true };
}
__name(sendNativeTestPush, "sendNativeTestPush");

// direct-order-push.mjs
var ORDER_ID = /^KD-\d{8}$/;
var PROOF = /^[a-f0-9]{48}$/;
var WINDOW_MS = 15 * 60 * 1e3;
var LOCK_MS = 25 * 1e3;
var retryable = /* @__PURE__ */ __name((x) => x?.message === "write_conflict", "retryable");
async function claimDirectOrderNotification(store, input, now = Date.now()) {
  if (!input || Object.keys(input).some((k) => !["orderId", "editToken"].includes(k)) || !ORDER_ID.test(input.orderId || "") || !PROOF.test(input.editToken || "")) {
    throw new Fault("invalid_direct_order_notification", 400);
  }
  const existing = await store.get("orders/" + input.orderId);
  const order = existing?.data;
  if (!order || typeof order.editToken !== "string" || await hash(order.editToken) !== await hash(input.editToken)) {
    throw new Fault("invalid_direct_order_proof", 403);
  }
  const created = Date.parse(order.createdAt);
  if (!Number.isFinite(created) || created < now - WINDOW_MS || created > now + 12e4 || order.status !== "new" || order.id !== input.orderId) {
    throw new Fault("order_not_recent", 409);
  }
  const path2 = "admin_direct_order_notifications/" + await hash(input.orderId);
  for (let i = 0; i < 4; i++) {
    const previous = await store.get(path2), record = previous?.data;
    if (record?.state === "delivered") return { claimed: false, duplicate: true, path: path2 };
    if (record?.state === "pending" && Number(record.startedAt) > now - LOCK_MS)
      return { claimed: false, duplicate: true, path: path2 };
    const data = { state: "pending", startedAt: now, attempt: Number(record?.attempt || 0) + 1 };
    try {
      await store.commit([store.write(
        path2,
        data,
        previous ? { updateTime: previous.version } : { exists: false }
      )]);
      return { claimed: true, duplicate: false, path: path2 };
    } catch (error) {
      if (!retryable(error)) throw error;
    }
  }
  throw new Fault("database_busy", 503);
}
__name(claimDirectOrderNotification, "claimDirectOrderNotification");
async function deliverClaimedOrderNotification(store, claim, sendBrowser, sendNative, now = Date.now()) {
  if (!claim?.claimed) return { queued: false, duplicate: !!claim?.duplicate };
  const outcomes = await Promise.allSettled([sendBrowser(), sendNative()]);
  const delivered = outcomes[1].status === "fulfilled";
  const old = await store.get(claim.path);
  if (old?.data?.state === "pending") {
    try {
      await store.commit([store.write(
        claim.path,
        {
          state: delivered ? "delivered" : "failed",
          startedAt: old.data.startedAt,
          attempt: old.data.attempt,
          ...delivered ? { deliveredAt: now } : { failedAt: now }
        },
        { updateTime: old.version }
      )]);
    } catch (error) {
      if (!retryable(error)) throw error;
    }
  }
  if (!delivered) throw new Fault("direct_order_push_unavailable", 503);
  return { queued: true, duplicate: false };
}
__name(deliverClaimedOrderNotification, "deliverClaimedOrderNotification");

// admin-auth.mjs
var jwksURL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var decode = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)), "decode");
async function verifyAdmin(token, cfg, store, net = fetch, now = Math.floor(Date.now() / 1e3)) {
  try {
    if (typeof token !== "string" || token.length > 12e3) throw Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw Error();
    const head = JSON.parse(new TextDecoder().decode(decode(parts[0]))), claim = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (head.alg !== "RS256" || typeof head.kid !== "string" || head.kid.length > 200 || claim.aud !== cfg.projectId || claim.iss !== "https://securetoken.google.com/" + cfg.projectId || typeof claim.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claim.sub) || claim.firebase?.tenant || claim.admin !== true || !Number.isFinite(claim.exp) || claim.exp <= now || !Number.isFinite(claim.iat) || claim.iat > now || !Number.isFinite(claim.auth_time) || claim.auth_time > now || claim.auth_time < now - 3600) throw Error();
    const r = await net(jwksURL, { redirect: "manual", signal: AbortSignal.timeout(1e4) });
    if (!r.ok) throw Error();
    const jwk = (await r.json()).keys?.find((k) => k.kid === head.kid && k.kty === "RSA" && k.alg === "RS256");
    if (!jwk) throw Error();
    const key2 = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key2, decode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))) throw Error();
    const member = (await store.get("admin_access/" + claim.sub))?.data;
    if (member?.active !== true || !Number.isFinite(member.validAfter) || claim.auth_time < member.validAfter) throw Error();
    return { uid: claim.sub };
  } catch {
    throw new Fault("admin_authorization_required", 403);
  }
}
__name(verifyAdmin, "verifyAdmin");
var firebaseCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
function nativePushSpkiFromGoogleCert(pem) {
  if (typeof pem !== "string" || pem.length > 12e3 || !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(pem.trim()))
    throw Error("invalid_google_certificate");
  const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw Error("invalid_google_certificate");
  const bytes2 = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const part = /* @__PURE__ */ __name((offset) => {
    if (offset < 0 || offset + 2 > bytes2.length) throw Error("invalid_der");
    const tag = bytes2[offset], first = bytes2[offset + 1];
    let length = 0, start = offset + 2;
    if (first < 128) length = first;
    else {
      const count2 = first & 127;
      if (count2 === 0 || count2 > 4 || start + count2 > bytes2.length) throw Error("invalid_der");
      for (let i = 0; i < count2; i++) length = length * 256 + bytes2[start++];
    }
    if (length < 0 || start + length > bytes2.length) throw Error("invalid_der");
    return { tag, start, end: start + length };
  }, "part");
  const cert = part(0);
  if (cert.tag !== 48 || cert.end !== bytes2.length) throw Error("invalid_der");
  const tbs = part(cert.start);
  if (tbs.tag !== 48 || tbs.end > cert.end) throw Error("invalid_der");
  let pos = tbs.start, item = part(pos);
  if (item.tag === 160) {
    pos = item.end;
  }
  for (let i = 0; i < 5; i++) {
    item = part(pos);
    if (item.end > tbs.end) throw Error("invalid_der");
    pos = item.end;
  }
  const spki = part(pos);
  if (spki.tag !== 48 || spki.end > tbs.end) throw Error("invalid_der");
  return bytes2.slice(pos, spki.end);
}
__name(nativePushSpkiFromGoogleCert, "nativePushSpkiFromGoogleCert");
var nativeIdentityLookupURL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAn-ZDc8AWOx6gNS3fWwopQOmC0Gaw0rfI";
async function verifyNativeGoogleSignature(parts, kid, net, claim) {
  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  let signature;
  try {
    signature = decode(parts[2]);
  } catch {
    throw new Fault("admin_authorization_required", 403);
  }
  const algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const opts = /* @__PURE__ */ __name(() => ({ redirect: "manual", signal: AbortSignal.timeout(3500) }), "opts");
  const jwks = /* @__PURE__ */ __name(async () => {
    const response = await net(jwksURL, opts());
    if (!response.ok) throw Error("upstream_jwks");
    const keys = (await response.json()).keys;
    if (!Array.isArray(keys)) throw Error("malformed_jwks");
    const jwk = keys.find((k) => k?.kid === kid && k.kty === "RSA" && k.alg === "RS256");
    if (!jwk) return "unknown_kid";
    const key2 = await crypto.subtle.importKey("jwk", jwk, algo, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key2, signature, data) ? "valid" : "invalid_signature";
  }, "jwks");
  const x509 = /* @__PURE__ */ __name(async () => {
    const response = await net(firebaseCertsURL, opts());
    if (!response.ok) throw Error("upstream_x509");
    const certs = await response.json();
    if (!certs || typeof certs !== "object" || Array.isArray(certs))
      throw Error("malformed_x509");
    if (!Object.prototype.hasOwnProperty.call(certs, kid)) return "unknown_kid";
    const spki = nativePushSpkiFromGoogleCert(certs[kid]);
    const key2 = await crypto.subtle.importKey("spki", spki, algo, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key2, signature, data) ? "valid" : "invalid_signature";
  }, "x509");
  const results = await Promise.allSettled([jwks(), x509()]);
  if (results.some((r) => r.status === "fulfilled" && r.value === "valid")) return;
  if (results.some((r) => r.status === "fulfilled"))
    throw new Fault("admin_authorization_required", 403);
  try {
    const response = await net(nativeIdentityLookupURL, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(3800),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: parts.join(".") })
    });
    if (response.status === 400 || response.status === 401)
      throw new Fault("admin_authorization_required", 403);
    if (!response.ok) throw Error("identity_upstream");
    const users = (await response.json()).users;
    const user = Array.isArray(users) && users.length === 1 ? users[0] : null;
    if (!user || user.localId !== claim.sub || user.disabled === true || typeof user.email !== "string" || typeof claim.email !== "string" || user.email.toLowerCase() !== claim.email.toLowerCase())
      throw new Fault("admin_authorization_required", 403);
    return;
  } catch (error) {
    if (error instanceof Fault) throw error;
    throw new Fault("native_push_google_keys_unavailable", 503);
  }
}
__name(verifyNativeGoogleSignature, "verifyNativeGoogleSignature");
async function verifyNativePushAdmin(token, cfg, store, net = fetch, now = Math.floor(Date.now() / 1e3)) {
  let claim, head, parts;
  try {
    if (cfg.projectId !== "kandorty-9378a" || typeof token !== "string" || token.length > 12e3) throw Error();
    parts = token.split(".");
    if (parts.length !== 3) throw Error();
    head = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claim = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (head.alg !== "RS256" || typeof head.kid !== "string" || head.kid.length > 200 || claim.aud !== cfg.projectId || claim.iss !== "https://securetoken.google.com/" + cfg.projectId || typeof claim.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claim.sub) || claim.firebase?.tenant || !Number.isFinite(claim.exp) || claim.exp <= now || claim.exp > now + 3700 || !Number.isFinite(claim.iat) || claim.iat > now || claim.iat < now - 3700 || !Number.isFinite(claim.auth_time) || claim.auth_time > now || claim.auth_time <= 0)
      throw Error();
  } catch {
    throw new Fault("admin_authorization_required", 403);
  }
  await verifyNativeGoogleSignature(parts, head.kid, net, claim);
  if (typeof claim.email !== "string" || claim.email.toLowerCase() !== "aliyajan200011@gmail.com")
    throw new Fault("native_push_owner_email_mismatch", 403);
  if (claim.admin === false)
    throw new Fault("native_push_admin_claim_revoked", 403);
  if (!["password", "google.com"].includes(claim.firebase?.sign_in_provider))
    throw new Fault("native_push_signin_provider_invalid", 403);
  if (claim.firebase.sign_in_provider === "google.com" && claim.email_verified !== true)
    throw new Fault("native_push_google_email_unverified", 403);
  let member;
  try {
    member = (await store.get("admin_access/" + claim.sub))?.data;
  } catch {
    throw new Fault("native_push_membership_lookup_unavailable", 503);
  }
  if (member) {
    if (member.active !== true || !Number.isFinite(member.validAfter))
      throw new Fault("native_push_membership_inactive", 403);
    if (claim.auth_time < member.validAfter)
      throw new Fault("native_push_fresh_login_required", 403);
  }
  return { uid: claim.sub };
}
__name(verifyNativePushAdmin, "verifyNativePushAdmin");

// configuration.mjs
var TEST_PROJECT = "kandorty-stripe-test-5f8af";
var LIVE_PROJECT = "kandorty-9378a";
function releaseConfig(env) {
  const mode = env.STRIPE_MODE, key2 = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!["test", "live"].includes(mode)) throw new Fault("release_disabled", 503);
  const live = mode === "live", projectId = live ? LIVE_PROJECT : TEST_PROJECT;
  if (env.FIREBASE_PROJECT_ID !== projectId) throw new Fault("project_mode_mismatch", 503);
  if (!(live ? /^(?:sk|rk)_live_[a-zA-Z0-9_]+$/ : /^(?:sk|rk)_test_[a-zA-Z0-9_]+$/).test(key2)) throw new Fault("stripe_key_mode_mismatch", 503);
  if (live && env.LIVE_RELEASE_APPROVAL !== "KANDORTY_STRIPE_V1_APPROVED") throw new Fault("live_release_not_approved", 503);
  if (live && !env.TURNSTILE_SECRET_KEY) throw new Fault("anti_bot_required", 503);
  if (!live && !/^[a-f0-9]{64}$/.test(env.STAGING_ACCESS_SECRET || "")) throw new Fault("staging_gate_required", 503);
  if (!/^whsec_[a-zA-Z0-9_]+$/.test(String(env.STRIPE_WEBHOOK_SECRET || "").trim()) || !/^[a-f0-9]{64}$/.test(env.STRIPE_RECEIPT_SECRET || "")) throw new Fault("signing_secrets_required", 503);
  const host = live ? "kandorty-stripe-release.aliyajan200011.workers.dev" : "kandorty-stripe-release-test.aliyajan200011.workers.dev";
  return { mode, live, projectId, key: key2, host, base: live ? "https://kandorty.online" : "https://" + host, origins: live ? ["https://kandorty.online", "https://www.kandorty.online"] : ["https://" + host] };
}
__name(releaseConfig, "releaseConfig");

// firestore.mjs
var enc3 = new TextEncoder();
var b642 = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "b64");
function pack(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(pack) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pack(x)])) } };
}
__name(pack, "pack");
function unpack(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(unpack);
  return Object.fromEntries(Object.entries(v.mapValue?.fields || {}).map(([k, x]) => [k, unpack(x)]));
}
__name(unpack, "unpack");
var LEGACY_TEST_ROOT = "projects/kandorty-stripe-test-5f8af/databases/(default)/documents";
var LEGACY_FIELDS = Object.freeze({
  orders: Object.freeze(["status", "cancellationLockedAt", "cancelledBy", "updatedAt"]),
  tracking: Object.freeze(["status", "cancellationLockedAt", "updatedAt"])
});
function legacyStatusPatchWrite(root, path2, patch, condition) {
  if (root !== LEGACY_TEST_ROOT) throw new Fault("legacy_patch_test_only", 503);
  const hit = /^(orders|tracking)\/(KD-?[A-Za-z0-9_-]{4,40})$/.exec(path2 || "");
  if (!hit || !patch || typeof patch !== "object" || Array.isArray(patch) || Object.getPrototypeOf(patch) !== Object.prototype)
    throw new Fault("invalid_legacy_patch", 409);
  const allowed = LEGACY_FIELDS[hit[1]];
  const keys = Object.keys(patch).sort();
  if (keys.length < 2 || !keys.includes("status") || !keys.includes("updatedAt") || keys.some((k) => !allowed.includes(k)))
    throw new Fault("invalid_legacy_patch_fields", 409);
  if (!["preparing", "shipping", "delivered", "cancelled"].includes(patch.status) || Object.hasOwn(patch, "cancelledBy") && (hit[1] !== "orders" || patch.status !== "cancelled" || patch.cancelledBy !== "admin") || Object.hasOwn(patch, "cancellationLockedAt") && (patch.status !== "preparing" || typeof patch.cancellationLockedAt !== "string" || !Number.isFinite(Date.parse(patch.cancellationLockedAt))) || typeof patch.updatedAt !== "string" || !Number.isFinite(Date.parse(patch.updatedAt)) || !condition || typeof condition.updateTime !== "string" || !condition.updateTime)
    throw new Fault("invalid_legacy_patch_value", 409);
  return {
    update: { name: root + "/" + path2, fields: Object.fromEntries(keys.map((k) => [k, pack(patch[k])])) },
    updateMask: { fieldPaths: keys },
    currentDocument: { updateTime: condition.updateTime }
  };
}
__name(legacyStatusPatchWrite, "legacyStatusPatchWrite");
function createStore(env, net = fetch) {
  const cfg = releaseConfig(env);
  let account;
  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Fault("database_not_configured", 503);
  }
  if (account.project_id !== cfg.projectId) throw new Fault("isolated_test_project_required", 503);
  if (typeof account.private_key !== "string" || !account.private_key.includes("-----BEGIN PRIVATE KEY-----") || typeof account.client_email !== "string" || !account.client_email.endsWith(".iam.gserviceaccount.com"))
    throw new Fault("invalid_staging_service_account_json", 503);
  const root = `projects/${cfg.projectId}/databases/(default)/documents`;
  let cachedToken = "", expiry = 0;
  async function token() {
    let phase = "start";
    try {
      if (cachedToken && expiry > Date.now() + 6e4) return cachedToken;
      phase = "jwt_claims";
      const now = Math.floor(Date.now() / 1e3);
      const input = b642(enc3.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) + "." + b642(enc3.encode(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
      phase = "jwt_import";
      let key2;
      try {
        const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (x) => x.charCodeAt(0));
        key2 = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      } catch {
        throw new Fault("invalid_staging_private_key", 503);
      }
      phase = "jwt_sign";
      const assertion = input + "." + b642(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key2, enc3.encode(input)));
      phase = "oauth_fetch";
      const r = await net("https://oauth2.googleapis.com/token", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(15e3) });
      if (!r.ok) throw new Fault("database_auth_failed", 503);
      phase = "oauth_parse";
      const result = await r.json();
      if (!result.access_token) throw new Fault("database_auth_failed", 503);
      cachedToken = result.access_token;
      expiry = Date.now() + Number(result.expires_in || 3600) * 1e3;
      return cachedToken;
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault("database_token_" + phase, 503);
    }
  }
  __name(token, "token");
  async function call(path2, method = "GET", body) {
    let phase = "get_token";
    try {
      const access = await token();
      phase = "firestore_fetch";
      const r = await net("https://firestore.googleapis.com/v1/" + root + path2, { method, redirect: "manual", headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" }, ...body ? { body: JSON.stringify(body) } : {}, signal: AbortSignal.timeout(15e3) });
      if (method === "GET" && r.status === 404) return null;
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (["ALREADY_EXISTS", "FAILED_PRECONDITION", "ABORTED"].includes(data.error?.status)) throw new Fault("write_conflict", 409);
        throw new Fault("database_unavailable", 503);
      }
      phase = "firestore_parse";
      return r.json();
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault("database_" + phase, 503);
    }
  }
  __name(call, "call");
  async function get(path2) {
    const d = await call("/" + path2);
    return d ? { data: unpack({ mapValue: { fields: d.fields || {} } }), version: d.updateTime } : null;
  }
  __name(get, "get");
  function write(path2, data, condition) {
    return { update: { name: root + "/" + path2, fields: pack(data).mapValue.fields }, currentDocument: condition };
  }
  __name(write, "write");
  function writePatch(path2, patch, condition) {
    return legacyStatusPatchWrite(root, path2, patch, condition);
  }
  __name(writePatch, "writePatch");
  async function commit(writes) {
    if (writes.some((w) => !w.update?.name?.startsWith(root + "/"))) throw new Fault("unsafe_destination", 503);
    return call(":commit", "POST", { writes });
  }
  __name(commit, "commit");
  const validTransaction = /* @__PURE__ */ __name((tx) => typeof tx === "string" && /^[A-Za-z0-9+/=_-]{8,2048}$/.test(tx), "validTransaction");
  async function beginTransaction() {
    const r = await call(":beginTransaction", "POST", { options: { readWrite: {} } });
    if (!validTransaction(r?.transaction)) throw new Fault("transaction_unavailable", 503);
    return r.transaction;
  }
  __name(beginTransaction, "beginTransaction");
  async function getInTransaction(path2, transaction) {
    if (!validTransaction(transaction) || !/^[-A-Za-z0-9_/]{1,240}$/.test(path2) || path2.includes("//")) throw new Fault("invalid_transaction_read", 503);
    const r = await call("/" + path2 + "?transaction=" + encodeURIComponent(transaction));
    return r ? { data: unpack({ mapValue: { fields: r.fields || {} } }), version: r.updateTime } : null;
  }
  __name(getInTransaction, "getInTransaction");
  async function commitTransaction(transaction, writes) {
    if (!validTransaction(transaction) || !Array.isArray(writes) || !writes.length || writes.length > 8 || writes.some((w) => !w?.update?.name?.startsWith(root + "/") || !w.currentDocument || !(w.currentDocument.updateTime || w.currentDocument.exists === false)))
      throw new Fault("unsafe_transaction_commit", 503);
    return call(":commit", "POST", { writes, transaction });
  }
  __name(commitTransaction, "commitTransaction");
  async function rollbackTransaction(transaction) {
    if (!validTransaction(transaction)) return;
    try {
      await call(":rollback", "POST", { transaction });
    } catch {
    }
  }
  __name(rollbackTransaction, "rollbackTransaction");
  async function pending() {
    const result = await call(":runQuery", "POST", { structuredQuery: { from: [{ collectionId: "stripe_checkout_sessions" }], where: { fieldFilter: { field: { fieldPath: "reconcilePending" }, op: "EQUAL", value: { booleanValue: true } } }, limit: 50 } });
    return result.filter((r) => r.document).map((r) => unpack({ mapValue: { fields: r.document.fields } }));
  }
  __name(pending, "pending");
  async function reviews() {
    const result = await call(":runQuery", "POST", { structuredQuery: { from: [{ collectionId: "stripe_review_queue" }], where: { fieldFilter: { field: { fieldPath: "resolved" }, op: "EQUAL", value: { booleanValue: false } } }, limit: 50 } });
    return result.filter((r) => r.document).map((r) => unpack({ mapValue: { fields: r.document.fields } }));
  }
  __name(reviews, "reviews");
  async function refundPending() {
    const result = await call(":runQuery", "POST", { structuredQuery: { from: [{ collectionId: "stripe_refund_queue" }], where: { fieldFilter: { field: { fieldPath: "resolved" }, op: "EQUAL", value: { booleanValue: false } } }, limit: 50 } });
    return result.filter((r) => r.document).map((r) => unpack({ mapValue: { fields: r.document.fields } }));
  }
  __name(refundPending, "refundPending");
  return {
    get,
    commit,
    root,
    write,
    writePatch,
    pending,
    reviews,
    refundPending,
    beginTransaction,
    getInTransaction,
    commitTransaction,
    rollbackTransaction
  };
}
__name(createStore, "createStore");

// operations.mjs
async function operationalReport(store, now = Date.now()) {
  const [pending, reviews, refunds] = await Promise.all([
    store.pending(),
    store.reviews(),
    store.refundPending()
  ]);
  const overdue = /* @__PURE__ */ __name((records) => records.filter((x) => {
    const t = Date.parse(x.createdAt || "");
    return !Number.isFinite(t) || now - t > 45 * 60 * 1e3;
  }), "overdue");
  const expiredPending = overdue(pending).length;
  const overdueRefunds = overdue(refunds).length;
  const scanLimitReached = [pending, reviews, refunds].some((list) => list.length >= 50);
  return {
    pendingSample: pending.length,
    reviewSample: reviews.length,
    refundPendingSample: refunds.length,
    overduePendingCount: expiredPending,
    overdueRefundCount: overdueRefunds,
    scanLimitReached,
    requiresAttention: expiredPending > 0 || reviews.length > 0 || refunds.length > 0 || scanLimitReached
  };
}
__name(operationalReport, "operationalReport");
if (process.argv[1]?.endsWith("/operations.mjs")) {
  releaseConfig(process.env);
  const report = await operationalReport(createStore(process.env));
  console.log(JSON.stringify(report));
  if (report.requiresAttention) process.exitCode = 2;
}

// operations-email.mjs
var isEmail = /* @__PURE__ */ __name((x) => typeof x === "string" && x.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(x), "isEmail");
var count = /* @__PURE__ */ __name((report, k) => {
  const n = report[k];
  if (!Number.isSafeInteger(n) || n < 0 || n > 1e6) throw Error("invalid_report_count");
  return n;
}, "count");
function operationalEmail(report) {
  if (!report || typeof report !== "object" || typeof report.requiresAttention !== "boolean") throw Error("invalid_operational_report");
  if (!report.requiresAttention) return null;
  const pending = count(report, "pendingSample");
  const review = count(report, "reviewSample");
  const refund = count(report, "refundPendingSample");
  const overduePending = count(report, "overduePendingCount");
  const overdueRefund = count(report, "overdueRefundCount");
  if (typeof report.scanLimitReached !== "boolean") throw Error("invalid_scan_limit_flag");
  return Object.freeze({
    subject: "[Kandorty] Payment operations require attention",
    text: [
      "Kandorty payment operations attention (aggregate counts only).",
      "Unsettled checkout sample: " + pending,
      "Paid stock-review sample: " + review,
      "Pending cancellation-refund sample: " + refund,
      "Overdue checkout sample: " + overduePending,
      "Overdue cancellation-refund sample: " + overdueRefund,
      "Queue scan reached the 50-record sample limit: " + (report.scanLimitReached ? "YES" : "NO"),
      "These are bounded samples; never assume they represent the full backlog.",
      "Review the authenticated operations dashboard and Stripe provider evidence.",
      "Never refund, mark paid or restore stock solely because of this email."
    ].join("\n")
  });
}
__name(operationalEmail, "operationalEmail");
async function sendOperationalEmail(report, env, transport = fetch) {
  const message = operationalEmail(report);
  if (!message) return Object.freeze({ status: "healthy_no_send" });
  return sendOperatorEmail(message, env, transport);
}
__name(sendOperationalEmail, "sendOperationalEmail");
async function sendOperatorEmail(message, env, transport = fetch) {
  if (env?.ALERT_DELIVERY_ENABLED !== "true") return Object.freeze({ status: "disabled_no_send" });
  if (env.STRIPE_MODE !== "test" && env.STRIPE_MODE !== "live") throw Error("invalid_delivery_mode");
  const to = env.ALERT_EMAIL_TO, from = env.ALERT_EMAIL_FROM, apiKey = env.RESEND_API_KEY, eventKey = env.ALERT_EVENT_KEY;
  if (!isEmail(to) || !isEmail(from) || typeof apiKey !== "string" || !/^re_[A-Za-z0-9_\-]{8,}$/.test(apiKey) || typeof eventKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(eventKey))
    throw Error("alert_delivery_not_configured");
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": eventKey
    },
    body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response?.ok) throw Error("alert_delivery_failed");
  return Object.freeze({ status: "accepted_by_provider_not_delivered" });
}
__name(sendOperatorEmail, "sendOperatorEmail");

// alert-scheduler.mjs
var WINDOW_MS2 = 60 * 60 * 1e3;
var LEASE_MS = 90 * 1e3;
var RETRY_MS = 2 * 60 * 1e3;
var iso = /* @__PURE__ */ __name((ms) => new Date(ms).toISOString(), "iso");
var nonce = /* @__PURE__ */ __name(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""), "nonce");
var asAggregate = /* @__PURE__ */ __name((r) => {
  if (!r || typeof r.requiresAttention !== "boolean" || typeof r.scanLimitReached !== "boolean")
    throw Error("alert_report_invalid");
  const result = { requiresAttention: r.requiresAttention, scanLimitReached: r.scanLimitReached };
  for (const name of ["pendingSample", "reviewSample", "refundPendingSample", "overduePendingCount", "overdueRefundCount"]) {
    if (!Number.isSafeInteger(r[name]) || r[name] < 0 || r[name] > 1e6)
      throw Error("alert_report_invalid");
    result[name] = r[name];
  }
  return Object.freeze(result);
}, "asAggregate");
async function runScheduledAlert({
  store,
  env,
  now = Date.now(),
  reporter = operationalReport,
  send = sendOperationalEmail,
  net = fetch
} = {}) {
  if (env?.ALERT_DELIVERY_ENABLED !== "true")
    return Object.freeze({ status: "disabled_no_send" });
  if (!["test", "live"].includes(env.STRIPE_MODE)) throw Error("alert_mode_invalid");
  if (env.STRIPE_MODE === "live" && env.ALERT_PRODUCTION_APPROVAL !== "KANDORTY_ALERTS_APPROVED")
    throw Error("alert_live_approval_required");
  if (!store || typeof store.get !== "function" || typeof store.write !== "function" || typeof store.commit !== "function") throw Error("alert_store_missing");
  if (!Number.isSafeInteger(now) || now < 0) throw Error("alert_clock_invalid");
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM || !env.ALERT_EMAIL_TO)
    throw Error("alert_private_configuration_missing");
  const report = asAggregate(await reporter(store, now));
  if (!report.requiresAttention) return Object.freeze({ status: "healthy_no_send" });
  const eventKey = "kandorty-ops-" + env.STRIPE_MODE + "-" + String(Math.floor(now / WINDOW_MS2));
  const path2 = "stripe_operator_alerts/" + await hash(eventKey);
  const row = await store.get(path2);
  const prior = row?.data;
  if (prior) {
    if (prior.eventKey !== eventKey) throw Error("alert_state_conflict");
    if (prior.status === "accepted") return Object.freeze({ status: "already_accepted_no_send" });
    if (prior.status === "sending" && Number.isSafeInteger(prior.leaseUntil) && prior.leaseUntil > now)
      return Object.freeze({ status: "in_flight_no_send" });
    if (prior.status === "failed" && Number.isSafeInteger(prior.retryAt) && prior.retryAt > now)
      return Object.freeze({ status: "retry_cooldown_no_send" });
    if (!["sending", "failed"].includes(prior.status) || !Number.isSafeInteger(prior.attempt) || prior.attempt < 1 || prior.attempt > 1e3) throw Error("alert_state_invalid");
  }
  const messageReport = asAggregate(prior?.messageReport || report);
  if (!messageReport.requiresAttention) throw Error("alert_state_invalid");
  const leaseToken = nonce();
  const claimed = {
    eventKey,
    messageReport,
    status: "sending",
    leaseToken,
    leaseUntil: now + LEASE_MS,
    attempt: (prior?.attempt || 0) + 1,
    createdAt: prior?.createdAt || iso(now),
    updatedAt: iso(now)
  };
  try {
    await store.commit([store.write(path2, claimed, row ? { updateTime: row.version } : { exists: false })]);
  } catch (e) {
    if (e?.message === "write_conflict") return Object.freeze({ status: "claimed_elsewhere_no_send" });
    throw Error("alert_claim_failed");
  }
  const claimRow = await store.get(path2);
  if (claimRow?.data?.leaseToken !== leaseToken || claimRow.data.status !== "sending")
    throw Error("alert_claim_confirmation_failed");
  try {
    const result = await send(messageReport, { ...env, ALERT_EVENT_KEY: eventKey }, net);
    if (result?.status !== "accepted_by_provider_not_delivered")
      throw Error("alert_provider_not_accepted");
  } catch {
    const failed = {
      ...claimed,
      status: "failed",
      leaseToken: "",
      leaseUntil: 0,
      retryAt: now + RETRY_MS,
      updatedAt: iso(now)
    };
    try {
      await store.commit([store.write(path2, failed, { updateTime: claimRow.version })]);
    } catch {
      throw Error("alert_failure_persistence_failed");
    }
    throw Error("alert_send_failed");
  }
  const accepted = {
    ...claimed,
    status: "accepted",
    leaseToken: "",
    leaseUntil: 0,
    acceptedAt: iso(now),
    updatedAt: iso(now)
  };
  try {
    await store.commit([store.write(path2, accepted, { updateTime: claimRow.version })]);
  } catch {
    throw Error("alert_acceptance_persistence_failed");
  }
  return Object.freeze({ status: "accepted_by_provider_not_delivered" });
}
__name(runScheduledAlert, "runScheduledAlert");

// resend-delivery-audit.mjs
var SUBJECT = "[Kandorty] Payment operations require attention";
var GOOD_EVENT = /^(delivered|opened|clicked|sent|queued|bounced|complained|delivery_delayed|failed)$/;
var HOUR_MS = 36e5;
async function auditResendDelivery({ store, env, now = Date.now(), net = fetch } = {}) {
  if (env?.ALERT_DELIVERY_ENABLED !== "true") return { status: "disabled" };
  if (env?.RESEND_READ_ACCESS_ENABLED !== "true") return { status: "read_not_authorized_no_network" };
  if (!store || typeof store.get !== "function" || typeof store.commit !== "function" || typeof store.write !== "function")
    throw Error("delivery_audit_store_missing");
  if (!Number.isSafeInteger(now) || now < 0) throw Error("delivery_audit_clock_invalid");
  if (env.STRIPE_MODE !== "test" && env.STRIPE_MODE !== "live")
    throw Error("delivery_audit_mode_invalid");
  if (env.STRIPE_MODE === "live" && env.ALERT_PRODUCTION_APPROVAL !== "KANDORTY_ALERTS_APPROVED")
    throw Error("delivery_audit_live_not_approved");
  const key2 = env.RESEND_READ_API_KEY;
  if (typeof key2 !== "string" || !/^re_[A-Za-z0-9_-]{8,}$/.test(key2) || typeof env.ALERT_EMAIL_FROM !== "string" || typeof env.ALERT_EMAIL_TO !== "string")
    return { status: "missing_provider_credentials" };
  const hour = Math.floor(now / HOUR_MS);
  const candidates = [];
  for (const h of [hour - 1, hour]) {
    const eventKey = "kandorty-ops-" + env.STRIPE_MODE + "-" + h;
    const path2 = "stripe_operator_alerts/" + await hash(eventKey);
    const row = await store.get(path2);
    if (row?.data?.eventKey !== eventKey || row.data.status !== "accepted" || row.data.deliveryStatus === "delivered") continue;
    const accepted = Date.parse(row.data.acceptedAt || "");
    if (!Number.isFinite(accepted) || accepted > now + 6e4 || now - accepted > 2 * HOUR_MS) continue;
    candidates.push({ row, path: path2, accepted });
  }
  if (!candidates.length) return { status: "nothing_to_check" };
  let remote;
  try {
    const r = await net("https://api.resend.com/emails?limit=100", {
      method: "GET",
      redirect: "error",
      headers: { Authorization: "Bearer " + key2, Accept: "application/json", "User-Agent": "Kandorty-Operator-Alerts/1.0" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!r?.ok) return { status: "provider_status_unavailable" };
    const payload = await r.json();
    if (payload?.object !== "list" || !Array.isArray(payload.data))
      return { status: "provider_status_unavailable" };
    remote = payload.data;
  } catch {
    return { status: "provider_status_unavailable" };
  }
  let recorded = 0, matched = 0;
  for (const { row, path: path2, accepted } of candidates) {
    const messages = remote.filter((x) => x && x.subject === SUBJECT && x.from === env.ALERT_EMAIL_FROM && Array.isArray(x.to) && x.to.includes(env.ALERT_EMAIL_TO) && Number.isFinite(Date.parse(x.created_at || "")) && Math.abs(Date.parse(x.created_at) - accepted) <= 30 * 6e4 && typeof x.last_event === "string" && GOOD_EVENT.test(x.last_event));
    if (messages.length !== 1) continue;
    matched++;
    const event = messages[0].last_event;
    if (row.data.deliveryStatus === event) continue;
    const update = {
      ...row.data,
      deliveryStatus: event,
      deliveryStatusCheckedAt: new Date(now).toISOString()
    };
    try {
      await store.commit([store.write(path2, update, { updateTime: row.version })]);
      recorded++;
    } catch (e) {
      if (e?.message !== "write_conflict") return { status: "status_persistence_unavailable" };
    }
  }
  return {
    status: "provider_metadata_checked",
    matched,
    recorded,
    // Even a 'delivered' event means provider-reported delivery, not Inbox proof.
    inboxConfirmed: false
  };
}
__name(auditResendDelivery, "auditResendDelivery");

// delivery.mjs
function cartDeliveryFils(settings = {}) {
  const note = String(settings.cartButtonNote || settings.cartCustomText || "").trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776)).replace(/٫/g, ".");
  if (/^(?:التوصيل|توصيل)\s+مجاني$|^free delivery$/i.test(note)) return 0;
  const amount = note.match(/^(?:(?:التوصيل|توصيل|delivery)\s*(?:ب|:)?\s*)?(\d{1,5}(?:\.\d{1,2})?)\s*(?:درهم|د\.?إ\.?|AED)?$/i);
  return amount ? Math.round(Number(amount[1]) * 100) : 2500;
}
__name(cartDeliveryFils, "cartDeliveryFils");

// refunds.mjs
async function syncRefunds(store, stripe, snapshot) {
  const state = await stripe.refundState(snapshot.sessionId, snapshot);
  for (let n = 0; n < 5; n++) {
    const row = await store.get("orders/" + snapshot.orderId);
    if (!row || row.data.stripeSessionId !== snapshot.sessionId) throw new Fault("refund_order_mismatch", 409);
    const old = row.data;
    if (state.amount < Math.round(Number(old.refundedAmount || 0) * 100)) return old;
    const status = state.status === "none" && old.refundStatus === "required" ? "required" : state.status;
    if (old.refundStatus === status && old.refundedAmount === state.amount / 100) return old;
    const updated2 = { ...old, refundStatus: status, refundedAmount: state.amount / 100, refundCheckedAt: (/* @__PURE__ */ new Date()).toISOString() };
    const writes = [store.write("orders/" + old.id, updated2, { updateTime: row.version })];
    for (const collection of ["stripe_refund_queue", "stripe_review_queue"]) {
      const q = await store.get(collection + "/" + old.id);
      if (q && state.status === "full") writes.push(store.write(collection + "/" + old.id, { ...q.data, resolved: true, resolution: "full_refund_verified", resolvedAt: updated2.refundCheckedAt }, { updateTime: q.version }));
    }
    try {
      await store.commit(writes);
      return updated2;
    } catch (e) {
      if (e.message !== "write_conflict") throw e;
    }
  }
  throw new Fault("database_busy", 503);
}
__name(syncRefunds, "syncRefunds");

// ../stripe-live-candidate/cod.mjs
var CodFault = class extends Error {
  static {
    __name(this, "CodFault");
  }
  constructor(code) {
    super(code);
    this.code = code;
  }
};
var check = /* @__PURE__ */ __name((ok, code) => {
  if (!ok) throw new CodFault(code);
}, "check");
var idOK = /* @__PURE__ */ __name((s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,150}$/.test(s), "idOK");
var versionOK = /* @__PURE__ */ __name((s) => typeof s === "string" && /^\d{4}-\d\d-\d\dT/.test(s), "versionOK");
var obj = /* @__PURE__ */ __name((x) => x !== null && typeof x === "object" && !Array.isArray(x), "obj");
var digits = /* @__PURE__ */ __name((s) => String(s || "").replace(/\D/g, ""), "digits");
var cents = /* @__PURE__ */ __name((x) => {
  check(typeof x === "number" || typeof x === "string", "invalid_catalog_price");
  check(/^\d+(\.\d{1,2})?$/.test(String(x)), "invalid_catalog_price");
  const [whole, fraction = ""] = String(x).split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  check(Number.isSafeInteger(n) && n > 0 && n <= 1e8, "invalid_catalog_price");
  return n;
}, "cents");
var storeValue = /* @__PURE__ */ __name((v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    check(Number.isFinite(v), "invalid_value");
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(storeValue) } };
  check(obj(v), "invalid_value");
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, storeValue(x)])) } };
}, "storeValue");
var fields = /* @__PURE__ */ __name((x) => storeValue(x).mapValue.fields, "fields");
var doc = /* @__PURE__ */ __name((root, collection, key2) => {
  check(idOK(key2), "invalid_document_id");
  return root + "/" + collection + "/" + key2;
}, "doc");
var put = /* @__PURE__ */ __name((root, collection, key2, data) => ({
  update: { name: doc(root, collection, key2), fields: fields(data) },
  currentDocument: { exists: false }
}), "put");
var updated = /* @__PURE__ */ __name((root, key2, stock, totalStock, updatedAt, version, imageStocks = null) => {
  const next = { stock, totalStock, updatedAt };
  if (imageStocks !== null) next.imageStocks = imageStocks;
  return {
    update: { name: doc(root, "products", key2), fields: fields(next) },
    updateMask: { fieldPaths: Object.keys(next) },
    currentDocument: { updateTime: version }
  };
}, "updated");
async function digest(input) {
  const bytes2 = new TextEncoder().encode(input);
  const result = await crypto.subtle.digest("SHA-256", bytes2);
  return [...new Uint8Array(result)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
__name(digest, "digest");
function normalizeCodRequest(input) {
  check(obj(input), "invalid_request");
  check(
    Object.keys(input).every((k) => ["checkoutToken", "items", "customer", "note", "payment"].includes(k)),
    "unsupported_client_fields"
  );
  check(input.payment === void 0 || input.payment === "cod", "invalid_payment_mode");
  check(
    typeof input.checkoutToken === "string" && /^[a-f0-9]{64}$/.test(input.checkoutToken),
    "invalid_checkout_token"
  );
  check(obj(input.customer), "invalid_customer");
  const customer = {};
  for (const [field, max] of [["name", 100], ["phone", 30], ["city", 100], ["location", 500]]) {
    const value = input.customer[field];
    check(typeof value === "string" && value.trim().length > 0 && value.length <= max, "invalid_customer");
    customer[field] = value.trim();
  }
  check(digits(customer.phone).length >= 6 && digits(customer.phone).length <= 18, "invalid_customer_phone");
  check(Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 20, "invalid_items");
  const merged = /* @__PURE__ */ new Map();
  for (const i of input.items) {
    check(obj(i) && Object.keys(i).every((k) => ["id", "qty", "imageIndex"].includes(k)), "invalid_items");
    check(idOK(i.id), "invalid_product_id");
    check(Number.isSafeInteger(i.qty) && i.qty >= 1 && i.qty <= 99, "invalid_quantity");
    const imageIndex = i.imageIndex ?? 0;
    check(Number.isSafeInteger(imageIndex) && imageIndex >= 0 && imageIndex <= 7, "invalid_variant");
    const key2 = i.id + "__img" + imageIndex;
    const qty = (merged.get(key2)?.qty || 0) + i.qty;
    check(qty <= 99, "invalid_quantity");
    merged.set(key2, { id: i.id, qty, imageIndex });
  }
  const note = input.note ?? "";
  check(typeof note === "string" && note.length <= 15, "invalid_note");
  return { customer, items: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id) || a.imageIndex - b.imageIndex), note: note.trim() };
}
__name(normalizeCodRequest, "normalizeCodRequest");
async function prepareCodOrder({
  request,
  projectId,
  orderId,
  editToken,
  accessKey,
  products,
  nowISO,
  deliveryFils = 2500,
  testOnly = false,
  existingIntent = null,
  existingOrder = null,
  verifiedIdentity = null
}) {
  const normalized = normalizeCodRequest(request);
  check(/^[a-z][a-z0-9-]{4,60}$/.test(projectId || "") && (testOnly ? projectId === "kandorty-stripe-test-5f8af" : projectId !== "kandorty-stripe-test-5f8af"), "invalid_project");
  check(/^KD-[0-9]{8}$/.test(orderId || ""), "invalid_order_id");
  check(/^[a-f0-9]{48}$/.test(editToken || ""), "invalid_server_edit_token");
  check(typeof nowISO === "string" && !Number.isNaN(Date.parse(nowISO)), "invalid_timestamp");
  check(obj(products), "missing_catalog");
  const checkoutId = await digest(request.checkoutToken);
  const fingerprint = await digest(JSON.stringify(normalized));
  check(
    accessKey === await digest(orderId.toUpperCase() + "|" + digits(normalized.customer.phone)),
    "invalid_server_access_key"
  );
  if (existingIntent !== null || existingOrder !== null) {
    check(obj(existingIntent) && obj(existingOrder), "partial_existing_order");
    check(existingIntent.checkoutId === checkoutId && existingIntent.fingerprint === fingerprint && existingIntent.orderId === existingOrder.id && existingOrder.id === orderId && existingOrder.payment === "cod" && existingOrder.paymentStatus === "unpaid" && existingIntent.fulfilled === true, "checkout_conflict");
    return { replay: true, writes: [], order: existingOrder, checkoutId };
  }
  const root = "projects/" + projectId + "/databases/(default)/documents";
  const productQuantities = /* @__PURE__ */ new Map();
  const items = [];
  let subtotal = 0;
  for (const item of normalized.items) {
    const row = products[item.id];
    check(obj(row) && obj(row.data) && row.data.active !== false, "unavailable_product");
    const p = row.data;
    const images = Array.isArray(p.images) ? p.images : [];
    check(item.imageIndex === 0 || item.imageIndex < images.length, "invalid_variant");
    const unitAmount = cents(p.salePrice || p.price);
    subtotal += unitAmount * item.qty;
    check(Number.isSafeInteger(subtotal) && subtotal <= 1e8, "invalid_total");
    const qty = (productQuantities.get(item.id) || 0) + item.qty;
    check(qty <= 99, "invalid_quantity");
    productQuantities.set(item.id, qty);
    items.push({
      id: item.id,
      code: String(p.code || "").slice(0, 120),
      name: String(p.nameAr || p.nameEn || "Kandorty").slice(0, 120),
      price: unitAmount / 100,
      qty: item.qty,
      imageIndex: item.imageIndex,
      variantKey: item.id + "__img" + item.imageIndex,
      imageUrl: String(images[item.imageIndex] || "").slice(0, 1200)
    });
  }
  const totalFils = subtotal + deliveryFils;
  check(totalFils <= 1e8, "invalid_total");
  const stockDebits = {}, stockDebitsByImage = {}, stockWrites = [];
  for (const [id, qty] of productQuantities) {
    const row = products[id], p = row.data;
    check(
      p.stock !== "" && p.stock !== void 0 && p.stock !== null,
      "inventory_not_configured"
    );
    check((typeof p.stock === "number" || typeof p.stock === "string") && /^(0|[1-9]\d*)$/.test(String(p.stock)), "invalid_stock");
    const current = Number(p.stock);
    check(Number.isSafeInteger(current) && current >= qty, "insufficient_stock");
    check(versionOK(row.updateTime), "missing_product_version");
    const totalStock = p.totalStock;
    check(typeof totalStock === "number" && Number.isSafeInteger(totalStock) && totalStock >= current, "inventory_total_not_configured");
    let nextImageStocks = null;
    if (p.imageStocks !== void 0 && p.imageStocks !== null && !(Array.isArray(p.imageStocks) && p.imageStocks.length === 0 && (!Array.isArray(p.images) || p.images.length === 0))) {
      const photoCount = Array.isArray(p.images) ? p.images.length : 0;
      check(
        Array.isArray(p.imageStocks) && p.imageStocks.length === photoCount && p.imageStocks.every((n) => Number.isSafeInteger(n) && n >= 0),
        "variant_stock_not_configured"
      );
      check(
        p.imageStocks.reduce((a, n) => a + n, 0) === current,
        "variant_stock_inconsistent"
      );
      nextImageStocks = p.imageStocks.slice();
      for (const item of normalized.items.filter((item2) => item2.id === id)) {
        check(item.imageIndex < nextImageStocks.length, "invalid_variant");
        check(nextImageStocks[item.imageIndex] >= item.qty, "insufficient_variant_stock");
        nextImageStocks[item.imageIndex] -= item.qty;
        stockDebitsByImage[id + "__img" + item.imageIndex] = item.qty;
      }
      check(nextImageStocks.reduce((a, n) => a + n, 0) === current - qty, "variant_stock_inconsistent");
    }
    stockDebits[id] = qty;
    stockWrites.push(updated(
      root,
      id,
      current - qty,
      totalStock,
      nowISO,
      row.updateTime,
      nextImageStocks
    ));
  }
  const customer = normalized.customer;
  const order = {
    id: orderId,
    customer,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerCity: customer.city,
    customerLocation: customer.location,
    createdAt: nowISO,
    status: "new",
    payment: "cod",
    paymentStatus: "unpaid",
    subtotal: subtotal / 100,
    deliveryFee: deliveryFils / 100,
    deliveryPayment: "with_order",
    total: totalFils / 100,
    notes: normalized.note,
    items,
    stockDebits,
    stockDebitsByImage,
    inventoryStatus: "debited",
    stockDebited: Object.keys(stockDebits).length > 0,
    editToken
  };
  if (verifiedIdentity !== null) {
    check(obj(verifiedIdentity) && idOK(verifiedIdentity.uid) && digits(verifiedIdentity.phoneNumber) === digits(customer.phone), "unverified_customer_identity");
    order.customerUid = verifiedIdentity.uid;
    order.authPhone = verifiedIdentity.phoneNumber;
  }
  const quantities = Object.fromEntries(items.map((i) => [i.variantKey, i.qty]));
  const intent = {
    checkoutId,
    fingerprint,
    orderId,
    fulfilled: true,
    status: "created",
    payment: "cod",
    createdAt: nowISO,
    totalFils
  };
  const edit = {
    orderId,
    editToken,
    status: "new",
    createdAt: nowISO,
    customer,
    payment: "cod",
    notes: normalized.note,
    items,
    quantities,
    updatedAt: nowISO
  };
  const access = { orderId, editToken, active: true, createdAt: nowISO };
  const writes = [
    put(root, "cod_checkout_intents", checkoutId, intent),
    put(root, "orders", orderId, order),
    put(root, "tracking", orderId, { id: orderId, status: "new", createdAt: nowISO }),
    put(root, "order_edits", editToken, edit),
    put(root, "order_access", accessKey, access),
    ...stockWrites
  ];
  check(writes.length <= 25, "too_many_writes");
  return { replay: false, writes, checkoutId, order, stockDebits, stockDebitsByImage };
}
__name(prepareCodOrder, "prepareCodOrder");

// ../stripe-live-candidate/fulfillment.mjs
var CheckoutFault = class extends Error {
  static {
    __name(this, "CheckoutFault");
  }
  constructor(code) {
    super(code);
    this.code = code;
  }
};
var check2 = /* @__PURE__ */ __name((value, code) => {
  if (!value) throw new CheckoutFault(code);
}, "check");
var identity = /* @__PURE__ */ __name((s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(s), "identity");
var object = /* @__PURE__ */ __name((v) => v !== null && typeof v === "object" && !Array.isArray(v), "object");
var money = /* @__PURE__ */ __name((v) => Number.isSafeInteger(v) && v > 0, "money");
var numberStock = /* @__PURE__ */ __name((v) => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,12}$/.test(v)) return Number(v);
  return null;
}, "numberStock");
function typed(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    check2(Number.isFinite(value), "invalid_field_value");
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(typed) } };
  check2(object(value), "invalid_field_value");
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typed(v)])) } };
}
__name(typed, "typed");
function fields2(value) {
  return typed(value).mapValue.fields;
}
__name(fields2, "fields");
function path(root, type, id) {
  check2(identity(id), "invalid_document_id");
  return root + "/" + type + "/" + id;
}
__name(path, "path");
var validVersion = /* @__PURE__ */ __name((v) => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v), "validVersion");
function validatePaidSession(session, snapshot, { mode = "live" } = {}) {
  check2(mode === "live" || mode === "test", "invalid_payment_mode");
  check2(object(session) && object(snapshot), "missing_checkout");
  check2((mode === "live" ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/).test(session.id || ""), mode === "live" ? "not_live_session" : "not_test_session");
  check2(session.livemode === (mode === "live") && session.mode === "payment" && session.payment_status === "paid" && session.status === "complete", "payment_not_verified");
  check2(session.currency === "aed" && money(snapshot.totalFils) && Number.isSafeInteger(session.amount_total) && session.amount_total === snapshot.totalFils, "paid_amount_mismatch");
  check2(/^KD-\d{8}$/.test(snapshot.orderId || ""), "invalid_order_id");
  check2(/^[a-f0-9]{64}$/.test(snapshot.checkoutId || ""), "invalid_checkout_id");
  check2(session.client_reference_id === snapshot.orderId && session.metadata?.order_id === snapshot.orderId && session.metadata?.checkout_id === snapshot.checkoutId, "checkout_binding_mismatch");
  check2(!snapshot.sessionId || snapshot.sessionId === session.id, "session_binding_mismatch");
  return true;
}
__name(validatePaidSession, "validatePaidSession");
function preparePaidFulfillment({
  session,
  snapshot,
  snapshotVersion,
  existingOrder = null,
  products,
  editToken,
  accessKey,
  nowISO,
  projectId,
  mode = "live"
}) {
  validatePaidSession(session, snapshot, { mode });
  check2(/^[a-z][a-z0-9-]{4,60}$/.test(projectId || ""), "invalid_project");
  check2(mode === "test" ? projectId === "kandorty-stripe-test-5f8af" : projectId !== "kandorty-stripe-test-5f8af", "test_project_not_live");
  check2(validVersion(snapshotVersion), "missing_snapshot_version");
  check2(typeof nowISO === "string" && !Number.isNaN(Date.parse(nowISO)), "invalid_timestamp");
  const root = "projects/" + projectId + "/databases/(default)/documents";
  if (existingOrder !== null) {
    check2(existingOrder.id === snapshot.orderId && existingOrder.stripeSessionId === session.id && existingOrder.paymentStatus === "paid", "existing_order_conflict");
    return { replay: true, writes: [], order: existingOrder, inventoryStatus: existingOrder.inventoryStatus };
  }
  check2(/^[a-f0-9]{48}$/.test(editToken || ""), "invalid_server_edit_token");
  check2(/^[a-f0-9]{64}$/.test(accessKey || ""), "invalid_server_access_key");
  const customer = snapshot.customer;
  check2(object(customer) && [customer.name, customer.phone, customer.city, customer.location].every((x) => typeof x === "string" && x.length > 0 && x.length <= 500), "invalid_customer");
  check2(Array.isArray(snapshot.items) && snapshot.items.length > 0 && snapshot.items.length <= 20, "invalid_items");
  check2(object(products), "missing_products");
  const byProduct = /* @__PURE__ */ new Map(), quantities = {};
  let subtotal = 0;
  for (const item of snapshot.items) {
    check2(object(item) && identity(item.id) && Number.isSafeInteger(item.qty) && item.qty > 0 && item.qty <= 99 && money(item.unitAmount), "invalid_items");
    const imageIndex = item.imageIndex ?? 0;
    check2(Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex <= 7, "invalid_variant");
    const lineKey = item.id + "__img" + imageIndex;
    check2(!Object.hasOwn(quantities, lineKey), "duplicate_line_item");
    quantities[lineKey] = item.qty;
    const accumulated = (byProduct.get(item.id) || 0) + item.qty;
    check2(accumulated <= 99, "invalid_quantity");
    byProduct.set(item.id, accumulated);
    subtotal += item.unitAmount * item.qty;
    check2(Number.isSafeInteger(subtotal), "invalid_total");
  }
  const deliveryFils = snapshot.deliveryFils ?? 2500;
  check2(Number.isSafeInteger(deliveryFils) && deliveryFils >= 0 && subtotal + deliveryFils === snapshot.totalFils, "snapshot_total_mismatch");
  const stockDebits = {}, stockDebitsByImage = {}, updates = [];
  let shortages = false;
  for (const [productId, need] of byProduct) {
    const row = products[productId];
    if (!object(row) || !object(row.data) || row.data.active === false) {
      shortages = true;
      continue;
    }
    const value = row.data.stock;
    if (value === null || value === void 0 || value === "") {
      shortages = true;
      continue;
    }
    const current = numberStock(value);
    const priorTotal = row.data.totalStock;
    if (current === null || current < need || typeof priorTotal !== "number" || !Number.isSafeInteger(priorTotal) || priorTotal < current) {
      shortages = true;
      continue;
    }
    let nextImageStocks = null;
    if (row.data.imageStocks !== void 0 && row.data.imageStocks !== null && !(Array.isArray(row.data.imageStocks) && row.data.imageStocks.length === 0 && (!Array.isArray(row.data.images) || row.data.images.length === 0))) {
      const imageCount = Array.isArray(row.data.images) ? row.data.images.length : 0;
      const valid = Array.isArray(row.data.imageStocks) && row.data.imageStocks.length === imageCount && row.data.imageStocks.every((n) => Number.isSafeInteger(n) && n >= 0);
      if (!valid || row.data.imageStocks.reduce((a, n) => a + n, 0) !== current) {
        shortages = true;
        continue;
      }
      nextImageStocks = row.data.imageStocks.slice();
      const requested = snapshot.items.filter((i) => i.id === productId);
      if (requested.some((i) => (i.imageIndex ?? 0) >= nextImageStocks.length || nextImageStocks[i.imageIndex ?? 0] < i.qty)) {
        shortages = true;
        continue;
      }
      for (const item of requested) {
        const index = item.imageIndex ?? 0;
        nextImageStocks[index] -= item.qty;
        stockDebitsByImage[productId + "__img" + index] = item.qty;
      }
    }
    check2(validVersion(row.updateTime), "missing_product_version");
    stockDebits[productId] = need;
    updates.push({
      path: path(root, "products", productId),
      updateTime: row.updateTime,
      stock: current - need,
      totalStock: priorTotal,
      imageStocks: nextImageStocks
    });
  }
  const inventoryStatus = shortages ? "needs_review" : "debited";
  const recordedDebits = shortages ? {} : stockDebits;
  const recordedVariantDebits = shortages ? {} : stockDebitsByImage;
  const order = {
    id: snapshot.orderId,
    createdAt: snapshot.createdAt || nowISO,
    customer,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerCity: customer.city,
    customerLocation: customer.location,
    payment: "card",
    paymentStatus: "paid",
    paidAt: nowISO,
    stripeSessionId: session.id,
    items: snapshot.items.map((i) => ({
      id: i.id,
      code: String(i.code || ""),
      name: String(i.name || "Kandorty").slice(0, 120),
      price: i.unitAmount / 100,
      qty: i.qty,
      variantKey: i.id + "__img" + (i.imageIndex ?? 0),
      imageIndex: i.imageIndex ?? 0,
      imageUrl: String(i.imageUrl || "").slice(0, 1200)
    })),
    subtotal: subtotal / 100,
    deliveryFee: deliveryFils / 100,
    deliveryPayment: "with_card",
    total: snapshot.totalFils / 100,
    notes: String(snapshot.note || "").slice(0, 15),
    status: "new",
    inventoryStatus,
    stockDebited: !shortages && Object.keys(recordedDebits).length > 0,
    stockDebits: recordedDebits,
    stockDebitsByImage: recordedVariantDebits,
    editToken
  };
  if (snapshot.verifiedCustomerUid && identity(snapshot.verifiedCustomerUid) && snapshot.customerUidVerifiedByServer === true) order.customerUid = snapshot.verifiedCustomerUid;
  const edit = {
    orderId: order.id,
    editToken,
    status: "new",
    createdAt: order.createdAt,
    customer,
    payment: "card",
    notes: order.notes,
    items: order.items,
    quantities,
    updatedAt: nowISO
  };
  const access = { orderId: order.id, editToken, active: true, createdAt: nowISO };
  const put2 = /* @__PURE__ */ __name((collection, id, data, condition = { exists: false }) => ({
    update: { name: path(root, collection, id), fields: fields2(data) },
    currentDocument: condition
  }), "put");
  const writes = [
    put2("orders", order.id, order),
    put2("tracking", order.id, { id: order.id, status: "new", createdAt: order.createdAt }),
    put2("order_edits", editToken, edit),
    put2("order_access", accessKey, access),
    put2("stripe_checkout_sessions", snapshot.checkoutId, {
      ...snapshot,
      sessionId: session.id,
      fulfilled: true,
      paidAt: nowISO,
      inventoryStatus,
      orderId: order.id,
      stockDebits: recordedDebits,
      stockDebitsByImage: recordedVariantDebits
    }, { updateTime: snapshotVersion })
  ];
  if (!shortages) for (const u of updates) {
    const changes = { stock: u.stock, totalStock: u.totalStock, updatedAt: nowISO };
    if (u.imageStocks !== null) changes.imageStocks = u.imageStocks;
    writes.push({
      update: { name: u.path, fields: fields2(changes) },
      updateMask: { fieldPaths: Object.keys(changes) },
      currentDocument: { updateTime: u.updateTime }
    });
  }
  return {
    replay: false,
    writes,
    order,
    inventoryStatus,
    stockDebits: recordedDebits,
    stockDebitsByImage: recordedVariantDebits
  };
}
__name(preparePaidFulfillment, "preparePaidFulfillment");

// service.mjs
var check3 = /* @__PURE__ */ __name((ok, code) => {
  if (!ok) throw new Fault(code, 409);
}, "check");
var publicOrder = /* @__PURE__ */ __name((o) => ({ id: o.id, payment: o.payment, refundStatus: o.refundStatus || "none", refundedAmount: o.refundedAmount || 0, paymentStatus: o.paymentStatus, status: o.status, inventoryStatus: o.inventoryStatus, total: o.total, deliveryFee: o.deliveryFee, items: o.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })) }), "publicOrder");
function bound(cfg, s, p) {
  check3(p && p.livemode === cfg.live && p.mode === "payment" && (cfg.live ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/).test(p.id || ""), "session_mode_mismatch");
  check3(p.client_reference_id === s.orderId && p.metadata?.checkout_id === s.checkoutId && p.metadata?.order_id === s.orderId && p.metadata?.integration === "kandorty-stripe-v1", "session_binding_mismatch");
  check3(p.currency === "aed" && p.amount_total === s.totalFils && (!s.sessionId || p.id === s.sessionId), "session_amount_mismatch");
}
__name(bound, "bound");
function createService(cfg, store, stripe, onNewOrder) {
  check3(store.root === `projects/${cfg.projectId}/databases/(default)/documents`, "store_project_mismatch");
  async function bind(checkoutId, p) {
    for (let i = 0; i < 5; i++) {
      const row = await store.get("stripe_checkout_sessions/" + checkoutId), s = row?.data;
      check3(s, "unknown_checkout");
      bound(cfg, s, p);
      if (s.sessionId) {
        check3(s.sessionId === p.id, "session_binding_mismatch");
        return s;
      }
      try {
        await store.commit([store.write("stripe_checkout_sessions/" + checkoutId, { ...s, sessionId: p.id }, { updateTime: row.version })]);
        return { ...s, sessionId: p.id };
      } catch (e) {
        if (e.message !== "write_conflict") throw e;
      }
    }
    throw new Fault("database_busy", 503);
  }
  __name(bind, "bind");
  return {
    async create({ expectedDeliveryFils, ...request }) {
      const normalized = normalizeCodRequest(request), checkoutId = await hash(request.checkoutToken), fingerprint = await hash(JSON.stringify(normalized));
      let row = await store.get("stripe_checkout_sessions/" + checkoutId), s = row?.data;
      if (!s) {
        const products = {};
        for (const id of new Set(normalized.items.map((i) => i.id))) {
          const p2 = await store.get("products/" + id);
          if (p2) products[id] = { data: p2.data, updateTime: p2.version };
        }
        const orderId = "KD-" + String(1e7 + crypto.getRandomValues(new Uint32Array(1))[0] % 9e7), accessKey = await hash(orderId + "|" + normalized.customer.phone.replace(/\D/g, ""));
        const deliveryFils = cartDeliveryFils((await store.get("settings/store"))?.data);
        check3((expectedDeliveryFils ?? 2500) === deliveryFils, "delivery_fee_changed");
        const plan = await prepareCodOrder({ deliveryFils, request, projectId: cfg.projectId, testOnly: !cfg.live, orderId, editToken: random(24), accessKey, products, nowISO: (/* @__PURE__ */ new Date()).toISOString() });
        s = { checkoutId, fingerprint, orderId, createdAt: plan.order.createdAt, customer: normalized.customer, note: normalized.note, deliveryFils, totalFils: Math.round(plan.order.total * 100), items: plan.order.items.map((i) => ({ ...i, unitAmount: Math.round(i.price * 100) })), mode: cfg.mode, fulfilled: false, reconcilePending: true, editToken: plan.order.editToken, accessKey };
        try {
          await store.commit([store.write("stripe_checkout_sessions/" + checkoutId, s, { exists: false })]);
        } catch (e) {
          if (e.message !== "write_conflict") throw e;
          s = (await store.get("stripe_checkout_sessions/" + checkoutId))?.data;
        }
      }
      check3(s && s.fingerprint === fingerprint && s.mode === cfg.mode, "checkout_conflict");
      if (!s.fulfilled) check3((expectedDeliveryFils ?? 2500) === (s.deliveryFils ?? 2500), "delivery_fee_changed");
      if (s.fulfilled) return { snapshot: s, complete: true };
      check3(Date.now() - Date.parse(s.createdAt) < 18e5, "checkout_expired");
      const p = s.sessionId ? await stripe.retrieve(s.sessionId) : await stripe.create(s);
      bound(cfg, s, p);
      check3(p.status !== "expired", "checkout_expired");
      s = await bind(checkoutId, p);
      if (p.status === "complete") return { snapshot: s, complete: true };
      let url;
      try {
        url = new URL(p.url);
      } catch {
        throw new Fault("invalid_checkout_url", 503);
      }
      check3(url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password, "invalid_checkout_url");
      return { snapshot: s, url: url.href, complete: false };
    },
    async fulfill(checkoutId, sessionId) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await store.get("stripe_checkout_sessions/" + checkoutId), s = row?.data;
        check3(s && s.mode === cfg.mode, "unknown_checkout");
        const p = await stripe.retrieve(sessionId);
        bound(cfg, s, p);
        if (p.payment_status !== "paid" || p.status !== "complete") return { paid: false, snapshot: s, expired: p.status === "expired" };
        validatePaidSession(p, s, { mode: cfg.mode });
        const existing = (await store.get("orders/" + s.orderId))?.data;
        const claimId = await hash(p.id), claim = (await store.get("stripe_payment_claims/" + claimId))?.data;
        if (claim) check3(claim.checkoutId === checkoutId && claim.orderId === s.orderId, "session_already_claimed");
        if (existing && !s.fulfilled) {
          check3(existing.stripeSessionId === p.id, "existing_order_conflict");
          continue;
        }
        if (s.fulfilled) check3(existing && claim, "partial_fulfillment");
        const products = {};
        for (const id of new Set(s.items.map((i) => i.id))) {
          const r = await store.get("products/" + id);
          if (r) products[id] = { data: r.data, updateTime: r.version };
        }
        const plan = preparePaidFulfillment({ session: p, snapshot: s, snapshotVersion: row.version, existingOrder: existing || null, products, editToken: s.editToken, accessKey: s.accessKey, nowISO: (/* @__PURE__ */ new Date()).toISOString(), projectId: cfg.projectId, mode: cfg.mode });
        if (!plan.replay) {
          if (typeof p.payment_intent === "string" && /^pi_[A-Za-z0-9]+$/.test(p.payment_intent)) plan.writes.push(store.write("stripe_payment_intents/" + await hash(p.payment_intent), { checkoutId, orderId: s.orderId, sessionId: p.id }, { exists: false }));
          plan.writes.push(store.write("order_lifecycle/" + s.orderId, { orderId: s.orderId, checkoutId, payment: "card", stockDebits: plan.stockDebits, stockDebitsByImage: plan.stockDebitsByImage || {}, manageTokenHash: await hash(s.editToken) }, { exists: false }));
          plan.writes.push(store.write("stripe_payment_claims/" + claimId, { checkoutId, orderId: s.orderId, sessionId: p.id }, { exists: false }));
          const marker = plan.writes.find((w) => w.update.name === store.root + "/stripe_checkout_sessions/" + checkoutId);
          marker.update.fields.reconcilePending = { booleanValue: false };
          if (plan.order.inventoryStatus === "needs_review") plan.writes.push(store.write("stripe_review_queue/" + s.orderId, { orderId: s.orderId, sessionId: p.id, reason: "paid_inventory_shortage", resolved: false, createdAt: (/* @__PURE__ */ new Date()).toISOString() }, { exists: false }));
          try {
            await store.commit(plan.writes);
          } catch (e) {
            if (e.message === "write_conflict") continue;
            throw e;
          }
          onNewOrder?.();
        }
        const settledOrder = stripe.refundState ? await syncRefunds(store, stripe, { ...s, sessionId: p.id }) : plan.order;
        return { paid: true, replay: plan.replay, order: publicOrder(settledOrder), snapshot: s };
      }
      throw new Fault("database_busy", 503);
    },
    async status(claims) {
      const s = (await store.get("stripe_checkout_sessions/" + claims.checkoutId))?.data;
      if (!s || s.orderId !== claims.orderId || s.mode !== cfg.mode) throw new Fault("invalid_receipt", 401);
      if (!s.sessionId) return { paid: false };
      const r = await this.fulfill(s.checkoutId, s.sessionId);
      return r.paid ? { paid: true, order: r.order } : { paid: false };
    },
    async closePending(checkoutId, uncertain = false) {
      const row = await store.get("stripe_checkout_sessions/" + checkoutId), s = row?.data;
      if (!s || s.fulfilled || !s.reconcilePending) return;
      const writes = [store.write("stripe_checkout_sessions/" + checkoutId, { ...s, reconcilePending: false, reconcileState: uncertain ? "manual_review" : "expired" }, { updateTime: row.version })];
      if (uncertain) writes.push(store.write("stripe_review_queue/pending_" + checkoutId, { checkoutId, orderId: s.orderId, reason: "checkout_creation_uncertain", resolved: false }, { exists: false }));
      try {
        await store.commit(writes);
      } catch (e) {
        if (e.message !== "write_conflict") throw e;
      }
    },
    async reconcile() {
      let paid = 0, pending = 0, failed = 0;
      for (const s of await store.pending()) {
        if (s.mode !== cfg.mode) continue;
        try {
          if (!s.sessionId) {
            if (Date.now() - Date.parse(s.createdAt) >= 18e5) await this.closePending(s.checkoutId, true);
            pending++;
            continue;
          }
          const r = await this.fulfill(s.checkoutId, s.sessionId);
          if (r.paid) paid++;
          else {
            if (r.expired) await this.closePending(s.checkoutId);
            pending++;
          }
        } catch {
          failed++;
        }
      }
      if (store.refundPending && stripe.refundState) for (const record of await store.refundPending()) {
        try {
          const s = (await store.get("stripe_checkout_sessions/" + record.checkoutId))?.data;
          if (!s || s.orderId !== record.orderId || s.mode !== cfg.mode) throw new Fault("refund_binding_mismatch", 409);
          await syncRefunds(store, stripe, s);
        } catch {
          failed++;
        }
      }
      return { paid, pending, failed };
    }
  };
}
__name(createService, "createService");

// lifecycle.mjs
var check4 = /* @__PURE__ */ __name((p, c) => {
  if (!p) throw new Fault(c, 409);
}, "check");
function lifecycle(cfg, store) {
  check4(store.root === `projects/${cfg.projectId}/databases/(default)/documents`, "store_project_mismatch");
  return {
    async change(orderId, target, actor) {
      check4(/^KD-\d{8}$/.test(orderId || ""), "invalid_order");
      check4(["preparing", "shipping", "delivered", "cancelled"].includes(target), "invalid_transition");
      for (let n = 0; n < 5; n++) {
        const row = await store.get("orders/" + orderId), ledger = await store.get("order_lifecycle/" + orderId);
        check4(row && ledger, "managed_order_required");
        const o = row.data, l = ledger.data;
        check4(l.orderId === orderId && l.payment === o.payment, "order_binding_mismatch");
        if (actor.kind === "guest") check4(target === "cancelled" && actor.checkoutId === l.checkoutId && await hash(actor.manageToken || "") === l.manageTokenHash, "invalid_manage_token");
        else check4(actor.kind === "admin" && typeof actor.uid === "string" && actor.uid.length > 0, "admin_required");
        if (o.status === target) return publicOrder(o);
        const allowed = { new: ["preparing", "cancelled"], preparing: ["shipping"], shipping: ["delivered"] };
        check4(allowed[o.status]?.includes(target), "order_state_locked");
        if (target !== "cancelled") check4(o.inventoryStatus === "debited" && (!o.refundStatus || o.refundStatus === "none"), "order_requires_review");
        const at = (/* @__PURE__ */ new Date()).toISOString(), next = { ...o, status: target, updatedAt: at }, writes = [];
        if (target === "cancelled") {
          if (l.restockedAt) {
            const fresh = await store.get("orders/" + orderId);
            if (fresh?.data?.status === "cancelled") return publicOrder(fresh.data);
            if (fresh?.data?.status !== "new") throw new Fault("restock_state_conflict", 409);
            await new Promise((resolve) => setTimeout(resolve, 40 * (n + 1)));
            continue;
          }
          for (const [id, qty] of Object.entries(l.stockDebits || {})) {
            check4(/^[A-Za-z0-9_-]{1,150}$/.test(id) && Number.isSafeInteger(qty) && qty > 0 && qty <= 99, "invalid_recorded_debit");
            const p = await store.get("products/" + id), stock = Number(p?.data.stock);
            check4(p && p.data.stock !== null && p.data.stock !== "" && Number.isSafeInteger(stock) && stock >= 0 && Number.isSafeInteger(stock + qty), "invalid_stock");
            const itemDebits = Object.entries(l.stockDebitsByImage || {}).filter(([key2]) => key2.startsWith(id + "__img"));
            let imageStocks = null;
            if (itemDebits.length) {
              const images = Array.isArray(p.data.images) ? p.data.images : [];
              check4(
                Array.isArray(p.data.imageStocks) && p.data.imageStocks.length === images.length && p.data.imageStocks.every((v) => Number.isSafeInteger(v) && v >= 0) && p.data.imageStocks.reduce((sum, v) => sum + v, 0) === stock,
                "variant_restock_requires_review"
              );
              imageStocks = p.data.imageStocks.slice();
              let restored = 0;
              for (const [key2, count2] of itemDebits) {
                const indexString = key2.slice((id + "__img").length);
                const index = Number(indexString);
                check4(
                  /^(0|[1-7])$/.test(indexString) && index < imageStocks.length && Number.isSafeInteger(count2) && count2 > 0 && count2 <= 99 && Number.isSafeInteger(imageStocks[index] + count2),
                  "invalid_recorded_variant_debit"
                );
                imageStocks[index] += count2;
                restored += count2;
              }
              check4(restored === qty, "invalid_recorded_variant_debit");
            } else if (p.data.imageStocks !== void 0 && p.data.imageStocks !== null && !(Array.isArray(p.data.imageStocks) && p.data.imageStocks.length === 0 && (!Array.isArray(p.data.images) || p.data.images.length === 0))) {
              throw new Fault("variant_restock_requires_review", 409);
            }
            const restoredData = {
              ...p.data,
              stock: stock + qty,
              totalStock: Math.max(Number(p.data.totalStock) || 0, stock + qty),
              updatedAt: at
            };
            if (imageStocks !== null) restoredData.imageStocks = imageStocks;
            writes.push(store.write("products/" + id, restoredData, { updateTime: p.version }));
          }
          next.cancelledBy = actor.kind;
          next.cancelStockRestoredAt = at;
          next.inventoryStatus = "restored";
          if (o.payment === "card") {
            next.refundStatus = !o.refundStatus || o.refundStatus === "none" ? "required" : o.refundStatus;
            writes.push(store.write("stripe_refund_queue/" + orderId, { orderId, checkoutId: l.checkoutId, resolved: false, reason: "cancelled_paid_order", createdAt: at }));
          }
          writes.push(store.write("order_lifecycle/" + orderId, { ...l, restockedAt: at }, { updateTime: ledger.version }));
        }
        writes.push(store.write("orders/" + orderId, next, { updateTime: row.version }));
        const tracking = await store.get("tracking/" + orderId);
        check4(tracking, "missing_tracking");
        writes.push(store.write("tracking/" + orderId, { ...tracking.data, status: target, updatedAt: at }, { updateTime: tracking.version }));
        const edit = await store.get("order_edits/" + o.editToken);
        if (edit) writes.push(store.write("order_edits/" + o.editToken, { ...edit.data, status: target, updatedAt: at }, { updateTime: edit.version }));
        writes.push(store.write("order_audit/" + orderId + "_" + target, { orderId, status: target, actor: actor.kind, actorUid: actor.uid || null, at }, { exists: false }));
        try {
          await store.commit(writes);
          return publicOrder(next);
        } catch (e) {
          if (e.message !== "write_conflict") throw e;
        }
      }
      throw new Fault("database_busy", 503);
    }
  };
}
__name(lifecycle, "lifecycle");

// legacy-status-policy.mjs
var LegacyPolicyError = class extends Error {
  static {
    __name(this, "LegacyPolicyError");
  }
  constructor(code) {
    super(code);
    this.name = "LegacyPolicyError";
    this.code = code;
  }
};
var fail = /* @__PURE__ */ __name((condition, code) => {
  if (!condition) throw new LegacyPolicyError(code);
}, "fail");
var transitions = Object.freeze({
  new: ["preparing", "cancelled"],
  preparing: ["shipping"],
  shipping: ["delivered"],
  delivered: [],
  cancelled: []
});
var allowedPatchFields = ["status", "cancellationLockedAt", "cancelledBy"];
function planLegacyAdminTransition({
  orderId,
  order,
  tracking,
  ledger,
  target,
  at,
  policyApproved = false
} = {}) {
  fail(policyApproved === true, "legacy_policy_not_approved");
  fail(typeof orderId === "string" && /^KD-?[A-Za-z0-9_-]{4,40}$/.test(orderId), "invalid_order_id");
  fail(ledger === null, "trusted_ledger_presence_not_verified_or_new_order");
  fail(order && typeof order === "object" && tracking && typeof tracking === "object", "missing_legacy_order_or_tracking");
  fail(!order.id || order.id === orderId, "order_id_mismatch");
  fail(!tracking.id || tracking.id === orderId, "tracking_id_mismatch");
  fail(typeof at === "string" && Number.isFinite(Date.parse(at)) && new Date(at).toISOString() === at, "invalid_audit_time");
  const current = order.status;
  fail(Object.hasOwn(transitions, current), "unknown_legacy_status");
  fail(current === tracking.status, "order_tracking_disagree");
  fail(order.payment === "cod" || order.payment === "card", "unknown_legacy_payment");
  fail(Object.hasOwn(transitions, target), "invalid_target");
  if (current === target) return Object.freeze({ noop: true, orderPatch: null, trackingPatch: null, auditPlan: null, needsPaymentReview: false });
  fail(transitions[current].includes(target), "legacy_transition_locked");
  if (current === "preparing" || current === "shipping") {
    const orderLock = order.cancellationLockedAt;
    const trackingLock = tracking.cancellationLockedAt;
    fail(typeof orderLock === "string" && orderLock.length > 0 && trackingLock === orderLock, "legacy_processing_lock_missing_or_mismatched");
  }
  const pendingCancellation = Boolean(order.customerEdit?.cancelRequestedAt || tracking.customerEdit?.cancelRequestedAt || order.cancelRequestedAt || tracking.cancelRequestedAt);
  fail(!pendingCancellation, "legacy_pending_cancel_requires_manual_review");
  fail(
    !order.cancelStockRestoredAt && !tracking.cancelStockRestoredAt && !order.cancelledBy && !tracking.cancelledBy,
    "legacy_prior_cancellation_or_restock_requires_manual_review"
  );
  if (current === "new") fail(!order.cancellationLockedAt && !tracking.cancellationLockedAt, "legacy_lock_conflict");
  const lock = target === "preparing" ? order.cancellationLockedAt || at : null;
  const orderPatch = { status: target };
  const trackingPatch = { status: target };
  if (lock) {
    orderPatch.cancellationLockedAt = lock;
    trackingPatch.cancellationLockedAt = lock;
  }
  if (target === "cancelled") orderPatch.cancelledBy = "admin";
  fail(Object.keys(orderPatch).every((x) => allowedPatchFields.includes(x)), "unexpected_order_patch");
  fail(Object.keys(trackingPatch).every((x) => x === "status" || x === "cancellationLockedAt"), "unexpected_tracking_patch");
  const auditPlan = { orderId, from: current, to: target, at, kind: "legacy_admin_status_only" };
  return Object.freeze({
    noop: false,
    orderPatch: Object.freeze(orderPatch),
    trackingPatch: Object.freeze(trackingPatch),
    auditPlan: Object.freeze(auditPlan),
    needsPaymentReview: target === "cancelled" && order.payment === "card"
  });
}
__name(planLegacyAdminTransition, "planLegacyAdminTransition");

// legacy-status-service.mjs
var TEST_PROJECT2 = "kandorty-stripe-test-5f8af";
var ORDER = /^KD-?[A-Za-z0-9_-]{4,40}$/;
var ADMIN = /^[A-Za-z0-9_-]{1,128}$/;
var TEST_GATE = "KANDORTY_LEGACY_TEST_ONLY_APPROVED";
var validStore = /* @__PURE__ */ __name((store) => store && typeof store.beginTransaction === "function" && typeof store.getInTransaction === "function" && typeof store.commitTransaction === "function" && typeof store.rollbackTransaction === "function" && typeof store.write === "function" && typeof store.writePatch === "function", "validStore");
function legacyStatusTestService(cfg, store, env) {
  if (cfg?.mode !== "test" || cfg.projectId !== TEST_PROJECT2 || store?.root !== `projects/${TEST_PROJECT2}/databases/(default)/documents`)
    throw new Fault("legacy_production_disabled", 503);
  if (env?.LEGACY_STATUS_TEST_ENABLED !== "true" || env.LEGACY_STATUS_TEST_APPROVAL !== TEST_GATE)
    throw new Fault("legacy_test_only_disabled", 503);
  if (!validStore(store)) throw new Fault("legacy_atomic_store_required", 503);
  return {
    async change(orderId, target, actor) {
      if (!ORDER.test(orderId || "") || !["preparing", "shipping", "delivered", "cancelled"].includes(target))
        throw new Fault("legacy_invalid_transition", 409);
      if (actor?.kind !== "admin" || !ADMIN.test(actor.uid || ""))
        throw new Fault("admin_authorization_required", 403);
      for (let attempt = 0; attempt < 4; attempt++) {
        const transaction = await store.beginTransaction();
        let committed = false;
        try {
          const row = await store.getInTransaction("orders/" + orderId, transaction);
          const tracking = await store.getInTransaction("tracking/" + orderId, transaction);
          const ledger = await store.getInTransaction("order_lifecycle/" + orderId, transaction);
          if (!row || !tracking || !row.version || !tracking.version)
            throw new Fault("legacy_missing_order_or_tracking", 409);
          const at = (/* @__PURE__ */ new Date()).toISOString();
          const planned = planLegacyAdminTransition({
            orderId,
            order: row.data,
            tracking: tracking.data,
            ledger: ledger?.data ?? null,
            target,
            at,
            policyApproved: true
          });
          if (planned.noop) {
            await store.rollbackTransaction(transaction);
            return Object.freeze({ id: orderId, status: target, unchanged: true });
          }
          const orderPatch = { ...planned.orderPatch, updatedAt: at };
          const trackingPatch = { ...planned.trackingPatch, updatedAt: at };
          const auditPath = "legacy_admin_status_audit/" + orderId + "_" + target;
          const writes = [
            store.writePatch("orders/" + orderId, orderPatch, { updateTime: row.version }),
            store.writePatch("tracking/" + orderId, trackingPatch, { updateTime: tracking.version }),
            store.write(auditPath, {
              orderId,
              from: planned.auditPlan.from,
              to: target,
              at,
              actorUid: actor.uid,
              kind: "legacy_admin_status_only",
              needsPaymentReview: planned.needsPaymentReview,
              // Not evidence of refund/payment; record only a manual review flag.
              moneyOrStockChanged: false
            }, { exists: false })
          ];
          await store.commitTransaction(transaction, writes);
          committed = true;
          return Object.freeze({
            id: orderId,
            status: target,
            unchanged: false,
            needsPaymentReview: planned.needsPaymentReview
          });
        } catch (e) {
          if (!committed) await store.rollbackTransaction(transaction).catch(() => {
          });
          if (e?.message === "write_conflict") {
            continue;
          }
          if (e instanceof LegacyPolicyError)
            throw new Fault(e.code, 409);
          throw e;
        }
      }
      throw new Fault("legacy_transaction_busy", 503);
    }
  };
}
__name(legacyStatusTestService, "legacyStatusTestService");

// cod-service.mjs
function codService(cfg, store, onNewOrder) {
  if (store.root !== `projects/${cfg.projectId}/databases/(default)/documents`) throw new Fault("store_project_mismatch", 503);
  return { async create({ expectedDeliveryFils, ...input }) {
    const normalized = normalizeCodRequest(input), checkoutId = await hash(input.checkoutToken);
    for (let n = 0; n < 5; n++) {
      const intent = (await store.get("cod_checkout_intents/" + checkoutId))?.data || null, orderId = intent?.orderId || "KD-" + String(1e7 + crypto.getRandomValues(new Uint32Array(1))[0] % 9e7);
      const existing = intent ? (await store.get("orders/" + orderId))?.data : null, products = {};
      if (!intent) for (const id of new Set(normalized.items.map((i) => i.id))) {
        const p = await store.get("products/" + id);
        if (p) products[id] = { data: p.data, updateTime: p.version };
      }
      const accessKey = await hash(orderId + "|" + normalized.customer.phone.replace(/\D/g, ""));
      let plan;
      const deliveryFils = intent ? void 0 : cartDeliveryFils((await store.get("settings/store"))?.data);
      if (!intent && (expectedDeliveryFils ?? 2500) !== deliveryFils) throw new Fault("delivery_fee_changed", 409);
      try {
        plan = await prepareCodOrder({ deliveryFils, request: input, projectId: cfg.projectId, testOnly: !cfg.live, orderId, editToken: random(24), accessKey, products, nowISO: (/* @__PURE__ */ new Date()).toISOString(), existingIntent: intent, existingOrder: existing });
      } catch (e) {
        if (!intent && e instanceof CodFault && ["insufficient_stock", "unavailable_product"].includes(e.code) && await store.get("cod_checkout_intents/" + checkoutId)) continue;
        throw e;
      }
      if (!plan.replay) plan.writes.push(store.write("order_lifecycle/" + orderId, { orderId, checkoutId, payment: "cod", stockDebits: plan.stockDebits, stockDebitsByImage: plan.stockDebitsByImage || {}, manageTokenHash: await hash(plan.order.editToken) }, { exists: false }));
      try {
        if (plan.writes.length) await store.commit(plan.writes);
      } catch (e) {
        if (e.message === "write_conflict") continue;
        throw e;
      }
      if (!plan.replay) onNewOrder?.();
      return { order: publicOrder(plan.order), snapshot: { orderId, checkoutId }, manageToken: plan.order.editToken, replay: plan.replay };
    }
    throw new Fault("database_busy", 503);
  }, async status(claims) {
    const i = (await store.get("cod_checkout_intents/" + claims.checkoutId))?.data, o = (await store.get("orders/" + claims.orderId))?.data;
    if (!i || i.orderId !== claims.orderId || !o || o.payment !== "cod") throw new Fault("invalid_receipt", 401);
    return { paid: false, registered: true, order: publicOrder(o) };
  } };
}
__name(codService, "codService");

// webhook-contract.mjs
var STRIPE_REST_API_VERSION = "2024-06-20";
var STRIPE_CHECKOUT_EVENTS = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded"
]);
var STRIPE_REFUND_EVENTS = Object.freeze([
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refunded"
]);
var STRIPE_WEBHOOK_EVENTS = Object.freeze([...STRIPE_CHECKOUT_EVENTS, ...STRIPE_REFUND_EVENTS]);

// stripe.mjs
function stripeClient(cfg, net = fetch) {
  async function api(path2, body, idempotency, root = "/checkout/sessions") {
    const r = await net("https://api.stripe.com/v1" + root + path2, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + cfg.key, "Stripe-Version": STRIPE_REST_API_VERSION, ...body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotency } : {} }, ...body ? { body } : {}, redirect: "manual", signal: AbortSignal.timeout(15e3) });
    if (!r.ok) throw new Fault("stripe_unavailable", 503);
    return r.json();
  }
  __name(api, "api");
  return {
    async refundState(sessionId, snapshot) {
      if (!(cfg.live ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/).test(sessionId)) throw new Fault("session_mode_mismatch", 409);
      const s = await api("/" + sessionId + "?expand[]=payment_intent");
      if (s.id !== snapshot.sessionId || s.livemode !== cfg.live || s.metadata?.checkout_id !== snapshot.checkoutId || s.metadata?.order_id !== snapshot.orderId || s.metadata?.integration !== "kandorty-stripe-v1" || s.client_reference_id !== snapshot.orderId || s.amount_total !== snapshot.totalFils || s.currency !== "aed" || s.payment_status !== "paid") throw new Fault("refund_binding_mismatch", 409);
      const pi = s.payment_intent;
      if (!pi || typeof pi !== "object" || !/^pi_[A-Za-z0-9]+$/.test(pi.id) || pi.livemode !== cfg.live || pi.currency !== "aed" || pi.amount_received !== snapshot.totalFils) throw new Fault("refund_payment_mismatch", 409);
      let cursor = "", amount = 0, pending = false, failed = false;
      for (let page = 0; page < 10; page++) {
        const list = await api("?payment_intent=" + pi.id + "&limit=100" + (cursor ? "&starting_after=" + cursor : ""), null, null, "/refunds");
        if (!Array.isArray(list.data)) throw new Fault("refund_response_invalid", 503);
        for (const r of list.data) {
          if (r.payment_intent !== pi.id || r.currency !== "aed" || !Number.isSafeInteger(r.amount) || r.amount <= 0) throw new Fault("refund_binding_mismatch", 409);
          if (r.status === "succeeded") amount += r.amount;
          else if (["pending", "requires_action"].includes(r.status)) pending = true;
          else if (["failed", "canceled"].includes(r.status)) failed = true;
          else throw new Fault("refund_response_invalid", 503);
        }
        if (!list.has_more) {
          if (amount > snapshot.totalFils) throw new Fault("refund_amount_mismatch", 409);
          return { amount, status: amount === snapshot.totalFils ? "full" : pending ? "pending" : amount > 0 ? "partial" : failed ? "failed" : "none" };
        }
        cursor = list.data.at(-1)?.id;
        if (!/^re_[A-Za-z0-9]+$/.test(cursor || "")) throw new Fault("refund_response_invalid", 503);
      }
      throw new Fault("refund_pagination_limit", 503);
    },
    retrieve(id) {
      if (!(cfg.live ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/).test(id)) throw new Fault("session_mode_mismatch", 409);
      return api("/" + id);
    },
    create(s) {
      const body = new URLSearchParams({ mode: "payment", client_reference_id: s.orderId, "metadata[checkout_id]": s.checkoutId, "metadata[order_id]": s.orderId, "metadata[integration]": "kandorty-stripe-v1", success_url: cfg.base + "/?stripe=success", cancel_url: cfg.base + "/?stripe=cancel", "payment_method_types[0]": "card", expires_at: String(Math.floor(Date.parse(s.createdAt) / 1e3) + 1800) });
      const lines = [...s.items.map((i) => ({ name: i.name, amount: i.unitAmount, qty: i.qty })), { name: "\u0631\u0633\u0648\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644", amount: s.deliveryFils ?? 2500, qty: 1 }];
      lines.forEach((i, n) => {
        body.set(`line_items[${n}][price_data][currency]`, "aed");
        body.set(`line_items[${n}][price_data][unit_amount]`, String(i.amount));
        body.set(`line_items[${n}][price_data][product_data][name]`, i.name);
        body.set(`line_items[${n}][quantity]`, String(i.qty));
      });
      return api("", body, "kandorty-" + cfg.mode + "-" + s.checkoutId);
    }
  };
}
__name(stripeClient, "stripeClient");

// signatures.mjs
var enc4 = new TextEncoder();
async function verify(secret, text, sig) {
  if (!/^[a-f0-9]{64}$/.test(sig || "")) return false;
  const key2 = await crypto.subtle.importKey("raw", enc4.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key2, Uint8Array.from(sig.match(/../g), (s) => parseInt(s, 16)), enc4.encode(text));
}
__name(verify, "verify");
async function verifyWebhook(raw, header, secret, now = Date.now()) {
  if (typeof header !== "string" || header.length > 2048) throw new Fault("invalid_signature", 400);
  const parts = header.split(",").map((p) => p.trim().split("="));
  const times = parts.filter((p) => p[0] === "t");
  if (times.length !== 1 || !/^\d{10}$/.test(times[0][1]) || Math.abs(Math.floor(now / 1e3) - Number(times[0][1])) > 300) throw new Fault("invalid_signature", 400);
  const payload = times[0][1] + "." + raw;
  for (const p of parts.filter((p2) => p2[0] === "v1")) if (await verify(secret.trim(), payload, p[1])) return true;
  throw new Fault("invalid_signature", 400);
}
__name(verifyWebhook, "verifyWebhook");
async function issueReceipt(secret, cfg, s, now = Date.now()) {
  const body = `stripe-v1.${cfg.mode}.${s.checkoutId}.${s.orderId}.${Math.floor(now / 1e3) + 604800}`;
  return body + "." + await sign(secret, body);
}
__name(issueReceipt, "issueReceipt");
async function readReceipt(secret, cfg, token, now = Date.now()) {
  if (typeof token !== "string" || !/^stripe-v1\.(test|live)\.[a-f0-9]{64}\.KD-\d{8}\.\d{10}\.[a-f0-9]{64}$/.test(token)) throw new Fault("invalid_receipt", 401);
  const p = token.split("."), sig = p.pop(), body = p.join(".");
  if (p[1] !== cfg.mode || Number(p[4]) <= Math.floor(now / 1e3) || Number(p[4]) > Math.floor(now / 1e3) + 604800 || !await verify(secret, body, sig)) throw new Fault("invalid_receipt", 401);
  return { checkoutId: p[2], orderId: p[3] };
}
__name(readReceipt, "readReceipt");
async function rawBody(request, max = 65536) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks = [];
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Fault("body_too_large", 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    throw new Fault("invalid_utf8", 400);
  }
}
__name(rawBody, "rawBody");

// worker.mjs
function handler(factories = {}) {
  return async (request, env, ctx) => {
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
    const reply = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), { status, headers }), "reply");
    try {
      const cfg = releaseConfig(env), url = new URL(request.url), origin = request.headers.get("Origin");
      if (url.protocol !== "https:" || url.hostname !== cfg.host) throw new Fault("invalid_endpoint", 403);
      if (!cfg.live && request.method === "GET" && ["/", "/index.html", "/browser-client.mjs"].includes(url.pathname) && env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        const h = new Headers(response.headers);
        h.set("Cache-Control", "no-store");
        h.set("Referrer-Policy", "no-referrer");
        h.set("X-Content-Type-Options", "nosniff");
        return new Response(response.body, { status: response.status, headers: h });
      }
      if (url.search) throw new Fault("invalid_endpoint", 403);
      if (!cfg.live && url.pathname === "/health") {
        if (request.method === "HEAD") return new Response(null, { headers });
        if (request.method === "GET") return reply({ ok: true });
      }
      const isWebhook = url.pathname === "/webhook";
      if (!isWebhook) {
        if (!cfg.origins.includes(origin)) throw new Fault("origin_forbidden", 403);
        headers["Access-Control-Allow-Origin"] = origin;
        if (request.method === "OPTIONS") {
          headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
          headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Staging-Key";
          return new Response(null, { status: 204, headers });
        }
        if (!cfg.live && await hash(request.headers.get("X-Staging-Key") || "") !== await hash(env.STAGING_ACCESS_SECRET)) throw new Fault("staging_access_required", 401);
        if (!env.RATE_LIMITER || !(await env.RATE_LIMITER.limit({ key: await hash(request.headers.get("CF-Connecting-IP") || "unknown") })).success) throw new Fault("rate_limited", 429);
      }
      if (request.method !== "POST") throw new Fault("method_not_allowed", 405);
      const raw = await rawBody(request, isWebhook ? 65536 : 16384);
      if (isWebhook) await verifyWebhook(raw, request.headers.get("Stripe-Signature"), String(env.STRIPE_WEBHOOK_SECRET).trim());
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new Fault("invalid_json", 400);
      }
      const store = (factories.store || createStore)(env);
      if (isWebhook && !cfg.live && body?.type === "charge.dispute.created") {
        if (body.livemode !== false) throw new Fault("event_mode_mismatch", 400);
        if (typeof body.id !== "string" || !/^evt_[A-Za-z0-9]{1,100}$/.test(body.id)) throw new Fault("invalid_event", 400);
        const eventHash = await hash(body.id);
        const path2 = "stripe_operator_alerts/dispute-" + eventHash;
        if (await store.get(path2)) return reply({ received: true });
        const result = await sendOperatorEmail({
          subject: "[Kandorty TEST] Stripe dispute opened",
          text: "A dispute was opened in the Kandorty Stripe Sandbox. Review the Disputes page in the Sandbox dashboard."
        }, { ...env, ALERT_EVENT_KEY: "kandorty-test-dispute-" + eventHash }, factories.alertNet || fetch);
        if (result.status !== "accepted_by_provider_not_delivered") throw new Fault("alert_delivery_disabled", 503);
        try {
          await store.commit([store.write(path2, { status: "accepted" }, { exists: false })]);
        } catch (e) {
          if (e?.message !== "write_conflict" || !await store.get(path2)) throw e;
        }
        return reply({ received: true });
      }
      if (cfg.live && url.pathname === "/admin/order-push") {
        try {
          await requireOrderReader(request, cfg, factories.readerNet || fetch);
        } catch (error) {
          if (!["admin_authorization_required", "admin_reader_unavailable"].includes(error?.message))
            throw error;
          await verifyAdmin(request.headers.get("Authorization")?.replace(/^Bearer /, ""), cfg, store, factories.authNet || fetch);
        }
        if (body?.action === "key") return reply({ publicKey: (await pushKeys(store)).publicKey });
        if (body?.action !== "subscribe" || typeof body.endpoint !== "string") throw new Fault("invalid_request");
        await enroll(store, body.endpoint);
        return reply({ enabled: true });
      }
      if (cfg.live && url.pathname === "/admin/native-push") {
        await verifyNativePushAdmin(request.headers.get("Authorization")?.replace(/^Bearer /, ""), cfg, store, factories.authNet || fetch);
        const uid = nativePushUserId(request.headers.get("Authorization"), cfg);
        if (body?.action === "test" && typeof body?.token === "string")
          return reply(await sendNativeTestPush(store, env, uid, body.token, factories.nativePushNet || fetch));
        if (!["register", "remove"].includes(body?.action) || typeof body?.token !== "string")
          throw new Fault("invalid_native_push_action", 400);
        return reply(await nativePushDevice(store, uid, body.token, body.action));
      }
      if (cfg.live && url.pathname === "/orders/direct-push") {
        const claim = await claimDirectOrderNotification(store, body);
        const delivery = /* @__PURE__ */ __name(() => deliverClaimedOrderNotification(
          store,
          claim,
          () => sendOrderPush(store, factories.pushNet || fetch),
          () => sendNativeOrderPush(store, env, factories.nativePushNet || fetch)
        ), "delivery");
        if (claim.claimed && ctx?.waitUntil) {
          ctx.waitUntil(delivery().catch((e) => console.error("direct_order_push_failed", e?.message)));
          return reply({ queued: true }, 202);
        }
        if (claim.claimed) return reply(await delivery(), 202);
        return reply({ queued: false, duplicate: true }, 200);
      }
      const onNewOrder = cfg.live && ctx ? () => {
        ctx.waitUntil(sendOrderPush(store).catch(() => console.error("order_push_failed")));
        ctx.waitUntil(sendNativeOrderPush(store, env, factories.nativePushNet || fetch).catch(() => console.error("native_order_push_failed")));
      } : void 0;
      const stripe = (factories.stripe || stripeClient)(cfg), service = createService(cfg, store, stripe, onNewOrder);
      if (isWebhook) {
        if (STRIPE_REFUND_EVENTS.includes(body.type)) {
          if (body.livemode !== cfg.live) throw new Fault("event_mode_mismatch", 400);
          const pi = body.data?.object?.payment_intent;
          if (typeof pi !== "string" || !/^pi_[A-Za-z0-9]+$/.test(pi)) throw new Fault("invalid_payment_intent");
          const link = (await store.get("stripe_payment_intents/" + await hash(pi)))?.data;
          if (!link) return reply({ received: true, ignored: true });
          const snapshot = (await store.get("stripe_checkout_sessions/" + link.checkoutId))?.data;
          if (!snapshot || snapshot.orderId !== link.orderId || snapshot.sessionId !== link.sessionId) throw new Fault("refund_binding_mismatch", 409);
          await syncRefunds(store, stripe, snapshot);
          return reply({ received: true });
        }
        if (!STRIPE_CHECKOUT_EVENTS.includes(body.type)) return reply({ received: true, ignored: true });
        if (body.livemode !== cfg.live) throw new Fault("event_mode_mismatch", 400);
        const session = body.data?.object;
        if (session?.metadata?.integration !== "kandorty-stripe-v1") return reply({ received: true, ignored: true });
        if (!/^[a-f0-9]{64}$/.test(session.metadata?.checkout_id || "")) throw new Fault("invalid_checkout", 400);
        const settled = await service.fulfill(session.metadata.checkout_id, session.id);
        await store.commit([store.write("stripe_webhook_receipts/" + session.metadata.checkout_id, { sessionId: session.id, paid: settled.paid, verifiedAt: (/* @__PURE__ */ new Date()).toISOString() })]);
        return reply({ received: true });
      }
      if (["/create-checkout-session", "/cod/orders"].includes(url.pathname)) {
        if (env.CHECKOUT_DISABLED === "true") throw new Fault("checkout_temporarily_disabled", 503);
        if (!body || Array.isArray(body)) throw new Fault("invalid_request");
        const { turnstileToken, ...input } = body;
        if (cfg.live) {
          if (typeof turnstileToken !== "string" || turnstileToken.length > 2048) throw new Fault("anti_bot_required", 403);
          const r2 = await (factories.net || fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", redirect: "manual", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }), signal: AbortSignal.timeout(15e3) });
          const proof = await r2.json();
          if (!r2.ok || proof.success !== true || !["kandorty.online", "www.kandorty.online"].includes(proof.hostname) || proof.action !== "checkout") throw new Fault("anti_bot_failed", 403);
        }
        if (url.pathname === "/cod/orders") {
          const r2 = await codService(cfg, store, onNewOrder).create(input);
          return reply({ ...r2, snapshot: void 0, receipt: await issueReceipt(env.STRIPE_RECEIPT_SECRET, cfg, r2.snapshot) }, r2.replay ? 200 : 201);
        }
        const r = await service.create(input);
        return reply({ orderId: r.snapshot.orderId, manageToken: r.snapshot.editToken, url: r.url || null, complete: r.complete, receipt: await issueReceipt(env.STRIPE_RECEIPT_SECRET, cfg, r.snapshot) });
      }
      if (url.pathname === "/checkout/status") {
        if (!body || Object.keys(body).length !== 0) throw new Fault("invalid_request");
        const claims = await readReceipt(env.STRIPE_RECEIPT_SECRET, cfg, request.headers.get("Authorization")?.replace(/^Bearer /, ""));
        const cod = (await store.get("cod_checkout_intents/" + claims.checkoutId))?.data;
        return reply(cod?.orderId === claims.orderId ? await codService(cfg, store).status(claims) : await service.status(claims));
      }
      if (url.pathname === "/orders/cancel") {
        if (!body || Object.keys(body).some((k) => !["orderId", "manageToken"].includes(k)) || !/^KD-\d{8}$/.test(body.orderId || "") || !/^[a-f0-9]{48}$/.test(body.manageToken || "")) throw new Fault("invalid_request");
        const claims = await readReceipt(env.STRIPE_RECEIPT_SECRET, cfg, request.headers.get("Authorization")?.replace(/^Bearer /, ""));
        if (claims.orderId !== body.orderId) throw new Fault("invalid_receipt", 401);
        return reply({ order: await lifecycle(cfg, store).change(body.orderId, "cancelled", { kind: "guest", checkoutId: claims.checkoutId, manageToken: body.manageToken }) });
      }
      if (url.pathname === "/admin/legacy/orders/status") {
        const legacy = legacyStatusTestService(cfg, store, env);
        const actor = await verifyAdmin(request.headers.get("Authorization")?.replace(/^Bearer /, ""), cfg, store, factories.authNet || fetch);
        if (!body || Array.isArray(body) || Object.keys(body).some((k) => !["orderId", "status"].includes(k)))
          throw new Fault("invalid_request", 409);
        return reply({ order: await legacy.change(body.orderId, body.status, { kind: "admin", uid: actor.uid }) });
      }
      if (url.pathname === "/admin/orders/status") {
        const actor = await verifyAdmin(request.headers.get("Authorization")?.replace(/^Bearer /, ""), cfg, store, factories.authNet || fetch);
        if (!body || Object.keys(body).some((k) => !["orderId", "status"].includes(k))) throw new Fault("invalid_request");
        return reply({ order: await lifecycle(cfg, store).change(body.orderId, body.status, { kind: "admin", uid: actor.uid }) });
      }
      throw new Fault("not_found", 404);
    } catch (e) {
      if (e instanceof Fault) return reply({ error: e.message }, e.status);
      if (e instanceof CodFault || e instanceof CheckoutFault) return reply({ error: e.code }, 409);
      return reply({ error: "service_unavailable" }, 503);
    }
  };
}
__name(handler, "handler");
var worker_default = { fetch: handler(), async scheduled(event, env, ctx) {
  const cfg = releaseConfig(env), store = createStore(env);
  const result = await createService(cfg, store, stripeClient(cfg), cfg.live && ctx ? () => ctx.waitUntil(sendOrderPush(store).catch(() => console.error("order_push_failed"))) : void 0).reconcile();
  if (env.ALERT_DELIVERY_ENABLED === "true") {
    await runScheduledAlert({ store, env });
    if (env.RESEND_READ_ACCESS_ENABLED === "true") await auditResendDelivery({ store, env });
  }
  if (result.failed) throw new Error("stripe_reconciliation_retry_required");
} };
export {
  worker_default as default,
  handler
};
