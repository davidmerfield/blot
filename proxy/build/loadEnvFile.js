module.exports = function loadEnvFile() {
  const envPath = require('path').join(__dirname, "..", "..", ".env");
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    const envVars = envContent
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .reduce((vars, line) => {
        const [key, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          vars[key.trim()] = value.replace(/^["']|["']$/g, "");
        }
        return vars;
      }, {});

    Object.assign(process.env, envVars);
  } catch (error) {
    console.error("Error reading .env file:", error);
  }
}