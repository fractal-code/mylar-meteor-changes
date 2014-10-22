/* 'global' package helpers */

// intercept_* functions
intercept_out = function (collection, container, callback) {
    if (Meteor.isClient) {
        Mongo.Collection.intercept.out(collection, container, callback);
    } else {
        callback && callback();
    }
};
intercept_in = function (collection, id, container, callback) {
    if (Meteor.isClient) {
        Mongo.Collection.intercept.incoming(collection, id, container, callback);
    } else {
        callback && callback();
    }
};

// dictionary used to access collection objects by name
MylarCol = {};

// RandomSeed constructor, needed for makeRpcSeed function
RandomStream = function (options) {
    /* unchanged meteor code */
    var self=this;this.seed=[].concat(options.seed||randomToken());this.sequences={};
};
randomToken = function() {
    /* unchanged meteor code */
    return Random.hexString(20);
};
RandomStream.get = function (scope, name) {
    /* unchanged meteor code */
    if(!name){name="default"}if(!scope){return Random}var randomStream=scope.randomStream;if(!randomStream){scope.randomStream=randomStream=new RandomStream({seed:scope.randomSeed})}return randomStream._sequence(name);
};
_.extend(RandomStream.prototype, {
    /* unchanged meteor code */
    _sequence:function(name){var self=this;var sequence=self.sequences[name]||null;if(sequence===null){var sequenceSeed=self.seed.concat(name);for(var i=0;i<sequenceSeed.length;i++){if(_.isFunction(sequenceSeed[i])){sequenceSeed[i]=sequenceSeed[i]()}}self.sequences[name]=sequence=Random.createWithSeeds.apply(null,sequenceSeed)}return sequence}
});

// makeRpcSeed function, needed for replaced apply function in Connection prototype
makeRpcSeed = function (enclosing, methodName) {
    /* unchanged meteor code */
    var stream=RandomStream.get(enclosing,'/rpc/'+methodName);return stream.hexString(20);
};

// MethodInvocation constructor, needed for replaced apply function in Connection prototype
MethodInvocation = function (options) {
    /* unchanged meteor code */
    var self=this;this.isSimulation=options.isSimulation;this._unblock=options.unblock||function(){};this._calledUnblock=false;this.userId=options.userId;this._setUserId=options.setUserId||function(){};this.connection=options.connection;this.randomSeed=options.randomSeed;this.randomStream=null;
};
_.extend(MethodInvocation.prototype, {
    /* unchanged meteor code */
    unblock:function(){var self=this;self._calledUnblock=true;self._unblock()},setUserId:function(userId){var self=this;if(self._calledUnblock)throw new Error("Can't call setUserId in a method after calling unblock");self.userId=userId;self._setUserId(userId)}
});

// MethodInvoker constructor, needed for replaced apply function in Connection prototype
MethodInvoker = function (options) {
    /* unchanged meteor code */
    var self=this;self.methodId=options.methodId;self.sentMessage=false;self._callback=options.callback;self._connection=options.connection;self._message=options.message;self._onResultReceived=options.onResultReceived||function(){};self._wait=options.wait;self._methodResult=null;self._dataVisible=false;self._connection._methodInvokers[self.methodId]=self;
};
_.extend(MethodInvoker.prototype, {
    /* unchanged meteor code */
    sendMessage:function(){var self=this;if(self.gotResult())throw new Error("sendingMethod is called on method with result");self._dataVisible=false;self.sentMessage=true;if(self._wait)self._connection._methodsBlockingQuiescence[self.methodId]=true;self._connection._send(self._message)},_maybeInvokeCallback:function(){var self=this;if(self._methodResult&&self._dataVisible){self._callback(self._methodResult[0],self._methodResult[1]);delete self._connection._methodInvokers[self.methodId];self._connection._outstandingMethodFinished()}},receiveResult:function(err,result){var self=this;if(self.gotResult())throw new Error("Methods should only receive results once");self._methodResult=[err,result];self._onResultReceived(err,result);self._maybeInvokeCallback()},dataVisible:function(){var self=this;self._dataVisible=true;self._maybeInvokeCallback()},gotResult:function(){var self=this;return!!self._methodResult}
});

// throwIfSelectorIsNotId function, needed for replaced collection methods
throwIfSelectorIsNotId = function (selector, methodName) {
    /* unchanged meteor code */
    if(!LocalCollection._selectorIsIdPerhapsAsObject(selector)){throw new Meteor.Error(403,"Not permitted. Untrusted code may only "+methodName+" documents by ID.");}
};