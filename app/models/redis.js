const config = require("config");
const redis = require("redis");

const url = `redis://${config.redis.host}:${config.redis.port}`;

module.exports = function () {
  const client = redis.createClient({
    url,
    legacyMode: true,
  });

  function withCallback(promise, callback) {
    if (typeof callback !== "function") return promise;
    promise.then(
      (result) => callback(null, result),
      (error) => callback(error)
    );
  }

  function flatArgs(args) {
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  function flatKeyedArgs(args) {
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    if (args.length === 2 && Array.isArray(args[1])) {
      return [args[0]].concat(args[1]);
    }
    return args;
  }

  function normalizeValue(value) {
    if (value === null || typeof value === "undefined") return "";
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === "string") return value;
    return String(value);
  }

  function normalizeScanReply(reply) {
    if (!reply || Array.isArray(reply)) return reply;
    if (
      typeof reply === "object" &&
      Object.prototype.hasOwnProperty.call(reply, "cursor")
    ) {
      return [String(reply.cursor), reply.keys || []];
    }
    return reply;
  }

  function normalizeSScanReply(reply) {
    if (!reply || Array.isArray(reply)) return reply;
    if (
      typeof reply === "object" &&
      Object.prototype.hasOwnProperty.call(reply, "cursor")
    ) {
      return [String(reply.cursor), reply.members || reply.keys || []];
    }
    return reply;
  }

  function normalizeHScanReply(reply) {
    if (!reply || Array.isArray(reply)) return reply;
    if (
      typeof reply === "object" &&
      Object.prototype.hasOwnProperty.call(reply, "cursor")
    ) {
      return [String(reply.cursor), reply.tuples || reply.map || reply.keys || []];
    }
    return reply;
  }

  function normalizeZScanReply(reply) {
    if (!reply || Array.isArray(reply)) return reply;
    if (
      typeof reply === "object" &&
      Object.prototype.hasOwnProperty.call(reply, "cursor")
    ) {
      const flattened = [];
      const members = reply.members || reply.tuples || [];
      members.forEach((member) => {
        if (
          member &&
          typeof member === "object" &&
          Object.prototype.hasOwnProperty.call(member, "value")
        ) {
          flattened.push(member.value, String(member.score));
        } else {
          flattened.push(member);
        }
      });
      return [String(reply.cursor), flattened];
    }
    return reply;
  }

  function normalizeHGetAll(reply) {
    if (!Array.isArray(reply)) {
      if (reply && typeof reply === "object" && !Object.keys(reply).length) {
        return null;
      }
      return reply;
    }
    if (!reply.length) return null;
    const obj = {};
    for (let i = 0; i < reply.length; i += 2) {
      obj[reply[i]] = reply[i + 1];
    }
    return obj;
  }

  function createLegacyCommand(name, command, normalizeArgs, normalizeReply) {
    const legacyCommand = function legacyCommand() {
      const args = Array.prototype.slice.call(arguments);
      const callback =
        typeof args[args.length - 1] === "function" ? args.pop() : null;
      const normalizedArgs = normalizeArgs ? normalizeArgs(args) : args;
      const commandArgs = [command].concat(normalizedArgs.map(normalizeValue));

      const promise = client.sendCommand(commandArgs).then((reply) => {
        return normalizeReply ? normalizeReply(reply) : reply;
      });

      return withCallback(promise, callback);
    };

    client[name] = legacyCommand;
    client[command] = legacyCommand;
  }

  createLegacyCommand("keys", "KEYS");
  createLegacyCommand("type", "TYPE");
  createLegacyCommand("get", "GET");
  createLegacyCommand("set", "SET", function normalizeSetArgs(args) {
    if (args.length >= 2) return [args[0], normalizeValue(args[1])];
    return args;
  });
  createLegacyCommand("setnx", "SETNX", function normalizeSetNxArgs(args) {
    if (args.length >= 2) return [args[0], normalizeValue(args[1])];
    return args;
  });
  createLegacyCommand("setex", "SETEX", function normalizeSetExArgs(args) {
    if (args.length >= 3) return [args[0], args[1], normalizeValue(args[2])];
    return args;
  });
  createLegacyCommand("msetnx", "MSETNX", flatArgs);
  createLegacyCommand("del", "DEL", flatArgs);
  createLegacyCommand("exists", "EXISTS");
  createLegacyCommand("hget", "HGET");
  createLegacyCommand("hdel", "HDEL");
  createLegacyCommand(
    "hscan",
    "HSCAN",
    flatArgs,
    normalizeHScanReply
  );
  createLegacyCommand("sadd", "SADD", flatKeyedArgs);
  createLegacyCommand("srem", "SREM", flatKeyedArgs);
  createLegacyCommand("smembers", "SMEMBERS");
  createLegacyCommand("sismember", "SISMEMBER");
  createLegacyCommand(
    "sscan",
    "SSCAN",
    flatArgs,
    function normalizeSScanReply(reply) {
      if (!reply || Array.isArray(reply)) return reply;
      if (typeof reply === "object" && Object.prototype.hasOwnProperty.call(reply, "cursor")) {
        return [String(reply.cursor), reply.members || reply.keys || []];
      }
      return reply;
    }
  );
  createLegacyCommand("zrem", "ZREM");
  createLegacyCommand("zrange", "ZRANGE");
  createLegacyCommand("zrevrange", "ZREVRANGE");
  createLegacyCommand("zrangebyscore", "ZRANGEBYSCORE");
  createLegacyCommand("zrevrangebyscore", "ZREVRANGEBYSCORE");
  createLegacyCommand("zremrangebyscore", "ZREMRANGEBYSCORE");
  createLegacyCommand("zremrangebyrank", "ZREMRANGEBYRANK");
  createLegacyCommand("zcard", "ZCARD");
  createLegacyCommand("zscore", "ZSCORE");
  createLegacyCommand("zrank", "ZRANK");
  createLegacyCommand("zrevrank", "ZREVRANK");
  createLegacyCommand("zcount", "ZCOUNT");
  createLegacyCommand("zincrby", "ZINCRBY");
  createLegacyCommand("zrandmember", "ZRANDMEMBER");
  createLegacyCommand(
    "zscan",
    "ZSCAN",
    flatArgs,
    normalizeZScanReply
  );
  createLegacyCommand("zrangebylex", "ZRANGEBYLEX");
  createLegacyCommand(
    "scan",
    "SCAN",
    flatArgs,
    normalizeScanReply
  );
  createLegacyCommand("incr", "INCR");
  createLegacyCommand("decr", "DECR");
  createLegacyCommand("lpush", "LPUSH");
  createLegacyCommand("rpush", "RPUSH");
  createLegacyCommand("lrange", "LRANGE");
  createLegacyCommand("llen", "LLEN");
  createLegacyCommand("ltrim", "LTRIM");
  createLegacyCommand("lrem", "LREM");
  createLegacyCommand("lset", "LSET");
  createLegacyCommand("lindex", "LINDEX");
  createLegacyCommand("ping", "PING");
  createLegacyCommand("publish", "PUBLISH");
  createLegacyCommand("ttl", "TTL");
  createLegacyCommand("expire", "EXPIRE");
  createLegacyCommand("persist", "PERSIST");
  createLegacyCommand("rename", "RENAME");
  createLegacyCommand("mget", "MGET", flatArgs);
  createLegacyCommand("mset", "MSET", flatArgs);
  createLegacyCommand("sort", "SORT", flatArgs);
  createLegacyCommand("hexists", "HEXISTS");

  createLegacyCommand("hgetall", "HGETALL", null, normalizeHGetAll);

  createLegacyCommand("hset", "HSET", function normalizeHSetArgs(args) {
    const key = args[0];
    const values = args[1];

    if (args.length === 2 && values && typeof values === "object" && !Array.isArray(values)) {
      const pairs = [];
      Object.keys(values).forEach((field) => {
        pairs.push(field, normalizeValue(values[field]));
      });
      return [key].concat(pairs);
    }

    if (args.length >= 3) {
      const pairs = [];
      for (let i = 1; i < args.length; i += 2) {
        pairs.push(args[i], normalizeValue(args[i + 1]));
      }
      return [key].concat(pairs);
    }

    return args;
  });

  createLegacyCommand("hmset", "HSET", function normalizeHMSetArgs(args) {
    const key = args[0];
    const values = args[1];

    if (args.length === 2 && values && typeof values === "object" && !Array.isArray(values)) {
      const pairs = [];
      Object.keys(values).forEach((field) => {
        pairs.push(field, normalizeValue(values[field]));
      });
      return [key].concat(pairs);
    }

    if (args.length === 2 && Array.isArray(values)) {
      return [
        key,
        ...values.map((value, index) =>
          index % 2 === 1 ? normalizeValue(value) : value
        ),
      ];
    }

    if (args.length >= 3) {
      const pairs = [];
      for (let i = 1; i < args.length; i += 2) {
        pairs.push(args[i], normalizeValue(args[i + 1]));
      }
      return [key].concat(pairs);
    }

    return args;
  });

  createLegacyCommand("zadd", "ZADD", function normalizeZAddArgs(args) {
    // Preserve legacy varargs: zadd key score member [score member...]
    return args;
  });

  if (typeof client.multi === "function") {
    const nativeMulti = client.multi.bind(client);
    client.multi = function compatMulti() {
      const multi = nativeMulti();
      const queuedReplyNormalizers = [];
      const commandNames = [
        "get",
        "set",
        "setnx",
        "del",
        "exists",
        "hget",
        "hgetall",
        "hset",
        "hdel",
        "hmset",
        "sadd",
        "srem",
        "smembers",
        "sismember",
        "zadd",
        "zrem",
        "zrange",
        "zrevrange",
        "zrangebyscore",
        "zrevrangebyscore",
        "zremrangebyscore",
        "zremrangebyrank",
        "zcard",
        "zscore",
        "zrank",
        "zrevrank",
        "zcount",
        "zincrby",
        "zrandmember",
        "zrangebylex",
        "sort",
        "hexists",
        "mget",
        "mset",
        "incr",
        "decr",
        "lpush",
        "rpush",
        "lrange",
        "llen",
        "ltrim",
        "lrem",
        "lset",
        "lindex",
        "expire",
        "persist",
        "rename",
      ];

      commandNames.forEach((name) => {
        const upper = name.toUpperCase();

        let normalizeReply = null;
        if (name === "hgetall") normalizeReply = normalizeHGetAll;
        if (name === "scan") normalizeReply = normalizeScanReply;
        if (name === "sscan") normalizeReply = normalizeSScanReply;
        if (name === "hscan") normalizeReply = normalizeHScanReply;
        if (name === "zscan") normalizeReply = normalizeZScanReply;

        const hasNativeMultiCommand =
          typeof multi.addCommand === "function" ||
          typeof multi[upper] === "function" ||
          typeof multi[name] === "function";

        if (hasNativeMultiCommand) {
          const compatCommand = function () {
            const args = Array.prototype.slice.call(arguments);
            if (
              (name === "del" ||
                name === "mget" ||
                name === "mset" ||
                name === "sadd" ||
                name === "srem") &&
              args.length === 1 &&
              Array.isArray(args[0])
            ) {
              args.splice(0, 1, ...args[0]);
            }
            if (
              (name === "sadd" || name === "srem") &&
              args.length === 2 &&
              Array.isArray(args[1])
            ) {
              args.splice(1, 1, ...args[1]);
            }
            if ((name === "set" || name === "setnx") && args.length >= 2) {
              args[1] = normalizeValue(args[1]);
            }
            const normalizedArgs = args.map(normalizeValue);
            if (typeof multi.addCommand === "function") {
              multi.addCommand([upper].concat(normalizedArgs));
            } else if (typeof multi[upper] === "function") {
              multi[upper].apply(multi, normalizedArgs);
            } else if (typeof multi[name] === "function") {
              multi[name].apply(multi, normalizedArgs);
            } else {
              throw new Error("No multi command available: " + upper);
            }
            queuedReplyNormalizers.push(normalizeReply);
            return multi;
          };

          multi[name] = compatCommand;
          multi[upper] = compatCommand;
        }
      });

      if (typeof multi.hset === "function") {
        const originalMultiHSet = multi.hset.bind(multi);
        multi.hset = function hsetCompat(key) {
          const args = Array.prototype.slice.call(arguments, 1);
          let pairs = [];

          if (
            args.length === 1 &&
            args[0] &&
            typeof args[0] === "object" &&
            !Array.isArray(args[0])
          ) {
            Object.keys(args[0]).forEach((field) => {
              pairs.push(field, normalizeValue(args[0][field]));
            });
          } else if (args.length >= 2) {
            for (let i = 0; i < args.length; i += 2) {
              pairs.push(args[i], normalizeValue(args[i + 1]));
            }
          } else {
            pairs = args;
          }

          if (typeof multi.addCommand === "function") {
            multi.addCommand(["HSET", key].concat(pairs));
          } else if (typeof multi.HSET === "function") {
            multi.HSET.apply(multi, [key].concat(pairs));
          } else {
            originalMultiHSet.apply(multi, [key].concat(pairs));
          }
          return multi;
        };
      }

      multi.hmset = function hmsetCompat(key, values) {
        if (
          values &&
          typeof values === "object" &&
          !Array.isArray(values)
        ) {
          return multi.hset(key, values);
        }

        if (Array.isArray(values)) {
          return multi.hset(key, ...values);
        }

        const args = Array.prototype.slice.call(arguments, 1);
        return multi.hset(key, ...args);
      };

      const nativeExec = multi.exec.bind(multi);
      multi.exec = function compatExec(callback) {
        const promise = nativeExec().then((result) => {
          if (!Array.isArray(result)) return result;
          return result.map((value, index) => {
            const normalizeReply = queuedReplyNormalizers[index];
            if (typeof normalizeReply !== "function") return value;
            return normalizeReply(value);
          });
        });
        if (typeof callback === "function") {
          promise.then(
            (result) => callback(null, result),
            (error) => callback(error)
          );
          return;
        }
        return promise;
      };

      return multi;
    };
  }

  if (typeof client.batch !== "function") {
    client.batch = client.multi.bind(client);
  }

  if (typeof client.quit === "function") {
    const nativeQuit = client.quit.bind(client);
    client.quit = function compatQuit(callback) {
      return withCallback(nativeQuit(), callback);
    };
  }

  client.on("error", function (err) {
    console.log("Redis Error:");
    console.log(err);
    if (err.trace) console.log(err.trace);
    if (err.stack) console.log(err.stack);
  });

  client.connect().catch((err) => {
    console.log("Redis connect error:");
    console.log(err);
    if (err.trace) console.log(err.trace);
    if (err.stack) console.log(err.stack);
  });

  return client;
};
