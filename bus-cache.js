/**
 * Redis cache for real-time bus location data.
 * Falls back gracefully when Redis is not configured.
 */

const Redis = require('ioredis');

let redis = null;

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on('error', err => console.error('[redis] Connection error:', err.message));
  }
  return redis;
}

const TTL_SECONDS = 30; // bus pings cached for 30s

async function cacheBusLocation(routeId, data) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.setex(`bus:route:${routeId}`, TTL_SECONDS, JSON.stringify(data));
  } catch (e) {
    console.error('[redis] cacheBusLocation failed:', e.message);
  }
}

async function getBusLocation(routeId) {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(`bus:route:${routeId}`);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    console.error('[redis] getBusLocation failed:', e.message);
    return null;
  }
}

async function cacheStudentBusState(studentId, state) {
  const r = getRedis();
  if (!r) return;
  try {
    // state: { scan_type, route_name, scanned_at, route_id }
    await r.setex(`bus:student:${studentId}`, 60 * 60 * 4, JSON.stringify(state)); // 4-hour TTL (school day)
  } catch (e) {
    console.error('[redis] cacheStudentBusState failed:', e.message);
  }
}

async function getStudentBusState(studentId) {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(`bus:student:${studentId}`);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
}

async function clearStudentBusState(studentId) {
  const r = getRedis();
  if (!r) return;
  try { await r.del(`bus:student:${studentId}`); } catch (e) {}
}

module.exports = { cacheBusLocation, getBusLocation, cacheStudentBusState, getStudentBusState, clearStudentBusState };
