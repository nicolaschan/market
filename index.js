var getLogger = function(name, level) {
	var fs = require('fs');
	var directory = 'logs';
	if (!fs.existsSync(directory)) {
		fs.mkdir(directory);
	}

	var log4js = require('log4js');
	log4js.configure({
		appenders: [{
			type: 'console'
		}, {
			type: 'file',
			filename: 'logs/main.log',
			category: name
		}]
	});

	var logger = log4js.getLogger(name);
	logger.setLevel(level);

	return logger;
};

var logger = getLogger('controller', 'ALL');

var cluster = require('cluster');

if (cluster.isMaster) {
	cluster.fork();

	cluster.on('disconnect', function(worker) {
		logger.warn('Market stopped, restarting in 1 second...');
		setTimeout(function() {
			cluster.fork();
		}, 1000);
	});
} else {
	var domain = require('domain');
	var d = domain.create();
	d.on('error', function(err) {
		logger.fatal(err);
		cluster.worker.disconnect();
	});
	d.run(function() {
		logger.trace('Instantiating market app...');

		var config = require('./config.json');

		var market = require('./market');
		var app = market.createApp(config);

		logger.trace('Starting market app...');
		app.start();
	});
}