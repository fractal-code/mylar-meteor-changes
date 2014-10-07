/* change mongo ddp adaptor */

// replace collection insert, update & remove methods for Mylar_meta
_.each(["insert", "update", "remove"], function (name) {
    Mongo.Collection.prototype[name] = function (/* arguments */) {
        var self = this;
        var args = _.toArray(arguments);
        var callback;
        var insertId;
        var ret;

        // Pull off any callback (or perhaps a 'callback' variable that was passed
        // in undefined, like how 'upsert' does it).
        if (args.length &&
            (args[args.length - 1] === undefined ||
            args[args.length - 1] instanceof Function)) {
            callback = args.pop();
        }

        var Mylar_meta = {'coll': self, 'transform': intercept_out};

        if (name === "insert") {
            if (!args.length)
                throw new Error("insert requires an argument");
            // shallow-copy the document and generate an ID
            args[0] = _.extend({}, args[0]);
            if ('_id' in args[0]) {
                insertId = args[0]._id;
                if (!insertId || !(typeof insertId === 'string'
                    || insertId instanceof Mongo.ObjectID))
                    throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs");
            } else {
                var generateId = true;
                // Don't generate the id if we're the client and the 'outermost' call
                // This optimization saves us passing both the randomSeed and the id
                // Passing both is redundant.
                if (self._connection && self._connection !== Meteor.server) {
                    var enclosing = DDP._CurrentInvocation.get();
                    if (!enclosing) {
                        generateId = false;
                    }
                }
                if (generateId) {
                    insertId = args[0]._id = self._makeNewID();
                    Mylar_meta['doc'] = args[0];
                }
            }
        } else {
            args[0] = Mongo.Collection._rewriteSelector(args[0]);

            if (name === "update") {
                // Mutate args but copy the original options object. We need to add
                // insertedId to options, but don't want to mutate the caller's options
                // object. We need to mutate `args` because we pass `args` into the
                // driver below.
                var options = args[2] = _.clone(args[2]) || {};
                if (options && typeof options !== "function" && options.upsert) {
                    // set `insertedId` if absent.  `insertedId` is a Meteor extension.
                    if (options.insertedId) {
                        if (!(typeof options.insertedId === 'string'
                            || options.insertedId instanceof Mongo.ObjectID))
                            throw new Error("insertedId must be string or ObjectID");
                    } else {
                        options.insertedId = self._makeNewID();
                    }
                }
                Mylar_meta['doc'] = args[1]['$set'];
            }
        }

        // On inserts, always return the id that we generated; on all other
        // operations, just return the result from the collection.
        var chooseReturnValueFromCollectionResult = function (result) {
            if (name === "insert") {
                if (!insertId && result) {
                    insertId = result;
                }
                return insertId;
            } else {
                return result;
            }
        };

        var wrappedCallback;
        if (callback) {
            wrappedCallback = function (error, result) {
                callback(error, ! error && chooseReturnValueFromCollectionResult(result));
            };
        }

        // XXX see #MeteorServerNull
        if (self._connection && self._connection !== Meteor.server) {
            // just remote to another endpoint, propagate return value or
            // exception.

            var enclosing = DDP._CurrentInvocation.get();
            var alreadyInSimulation = enclosing && enclosing.isSimulation;

            if (Meteor.isClient && !wrappedCallback && ! alreadyInSimulation) {
                // Client can't block, so it can't report errors by exception,
                // only by callback. If they forget the callback, give them a
                // default one that logs the error, so they aren't totally
                // baffled if their writes don't work because their database is
                // down.
                // Don't give a default callback in simulation, because inside stubs we
                // want to return the results from the local collection immediately and
                // not force a callback.
                wrappedCallback = function (err) {
                    if (err)
                        Meteor._debug(name + " failed: " + (err.reason || err.stack));
                };
            }

            if (!alreadyInSimulation && name !== "insert") {
                // If we're about to actually send an RPC, we should throw an error if
                // this is a non-ID selector, because the mutation methods only allow
                // single-ID selectors. (If we don't throw here, we'll see flicker.)
                throwIfSelectorIsNotId(args[0], name);
            }

            ret = chooseReturnValueFromCollectionResult(
                self._connection.apply(self._prefix + name, args, {returnStubValue: true}, wrappedCallback, Mylar_meta)
            );

        } else {
            // it's my collection.  descend into the collection object
            // and propagate any exception.
            args.push(wrappedCallback);
            try {
                // If the user provided a callback and the collection implements this
                // operation asynchronously, then queryRet will be undefined, and the
                // result will be returned through the callback instead.
                var queryRet = self._collection[name].apply(self._collection, args);
                ret = chooseReturnValueFromCollectionResult(queryRet);
            } catch (e) {
                if (callback) {
                    callback(e);
                    return null;
                }
                throw e;
            }
        }

        // both sync and async, unless we threw an exception, return ret
        // (new document ID for insert, num affected for update/remove, object with
        // numberAffected and maybe insertedId for upsert).
        return ret;
    };
});