/* sources unchanged meteor code from core mongo (1.0.8) package */
/* change mongo ddp adaptor */

// replace collection insert, update & remove methods for Mylar_meta
_.each(["insert", "update", "remove"], function (name) {
    Mongo.Collection.prototype[name] = function (/* arguments */) {
        /* unchanged meteor code */
        var self=this,args=_.toArray(arguments),callback,insertId,ret;if(args.length&&(args[args.length-1]===undefined||args[args.length-1]instanceof Function)){callback=args.pop()}

        var Mylar_meta = {'coll': self, 'transform': intercept_out};

        if (name === "insert") {
            /* unchanged meteor code */
            if(!args.length)throw new Error("insert requires an argument");args[0]=_.extend({},args[0]);if('_id'in args[0]){insertId=args[0]._id;if(!insertId||!(typeof insertId==='string'||insertId instanceof Mongo.ObjectID))throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs");}else{insertId = args[0]._id = self._makeNewID();
                // set doc in Mylar_meta
                Mylar_meta['doc'] = args[0];
            }
        } else {
            /* unchanged meteor code */
            args[0] = Mongo.Collection._rewriteSelector(args[0]);

            if (name === "update") {
                /* unchanged meteor code */
                var options=args[2]=_.clone(args[2])||{};if(options&&typeof options!=="function"&&options.upsert){if(options.insertedId){if(!(typeof options.insertedId==='string'||options.insertedId instanceof Mongo.ObjectID))throw new Error("insertedId must be string or ObjectID");}else{options.insertedId=self._makeNewID()}}
                // set doc in Mylar_meta
                Mylar_meta['doc'] = args[1]['$set'];
            }
        }

        /* unchanged meteor code */
        var chooseReturnValueFromCollectionResult=function(result){if(name==="insert"){if(!insertId&&result){insertId=result}return insertId}else{return result}};var wrappedCallback;if(callback){wrappedCallback=function(error,result){callback(error,!error&&chooseReturnValueFromCollectionResult(result))}}

        if (self._connection && self._connection !== Meteor.server) {
            /* unchanged meteor code */
            var enclosing=DDP._CurrentInvocation.get();var alreadyInSimulation=enclosing&&enclosing.isSimulation;if(Meteor.isClient&&!wrappedCallback&&!alreadyInSimulation){wrappedCallback=function(err){if(err)Meteor._debug(name+" failed: "+(err.reason||err.stack))}}if(!alreadyInSimulation&&name!=="insert"){throwIfSelectorIsNotId(args[0],name);}ret=chooseReturnValueFromCollectionResult(
                // attach Mylar_meta
                self._connection.apply(self._prefix + name, args, {returnStubValue: true}, wrappedCallback, Mylar_meta)
            );
        }
        /* unchanged meteor code */ else{args.push(wrappedCallback);try{var queryRet=self._collection[name].apply(self._collection,args);ret=chooseReturnValueFromCollectionResult(queryRet)}catch(e){if(callback){callback(e);return null}throw e;}}return ret;
    };
});