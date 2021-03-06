// Generated by CoffeeScript 1.10.0
(function() {
  var async, cluster, config, d, domain, getLogger, logger;

  async = require('async');

  config = require('./config/manager-config.json');

  getLogger = function(name, level) {
    var log4js, logger, path;
    log4js = require('log4js');
    path = require('path');
    log4js.configure({
      appenders: [
        {
          type: 'console'
        }, {
          type: 'file',
          filename: 'logs' + path.sep + config.logger.filename,
          category: name
        }
      ]
    });
    logger = log4js.getLogger(name);
    logger.setLevel(level);
    return logger;
  };

  logger = getLogger('service-manager', config.logger.level);

  cluster = require('cluster');

  if (cluster.isMaster) {
    cluster.fork();
    cluster.on('exit', function(worker, code, signal) {
      return setTimeout((function() {
        return cluster.fork();
      }), 1000);
    });
  } else {
    domain = require('domain');
    d = domain.create();
    d.on('error', function(err) {
      logger = getLogger('service-manager', config.logger.level);
      logger.fatal(err);
      return cluster.worker.disconnect();
    });
    d.run(function() {
      var done, server, setOnDeath, setStdin, startServer, startServices, startTime, stopServer;
      startTime = Date.now();
      server = null;
      setOnDeath = function(callback) {
        var on_death;
        on_death = require('death');
        on_death(function(signal, err) {
          return logger.info('Exited on ' + new Date(Date.now()));
        });
        return callback();
      };
      startServer = function(callback) {
        logger.info('Starting server...');
        if (config['run server']) {
          server = require('./modules/market-server');
          return server.start(callback);
        } else {
          return callback();
        }
      };
      stopServer = function(callback) {
        logger.info('Stopping server...');
        return server.stop(function(err) {
          delete require.cache[require.resolve('./modules/market-server')];
          server = null;
          logger.info('Server stopped');
          return callback();
        });
      };
      startServices = function(callback) {
        logger.info('Starting services...');
        return async.series([startServer], callback);
      };
      setStdin = function(callback) {
        var processCommand;
        processCommand = function(chunk) {
          var args, command, pieces;
          if (chunk == null) {
            return null;
          }
          chunk = chunk.substring(0, chunk.length - 1);
          pieces = chunk.split(' ');
          command = pieces[0];
          args = pieces.slice(1);
          switch (command) {
            case 'restart':
            case 'r':
              logger.info('Restarting server...');
              return stopServer(function(err) {
                if (err == null) {
                  return startServer();
                } else {
                  return logger.error(err);
                }
              });
            case 'stop':
              return stopServer(function(err) {
                if (err != null) {
                  return logger.error(err);
                }
              });
            case 'start':
              return startServer();
            case 'status':
              if (server != null) {
                return logger.info('Server is running');
              } else {
                return logger.info('Server is not running');
              }
              break;
            case 'help':
              logger.info('Commands:');
              logger.info(' stop - stops server');
              logger.info(' start - starts server');
              logger.info(' restart - restarts server');
              logger.info(' status - outputs server status');
              return logger.info(' help - displays this text');
            default:
              return logger.info('Unknown command: ' + command);
          }
        };
        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', function() {
          return processCommand(process.stdin.read());
        });
        return callback();
      };
      done = function(err) {
        var getElapsedTime;
        if (err == null) {
          getElapsedTime = function() {
            return (Date.now() - startTime) / 1000;
          };
          return logger.info('Service startup done! (' + getElapsedTime() + ' sec.)');
        } else {
          logger.error(err);
          return cluster.worker.disconnect();
        }
      };
      return async.series([setOnDeath, setStdin, startServices], done);
    });
  }

}).call(this);
