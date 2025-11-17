const { promisify } = require("util");

// Redis client setup
const client = require("models/client");
const hgetAsync = promisify(client.hget).bind(client);
const hscanAsync = promisify(client.hscan).bind(client);

const PREFIX = require("./prefix");

function folder(folderId) {

  if (!folderId) {
    throw new Error("Folder ID is required");
  }
  
  // Redis keys
  this.key = `${PREFIX}${folderId}:folder`; // ID ↔ Path mapping
  this.reverseKey = `${PREFIX}${folderId}:path`; // Path ↔ ID mapping
  this.metadataKey = `${PREFIX}${folderId}:metadata`; // File metadata

  // Set a mapping (ID → Path) and store metadata
  this.set = async (id, path, metadata = {}) => {
    if (!id || !path || typeof id !== "string" || typeof path !== "string") {
      throw new Error("ID and path must be non-empty strings");
    }

    if (metadata && typeof metadata !== "object") {
      throw new Error("Metadata must be a valid object");
    }

    const multi = client.multi(); // Start a Redis transaction

    const previousPath = await hgetAsync(this.key, id);
    if (previousPath && previousPath !== path) {
      // Remove the old reverse mapping for the previous path
      multi.hdel(this.reverseKey, previousPath);
    }

    const previousId = await hgetAsync(this.reverseKey, path);
    if (previousId && previousId !== id) {
      // Remove the old mapping for the previous ID
      multi.hdel(this.key, previousId);
    }

    // Add the new ID ↔ Path mapping
    multi.hset(this.key, id, path);
    multi.hset(this.reverseKey, path, id);

    // Update metadata if provided
    if (metadata && Object.keys(metadata).length > 0) {
      multi.hset(this.metadataKey, id, JSON.stringify(metadata));
    }

    // Execute the transaction
    await multi.exec();
  };

  // Get the path for a given ID
  this.get = async (id) => {
    if (!id) return null;
    return await hgetAsync(this.key, id);
  };

  // Get the ID for a given path
  this.getByPath = async (path) => {
    if (!path) return null;
    return await hgetAsync(this.reverseKey, path);
  };

  // Get metadata for a given ID
  this.getMetadata = async (id) => {
    const metadata = await hgetAsync(this.metadataKey, id);
    return metadata ? JSON.parse(metadata) : null;
  };

  this.move = async (id, to) => {
    if (id === "/" || to === "/") {
      throw new Error("Cannot move to or from root");
    }

    const from = await this.get(id);
    if (!from) throw new Error(`No file or folder found for ID: ${id}`);

    // Ensure the target path is not a subfolder of the source path
    if (to.startsWith(from + "/")) {
      throw new Error("Cannot move a folder to a subfolder of itself");
    }

    // Check if 'to' already exists
    const existingId = await this.getByPath(to);
    if (existingId) {
      throw new Error(`Target path already exists: ${to}`);
    }

    const multi = client.multi(); // Start a Redis transaction
    let movedPaths = [];

    // If `from` is the exact path of the file, treat it as a file move
    if (from === to || !from.startsWith("/")) {
      const metadata = (await this.getMetadata(id)) || {}; // Default to empty metadata

      // Remove old reverse mapping and add new mappings in transaction
      multi.hdel(this.reverseKey, from);
      multi.hset(this.reverseKey, to, id);
      multi.hset(this.key, id, to);
      multi.hset(this.metadataKey, id, JSON.stringify(metadata));

      movedPaths.push({ from, to });

      // Execute the transaction and return the result
      await multi.exec();
      return movedPaths;
    }

    // For folders, update all child paths
    const START_CURSOR = "0";
    let cursor = START_CURSOR;

    do {
      const [nextCursor, results] = await hscanAsync(this.key, cursor);
      cursor = nextCursor;

      for (let i = 0; i < results.length; i += 2) {
        const currentId = results[i];
        const currentPath = results[i + 1];

        // Check if the current path is affected by the move
        if (currentPath === from || currentPath.startsWith(`${from}/`)) {
          const newPath = to + currentPath.slice(from.length);
          const metadata = (await this.getMetadata(currentId)) || {}; // Default to empty metadata

          // Queue all changes in the transaction
          multi.hdel(this.reverseKey, currentPath); // Remove old reverse mapping
          multi.hset(this.reverseKey, newPath, currentId); // Add new reverse mapping
          multi.hset(this.key, currentId, newPath); // Update the path mapping
          multi.hset(this.metadataKey, currentId, JSON.stringify(metadata)); // Update metadata

          movedPaths.push({ from: currentPath, to: newPath });
        }
      }
    } while (cursor !== START_CURSOR);

    // Execute the transaction
    await multi.exec();

    // Return all the affected paths
    return movedPaths;
  };

  // Remove a file or folder and its children
  this.remove = async (id) => {
    const from = await this.get(id);
    
    if (!from) { 
      console.log("Warning: No file or folder found for ID: ", id);
      return [];
    }

    const multi = client.multi(); // Start a Redis transaction
    let removedPaths = [];

    // Scan and delete all affected paths
    const START_CURSOR = "0";
    let cursor = START_CURSOR;

    do {
      const [nextCursor, results] = await hscanAsync(this.key, cursor);
      cursor = nextCursor;

      for (let i = 0; i < results.length; i += 2) {
        const currentId = results[i];
        const currentPath = results[i + 1];

        // Check if the current path is affected by the removal
        if (
          from === "/" ||
          currentPath === from ||
          currentPath.startsWith(`${from}/`)
        ) {
          multi.hdel(this.key, currentId); // Delete ID ↔ Path mapping
          multi.hdel(this.reverseKey, currentPath); // Delete Path ↔ ID mapping
          multi.hdel(this.metadataKey, currentId); // Delete metadata
          removedPaths.push(currentPath);
        }
      }
    } while (cursor !== START_CURSOR);

    // Execute the transaction
    await multi.exec();

    return removedPaths;
  };

  // Reset all mappings and metadata
  this.reset = async () => {
    const multi = client.multi();
    multi.del(this.key);
    multi.del(this.reverseKey);
    multi.del(this.metadataKey);
    await multi.exec();
  };

  this.readdir = async (dir) => {
    if (!dir || typeof dir !== "string") {
      throw new Error("Directory path must be a non-empty string");
    }

    // Normalize the directory path to ensure it ends with a "/"
    const basePath = dir.endsWith("/") ? dir : dir + "/";

    const START_CURSOR = "0";
    let cursor = START_CURSOR;
    let entries = [];

    do {
      // Scan the folder key
      const [nextCursor, results] = await hscanAsync(this.key, cursor);
      cursor = nextCursor;

      for (let i = 0; i < results.length; i += 2) {
        const id = results[i];
        const path = results[i + 1];

        // Check if the path is an immediate child of the given directory
        if (
          path.startsWith(basePath) &&
          path !== basePath && // Exclude the directory itself
          !path.slice(basePath.length).includes("/") // Exclude paths inside subdirectories of the directory
        ) {
          const metadata = await this.getMetadata(id);
          entries.push({ id, path, metadata });
        }
      }
    } while (cursor !== START_CURSOR);

    // Sort entries alphabetically by path
    entries.sort((a, b) => a.path.localeCompare(b.path));

    return entries;
  };

  // List all files and folders with metadata
  this.listAll = async () => {
    const START_CURSOR = "0";
    let cursor = START_CURSOR;
    let results = [];

    do {
      const [nextCursor, entries] = await hscanAsync(this.key, cursor);
      cursor = nextCursor;

      for (let i = 0; i < entries.length; i += 2) {
        const id = entries[i];
        const path = entries[i + 1];
        const metadata = await this.getMetadata(id);
        results.push({ id, path, metadata });
      }
    } while (cursor !== START_CURSOR);

    return results;
  };

  return this;
}

module.exports = folder;
