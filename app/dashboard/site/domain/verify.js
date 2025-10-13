// There are a few ways to point a domain to a blog on Blot
// You can create:
// A record pointing to 'ip'
// CNAME record pointing to 'host'
// ALIAS record pointing to 'host'
// Use Cloudflare or some other proxy service to forward requests to 'host'
// The goal of this function is to determine if the domain is correctly set up along any of these lines.

// If the domain is not set up correctly, we want to identify any issues and provide guidance on how to fix them.
// e.g. if there is an A record pointing to the wrong IP address, we want to tell the user to remove it.
// or if the domain is not pointing to the blog, we want to tell the user to update the CNAME record.
// We want to query the domain's nameservers to identify the DNS provider and then provide a link to the provider's
//  documentation on how to update the DNS records.

// This function should return true if any one of the following conditions are met:
// hostname resolves with an A record to the correct IP address (config.ip)
// hostname resolves with a CNAME record to the correct host (config.host)
// hostname returns the handle of the blog in the response body for a GET request to http://hostname/verify/domain-setup

// This function should raise an exception if:
// hostname's nameservers do not resolve
// hostname does not resolve to an IP address
// hostname resolves to a CNAME record that does not match config.host
// hostname resolves to different IP address(es) AND does not respond with the handle of the blog for a GET request to http://hostname/verify/domain-setup

// for every exception after the first, the exception should contain a property 'nameservers' that contains the nameserver addresses of the domain

const dns = require('dns').promises;
const fetch = require('node-fetch');
const { parse } = require('tldts');
const ipaddr = require('ipaddr.js');

function partitionPublicIPv4Addresses(addresses) {
    return addresses.reduce((result, address) => {
        try {
            if (ipaddr.IPv4.isValid(address)) {
                const parsed = ipaddr.IPv4.parse(address);
                if (parsed.range() === 'unicast') {
                    result.public.push(address);
                } else {
                    result.rejected.push(address);
                }
            } else {
                result.rejected.push(address);
            }
        } catch (err) {
            result.rejected.push(address);
        }

        return result;
    }, { public: [], rejected: [] });
}

async function validate({ hostname, handle, ourIP, ourHost }) {

    const parsed = parse(hostname);
    const apexDomain = parsed.domain;

    const [cnameHost, aRecordIPs, nameservers] = await Promise.all([
        dns.resolveCname(hostname).then(cnames => cnames[0] || null).catch(() => null),
        dns.resolve4(hostname).catch(() => []),
        dns.resolveNs(apexDomain).catch(() => [])
    ]);

    const { public: publicARecordIPs, rejected: rejectedARecordIPs } = partitionPublicIPv4Addresses(aRecordIPs);

    if (nameservers.length === 0) {
        const error = new Error('NO_NAMESERVERS');
        error.nameservers = nameservers;
        throw error;
    }

    if (cnameHost) {
        if (cnameHost === ourHost) {
            // CNAME matches our host, return success
            return true;
        } else {
            const error = new Error('CNAME_RECORD_EXISTS_BUT_DOES_NOT_MATCH');
            error.nameservers = nameservers;
            throw error;
        }
    }

    if (aRecordIPs.includes(ourIP)) {
        if (aRecordIPs.length === 1) {
            // A record matches our IP, return success
            return true;
        } else {
            const error = new Error('MULTIPLE_ADDRESS_BUT_ONE_IS_CORRECT');
            error.recordToRemove = aRecordIPs.filter(ip => ip !== ourIP);
            error.nameservers = nameservers;
            throw error;
        }
    }

    if (aRecordIPs.length === 0) {
        const error = new Error('NO_A_RECORD');
        error.nameservers = nameservers;
        throw error;
    }

    if (publicARecordIPs.length === 0) {
        const error = new Error('INVALID_A_RECORD');
        error.invalidIPs = rejectedARecordIPs;
        error.nameservers = nameservers;
        throw error;
    }

    // Proceed with the verification using the resolved A record IP
    let lastError;

    for (const ip of publicARecordIPs) {
        try {
            const response = await fetch(`http://${ip}/verify/domain-setup`, {
                headers: { Host: hostname }
            });

            const text = await response.text();

            // Verify the response text matches the handle
            if (text === handle || text.includes('domain is almost set up')) {
                return true;
            } else {
                const error = new Error('HANDLE_MISMATCH');
                error.expected = handle;
                error.received = text;
                error.nameservers = nameservers;
                error.ip = ip;
                lastError = error;
            }

        } catch (err) {
            const error = new Error('HANDLE_VERIFICATION_REQUEST_FAILED');
            error.message = err.message;
            error.nameservers = nameservers;
            error.ip = ip;
            lastError = error;
        }
    }

    throw lastError;
}

module.exports = validate;
