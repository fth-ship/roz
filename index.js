"use strict";

var _ = require("underscore"),
    assert = require("assert"),
    async = require("async"),
    methods = require("./express_methods");

var ROZ_MIDDLEWARE_KEY = "__isRozMiddleware";

var isRozMiddleware = function(fn) {
    return fn[ROZ_MIDDLEWARE_KEY] === true;
};

module.exports = function(opts) {
    opts = opts || {};
    var roz = function(/* rules... */) {
        var rules = _.toArray(arguments);
        var midware = function(req, res, next) {
            var authenticated = false;
            async.series(
                _.map(rules, function(rule) {
                    return function(cb) {
                        rule(req, function(err, result) {
                            if (err) return cb(err);
                            if (result === true) authenticated = true;
                            if (result === false) authenticated = false;
                            return cb(null);
                        });
                    };
                }),
                function(err) {
                    if (err) return next(err);
                    if (! authenticated ) {
                        return res.send(403);
                    }
                    return next();
                }
            );
        };
        midware[ROZ_MIDDLEWARE_KEY] = true;
        return midware;
    };

    roz.wrap = function (app) {
        var wrapped = {};

        _.each(methods, function(method) {
            var orig = app[method];
            wrapped[method] = function() {
                var middleware = _.rest(arguments);
                if (! _.some(middleware, isRozMiddleware)) {
                    throw new Error( "Roz: route has no roz statement: " +
                                     method + " " + _.first(arguments));
                }
                orig.apply(app, _.toArray(arguments));
            };
        });
        if (app.namespace) {
            wrapped.namespace = _.bind(app.namespace, app);
        }
        return wrapped;
    };

    var param = function(req, p) {
        if (opts.lookin) return req[opts.lookin][p];
        return req[p];
    };


    //
    // Predicates
    //
    roz.where = function(fn /*, params */) {
        var params = _.toArray(arguments).slice(1);
        return function(req, cb) {
            fn.apply(
                null,
                _.map(params, function(p) {
                    if (_.isString(p)) return param(req, p);
                    if (_.isFunction(p)) return p.call(null, req);
                    assert(false, "Expected string or function: " + p.toString());
                }).concat([
                    function(err, result) {
                        if (err) return cb(err);
                        cb(null, result);
                    }
                ])
            );
        };
    };

    //
    // Directives
    //

    roz.grant = function(reqPredicate) {
        return function(req, cb) {
            reqPredicate(req, function(err, result) {
                if (err) return err;
                return cb(null, result === true ? true : null);
            });
        };
    };

    roz.revoke = function(reqPredicate) {
        return function(req, cb) {
            reqPredicate(req, function(err, result) {
                if (err) return err;
                return cb(null, result === true ? false : null);
            });
        };
    };

    //
    // Helpers
    //

    roz.anyone = function(req, cb) {
        return cb(null, true);
    };

    return roz;

};