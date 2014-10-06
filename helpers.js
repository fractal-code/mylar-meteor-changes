//package helpers

//'global' intercept_* functions
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
