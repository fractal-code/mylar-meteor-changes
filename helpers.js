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