/* 'global' package helpers */

// intercept_* functions
intercept_out = function (collection, container, callback) {
    if (Meteor.isClient && Mongo.Collection.intercept && Mongo.Collection.intercept.out) {
        Mongo.Collection.intercept.out(collection, container, callback);
    } else {
        callback && callback();
    }
};
intercept_in = function (collection, id, container, callback) {
    if (Meteor.isClient && Mongo.Collection.intercept && Mongo.Collection.intercept.incoming) {
        Mongo.Collection.intercept.incoming(collection, id, container, callback);
    } else {
        callback && callback();
    }
};

// function which asks for a collection name and returns the matching
// collection object from within the global object
getCollection = function (name) {
    var global = Function('return this')(), key;

    for (key in global) {
        //check if it is a collection
        if (global[key] instanceof Mongo.Collection) {
            //check if it matches the inputted name
            if (global[key]._name === name) {
                return (global[key]);
            }
        }
    }

    //if none of the collections match
    return undefined;
};