'use strict';

const fs = require('fs-extra'),
    Promise = require('bluebird'),
    moment = require('moment'),
    path = require('path'),
    config = require('../config'),
    common = require('../lib/common'),
    globalUtils = require('../utils'),
    apiUtils = require('./utils'),
    customRedirectsMiddleware = require('../web/middleware/custom-redirects');

let redirectsAPI,
    _private = {};

_private.readRedirectsFile = function readRedirectsFile(customRedirectsPath) {
    let redirectsPath = customRedirectsPath || path.join(config.getContentPath('data'), 'redirects.json');

    return Promise.promisify(fs.readFile)(redirectsPath, 'utf-8')
        .then(function serveContent(content) {
            try {
                content = JSON.parse(content);
            } catch (err) {
                throw new common.errors.BadRequestError({
                    message: common.i18n.t('errors.general.jsonParse', {context: err.message})
                });
            }

            return content;
        })
        .catch(function handleError(err) {
            if (err.code === 'ENOENT') {
                return Promise.resolve([]);
            }

            if (common.errors.utils.isIgnitionError(err)) {
                throw err;
            }

            throw new common.errors.NotFoundError({
                err: err
            });
        });
};

redirectsAPI = {
    download: function download(options) {
        return apiUtils.handlePermissions('redirects', 'download')(options)
            .then(function () {
                return _private.readRedirectsFile();
            });
    },
    upload: function upload(options) {
        let redirectsPath = path.join(config.getContentPath('data'), 'redirects.json'),
            backupRedirectsPath = path.join(config.getContentPath('data'), `redirects-${moment().format('YYYY-MM-DD-HH-mm-ss')}.json`);

        return apiUtils.handlePermissions('redirects', 'upload')(options)
            .then(function backupOldRedirectsFile() {
                return Promise.promisify(fs.pathExists)(redirectsPath)
                    .then(function (exists) {
                        if (!exists) {
                            return null;
                        }

                        return Promise.promisify(fs.pathExists)(backupRedirectsPath)
                            .then(function (exists) {
                                if (!exists) {
                                    return null;
                                }

                                return Promise.promisify(fs.unlink)(backupRedirectsPath);
                            })
                            .then(function () {
                                return Promise.promisify(fs.move)(redirectsPath, backupRedirectsPath);
                            });
                    })
                    .then(function overrideFile() {
                        return _private.readRedirectsFile(options.path)
                            .then(function (content) {
                                globalUtils.validateRedirects(content);
                                return Promise.promisify(fs.writeFile)(redirectsPath, JSON.stringify(content), 'utf-8');
                            })
                            .then(function () {
                                // CASE: trigger that redirects are getting re-registered
                                customRedirectsMiddleware.reload();
                            });
                    });
            });
    }
};

module.exports = redirectsAPI;
