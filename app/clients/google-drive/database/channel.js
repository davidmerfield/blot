const { promisify } = require("util");

// Redis client setup
const client = require("models/client");
const hsetAsync = promisify(client.hset).bind(client);
const hgetallAsync = promisify(client.hgetall).bind(client);
const delAsync = promisify(client.del).bind(client);
const saddAsync = promisify(client.sadd).bind(client);
const sremAsync = promisify(client.srem).bind(client);
const smembersAsync = promisify(client.smembers).bind(client);
const sscanAsync = promisify(client.sscan).bind(client);

const PREFIX = require("./prefix");

// Channel operations
const channel = {
  // Generate Redis keys for channels
  _key(channelId) {
    return `${PREFIX}channels:${channelId}`;
  },
  _globalSetKey() {
    return `${PREFIX}channels`;
  },
  _serviceAccountKey(serviceAccountId) {
    return `${PREFIX}serviceAccounts:${serviceAccountId}:channels`;
  },
  _fileKey(serviceAccountId, fileId) {
    return `${PREFIX}serviceAccounts:${serviceAccountId}:files:${fileId}:channels`;
  },

  // Create or update a channel, associating it with the appropriate IDs
  async store(channelId, data) {
    const { type, serviceAccountId, fileId } = data;

    if (!type || !serviceAccountId) {
      throw new Error("type and serviceAccountId are required to associate a channel.");
    }

    const key = this._key(channelId);
    const globalSetKey = this._globalSetKey();
    const serviceAccountKey = this._serviceAccountKey(serviceAccountId);

    // Store each field of the data object in the Redis hash
    for (const [field, value] of Object.entries(data)) {
      await hsetAsync(key, field, value); // Ensure value is a string
    }

    // Track the channel globally
    await saddAsync(globalSetKey, channelId);

    // Track the channel under the serviceAccountId
    await saddAsync(serviceAccountKey, channelId);

    // If this is a `files.watch` channel, associate it with the fileId
    if (type === "files.watch" && fileId) {
      const fileKey = this._fileKey(serviceAccountId, fileId);
      await saddAsync(fileKey, channelId);
    }
  },

  // Retrieve a channel by its ID
  async get(channelId) {
    const key = this._key(channelId);
    return await hgetallAsync(key);
  },

  // Delete a channel by its ID, untracking it globally and from its associations
  async delete(channelId) {
    const key = this._key(channelId);
    const globalSetKey = this._globalSetKey();

    // Get the channel data to find associations
    const data = await this.get(channelId);
    if (!data) return;

    const { type, serviceAccountId, fileId } = data;

    if (serviceAccountId) {
      const serviceAccountKey = this._serviceAccountKey(serviceAccountId);
      await sremAsync(serviceAccountKey, channelId);

      if (type === "files.watch" && fileId) {
        const fileKey = this._fileKey(serviceAccountId, fileId);
        await sremAsync(fileKey, channelId);
      }
    }

    // Remove the channel from Redis
    await delAsync(key);

    // Remove the channel from the global channel set
    await sremAsync(globalSetKey, channelId);
  },

  // List all channels globally
  async list() {
    const globalSetKey = this._globalSetKey();
    return await smembersAsync(globalSetKey);
  },

  // List all channels associated with a serviceAccountId
  async listByServiceAccount(serviceAccountId) {
    const serviceAccountKey = this._serviceAccountKey(serviceAccountId);
    return await smembersAsync(serviceAccountKey);
  },

  // List all channels associated with a serviceAccountId and fileId
  async listByFile(serviceAccountId, fileId) {
    const fileKey = this._fileKey(serviceAccountId, fileId);
    return await smembersAsync(fileKey);
  },

  // Iterate over all channels globally
  async iterate(callback) {
    const globalSetKey = this._globalSetKey();
    let cursor = "0";
    do {
      const [nextCursor, channelIds] = await sscanAsync(globalSetKey, cursor);
      for (const channelId of channelIds) {
        const data = await this.get(channelId);
        if (data) {
          await callback(data);
        }
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  },

  // Iterate over all channels associated with a serviceAccountId
  async iterateByServiceAccount(serviceAccountId, callback) {
    const serviceAccountKey = this._serviceAccountKey(serviceAccountId);
    let cursor = "0";
    do {
      const [nextCursor, channelIds] = await sscanAsync(serviceAccountKey, cursor);
      for (const channelId of channelIds) {
        const data = await this.get(channelId);
        if (data) {
          await callback(data);
        }
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  },

  // Iterate over all channels associated with a serviceAccountId and fileId
  async iterateByFile(serviceAccountId, fileId, callback) {
    const fileKey = this._fileKey(serviceAccountId, fileId);
    let cursor = "0";
    do {
      const [nextCursor, channelIds] = await sscanAsync(fileKey, cursor);
      for (const channelId of channelIds) {
        const data = await this.get(channelId);
        if (data) {
          await callback(data);
        }
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  },
};

module.exports = channel;