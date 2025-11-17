const database = require('clients/google-drive/database');
const config = require('config');
const email = require('helper/email');
const clfdate = require('helper/clfdate');

const MIN_FREE_SPACE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

const prefix = () => clfdate() + " Google Drive:";

module.exports = async function () {
    let serviceAccounts = await database.serviceAccount.all();

    if (!serviceAccounts || serviceAccounts.length === 0) {
        throw new Error('No service accounts found in the database.');
    }

    // filter the service accounts such that only those whose credentials are valid are considered
    // this may occur if we remove a service account from the config but it still exists in the database
    serviceAccounts = serviceAccounts.filter((account) => {
        return config.google_drive.service_accounts.some((credentials) => {
            return credentials.client_id === account.client_id;
        });
    });

    if (serviceAccounts.length === 0) {
        throw new Error('No service accounts with valid credentials found in the database.');
    }

    // log all the accounts and their free space
    serviceAccounts.forEach((account) => {
        const freeSpace = account.storageQuota.limit - account.storageQuota.usage;
        console.log(prefix(), 'service account:', account.client_id, 'has', freeSpace, 'bytes of free space.');
    });
    
    // Sort service accounts by the available space in descending order
    serviceAccounts.sort((a, b) => {
        const freeSpaceA = parseInt(a.storageQuota.limit) - parseInt(a.storageQuota.usage);
        const freeSpaceB = parseInt(b.storageQuota.limit) - parseInt(b.storageQuota.usage);
        return freeSpaceB - freeSpaceA; // Descending order
    });

    // Select the service account with the most available space
    const selectedClientId = serviceAccounts[0].client_id;
    const selectedFreeSpace = serviceAccounts[0].storageQuota.limit - serviceAccounts[0].storageQuota.usage;

    console.log(prefix(), 'selected service account:', selectedClientId, 'with', selectedFreeSpace, 'bytes of free space.');

    if (selectedFreeSpace < MIN_FREE_SPACE_BYTES) {
        console.log(prefix(), 'selected service account is low on free space.');
        email.GOOGLE_DRIVE_SERVICE_ACCOUNT_LOW()
    }

    return selectedClientId;
}