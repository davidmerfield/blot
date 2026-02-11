const Bottleneck = require("bottleneck");
const config = require("config");
const clfdate = require("helper/clfdate");
const sync = require("clients/google-drive/sync");

const DEFAULTS = {
  enabled: false,
  per_service_account_min_time_ms: 600,
  per_service_account_max_concurrent: 1,
  global_max_concurrent: 4,
  jitter_ms: 500,
  tick_interval_ms: 1000,
  max_items_global: 2000,
  max_items_per_service_account: 300,
  sync_cooldown_ms: 8000,
  rate_limit_backoff_ms: 20000,
};

const tiers = [
  { maxAgeMs: 10 * 1000, cadenceMs: 2 * 1000 },
  { maxAgeMs: 40 * 1000, cadenceMs: 3 * 1000 },
  { maxAgeMs: 120 * 1000, cadenceMs: 10 * 1000 },
];

const prefix = () => `${clfdate()} Google Drive hotDocPoller:`;

class HotDocPoller {
  constructor() {
    this.config = {
      ...DEFAULTS,
      ...(config.google_drive && config.google_drive.hot_doc_poller
        ? config.google_drive.hot_doc_poller
        : {}),
    };

    this.items = new Map();
    this.itemsByServiceAccount = new Map();
    this.driveClients = new Map();
    this.lastSyncAtByBlog = new Map();
    this.metrics = {
      enqueueCount: 0,
      pollAttempts: 0,
      changeDetectedCount: 0,
      syncTriggerCount: 0,
      evictions: 0,
      rateLimitEvents: 0,
    };

    this.globalLimiter = new Bottleneck({
      maxConcurrent: this.config.global_max_concurrent,
    });

    this.serviceLimiterGroup = new Bottleneck.Group({
      minTime: this.config.per_service_account_min_time_ms,
      maxConcurrent: this.config.per_service_account_max_concurrent,
    });

    this.rateLimitBackoffUntil = 0;
    this._timer = null;
  }

  start() {
    if (!this.config.enabled || this._timer) return;

    this._timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error(prefix(), "tick failed", err.message);
      });
    }, this.config.tick_interval_ms);

    console.log(prefix(), "started", {
      tickInterval: this.config.tick_interval_ms,
      globalMaxConcurrent: this.config.global_max_concurrent,
      perServiceAccountMinTime: this.config.per_service_account_min_time_ms,
    });
  }

  stop() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
  }

  registerDriveClient(serviceAccountId, driveClient) {
    if (!serviceAccountId || !driveClient) return;
    this.driveClients.set(serviceAccountId, driveClient);
  }

  keyOf(blogID, fileId) {
    return `${blogID}::${fileId || "*"}`;
  }

  enqueue({ blogID, serviceAccountId, fileId, folderId }) {
    if (!this.config.enabled) return;

    if (!blogID || !serviceAccountId) {
      console.warn(prefix(), "enqueue missing identifiers", {
        blogID,
        serviceAccountId,
        fileId,
        folderId,
      });
      return;
    }

    const key = this.keyOf(blogID, fileId);
    const now = Date.now();
    const existing = this.items.get(key);

    this.metrics.enqueueCount += 1;

    if (existing) {
      existing.lastSeen = now;
      existing.nextDueAt = now + tiers[0].cadenceMs;
      existing.state = "queued";
      if (folderId && !existing.folderId) {
        existing.folderId = folderId;
      }
      console.log(prefix(), "re-enqueued item", {
        blogID,
        serviceAccountId,
        fileId,
      });
      return;
    }

    const item = {
      blogID,
      serviceAccountId,
      fileId,
      folderId,
      firstSeen: now,
      lastSeen: now,
      lastPolledAt: null,
      pollCount: 0,
      nextDueAt: now,
      lastKnownModifiedTime: null,
      lastKnownRevision: null,
      state: "queued",
    };

    this.items.set(key, item);

    if (!this.itemsByServiceAccount.has(serviceAccountId)) {
      this.itemsByServiceAccount.set(serviceAccountId, new Set());
    }
    this.itemsByServiceAccount.get(serviceAccountId).add(key);

    this.applyCaps();
  }

  applyCaps() {
    while (this.items.size > this.config.max_items_global) {
      this.evictOldest("global-cap");
    }

    for (const [serviceAccountId, keys] of this.itemsByServiceAccount.entries()) {
      while (keys.size > this.config.max_items_per_service_account) {
        this.evictOldest(`service-account-cap:${serviceAccountId}`, serviceAccountId);
      }
    }
  }

  evictOldest(reason, serviceAccountId) {
    let oldestKey = null;
    let oldest = null;

    for (const [key, item] of this.items.entries()) {
      if (serviceAccountId && item.serviceAccountId !== serviceAccountId) {
        continue;
      }
      if (!oldest || item.firstSeen < oldest.firstSeen) {
        oldest = item;
        oldestKey = key;
      }
    }

    if (!oldestKey) return;

    this.removeItem(oldestKey);
    this.metrics.evictions += 1;
    console.warn(prefix(), "evicted hot item", {
      reason,
      blogID: oldest.blogID,
      serviceAccountId: oldest.serviceAccountId,
      fileId: oldest.fileId,
    });
  }

  removeItem(key) {
    const item = this.items.get(key);
    if (!item) return;

    this.items.delete(key);
    const keys = this.itemsByServiceAccount.get(item.serviceAccountId);
    if (keys) {
      keys.delete(key);
      if (!keys.size) {
        this.itemsByServiceAccount.delete(item.serviceAccountId);
      }
    }
  }

  tierForAge(ageMs) {
    return tiers.find((tier) => ageMs <= tier.maxAgeMs) || null;
  }

  async tick() {
    const now = Date.now();
    const dueItems = [];

    for (const [key, item] of this.items.entries()) {
      const ageMs = now - item.firstSeen;
      const tier = this.tierForAge(ageMs);

      if (!tier) {
        this.removeItem(key);
        this.metrics.evictions += 1;
        continue;
      }

      if (item.nextDueAt <= now && item.state !== "polling") {
        dueItems.push(item);
      }
    }

    for (const item of dueItems) {
      item.state = "polling";
      this.pollItem(item).finally(() => {
        item.state = "queued";
      });
    }
  }

  async pollItem(item) {
    const now = Date.now();
    const ageMs = now - item.firstSeen;
    const tier = this.tierForAge(ageMs);

    if (!tier) {
      this.removeItem(this.keyOf(item.blogID, item.fileId));
      return;
    }

    item.lastPolledAt = now;
    item.pollCount += 1;
    item.nextDueAt = now + tier.cadenceMs;

    const limiter = this.serviceLimiterGroup.key(item.serviceAccountId);

    try {
      this.metrics.pollAttempts += 1;
      await this.globalLimiter.schedule(() =>
        limiter.schedule(async () => {
          await this.sleep(Math.floor(Math.random() * (this.config.jitter_ms + 1)));
          await this.probeAndSyncIfChanged(item);
        })
      );
    } catch (err) {
      if (this.isRateLimitError(err)) {
        this.handleRateLimitError(err);
      } else {
        console.error(prefix(), "poll failed", {
          blogID: item.blogID,
          serviceAccountId: item.serviceAccountId,
          fileId: item.fileId,
          error: err.message,
        });
      }
    }
  }

  async probeAndSyncIfChanged(item) {
    if (Date.now() < this.rateLimitBackoffUntil) {
      item.nextDueAt = Math.max(item.nextDueAt, this.rateLimitBackoffUntil);
      return;
    }

    if (!item.fileId) {
      await this.triggerSyncWithCooldown(item, "coarse-fallback");
      return;
    }

    const drive = this.driveClients.get(item.serviceAccountId);
    if (!drive) {
      console.warn(prefix(), "missing drive client", {
        serviceAccountId: item.serviceAccountId,
        blogID: item.blogID,
        fileId: item.fileId,
      });
      return;
    }

    const response = await drive.files.get({
      fileId: item.fileId,
      fields: "id,modifiedTime,version,mimeType",
      supportsAllDrives: true,
    });

    const data = response && response.data ? response.data : {};

    if (data.mimeType && data.mimeType !== "application/vnd.google-apps.document") {
      return;
    }

    const changed =
      (item.lastKnownModifiedTime && item.lastKnownModifiedTime !== data.modifiedTime) ||
      (item.lastKnownRevision && item.lastKnownRevision !== data.version);

    const firstProbe = !item.lastKnownModifiedTime && !item.lastKnownRevision;

    item.lastKnownModifiedTime = data.modifiedTime || null;
    item.lastKnownRevision = data.version || null;

    if (!firstProbe && changed) {
      this.metrics.changeDetectedCount += 1;
      console.log(prefix(), "change detected", {
        blogID: item.blogID,
        serviceAccountId: item.serviceAccountId,
        fileId: item.fileId,
        modifiedTime: data.modifiedTime,
        version: data.version,
      });
      await this.triggerSyncWithCooldown(item, "doc-change");
    }
  }

  async triggerSyncWithCooldown(item, reason) {
    const now = Date.now();
    const lastSyncAt = this.lastSyncAtByBlog.get(item.blogID) || 0;

    if (now - lastSyncAt < this.config.sync_cooldown_ms) {
      return;
    }

    this.lastSyncAtByBlog.set(item.blogID, now);
    this.metrics.syncTriggerCount += 1;

    console.log(prefix(), "triggering sync", {
      reason,
      blogID: item.blogID,
      serviceAccountId: item.serviceAccountId,
      fileId: item.fileId,
    });

    await sync(item.blogID);
  }

  isRateLimitError(err) {
    const status = err && (err.code || (err.response && err.response.status));
    return status === 429 || status === 403;
  }

  handleRateLimitError(err) {
    const now = Date.now();
    this.metrics.rateLimitEvents += 1;
    this.rateLimitBackoffUntil = now + this.config.rate_limit_backoff_ms;

    for (const item of this.items.values()) {
      item.nextDueAt = Math.max(item.nextDueAt, this.rateLimitBackoffUntil);
    }

    console.warn(prefix(), "rate limit encountered", {
      error: err.message,
      status: err.code || (err.response && err.response.status),
      backoffUntil: new Date(this.rateLimitBackoffUntil).toISOString(),
      rateLimitEvents: this.metrics.rateLimitEvents,
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getMetrics() {
    return { ...this.metrics, items: this.items.size };
  }
}

module.exports = new HotDocPoller();
