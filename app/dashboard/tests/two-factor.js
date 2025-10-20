describe("dashboard two-factor", function () {
  global.test.site({ login: true });

  const User = require("models/user");
  const twoFactor = User.twoFactor;
  const cheerio = require("cheerio");

  const FIXED_TIME = 1700000000000;
  const SECRET = "JBSWY3DPEHPK3PXP";
  const RAW_CODES = [
    "alpha12345a",
    "bravo12345b",
    "charl12345c",
    "delta12345d",
    "echo12345e",
    "foxt12345f",
    "golf12345g",
    "hotel12345h",
    "india12345i",
    "julie12345j",
  ];

  function setupDeterministic() {
    let index = 0;
    twoFactor.testing.setSecretGenerator(() => SECRET);
    twoFactor.testing.setBackupCodeGenerator(() => RAW_CODES[index++] || RAW_CODES[0]);
    twoFactor.testing.setTime(FIXED_TIME);
  }

  function resetDeterministic() {
    twoFactor.testing.reset();
  }

  afterEach(function () {
    resetDeterministic();
  });

  async function getUser(uid) {
    return new Promise((resolve, reject) => {
      User.getById(uid, (err, user) => {
        if (err) return reject(err);
        resolve(user);
      });
    });
  }

  async function beginLogin(context) {
    const loginPage = await context.fetch("/sites/log-in", {
      redirect: "manual",
    });

    const loginHeaders = Object.fromEntries(loginPage.headers);
    const loginCookies = loginHeaders["set-cookie"];
    const loginHtml = await loginPage.text();

    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    if (!csrfMatch) throw new Error("CSRF token not found on login page");

    const params = new URLSearchParams();
    params.append("email", context.user.email);
    params.append("password", context.user.fakePassword);
    params.append("_csrf", csrfMatch[1]);

    const loginRes = await context.fetch("/sites/log-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: loginCookies,
      },
      body: params.toString(),
      redirect: "manual",
    });

    const loginResHeaders = Object.fromEntries(loginRes.headers);
    const combinedCookies = loginResHeaders["set-cookie"] || loginCookies;
    if (combinedCookies) {
      context.Cookie = combinedCookies;
    }

    const body = await loginRes.text();

    return { response: loginRes, body, cookies: combinedCookies };
  }

  async function submitTwoFactor(context, bodyHtml, token) {
    const $ = cheerio.load(bodyHtml);
    const csrfToken = $('input[name="_csrf"]').attr("value");
    const email = $('input[name="email"]').attr("value");
    const thenValue = $('input[name="then"]').attr("value");

    if (!csrfToken) throw new Error("Two-factor CSRF token not found");

    const params = new URLSearchParams();
    params.append("_csrf", csrfToken);
    params.append("email", email);
    params.append("token", token);
    if (thenValue) params.append("then", thenValue);

    const res = await context.fetch("/sites/log-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: context.Cookie,
      },
      body: params.toString(),
      redirect: "manual",
    });

    const resHeaders = Object.fromEntries(res.headers);
    if (resHeaders["set-cookie"]) {
      context.Cookie = resHeaders["set-cookie"]; 
    }

    return res;
  }

  it("enables two-factor through the dashboard", async function () {
    setupDeterministic();

    const expectedCodes = twoFactor.sanitizeBackupCodes(RAW_CODES);

    const startRes = await this.submit("/sites/account/two-factor/start", {});
    expect(startRes.status).toBe(302);

    const enablePage = await this.fetch("/sites/account/two-factor/enable");
    expect(enablePage.status).toBe(200);
    const enableHtml = await enablePage.text();
    expect(enableHtml).toContain("Set up two-factor");

    const token = twoFactor.testing.generateToken(SECRET);

    const confirmRes = await this.submit("/sites/account/two-factor/enable", {
      code: token,
    });

    expect(confirmRes.status).toBe(302);
    const location = confirmRes.headers.get("location");
    expect(location).toBe("/sites/account/two-factor/codes");

    const codesPage = await this.fetch(location);
    expect(codesPage.status).toBe(200);
    const codesHtml = await codesPage.text();
    expect(codesHtml).toContain("Your backup codes");

    expectedCodes.forEach((code) => {
      expect(codesHtml).toContain(code);
    });

    const stored = await getUser(this.user.uid);
    expect(stored.twoFactor.enabled).toBe(true);
  });

  it("permits login with a time-based code", async function () {
    setupDeterministic();

    await new Promise((resolve, reject) => {
      twoFactor.enable(
        this.user.uid,
        { secret: SECRET, backupCodes: twoFactor.sanitizeBackupCodes(RAW_CODES) },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const logoutRes = await this.submit("/sites/account/log-out", {});
    const logoutCookies = logoutRes.headers.get("set-cookie");
    this.Cookie = logoutCookies || "";

    const loginAttempt = await beginLogin(this);
    expect(loginAttempt.response.status).toBe(200);
    expect(loginAttempt.body).toContain("Two-factor required");

    const totp = twoFactor.testing.generateToken(SECRET);
    const verifyRes = await submitTwoFactor(this, loginAttempt.body, totp);

    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("/sites");

    const dashboard = await this.fetch("/sites");
    expect(dashboard.status).toBe(200);
  });

  it("accepts a backup code when logging in", async function () {
    setupDeterministic();

    await new Promise((resolve, reject) => {
      twoFactor.enable(
        this.user.uid,
        { secret: SECRET, backupCodes: twoFactor.sanitizeBackupCodes(RAW_CODES) },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const stored = await getUser(this.user.uid);
    const backup = stored.twoFactor.backupCodes[0];

    const logoutRes = await this.submit("/sites/account/log-out", {});
    const logoutCookies = logoutRes.headers.get("set-cookie");
    this.Cookie = logoutCookies || "";

    const loginAttempt = await beginLogin(this);
    expect(loginAttempt.response.status).toBe(200);

    const verifyRes = await submitTwoFactor(this, loginAttempt.body, backup);
    expect(verifyRes.status).toBe(302);

    const updated = await getUser(this.user.uid);
    expect(updated.twoFactor.backupCodes.length).toBe(stored.twoFactor.backupCodes.length - 1);
  });

  it("rejects an invalid code", async function () {
    setupDeterministic();

    await new Promise((resolve, reject) => {
      twoFactor.enable(
        this.user.uid,
        { secret: SECRET, backupCodes: twoFactor.sanitizeBackupCodes(RAW_CODES) },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const logoutRes = await this.submit("/sites/account/log-out", {});
    const logoutCookies = logoutRes.headers.get("set-cookie");
    this.Cookie = logoutCookies || "";

    const loginAttempt = await beginLogin(this);
    expect(loginAttempt.response.status).toBe(200);

    const verifyRes = await submitTwoFactor(this, loginAttempt.body, "111111");
    expect(verifyRes.status).toBe(403);
    const errorBody = await verifyRes.text();
    expect(errorBody).toContain("That code was not valid");
  });
});
