const express = require('express');
const config = require('config');
const { parse } = require('tldts');
const Blog = require('models/blog');
const moment = require('moment');
const verify = require('./verify');
const identifyNameServers = require('./identifyNameServers');
const fetch = require('node-fetch');
const Domain = express.Router();

const ip = config.ip;
const ipv6 = config.ipv6;
const host = config.host;

Domain.use((req, res, next) => {
    res.locals.breadcrumbs.add('Domain', '/domain');
    
    const blogID = req.blog.id;
    const error = req.session[`${blogID}:domainError`];
    const customDomain = req.blog.pretty.domain || req.blog.domain || (error && error.hostname) || '';
    const { subdomain, domain } = parse(customDomain);
    
    res.locals.domainSuccess = !!req.blog.domain && error === undefined;
    res.locals.subdomain = subdomain;
    res.locals.apexDomain = domain;
    res.locals.customDomain = customDomain;
    res.locals.host = host;
    res.locals.ip = ip;
    res.locals.ipv6 = ipv6;
        
    if (error) {
        res.locals.lastChecked = moment(error.lastChecked).fromNow();
        res.locals.nameservers = error.nameservers;
        res.locals.recordToRemove = error.recordToRemove;
        res.locals.revalidation = error.revalidation;

        const dnsProvider = identifyNameServers(error.nameservers);

        if (dnsProvider) {
            dnsProvider.is = {};
            dnsProvider.is[dnsProvider.id] = true;
            res.locals.dnsProvider = dnsProvider;
        }
        
        console.log(res.locals.dnsProvider);

        res.locals.code = {};
        res.locals.code[error.code] = true;
    }

    next();
});

Domain.route('/')
    .get((req, res) => {
        res.render('dashboard/site/domain');
    })
    .post(async (req, res) => {
        const blogID = req.blog.id;
        const domainInput = req.body.domain;
        const { hostname } = parse(domainInput);

        if (req.body.handle) {
            try{
                await updateHandle(blogID, req.body.handle);
                return res.message('/sites/' + req.body.handle  + '/domain', 'Updated subdomain on Blot');
            } catch (e) {
                return res.message(res.locals.base + '/domain/subdomain', e);
            }
        }

        if (!hostname) {
            await updateDomain(blogID, '');
            // Clear the domain error from the session
            delete req.session[`${blogID}:domainError`];
            req.session.save();
            return res.message(res.locals.base + '/domain', 'Domain removed');
        }

        // Remove the existing domain if it is set and differs from the new one
        if (req.blog.domain && req.blog.domain !== hostname) {
            await updateDomain(blogID, '');
        }

        try {
            const isValid = await verify({ hostname, handle: req.blog.handle, ourIP: ip, ourIPv6: ipv6, ourHost: host });

            if (isValid) {
                // Clear the blog session
                delete req.session[`${blogID}:domainError`];
                req.session.save();
                await updateDomain(blogID, hostname);
                res.message(res.locals.base + '/domain', 'Domain added');
                triggerAutoSSL(hostname);
            } else {
                throw new Error('Domain verification failed.');
            }
        } catch (error) {
            console.log(error);

            // if this is a re-attempt or not
            const revalidation = req.session[`${blogID}:domainError`] && req.session[`${blogID}:domainError`].hostname === hostname;

            // Store error details in the session
            req.session[`${blogID}:domainError`] = {
                hostname,
                code: error.message,
                nameservers: error.nameservers || [],
                recordToRemove: error.recordToRemove || [],
                lastChecked: Date.now(),
                revalidation
            };

            req.session.save();
            res.redirect(res.locals.base + '/domain/custom');
        }
    });

Domain.route('/custom')
    .get((req, res) => {
        res.locals.edit = { custom: true };
        res.render('dashboard/site/domain');
    });

Domain.route('/subdomain')
    .get((req, res) => {
        res.locals.edit = { subdomain: true };
        res.render('dashboard/site/domain');
    });

const updateDomain = (blogID, domain) => {
    return new Promise((resolve, reject) => {
        Blog.set(blogID, { domain, forceSSL: false, redirectSubdomain: !!domain }, (errors, changes) => {
            if (errors) return reject(errors);
            resolve(changes);
        });
    });
};

const updateHandle = (blogID, handle) => {
    return new Promise((resolve, reject) => {
        Blog.set(blogID, { handle }, (errors, changes) => {
            if (errors && errors.handle) return reject(errors.handle);
            if (errors) return reject(errors);
            resolve(changes);
        });
    });
};

function triggerAutoSSL(hostname) {
  if (!hostname) return;

  fetch(`https://${hostname}`, { method: "HEAD", redirect: "manual" }).catch(
    (error) => {
      console.error(
        "Failed to trigger AutoSSL for %s: %s",
        hostname,
        error && error.message ? error.message : error
      );
    }
  );
}

module.exports = Domain;