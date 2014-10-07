//'global' package helpers

//intercept_* functions
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

//function which takes in a collection name and returns the matching collection object
//used by the replaced 'store' update method to access it's correct function context
getCollection = function (name) {
    var globals = Function('return this')(), key;

    for (key in globals) {
        //check if it is a collection
        if (globals[key] instanceof Mongo.Collection) {
            //check if it matches the inputted name
            if (globals[key]._name === name) {
                return (globals[key]);
            }
        }
    }

    //if none of the collections match
    return undefined;
};