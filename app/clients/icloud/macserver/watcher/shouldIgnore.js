import { createRequire } from "module";

const require = createRequire(import.meta.url);
const shouldIgnore = require("../../../util/shouldIgnoreFile.js");

export default shouldIgnore;
