//replace _process_ready in Connection prototype to call intercept.on_ready

//hack - create connection to dummy url to access Connection prototype
var connection = DDP.connect('dummy_url');

//replace _process_ready in Connection prototype
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
            //call intercept.on_ready(collection, ready_func) instead of ready_func
            ready_func = function() {
                subRecord.readyCallback && subRecord.readyCallback();
                subRecord.ready = true;
                subRecord.readyDeps && subRecord.readyDeps.changed();
            };

            if (Meteor.Collection.intercept && Meteor.Collection.intercept.on_ready) {
                Meteor.Collection.intercept.on_ready(subRecord.name, ready_func);
            } else {
                ready_func();
            }
        });
    });
};

//disconnect from dummy_url
connection.disconnect();
