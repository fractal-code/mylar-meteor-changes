/* change ddp framework */

// replace _process_ready in Connection prototype to call intercept.on_ready

// hack - create connection to dummy url to access Connection prototype
var connection = DDP.connect('dummy_url');

// replace _process_ready in Connection prototype
connection.__proto__._process_ready = function (msg, updates) {
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
connection.__proto__.registerStore = function (name, wrappedStore) {
    var self = this;

    if (name in self._stores)
        return false;

    // replace store 'update' method' to add calls to intercept_*
    wrappedStore['update'] = function (msg) {
        var self = MylarCol[msg.collection], /* correct function context */
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
