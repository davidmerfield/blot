import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Create a require function for importing CJS modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Import the CJS config module
const shouldIgnoreFile = require(join(__dirname, "../../../util/shouldIgnoreFile.js"));

// Export the function
export default shouldIgnoreFile;