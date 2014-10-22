/* change ddp framework */

// hack - create connection to access Connection prototype
var connection = DDP.connect('/');

// replace apply function in Connection prototype to call meta.transform

// requires 'future', needed for apply function
if (Meteor.isServer) {
    var path = Npm.require('path');
    var Fiber = Npm.require('fibers');
    var Future = Npm.require(path.join('fibers', 'future'));
}
// replace apply function in Connection prototype
connection.constructor.prototype.apply = function (name, args, options, callback, meta) {
    /* unchanged meteor code */
    var self=this;if(!callback&&typeof options==='function'){callback=options;options={}}options=options||{};if(callback){callback=Meteor.bindEnvironment(callback,"delivering result of invoking '"+name+"'")};

    // comment this line to allow args to be mutated
    //args = EJSON.clone(args);

    /* unchanged meteor code */
    var methodId=(function(){var id;return function(){if(id===undefined)id=''+(self._nextMethodId++);return id}})();var enclosing=DDP._CurrentInvocation.get();var alreadyInSimulation=enclosing&&enclosing.isSimulation;var randomSeed=null;var randomSeedGenerator=function(){if(randomSeed===null){randomSeed=makeRpcSeed(enclosing,name)}return randomSeed};var stub=self._methodHandlers[name];if(stub){var setUserId=function(userId){self.setUserId(userId)};var invocation=new MethodInvocation({isSimulation:true,userId:self.userId(),setUserId:setUserId,randomSeed:function(){return randomSeedGenerator()}});if(!alreadyInSimulation)self._saveOriginals();try{var stubReturnValue=DDP._CurrentInvocation.withValue(invocation,function(){if(Meteor.isServer){return Meteor._noYieldsAllowed(function(){return stub.apply(invocation,EJSON.clone(args))})}else{return stub.apply(invocation,EJSON.clone(args))}})}catch(e){var exception=e}if(!alreadyInSimulation)self._retrieveAndStoreOriginals(methodId())}if(alreadyInSimulation){if(callback){callback(exception,stubReturnValue);return undefined}if(exception)throw exception;return stubReturnValue}if(exception&&!exception.expected){Meteor._debug("Exception while simulating the effect of invoking '"+name+"'",exception,exception.stack)}if(!callback){if(Meteor.isClient){callback=function(err){err&&Meteor._debug("Error invoking Method '"+name+"':",err.message)}}else{var future=new Future;callback=future.resolver()}}var message={msg:'method',method:name,params:args,id:methodId()};if(randomSeed!==null){message.randomSeed=randomSeed}

    if (meta && Meteor.isClient) {
        // mylar path - call meta.transform
        meta.transform(meta.coll, meta.doc, function () {
            /* unchanged meteor code */
            var methodInvoker=new MethodInvoker({methodId:methodId(),callback:callback,connection:self,onResultReceived:options.onResultReceived,wait:!!options.wait,message:message});if(options.wait){self._outstandingMethodBlocks.push({wait:true,methods:[methodInvoker]})}else{if(_.isEmpty(self._outstandingMethodBlocks)||_.last(self._outstandingMethodBlocks).wait)self._outstandingMethodBlocks.push({wait:false,methods:[]});_.last(self._outstandingMethodBlocks).methods.push(methodInvoker)}if(self._outstandingMethodBlocks.length===1)methodInvoker.sendMessage();
        });

        return options.returnStubValue ? stubReturnValue : undefined;
    } else {
        // regular path - unchanged meteor code
        var methodInvoker=new MethodInvoker({methodId:methodId(),callback:callback,connection:self,onResultReceived:options.onResultReceived,wait:!!options.wait,message:message});if(options.wait){self._outstandingMethodBlocks.push({wait:true,methods:[methodInvoker]})}else{if(_.isEmpty(self._outstandingMethodBlocks)||_.last(self._outstandingMethodBlocks).wait)self._outstandingMethodBlocks.push({wait:false,methods:[]});_.last(self._outstandingMethodBlocks).methods.push(methodInvoker)}if(self._outstandingMethodBlocks.length===1)methodInvoker.sendMessage();if(future){return future.wait()}return options.returnStubValue?stubReturnValue:undefined;
    }
};


// replace _process_ready in Connection prototype to call intercept.on_ready

// replace _process_ready in Connection prototype
connection.constructor.prototype._process_ready = function (msg, updates) {
    var self = this;
    _.each(msg.subs, function (subId) {
        self._runWhenAllServerDocsAreFlushed(function () {
            /* unchanged meteor code */
            var subRecord=self._subscriptions[subId],ready_func;if(!subRecord)return;if(subRecord.ready)return;

            // call intercept.on_ready(collection, ready_func) instead of ready_func
            ready_func = function() {
                subRecord.readyCallback && subRecord.readyCallback();
                subRecord.ready = true;
                subRecord.readyDeps && subRecord.readyDeps.changed();
            };
            Mongo.Collection.intercept.on_ready(subRecord.name, ready_func);
        });
    });
};

// replace registerStore in Connection prototype to call intercept.init on each
// collection and replace store 'update' method to add calls to intercept_* by modifying
// it from within the inputted wrappedStore object

// replace registerStore in Connection prototype
connection.constructor.prototype.registerStore = function (name, wrappedStore) {
    /* unchanged meteor code */
    var self=this;if(name in self._stores)return false;

    // replace store 'update' method' to add calls to intercept_*
    wrappedStore['update'] = function (msg) {
        // correct function context by finding collection object in MylarCol dictionary
        var self = MylarCol[name];

        /* unchanged meteor code */
        var mongoId=LocalCollection._idParse(msg.id),doc=self._collection.findOne(mongoId);
        if (msg.msg === 'replace') {var replace=msg.replace;if(!replace){if(doc)self._collection.remove(mongoId);} else {

        // call intercept_in
        intercept_in(self, mongoId, replace, function() {
            if (!doc) {
                self._collection.insert(replace);
            } else {
                self._collection.update(mongoId, replace);
            }
        });

        /* unchanged meteor code */ }} else if (msg.msg === 'added') {

        // call intercept_in
        intercept_in(self, mongoId, msg.fields, function() {
            if (doc) {
                throw new Error("Expected not to find a document already present for an add");
            }
            self._collection.insert(_.extend({_id: mongoId}, msg.fields));
        });

        /* unchanged meteor code */ }else if(msg.msg==='removed'){if(!doc)throw new Error("Expected to find a document already present for removed");self._collection.remove(mongoId)}else if(msg.msg==='changed'){if(!doc)throw new Error("Expected to find a document to change");if(!_.isEmpty(msg.fields)){var modifier={};_.each(msg.fields,function(value,key){if(value===undefined){if(!modifier.$unset)modifier.$unset={};modifier.$unset[key]=1}else{if(!modifier.$set)modifier.$set={};modifier.$set[key]=value}});

        // call intercept_in
        intercept_in(self, mongoId, modifier.$set, function() {
            self._collection.update(mongoId, modifier);
        });

        /* unchanged meteor code */ }}else{throw new Error("I don't know how to deal with this message");}
    };

    /* unchanged meteor code */
    var store={};_.each(['update','beginUpdate','endUpdate','saveOriginals','retrieveOriginals'],function(method){store[method]=function(){return(wrappedStore[method]?wrappedStore[method].apply(wrappedStore,arguments):undefined)}});self._stores[name]=store;var queued=self._updatesForUnknownStores[name];if(queued){store.beginUpdate(queued.length,false);_.each(queued,function(msg){store.update(msg)});store.endUpdate();delete self._updatesForUnknownStores[name]}return true;
};

// disconnect from dummy_url
connection.disconnect();
