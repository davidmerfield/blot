#!/usr/bin/env node

const config = require("config");
const createDriveClient = require("clients/google-drive/serviceAccount/createDriveClient");
const readline = require("readline");

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function parseArgs(argv) {
  const args = {
    json: false,
    serviceAccountEmail: null,
    matchEmail: null,
    limit: null,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg.startsWith("--service-account=")) {
      args.serviceAccountEmail = arg.slice("--service-account=".length).trim();
      continue;
    }

    if (arg.startsWith("--match-email=")) {
      args.matchEmail = arg.slice("--match-email=".length).trim().toLowerCase();
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);

      if (Number.isNaN(value) || value <= 0) {
        throw new Error("--limit must be a positive integer");
      }

      args.limit = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function listServiceAccounts() {
  const serviceAccounts = config.google_drive?.service_accounts || [];

  return serviceAccounts.map((account) => ({
    clientId: account.client_id,
    email: account.client_email,
  }));
}

function printServiceAccounts(serviceAccounts) {
  console.log("Configured Google Drive service accounts:");

  if (!serviceAccounts.length) {
    console.log("  (none)");
    return;
  }

  serviceAccounts.forEach((account, index) => {
    console.log(`  [${index + 1}] ${account.email} (${account.clientId})`);
  });
}

async function promptForServiceAccount(serviceAccounts) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await new Promise((resolve) => {
      rl.question("Select service account number: ", resolve);
    });

    const index = Number.parseInt(answer, 10);

    if (Number.isNaN(index) || index < 1 || index > serviceAccounts.length) {
      throw new Error("Invalid service account selection");
    }

    return serviceAccounts[index - 1];
  } finally {
    rl.close();
  }
}

function computeSortTimestamp(folder) {
  const created = folder.createdTime ? Date.parse(folder.createdTime) : 0;
  const sharedWithMe = folder.sharedWithMeTime ? Date.parse(folder.sharedWithMeTime) : 0;
  return Math.max(created || 0, sharedWithMe || 0);
}

function sortFoldersByTimestampDesc(folders) {
  return [...folders].sort((a, b) => {
    const aTime = computeSortTimestamp(a);
    const bTime = computeSortTimestamp(b);

    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return a.id.localeCompare(b.id);
  });
}

async function listFolders(drive, query) {
  const allFiles = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      pageSize: 100,
      pageToken: pageToken || undefined,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      q: query,
      fields:
        "nextPageToken, files(id, name, createdTime, sharedWithMeTime, driveId, parents, owners(emailAddress,displayName), permissions(id,type,role,emailAddress,domain,allowFileDiscovery,permissionDetails(inherited,inheritedFrom,permissionType,role)))",
    });

    allFiles.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  return allFiles;
}

function normalizePermission(permission) {
  const permissionDetails = permission.permissionDetails || [];
  const detail = permissionDetails[0] || null;

  const inherited = detail?.inherited !== undefined ? detail.inherited : null;

  const inheritedFrom = detail?.inheritedFrom || null;

  return {
    id: permission.id || null,
    type: permission.type || null,
    role: permission.role || null,
    emailAddress: permission.emailAddress || null,
    domain: permission.domain || null,
    allowFileDiscovery:
      permission.allowFileDiscovery !== undefined
        ? permission.allowFileDiscovery
        : null,
    inherited,
    inheritedFrom,
    permissionDetails,
    source: inherited === true ? "inherited" : "direct",
  };
}

function compactUsers(folder) {
  const ownerEmails = (folder.owners || [])
    .map((owner) => owner.emailAddress)
    .filter(Boolean);

  const permissionEmails = (folder.permissions || [])
    .map((permission) => permission.emailAddress)
    .filter(Boolean);

  const domainPermissions = (folder.permissions || [])
    .filter((permission) => permission.type === "domain" && permission.domain)
    .map((permission) => `domain:${permission.domain}`);

  return [...new Set([...ownerEmails, ...permissionEmails, ...domainPermissions])].sort();
}

function annotateFolders(folders, matchEmail) {
  return folders.map((folder) => {
    const normalizedPermissions = (folder.permissions || []).map(normalizePermission);
    const compactUserList = compactUsers({ ...folder, permissions: normalizedPermissions });
    const ownerEmails = (folder.owners || []).map((owner) => owner.emailAddress).filter(Boolean);

    const hasMatch =
      !!matchEmail &&
      [...ownerEmails, ...compactUserList].some(
        (email) => email && email.toLowerCase() === matchEmail
      );

    return {
      id: folder.id,
      name: folder.name,
      createdTime: folder.createdTime || null,
      sharedWithMeTime: folder.sharedWithMeTime || null,
      driveId: folder.driveId || null,
      parents: folder.parents || [],
      owners: folder.owners || [],
      permissions: normalizedPermissions,
      compactUserList,
      matchedEmail: hasMatch,
    };
  });
}

function printFolderSection(title, folders, matchEmail) {
  console.log("\n" + title);
  console.log("=".repeat(title.length));

  if (!folders.length) {
    console.log(`No ${title.toLowerCase()} visible for this service account.`);
    return;
  }

  folders.forEach((folder, index) => {
    const matchMarker = folder.matchedEmail ? "  <-- match" : "";
    console.log(`\n${index + 1}. ${folder.name} (${folder.id})${matchMarker}`);
    console.log(`   createdTime: ${folder.createdTime || "(none)"}`);
    console.log(`   sharedWithMeTime: ${folder.sharedWithMeTime || "(none)"}`);
    console.log(`   driveId: ${folder.driveId || "(none)"}`);
    console.log(
      `   parents: ${folder.parents.length ? folder.parents.join(", ") : "(none)"}`
    );
    console.log(
      `   owners: ${
        folder.owners.length
          ? folder.owners
              .map((owner) => owner.emailAddress || owner.displayName || "(unknown)")
              .sort()
              .join(", ")
          : "(none)"
      }`
    );
    console.log(
      `   users: ${folder.compactUserList.length ? folder.compactUserList.join(", ") : "(none)"}`
    );

    console.log("   permissions:");

    if (!folder.permissions.length) {
      console.log("     (none)");
      return;
    }

    folder.permissions
      .sort((a, b) => `${a.type}:${a.emailAddress || a.domain || ""}`.localeCompare(`${b.type}:${b.emailAddress || b.domain || ""}`))
      .forEach((permission) => {
        const principal =
          permission.emailAddress ||
          (permission.domain ? `domain:${permission.domain}` : "(no principal)");

        console.log(
          `     - [${permission.source}] type=${permission.type || "(none)"} role=${permission.role || "(none)"} principal=${principal}`
        );
        console.log(
          `       allowFileDiscovery=${
            permission.allowFileDiscovery === null
              ? "(none)"
              : permission.allowFileDiscovery
          } inherited=${
            permission.inherited === null ? "(unknown)" : permission.inherited
          } inheritedFrom=${permission.inheritedFrom || "(none)"}`
        );
      });
  });

  if (matchEmail) {
    const matchedCount = folders.filter((folder) => folder.matchedEmail).length;
    console.log(`\nMatched ${matchedCount} folder(s) for ${matchEmail}.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccounts = listServiceAccounts();

  printServiceAccounts(serviceAccounts);

  if (!serviceAccounts.length) {
    process.exit(1);
  }

  let selectedAccount;

  if (args.serviceAccountEmail) {
    selectedAccount = serviceAccounts.find(
      (account) => account.email === args.serviceAccountEmail
    );

    if (!selectedAccount) {
      throw new Error(
        `No configured service account matched email: ${args.serviceAccountEmail}`
      );
    }
  } else {
    if (!process.stdin.isTTY) {
      throw new Error(
        "Interactive selection requires a TTY; provide --service-account=<email>"
      );
    }

    selectedAccount = await promptForServiceAccount(serviceAccounts);
  }

  // Keep in sync with setup flow account resolution in
  // app/clients/google-drive/routes/setup.js and
  // app/clients/google-drive/serviceAccount/createDriveClient.js.
  const drive = await createDriveClient(selectedAccount.clientId);

  const rootFoldersRaw = await listFolders(
    drive,
    `trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`
  );

  const sharedWithMeRaw = await listFolders(
    drive,
    `trashed = false and sharedWithMe = true and mimeType = '${FOLDER_MIME_TYPE}'`
  );

  const rootFolders = annotateFolders(
    sortFoldersByTimestampDesc(
      rootFoldersRaw.filter((folder) => !folder.parents || folder.parents.length === 0)
    ),
    args.matchEmail
  );

  const sharedWithMeFolders = annotateFolders(
    sortFoldersByTimestampDesc(sharedWithMeRaw),
    args.matchEmail
  );

  const limitedRootFolders =
    args.limit === null ? rootFolders : rootFolders.slice(0, args.limit);
  const limitedSharedFolders =
    args.limit === null
      ? sharedWithMeFolders
      : sharedWithMeFolders.slice(0, args.limit);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          selectedServiceAccount: selectedAccount,
          filters: {
            matchEmail: args.matchEmail,
            limit: args.limit,
          },
          rootLevelFolders: limitedRootFolders,
          sharedWithMeFolders: limitedSharedFolders,
        },
        null,
        2
      )
    );
    return;
  }

  console.log("\nSelected service account");
  console.log("========================");
  console.log(`email: ${selectedAccount.email}`);
  console.log(`client_id: ${selectedAccount.clientId}`);
  if (args.limit !== null) {
    console.log(`limit: ${args.limit}`);
  }
  if (args.matchEmail) {
    console.log(`match-email: ${args.matchEmail}`);
  }

  printFolderSection("Root-level folders", limitedRootFolders, args.matchEmail);
  printFolderSection("Shared-with-me folders", limitedSharedFolders, args.matchEmail);
}

main().catch((error) => {
  console.error("Failed to debug service account folders:", error.message);
  process.exit(1);
});
