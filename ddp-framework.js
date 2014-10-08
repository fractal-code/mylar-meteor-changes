/* change ddp framework */

// hack - create connection to dummy url to access Connection prototype
var connection = DDP.connect('dummy_url');

// replace apply function in Connection prototype to call meta.transform

// requires 'future', needed for apply function
if (Meteor.isServer) {
    var path = Npm.require('path');
    var Fiber = Npm.require('fibers');
    var Future = Npm.require(path.join('fibers', 'future'));
}
// replace apply function in Connection prototype
connection.constructor.prototype.apply = function (name, args, options, callback, meta) {
    var self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    if (callback) {
        // XXX would it be better form to do the binding in stream.on,
        // or caller, instead of here?
        // XXX improve error message (and how we report it)
        callback = Meteor.bindEnvironment(
            callback,
            "delivering result of invoking '" + name + "'"
        );
    }

    // Lazily allocate method ID once we know that it'll be needed.
    var methodId = (function () {
        var id;
        return function () {
            if (id === undefined)
                id = '' + (self._nextMethodId++);
            return id;
        };
    })();

    var enclosing = DDP._CurrentInvocation.get();
    var alreadyInSimulation = enclosing && enclosing.isSimulation;

    // Lazily generate a randomSeed, only if it is requested by the stub.
    // The random streams only have utility if they're used on both the client
    // and the server; if the client doesn't generate any 'random' values
    // then we don't expect the server to generate any either.
    // Less commonly, the server may perform different actions from the client,
    // and may in fact generate values where the client did not, but we don't
    // have any client-side values to match, so even here we may as well just
    // use a random seed on the server.  In that case, we don't pass the
    // randomSeed to save bandwidth, and we don't even generate it to save a
    // bit of CPU and to avoid consuming entropy.
    var randomSeed = null;
    var randomSeedGenerator = function () {
        if (randomSeed === null) {
            randomSeed = makeRpcSeed(enclosing, name);
        }
        return randomSeed;
    };

    // Run the stub, if we have one. The stub is supposed to make some
    // temporary writes to the database to give the user a smooth experience
    // until the actual result of executing the method comes back from the
    // server (whereupon the temporary writes to the database will be reversed
    // during the beginUpdate/endUpdate process.)
    //
    // Normally, we ignore the return value of the stub (even if it is an
    // exception), in favor of the real return value from the server. The
    // exception is if the *caller* is a stub. In that case, we're not going
    // to do a RPC, so we use the return value of the stub as our return
    // value.

    var stub = self._methodHandlers[name];
    if (stub) {
        var setUserId = function(userId) {
            self.setUserId(userId);
        };

        var invocation = new MethodInvocation({
            isSimulation: true,
            userId: self.userId(),
            setUserId: setUserId,
            randomSeed: function () { return randomSeedGenerator(); }
        });

        if (!alreadyInSimulation)
            self._saveOriginals();

        try {
            // Note that unlike in the corresponding server code, we never audit
            // that stubs check() their arguments.
            var stubReturnValue = DDP._CurrentInvocation.withValue(invocation, function () {
                if (Meteor.isServer) {
                    // Because saveOriginals and retrieveOriginals aren't reentrant,
                    // don't allow stubs to yield.
                    return Meteor._noYieldsAllowed(function () {
                        // re-clone, so that the stub can't affect our caller's values
                        return stub.apply(invocation, EJSON.clone(args));
                    });
                } else {
                    return stub.apply(invocation, EJSON.clone(args));
                }
            });
        }
        catch (e) {
            var exception = e;
        }

        if (!alreadyInSimulation)
            self._retrieveAndStoreOriginals(methodId());
    }

    // If we're in a simulation, stop and return the result we have,
    // rather than going on to do an RPC. If there was no stub,
    // we'll end up returning undefined.
    if (alreadyInSimulation) {
        if (callback) {
            callback(exception, stubReturnValue);
            return undefined;
        }
        if (exception)
            throw exception;
        return stubReturnValue;
    }

    // If an exception occurred in a stub, and we're ignoring it
    // because we're doing an RPC and want to use what the server
    // returns instead, log it so the developer knows.
    //
    // Tests can set the 'expected' flag on an exception so it won't
    // go to log.
    if (exception && !exception.expected) {
        Meteor._debug("Exception while simulating the effect of invoking '" +
        name + "'", exception, exception.stack);
    }


    // At this point we're definitely doing an RPC, and we're going to
    // return the value of the RPC to the caller.

    // If the caller didn't give a callback, decide what to do.
    if (!callback) {
        if (Meteor.isClient) {
            // On the client, we don't have fibers, so we can't block. The
            // only thing we can do is to return undefined and discard the
            // result of the RPC. If an error occurred then print the error
            // to the console.
            callback = function (err) {
                err && Meteor._debug("Error invoking Method '" + name + "':",
                    err.message);
            };
        } else {
            // On the server, make the function synchronous. Throw on
            // errors, return on success.
            var future = new Future;
            callback = future.resolver();
        }
    }

    // Send the RPC. Note that on the client, it is important that the
    // stub have finished before we send the RPC, so that we know we have
    // a complete list of which local documents the stub wrote.

    var message = {
        msg: 'method',
        method: name,
        params: args,
        id: methodId()
    };

    // Send the randomSeed only if we used it
    if (randomSeed !== null) {
        message.randomSeed = randomSeed;
    }

    if (meta && Meteor.isClient) {
        // mylar path - call meta.transform
        meta.transform(meta.coll, meta.doc, function () {
            var methodInvoker = new MethodInvoker({
                methodId: methodId(),
                callback: callback,
                connection: self,
                onResultReceived: options.onResultReceived,
                wait: !!options.wait,
                message: message
            });

            if (options.wait) {
                // It's a wait method! Wait methods go in their own block.
                self._outstandingMethodBlocks.push(
                    {wait: true, methods: [methodInvoker]});
            } else {
                // Not a wait method. Start a new block if the previous block was a wait
                // block, and add it to the last block of methods.
                if (_.isEmpty(self._outstandingMethodBlocks) ||
                    _.last(self._outstandingMethodBlocks).wait)
                    self._outstandingMethodBlocks.push({wait: false, methods: []});
                _.last(self._outstandingMethodBlocks).methods.push(methodInvoker);
            }

            // If we added it to the first block, send it out now.
            if (self._outstandingMethodBlocks.length === 1)
                methodInvoker.sendMessage();
        });

        return options.returnStubValue ? stubReturnValue : undefined;
    } else {
        // regular path
        var methodInvoker = new MethodInvoker({
            methodId: methodId(),
            callback: callback,
            connection: self,
            onResultReceived: options.onResultReceived,
            wait: !!options.wait,
            message: message
        });

        if (options.wait) {
            // It's a wait method! Wait methods go in their own block.
            self._outstandingMethodBlocks.push(
                {wait: true, methods: [methodInvoker]});
        } else {
            // Not a wait method. Start a new block if the previous block was a wait
            // block, and add it to the last block of methods.
            if (_.isEmpty(self._outstandingMethodBlocks) ||
                _.last(self._outstandingMethodBlocks).wait)
                self._outstandingMethodBlocks.push({wait: false, methods: []});
            _.last(self._outstandingMethodBlocks).methods.push(methodInvoker);
        }

        // If we added it to the first block, send it out now.
        if (self._outstandingMethodBlocks.length === 1)
            methodInvoker.sendMessage();

        // If we're using the default callback on the server,
        // block waiting for the result.
        if (future) {
            return future.wait();
        }

        return options.returnStubValue ? stubReturnValue : undefined;
    }
};


// replace _process_ready in Connection prototype to call intercept.on_ready

// replace _process_ready in Connection prototype
connection.constructor.prototype._process_ready = function (msg, updates) {
    var self = this;
    // Process "sub ready" messages. "sub ready" messages don't take effect
    // until all current server documents have been flushed to the local
    // database. We can use a write fence to implement this.
    _.each(msg.subs, function (subId) {
        self._runWhenAllServerDocsAreFlushed(function () {
            var subRecord = self._subscriptions[subId], ready_func;
            // Did we already unsubscribe?
            if (!subRecord)
                return;
            // Did we already receive a ready message? (Oops!)
            if (subRecord.ready)
                return;
            // call intercept.on_ready(collection, ready_func) instead of ready_func
            ready_func = function() {
                subRecord.readyCallback && subRecord.readyCallback();
                subRecord.ready = true;
                subRecord.readyDeps && subRecord.readyDeps.changed();
            };

            if (Mongo.Collection.intercept && Mongo.Collection.intercept.on_ready) {
                Mongo.Collection.intercept.on_ready(subRecord.name, ready_func);
            } else {
                ready_func();
            }
        });
    });
};

// replace registerStore in Connection prototype to call intercept.init on each
// collection and replace store 'update' method to add calls to intercept_* by modifying
// it from within the inputted wrappedStore object

// replace registerStore in Connection prototype
connection.constructor.prototype.registerStore = function (name, wrappedStore) {
    var self = this;

    if (name in self._stores)
        return false;

    // replace store 'update' method' to add calls to intercept_*
    wrappedStore['update'] = function (msg) {
        var self = MylarCol[name], /* correct function context */
            mongoId = LocalCollection._idParse(msg.id),
            doc = self._collection.findOne(mongoId);

        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (msg.msg === 'replace') {
            var replace = msg.replace;
            if (!replace) {
                if (doc)
                    self._collection.remove(mongoId);
            } else {
                intercept_in(self, mongoId, replace, function() {
                    if (!doc) {
                        self._collection.insert(replace);
                    } else {
                        // XXX check that replace has no $ ops
                        self._collection.update(mongoId, replace);
                    }
                });
            }
        } else if (msg.msg === 'added') {
            intercept_in(self, mongoId, msg.fields, function() {
                if (doc) {
                    throw new Error("Expected not to find a document already present for an add");
                }
                self._collection.insert(_.extend({_id: mongoId}, msg.fields));
            });
        } else if (msg.msg === 'removed') {
            if (!doc)
                throw new Error("Expected to find a document already present for removed");
            self._collection.remove(mongoId);
        } else if (msg.msg === 'changed') {
            if (!doc)
                throw new Error("Expected to find a document to change");
            if (!_.isEmpty(msg.fields)) {
                var modifier = {};
                _.each(msg.fields, function (value, key) {
                    if (value === undefined) {
                        if (!modifier.$unset)
                            modifier.$unset = {};
                        modifier.$unset[key] = 1;
                    } else {
                        if (!modifier.$set)
                            modifier.$set = {};
                        modifier.$set[key] = value;
                    }
                });
                intercept_in(self, mongoId, modifier.$set, function() {
                    self._collection.update(mongoId, modifier);
                });
            }
        } else {
            throw new Error("I don't know how to deal with this message");
        }
    };

    // Wrap the input object in an object which makes any store method not
    // implemented by 'store' into a no-op.
    var store = {};
    _.each(['update', 'beginUpdate', 'endUpdate', 'saveOriginals',
        'retrieveOriginals'], function (method) {
        store[method] = function () {
            return (wrappedStore[method]
                ? wrappedStore[method].apply(wrappedStore, arguments)
                : undefined);
        };
    });

    self._stores[name] = store;

    var queued = self._updatesForUnknownStores[name];
    if (queued) {
        store.beginUpdate(queued.length, false);
        _.each(queued, function (msg) {
            store.update(msg);
        });
        store.endUpdate();
        delete self._updatesForUnknownStores[name];
    }

    return true;
};

// disconnect from dummy_url
connection.disconnect();
