Package.describe({
    summary: 'Mylar, meteor changes',
    version: '0.1.0',
    name: 'mylar:meteor-changes',
    git: 'https://github.com/gliesesoftware/mylar-meteor-changes.git'
});

Package.onUse(function (api) {
    api.versionsFrom('METEOR@0.9.1');

    api.use(['ddp', 'random', 'underscore', 'mongo', 'minimongo'], ['client', 'server']);

    api.addFiles(['helpers.js', 'mongo-ddp-adaptor.js', 'ddp-framework.js'], ['client', 'server']);
    api.export('MylarCol');
});
